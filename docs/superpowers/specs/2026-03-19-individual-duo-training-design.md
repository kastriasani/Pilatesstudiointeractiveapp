# Individual & Duo Training — Design Spec

## Overview

Extend the WellNest Pilates booking system to support Individual (1-on-1) and Duo (2-person) private training sessions alongside existing group classes. The core change: every time slot gets an admin-defined **class type** that determines capacity and who can book it.

## Business Rules

### Class Types

| Type | Label | Capacity | Who can book |
|------|-------|----------|-------------|
| `group` | Multipack | 4 spots | Single & Multipack package users |
| `individual` | Individual | 1 spot | Individual package users |
| `duo` | DUO | 1 spot (for the pair) | Duo package users |

- One class per time slot. No parallel classes.
- Admin defines the class type when creating a slot.
- Capacity follows automatically from the type.
- Single-class (one-off) bookings can only book `group` slots.

### Package Types (existing, confirmed)

| Package Type | Service Type | Sessions | Price (DEN) |
|-------------|-------------|----------|-------------|
| `individual1` | `individual` | 1 | 1,200 |
| `individual8` | `individual` | 8 | 7,000 |
| `individual12` | `individual` | 12 | 9,500 |
| `duo1` | `duo` | 1 | 2,100 |
| `duo8` | `duo` | 8 | 13,400 |
| `duo12` | `duo` | 12 | 18,400 |

> **NOTE:** Backend `PACKAGE_PRICING` in index.ts has outdated prices and must be updated to match these values during implementation.

### Other Rules

- Duo price is per pair (one person pays for both).
- Partner info is **not** tracked in the system.
- Package validity: 35 days (same as group).
- Cancellation rules: same as group (24h+, 2-min grace period, no-show = session lost).
- A user can have multiple active packages of different types simultaneously.

## Architecture Changes

### 1. Database

#### Extend existing `time_slots` table

The system already has a `time_slots` table used by all admin slot CRUD endpoints and availability queries. Add a `class_type` column to it:

```sql
ALTER TABLE time_slots
  ADD COLUMN class_type TEXT NOT NULL DEFAULT 'group';

-- All existing slots become 'group' automatically via the DEFAULT.
-- No backfill needed.
```

#### Update `create_reservation` RPC

The current RPC uses a weighted-seat model (`individual=4 seats`, `duo=2 seats`). This must change to a class-type-based model:

**Remove:**
- `v_seats_needed` weighted calculation (`CASE WHEN 'individual' THEN 4, 'duo' THEN 2, ELSE 1`)
- `v_has_private` check ("Slot blocked by private session")

**Replace with:**
```sql
-- Look up class_type and max_capacity from time_slots
SELECT class_type, max_capacity INTO v_class_type, v_max_capacity
FROM time_slots
WHERE date = p_date_key AND start_time = p_time_slot;

-- Validate: package service_type must match slot class_type
-- group slots accept 'single' and 'package' service types
-- individual slots accept only 'individual'
-- duo slots accept only 'duo'
IF v_class_type = 'group' AND p_service_type NOT IN ('single', 'package') THEN
  RETURN jsonb_build_object('error', 'This slot is for group classes only');
END IF;
IF v_class_type = 'individual' AND p_service_type != 'individual' THEN
  RETURN jsonb_build_object('error', 'This slot is for Individual training only');
END IF;
IF v_class_type = 'duo' AND p_service_type != 'duo' THEN
  RETURN jsonb_build_object('error', 'This slot is for DUO training only');
END IF;

-- Capacity check: count active reservations (each = 1, regardless of type)
SELECT COUNT(*) INTO v_booked
FROM reservations
WHERE date_key = p_date_key AND time_slot = p_time_slot
  AND reservation_status IN ('pending', 'confirmed');

IF v_booked >= v_max_capacity THEN
  RETURN jsonb_build_object('error', 'Insufficient capacity');
END IF;
```

Every reservation counts as 1 booking. Capacity is determined by `time_slots.max_capacity` (4 for group, 1 for individual/duo).

#### `service_type` on reservations

Keep `service_type` on reservation rows — it's still useful for historical queries and reporting. The change is that capacity/access logic now comes from `time_slots.class_type`, not from the reservation's `service_type`.

### 2. Backend API Changes

#### Modify existing `POST /admin/slots`

Add `classType` to the request body:
```json
{
  "date": "2026-03-24",
  "startTime": "19:00",
  "classType": "individual"  // NEW — "group" | "individual" | "duo", defaults to "group"
}
```

When `classType` is `individual` or `duo`, set `max_capacity = 1`. When `group`, set `max_capacity = 4`.

#### Modify existing `PUT /admin/slots/:id`

Accept `classType` in the request body. Only allowed if no reservations exist for that slot (to prevent data inconsistency). Update `max_capacity` accordingly.

#### Modify `GET /slots/availability` and `GET /slots/user-calendar`

Add `classType` to the response per slot:
```json
{
  "2026-03-24": {
    "09:00": { "booked": 2, "capacity": 4, "classType": "group" },
    "10:00": { "booked": 0, "capacity": 1, "classType": "individual" },
    "18:00": { "booked": 1, "capacity": 1, "classType": "duo" }
  }
}
```

The `classType` comes from `time_slots.class_type`. All existing slots have `class_type = 'group'` by default.

#### Modify `POST /user/packages/:id/book-session`

