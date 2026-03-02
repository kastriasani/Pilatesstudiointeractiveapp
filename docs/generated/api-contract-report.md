# API Contract Report

Generated: 2026-03-02T13:06:08.525Z

## Summary

- Status: WARN
- Backend unique paths: 55
- Frontend unique paths: 45
- Docs unique paths: 55

## Frontend Paths Missing In Backend

- /debug/coupons

## Docs Paths Missing In Backend

- /activate-member
- /admin/clear-packages
- /admin/clear-reservations
- /admin/complete-orphaned-package
- /admin/export-data
- /admin/orphaned-packages
- /admin/recalculate-package-sessions
- /admin/resend-activation-code
- /admin/resend-activation-email
- /admin/send-activation-code
- /bookings/:id
- /bookings/:id/status
- /clear-data
- /debug/coupons
- /endpoint
- /mock-data/gen
- /mock-data/generate
- /packages/:id/activate
- /packages/:id/first
- /payments
- /payments/:id
- /reservations/:id/cancel
- /reservations/:id/reschedule
- /webhooks/resend

## Backend Paths Not Used By Frontend

- /admin/calendar
- /admin/consistency-check
- /admin/sync-user-sessions
- /auth/logout
- /auth/register
- /auth/verify
- /health
- /migrate-bookings
- /packages/:id
- /waitlist/redeem
- /waitlist/verify/:code

## Backend Paths Missing In Docs

- /admin/archived-users/send-email
- /admin/booking-changes
- /admin/booking-changes/archive
- /admin/cancel-class
- /admin/consistency-check
- /admin/days/:date/status
- /admin/login-requests
- /admin/login-requests/:id/approve
- /admin/login-requests/:id/dismiss
- /admin/slots
- /admin/slots/:id
- /admin/sync-user-sessions
- /admin/users/:email/adjust-sessions
- /admin/users/:email/resend-login-email
- /auth/admin/login
- /auth/request-login
- /slots
- /slots/availability
- /slots/live-days
- /upload-logo
- /user/language
- /user/packages/:id/book-session
- /user/packages/:id/reservations/:reservationId
- /user/packages/purchase
- /users/:email

> This check is non-blocking by default. Use `--strict` to exit with code 1 on WARN.
