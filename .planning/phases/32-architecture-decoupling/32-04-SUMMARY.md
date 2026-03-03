---
phase: 32-architecture-decoupling
plan: 04
subsystem: infra
tags: [dependency-cruiser, madge, ci, circular-dependencies, github-actions]

# Dependency graph
requires:
  - phase: 32-architecture-decoupling (plan 03)
    provides: Circular dependency reduction from plans 01-03
  - phase: 31-foundation
    provides: dependency-cruiser baseline config installed in warn mode
provides:
  - dependency-cruiser enforcing no-circular at error severity with known-violations baseline
  - CI pipeline step blocking PRs that introduce new circular dependencies
  - madge installed for visual circular dependency reporting
  - npm scripts for dep:check, dep:circular, dep:baseline
affects: [phase-33-api-standardization, all-future-backend-development]

# Tech tracking
tech-stack:
  added: [madge@8.0.0]
  patterns: [known-violations-baseline, ci-dependency-enforcement]

key-files:
  created:
    - backend/.dependency-cruiser-known-violations.json
  modified:
    - backend/.dependency-cruiser.cjs
    - backend/package.json
    - backend/package-lock.json
    - .github/workflows/ci.yml

key-decisions:
  - "no-circular at error severity, cross-module deep imports stay as warnings (separate effort)"
  - "CI-only enforcement via GitHub Actions step, no pre-commit hooks"
  - "madge runs as informational reporter (|| true), dep-cruiser is the gate"
  - "1013 known violations baselined (21 circular + cross-module + orphan)"

patterns-established:
  - "Known-violations baseline: run dep:baseline to regenerate when violations are intentionally reduced"
  - "CI dependency gate: dep-cruiser blocks new circular deps, madge reports for visibility"

requirements-completed: [ARCH-03]

# Metrics
duration: 6min
completed: 2026-03-03
---

# Phase 32 Plan 04: CI Dependency Enforcement Summary

**dependency-cruiser promoted to error severity with known-violations baseline, CI pipeline step blocks new circular imports, madge installed for visual reporting**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T14:27:24Z
- **Completed:** 2026-03-03T14:33:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- no-circular rule flipped from warn to error severity in dependency-cruiser config
- Known-violations baseline generated with 1013 accepted violations (21 circular, ~989 cross-module, 3 orphan)
- CI pipeline "Dependency boundary check" step added after Jest tests -- dep-cruiser gates, madge reports
- npm scripts added: dep:check (validate), dep:circular (madge report), dep:baseline (regenerate baseline)
- madge@8.0.0 installed as devDependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Install madge, flip circular rule to error, generate known-violations baseline** - `d2fa2a5d` (feat)
2. **Task 2: Add dependency boundary check to CI pipeline** - `31369db1` (feat, included in parallel executor commit)

## Files Created/Modified
- `backend/.dependency-cruiser.cjs` - no-circular severity changed from warn to error, comments updated
- `backend/.dependency-cruiser-known-violations.json` - Baseline of 1013 accepted violations for CI comparison
- `backend/package.json` - Added madge devDependency + dep:check/dep:circular/dep:baseline npm scripts
- `backend/package-lock.json` - Lock file updated with madge@8.0.0 and 66 transitive dependencies
- `.github/workflows/ci.yml` - Added "Dependency boundary check" step after Jest tests

## Decisions Made
- **Error severity for circular only:** Cross-module deep imports (989 violations) stay as warnings -- reducing them is a separate effort, not Phase 32 scope
- **CI-only enforcement:** No pre-commit hooks per user decision. Developers get fast local feedback via `npm run dep:check` if they choose, but nothing forced locally
- **madge as informational reporter:** madge runs with `|| true` in CI -- it provides a visual circular dependency list but does not block the pipeline. dep-cruiser is the actual gate
- **Baseline includes all violation types:** The known-violations JSON captures circular (error), cross-module (warn), and orphan (info) violations. Only new circular violations above the baseline will block PRs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CI yml committed in parallel executor**
- **Found during:** Task 2
- **Issue:** A parallel plan executor (32-01) picked up the CI yml changes and committed them before Task 2 could make its own atomic commit
- **Fix:** Verified the changes are present in the repository (commit 31369db1). No duplicate commit needed since the working tree was clean
- **Files modified:** .github/workflows/ci.yml (committed in 31369db1)
- **Verification:** `grep "Dependency boundary check" .github/workflows/ci.yml` confirms step exists

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** CI yml changes are in the repo, just attributed to a different commit message. No functional impact.

## Issues Encountered
- Parallel plan executors (32-01 through 32-03) were running simultaneously, causing some untracked files from other plans to appear in git status. Carefully staged only task-relevant files to avoid cross-contamination.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 32 (Architecture Decoupling) is now complete with CI enforcement locked in
- Any future PR introducing a new circular dependency will be blocked by the "Dependency boundary check" CI step
- To update the baseline after intentionally reducing violations: `npm run dep:baseline` then commit the updated JSON
- Phase 33 (API Contract Standardization) can proceed -- module boundaries are enforced

## Self-Check: PASSED

All files verified present:
- backend/.dependency-cruiser.cjs
- backend/.dependency-cruiser-known-violations.json
- .github/workflows/ci.yml
- backend/package.json

All commits verified present:
- d2fa2a5d (Task 1)
- 31369db1 (Task 2 CI changes)

---
*Phase: 32-architecture-decoupling*
*Completed: 2026-03-03*
