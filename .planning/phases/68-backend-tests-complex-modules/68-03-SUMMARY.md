---
phase: 68-backend-tests-complex-modules
plan: "03"
subsystem: testing
tags: [jest, google-oauth, imap, provider-config, oauth2, imapflow, integration-tests]

# Dependency graph
requires:
  - phase: 68-00
    provides: test infrastructure and helper patterns for Phase 68 specs
provides:
  - "GoogleOAuthService integration tests: 12 tests covering refreshAccessToken, revokeToken, and token lifecycle (blocking refresh, background refresh, valid token passthrough)"
  - "ProviderConfigService integration tests: 8 tests covering plan limits, token encryption, event emission, getProviderConfig, deleteProviderConfig"
  - "ImapService unit tests: 6 tests covering testConnection success/failure, createClient, testSmtpConnection"
  - "Factory enhancement: createTestProviderAccount now supports refreshTokenEncryptionIv and tokenEncryptionIv overrides"
affects: [68-04, 68-05, BTEST-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "better-auth ESM mock: jest.mock('../../../common/auth/better-auth.module', () => ({ BETTER_AUTH: 'BETTER_AUTH' })) required for any spec importing ProviderConfigService"
    - "Concurrent spec safety: omit cleanupTestData() TRUNCATE from provider spec afterAll to avoid FK races; rely on global teardown instead"
    - "Prototype-level OAuth mock: jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockResolvedValue({...}) for service that builds client internally"
    - "ImapFlow mock: jest.mock('imapflow') at file top prevents real IMAP connections; MockedImapFlow.prototype.connect for per-test control"

key-files:
  created:
    - backend/src/modules/providers/services/__tests__/google-oauth.service.spec.ts
    - backend/src/modules/providers/services/__tests__/provider-config.service.spec.ts
    - backend/src/modules/providers/services/__tests__/imap.service.spec.ts
  modified:
    - backend/test/helpers/factories.ts

key-decisions:
  - "Omit cleanupTestData() TRUNCATE CASCADE from provider spec afterAll — concurrent Jest workers cause FK violations when one spec truncates tenants while another is mid-test"
  - "createTestProviderAccount factory enhanced with refreshTokenEncryptionIv and tokenEncryptionIv override support — required for token refresh path tests"
  - "OAuth2Client prototype spy pattern: service instantiates client in constructor, mocking at prototype level ensures the internal instance is also mocked"
  - "testGmailLabels used as proxy for getProviderWithTokens testing — cleanest path to exercise token lifecycle logic without new public methods"

patterns-established:
  - "ESM better-auth mock: required for any NestJS spec that imports ProviderConfigService"
  - "Concurrent spec cleanup: targeted deleteMany only, no TRUNCATE CASCADE in afterAll when specs share DB worker"

requirements-completed: [BTEST-03]

# Metrics
duration: 25min
completed: 2026-03-11
---

# Phase 68 Plan 03: ProviderConfig/OAuth Tests Summary

**Three providers module spec files proving OAuth token lifecycle, plan-limit enforcement, token encryption, and IMAP connection validation across 26 integration tests**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-11T19:10:00Z
- **Completed:** 2026-03-11T19:35:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 12 GoogleOAuthService tests covering all OAuth error paths (success, invalid_grant, insufficient_scope, missing token, revokeToken success/400/500/network error) and 3 DB token lifecycle scenarios
- 8 ProviderConfigService tests verifying plan limit enforcement, token encryption (enc:value format), ProviderConnectedEvent/ProviderDisconnectedEvent emission, and NotFoundException paths
- 6 ImapService unit tests with fully mocked ImapFlow covering connect success/failure and createClient construction
- Factory `createTestProviderAccount` enhanced with `refreshTokenEncryptionIv` and `tokenEncryptionIv` override support

## Task Commits

Each task was committed atomically:

1. **Task 1: GoogleOAuthService tests** - `f4fe711c` (feat)
2. **Task 2: ProviderConfigService and ImapService tests** - `b20920fd` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/modules/providers/services/__tests__/google-oauth.service.spec.ts` - 12 OAuth lifecycle tests
- `backend/src/modules/providers/services/__tests__/provider-config.service.spec.ts` - 8 provider CRUD/limit tests
- `backend/src/modules/providers/services/__tests__/imap.service.spec.ts` - 6 IMAP connection tests
- `backend/test/helpers/factories.ts` - Added refreshTokenEncryptionIv/tokenEncryptionIv overrides to createTestProviderAccount

## Decisions Made
- Omit `cleanupTestData()` TRUNCATE CASCADE from provider spec `afterAll` — when Jest runs these 3 spec files concurrently, one spec's TRUNCATE deletes tenants that another spec is mid-test creating rows for. Targeted `deleteMany` by tracked IDs is safe and sufficient; global teardown handles final cleanup.
- `createTestProviderAccount` factory enhanced with `refreshTokenEncryptionIv` and `tokenEncryptionIv` fields — the service checks `provider.refreshToken && provider.refreshTokenEncryptionIv` before refresh, so both fields must be set for refresh path tests to trigger.
- Used `testGmailLabels` as the proxy to exercise `getProviderWithTokens` (private method) — cleanest entry point without modifying the production service.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added refreshTokenEncryptionIv support to createTestProviderAccount factory**
- **Found during:** Task 1 (GoogleOAuthService token lifecycle tests)
- **Issue:** Factory created provider with `refreshToken` but no `refreshTokenEncryptionIv`; service's `getProviderWithTokens` gate `provider.refreshToken && provider.refreshTokenEncryptionIv` never passed, blocking refresh assertions
- **Fix:** Enhanced factory to accept `refreshTokenEncryptionIv` override and auto-set it to `'test-refresh-iv'` when `refreshToken` is non-null
- **Files modified:** `backend/test/helpers/factories.ts`
- **Verification:** Both expired-token and near-expiry tests now assert `toHaveBeenCalledTimes(1)` correctly
- **Committed in:** f4fe711c (Task 1 commit)

**2. [Rule 3 - Blocking] Added jest.mock for better-auth.module to prevent ESM parse error**
- **Found during:** Task 2 (ProviderConfigService tests)
- **Issue:** `provider-config.service.ts` imports `BETTER_AUTH` from `better-auth.module`, which transitively imports `better-auth` ESM-only package; Jest cannot parse ESM imports
- **Fix:** Added `jest.mock('../../../../common/auth/better-auth.module', () => ({ BETTER_AUTH: 'BETTER_AUTH' }))` at top of spec file, matching pattern from `realtime-handshake.cookie.spec.ts`
- **Files modified:** `provider-config.service.spec.ts`
- **Verification:** All 8 provider-config tests pass
- **Committed in:** b20920fd (Task 2 commit)

**3. [Rule 3 - Blocking] Removed cleanupTestData() TRUNCATE from provider spec afterAll methods**
- **Found during:** Task 2 (running all 3 providers specs together)
- **Issue:** Concurrent Jest workers race: spec A's `afterAll` TRUNCATE cascades to `tenants` while spec B's `deleteProviderConfig` test is creating a fresh tenant+provider, causing FK violation
- **Fix:** Removed `cleanupTestData()` from `google-oauth.service.spec.ts` and `provider-config.service.spec.ts` afterAll; kept targeted `deleteMany` by tracked IDs; global teardown handles final TRUNCATE
- **Files modified:** both spec files
- **Verification:** All 26 tests pass when all 3 provider specs run together (`npx jest --testPathPatterns="providers.*spec"`)
- **Committed in:** b20920fd (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and test stability. No scope creep.

## Issues Encountered
- `jest.mock` for `imapflow` works as expected since `transformIgnorePatterns` in `jest.config.js` already includes `imapflow` in the transform list (not ignored)
- "Worker process failed to exit gracefully" warning is pre-existing: `ImapService` constructor starts a `setInterval` cleanup loop; this is not a test defect

## Next Phase Readiness
- BTEST-03 requirement satisfied: all three providers service spec files pass
- Pattern established for better-auth ESM mock — use in any spec touching ProviderConfigService or similar DI services that pull in better-auth

---
*Phase: 68-backend-tests-complex-modules*
*Completed: 2026-03-11*
