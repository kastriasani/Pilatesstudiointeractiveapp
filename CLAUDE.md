# Claude Code Instructions

> **Purpose:** Guardrails, commands, current status, pointers to real docs.
> **Read when:** Starting any task with Claude Code.

## Hard Rules

1. Plan mode only until user explicitly approves
2. Do not deploy unless explicitly requested
3. Never modify unrelated code outside current task
4. Never output secrets - use env vars only
5. Do not rename files or add config files unless requested

## Commands

```bash
npm run dev                    # Frontend dev server
npm run build                  # Production build
```

Deploy (only when explicitly requested):
```bash
SUPABASE_ACCESS_TOKEN="..." npx supabase functions deploy make-server-b87b0c07 --project-ref azqkguctispoctvmpmci
```

## Current Status

**Migration: 27/27 endpoints (100%) ✅ COMPLETE**

| Phase | Status |
|-------|--------|
| 0A-I | ✅ All Complete |

Last commit: Migration complete

## Open Bugs

None currently tracked.

## Recently Fixed

- ✅ DevTools modal now fully hidden in production (AdminPanel.tsx)
- ✅ "Payed" typo fixed (now "Paid")

- ✅ Duplicate /validate-coupon route removed
- ✅ Waitlist codes now work in POST /packages
- ✅ Waitlist redeem gives 9 sessions (8+1 bonus)
- ✅ POST /user/packages/:id/reschedule migrated to Supabase
- ✅ 4 obsolete endpoints removed
- ✅ MemberActivationModal updated (shows deprecation notice)

## Key Files

| File | Purpose |
|------|---------|
| `src/utils/dateUtils.ts` | Centralized date utilities (frontend) |
| `supabase/functions/.../dateUtils.ts` | Centralized date utilities (backend) |
| `supabase/functions/.../index.ts` | All API endpoints (~3800 lines) |
| `src/app/components/AdminPanel.tsx` | Admin UI (~1200 lines) |

## Documentation (Reading Order)

1. **CLAUDE.md** (this file) - Start here
2. **docs/MIGRATION_MASTERPLAN.md** - Migration status & next tasks
3. **docs/ROUTE_INVENTORY.md** - All endpoints list
4. **docs/ARCHITECTURE.md** - System design & utilities
5. **docs/FULL_REVIEW.md** - Audit snapshot & context

## Project Info

- **App URL:** https://app.wellnestpilates.com
- **Supabase Project:** azqkguctispoctvmpmci
- **Region:** eu-central-1
- **Timezone:** Europe/Skopje
