# Route Inventory

Source of truth for all registered routes in the backend.

Generated with:
```bash
rg -n 'app\.(get|post|patch|delete)\(' supabase/functions/make-server-b87b0c07/index.ts
```

## All Routes (39 total)

| Line | Method | Route | Migration Status |
|------|--------|-------|------------------|
| 526 | GET | /health | N/A (no data) |
| 532 | POST | /validate-coupon | ✅ Uses Supabase |
| 577 | POST | /validate-coupon | ⚠️ Duplicate |
| 656 | POST | /packages | ✅ Phase 0C |
| 885 | POST | /packages/:id/first-session | ⬚ KV |
| 1046 | GET | /packages | ✅ Phase 0C |
| 1105 | GET | /packages/:id | ✅ Phase 0C |
| 1163 | POST | /reservations | ⬚ KV - Phase 0D |
| 1440 | GET | /reservations | ⬚ KV |
| 1473 | GET | /reservations/:id | ⬚ KV |
| 1489 | PATCH | /reservations/:id/status | ⬚ KV - Phase 0D |
| 1562 | DELETE | /reservations/:id | ⬚ KV - Phase 0D |
| 1604 | POST | /activate | ⬚ KV - Phase 0E |
| 1701 | GET | /admin/users | ✅ Phase 0A |
| 1788 | PATCH | /admin/users/:email/payment | ✅ Phase 0B |
| 1850 | POST | /admin/resend-activation-code | ⬚ KV |
| 1948 | GET | /bookings | ✅ Phase 0A |
| 2002 | POST | /bookings | ⬚ KV |
| 2136 | POST | /activate-member | ⬚ KV |
| 2143 | POST | /migrate-bookings | ⬚ Admin tool |
| 2272 | GET | /admin/orphaned-packages | ⬚ KV |
| 2293 | GET | /admin/calendar | ✅ Phase 0A |
| 2366 | POST | /dev/clear-all-data | N/A (dev only) |
| 2395 | POST | /dev/generate-mock-data | N/A (dev only) |
| 2441 | POST | /auth/setup-password | ⬚ KV - Phase 0E |
| 2523 | POST | /auth/register | ⬚ KV - Phase 0E |
| 2581 | POST | /auth/login | ⬚ KV - Phase 0E |
| 2642 | GET | /auth/verify | ⬚ KV (sessions OK) |
| 2684 | POST | /auth/logout | ⬚ KV (sessions OK) |
| 2704 | GET | /user/packages | ✅ Phase 0C |
| 2802 | POST | /user/packages/:id/reschedule | ⬚ KV |
| 2875 | GET | /debug/check-users | N/A (debug) |
| 2900 | POST | /waitlist | ✅ Phase 0B |
| 2963 | GET | /admin/waitlist | ✅ Phase 0A |
| 2998 | POST | /admin/waitlist/send-invite | ✅ Uses Supabase |
| 3413 | GET | /waitlist/verify/:code | ✅ Uses Supabase |
| 3450 | POST | /waitlist/redeem | ✅ Uses Supabase |
| 3592 | DELETE | /admin/waitlist/:email | ✅ Phase 0B |
| 3630 | POST | /upload-logo | N/A (file upload) |

## Summary

| Status | Count |
|--------|-------|
| ✅ Migrated | 15 |
| ⬚ KV (needs migration) | 14 |
| N/A (dev/debug/no data) | 6 |
| ⚠️ Duplicate | 1 |
| **Total** | **36 unique** |

## Notes
- Line 577 is a duplicate of line 532 (validate-coupon)
- Session endpoints (/auth/verify, /auth/logout) can stay on KV
- Dev endpoints are protected by ENABLE_DEV_ENDPOINTS env var
