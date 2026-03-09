---
phase: 58-compliance-cleanup
plan: 01
subsystem: auth
tags: [better-auth, audit-log, guards, nestjs, prisma]

requires:
  - phase: 55-social-login-mfa
    provides: better-auth instance with hooks.before, social providers, 2FA/passkey plugins
provides:
  - "logAuthEvent function for fire-and-forget audit logging of auth lifecycle events"
  - "TenantGuard, RolesGuard, Roles decorator in common/auth/ (survives old AuthModule deletion)"
  - "AUDIT_PATHS mapping for 12 auth event types"
affects: [58-02-old-auth-deletion, compliance, audit]

tech-stack:
  added: []
  patterns: ["fire-and-forget audit via void + try/catch swallow", "guard relocation for module cleanup"]

key-files:
  created:
    - backend/src/common/auth/audit-hooks.ts
    - backend/src/common/auth/tenant.guard.ts
    - backend/src/common/auth/roles.guard.ts
    - backend/src/common/auth/roles.decorator.ts
  modified:
    - backend/src/common/auth/better-auth.instance.ts
    - backend/src/modules/users/controllers/users.controller.ts
    - backend/src/modules/tenants/controllers/tenants.controller.ts
    - backend/src/modules/ai/controllers/knowledge-base.controller.ts
    - backend/src/modules/ai/controllers/ai.controller.ts

key-decisions:
  - "Exported getRequestIp from better-auth.instance.ts rather than duplicating"
  - "Cast metadata as Prisma.InputJsonValue for AuditLog.changes JSON field compatibility"
  - "Copied guards (not moved) -- old files preserved for Plan 02 full directory deletion"

patterns-established:
  - "Auth audit: void logAuthEvent() pattern for non-blocking audit writes"
  - "Guard location: common/auth/ is canonical path for shared auth guards"

requirements-completed: [CLN-01]

duration: 4min
completed: 2026-03-09
---

# Phase 58 Plan 01: Auth Audit Hooks & Guard Relocation Summary

**Fire-and-forget AuditLog wiring for 12 better-auth lifecycle events plus TenantGuard/RolesGuard relocation to common/auth/ for old AuthModule deletion**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T15:57:52Z
- **Completed:** 2026-03-09T16:02:13Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created audit-hooks.ts with AUDIT_PATHS mapping (12 event types) and logAuthEvent function
- Wired hooks.after into better-auth instance for all auth events (fire-and-forget via void)
- Added signup-specific audit in databaseHooks after workspace provisioning (tenantId available)
- Relocated TenantGuard, RolesGuard, and Roles decorator to common/auth/ with all 4 consumer imports updated

## Task Commits

Each task was committed atomically:

1. **Task 1: Create audit-hooks.ts and wire into better-auth hooks.after** - `c26e32fa` (feat)
2. **Task 2: Relocate TenantGuard, RolesGuard, Roles decorator to common/auth/** - `cf29e21e` (feat)

## Files Created/Modified
- `backend/src/common/auth/audit-hooks.ts` - AUDIT_PATHS mapping + logAuthEvent function
- `backend/src/common/auth/better-auth.instance.ts` - hooks.after + signup audit + exported getRequestIp
- `backend/src/common/auth/tenant.guard.ts` - TenantGuard copied from modules/auth/guards/
- `backend/src/common/auth/roles.guard.ts` - RolesGuard copied with adjusted decorator import
- `backend/src/common/auth/roles.decorator.ts` - Roles decorator copied from modules/auth/decorators/
- `backend/src/modules/users/controllers/users.controller.ts` - Import path updated to common/auth/
- `backend/src/modules/tenants/controllers/tenants.controller.ts` - Import paths updated to common/auth/
- `backend/src/modules/ai/controllers/knowledge-base.controller.ts` - Import path updated to common/auth/
- `backend/src/modules/ai/controllers/ai.controller.ts` - Import path updated to common/auth/

## Decisions Made
- Exported getRequestIp from better-auth.instance.ts rather than duplicating the helper in audit-hooks.ts
- Cast metadata as Prisma.InputJsonValue to satisfy AuditLog.changes JSON field type constraints
- Copied guards/decorator rather than moving -- old files preserved for Plan 02 which deletes the entire modules/auth/ directory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Prisma JSON type mismatch for AuditLog.changes**
- **Found during:** Task 1 (audit-hooks.ts creation)
- **Issue:** `Record<string, unknown>` not assignable to Prisma's `InputJsonValue` type
- **Fix:** Cast metadata as `Prisma.InputJsonValue` and imported `Prisma` type
- **Files modified:** backend/src/common/auth/audit-hooks.ts
- **Verification:** Type-check passes clean
- **Committed in:** c26e32fa (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type cast necessary for Prisma compatibility. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Guards and decorator available at common/auth/ -- Plan 02 can safely delete entire modules/auth/ directory
- All auth lifecycle events audited -- CLN-01 compliance requirement satisfied
- hooks.after and databaseHooks both fire-and-forget, zero impact on auth response times

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (c26e32fa, cf29e21e) verified in git log.

---
*Phase: 58-compliance-cleanup*
*Completed: 2026-03-09*