Add class-type validation: look up `time_slots` for the requested `date_key + time_slot`, verify the package's service type is allowed for the slot's class type. Return clear error if mismatch.

#### Modify `POST /packages/:id/first-session`

Same class-type validation as `book-session`.

**Remove Duo partner validation** (lines 1407 and 1713 in index.ts):
```typescript
// REMOVE THIS — partner info is no longer tracked
if (serviceType === 'duo' && (!partnerName || !partnerSurname)) {
  return c.json({ error: "Partner name and surname required..." }, 400);
}
```

Pass `null` for `p_partner_name` and `p_partner_surname` in all RPC calls for duo bookings.

#### Update `calculateSlotCapacity()` helper

Currently uses weighted seat model and returns `isPrivate`/`isBlocked`. Change to:
- Read `class_type` and `max_capacity` from `time_slots`
- Count reservations (each = 1)
- Return `classType` instead of `isPrivate`
- Remove `isBlocked` logic (replaced by class-type access control on frontend)

### 3. Admin Panel Changes

#### Slot Creation UI (`AdminPanel.tsx`)

When admin clicks to create a slot on the calendar:

1. Existing time slot selector (unchanged).
2. **Add class type selector**: three buttons — "Multipack" (green), "Individual" (orange), "DUO" (purple).
3. Capacity display updates based on selection (4, 1, or 1).
4. POST to existing `/admin/slots` with added `classType` field.

#### Calendar View

- Each slot in the day view shows a **color-coded left border** and **type label**:
  - Green border + "Multipack" for group
  - Orange border + "Individual" for individual
  - Purple border + "DUO" for duo
- Booking count shows `X/4` for group, `X/1` for individual/duo.
- For duo slots, show the one booking entry (single person name, no partner).

### 4. User Dashboard Changes (`UserDashboard.tsx`)

#### Package Calendar

Each package card's inline calendar shows **all slots for the selected day**.

**Slot rendering rules:**
- **Matching + available**: Green background, clickable, shows spots (e.g., "2/4" or "0/1").
- **Matching + full**: Gray/muted, not clickable, shows "Full".
- **Non-matching**: Type-colored but dimmed (50% opacity), not clickable, shows lock icon and type label.

**Color scheme:**
- Group/Multipack: Green (`#22c55e`)
- Individual: Orange (`#f97316`)
- DUO: Purple (`#a855f7`)

**Access control mapping (frontend):**
```typescript
function canBookSlot(packageServiceType: string, slotClassType: string): boolean {
  if (slotClassType === 'group') return ['single', 'package'].includes(packageServiceType);
  if (slotClassType === 'individual') return packageServiceType === 'individual';
  if (slotClassType === 'duo') return packageServiceType === 'duo';
  return false;
}
```

#### Package Cards

Individual and Duo package cards work identically to Multipack cards:
- Show remaining sessions count.
- Inline calendar for booking next session.
- Upcoming reserved sessions as cubes.
- Cancel button with same rules.

#### `useRealtimeAvailability` hook

Update this hook's return type to include `classType` per slot, passing through the new field from the availability API response.

### 5. Booking Pages (IndividualTraining.tsx, DuoTraining.tsx)

These existing components handle the **purchase** step (package creation). They need the same 2-step flow as PackageOverview:

1. User fills form → POST `/packages` → package created.
2. Show date/time selection (BookingScreen) → user picks a matching slot → POST `/packages/:id/first-session`.
3. Confirmation → success page.

**Changes needed:**
- Integrate with BookingContext to pass package data to BookingScreen.
- BookingScreen shows all slots but only Individual-type (or Duo-type) slots are bookable.
- ConfirmationScreen shows correct label ("Individual" / "DUO").
- Remove duo partner name/surname fields from DuoTraining form (not tracked).

### 6. BookingContext (`src/contexts/BookingContext.tsx`)

Currently supports `trainingType: 'single' | 'package' | 'individual' | 'duo'`. This is sufficient. No new fields needed since partner info is not tracked and `packageId` is already available.

### 7. Translations (`src/app/translations.ts`)

New keys needed in all 3 languages (SQ, MK, EN):

```
classTypeGroup: "Multipack" / "Мултипак" / "Multipack"
classTypeIndividual: "Individual" / "Индивидуал" / "Individual"
classTypeDuo: "DUO" / "ДУО" / "DUO"
slotLocked: "Requires {type} package" / ...
slotFull: "Full" / ...
adminClassTypeLabel: "Class Type" / ...
```

## What Does NOT Change

- Single-class booking flow (one-off, no package) — unchanged, can only book `group` slots.
- Existing Multipack booking flow — unchanged. All current slots default to `group`.
- Package validity (35 days), cancellation rules, payment flow, email notifications.
- Admin user management, attendance tracking, package activation flow.
- Session management (KV store), auth flow, password setup.

## Migration Strategy

1. **Database**: Deploy `ALTER TABLE time_slots ADD COLUMN class_type` migration. All existing slots become `group` automatically.
2. **Backend**: Deploy updated RPC, modified endpoints (slots CRUD + availability + booking validation).
3. **Frontend**: Deploy admin class type selector, user dashboard color coding, Individual/Duo booking flow.
4. All existing functionality continues working — `group` is the default everywhere.

## Open Items

- [x] ~~Confirm correct prices~~ — Frontend prices are correct. Backend `PACKAGE_PRICING` must be updated.
