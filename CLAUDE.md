# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WellNest Pilates booking system - a React frontend with Supabase Edge Functions backend for managing pilates class reservations.

- **App URL:** https://app.wellnestpilates.com
- **Supabase Project:** azqkguctispoctvmpmci
- **Region:** eu-central-1
- **Timezone:** Europe/Skopje (all date/time logic)

## Commands

```bash
npm run dev          # Frontend dev server (Vite)
npm run build        # Production build
```

**Deploy backend** (only when explicitly requested):
```bash
SUPABASE_ACCESS_TOKEN="..." npx supabase functions deploy make-server-b87b0c07 --project-ref azqkguctispoctvmpmci
```

## Hard Rules

1. Do not deploy unless explicitly requested
2. Never modify unrelated code outside current task
3. Never output secrets - use env vars only
4. Do not rename files or add config files unless requested

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | Supabase Edge Functions (Deno + Hono) |
| Database | Supabase Postgres + KV store (sessions only) |
| Email | Resend |
| Hosting | Vercel (frontend), Supabase (backend) |

### Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/make-server-b87b0c07/index.ts` | All API endpoints (~5000 lines) |
| `src/app/components/AdminPanel.tsx` | Admin calendar & user management |
| `src/app/components/UserDashboard.tsx` | User booking interface |
| `src/utils/dateUtils.ts` | Frontend date utilities (Skopje timezone) |
| `supabase/functions/.../dateUtils.ts` | Backend date utilities (must sync with frontend) |

### Database Tables

- `users` - User accounts (email, name, activation_status, payment_status, password_hash)
- `user_packages` - Purchased packages (user_email, package_type, remaining_sessions)
- `reservations` - Booked sessions (user_email, date_key, time_slot, reservation_status)
- `waitlist_members` - Waitlist signups with redemption codes
- `day_schedules` / `time_slots` - Admin-configurable schedule

### Session Management

- User sessions: 30-day sliding expiration (stored in KV)
- Admin sessions: 24-hour sliding expiration (stored in KV)
- Sessions extend on every authenticated request
- Frontend stores token in localStorage (`wellnest_session` for users, `adminSessionToken` for admin)

## Critical: Timezone Handling

**All date/time logic uses Europe/Skopje timezone.** Never use `new Date()` directly for business logic.

Use centralized utilities:
- `getSkopjeTime()` - Current time in Skopje
- `getSkopjeToday()` - Today at midnight in Skopje
- `isValidBookingDate(date)` - Checks not-past + weekday

The frontend and backend `dateUtils.ts` files must stay in sync.

## API Authentication

- **Admin endpoints** (`/admin/*`): Require `verifyAdminSession(c)` check
- **User endpoints** (`/user/*`): Require `verifyUserSession(c)` check
- **Public endpoints**: `/health`, `/slots`, `/validate-coupon`, `/auth/*`
- **Dev endpoints** (`/dev/*`, `/debug/*`): Protected by `ENABLE_DEV_ENDPOINTS` env var

## Environment Variables (Supabase Edge Functions)

Required secrets in Supabase dashboard:
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` - Admin login credentials
- `RESEND_API_KEY` - Email sending
- `FROM_EMAIL` - Sender email address
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Auto-set

## Key Business Logic

### Cancellation Rules
- 24+ hours before class: Can cancel (session refunded)
- Within 24 hours: Only within 2-minute grace period after booking
- No-show: Session consumed as penalty

### Package Flow
1. User selects package → Creates pending package
2. Books first session → Links reservation to package
3. Admin activates (after payment) → Package active, sends login email
4. Subsequent sessions → Auto-confirmed, no activation needed

## Documentation

Additional docs in `/docs/` directory:
- `ARCHITECTURE.md` - Detailed system design
- `ROUTE_INVENTORY.md` - All API endpoints
- `MIGRATION_MASTERPLAN.md` - Migration history
