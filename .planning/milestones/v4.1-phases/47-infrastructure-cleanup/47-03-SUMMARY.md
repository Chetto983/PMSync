---
phase: 47-infrastructure-cleanup
plan: 03
subsystem: infra
tags: [encryption, gcm, cbc, knip, bundle-budget, ci, security]

requires:
  - phase: 42-security
    provides: "GCM encryption in crypto.service.ts with CBC fallback"
provides:
  - "CBC-to-GCM re-encryption CLI script"
  - "CBC fallback removal from crypto.service.ts"
  - "Knip dependency audit config"
  - "CI bundle size budget (10MB fail / 9MB warn)"
affects: [security, frontend-deps, ci]

tech-stack:
  added: [knip]
  patterns: [re-encryption-migration-script, ci-bundle-budget]

key-files:
  created:
    - backend/scripts/re-encrypt-cbc-to-gcm.ts
    - frontend/knip.json
  modified:
    - backend/src/common/services/crypto.service.ts
    - .github/workflows/ci.yml
    - frontend/package.json

key-decisions:
  - "Remove 11 confirmed-unused frontend packages (rive, xyflow, media-chrome, etc.) -- conservative removal, kept packages with any import reference"
  - "CBC fallback throws explicit error with migration instructions rather than silent failure"

patterns-established:
  - "Re-encryption script pattern: batch-100, transactional, idempotent via prefix check, --dry-run support"
  - "CI bundle budget: du -sb .next/static/chunks/ with warn/fail thresholds"

requirements-completed: [CLN-04, CLN-05, CLN-06, TEST-12, TEST-13]

duration: 12min
completed: 2026-03-06
---

# Phase 47 Plan 03: Data Migration & Dependency Cleanup Summary

**CBC-to-GCM re-encryption script with CBC fallback removal, Knip dependency audit removing 11 unused packages, and CI bundle size budget at 10MB**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-06T11:01:06Z
- **Completed:** 2026-03-06T11:12:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Re-encryption script handles all 7 encrypted fields across ProviderConfig and MfaSecret tables
- CBC decryption code fully removed from crypto.service.ts -- non-GCM data now throws explicit error
- 11 unused frontend packages removed (rive, xyflow, media-chrome, autumn-js, floating-ui, lhci, jsonwebtoken, pg, etc.)
- CI pipeline now builds Next.js and enforces 10MB bundle budget with 9MB warning threshold

## Task Commits

Each task was committed atomically:

1. **Task 1: CBC-to-GCM re-encryption script + remove CBC fallback** - `3c92384c` (feat)
2. **Task 2: Knip dependency audit + CI bundle budget** - `8d4be63f` (feat)

## Files Created/Modified
- `backend/scripts/re-encrypt-cbc-to-gcm.ts` - CLI migration script for CBC-to-GCM re-encryption
- `backend/src/common/services/crypto.service.ts` - Removed decryptCbc method, added error on legacy data
- `frontend/knip.json` - Knip configuration for unused dependency detection
- `.github/workflows/ci.yml` - Added Next.js build + bundle size budget check steps
- `frontend/package.json` - Removed 11 unused dependencies

## Decisions Made
- Conservative package removal: only removed packages with zero imports across the entire codebase; kept Radix UI packages even though their component files are flagged as unused (those components may be needed later)
- CBC fallback throws with actionable error message pointing to the migration script
- Script uses inline crypto helpers (no NestJS DI) for standalone execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing type error in `realtime.gateway.ts` (activeTenantConnections -> hasTenantConnections) -- unrelated to our changes, not fixed per scope boundary rules

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Re-encryption script ready to run against production data before deploying CBC removal
- Knip can be re-run periodically to catch new unused dependencies
- Bundle budget will enforce size discipline going forward

## Self-Check: PASSED

All files exist. Both commits verified (3c92384c, 8d4be63f).

---
*Phase: 47-infrastructure-cleanup*
*Completed: 2026-03-06*
