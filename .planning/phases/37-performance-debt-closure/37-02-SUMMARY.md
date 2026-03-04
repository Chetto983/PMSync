---
phase: 37-performance-debt-closure
plan: 02
subsystem: infra
tags: [lighthouse, ci, performance, debt-closure, eslint]

requires:
  - phase: 37-performance-debt-closure/37-01
    provides: "Bundle optimization (dynamic imports, optimizePackageImports) resolving BUG-011/012"
provides:
  - "Lighthouse CI enforcement without continue-on-error (PRs blocked on LCP/TTI/CLS regression)"
  - "All 7 deferred v3.1 bugs resolved or documented with rationale"
  - "RC-A1/A8 Redis lock confirmation evidence"
affects: []

tech-stack:
  added: []
  patterns: ["CI budget gates block PRs on web vitals regression"]

key-files:
  created: []
  modified:
    - ".github/workflows/frontend-ci.yml"
    - "frontend/pages/dashboard/email.tsx"

key-decisions:
  - "BUG-029 (en.ts/it.ts >500 lines) accepted: splitting breaks TypeScript type inference"
  - "BUG-044 (ESLint ai-elements warnings) accepted: Tailwind dir intentionally outside MUI lint rules"
  - "BUG-038 signature TODO already removed; no action needed"
  - "BUG-039 resolved: FolderPickerDialog exists and wired for single-email move; bulk move deferred to v4.1+"

patterns-established:
  - "Lighthouse CI is blocking: regressing LCP >2500ms, TTI >3500ms, or CLS >0.1 fails the PR"

requirements-completed: [PERF-02]

duration: 3min
completed: 2026-03-04
---

# Phase 37 Plan 02: Deferred Bug Closure & Lighthouse CI Gates Summary

**Closed all 7 deferred v3.1 bugs (2 resolved, 3 accepted, 2 closed) and enforced Lighthouse CI budget gates to block PRs on web vitals regression**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T11:29:39Z
- **Completed:** 2026-03-04T11:33:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 7 deferred v3.1 bugs resolved or documented with acceptance rationale
- Lighthouse CI step now blocks PRs that regress LCP/TTI/CLS beyond thresholds
- RC-A1/A8 Redis locks confirmed still present in folder-sync.service.ts

## Deferred Bug Resolution Registry

| Bug | Description | Disposition | Rationale |
|-----|-------------|-------------|-----------|
| BUG-011 | LCP 4.12s | RESOLVED | Addressed by Plan 37-01 bundle optimization (dynamic imports, optimizePackageImports) |
| BUG-012 | TTI 4.13s | RESOLVED | Addressed by Plan 37-01 bundle optimization (dynamic imports, optimizePackageImports) |
| BUG-018 | i18n hardcoded strings | CLOSED | Fixed last hardcoded 'Loading emails...' with `t.emailList?.loading` fallback. Remaining hardcoded strings are all fallback defaults after `t()` calls (developer context). |
| BUG-029 | en.ts/it.ts >500 lines (3500+) | ACCEPTED | Translation files must be single exports for TypeScript type inference across the entire translation tree. Splitting would break type safety. |
| BUG-038 | TODO signature from user settings | CLOSED | TODO comment already removed in prior phases. No action needed. |
| BUG-039 | TODO folder picker dialog | CLOSED | FolderPickerDialog exists at `components/email/folders/FolderPickerDialog.tsx`, dynamically imported in email.tsx, and wired to `handleMoveMessage` for single-email move via reading pane. Bulk move deferred to v4.1+. |
| BUG-044 | ESLint ai-elements warnings | ACCEPTED | ai-elements directory uses Tailwind (per CLAUDE.md), not MUI. React compiler lint rules intentionally suppressed for this external component pattern. |

## RC-A1/A8 Redis Lock Confirmation

Grep output from `backend/src/modules/email-sync/services/folder-sync.service.ts`:
```
4:import { RedisLockService } from '../../../common/services/redis-lock.service';
21:    private readonly redisLock: RedisLockService,
32:    await this.redisLock.withLock(lockKey, 300000, async () => {
78:    return this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
99:    return this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
122:    await this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
```
**Confirmed:** 6 Redis lock references present. RC-A1 (syncProviderFolders) and RC-A8 (folder CRUD) both protected by `redisLock.withLock()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve deferred v3.1 bugs** - `9ce43c58` (fix)
2. **Task 2: Enforce Lighthouse CI budget gates** - `4658725d` (feat)

## Files Created/Modified
- `.github/workflows/frontend-ci.yml` - Removed continue-on-error from Lighthouse CI step
- `frontend/pages/dashboard/email.tsx` - Fixed hardcoded string (BUG-018), updated DEBT comment (BUG-039)

## Decisions Made
- BUG-029 accepted as exception: translation file splitting would break TypeScript type safety
- BUG-044 accepted as exception: ai-elements Tailwind pattern intentionally outside MUI lint rules
- BUG-039 resolved for single-email move; bulk move is a separate v4.1+ enhancement
- BUG-038 already resolved in prior phases (no TODO found)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 37 complete: all performance and debt closure items resolved
- Lighthouse CI gates active for ongoing regression prevention
- v4.0 Enterprise Stabilization milestone fully delivered

---
*Phase: 37-performance-debt-closure*
*Completed: 2026-03-04*
