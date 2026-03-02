# WellNest Pilates - Architecture

> **Purpose:** How the system works.
> **Read when:** Implementing features, debugging logic, changing architecture.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Vite |
| Backend | Supabase Edge Functions + Hono |
| Database | Supabase Postgres |
| Email | Resend |
| Hosting | Vercel (frontend), Supabase (backend) |

## Project URLs

- **App:** https://app.wellnestpilates.com
- **Supabase Dashboard:** https://supabase.com/dashboard/project/azqkguctispoctvmpmci
- **Project ID:** azqkguctispoctvmpmci
- **Region:** eu-central-1

---

## Timezone (CRITICAL)

**All date/time logic uses Europe/Skopje (UTC+1, UTC+2 with DST)**

Never use `new Date()` directly for business logic. Always use centralized utilities.

---

## Centralized Date Utilities

Two files that **MUST stay in sync**:

| Location | File |
|----------|------|
| Frontend | `src/utils/dateUtils.ts` |
| Backend | `supabase/functions/make-server-b87b0c07/dateUtils.ts` |

### Key Functions

| Function | Purpose |
|----------|---------|
| `getSkopjeTime()` | Current time in Skopje timezone |
| `getSkopjeToday()` | Today at midnight in Skopje |
| `getAvailableBookingDates(n)` | Next N weekdays from today |
| `isValidBookingDate(date)` | Not in past + is weekday |
| `isWeekday(date)` | Monday-Friday check |
| `isTimeSlotPast(date, time)` | Slot passed (5min buffer) |
| `formatDateKey(date)` | "2026-02-03" (ISO format) |
| `formatDateKeyLegacy(date)` | "2-3" (month-day format) |
| `formatDateShort(date)` | "3 Feb" |

### Sync Protocol

When updating either file:
1. Make identical changes to both files
2. Update "Last synced" comment at top of both files
3. Test both frontend and backend

---

## Constants

Defined in `dateUtils.ts`:

```typescript
TIME_SLOTS = ['09:00', '10:00', '11:00', '17:00', '18:00', '19:00', '20:00']
MAX_CAPACITY = 4          // per time slot
PACKAGE_VALIDITY_DAYS = 35
```

---

## Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | email, name, activation_status, payment_status, password_hash |
| `user_packages` | Purchased packages | user_email, package_type, remaining_sessions, status |
| `reservations` | Booked sessions | user_email, date_key, time_slot, reservation_status |
| `redemption_codes` | Promo/bonus codes | code, email, used, expires_at |

### Legacy Table

| Table | Purpose | Notes |
|-------|---------|-------|
| `kv_store_b87b0c07` | Key-value store | Only for session tokens now |

### Table Relationships

```
users
  └── user_packages (1:many via user_email)
        └── reservations (1:many via package_id)

redemption_codes (standalone promo codes)
```

---

## Key Flows

### New User Flow

```
1. Select Package → 2. Fill Form → 3. Book First Session
                         ↓
4. Confirmation Email → Status: PENDING
                         ↓
5. Pay Cash in Studio → Admin clicks "Activate User"
                         ↓
6. Login Email (Magic Link) → 7. Set Password → 8. Dashboard
```

### User Activation Flow (Admin-Triggered)

```
Admin clicks "Activate User" button
         ↓
POST /activate { email }
         ↓
┌─────────────────────────────────────────┐
│ 1. users.activation_status = 'activated'│
│ 2. users.payment_status = 'paid'        │
│ 3. user_packages → activate pending     │
│ 4. reservations → confirm pending       │
│ 5. Send login email with Magic Link     │
└─────────────────────────────────────────┘
```

### Booking Flow (Existing User)

```
Login → Dashboard → Select Date/Time → Confirm
         ↓
POST /reservations (atomic RPC)
         ↓
┌─────────────────────────────────────────┐
│ 1. Check capacity (FOR UPDATE lock)    │
│ 2. Check for duplicates                │
│ 3. Validate package sessions           │
│ 4. Insert reservation                  │
│ 5. Decrement package sessions          │
└─────────────────────────────────────────┘
```

---

## Frontend Components

### Core Components

| Component | Purpose | Lines |
|-----------|---------|------:|
| MainApp.tsx | Screen routing, main state | ~300 |
| AdminPanel.tsx | Admin calendar & users | ~1200 |
| BookingScreen.tsx | Date/time selection | ~400 |
| PackageOverview.tsx | Package selection | ~900 |
| UserDashboard.tsx | User home screen | ~200 |

### Auth Components

| Component | Purpose |
|-----------|---------|
| LoginPage.tsx | User login |
| LoginRegisterModal.tsx | Login/register modal |
| PasswordSetupPage.tsx | First-time password setup |
| AdminLogin.tsx | Admin login |

### Booking Components

| Component | Purpose |
|-----------|---------|
| ConfirmationScreen.tsx | Booking confirmation form |
| TrainingTypeSelection.tsx | Training type selector |
| IndividualTraining.tsx | 1:1 training form |
| DuoTraining.tsx | DUO training form |

---

## Backend Structure

### Main File

`supabase/functions/make-server-b87b0c07/index.ts` (~3800 lines)

### Organization

```
Lines 1-500:      Imports, helpers, email functions
Lines 500-1200:   Package & coupon endpoints
Lines 1200-1700:  Reservation endpoints
Lines 1700-2000:  Admin endpoints
Lines 2000-2500:  Auth endpoints
Lines 2500-3000:  User endpoints
Lines 3000-3500:  Slots & utility endpoints
Lines 5500-5800:  Booking changes, re-engagement, logo upload
```

### Key Helpers

| Function | Purpose |
|----------|---------|
| `getSupabase()` | Get Supabase client |
| `normalizeEmail()` | Lowercase + trim email |
| `hashPassword()` | bcrypt hash |
| `verifyPassword()` | bcrypt verify |
| `sendEmail()` | Send via Resend |
| `sendLoginEmail()` | Login email with magic link |

---

## Email Templates

Supported languages: EN, SQ (Albanian), MK (Macedonian)

| Email | Trigger |
|-------|---------|
| Booking Confirmation | After package purchase |
| Activation/Login | After admin activates user |
| Re-engagement | Admin sends offer to archived users |
| Password Reset | User requests reset |

---

## Security

### Auth Flow

1. User registers/logs in → password verified against `users.password_hash`
2. Session token created in KV store (`session:*`)
3. Token sent to client, stored in localStorage
4. Subsequent requests include `X-Session-Token` header
5. Backend validates token against KV

### Admin Auth

- Separate login at `/admin`
- Admin credentials checked against hardcoded values (to be improved)

### Protected Routes

- All `/admin/*` routes require admin auth
- All `/user/*` routes require user session
- Public routes: `/health`, `/validate-coupon`, `/packages` (GET), `/slots/*`, `/auth/*`
