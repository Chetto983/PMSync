---
phase: 07-security-hardening
plan: 03
subsystem: auth
tags: [oauth, google, microsoft, token-revocation, security]

# Dependency graph
requires:
  - phase: 07-01
    provides: Base security infrastructure
provides:
  - Google OAuth token revocation on provider disconnect
  - Microsoft session revocation (best-effort) on provider disconnect
  - Revocation integrated into provider deletion flow
affects: [provider-management, oauth-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Best-effort token revocation pattern (never blocks deletion)
    - Google revoke endpoint integration
    - Microsoft Graph session revocation

key-files:
  created: []
  modified:
    - backend/src/modules/providers/services/google-oauth.service.ts
    - backend/src/modules/providers/services/microsoft-oauth.service.ts
    - backend/src/modules/providers/services/provider-config.service.ts

key-decisions:
  - "Revocation failures never block provider deletion (best-effort)"
  - "Google: revoke refresh token (invalidates all access tokens)"
  - "Microsoft: attempt session revocation (may fail with 403 if permission not granted)"

patterns-established:
  - "Best-effort cleanup: log warnings but never throw"

# Metrics
duration: 12min
completed: 2026-02-04
---

# Phase 07 Plan 03: OAuth Token Revocation on Provider Disconnect

**Google and Microsoft OAuth token revocation integrated into provider disconnect flow with best-effort pattern (SEC-02)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-04T16:XX:XXZ
- **Completed:** 2026-02-04T16:XX:XXZ
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- GoogleOAuthService.revokeToken() calls official Google revocation endpoint
- MicrosoftOAuthService.revokeSession() attempts Graph API session revocation
- ProviderConfigService.deleteProviderConfig() calls revocation BEFORE database deletion
- Revocation failures are logged as warnings but never block provider deletion

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Google Token Revocation** - `0f2de3ca` (feat)
2. **Task 2: Add Microsoft Session Revocation** - `8c53e607` (feat)
3. **Task 3: Wire Revocation into Provider Disconnect** - `b7737134` (feat)

## Files Modified

- `backend/src/modules/providers/services/google-oauth.service.ts` - Added revokeToken() method calling Google's revocation endpoint
- `backend/src/modules/providers/services/microsoft-oauth.service.ts` - Added revokeSession() method calling Graph API
- `backend/src/modules/providers/services/provider-config.service.ts` - Added revokeProviderTokens() private method and wired into deleteProviderConfig()

## Decisions Made

1. **Best-effort revocation pattern** - Revocation failures (network errors, expired tokens, permission denied) are logged as warnings but never block provider deletion. User experience prioritized over guaranteed revocation.

2. **Google: Revoke refresh token** - Revoking the refresh token automatically invalidates all associated access tokens per Google's documentation.

3. **Microsoft: Session revocation** - Uses `/me/revokeSignInSessions` Graph API endpoint. Note that Microsoft does NOT have a true token revocation API - this invalidates refresh tokens but access tokens remain valid for up to 1 hour.

4. **IMAP providers skipped** - No OAuth tokens to revoke for IMAP/generic providers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEC-02 (OAuth Revocation) requirement satisfied
- Ready for Phase 07-04 (CSRF Protection) and 07-05 (Rate Limiting)

---
*Phase: 07-security-hardening*
*Completed: 2026-02-04*
