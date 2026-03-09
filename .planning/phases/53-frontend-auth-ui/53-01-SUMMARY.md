---
phase: 53-frontend-auth-ui
plan: 01
subsystem: ui
tags: [better-auth-ui, middleware, next.js, auth, sonner, react-hook-form]

# Dependency graph
requires:
  - phase: 51-core-auth
    provides: better-auth server config (auth.ts) and authClient (auth-client.ts)
  - phase: 52-nestjs-session
    provides: BetterAuthGuard for API-side session validation
provides:
  - Server-side route protection via Next.js middleware with getSessionCookie
  - Dynamic auth pages (login, register, forgot-password, reset-password) via better-auth-ui
  - AuthUIProvider wrapping the app with viewPaths for login/register URL mapping
  - useSession, signIn, signUp, signOut convenience re-exports from auth-client
affects: [53-plan-02, 53-plan-03, 55-social-login]

# Tech tracking
tech-stack:
  added: ["@daveyplate/better-auth-ui", "sonner", "react-hook-form", "@hookform/resolvers", "zod", "input-otp"]
  patterns: ["Next.js middleware for optimistic cookie-based route protection", "Dynamic [authView] page with getStaticPaths", "AuthUIProvider with viewPaths remapping"]

key-files:
  created:
    - frontend/middleware.ts
    - frontend/pages/auth/[authView].tsx
  modified:
    - frontend/lib/auth-client.ts
    - frontend/pages/_app.tsx
    - frontend/styles/globals.css
    - frontend/package.json

key-decisions:
  - "Type inference with createAuthClient<typeof auth>() fails across client/server boundary (PrismaClient types); using untyped client with runtime additionalFields"
  - "viewPaths uses SIGN_IN/SIGN_UP keys (not sign-in/sign-up) mapping to login/register"
  - "Middleware is optimistic cookie-existence check only; real validation in useSession and NestJS guards"

patterns-established:
  - "Custom viewPaths in both AuthUIProvider and [authView].tsx getStaticPaths must stay in sync"
  - "better-auth-ui CSS imported via @import in globals.css (Tailwind v4 approach, not content path)"

requirements-completed: [FEUI-01, FEUI-02, FEUI-04]

# Metrics
duration: 9min
completed: 2026-03-09
---

# Phase 53 Plan 01: Frontend Auth Foundation Summary

**better-auth-ui auth pages with middleware route protection, AuthUIProvider, and useSession re-exports replacing AuthProvider + RouteGuard**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-09T07:42:17Z
- **Completed:** 2026-03-09T07:51:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Server-side route protection via middleware.ts with getSessionCookie (no flash of protected content)
- Dynamic auth page rendering sign-in/sign-up/forgot-password/reset-password with PMSync logo
- AuthUIProvider replacing AuthProvider + RouteGuard in _app.tsx
- Convenience re-exports (useSession, signIn, signUp, signOut) from auth-client.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages + create middleware + update auth-client + add CSS import** - `4e7bc2d2` (feat)
2. **Task 2: Create dynamic auth page + wire AuthUIProvider in _app.tsx** - `8bbfb703` (feat, from research phase pre-commit)

## Files Created/Modified
- `frontend/middleware.ts` - Server-side route protection using getSessionCookie
- `frontend/pages/auth/[authView].tsx` - Dynamic auth page with AuthView + custom viewPaths
- `frontend/pages/_app.tsx` - AuthUIProvider replaces AuthProvider + RouteGuard
- `frontend/lib/auth-client.ts` - Convenience re-exports for useSession, signIn, signUp, signOut
- `frontend/styles/globals.css` - better-auth-ui CSS import added
- `frontend/package.json` - better-auth-ui, sonner, react-hook-form, zod, and other peer deps

## Decisions Made
- Type inference with `createAuthClient<typeof auth>()` fails because PrismaClient types don't serialize across the client/server boundary. Falling back to untyped client -- additionalFields are available at runtime but not in TypeScript types. Consumers needing typed user fields can cast or use InferSessionFromClient.
- viewPaths prop on AuthUIProvider uses uppercase keys (SIGN_IN, SIGN_UP) matching the authViewPaths object shape, not the lowercase URL values.
- Middleware performs optimistic cookie-existence check only -- not full session validation. This is the recommended pattern from better-auth docs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing peer dependencies for better-auth-ui**
- **Found during:** Task 1 (package installation)
- **Issue:** better-auth-ui requires react-hook-form, @hookform/resolvers, zod, input-otp, and several @radix-ui packages as peer deps that were not in the project
- **Fix:** Ran `npm install react-hook-form @hookform/resolvers zod input-otp @radix-ui/react-checkbox @radix-ui/react-label @radix-ui/react-context @radix-ui/react-primitive @radix-ui/react-use-callback-ref @radix-ui/react-use-layout-effect`
- **Files modified:** frontend/package.json, frontend/package-lock.json
- **Verification:** Type-check passes, no missing module errors
- **Committed in:** 8bbfb703 (Task 2 commit)

**2. [Rule 1 - Bug] Dropped type inference that caused TS2559**
- **Found during:** Task 1 (auth-client.ts update)
- **Issue:** `createAuthClient<typeof auth>()` produces TS2559: Auth type has no properties in common with BetterAuthClientOptions
- **Fix:** Removed type parameter, kept untyped createAuthClient()
- **Files modified:** frontend/lib/auth-client.ts
- **Verification:** Type-check passes
- **Committed in:** 4e7bc2d2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Research/validation phase pre-committed some Task 2 changes (auth page, _app.tsx), resulting in a "nothing to commit" for Task 2. The work was verified correct in commit 8bbfb703.
- Research phase also modified consumer files (api-client.ts, Header.tsx, etc.) that belong to Plan 02 scope. These were restored to their committed state via `git checkout HEAD --`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth foundation pages are functional; Plan 02 can now remove old auth layer files and migrate all useAuth/useAuthStore consumers to useSession
- Plan 03 can update e2e tests for better-auth-ui selectors and cookie name
- Pre-existing type errors in test files (api-client-interceptor.spec.ts, download.test.ts) are unrelated to this plan

---
*Phase: 53-frontend-auth-ui*
*Completed: 2026-03-09*
