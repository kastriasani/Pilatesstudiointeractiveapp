# WellNest Pilates KV → Supabase Migration Masterplan

> **Purpose:** Single source of truth for migration work.
> **Read when:** Doing backend migration or deciding next tasks.

## Current Status

- **Migration progress:** 27/27 endpoints (100%) ✅ COMPLETE
- **Project ref:** azqkguctispoctvmpmci
- **KV Usage:** Sessions/tokens only (acceptable)

## Source of Truth

All routes are registered in:
- `supabase/functions/make-server-b87b0c07/index.ts`

Verification command:
```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## Database Tables

| Table | Status | Used By |
|-------|--------|---------|
| users | ✅ active | admin/users, packages, auth |
| reservations | ✅ active | admin/calendar, bookings |
| waitlist_members | ✅ active | admin/waitlist, coupon validation |
| redemption_codes | ✅ active | coupon validation |
| user_packages | ✅ active | package management |
| kv_store_b87b0c07 | ⚠️ sessions only | auth tokens |

---

## Completed Phases

### Phase 0A: Read Endpoints ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| GET /admin/waitlist | 7a7eb65 |
| GET /admin/users | 5dbecb4 |
| GET /bookings | c7cbb0b |
| GET /admin/calendar | e490f8a |

### Phase 0B: Write Endpoints ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /waitlist | cd4c3eb |
| DELETE /admin/waitlist/:email | cd4c3eb |
| PATCH /admin/users/:email/payment | cd4c3eb |

### Phase 0C: Package Endpoints ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /packages | a1f93eb |
| GET /packages | a1f93eb |
| GET /packages/:id | a1f93eb |
| GET /user/packages | a1f93eb |

### Phase 0D: Reservation Endpoints ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /reservations | 5281960 |
| GET /reservations | 5281960 |
| GET /reservations/:id | 5281960 |
| PATCH /reservations/:id/status | 5281960 |
| DELETE /reservations/:id | 5281960 |

### Phase 0E: Auth & Activation ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /activate | 66e22c7 |
| POST /auth/register | 66e22c7 |
| POST /auth/login | 66e22c7 |

### Phase 0F: First Session & Auth ✅ COMPLETE

| Endpoint | Notes |
|----------|-------|
| POST /packages/:id/first-session | Supabase for domain data |
| POST /auth/setup-password | Supabase for users |

### Phase 0G: Waitlist Endpoints ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /admin/waitlist/send-invite | b3e62cc |
| POST /waitlist/redeem | b3e62cc |
| GET /waitlist/verify/:code | (migrated) |

### Phase 0H: Reschedule ✅ COMPLETE

| Endpoint | Commit |
|----------|--------|
| POST /user/packages/:id/reschedule | (this commit) |

### Phase 0I: Cleanup ✅ COMPLETE

Removed obsolete endpoints:
- POST /admin/resend-activation-code (used KV)
- POST /activate-member (just redirected)
- POST /bookings (duplicated /reservations, used KV)
- GET /admin/orphaned-packages (cleanup tool, used KV)

---

## KV Usage (Acceptable)

Only session/token data remains in KV:

| Endpoint | KV Calls | Status |
|----------|----------|--------|
| POST /packages/:id/first-session | verification_token | ✅ OK |
| POST /auth/setup-password | tokens, sessions | ✅ OK |
| GET /auth/verify | session | ✅ OK |
| POST /auth/logout | session | ✅ OK |

**Allowed:** `session:*`, `verification_token:*`
**Forbidden:** Domain data (user, package, reservation, waitlist)

---

## Definition of Complete ✅

1. ✅ Every route in index.ts is in this plan
2. ✅ No KV writes for domain data prefixes
3. ✅ All domain data in Supabase tables
4. ⬚ Contract tests exist and pass (optional)

---

## Migration Complete!

All 27 production endpoints now use Supabase for domain data.
KV store is only used for ephemeral session toke