# Individual & Duo Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-defined class types (group/individual/duo) to time slots, so Individual and Duo package users can book sessions through the same self-service flow as Multipack users.

**Architecture:** Extend the existing `time_slots` table with a `class_type` column. Update the `create_reservation` RPC to use class-type-based capacity instead of weighted seats. Modify frontend calendars to show all slots color-coded by type, with booking restricted to matching package types.

**Tech Stack:** Supabase Postgres (migrations, RPC), Deno/Hono backend (Edge Functions), React/TypeScript/Tailwind frontend.

**Spec:** `docs/superpowers/specs/2026-03-19-individual-duo-training-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Migrate | `supabase/migrations/20260319_add_class_type.sql` | Add `class_type` column to `time_slots`, update `create_reservation` RPC |
| Modify | `supabase/functions/make-server-b87b0c07/index.ts` | Update endpoints: admin slots CRUD, availability, booking validation, pricing, remove duo partner validation |
| Modify | `src/app/components/AdminPanel.tsx` | Class type selector in slot creation UI, color-coded calendar |
| Modify | `src/app/components/UserDashboard.tsx` | Color-coded slot rendering, class-type-aware booking |
| Modify | `src/app/components/BookingScreen.tsx` | Class-type-aware slot display for first-session booking |
| Modify | `src/app/components/IndividualTraining.tsx` | Add 2-step flow (purchase → book first session) |
| Modify | `src/app/components/DuoTraining.tsx` | Add 2-step flow (purchase → book first session) |
| Modify | `src/app/components/PackageOverview.tsx` | Pass classType filter to BookingScreen |
| Modify | `src/app/translations.ts` | Add class type labels and locked-slot strings |
| Modify | `src/contexts/BookingContext.tsx` | No changes needed (trainingType already supports individual/duo) |
| None | `src/hooks/useRealtimeAvailability.ts` | No changes needed — hook just triggers `onRefresh()` callback on any reservation change (1.5s debounce). The spec mentions updating its return type, but it has no return type related to slots; the `classType` data flows through the availability API response consumed by the refresh callback, not through the hook itself. |

---

## Task 1: Database Migration — Add `class_type` and Update RPC

**Files:**
- Create: `supabase/migrations/20260319_add_class_type.sql`
- Reference: `supabase/migrations/20260303120000_fix_duplicate_and_slot_index.sql` (current RPC, lines 14–190)

- [ ] **Step 1: Write the migration SQL**

**Strategy:** Keep the entire existing RPC logic intact. Only replace the capacity section (lines 40–91 in the current migration) with class-type-based logic. All other sections (alt date key, locking, friend booking, package validation, first-session logic, INSERT, package UPDATE) remain **identical** to the current `20260303120000` migration.

```sql
-- Add class_type to time_slots
ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'group';

