# WellNest Pilates KV → Supabase Migration Masterplan

> **Purpose:** Single source of truth for migration work.
> **Read when:** Doing backend migration or deciding next tasks.

## Current Status

- **Migration progress:** 26/30 endpoints (87%)
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

### Phase 0F: First Session & Auth ✅ COMPLETE

| Endpoint | Commit | Notes |
|----------|--------|-------|
| POST /packages/:id/first-session | (already migrated) | Supabase for domain data, KV for tokens only |
| POST /auth/setup-password | (already migrated) | Supabase for users, KV for tokens/sessions |

### Phase 0G: Waitlist Endpoints ✅ COMPLETE

| Endpoint | Commit | Notes |
|----------|--------|-------|
| POST /admin/waitlist/send-invite | b3e62cc | Fully Supabase |
| POST /waitlist/redeem | b3e62cc | Fully Supabase |
| GET /waitlist/verify/:code | (already migrated) | Supabase |

---

## Remaining Phases

### Phase 0H: Reschedule ⬚ PENDING

| Endpoint | Current | Target | Priority |
|----------|---------|--------|----------|
| POST /user/packages/:id/reschedule | KV | Supabase | MEDIUM |

This is the **only remaining endpoint** that needs migration.

### Phase 0I: Cleanup & Removal ⬚ PENDING

| Endpoint | Action | Notes |
|----------|--------|-------|
| POST /admin/resend-activation-code | REMOVE | Obsolete, uses KV |
| POST /activate-member | REMOVE | Just redirects to /activate |
| POST /migrate-bookings | REMOVE | One-time migration tool |
| GET /admin/orphaned-packages | REMOVE | Cleanup tool, uses KV |
| POST /bookings | REMOVE or MIGRATE | Duplicates /reservations, uses KV |

---

## KV Usage Remaining

Endpoints still using `kv.*` calls for **domain data**:

| Endpoint | KV Calls | Action |
|----------|----------|--------|
| POST /user/packages/:id/reschedule | kv.get, kv.set | **MIGRATE** |
| POST /admin/resend-activation-code | kv.getByPrefix, kv.get | REMOVE |
| POST /bookings | kv.getByPrefix, kv.set | REMOVE/MIGRATE |
| GET /admin/orphaned-packages | kv.getByPrefix | REMOVE |
| GET /debug/check-users | kv.getByPrefix | N/A (debug) |

**Acceptable KV usage** (sessions/tokens only):

| Endpoint | KV Calls | Status |
|----------|----------|--------|
| POST /packages/:id/first-session | kv.set (verification_token) | ✅ OK |
| POST /auth/setup-password | kv.get/set (tokens, sessions) | ✅ OK |
| GET /auth/verify | kv.get (session) | ✅ OK |
| POST /auth/logout | kv.del (session) | ✅ OK |

**Allowed KV usage:** Session tokens (`session:*`), verification tokens (`verification_token:*`)
**Forbidden:** Domain data (user, package, reservation, waitlist)

---

## Definition of Complete

1. ✅ Every route in index.ts is in this plan
2. ⬚ No KV writes for domain data prefixes (1 endpoint remaining)
3. ⬚ Backfill completed and validated
4. ⬚ Contract tests exist and pass

---

## Known Bugs (Fixed)

| Bug | Status |
|-----|--------|
| Duplicate /validate-coupon | ✅ Fixed (b3e62cc) |
| Waitlist codes not validated in /packages | ✅ Fixed (b3e62cc) |
| Waitlist redeem gave 8 sessions instead of 9 | ✅ Fixed (480a41e) |

## Remaining Cleanup

| Item | Location | Priority |
|------|----------|----------|
| POST /admin/resend-activation-code | index.ts:2087 | LOW (remove) |
| POST /activate-member | index.ts:2379 | LOW (remove) |
| POST /bookings | index.ts:2245 | LOW (remove or migrate) |
| GET /admin/orphaned-packages | index.ts:2515 | LOW (remove) |
