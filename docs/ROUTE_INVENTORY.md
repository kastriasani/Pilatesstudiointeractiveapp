# Route Inventory

> **Purpose:** Authoritative list of endpoints and counts.
> **Read when:** Checking if masterplan is complete, or before changing routes.

Generated: 2026-02-01

```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## All Routes (39 registrations, 38 unique)

| Line | Method | Route | Status |
|-----:|--------|-------|--------|
| 575 | GET | /health | N/A |
| 581 | POST | /validate-coupon | ✅ Supabase |
| 626 | POST | /validate-coupon | ⚠️ DUPLICATE |
| 705 | POST | /packages | ✅ Phase 0C |
| 934 | POST | /packages/:id/first-session | ⬚ KV |
| 1095 | GET | /packages | ✅ Phase 0C |
| 1154 | GET | /packages/:id | ✅ Phase 0C |
| 1212 | POST | /reservations | ✅ Phase 0D |
| 1371 | GET | /reservations | ✅ Phase 0D |
| 1433 | GET | /reservations/:id | ✅ Phase 0D |
| 1475 | PATCH | /reservations/:id/status | ✅ Phase 0D |
| 1586 | DELETE | /reservations/:id | ✅ Phase 0D |
| 1663 | POST | /activate | ✅ Phase 0E |
| 1779 | GET | /admin/users | ✅ Phase 0A |
| 1866 | PATCH | /admin/users/:email/payment | ✅ Phase 0B |
| 1928 | POST | /admin/resend-activation-code | ⬚ OBSOLETE |
| 2026 | GET | /bookings | ✅ Phase 0A |
| 2080 | POST | /bookings | ⬚ KV |
| 2214 | POST | /activate-member | ⬚ OBSOLETE |
| 2221 | POST | /migrate-bookings | N/A (tool) |
| 2350 | GET | /admin/orphaned-packages | ⬚ KV (tool) |
| 2371 | GET | /admin/calendar | ✅ Phase 0A |
| 2444 | POST | /dev/clear-all-data | N/A (dev) |
| 2473 | POST | /dev/generate-mock-data | N/A (dev) |
| 2519 | POST | /auth/setup-password | ⬚ KV |
| 2602 | POST | /auth/register | ✅ Phase 0E |
| 2701 | POST | /auth/login | ✅ Phase 0E |
| 2769 | GET | /auth/verify | ⬚ KV (ok) |
| 2811 | POST | /auth/logout | ⬚ KV (ok) |
| 2831 | GET | /user/packages | ✅ Phase 0C |
| 2929 | POST | /user/packages/:id/reschedule | ⬚ KV |
| 3002 | GET | /debug/check-users | N/A (debug) |
| 3027 | POST | /waitlist | ✅ Phase 0B |
| 3090 | GET | /admin/waitlist | ✅ Phase 0A |
| 3125 | POST | /admin/waitlist/send-invite | ⬚ KV |
| 3540 | GET | /waitlist/verify/:code | ✅ Supabase |
| 3577 | POST | /waitlist/redeem | ⬚ KV |
| 3719 | DELETE | /admin/waitlist/:email | ✅ Phase 0B |
| 3757 | POST | /upload-logo | N/A (file) |

## Summary

| Status | Count |
|--------|------:|
| ✅ Migrated to Supabase | 21 |
| ⬚ Still using KV | 9 |
| ⬚ Obsolete (to remove) | 2 |
| ⚠️ Duplicate | 1 |
| N/A (dev/debug/utility) | 5 |
| **Total unique** | **38** |

## Status Legend

- ✅ = Migrated to Supabase tables
- ⬚ = Still using KV store
- ⬚ (ok) = KV usage acceptable (sessions)
- ⚠️ = Bug/duplicate to fix
- N/A = Dev/debug/utility route

## Notes

1. Line 626 is a duplicate of line 581 (/validate-coupon) - remove
2. Session endpoints (verify, logout) can stay on KV
3. Dev endpoints protected by ENABLE_DEV_ENDPOINTS env var
4. POST /admin/resend-activation-code is obsolete (activation flow changed)
5. POST /activate-member is obsolete (activation flow changed)
