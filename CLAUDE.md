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

**Migration: 21/30 endpoints (70%)**

| Phase | Status |
|-------|--------|
| 0A-E | ✅ Complete |
| 0F-J | ⬚ Remaining (9 endpoints) |

Last commit: `1cdb283` - Centralized date utilities

## Open Bugs

| Bug | Location | Priority |
|-----|----------|----------|
| DevTools visible in Production | AdminPanel.tsx | MEDIUM |
| "Payed" typo (should be "Paid") | AdminPanel.tsx:409,865,875 | LOW |
| Duplicate /validate-coupon route | index.ts:581,626 | LOW |
| MemberActivationModal obsolete | MemberActivationModal.tsx | LOW |

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