-- Replace create_reservation RPC: ONLY changes are in the capacity section.
-- Everything else is preserved from 20260303120000_fix_duplicate_and_slot_index.sql
CREATE OR REPLACE FUNCTION create_reservation(
  p_user_email TEXT,
  p_package_id UUID,
  p_service_type TEXT,
  p_date_key TEXT,
  p_time_slot TEXT,
  p_instructor TEXT,
  p_name TEXT,
  p_surname TEXT,
  p_mobile TEXT,
  p_package_type TEXT DEFAULT NULL,
  p_partner_name TEXT DEFAULT NULL,
  p_partner_surname TEXT DEFAULT NULL,
  p_is_first_session BOOLEAN DEFAULT FALSE,
  p_slot_index INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_class_type TEXT;
  v_max_capacity INT;
  v_booked INT;
  v_package RECORD;
  v_reservation_id UUID;
  v_status TEXT;
  v_alt_date_key TEXT;
  v_is_friend_booking BOOLEAN := FALSE;
BEGIN
  -- ===== ALT DATE KEY (unchanged from original) =====
  IF p_date_key ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_alt_date_key := CAST(EXTRACT(MONTH FROM p_date_key::date) AS INTEGER)::TEXT
                      || '-' ||
                      CAST(EXTRACT(DAY FROM p_date_key::date) AS INTEGER)::TEXT;
  ELSIF p_date_key ~ '^\d{1,2}-\d{1,2}$' THEN
    v_alt_date_key := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                      || '-' || lpad(split_part(p_date_key, '-', 1), 2, '0')
                      || '-' || lpad(split_part(p_date_key, '-', 2), 2, '0');
  ELSE
    v_alt_date_key := p_date_key;
  END IF;

  -- ===== NEW: CLASS TYPE LOOKUP =====
  SELECT ts.class_type, ts.max_capacity
  INTO v_class_type, v_max_capacity
  FROM time_slots ts
  WHERE ts.date = p_date_key AND ts.start_time = p_time_slot
  LIMIT 1;

  -- Default to group/4 if no time_slots row (backwards compat)
  v_class_type := COALESCE(v_class_type, 'group');
  v_max_capacity := COALESCE(v_max_capacity, 4);

  -- ===== NEW: CLASS TYPE VALIDATION =====
  IF v_class_type = 'group' AND p_service_type NOT IN ('single', 'package') THEN
    RETURN jsonb_build_object('error', 'This slot is for group classes only');
  END IF;
  IF v_class_type = 'individual' AND p_service_type != 'individual' THEN
    RETURN jsonb_build_object('error', 'This slot is for Individual training only');
  END IF;
  IF v_class_type = 'duo' AND p_service_type != 'duo' THEN
    RETURN jsonb_build_object('error', 'This slot is for DUO training only');
  END IF;

  -- ===== LOCKING (unchanged) =====
  PERFORM 1
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended')
  FOR UPDATE;

  -- ===== NEW: SIMPLE COUNT CAPACITY (replaces weighted seats + v_has_private) =====
  SELECT COUNT(*)
  INTO v_booked
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended');

  IF v_booked >= v_max_capacity THEN
    RETURN jsonb_build_object('error', 'Insufficient capacity');
  END IF;

  -- ===== FRIEND BOOKING CHECK (unchanged — allows duplicate, marks as friend) =====
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE user_email = p_user_email
      AND date_key IN (p_date_key, v_alt_date_key)
      AND time_slot = p_time_slot
      AND reservation_status IN ('pending', 'confirmed')
  ) THEN
    v_is_friend_booking := TRUE;
  END IF;

  -- ===== PACKAGE VALIDATION (unchanged from original) =====
  IF p_package_id IS NOT NULL THEN
    SELECT * INTO v_package
    FROM user_packages
    WHERE id = p_package_id
    FOR UPDATE;

    IF v_package IS NULL THEN
      RETURN jsonb_build_object('error', 'Package not found');
    END IF;

    IF v_package.remaining_sessions <= 0 THEN
      RETURN jsonb_build_object('error', 'No remaining sessions');
    END IF;

    IF p_is_first_session THEN
      IF v_package.package_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Package is not in pending state');
      END IF;
      IF v_package.first_reservation_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'First session already booked');
      END IF;
      v_status := 'pending';
    ELSE
      IF v_package.package_status NOT IN ('active', 'pending') THEN
        RETURN jsonb_build_object('error', 'Package not active');
      END IF;
      v_status := CASE WHEN v_package.package_status = 'active' THEN 'confirmed' ELSE 'pending' END;
    END IF;
  ELSE
    v_status := 'pending';
  END IF;

  -- ===== INSERT RESERVATION (unchanged — includes payment_status) =====
  INSERT INTO reservations (
    user_email, date_key, time_slot, reservation_status, payment_status,
    name, surname, mobile, instructor, package_type, service_type,
    package_id, is_friend_booking, slot_index, created_at, updated_at
  ) VALUES (
    p_user_email, p_date_key, p_time_slot, v_status,
    CASE WHEN p_package_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
    p_name, p_surname, p_mobile, p_instructor, p_package_type,
    p_service_type, p_package_id, v_is_friend_booking, p_slot_index,
    NOW(), NOW()
  ) RETURNING id INTO v_reservation_id;

  -- ===== PACKAGE UPDATE (unchanged — split first/subsequent, TEXT[] with dedup) =====
  IF p_package_id IS NOT NULL THEN
    IF p_is_first_session THEN
      UPDATE user_packages
      SET first_reservation_id = v_reservation_id,
          remaining_sessions = remaining_sessions - 1,
          sessions_booked = CASE
            WHEN v_reservation_id::text = ANY(COALESCE(sessions_booked, '{}'))
            THEN sessions_booked
            ELSE array_append(COALESCE(sessions_booked, '{}'), v_reservation_id::text)
          END,
          updated_at = NOW()
      WHERE id = p_package_id;
    ELSE
      UPDATE user_packages
      SET remaining_sessions = remaining_sessions - 1,
          sessions_booked = CASE
            WHEN v_reservation_id::text = ANY(COALESCE(sessions_booked, '{}'))
            THEN sessions_booked
            ELSE array_append(COALESCE(sessions_booked, '{}'), v_reservation_id::text)
          END,
          updated_at = NOW()
      WHERE id = p_package_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'status', v_status,
    'is_friend_booking', v_is_friend_booking
  );
