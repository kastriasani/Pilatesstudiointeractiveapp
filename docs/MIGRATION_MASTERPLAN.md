# WellNest Pilates KV → Supabase Migration Masterplan

> **Purpose:** Single source of truth for migration work.
> **Read when:** Doing backend migration or deciding next tasks.

## Current Status

- **Migration progress:** 21/30 endpoints (70%)
- **Project ref:** azqkguctispoctvmpmci
- **Excluded:** 6 routes (dev/debug/utility)
- **See:** docs/ROUTE_INVENTORY.md for full list

## Source of Truth

All routes must match those registered in:
- `supabase/functions/make-server-b87b0c07/index.ts`

Verification command:
```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## Database Tables

| Table | Records | Status | Used By |
|-------|--------:|--------|---------|
| users | 11+ | ✅ active | admin/users, packages, auth |
| reservations | 12+ | ✅ active | admin/calendar, bookings |
| waitlist_members | 104 | ✅ active | admin/waitlist |
| redemption_codes | 103 | ✅ active | coupon validation |
| user_packages | active | ✅ active | package management |
| kv_store_b87b0c07 | legacy | ⚠️ legacy | sessions only |

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

| Endpoint | Commit | Notes |
|----------|--------|-------|
| POST /reservations | 5281960 | Atomic RPC |
| GET /reservations | 5281960 | Supabase select |
| GET /reservations/:id | 5281960 | Supabase select |
| PATCH /reservations/:id/status | 5281960 | + user_packages |
| DELETE /reservations/:id | 5281960 | + restore sessions |

Migration file: `supabase/migrations/20260131_create_reservation_rpc.sql`

### Phase 0E: Auth & Activation ✅ COMPLETE

| Endpoint | Commit | Notes |
|----------|--------|-------|
| POST /activate | 66e22c7 | Admin-triggered, no code |
| POST /auth/register | 66e22c7 | Supabase users table |
| POST /auth/login | 66e22c7 | Supabase users table |

Additional commits:
- 327428e: Critical bug fixes (dynamic dates, fetchUsers)
- 1cdb283: Centralized date utilities

---

## Remaining Phases

### Phase 0F: First Session & Reschedule ⬚ PENDING

| Endpoint | Current | Target |
|----------|---------|--------|
| POST /packages/:id/first-session | KV | Supabase |
| POST /user/packages/:id/reschedule | KV | Supabase |

### Phase 0G: Auth Completion ⬚ PENDING

| Endpoint | Current | Target |
|----------|---------|--------|
| POST /auth/setup-password | KV | Supabase |
| GET /auth/verify | KV | OK (sessions) |
| POST /auth/logout | KV | OK (sessions) |

### Phase 0H: Cleanup & Removal ⬚ PENDING

| Endpoint | Action |
|----------|--------|
| POST /admin/resend-activation-code | REMOVE (obsolete) |
| POST /activate-member | REMOVE (obsolete) |
| POST /validate-coupon (line 626) | REMOVE (duplicate) |
| POST /migrate-bookings | REMOVE (one-time tool) |
| GET /admin/orphaned-packages | REMOVE (cleanup tool) |

### Phase 0I: Remaining KV Endpoints ⬚ PENDING

| Endpoint | Priority |
|----------|----------|
| POST /bookings | LOW (may duplicate /reservations) |
| POST /admin/waitlist/send-invite | MEDIUM |
| POST /waitlist/redeem | MEDIUM |

---

## KV Usage Remaining

Endpoints still using `kv.*` calls:

| Endpoint | KV Calls | Notes |
|----------|----------|-------|
| POST /packages/:id/first-session | kv.get, kv.set | HIGH priority |
| POST /auth/setup-password | kv.get, kv.set | HIGH priority |
| POST /user/packages/:id/reschedule | kv.get, kv.set | MEDIUM |
| POST /admin/resend-activation-code | kv.getByPrefix | REMOVE |
| POST /bookings | kv.getByPrefix, kv.set | LOW |
| POST /activate-member | kv.get | REMOVE |
| GET /admin/orphaned-packages | kv.getByPrefix | REMOVE |
| POST /admin/waitlist/send-invite | kv.get, kv.set | MEDIUM |
| POST /waitlist/redeem | kv.get, kv.set | MEDIUM |
| GET /debug/check-users | kv.getByPrefix | N/A (debug) |
| GET /auth/verify | kv.get | OK (sessions) |
| POST /auth/logout | kv.del | OK (sessions) |

**Allowed KV usage:** Session tokens only (`session:*`)
**Forbidden:** Domain data (user, package, reservation, waitlist)

---

## Definition of Complete

1. ✅ Every route in index.ts is in this plan
2. ⬚ No KV writes for domain data prefixes
3. ⬚ Backfill completed and validated
4. ⬚ Contract tests exist and pass

---

## Known Bugs

| Bug | Location | Status |
|-----|----------|--------|
| Duplicate /validate-coupon | index.ts:581,626 | ⬚ To fix in 0H |
| POST /admin/resend-activation-code | index.ts:1928 | ⬚ To remove in 0H |
| POST /activate-member | index.ts:2214 | ⬚ To remove in 0H |
