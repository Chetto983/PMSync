---
phase: 125-dead-code-removal
plan: 01
subsystem: auth
tags: [swagger, openapi, cookie-auth, dead-code-removal, nestjs]

requires:
  - phase: v5.0 better-auth migration
    provides: cookie-based auth replacing JWT dual-stack
provides:
  - "All 39 controllers use @ApiCookieAuth() decorator"
  - "Swagger UI shows cookie-based auth (no Bearer option)"
  - "Dead JWT key generation script removed"
  - "Guard comments cleaned of JWT transitional references"
affects: [125-02, 125-03, swagger, openapi-spec]

tech-stack:
  added: []
  patterns: ["@ApiCookieAuth() as standard Swagger auth decorator"]

key-files:
  created: []
  modified:
    - backend/src/main.ts
    - backend/scripts/generate-openapi.ts
    - backend/src/common/auth/better-auth.guard.ts
    - backend/src/common/auth/roles.guard.ts
    - backend/src/common/auth/tenant.guard.ts

key-decisions:
  - "Included ticket.controller.ts (39th file) not in original plan -- same dead code pattern"
  - "JWT_SECRET removal skipped: .env is gitignored and not in version control"

patterns-established:
  - "@ApiCookieAuth(): all controllers use cookie auth for Swagger"
  - "addCookieAuth('better-auth.session_token'): Swagger DocumentBuilder pattern"

requirements-completed: [LEGC-01]

duration: 5min
completed: 2026-03-31
---

# Phase 125 Plan 01: JWT/Bearer Auth Dead Code Removal Summary

**Replaced all 47 @ApiBearerAuth decorators with @ApiCookieAuth across 39 controllers, switched Swagger to cookie auth, deleted dead ES256 key gen script**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T07:18:31Z
- **Completed:** 2026-03-31T07:23:33Z
- **Tasks:** 2
- **Files modified:** 45 (39 controllers + 3 config/guard + 1 script + 2 swagger files)

## Accomplishments
- Replaced @ApiBearerAuth with @ApiCookieAuth in all 39 controller files (47 decorator occurrences)
- Switched Swagger DocumentBuilder from addBearerAuth() to addCookieAuth('better-auth.session_token') in main.ts and generate-openapi.ts
- Deleted dead backend/scripts/generate-es256-keys.ts JWT key generation script
- Cleaned JWT transitional comments from better-auth.guard.ts, roles.guard.ts, tenant.guard.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace @ApiBearerAuth with @ApiCookieAuth in all 39 controllers** - `9f3f7658` (feat)
2. **Task 2: Clean Swagger config, delete dead scripts, remove guard comments** - `9371782a` (chore)

## Files Created/Modified
- `backend/src/modules/*/controllers/*.controller.ts` (39 files) - Replaced ApiBearerAuth import and decorator with ApiCookieAuth
- `backend/src/main.ts` - Swagger DocumentBuilder uses addCookieAuth
- `backend/scripts/generate-openapi.ts` - OpenAPI spec generator uses addCookieAuth
- `backend/scripts/generate-es256-keys.ts` - DELETED (dead JWT key gen script)
- `backend/src/common/auth/better-auth.guard.ts` - Removed "(no JWT)" comment
- `backend/src/common/auth/roles.guard.ts` - Removed "former JWT payload" comment
- `backend/src/common/auth/tenant.guard.ts` - Removed "former JWT payload" comment

## Decisions Made
- Included ticket.controller.ts (39th controller, not in original plan list of 38) because it had the same ApiBearerAuth dead code pattern. Added after plan was written during CRM ticket feature.
- Skipped JWT_SECRET removal from backend/.env since .env is gitignored and not tracked in version control. The env templates (.env.example, .env.railway.template) already had no JWT_SECRET.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Included ticket.controller.ts in replacement**
- **Found during:** Task 1 (ApiBearerAuth replacement)
- **Issue:** Plan listed 38 controllers but ticket.controller.ts was added after research, also has @ApiBearerAuth
- **Fix:** Included ticket.controller.ts in the replacement (39 files total instead of 38)
- **Files modified:** backend/src/modules/crm/ticket/controllers/ticket.controller.ts
- **Verification:** grep confirms zero ApiBearerAuth remaining across all backend/src/
- **Committed in:** 9f3f7658 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for completeness -- leaving one controller with dead auth would defeat the purpose.

## Issues Encountered
- Pre-existing TypeScript errors in test files (qwen-migration-e2e.test.ts, setup.ts) and some modules with missing declarations. These are unrelated to our changes and exist in the worktree environment.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All JWT/Bearer auth dead code removed from Swagger layer
- Ready for 125-02 (deprecated API alias removal) and 125-03 (tailwindcss base injection removal)
- Legitimate JWT usage preserved: Gmail webhook OIDC, Microsoft OAuth, sandbox service, PII sentinel

---
*Phase: 125-dead-code-removal*
*Completed: 2026-03-31*