END;
$$ LANGUAGE plpgsql;
```

Save this to `supabase/migrations/20260319_add_class_type.sql`.

- [ ] **Step 2: Deploy migration**

Deploy via Supabase Management API (since `supabase db push` can fail with history divergence):
```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" curl -s -X POST \
  "https://api.supabase.com/v1/projects/azqkguctispoctvmpmci/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<migration SQL here>"}'
```

- [ ] **Step 3: Verify migration**

Query to confirm column exists and RPC works:
```sql
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'time_slots' AND column_name = 'class_type';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260319_add_class_type.sql
git commit -m "db: add class_type to time_slots, update create_reservation RPC"
```

---

## Task 2: Backend — Update Pricing, Availability, and Slot Endpoints

**Files:**
- Modify: `supabase/functions/make-server-b87b0c07/index.ts`
  - `PACKAGE_PRICING` (lines 51–62)
  - `calculateSlotCapacity()` (lines 375–416)
  - `GET /slots/availability` (lines 3922–3989)
  - `GET /slots/user-calendar` (lines 3991–4077)
  - `POST /admin/slots` (lines 4208–4266)
  - `PATCH /admin/slots/:id` (lines 4269–4343)
  - `GET /admin/slots` (lines 4080–4132)

- [ ] **Step 1: Fix PACKAGE_PRICING**

Update backend prices to match confirmed frontend prices:
```typescript
const PACKAGE_PRICING = {
  single: { price: 600, label: 'Single Session', description: '600 DEN per session' },
  package8: { price: 3500, label: '8 Classes Package', description: '8 group classes' },
  package10: { price: 4200, label: '10 Classes Package', description: '10 group classes' },
  package12: { price: 4800, label: '12 Classes Package', description: '12 group classes' },
  individual1: { price: 1200, label: '1-on-1 Single Session', description: 'Private training' },
  individual8: { price: 7000, label: '1-on-1 8 Sessions', description: '8 private sessions' },
  individual12: { price: 9500, label: '1-on-1 12 Sessions', description: '12 private sessions' },
  duo1: { price: 2100, label: 'DUO Single Session', description: 'For 2 people' },
  duo8: { price: 13400, label: 'DUO 8 Sessions', description: '8 duo sessions' },
  duo12: { price: 18400, label: 'DUO 12 Sessions', description: '12 duo sessions' },
};
```

- [ ] **Step 2: Update `calculateSlotCapacity()`**

Replace lines 375–416 with class-type-aware version:
```typescript
async function calculateSlotCapacity(dateKey: string, timeSlot: string): Promise<{available: number, isBlocked: boolean, classType: string, maxCapacity: number}> {
  const supabase = getSupabase();
  const dateKeyVariants = getDateKeyVariants(dateKey);

  // Look up class_type from time_slots
  const { data: slotConfig } = await supabase
    .from('time_slots')
    .select('class_type, max_capacity')
    .eq('date', dateKey)
    .eq('start_time', timeSlot)
    .single();

  const classType = slotConfig?.class_type || 'group';
  const maxCapacity = slotConfig?.max_capacity || 4;

  const { data: slotReservations, error } = await supabase
    .from('reservations')
    .select('id')
    .in('date_key', dateKeyVariants)
    .eq('time_slot', timeSlot)
    .in('reservation_status', ['pending', 'confirmed', 'attended']);

  if (error) {
    return { available: 0, isBlocked: true, classType, maxCapacity };
  }

  const booked = (slotReservations || []).length;

  return {
    available: Math.max(0, maxCapacity - booked),
    isBlocked: booked >= maxCapacity,
    classType,
    maxCapacity
  };
}
```

- [ ] **Step 3: Update `GET /slots/user-calendar`**

At lines 3991–4077, the endpoint returns `slotConfigs` per date. Add `class_type` to the slot config objects.

Find where `slotConfigs` are built (around line 4048) and include `class_type`:
```typescript
// In the slotConfigs mapping:
slotConfigs[dateKey] = slots.map((s: any) => ({
  start_time: s.start_time,
  max_capacity: s.max_capacity,
  class_type: s.class_type || 'group',  // ADD THIS
}));
```

Also update the `select` query for time_slots to include `class_type`:
```typescript
.from('time_slots')
.select('start_time, max_capacity, class_type')  // ADD class_type
```

- [ ] **Step 4: Update `GET /slots/availability`**

At lines 3922–3989, add `classType` to booking objects in the response. Since this endpoint returns reservations, not slot configs, we need to also return slot configs with class_type. Add a slot config section to the response:

```typescript
// After fetching bookings, also fetch slot configs for live dates
const { data: slotConfigs } = await supabase
  .from('time_slots')
  .select('date, start_time, class_type, max_capacity')
  .in('date', liveDates);

