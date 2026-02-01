# Route Inventory

> **Purpose:** Authoritative list of endpoints and counts.
> **Read when:** Checking if masterplan is complete, or before changing routes.

Generated: 2026-02-01 (updated)

```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## All Routes (39 registrations, 38 unique)

| Line | Method | Route | Status |
|-----:|--------|-------|--------|
| 656 | GET | /health | N/A |
| 662 | POST | /validate-coupon | ✅ Supabase (+ waitlist_members) |
| 779 | POST | /packages | ✅ Phase 0C (+ waitlist bonus) |
| 1044 | POST | /packages/:id/first-session | ✅ Supabase |
| 1240 | GET | /packages | ✅ Phase 0C |
| 1299 | GET | /packages/:id | ✅ Phase 0C |
| 1357 | POST | /reservations | ✅ Phase 0D |
| 1512 | GET | /reservations | ✅ Phase 0D |
| 1574 | GET | /reservations/:id | ✅ Phase 0D |
| 1616 | PATCH | /reservations/:id/status | ✅ Phase 0D |
| 1727 | DELETE | /reservations/:id | ✅ Phase 0D |
| 1804 | POST | /activate | ✅ Phase 0E |
| 1926 | GET | /admin/users | ✅ Phase 0A |
| 2019 | PATCH | /admin/users/:email/payment | ✅ Phase 0B |
| 2087 | POST | /admin/resend-activation-code | ⬚ OBSOLETE (KV) |
| 2191 | GET | /bookings | ✅ Phase 0A |
| 2245 | POST | /bookings | ⬚ KV (duplicates /reservations) |
| 2379 | POST | /activate-member | ⬚ OBSOLETE (redirect) |
| 2386 | POST | /migrate-bookings | N/A (tool) |
| 2515 | GET | /admin/orphaned-packages | ⬚ KV (tool) |
| 2536 | GET | /admin/calendar | ✅ Phase 0A |
| 2615 | POST | /dev/clear-all-data | N/A (dev) |
| 2644 | POST | /dev/generate-mock-data | N/A (dev) |
| 2691 | POST | /auth/setup-password | ✅ Supabase (KV for tokens only) |
| 2792 | POST | /auth/register | ✅ Phase 0E |
| 2891 | POST | /auth/login | ✅ Phase 0E |
| 2959 | GET | /auth/verify | ✅ KV (sessions OK) |
| 3001 | POST | /auth/logout | ✅ KV (sessions OK) |
| 3022 | POST | /auth/admin/login | ✅ Supabase |
| 3067 | GET | /user/packages | ✅ Phase 0C |
| 3165 | POST | /user/packages/:id/reschedule | ⬚ KV (needs migration) |
| 3238 | GET | /debug/check-users | N/A (debug) |
| 3263 | POST | /waitlist | ✅ Phase 0B |
| 3326 | GET | /admin/waitlist | ✅ Phase 0A |
| 3367 | POST | /admin/waitlist/send-invite | ✅ Supabase |
| 3494 | GET | /waitlist/verify/:code | ✅ Supabase |
| 3536 | POST | /waitlist/redeem | ✅ Supabase |
| 3736 | DELETE | /admin/waitlist/:email | ✅ Phase 0B |
| 3780 | POST | /upload-logo | N/A (file) |

## Summary

| Status | Count |
|--------|------:|
| ✅ Migrated to Supabase | 26 |
| ⬚ Still using KV (needs migration) | 1 |
| ⬚ Obsolete (to remove) | 2 |
| ⬚ KV tools (to remove) | 2 |
| ✅ KV acceptable (sessions) | 2 |
| N/A (dev/debug/utility) | 5 |
| **Total unique** | **38** |

## Status Legend

- ✅ = Migrated to Supabase tables
- ✅ KV = KV usage acceptable (sessions/tokens only)
- ⬚ KV = Still using KV for domain data (needs migration)
- ⬚ OBSOLETE = Should be removed
- N/A = Dev/debug/utility route

## What's Left

### Must Migrate (1 endpoint)
- `POST /user/packages/:id/reschedule` - Uses KV for packages/reservations

### Should Remove (4 endpoints)
- `POST /admin/resend-activation-code` - Obsolete, uses KV
- `POST /activate-member` - Just redirects to /activate
- `POST /bookings` - Duplicates /reservations, uses KV
- `GET /admin/orphaned-packages` - Cleanup tool, uses KV

## Notes

1. Session endpoints (verify, logout) correctly use KV for ephemeral session data
2. Dev endpoints protected by ENABLE_DEV_ENDPOINTS env var
3. POST /auth/setup-password uses KV only for verification tokens (acceptable)
4. POST /packages/:id/first-session uses KV only for verification tokens (acceptable)
5. Duplicate /validate-coupon route was removed (commit b3e62cc)
