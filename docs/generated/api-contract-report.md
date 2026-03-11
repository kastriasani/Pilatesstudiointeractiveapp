# API Contract Report

Generated: 2026-03-11T12:17:23.580Z

## Summary

- Status: PASS
- Backend unique paths: 52
- Frontend unique paths: 45
- Docs unique paths: 12

## Frontend Paths Missing In Backend

- None

## Docs Paths Missing In Backend

- None

## Backend Paths Not Used By Frontend

- /admin/calendar
- /admin/sync-user-sessions
- /auth/logout
- /auth/register
- /health
- /migrate-bookings
- /packages/:id

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
- /admin/users
- /admin/users/:email/adjust-sessions
- /admin/users/:email/payment
- /admin/users/:email/resend-login-email
- /auth/admin/login
- /auth/forgot-password
- /auth/login
- /auth/logout
- /auth/register
- /auth/request-login
- /auth/setup-password
- /auth/verify
- /debug/check-users
- /packages/:id
- /slots
- /slots/availability
- /slots/live-days
- /slots/user-calendar
- /upload-logo
- /user/language
- /user/packages
- /user/packages/:id/book-session
- /user/packages/:id/reschedule
- /user/packages/:id/reservations/:reservationId
- /user/packages/purchase
- /user/upload-avatar
- /users/:email
- /validate-coupon

> This check is non-blocking by default. Use `--strict` to exit with code 1 on WARN.
