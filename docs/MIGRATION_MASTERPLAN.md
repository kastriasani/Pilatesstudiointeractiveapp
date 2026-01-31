# WellNest Pilates KV -> Supabase Migration Masterplan

## Current status
- Migration progress: 11/30 endpoints (37%)
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

### Phase 0D Reservation write endpoints ⬚ NEXT
Scope:
- POST /reservations
- DELETE /reservations/:id
- PATCH /reservations/:id
- PATCH /reservations/:id/status

Rule: Reservation creation must be atomic for capacity and duplicates. Implement with transaction or Postgres RPC.

Acceptance:
- writes go to reservations table only
- no kv writes for reservation prefix
- tests pass

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