// Add to response:
return c.json({
  success: true,
  bookings: formattedBookings,
  slotConfigs: (slotConfigs || []).reduce((acc: any, s: any) => {
    if (!acc[s.date]) acc[s.date] = {};
    acc[s.date][s.start_time] = { classType: s.class_type || 'group', maxCapacity: s.max_capacity };
    return acc;
  }, {})
});
```

- [ ] **Step 5: Update `POST /admin/slots`**

At lines 4208–4266, accept `classType` in the request body and set `max_capacity` accordingly:

```typescript
const { date, startTime, maxCapacity, classType } = await c.req.json();

// Determine capacity from class type (if classType provided)
const effectiveClassType = classType || 'group';
const effectiveMaxCapacity = maxCapacity || (effectiveClassType === 'group' ? 4 : 1);
```

Include `class_type` in the INSERT:
```typescript
.insert({
  date: isoDate,
  start_time: startTime,
  max_capacity: effectiveMaxCapacity,
  class_type: effectiveClassType,
})
```

- [ ] **Step 6: Update `PATCH /admin/slots/:id`**

At lines 4269–4343, accept `classType` in the request body. **Two code paths** need updating:

**a) Regular slot path** (lines 4326–4339):
```typescript
const { startTime, maxCapacity, date, classType } = await c.req.json();

const updateFields: any = { updated_at: new Date().toISOString() };
if (startTime) updateFields.start_time = startTime;
if (date) updateFields.date = date;
if (classType) {
  updateFields.class_type = classType;
  if (!maxCapacity) {
    updateFields.max_capacity = classType === 'group' ? 4 : 1;
  }
}
if (maxCapacity) updateFields.max_capacity = maxCapacity;
```

**b) Default-slot conversion path** (lines 4282–4318): When a `default-N` slot is being edited, the code initializes all default slots as custom rows. In this initialization, pass through the `classType` for the modified slot:
```typescript
// When converting the default slot to custom:
const modifiedSlot = {
  date: isoDate,
  start_time: startTime || defaultTime,
  max_capacity: classType ? (classType === 'group' ? 4 : 1) : (maxCapacity || 4),
  class_type: classType || 'group',
};
```

- [ ] **Step 7: Update `GET /admin/slots`**

At lines 4080–4132, ensure the response includes `class_type` in each slot object:

a) The query selects from `time_slots` — add `class_type` to the select if not using `select('*')`.

b) **Default slot objects** (fallback when no custom slots exist, around lines 4117–4123): These construct mock slot objects without querying the DB. Add `class_type: 'group'` to these default objects:
```typescript
// In the default slots array:
{ id: `default-${i}`, date: isoDate, start_time: TIME_SLOTS[i], max_capacity: 4, class_type: 'group', isDefault: true }
```

- [ ] **Step 8: Remove duo partner validation**

Remove these blocks:
- Lines 1406–1409 (in `POST /packages/:id/first-session`):
  ```typescript
  // DELETE THIS BLOCK:
  if (serviceType === 'duo' && (!partnerName || !partnerSurname)) {
    return c.json({ error: "Partner name and surname required for DUO bookings" }, 400);
  }
  ```
- Lines 1712–1715 (in `POST /reservations`):
  ```typescript
  // DELETE THIS BLOCK:
  if (serviceType === 'duo' && (!partnerName || !partnerSurname)) {
    return c.json({ error: "Partner information required for DUO bookings" }, 400);
  }
  ```

- [ ] **Step 9: Add class-type validation to `POST /user/packages/:id/book-session`**

At line ~5822 (before the RPC call), add:
```typescript
// Look up slot class_type
const { data: slotConfig } = await supabase
  .from('time_slots')
  .select('class_type')
  .eq('date', dateKey)
  .eq('start_time', timeSlot)
  .single();

