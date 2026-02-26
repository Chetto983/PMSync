---
phase: 22-bug-audit
plan: 03
subsystem: api
tags: [security, tenant-guard, quota-guard, csp, prisma-retry, sanitize, dead-code, race-condition]

requires:
  - phase: 22-01
    provides: Bug report with 47 cataloged issues and metrics baseline
  - phase: 22-02
    provides: Working ESLint, Prisma migration, passing tests, CI workflow

provides:
  - TenantGuard on 4 previously unguarded controllers (subscription, autumn, templates, signatures)
  - QuotaGuard on document library controller (AI resource enforcement)
  - Production CSP hardened (no unsafe-inline scripts in production)
  - Regression tests for sanitize.utils.ts (10 tests) and PrismaRetryService (14 tests)
  - Stale TODOs converted to tracked DEBT comments
  - Verification that RC-A1/RC-A8/P2034/sanitization consolidation already complete from prior phases

affects: [22-04, 22-05, 22-06]

tech-stack:
  added: []
  patterns:
    - "DEBT comment pattern: // DEBT: description (tracked in BUG-NNN)"
    - "Environment-conditional CSP: unsafe-inline only in non-production"

key-files:
  created:
    - backend/src/modules/ai/voltagent/utils/__tests__/sanitize.utils.spec.ts
    - backend/src/common/services/__tests__/prisma-retry.service.spec.ts
    - .planning/phases/22-bug-audit/deferred-items.md
  modified:
    - backend/src/modules/subscription/controllers/subscription.controller.ts
    - backend/src/modules/subscription/controllers/autumn.controller.ts
    - backend/src/modules/email/controllers/templates.controller.ts
    - backend/src/modules/email/controllers/signatures.controller.ts
    - backend/src/modules/ai/voltagent/controllers/document-library.controller.ts
    - backend/src/main.ts
    - backend/src/modules/email-sync/services/sync-message-processor.service.ts
    - backend/src/common/services/dead-letter-queue.service.ts
    - backend/src/modules/subscription/services/billing-alert.service.ts

key-decisions:
  - "Auth endpoints (logout, refresh) confirmed user-scoped -- TenantGuard not needed (BUG-030)"
  - "MFA controller already has TenantGuard -- no change needed (BUG-028)"
  - "Autumn pricing_table endpoint stays public (no auth) -- per-method guards instead of class-level"
  - "styleSrc keeps unsafe-inline in all envs (CSS-in-JS requires it)"
  - "Stale TODOs converted to DEBT comments with tracking refs instead of deleting"

patterns-established:
  - "DEBT tracking: stale TODOs get // DEBT: description (tracked in BUG-NNN)"
  - "Env-conditional CSP: restrict unsafe-inline to non-production for scriptSrc"

requirements-completed: [AUDIT-FIX-01, AUDIT-FIX-05]

duration: 11min
completed: 2026-02-26
---

# Phase 22 Plan 03: Backend Bug Fixes Summary

**Security guards added to 5 controllers, CSP hardened for production, 24 regression tests added for P2034 retry and sanitization utilities**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-26T21:12:42Z
- **Completed:** 2026-02-26T21:23:44Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added TenantGuard to 4 controllers missing multi-tenant isolation (subscription, autumn, templates, signatures)
- Added QuotaGuard to document library controller to match all other AI controllers
- Restricted CSP unsafe-inline to non-production environments (production scriptSrc now self-only)
- Added 10 regression tests for sanitize.utils.ts and 14 for PrismaRetryService
- Verified all prior-phase fixes (RC-A1, RC-A8, P2034, sanitization consolidation, dead code removal) are intact
- Converted 4 stale TODOs to tracked DEBT comments with bug report references

## Task Commits

Each task was committed atomically:

1. **Task 1a: Sanitize utils regression tests** - `f2f8d3e9` (test)
2. **Task 1b: PrismaRetryService unit tests** - `f630c745` (test)
3. **Task 2a: TenantGuard + QuotaGuard on 5 controllers** - `4444b7b6` (fix)
4. **Task 2b: CSP unsafe-inline restricted to non-production** - `f3a18c91` (fix)
5. **Task 2c: Stale TODOs converted to tracked DEBT** - `b281fef3` (chore)

## Files Created/Modified

- `backend/src/modules/ai/voltagent/utils/__tests__/sanitize.utils.spec.ts` - 10 test cases for LLM sanitization
- `backend/src/common/services/__tests__/prisma-retry.service.spec.ts` - 14 test cases for P2002/P2034 retry
- `backend/src/modules/subscription/controllers/subscription.controller.ts` - Added TenantGuard
- `backend/src/modules/subscription/controllers/autumn.controller.ts` - Added TenantGuard to 8 endpoints
- `backend/src/modules/email/controllers/templates.controller.ts` - Added TenantGuard
- `backend/src/modules/email/controllers/signatures.controller.ts` - Added TenantGuard
- `backend/src/modules/ai/voltagent/controllers/document-library.controller.ts` - Added QuotaGuard
- `backend/src/main.ts` - CSP scriptSrc conditional on NODE_ENV
- `backend/src/modules/email-sync/services/sync-message-processor.service.ts` - TODO -> DEBT
- `backend/src/common/services/dead-letter-queue.service.ts` - TODO -> DEBT
- `backend/src/modules/subscription/services/billing-alert.service.ts` - TODO -> DEBT
- `.planning/phases/22-bug-audit/deferred-items.md` - Deferred items documentation

