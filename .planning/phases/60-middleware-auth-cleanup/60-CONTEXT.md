# Phase 60: Middleware & Auth Cleanup - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix critical integration gap (Next.js middleware not active) and remove divergent auth instances. Rename proxy.ts → middleware.ts with correct export, remove duplicate frontend better-auth server instance, align cookieCache strategy between frontend and backend, and validate with E2E tests against deployed staging.

</domain>

<decisions>
## Implementation Decisions

### cookieCache Alignment
- Enable `strategy: "compact"` on BOTH frontend and backend instances
- `maxAge: 300` (5 minutes) on both — consistent behavior
- Backend `better-auth.instance.ts` currently has `enabled: false` — change to `{ enabled: true, maxAge: 300, strategy: "compact" }`
- Frontend `auth.ts` already has compact — this will carry to whatever replaces it (or backend is the only instance after removal)
- 5min session revocation delay is acceptable for a mail client

### Auth Instance Removal
- Verify backend `better-auth.instance.ts` has feature parity (HIBP hooks, email verification sending) BEFORE deleting frontend `auth.ts`
- Delete `frontend/lib/auth.ts` entirely — no re-export shim
- Grep all imports of `frontend/lib/auth.ts` and rewire to `auth-client.ts` or remove
- The catch-all API route `pages/api/auth/[...all].ts` is a pure proxy — doesn't import auth.ts, no changes needed

### Middleware Rename
- Rename `frontend/proxy.ts` → `frontend/middleware.ts`
- Rename exported function `proxy()` → `middleware()`
- Keep all three redirect behaviors:
  1. `/dashboard/*` without session → redirect to `/auth/login?returnTo=...`
  2. `/dashboard/*` without onboarding cookie → redirect to `/onboarding`
  3. `/auth/*` with session → redirect to `/dashboard`
- Add `/onboarding` to route matcher — protect with session check
- `returnTo` param set for ALL protected route redirects (dashboard + onboarding)
- Matcher becomes: `["/dashboard/:path*", "/auth/:path*", "/onboarding"]`

### E2E Deployment Validation
- Automated Playwright E2E test against deployed staging URL (Vercel + Railway)
- Four test scenarios:
  1. Unauthenticated `/dashboard` → redirects to `/auth/login?returnTo=/dashboard`
  2. Authenticated `/auth/login` → redirects to `/dashboard`
  3. No content flash: `/dashboard` redirect is server-side (no brief dashboard render)
  4. Unauthenticated `/onboarding` → redirects to `/auth/login?returnTo=/onboarding`

### Claude's Discretion
- Playwright test file location and naming
- How to handle the no-content-flash assertion (timing vs DOM check)
- Whether to add staging URL as env var or hardcode in test config

</decisions>

<specifics>
## Specific Ideas

- The rename from proxy.ts to middleware.ts is the critical fix — Next.js ignores the current file entirely
- cookieCache "compact" strategy is the 2026 better-auth recommended default per official docs
- E2E tests should validate the actual Railway/Vercel deployment, not just local dev

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/proxy.ts`: Already has correct redirect logic — just needs rename + matcher expansion
- `frontend/lib/auth-client.ts`: Client-side auth with all plugins (2FA, passkeys, additionalFields) — stays as-is
- `frontend/pages/api/auth/[...all].ts`: Pure backend proxy — no changes needed
- `backend/src/common/auth/better-auth.instance.ts`: Canonical server instance — needs cookieCache enable

### Established Patterns
- Optimistic cookie check in middleware (Phase 53 decision) — no DB calls in Edge runtime
- Session validation happens in useSession (client) and NestJS guards (API) — middleware is just a redirect gate
- `getSessionCookie()` from `better-auth/cookies` used for Edge-compatible cookie reading

### Integration Points
- `frontend/middleware.ts` (new) — Next.js auto-discovers this file at project root
- `backend/src/common/auth/better-auth.instance.ts` — cookieCache config change
- `frontend/lib/auth.ts` — to be deleted after parity verification
- All files importing from `frontend/lib/auth.ts` — need rewiring

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 60-middleware-auth-cleanup*
*Context gathered: 2026-03-10*