const slotClassType = slotConfig?.class_type || 'group';

// Validate package service type matches slot class type
if (slotClassType === 'group' && !['single', 'package'].includes(serviceType)) {
  return c.json({ error: 'This slot is for group classes only' }, 400);
}
if (slotClassType === 'individual' && serviceType !== 'individual') {
  return c.json({ error: 'This slot is for Individual training only' }, 400);
}
if (slotClassType === 'duo' && serviceType !== 'duo') {
  return c.json({ error: 'This slot is for DUO training only' }, 400);
}
```

- [ ] **Step 10: Run build and api:check**

```bash
npm run build && npm run api:check
```

Expected: Both pass with no errors.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/make-server-b87b0c07/index.ts
git commit -m "feat: backend support for class types (group/individual/duo)"
```

---

## Task 3: Admin Panel — Class Type Selector and Color-Coded Calendar

**Files:**
- Modify: `src/app/components/AdminPanel.tsx`
  - Slot creation handler (lines 851–882)
  - Slot creation UI form (lines 1834–1880)
  - Calendar day view slot rendering

- [ ] **Step 1: Add `classType` state to slot creation**

Near the existing `newSlotTime` and `newSlotCapacity` state declarations, add:
```typescript
const [newSlotClassType, setNewSlotClassType] = useState<'group' | 'individual' | 'duo'>('group');
```

- [ ] **Step 2: Update `handleAddSlot` to send classType**

In the handler (around line 862), update the JSON body:
```typescript
body: JSON.stringify({
  date: isoDate,
  startTime: newSlotTime,
  maxCapacity: newSlotClassType === 'group' ? 4 : 1,
  classType: newSlotClassType,
}),
```

Reset after success:
```typescript
setNewSlotClassType('group');
```

- [ ] **Step 3: Add class type selector to the slot creation UI**

At the slot creation form (lines 1834–1880), add a 3-button selector before the time input:

```tsx
{/* Class Type Selector */}
<div className="flex gap-2 mb-3">
  {[
    { type: 'group' as const, label: 'Multipack', color: '#22c55e' },
    { type: 'individual' as const, label: 'Individual', color: '#f97316' },
    { type: 'duo' as const, label: 'DUO', color: '#a855f7' },
  ].map((ct) => (
    <button
      key={ct.type}
      onClick={() => setNewSlotClassType(ct.type)}
      className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
        newSlotClassType === ct.type
          ? 'text-white'
          : 'opacity-50 hover:opacity-75'
      }`}
      style={{
        borderColor: ct.color,
        backgroundColor: newSlotClassType === ct.type ? ct.color : 'transparent',
        color: newSlotClassType === ct.type ? '#fff' : ct.color,
      }}
    >
      {ct.label}
      <span className="block text-[10px] opacity-75">
        {ct.type === 'group' ? '4 spots' : '1 spot'}
      </span>
    </button>
  ))}
