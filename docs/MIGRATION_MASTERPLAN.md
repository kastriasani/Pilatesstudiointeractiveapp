# WellNest Pilates KV -> Supabase Migration Masterplan

## Current status
- Migration progress: 16/30 endpoints (53%)
- Project ref: azqkguctispoctvmpmci
- 6 routes excluded (dev/debug/utility)
- See: docs/ROUTE_INVENTORY.md for full list

## Known bugs
- **BUG:** /validate-coupon is registered twice (lines 532 and 577) - remove duplicate

## Source of truth
All routes must match those registered in:
- supabase/functions/make-server-b87b0c07/index.ts

Verification command:
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts

## Tables
| Table | Records | Status | Used By |
|---|---:|---|---|
| users | 11+ | active | admin/users, packages, auth |
| reservations | 12+ | active | admin/calendar, bookings |
| waitlist_members | 104 | active | admin/waitlist |
| redemption_codes | 103 | active | coupon validation |
| user_packages | 0 | active | package management |
| kv_store_b87b0c07 | legacy | legacy | sessions, payments |
| user_bookings | 0 | unused | - |

## Phases

### Phase 0A Read endpoints ✅ COMPLETE
| Endpoint | Commit |
|----------|--------|
| GET /admin/waitlist | 7a7eb65 |
| GET /admin/users | 5dbecb4 |
| GET /bookings | c7cbb0b |
| GET /admin/calendar | e490f8a |

### Phase 0B Write endpoints ✅ COMPLETE
| Endpoint | Commit |
|----------|--------|
| POST /waitlist | cd4c3eb |
| DELETE /admin/waitlist/:email | cd4c3eb |
| PATCH /admin/users/:email/payment | cd4c3eb |

### Phase 0C Package endpoints ✅ COMPLETE
| Endpoint | Commit |
|----------|--------|
| POST /packages | a1f93eb |
| GET /packages | a1f93eb |
| GET /packages/:id | a1f93eb |
| GET /user/packages | a1f93eb |

### Phase 0D Reservation write endpoints ✅ COMPLETE
| Endpoint | Notes |
|----------|-------|
| POST /reservations | Atomic RPC (create_reservation) |
| GET /reservations | Supabase select with filters |
| GET /reservations/:id | Supabase select single |
| PATCH /reservations/:id/status | Supabase update + user_packages |
| DELETE /reservations/:id | Supabase delete + restore package sessions |

Migration file: `supabase/migrations/20260131_create_reservation_rpc.sql`

Atomicity solved via Postgres RPC with FOR UPDATE locking:
- Capacity check + write is atomic
- Duplicate booking check is atomic
- Package session decrement is atomic

### Phase 0E Auth and activation ⬚ PENDING
| Endpoint | Target Table |
|----------|--------------|
| POST /auth/register | users |
| POST /auth/login | users |
| /auth/verify | VERIFY IN CODE (GET or POST), KV sessions ok |
| POST /auth/setup-password | users |
| POST /activate | users + user_packages |

### Phase 0F-J Remaining endpoints ⬚ PENDING
- First session booking
- User dashboard
- Admin actions
- Schedule config
- Payments

### Phase 0K Data backfill ⬚ PENDING
KV prefix to table mapping:
- user: → users
- package: → user_packages
- reservation: → reservations
- waitlist: → waitlist_members

### Phase 0L KV decommission rules
Allowed: temporary tokens only (session:, payment:token:)
Forbidden: domain writes for user, reservation, package, waitlist

### Phase 0M Contract tests ⬚ PENDING
Rule: phase is not complete unless tests pass

## Definition of complete
1. Every registered route in make-server-b87b0c07/index.ts is in this plan
2. No KV writes for domain data prefixes
3. Backfill completed and validated
4. Contract tests exist and pass

## Phase 2: Future Improvements (Post-Migration)

### Supabase Auth Migration
Target: Replace custom auth with Supabase Auth for better security

Benefits:
- Built-in Magic Links
- Secure password hashing (bcrypt)
- Session management
- Rate limiting
- Optional MFA

Scope:
- POST /auth/register → Supabase Auth signUp
- POST /auth/login → Supabase Auth signInWithPassword or signInWithOtp
- GET /auth/verify → Supabase Auth getSession
- POST /auth/logout → Supabase Auth signOut
- Remove custom session tokens from KV

Priority: After Phase 0 complete
Estimated effort: 2-4 hours
