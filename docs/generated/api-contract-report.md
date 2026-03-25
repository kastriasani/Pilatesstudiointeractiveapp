# API Contract Report

Generated: 2026-03-25T01:14:28.361Z

## Summary

- Status: WARN
- Backend unique paths: 53
- Frontend unique paths: 46
- Docs unique paths: 21

## Frontend Paths Missing In Backend

- None

## Docs Paths Missing In Backend

- /admin/bookings

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
- /admin/sync-user-sessions
- /admin/users/:email/adjust-sessions
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
- /slots/live-days
- /upload-logo
- /user/language
- /user/packages
- /user/packages/:id/reschedule
- /user/packages/:id/reservations/:reservationId
- /user/packages/purchase
- /user/upload-avatar
- /users/:email
- /validate-coupon

> This check is non-blocking by default. Use `--strict` to exit with code 1 on WARN.
