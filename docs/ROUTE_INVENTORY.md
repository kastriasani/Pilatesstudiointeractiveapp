# Route Inventory

> **Purpose:** Authoritative list of endpoints and counts.
> **Read when:** Checking if masterplan is complete, or before changing routes.

Generated: 2026-02-01 (final)

```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## All Routes (35 registrations)

| Line | Method | Route | Status |
|-----:|--------|-------|--------|
| 656 | GET | /health | N/A |
| 662 | POST | /validate-coupon | ✅ Supabase |
| 779 | POST | /packages | ✅ Supabase |
| 1044 | POST | /packages/:id/first-session | ✅ Supabase |
| 1240 | GET | /packages | ✅ Supabase |
| 1299 | GET | /packages/:id | ✅ Supabase |
| 1357 | POST | /reservations | ✅ Supabase |
| 1512 | GET | /reservations | ✅ Supabase |
| 1574 | GET | /reservations/:id | ✅ Supabase |
| 1616 | PATCH | /reservations/:id/status | ✅ Supabase |
| 1727 | DELETE | /reservations/:id | ✅ Supabase |
| 1804 | POST | /activate | ✅ Supabase |
| 1926 | GET | /admin/users | ✅ Supabase |
| 2019 | PATCH | /admin/users/:email/payment | ✅ Supabase |
| 2089 | GET | /bookings | ✅ Supabase |
| 2145 | POST | /migrate-bookings | N/A (tool) |
| 2275 | GET | /admin/calendar | ✅ Supabase |
| 2354 | POST | /dev/clear-all-data | N/A (dev) |
| 2383 | POST | /dev/generate-mock-data | N/A (dev) |
| 2430 | POST | /auth/setup-password | ✅ Supabase |
| 2531 | POST | /auth/register | ✅ Supabase |
| 2630 | POST | /auth/login | ✅ Supabase |
| 2698 | GET | /auth/verify | ✅ KV (sessions) |
| 2740 | POST | /auth/logout | ✅ KV (sessions) |
| 2761 | POST | /auth/admin/login | ✅ Supabase |
| 2806 | GET | /user/packages | ✅ Supabase |
| 2905 | POST | /user/packages/:id/reschedule | ✅ Supabase |
| 3016 | GET | /debug/check-users | N/A (debug) |
| 3041 | POST | /waitlist | ✅ Supabase |
| 3104 | GET | /admin/waitlist | ✅ Supabase |
| 3145 | POST | /admin/waitlist/send-invite | ✅ Supabase |
| 3272 | GET | /waitlist/verify/:code | ✅ Supabase |
| 3314 | POST | /waitlist/redeem | ✅ Supabase |
| 3514 | DELETE | /admin/waitlist/:email | ✅ Supabase |
| 3558 | POST | /upload-logo | N/A (file) |

## Summary

| Status | Count |
|--------|------:|
| ✅ Migrated to Supabase | 27 |
| ✅ KV acceptable (sessions) | 2 |
| N/A (dev/debug/utility) | 5 |
| **Total** | **34** |

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