</div>
```

Auto-update capacity display when class type changes (remove or disable the manual capacity dropdown for individual/duo).

- [ ] **Step 4: Color-code slots in the admin calendar day view**

Find where slots are rendered in the calendar. Each slot row needs:
- A colored left border based on `class_type`:
  - `group` → `border-l-4 border-l-green-500`
  - `individual` → `border-l-4 border-l-orange-500`
  - `duo` → `border-l-4 border-l-purple-500`
- A type label next to the time (e.g., "Multipack", "Individual", "DUO")
- Capacity shows `X/4` for group, `X/1` for individual/duo

```tsx
const classTypeColors: Record<string, string> = {
  group: 'border-l-green-500',
  individual: 'border-l-orange-500',
  duo: 'border-l-purple-500',
};
const classTypeLabels: Record<string, string> = {
  group: 'Multipack',
  individual: 'Individual',
  duo: 'DUO',
};
```

- [ ] **Step 5: Update slot edit (PATCH) to include classType**

When editing an existing slot, send `classType` in the PATCH body. Add class type selector to the edit UI if one exists.

- [ ] **Step 6: Run build**

```bash
npm run build
```

Expected: Pass with no TS errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/AdminPanel.tsx
git commit -m "feat: admin panel class type selector and color-coded calendar"
```

---

## Task 4: Translations — Add Class Type Labels

**Files:**
- Modify: `src/app/translations.ts`

- [ ] **Step 1: Add new translation keys to all 3 languages**

Add these keys to the SQ, MK, and EN objects:

```typescript
// English
classTypeGroup: 'Multipack',
classTypeIndividual: 'Individual',
classTypeDuo: 'DUO',
slotLocked: 'Requires {type} package',
slotLockedIndividual: 'Requires Individual package',
slotLockedDuo: 'Requires DUO package',
slotLockedGroup: 'Requires Multipack',
slotFull: 'Full',
adminClassTypeLabel: 'Class Type',

// Albanian (SQ)
classTypeGroup: 'Multipack',
classTypeIndividual: 'Individual',
classTypeDuo: 'DUO',
slotLocked: 'Kërkon paketën {type}',
slotLockedIndividual: 'Kërkon paketën Individual',
slotLockedDuo: 'Kërkon paketën DUO',
slotLockedGroup: 'Kërkon Multipack',
slotFull: 'Plot',
adminClassTypeLabel: 'Lloji i klasës',

// Macedonian (MK)
classTypeGroup: 'Мултипак',
classTypeIndividual: 'Индивидуал',
classTypeDuo: 'ДУО',
slotLocked: 'Потребен е пакет {type}',
slotLockedIndividual: 'Потребен е Individual пакет',
slotLockedDuo: 'Потребен е DUO пакет',
slotLockedGroup: 'Потребен е Мултипак',
slotFull: 'Полно',
adminClassTypeLabel: 'Тип на класа',
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/translations.ts
git commit -m "i18n: add class type labels (SQ, MK, EN)"
```

---

## Task 5: User Dashboard — Color-Coded Slots and Class-Type-Aware Booking

**Files:**
- Modify: `src/app/components/UserDashboard.tsx`
  - `TimeSlot` type (lines 54–60)
  - Slot loading function (lines 511–607)
  - Slot rendering (lines 1552–1574)

- [ ] **Step 1: Extend `TimeSlot` type with `classType`**

At lines 54–60, add `classType` field. Note: `maxCapacity` may already exist — check first, only add if missing:
```typescript
type TimeSlot = {
  time: string;
  available: number;
  isBooked: boolean;
  userBookings: number;
  classType: string;     // ADD: 'group' | 'individual' | 'duo'
  maxCapacity: number;   // ADD if not already present
};
```

- [ ] **Step 2: Update slot loading to include classType**

In the slot loading function (around line 553), when building TimeSlot objects from the API response, map `class_type` from `slotConfigs`:

```typescript
// When building timeSlots array from slotConfigs:
const classType = slotConfig.class_type || 'group';
const maxCapacity = slotConfig.max_capacity || 4;

// In capacity calculation, replace weighted seat logic:
// OLD: if (b.serviceType === 'duo') return total + 2; if (b.serviceType === 'individual') return total + 4;
// NEW: each booking counts as 1
const booked = bookingsForSlot.length;

return {
  time: slotConfig.start_time,
  available: Math.max(0, maxCapacity - booked),
  isBooked: /* user's own booking check */,
  userBookings: /* user's own booking count */,
  classType,
  maxCapacity,
};
```

- [ ] **Step 3: Add `canBookSlot` helper**

