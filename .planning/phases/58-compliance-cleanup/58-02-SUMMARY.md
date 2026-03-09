---
phase: 58-compliance-cleanup
plan: 02
subsystem: auth
tags: [prisma, nestjs, better-auth, dead-code-removal, passport, jwt]

requires:
  - phase: 58-01
    provides: Guards/decorators copied to common/auth/ making modules/auth/ safe to delete
  - phase: 50-02
    provides: BetterAuthModule as replacement for legacy AuthModule
provides:
  - Clean codebase with zero legacy JWT auth code
  - Prisma schema without deprecated fields or RefreshToken model
  - 5 legacy npm packages removed (jsonwebtoken, passport, passport-jwt, @nestjs/passport, @nestjs/jwt)
affects: []

tech-stack:
  added: []
  patterns:
    - "All guard/decorator imports use common/auth/ path (not modules/auth/)"

key-files:
  created: []
  modified:
    - "backend/src/app.module.ts"
    - "backend/prisma/schema.prisma"
    - "backend/package.json"
    - "backend/src/modules/users/services/users.service.ts"
    - "backend/src/prisma/tenant-scoping/tenant-scoped-models.ts"

key-decisions:
  - "CLN-02 and CLN-03 DEFERRED -- GDPR org-related updates require Phase 56 (Organizations) which has not shipped"
  - "Replaced isMfaEnabled select with twoFactorEnabled in users.service.ts (better-auth equivalent)"
  - "22 controllers updated to import guards/decorators from common/auth/ instead of deleted modules/auth/"

patterns-established:
  - "Guard imports: always from @common/auth/, never from @modules/auth/"

requirements-completed: [CLN-04]

duration: 6min
completed: 2026-03-09
---

# Phase 58 Plan 02: Legacy Auth Deletion Summary

**Deleted ~7500 lines of dead JWT auth code, removed deprecated Prisma fields/models, uninstalled 5 legacy npm packages -- build passes cleanly**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T16:04:34Z
- **Completed:** 2026-03-09T16:10:15Z
- **Tasks:** 2
- **Files modified:** 30 (64 file changes including 40 deletions)

## Accomplishments
- Deleted entire backend/src/modules/auth/ directory (40 files, ~7500 lines)
- Removed deprecated Prisma fields (passwordHash, isMfaEnabled, lastActivityAt) and RefreshToken model
- Uninstalled jsonwebtoken, passport, passport-jwt, @nestjs/passport, @nestjs/jwt
- Updated 22 controllers to use common/auth/ import paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete old AuthModule directory and remove from app.module.ts** - `9088566c` (feat)
2. **Task 2: Remove deprecated Prisma fields/models and uninstall npm packages** - `c5888928` (feat)

## Files Created/Modified
- `backend/src/modules/auth/` - Entire directory deleted (40 files)
- `backend/src/app.module.ts` - AuthModule import removed
- `backend/prisma/schema.prisma` - Deprecated fields and RefreshToken model removed
- `backend/package.json` - 5 legacy auth packages uninstalled
- `backend/src/modules/users/services/users.service.ts` - isMfaEnabled -> twoFactorEnabled
- `backend/src/prisma/tenant-scoping/tenant-scoped-models.ts` - RefreshToken removed from list
- 22 controller files - Guard/decorator imports updated to common/auth/

## Decisions Made
- CLN-02 and CLN-03 DEFERRED: GDPR org-related updates require Phase 56 (Organizations) which has not shipped
- Replaced isMfaEnabled with twoFactorEnabled in users.service.ts (better-auth manages 2FA state)
- Updated 22 controllers as part of Task 1 (deviation) since they imported from the deleted directory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 22 broken controller imports after auth directory deletion**
- **Found during:** Task 1 (Delete old AuthModule)
- **Issue:** 22 controllers imported TenantGuard, RolesGuard, and Roles decorator from modules/auth/ which was deleted
- **Fix:** Updated all imports to use common/auth/ paths (../../../common/auth/)
- **Files modified:** 22 controller files across ai-chat, ai, calendar, compliance, contacts, email, email-sync, labels, providers, subscription modules
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 9088566c (Task 1 commit)

**2. [Rule 1 - Bug] Fixed isMfaEnabled reference in users.service.ts**
- **Found during:** Task 2 (Prisma field removal)
- **Issue:** users.service.ts selected isMfaEnabled which no longer exists in schema
- **Fix:** Changed to twoFactorEnabled (the better-auth equivalent field)
- **Files modified:** backend/src/modules/users/services/users.service.ts
- **Verification:** Build passes cleanly
- **Committed in:** c5888928 (Task 2 commit)

**3. [Rule 1 - Bug] Removed RefreshToken from tenant-scoped-models list**
- **Found during:** Task 2 (Prisma model removal)
- **Issue:** tenant-scoped-models.ts listed RefreshToken which no longer exists
- **Fix:** Removed entry from the array
- **Files modified:** backend/src/prisma/tenant-scoping/tenant-scoped-models.ts
- **Verification:** Build passes cleanly
- **Committed in:** c5888928 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes were necessary consequences of deleting the auth module and schema fields. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Legacy auth code fully eliminated
- CLN-02 and CLN-03 remain deferred until Phase 56 (Organizations) ships
- Codebase ready for any remaining compliance cleanup tasks

---
*Phase: 58-compliance-cleanup*
*Completed: 2026-03-09*
