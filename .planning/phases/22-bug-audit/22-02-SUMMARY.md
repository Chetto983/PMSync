---
phase: 22-bug-audit
plan: 02
subsystem: infra
tags: [eslint, prisma, jest, e2e, github-actions, npm-audit, ci]

requires:
  - phase: 22-01
    provides: Bug report with 47 cataloged issues and metrics baseline

provides:
  - Working ESLint in both backend and frontend (no config crashes)
  - Missing Prisma @@index([tenantId, aiPriority]) migration applied
  - npm audit vulnerabilities reduced (0 production vulns in root + frontend)
  - All 209 frontend tests passing (was 206/209)
  - E2E auth mock infrastructure resilient to new endpoints
  - GitHub Actions CI workflow with type-check, lint, test gates

affects: [22-03, 22-04, 22-05, 22-06]

tech-stack:
  added: []
  patterns:
    - "Catch-all API mock in E2E fixtures for forward-compatible testing"
    - "eslint-plugin-react filter pattern for ESLint 10 flat config compatibility"

key-files:
  created:
    - backend/prisma/migrations/20260226_add_tenant_ai_priority_index/migration.sql
    - .github/workflows/ci.yml
  modified:
    - backend/eslint.config.js
    - frontend/eslint.config.mjs
    - frontend/hooks/ai/use-ai-compose.test.tsx
    - frontend/hooks/ai/use-ai-actions.test.tsx
    - frontend/e2e/fixtures.ts
    - frontend/e2e/auth.setup.ts

key-decisions:
  - "Ignore all **/*.js in backend ESLint (TS-only project with many utility JS scripts)"
  - "Filter eslint-plugin-react from eslint-config-next spread (7.37.5 incompatible with ESLint 10)"
  - "Manual Prisma migration (shadow DB replay issue in prisma migrate dev)"
  - "Catch-all API mock in E2E fixtures returns 200 with empty JSON for unmocked endpoints"
  - "Backend xlsx/node-nlp vulns accepted as risk (no safe fix without breaking change)"

patterns-established:
  - "ESLint 10 flat config: filter incompatible plugins from config spreads"
  - "E2E catch-all mock: specific mocks first, catch-all last for resilience"

requirements-completed: [AUDIT-FIX-02, AUDIT-FIX-03, AUDIT-FIX-04, AUDIT-FIX-07]

duration: 16min
completed: 2026-02-26
---

# Phase 22 Plan 02: Tooling & CI Summary

**ESLint fixed in both sides, Prisma migration applied, 3 test failures fixed, E2E auth mocks hardened, GitHub Actions CI workflow created**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-26T20:53:26Z
- **Completed:** 2026-02-26T21:09:22Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments

- Both ESLint configs run without crashing (backend: 36 pre-existing warnings, frontend: 3010 pre-existing)
- Prisma migration for @@index([tenantId, aiPriority]) created and deployed (17 migrations now)
- Frontend tests: 209/209 pass (fixed 3 test drift failures)
- Backend tests: 672/672 pass
- E2E auth mock infrastructure hardened with catch-all and missing endpoint mocks
- GitHub Actions CI workflow covers both backend and frontend

## Task Commits

Each task was committed atomically:

1. **Task 1a: Backend ESLint fix** - `de0e88ac` (fix)
2. **Task 1b: Frontend ESLint fix** - `634d9865` (fix)
3. **Task 2a: Prisma migration** - `319417ff` (fix)
4. **Task 2b: npm audit fix** - `0e1f12bd` (fix)
5. **Task 3a: use-ai-compose test fix** - `74fd53e6` (fix)
6. **Task 3b: use-ai-actions test fix** - `4b84bb3d` (fix)
7. **Task 4a: E2E auth mock fix** - `eccf4b55` (fix)
8. **Task 4b: CI workflow** - `c12af1bf` (feat)

## Files Created/Modified

