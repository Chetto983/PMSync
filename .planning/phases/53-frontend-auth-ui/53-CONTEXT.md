# Phase 53: Frontend Auth UI - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Users interact with polished login/signup pages built with better-auth-ui shadcn components and the app manages sessions entirely through better-auth client. Old custom auth layer (Zustand store, AuthContext, /auth/me) is removed. Protected routes redirect unauthenticated users to login with return URL preserved.

Requirements: FEUI-01, FEUI-02, FEUI-03, FEUI-04

</domain>

<decisions>
## Implementation Decisions

### Auth Page Styling
- Use better-auth-ui pre-built shadcn components (`<SignIn />`, `<SignUp />`) — no custom forms
- Centered card layout with PMSync logo above the card (current pattern preserved)
- Wrap better-auth-ui in MUI ThemeProvider so fonts and colors match dashboard
- Delete old MUI auth pages and replace with new better-auth-ui pages (clean start)

### Session State Wiring
- Replace AuthContext + auth-store + /auth/me with `useSession()` from better-auth/react
- Session provider lives in `_app.tsx` top-level (replaces current AuthProvider in same spot)
- Full-page spinner/skeleton during session validation on page load (prevents flash of login for authenticated users)
- On session expiry mid-task: soft redirect with toast/modal "Session expired" + return URL preserved
- Use better-auth's session.user shape directly across the app (no adapter hook)

### Route Protection
- Next.js middleware (`middleware.ts`) checks for better-auth session cookie server-side — no flash of protected content
- Protected: everything under `/dashboard/*` requires session
- Public: `/auth/*`, `/` (landing), API routes, `_next/` assets
- Return URL: redirect to `/auth/login?returnTo=/original/path` — after login, redirect back
- Authenticated users hitting `/auth/*` pages auto-redirect to `/dashboard`

### Old Auth Cleanup
- Delete all old auth files: `auth-store.ts`, `auth-context.tsx`, `use-auth.ts`
- Delete old auth pages: `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`, `oauth-callback.tsx`
- Replace apiClient 401 interceptor with better-auth aware handler (`authClient.signOut()` + redirect to `/auth/login?returnTo=...`)
- Update all consumers of old User type / useAuth / AuthContext to use better-auth useSession
- Update e2e tests (`auth.setup.ts`, `auth.spec.ts`) to use better-auth sign-in flow

### Claude's Discretion
- Exact spinner/skeleton design for session loading state
- Toast vs modal for session expiry notification
- better-auth-ui component configuration options (field order, social buttons, terms link)
- Middleware cookie validation approach (cookie existence check vs session verification)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/auth-client.ts`: better-auth React client already created (`createAuthClient()` with no baseURL)
- `lib/auth.ts`: better-auth server config already complete (email/password, HIBP hooks, session config)
- `components/ui/`: Full set of shadcn/ui primitives (button, input, card, dialog, etc.)
- `lib/hooks/use-translations.ts`: i18n hook — auth page strings already exist in `locales/en.ts` and `locales/it.ts`

### Established Patterns
- Auth pages: `pages/auth/*.tsx` with `getServerSideProps` for SSR
- API client: `lib/api-client.ts` with axios interceptors (withCredentials: true)
- State management: Zustand stores in `stores/`, React contexts in `lib/context/`
- Query hooks: TanStack Query in `hooks/queries/` with queryOptions pattern

### Integration Points
- `pages/_app.tsx`: Where AuthProvider currently wraps the app — replace with better-auth session provider
- `lib/api-client.ts`: 401 interceptor needs updating to use authClient.signOut()
- `e2e/auth.setup.ts`: Playwright auth setup needs better-auth sign-in flow
- All dashboard components using `useAuth()` or `AuthContext` — must switch to `useSession()`

</code_context>

<specifics>
## Specific Ideas

- Auth pages should feel consistent with the dashboard (MUI ThemeProvider wrapping)
- Current login page's caps lock warning, password visibility toggle are nice touches — better-auth-ui may handle these natively
- Phase 51 decisions carry forward: no baseURL on authClient, always show success on forgot-password (email enumeration prevention)

</specifics>

<deferred>
## Deferred Ideas

- Google OAuth social login button on auth pages — Phase 55 (CORE-03)
- 2FA/TOTP setup during login — Phase 55 (SEC-01, SEC-02)
- Passkey authentication option — Phase 55 (SEC-03)
- Organization selector after login — Phase 56 (ORG-04)

</deferred>

---

*Phase: 53-frontend-auth-ui*
*Context gathered: 2026-03-09*
