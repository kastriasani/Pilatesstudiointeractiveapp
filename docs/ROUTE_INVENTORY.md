# Route Inventory

> **Purpose:** Authoritative list of endpoints and counts.
> **Read when:** Checking if masterplan is complete, or before changing routes.

Generated: 2026-02-10

```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## All Routes (51 registrations)

| Line | Method | Route | Status |
|-----:|--------|-------|--------|
| 877 | GET | /health | N/A |
| 883 | POST | /validate-coupon | ✅ Supabase |
| 1000 | POST | /packages | ✅ Supabase |
| 1266 | POST | /packages/:id/first-session | ✅ Supabase |
| 1466 | GET | /packages | ✅ Supabase |
| 1525 | GET | /packages/:id | ✅ Supabase |
| 1583 | POST | /reservations | ✅ Supabase |
| 1797 | GET | /reservations | ✅ Supabase |
| 1859 | GET | /reservations/:id | ✅ Supabase |
| 1901 | PATCH | /reservations/:id/status | ✅ Supabase |
| 2071 | DELETE | /reservations/:id | ✅ Supabase |
| 2148 | POST | /activate | ✅ Supabase |
| 2272 | POST | /admin/users/:email/resend-login-email | ✅ Supabase |
| 2362 | GET | /admin/users | ✅ Supabase |
| 2472 | PATCH | /admin/users/:email/payment | ✅ Supabase |
| 2555 | PATCH | /admin/users/:email/adjust-sessions | ✅ Supabase |
| 2651 | DELETE | /users/:email | ✅ Supabase |
| 2745 | GET | /bookings | ✅ Supabase |
| 2808 | POST | /migrate-bookings | N/A (tool) |
| 2944 | GET | /admin/calendar | ✅ Supabase |
| 3024 | GET | /slots | ✅ Supabase |
| 3080 | GET | /slots/live-days | ✅ Supabase |
| 3104 | GET | /slots/availability | ✅ Supabase |
| 3173 | GET | /admin/slots | ✅ Supabase |
| 3227 | PATCH | /admin/days/:date/status | ✅ Supabase |
| 3301 | POST | /admin/slots | ✅ Supabase |
| 3361 | PATCH | /admin/slots/:id | ✅ Supabase |
| 3439 | DELETE | /admin/slots/:id | ✅ Supabase |
| 3538 | POST | /dev/clear-all-data | N/A (dev) |
| 3567 | POST | /dev/generate-mock-data | N/A (dev) |
| 3614 | POST | /auth/setup-password | ✅ Supabase |
| 3716 | POST | /auth/register | ✅ Supabase |
| 3816 | POST | /auth/login | ✅ Supabase |
| 3885 | GET | /auth/verify | ✅ KV (sessions) |
| 3917 | POST | /auth/logout | ✅ KV (sessions) |
| 3938 | POST | /auth/admin/login | ✅ Supabase |
| 3984 | PATCH | /user/language | ✅ Supabase |
| 4024 | GET | /user/packages | ✅ Supabase |
| 4185 | POST | /user/packages/:id/reschedule | ✅ Supabase |
| 4310 | POST | /user/packages/:id/book-session | ✅ Supabase |
| 4446 | DELETE | /user/packages/:id/reservations/:reservationId | ✅ Supabase |
| 4575 | GET | /debug/check-users | N/A (debug) |
| 4601 | POST | /admin/sync-user-sessions | ✅ Supabase |
| 4663 | POST | /waitlist | ✅ Supabase |
| 4726 | GET | /admin/waitlist | ✅ Supabase |
| 4767 | POST | /admin/waitlist/send-invite | ✅ Supabase |
| 4895 | POST | /admin/archived-users/send-email | ✅ Supabase |
| 4965 | GET | /waitlist/verify/:code | ✅ Supabase |
| 5007 | POST | /waitlist/redeem | ✅ Supabase |
| 5213 | DELETE | /admin/waitlist/:email | ✅ Supabase |
| 5283 | POST | /upload-logo | N/A (file) |

## Summary

| Status | Count |
|--------|------:|
| ✅ Migrated to Supabase | 43 |
| ✅ KV acceptable (sessions) | 2 |
| N/A (dev/debug/utility) | 6 |
| **Total** | **51** |

## Removed Endpoints

The following obsolete endpoints were removed:
- `POST /admin/resend-activation-code` - Used KV, obsolete activation flow
- `POST /activate-member` - Just redirected to /activate
- `POST /bookings` - Duplicated /reservations, used KV
- `GET /admin/orphaned-packages` - Cleanup tool, used KV

## Status Legend

- ✅ Supabase = Uses Supabase for all domain data
- ✅ KV = KV usage acceptable (sessions/tokens only)
- N/A = Dev/debug/utility route (not production)

## Notes

1. All 27 production endpoints now use Supabase for domain data
2. KV is only used for ephemeral session tokens (acceptable)
3. Dev endpoints protected by ENABLE_DEV_ENDPOINTS env var
4. Migration complete - no further work needed