- `backend/eslint.config.js` - Added **/*.js and coverage/** to ignores
- `frontend/eslint.config.mjs` - Filter broken eslint-plugin-react from eslint-config-next
- `backend/prisma/migrations/20260226_add_tenant_ai_priority_index/migration.sql` - CONCURRENTLY index creation
- `backend/package-lock.json` - npm audit fix
- `frontend/package-lock.json` - npm audit fix
- `package-lock.json` - npm audit fix (root)
- `frontend/hooks/ai/use-ai-compose.test.tsx` - Remove variantUsed/variant expectations
- `frontend/hooks/ai/use-ai-actions.test.tsx` - Fix approveAction 2-arg assertion
- `frontend/e2e/fixtures.ts` - Add voltagent/CSRF/legal/consent/subscription mocks + catch-all
- `frontend/e2e/auth.setup.ts` - Add catch-all API mock
- `.github/workflows/ci.yml` - CI with type-check, lint, test for both backend and frontend

## Decisions Made

1. **Ignore all JS files in backend ESLint** -- Backend is a TS-only project with many utility JS scripts in `scripts/`. Type-checked rules cannot lint JS files without tsconfig. Ignoring `**/*.js` is cleaner than listing each file.

2. **Filter eslint-plugin-react from eslint-config-next** -- No v8+ of eslint-plugin-react exists. Downgrading ESLint to 9.x would risk breaking eslint-config-next 16.x. Filtering the broken plugin while keeping react-hooks, jsx-a11y, @next/next is the pragmatic fix.

3. **Manual Prisma migration** -- `prisma migrate dev` fails due to shadow DB replay issue with historical migration `20241230_add_folder_is_system`. Manual migration with `CONCURRENTLY` and `prisma migrate deploy` is the standard workaround.

4. **Backend xlsx vulnerabilities accepted** -- 6 production vulnerabilities remain (node-nlp -> @nlpjs/xtables -> xlsx). No safe fix without major breaking change to node-nlp. Documented as accepted risk.

5. **E2E catch-all mock** -- Instead of chasing every new endpoint, a catch-all returning 200 with empty JSON prevents E2E failures when new backend endpoints are added. Specific mocks take priority over the catch-all.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jest.config.js and scripts/*.js also needed ESLint ignoring**
- **Found during:** Task 1 (Backend ESLint fix)
- **Issue:** Plan only mentioned eslint.config.js, but jest.config.js and 20+ scripts/*.js files also crash type-checked rules
- **Fix:** Ignored all **/*.js files instead of individual files
- **Files modified:** backend/eslint.config.js
- **Verification:** `npx eslint .` completes without crashes
- **Committed in:** de0e88ac

**2. [Rule 3 - Blocking] Prisma migrate dev shadow DB failure**
- **Found during:** Task 2 (Prisma migration)
- **Issue:** `prisma migrate dev --create-only` fails because shadow DB can't replay historical migration 20241230_add_folder_is_system
- **Fix:** Created migration SQL manually and applied with `prisma migrate deploy`
- **Files modified:** backend/prisma/migrations/20260226_add_tenant_ai_priority_index/migration.sql
- **Verification:** `prisma migrate status` reports "Database schema is up to date"
- **Committed in:** 319417ff

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both fixes necessary to complete tasks. No scope creep.

## Issues Encountered

- Backend ESLint runs out of memory when linting with `npx eslint .` (no memory flag). Must use `NODE_OPTIONS=--max-old-space-size=8192` as already configured in package.json lint script.
- Frontend ESLint reports 2965 errors + 45 warnings -- all pre-existing code issues. These will be addressed in Plans 03-04.
- Backend Jest still shows `--forceExit` warning (BUG-042) -- pre-existing resource leak in test infrastructure, not blocking.

## Bug Tracker

| Bug ID | Status | Resolution |
|--------|--------|------------|
| BUG-001 | FIXED | Frontend ESLint runs (eslint-plugin-react filtered) |
| BUG-002 | FIXED | Backend ESLint runs (JS files and coverage/ ignored) |
| BUG-005 | FIXED | use-ai-compose tests match current API |
| BUG-006 | FIXED | use-ai-actions test matches 2-arg signature |
| BUG-007 | PARTIAL | 6 backend prod vulns remain (xlsx chain, accepted risk) |
| BUG-008 | FIXED | 0 frontend production vulnerabilities |
| BUG-010 | DOCUMENTED | Backend Jest forceExit warning (pre-existing, not blocking) |
| BUG-013 | FIXED | Root npm audit: 0 production vulnerabilities |
| BUG-015 | FIXED | E2E auth mock with catch-all and missing endpoint mocks |
| BUG-033 | RESOLVED | Uncommitted test files now clean (committed in prior audit) |
| BUG-041 | RESOLVED | backfill-encryption.ts changes committed |
| BUG-045 | RESOLVED | All 4 uncommitted files now clean |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ESLint and type-check gates are functional for Plans 03-04 code fixes
- All Jest tests passing -- new test failures from Plans 03-04 will be genuine regressions
- Prisma schema in sync with database
- CI workflow ready to enforce gates on PRs
- E2E auth mocks resilient for frontend fixes in Plan 04

## Self-Check: PASSED

All 9 key files verified present. All 8 task commits verified in git log.

---
*Phase: 22-bug-audit*
*Completed: 2026-02-26*