```typescript
function canBookSlot(packageServiceType: string, slotClassType: string): boolean {
  if (slotClassType === 'group') return ['single', 'package'].includes(packageServiceType);
  if (slotClassType === 'individual') return packageServiceType === 'individual';
  if (slotClassType === 'duo') return packageServiceType === 'duo';
  return false;
}
```

Add helper to extract service type from package type (reuse existing `extractServiceType` or add inline):
```typescript
function getPackageServiceType(packageType: string): string {
  if (packageType.startsWith('individual')) return 'individual';
  if (packageType.startsWith('duo')) return 'duo';
  return 'package'; // single, package8, package10, package12
}
```

- [ ] **Step 4: Update slot rendering with color coding**

At the slot rendering (lines 1552–1574), wrap each slot button with class-type-aware styling:

```tsx
const classTypeColorMap: Record<string, { bg: string; border: string; text: string; label: string }> = {
  group:      { bg: 'bg-green-900/30', border: 'border-green-500', text: 'text-green-400', label: t.classTypeGroup || 'Multipack' },
  individual: { bg: 'bg-orange-900/30', border: 'border-orange-500', text: 'text-orange-400', label: t.classTypeIndividual || 'Individual' },
  duo:        { bg: 'bg-purple-900/30', border: 'border-purple-500', text: 'text-purple-400', label: t.classTypeDuo || 'DUO' },
};

// For each time slot:
const colors = classTypeColorMap[timeSlot.classType] || classTypeColorMap.group;
const packageSvcType = getPackageServiceType(pkg.packageType);
const isMatchingType = canBookSlot(packageSvcType, timeSlot.classType);
const isBookable = isMatchingType && timeSlot.available > 0 && !timeSlot.isBooked;

// Render:
<button
  disabled={!isBookable}
  className={`border-l-4 ${colors.border} ${
    isMatchingType
      ? isBookable ? `${colors.bg} cursor-pointer` : 'bg-gray-800/50 opacity-60'
      : 'bg-gray-900/30 opacity-40 cursor-not-allowed'
  }`}
>
  <span className={colors.text}>{timeSlot.time}</span>
  <span className="text-xs">{colors.label}</span>
  {isMatchingType
    ? <span>{timeSlot.available}/{timeSlot.maxCapacity}</span>
    : <span>🔒</span>
  }
</button>
```

- [ ] **Step 5: Update booking handler to check class type**

In `handleInlineBook`, before making the API call, verify the slot type matches. This is a safety check (backend also validates):
```typescript
if (!canBookSlot(getPackageServiceType(pkg.packageType), timeSlot.classType)) {
  toast.error(t.slotLocked || 'This slot requires a different package type');
  return;
}
```

- [ ] **Step 6: Run build**

```bash
npm run build
```

Expected: Pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/UserDashboard.tsx
git commit -m "feat: color-coded slots and class-type booking in user dashboard"
```

---

## Task 6: Booking Pages — Add 2-Step Flow to Individual & Duo

**Files:**
- Modify: `src/app/components/IndividualTraining.tsx`
- Modify: `src/app/components/DuoTraining.tsx`
- Modify: `src/app/components/BookingScreen.tsx` (add classType filter)
- Reference: `src/app/components/PackageOverview.tsx` (lines 164–395 for 2-step pattern)

- [ ] **Step 1: Study PackageOverview 2-step flow**

Read `PackageOverview.tsx` lines 164–395 to understand:
- How `packageData` state stores the created package after step 1
- How `showFirstSessionModal` triggers the date/time picker
- How `loadAvailableSlots()` fetches and filters slots
- How `handleBookFirstSession()` calls POST `/packages/:id/first-session`

- [ ] **Step 2: Add 2-step flow to IndividualTraining.tsx**

After successful package creation (line 112, inside `if (data.success || data.packageId)`):

Instead of just showing a success popup, store the package data and show the slot picker:

```typescript
// Add state:
const [packageData, setPackageData] = useState<{ packageId: string; packageType: string } | null>(null);
const [showSlotPicker, setShowSlotPicker] = useState(false);
const [availableSlots, setAvailableSlots] = useState<any[]>([]);

