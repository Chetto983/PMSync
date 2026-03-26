# Sprint 07.2 — Checkpoint

## Stato
- **Sprint:** 07.2 — UX/Mobile Audit Fixes (Sub-Sprint)
- **Last Task Completed:** T-0727 — Fix timeline date clipping on narrow viewports
- **Next Task:** Sprint complete — all 7/7 tasks done
- **Tasks Done:** 7/7
- **SP Completed:** 7/7
- **Last Updated:** 2026-03-26 14:30

## Last Modified Files
- frontend/components/dashboard/crm-deals/DealProductsTab.tsx
- frontend/components/dashboard/crm-accounts/AccountActivityTab.tsx
- frontend/hooks/queries/use-crm-accounts.ts
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts
- crm/sprints/phase-1-core-crm/sprint-07.2.md

## Key Decisions Made
- T-0721: Load More uses accumulated state + offset pagination (not useInfiniteQuery)
- T-0722: Code and Discount columns hidden on xs (subtotal already includes discount)
- T-0723: Confirm dialog uses `confirmUnlinkId` state pattern with color="error" remove button
- T-0727: Used flex 0.35 on xs (not 0.3) to give slightly more room for date text

## Patterns Established
- Confirm dialog pattern: `confirmUnlinkId` state + Dialog with error-colored action button
- Loading spinner pattern: `startIcon={isPending ? <CircularProgress size={16} /> : undefined}`
- Responsive table pattern: `display: { xs: 'none', sm: 'table-cell' }` for non-essential columns
- Touch target pattern: `sx={{ minWidth: 44, minHeight: 44 }}` on IconButton

## Blockers / Notes
- Backend node_modules needed reinstall mid-session (tsc couldn't find @nestjs/common)
- Frontend node_modules also needed reinstall (@serwist/next/typings pre-existing issue)
- Pre-existing tsc errors in use-email-page-actions.ts (email label sprint, not CRM)
- T-0721 changes were already committed in a prior session (bundled into commit 35a4a1db)

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing errors in use-email-page-actions.ts, not CRM)
- Circular deps: not checked (frontend-only sprint)
- Railway deploy: ⏳ pending push
- Vercel deploy: ⏳ pending push
- Browser (Edge CDP): ⏳ pending production validation
