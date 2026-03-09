---
phase: 53-frontend-auth-ui
plan: 02
subsystem: ui
tags: [better-auth, auth-migration, useSession, signOut, e2e, cookie, zustand-removal]

# Dependency graph
requires:
  - phase: 53-frontend-auth-ui
    provides: AuthUIProvider, middleware.ts, auth-client.ts with useSession exports (Plan 01)
provides:
  - All frontend auth consumers migrated to authClient.useSession() / authClient.signOut()
  - Old Zustand auth store, AuthContext, useAuth hook deleted
  - Old auth pages (login, register, forgot-password, reset-password, verify-email, oauth-callback) deleted
  - 401 interceptor simplified (no JWT refresh queue, just signOut + redirect)
  - E2E fixtures updated for better-auth.session_token cookie
affects: [54-websocket-auth, 55-social-login]

# Tech tracking
tech-stack:
  added: []
  patterns: ["authClient.useSession() + SessionUser cast for typed user fields", "signOut() + redirect for 401 handling (no JWT refresh)", "better-auth.session_token cookie in E2E tests"]

key-files:
  created: []
  modified:
    - frontend/lib/api-client.ts
    - frontend/lib/auth-client.ts
    - frontend/components/layout/Header.tsx
    - frontend/components/layout/Layout.tsx
    - frontend/components/ai/CommandPalette/index.tsx
    - frontend/components/email/compose/ComposeEditor.tsx
    - frontend/components/dashboard/ProfileSettings.tsx
    - frontend/components/dashboard/settings/useSettingsState.ts
    - frontend/components/dashboard/settings/useSettingsHandlers.ts
    - frontend/components/providers/store-hydration.tsx
    - frontend/hooks/use-websocket.ts
    - frontend/hooks/use-theme-persistence.ts
    - frontend/hooks/ai/use-ai-actions.ts
    - frontend/pages/index.tsx
    - frontend/pages/dashboard/ai/follow-ups.tsx
    - frontend/__tests__/api-client-interceptor.spec.ts
    - frontend/hooks/ai/use-ai-actions.test.tsx
    - frontend/e2e/auth.setup.ts
    - frontend/e2e/fixtures.ts
  deleted:
    - frontend/stores/auth-store.ts
    - frontend/stores/auth-store.test.ts
    - frontend/lib/context/auth-context.tsx
    - frontend/lib/context/auth-context.test.tsx
    - frontend/lib/hooks/use-auth.ts
    - frontend/pages/auth/login.tsx
    - frontend/pages/auth/register.tsx
    - frontend/pages/auth/forgot-password.tsx
    - frontend/pages/auth/reset-password.tsx
    - frontend/pages/auth/verify-email.tsx
    - frontend/pages/auth/oauth-callback.tsx

key-decisions:
  - "SessionUser interface defined manually in auth-client.ts with additionalFields (firstName, lastName, role, tenantId, isActive) since type inference fails across client/server boundary"
  - "401 interceptor simplified to signOut + redirect; removed JWT refresh queue (isRefreshing, failedQueue, processQueue) as better-auth uses DB sessions with httpOnly cookies"
  - "Removed s.setUser() calls from avatar handlers in useSettingsHandlers.ts since better-auth manages user state via session"
  - "Removed token references from use-ai-actions.ts and use-theme-persistence.ts; better-auth uses cookies, no JWT tokens exposed to client"

patterns-established:
  - "Cast session?.user as SessionUser for typed additionalFields access"
  - "Use authClient.signOut() for logout, not store-based state clearing"
  - "E2E tests inject better-auth.session_token cookie via injectAuthCookie helper"

requirements-completed: [FEUI-02, FEUI-03, FEUI-04]

# Metrics
duration: 18min
completed: 2026-03-09
---

# Phase 53 Plan 02: Auth Consumer Migration Summary

**Migrated 15 consumer files from useAuth/useAuthStore to authClient.useSession(), deleted 11 old auth files (1912 lines), simplified 401 interceptor, and updated E2E for better-auth.session_token cookie**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-09T07:55:00Z
- **Completed:** 2026-03-09T08:13:00Z
- **Tasks:** 2
- **Files modified:** 30 (19 modified + 11 deleted)