// In handleSubmit success:
setPackageData({ packageId: data.packageId, packageType: packageTypeMap[packageType] });
setShowSlotPicker(true);
// Load available slots filtered to 'individual' class type
loadAvailableSlots();
```

Add `loadAvailableSlots` function (adapted from PackageOverview):
```typescript
const loadAvailableSlots = async () => {
  // Fetch from /slots/user-calendar
  // Filter to only show slots where class_type === 'individual'
  // Build date/time picker UI
};
```

Add `handleBookFirstSession` function:
```typescript
const handleBookFirstSession = async (dateKey: string, timeSlot: string) => {
  if (!packageData) return;
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-b87b0c07/packages/${packageData.packageId}/first-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({
        dateKey,
        timeSlot,
        instructor: '',
        appUrl: window.location.origin,
      }),
    }
  );
  const data = await response.json();
  if (data.success) {
    setShowSuccessPopup(true);
    setShowSlotPicker(false);
  }
};
```

Add slot picker UI with color-coded slots (all slots visible, only `individual` bookable).

- [ ] **Step 3: Add same 2-step flow to DuoTraining.tsx**

Mirror the changes from IndividualTraining.tsx, but filter to `class_type === 'duo'`.

Note: `DuoTraining.tsx` currently does NOT have partner name/surname form fields (verified — it only collects buyer's name, surname, mobile, email). No fields need removing.

- [ ] **Step 4: Update BookingScreen.tsx for class type awareness**

BookingScreen uses `GET /slots/availability` to build its slot view. After Task 2 Step 4, this endpoint now returns `slotConfigs` with `classType` per slot.

**a) Consume `slotConfigs` from the availability response:**
```typescript
const { bookings, slotConfigs } = await response.json();
// slotConfigs: { "2026-03-24": { "09:00": { classType: "group", maxCapacity: 4 }, ... } }
```

**b) Replace weighted seat logic** (lines 160–167) with simple count:
```typescript
// OLD:
// if (b.serviceType === 'duo') return total + 2;
// if (b.serviceType === 'individual') return total + 4;

// NEW: each booking = 1, use maxCapacity from slotConfigs
const config = slotConfigs?.[dateKey]?.[timeSlot] || { classType: 'group', maxCapacity: 4 };
const booked = bookingsForSlot.length;
const available = Math.max(0, config.maxCapacity - booked);
```

**c) Pass `classType` to slot rendering** and add color coding + lock icons for non-matching types. The `canBookSlot` helper from Task 5 should be extracted to a shared util or duplicated here.

**d) Filter bookable slots** based on the `trainingType` from BookingContext:
```typescript
const { bookingData } = useBooking();
const serviceType = bookingData.trainingType || 'package';
// Use canBookSlot(serviceType, config.classType) to determine if slot is bookable
```

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/IndividualTraining.tsx src/app/components/DuoTraining.tsx src/app/components/BookingScreen.tsx
git commit -m "feat: 2-step booking flow for Individual and Duo with class-type filtering"
```

---

## Task 7: Final Verification

**Files:** All modified files.

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Pass, no TS errors.

- [ ] **Step 2: Run API contract check**

```bash
npm run api:check
```

Expected: PASS, 0 missing endpoints.

- [ ] **Step 3: Deploy backend (when requested)**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy make-server-b87b0c07 --project-ref azqkguctispoctvmpmci
```

- [ ] **Step 4: Run smoke tests (after deploy)**

```bash
npm run smoke
```

Expected: All endpoints respond correctly.

- [ ] **Step 5: Manual testing checklist**

- [ ] Admin: Create a group slot → verify it shows green in calendar
- [ ] Admin: Create an individual slot → verify it shows orange, capacity 1
- [ ] Admin: Create a duo slot → verify it shows purple, capacity 1
- [ ] User (Multipack): See all slots, only group slots green/bookable → book one
- [ ] User (Individual): See all slots, only individual slots green/bookable → book one
- [ ] User (Duo): See all slots, only duo slots green/bookable → book one
- [ ] User: Try to book wrong slot type → verify blocked with clear error
- [ ] New user: Buy Individual package on /book/individual → see slot picker → book first session
- [ ] New user: Buy Duo package on /book/duo → see slot picker → book first session
- [ ] Cancellation: Cancel an individual/duo session → verify session returned

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Individual & Duo training — complete implementation"
```
