# Route Inventory

> **Purpose:** Authoritative list of all backend endpoints.
> **Read when:** Checking endpoint coverage or before adding/changing routes.
> **Auto-regenerate:** `npm run api:manifest` updates `docs/generated/api-manifest.json`.

Last updated: 2026-03-02 (post waitlist removal)

## All Routes (54 registrations, 49 unique paths)

| Line | Method | Path | Auth |
|-----:|--------|------|------|
| 2220 | POST | `/activate` | Public |
| 5676 | POST | `/admin/archived-users/send-email` | Admin |
| 5595 | GET | `/admin/booking-changes` | Admin |
| 5649 | POST | `/admin/booking-changes/archive` | Admin |
| 3472 | GET | `/admin/calendar` | Admin |
| 4065 | POST | `/admin/cancel-class` | Admin |
| 2750 | GET | `/admin/consistency-check` | Admin |
| 3755 | PATCH | `/admin/days/:date/status` | Admin |
| 2447 | GET | `/admin/login-requests` | Admin |
| 2504 | POST | `/admin/login-requests/:id/approve` | Admin |
| 2595 | POST | `/admin/login-requests/:id/dismiss` | Admin |
| 3701 | GET | `/admin/slots` | Admin |
| 3829 | POST | `/admin/slots` | Admin |
| 3967 | DELETE | `/admin/slots/:id` | Admin |
| 3889 | PATCH | `/admin/slots/:id` | Admin |
| 5534 | POST | `/admin/sync-user-sessions` | Admin |
| 2624 | GET | `/admin/users` | Admin |
| 3091 | PATCH | `/admin/users/:email/adjust-sessions` | Admin |
| 3008 | PATCH | `/admin/users/:email/payment` | Admin |
| 2359 | POST | `/admin/users/:email/resend-login-email` | Admin |
| 4670 | POST | `/auth/admin/login` | Public |
| 4538 | POST | `/auth/login` | Public |
| 4649 | POST | `/auth/logout` | Public |
| 4371 | POST | `/auth/register` | Public |
| 4471 | POST | `/auth/request-login` | Public |
| 4263 | POST | `/auth/setup-password` | Public |
| 4613 | GET | `/auth/verify` | Public |
| 3272 | GET | `/bookings` | Admin |
| 5508 | GET | `/debug/check-users` | Dev |
| 4187 | POST | `/dev/clear-all-data` | Dev |
| 4216 | POST | `/dev/generate-mock-data` | Dev |
| 861 | GET | `/health` | Public |
| 3336 | POST | `/migrate-bookings` | Admin |
| 1403 | GET | `/packages` | Public |
| 946 | POST | `/packages` | Public |
| 1462 | GET | `/packages/:id` | Public |
| 1209 | POST | `/packages/:id/first-session` | Public |
| 1744 | GET | `/reservations` | Public |
| 1520 | POST | `/reservations` | Public |
| 2105 | DELETE | `/reservations/:id` | Public |
| 1811 | GET | `/reservations/:id` | Public |
| 1858 | PATCH | `/reservations/:id/status` | Public |
| 3552 | GET | `/slots` | Public |
| 3632 | GET | `/slots/availability` | Public |
| 3608 | GET | `/slots/live-days` | Public |
| 5746 | POST | `/upload-logo` | Public |
| 5873 | POST | `/user/upload-avatar` | User |
| 4716 | PATCH | `/user/language` | User |
| 4756 | GET | `/user/packages` | User |
| 5233 | POST | `/user/packages/:id/book-session` | User |
| 4917 | POST | `/user/packages/:id/reschedule` | User |
| 5379 | DELETE | `/user/packages/:id/reservations/:reservationId` | User |
| 5068 | POST | `/user/packages/purchase` | User |
| 3188 | DELETE | `/users/:email` | Admin |
| 867 | POST | `/validate-coupon` | Public |

## Auth Legend

- **Admin** = Requires `verifyAdminSession(c)`
- **User** = Requires `verifyUserSession(c)`
- **Public** = No auth required (uses anon key)
- **Dev** = Protected by `ENABLE_DEV_ENDPOINTS` env var