## Accomplishments
- All 15 frontend auth consumer files migrated from useAuth/useAuthStore to authClient.useSession() and authClient.signOut()
- 401 interceptor completely rewritten: removed JWT refresh queue (isRefreshing, failedQueue, processQueue), replaced with simple signOut + redirect
- 11 old auth files deleted: 5 auth layer files (auth-store, auth-context, use-auth) + 6 old auth pages (login, register, forgot-password, reset-password, verify-email, oauth-callback)
- E2E fixtures updated: cookie name access_token -> better-auth.session_token, removed /auth/me mock route
- Unit tests rewritten to mock @/lib/auth-client instead of @/stores/auth-store
- Zero references to old auth layer remain in production code

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate all auth consumers to useSession and update api-client** - `4f205799` (feat)
2. **Task 2: Delete old auth files, old auth pages, update tests and E2E** - `51beb3e3` (feat)

## Files Created/Modified
- `frontend/lib/api-client.ts` - 401 interceptor simplified to signOut + redirect (removed JWT refresh queue)
- `frontend/lib/auth-client.ts` - Added SessionUser interface with additionalFields
- `frontend/components/layout/Header.tsx` - useSession + SessionUser cast, user.image replaces avatarUrl
- `frontend/components/layout/Layout.tsx` - Removed useAuth import and call
- `frontend/components/ai/CommandPalette/index.tsx` - authClient.signOut() replaces useAuthStore logout
- `frontend/components/email/compose/ComposeEditor.tsx` - useSession replaces useAuthStore
- `frontend/components/dashboard/ProfileSettings.tsx` - useSession replaces useAuth
- `frontend/components/dashboard/settings/useSettingsState.ts` - useSession replaces useAuth + useAuthStore, removed setUser
- `frontend/components/dashboard/settings/useSettingsHandlers.ts` - Removed s.setUser() calls from avatar handlers
- `frontend/components/providers/store-hydration.tsx` - Updated JSDoc example to use authClient.useSession()
- `frontend/hooks/use-websocket.ts` - useSession replaces useAuth + useAuthStore
- `frontend/hooks/use-theme-persistence.ts` - useSession replaces useAuth, removed token references
- `frontend/hooks/ai/use-ai-actions.ts` - Removed useAuthStore import and token usage
- `frontend/pages/index.tsx` - isPending from useSession replaces isLoading from useAuth
- `frontend/pages/dashboard/ai/follow-ups.tsx` - useSession replaces useAuth
- `frontend/__tests__/api-client-interceptor.spec.ts` - Rewritten to mock @/lib/auth-client
- `frontend/hooks/ai/use-ai-actions.test.tsx` - Removed useAuthStore mock entirely
- `frontend/e2e/auth.setup.ts` - Cookie: better-auth.session_token, removed /auth/me mock
- `frontend/e2e/fixtures.ts` - Cookie name updated, removed /auth/me mock route

## Files Deleted (11)
- `frontend/stores/auth-store.ts` - Old Zustand auth store
- `frontend/stores/auth-store.test.ts` - Auth store tests
- `frontend/lib/context/auth-context.tsx` - Old AuthContext provider
- `frontend/lib/context/auth-context.test.tsx` - AuthContext tests
- `frontend/lib/hooks/use-auth.ts` - Old useAuth hook
- `frontend/pages/auth/login.tsx` - Old login page (replaced by [authView].tsx)
- `frontend/pages/auth/register.tsx` - Old register page
- `frontend/pages/auth/forgot-password.tsx` - Old forgot-password page
- `frontend/pages/auth/reset-password.tsx` - Old reset-password page
- `frontend/pages/auth/verify-email.tsx` - Old verify-email page
- `frontend/pages/auth/oauth-callback.tsx` - Old OAuth callback page