## Decisions Made

1. **Auth endpoints (logout, refresh) confirmed user-scoped** -- TenantGuard not needed. These only access the authenticated user's own data. BUG-030 resolved as intentional.

2. **MFA controller already has TenantGuard** -- No change needed. BUG-028 resolved as non-issue.

3. **Autumn pricing_table stays public** -- The unauthenticated pricing table endpoint needs no auth. Used per-method `@UseGuards(JwtAuthGuard, TenantGuard)` on other endpoints instead of class-level.

4. **styleSrc keeps unsafe-inline in all environments** -- CSS-in-JS (MUI) requires inline styles. Only scriptSrc was restricted.

5. **Stale TODOs become DEBT markers** -- Converting TODOs to `// DEBT: description (tracked in BUG-NNN)` preserves documentation intent while indicating these are tracked items, not forgotten tasks.

## Deviations from Plan

### Prior Phase Work Already Complete

The plan expected the following work to be done in Task 1 and Task 2, but all were already completed in prior phases:

1. **Sanitization consolidation** -- `sanitize.utils.ts` already exists with `sanitizeLlmResponse()`. All three original files import from it. No inline implementations remain.
2. **DEPRECATED tool block removal** -- No DEPRECATED markers found in any tools file. Already cleaned.
3. **Mistral MEDIUM model removal** -- No MEDIUM references found. Already cleaned.
4. **extractPlainText dead code** -- Zero references found. Already removed.
5. **RC-A1 (syncProviderFolders)** -- Redis lock with `folder-sync:{providerId}`, 300s TTL already present.
6. **RC-A8 (folder CRUD)** -- Redis lock with `folder-crud:{providerId}`, 30s TTL on create/rename/delete already present.
7. **P2034 retry service** -- `PrismaRetryService` exists with full P2002/P2034 handling, exponential backoff, jitter.

**Action taken:** Verified each item (grep, file read, test run). Added regression tests where missing (sanitize.utils: 10 tests, PrismaRetryService: 14 tests) to lock down the existing behavior.

---

**Total deviations:** 0 (plan items were already done; tests added to fill coverage gap)
**Impact on plan:** Reduced scope since fixes were already applied. Focused on test coverage and remaining security/hygiene bugs.

## Bug Tracker

| Bug ID | Status | Resolution |
|--------|--------|------------|
| BUG-003 | FIXED (Plan 02) | Prisma migration applied |
| BUG-017 | DEFERRED | File size violations flagged in deferred-items.md |
| BUG-020 | FIXED | Duplicate TODO -> DEBT with tracking ref |
| BUG-023 | FIXED | CSP unsafe-inline restricted to non-production |
| BUG-024 | FIXED | TenantGuard added to SubscriptionController |
| BUG-025 | FIXED | TenantGuard added to AutumnController (8 endpoints) |
| BUG-026 | FIXED | TenantGuard added to TemplatesController |
| BUG-027 | FIXED | TenantGuard added to SignaturesController |
| BUG-028 | REVIEWED | Already has TenantGuard -- no change needed |
| BUG-030 | REVIEWED | Confirmed user-scoped -- no TenantGuard needed |
| BUG-031 | FIXED | QuotaGuard added to DocumentLibraryController |
| BUG-032 | RESOLVED (Plan 02) | Follow-up controller changes already committed |
| BUG-034 | FIXED | DLQ alerting TODO -> DEBT with tracking ref |
| BUG-036 | FIXED | Retry queue TODO -> DEBT with tracking ref |
| BUG-037 | FIXED | Billing alert TODO -> DEBT with tracking ref |

## Issues Encountered

- Many Task 1 items (sanitization, dead code, DEPRECATED, Mistral MEDIUM) were already done in prior phases. The plan was written based on the initial audit which didn't account for code that was already fixed between phases 11-21.
- Backend Jest still shows forceExit warning (BUG-042, pre-existing resource leak). Not blocking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All backend bugs assigned to Plan 03 are resolved or deferred with documentation
- 696/696 backend tests pass
- Type-check clean (0 errors)
- Git tag v3.1-post-backend-fixes created
- Ready for Plan 04 (frontend fixes)

## Self-Check: PASSED

All 4 created files verified present. All 5 task commits verified in git log. Git tag v3.1-post-backend-fixes exists.

---
*Phase: 22-bug-audit*
*Completed: 2026-02-26*
