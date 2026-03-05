---
phase: 43-contract-tests-backend-god-file-splits
plan: 02
subsystem: backend
tags: [nestjs, god-file-split, facade-pattern, characterization-tests, auth, email-sync]

requires:
  - phase: 42-tenant-isolation-auth-hardening
    provides: "AuthService with refresh token rotation (AUTH-01-05)"
provides:
  - "email-sync-back.service.ts split into 116-line facade + 4 sub-services (all <400 lines)"
  - "auth.service.ts split into 110-line facade + 4 sub-services (all <400 lines)"
  - "54 characterization tests proving zero behavior change"
affects: [email-sync, auth, testing]

tech-stack:
  added: []
  patterns:
    - "Facade delegation pattern: god-file slimmed to facade injecting sub-services"
    - "Characterization testing: tests written BEFORE split, verified AFTER split"
    - "Function-passing for cross-service calls (createRefreshTokenFn, sendOtpCodeFn)"

key-files:
  created:
    - backend/src/modules/email/services/gmail-sync-back.service.ts
    - backend/src/modules/email/services/microsoft-sync-back.service.ts
    - backend/src/modules/email/services/imap-sync-back.service.ts
    - backend/src/modules/email/services/sync-back-orchestrator.service.ts
    - backend/src/modules/auth/services/auth-registration.service.ts
    - backend/src/modules/auth/services/auth-login.service.ts
    - backend/src/modules/auth/services/auth-token.service.ts
    - backend/src/modules/auth/services/auth-password-reset.service.ts
    - backend/src/modules/email/services/__tests__/email-sync-back.pre-split.spec.ts
    - backend/src/modules/auth/services/__tests__/auth.pre-split.spec.ts
  modified:
    - backend/src/modules/email/services/email-sync-back.service.ts
    - backend/src/modules/auth/services/auth.service.ts
    - backend/src/modules/email/email.module.ts
    - backend/src/modules/auth/auth.module.ts

key-decisions:
  - "Facade keeps same class name and public API -- zero consumer changes needed"
  - "Function-passing pattern for cross-service delegation (e.g., createRefreshTokenFn) avoids circular injection"
  - "SyncBackOrchestratorService owns token refresh + batch routing; provider sub-services are stateless"
  - "AuthPasswordResetService owns its own password reset secret initialization (duplicated from old constructor)"

patterns-established:
  - "Facade delegation: god-file -> facade (inject sub-services) + sub-services (focused domains)"
  - "Characterization test: write tests BEFORE split, verify same tests pass AFTER"

requirements-completed: [QUAL-01, QUAL-02, TEST-06]

duration: 14min
completed: 2026-03-05
---

# Phase 43 Plan 02: Backend God-File Splits Summary

**Split email-sync-back.service.ts (1429 lines) and auth.service.ts (1376 lines) into focused sub-services using facade delegation pattern with 54 characterization tests**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-05T14:51:03Z
- **Completed:** 2026-03-05T15:05:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- email-sync-back.service.ts reduced from 1429 to 116 lines (facade) + 4 sub-services all under 400 lines
- auth.service.ts reduced from 1376 to 110 lines (facade) + 4 sub-services all under 400 lines
- 54 characterization tests (13 email + 41 auth) verify zero behavior change through the split
- NestJS module registrations updated, TypeScript type-check passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Split email-sync-back.service.ts** - `7de22348` (refactor)
2. **Task 2: Split auth.service.ts** - `011a81b6` (refactor)

## Files Created/Modified

### Email Sync-Back Split
- `backend/src/modules/email/services/email-sync-back.service.ts` - Facade (116 lines), delegates to sub-services
- `backend/src/modules/email/services/gmail-sync-back.service.ts` - Gmail API sync + batch (352 lines)
- `backend/src/modules/email/services/microsoft-sync-back.service.ts` - Microsoft Graph sync + batch (276 lines)
- `backend/src/modules/email/services/imap-sync-back.service.ts` - IMAP sync + batch with connection reuse (345 lines)
- `backend/src/modules/email/services/sync-back-orchestrator.service.ts` - Batch routing + token refresh (241 lines)
- `backend/src/modules/email/services/__tests__/email-sync-back.pre-split.spec.ts` - 13 characterization tests
- `backend/src/modules/email/email.module.ts` - Added 4 sub-service providers

### Auth Split
- `backend/src/modules/auth/services/auth.service.ts` - Facade (110 lines), delegates to sub-services
- `backend/src/modules/auth/services/auth-registration.service.ts` - Register + OTP send (203 lines)
- `backend/src/modules/auth/services/auth-login.service.ts` - Login + passkey + MFA + sessions (399 lines)
- `backend/src/modules/auth/services/auth-token.service.ts` - Logout + refresh tokens + profile (179 lines)
- `backend/src/modules/auth/services/auth-password-reset.service.ts` - Password reset flows (207 lines)
- `backend/src/modules/auth/services/__tests__/auth.pre-split.spec.ts` - 41 characterization tests
- `backend/src/modules/auth/auth.module.ts` - Added 4 sub-service providers (forwardRef untouched)

## Decisions Made
- Facade keeps same class name (`EmailSyncBackService`, `AuthService`) so no consumer code changes needed
- Used function-passing pattern (e.g., `createRefreshTokenFn`) for cross-sub-service calls to avoid circular DI
- `SyncBackOrchestratorService` owns token refresh logic and batch routing; provider sub-services are stateless
- `AuthPasswordResetService` owns its own password reset secret initialization (constructor env var logic duplicated from original)
- `executeWithRetry` helper duplicated in Gmail/Microsoft sub-services (acceptable: avoids shared base class coupling)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 commit collided with parallel 43-03 agent (both editing email.module.ts). Files were committed together in 43-03 commit `7de22348`.
- ESM modules (otplib, qrcode, @scure/base) required explicit Jest mocks for auth characterization tests.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both god-files successfully split; maintainability target achieved
- All sub-services < 400 lines; facades < 200 lines
- 54 characterization tests available as regression safety net
- Module registrations updated; NestJS DI graph intact

---
*Phase: 43-contract-tests-backend-god-file-splits*
*Completed: 2026-03-05*