## Decisions Made
- Created SessionUser interface manually in auth-client.ts rather than attempting type inference from server auth config. Type inference with `createAuthClient<typeof auth>()` fails because PrismaClient types are server-only and produce TS2559. Consumers cast `session?.user as SessionUser` for typed access.
- Removed all `s.setUser()` calls from useSettingsHandlers.ts avatar handlers. better-auth manages user state via the session; there is no local Zustand user state to update anymore.
- Removed `token` references from use-ai-actions.ts and use-theme-persistence.ts entirely. better-auth uses httpOnly cookies -- no JWT token is exposed to the client.
- Simplified 401 interceptor to a single signOut + redirect. The old JWT refresh queue (isRefreshing, failedQueue, processQueue, retry logic) was dead code with DB-backed sessions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added SessionUser interface to auth-client.ts**
- **Found during:** Task 1 (consumer migration)
- **Issue:** better-auth's default client types only include basic fields (id, name, email, image); additionalFields (firstName, lastName, role, tenantId, isActive) are not typed
- **Fix:** Created SessionUser interface with all fields and used type casts at consumer sites
- **Files modified:** frontend/lib/auth-client.ts, all consumer files
- **Verification:** Type-check passes, all consumers access typed fields
- **Committed in:** 4f205799 (Task 1 commit)

**2. [Rule 1 - Bug] Removed s.setUser() calls from useSettingsHandlers avatar handlers**
- **Found during:** Task 1 (useSettingsState migration)
- **Issue:** After removing setUser from useSettingsState (Zustand state setter), three avatar handlers in useSettingsHandlers.ts still called s.setUser() causing compilation errors
- **Fix:** Removed all s.setUser() calls from handleAvatarUpload, handleAvatarRemove, handleAvatarSave
- **Files modified:** frontend/components/dashboard/settings/useSettingsHandlers.ts
- **Verification:** Type-check passes
- **Committed in:** 4f205799 (Task 1 commit)

**3. [Rule 1 - Bug] Removed stale token references from use-ai-actions.ts**
- **Found during:** Task 1 (consumer migration)
- **Issue:** After removing `const { token } = useAuthStore()`, the token variable was still referenced in websocket effect condition and dependency array
- **Fix:** Removed `!token` from effect condition and `token` from dependency array
- **Files modified:** frontend/hooks/ai/use-ai-actions.ts
- **Verification:** Type-check passes
- **Committed in:** 4f205799 (Task 1 commit)

**4. [Rule 1 - Bug] Removed stale token references from use-theme-persistence.ts**
- **Found during:** Task 1 (consumer migration)
- **Issue:** fetchThemeFromDB and saveThemeToDB checked `!token` which no longer exists
- **Fix:** Removed `|| !token` conditions and `token` from useCallback dependency arrays
- **Files modified:** frontend/hooks/use-theme-persistence.ts
- **Verification:** Type-check passes
- **Committed in:** 4f205799 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (1 missing critical, 3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness after auth store removal. No scope creep.

## Issues Encountered
- File edits were silently reverted by the linter/file watcher during initial attempts. Switched to sed via Bash for bulk replacements, then applied larger block changes with Edit after old auth modules were deleted (removing the import targets that triggered type-check failures in the pre-commit hook).
- Pre-existing type error in download.test.ts unrelated to auth migration; ignored as out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend auth migration is complete. Zero references to old auth layer remain in production code.
- Phase 54 (WebSocket Auth) can proceed -- websocket hook already uses authClient.useSession() for connection gating
- Phase 55 (Social Login & MFA) can proceed -- AuthUIProvider is wired, social buttons just need OAuth plugin config
- E2E test infrastructure updated for better-auth.session_token cookie

## Self-Check: PASSED

- Commits 4f205799 and 51beb3e3: FOUND
- All 11 deleted files: CONFIRMED DELETED
- All key modified files: FOUND
- 53-01-SUMMARY.md and 53-02-SUMMARY.md: FOUND
- Zero old auth references in production code: CLEAN

---
*Phase: 53-frontend-auth-ui*
*Completed: 2026-03-09*
