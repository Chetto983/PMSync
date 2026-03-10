# Phase 62: Auth Audit Remediation - Research

**Researched:** 2026-03-10
**Domain:** Better Auth remediation across backend, frontend proxying, organization context, and verification UX
**Confidence:** HIGH

## Summary

The audit exposed five concrete gaps in the active Better Auth migration:

1. PMSync still depends on plaintext OAuth tokens in Better Auth `Account` rows during social auto-connect.
2. Active organization resolution is inconsistent across HTTP, WebSocket, and the org switcher UI.
3. The frontend `/api/auth/*` proxy can collapse multiple `Set-Cookie` headers and logs secret-bearing auth URLs.
4. Registration UX assumes immediate session creation even though email verification is required before session issuance.
5. Frontend workspace creation still duplicates backend provisioning logic and can drift from the canonical provisioning path.

These issues are related but not identical to Phase 61 GDPR cleanup. They need a separate remediation phase because they span backend auth configuration, frontend proxy behavior, realtime auth, onboarding UX, and provider integration validation.

**Primary recommendation:** Create a dedicated Phase 62 with four workstreams:

- A. Remove the plaintext Better Auth account-token dependency without breaking social auto-connect.
- B. Harden the frontend auth proxy for multi-cookie handling and secret-safe logging.
- C. Make `session.activeOrganizationId` the canonical active-org contract across HTTP, WebSocket, and UI.
- D. Align signup, verification, and onboarding with Better Auth semantics and one canonical workspace provisioning path.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| P62-01 | PMSync does not depend on plaintext Better Auth `Account` OAuth tokens at runtime | `account.encryptOAuthTokens` exists; current `autoConnectSocialProvider()` reads raw `account.accessToken` |
| P62-02 | Social login still auto-connects Google and Microsoft provider configs after remediation | Existing integration tests already cover auto-connect and provisioning behavior |
| P62-03 | Frontend auth proxy preserves all `Set-Cookie` headers and does not log auth secrets | `/api/v1` proxy already implements a safer `getSetCookie()` pattern |
| P62-04 | Active organization is resolved consistently across HTTP, WebSocket, and org switcher UI | Guard already prefers `session.activeOrganizationId`; WS and UI do not |
| P62-05 | Signup, verification, and onboarding UX match Better Auth behavior when verification is required | Better Auth `requireEmailVerification` is enabled and `sendOnSignIn` is available |
| P62-06 | Validation covers backend, frontend, Playwright, and manual provider flows | Existing repo has backend Jest, frontend Jest, and Playwright infrastructure |
</phase_requirements>

## Architecture Patterns

### Pattern 1: Characterize token handoff before enabling encryption

Current state:

- `backend/src/modules/providers/services/provider-config.service.ts` reads raw `account.accessToken` and `account.refreshToken`.
- `backend/src/common/auth/better-auth.instance.ts` does not enable `account.encryptOAuthTokens`.

Relevant Better Auth capability:

- `account.encryptOAuthTokens?: boolean` exists in Better Auth options.
- Database hooks for `account.create/update` exist, but the exact token material available to PMSync during those hooks must be characterized before redesign.

Recommended sequence:

1. Add characterization coverage around `autoConnectSocialProvider()` and social provisioning behavior.
2. Replace the direct `Account` read with an encrypted-compatible handoff path.
3. Only after the replacement path is proven, enable `account.encryptOAuthTokens: true`.

Do not enable token encryption first. That would break the current onboarding provider bootstrap path.

### Pattern 2: Reuse the proven proxy cookie-forwarding shape

Current state:

- `frontend/pages/api/auth/[...all].ts` iterates `response.headers` and forwards `set-cookie` as if it were single-valued.
- `frontend/pages/api/v1/[...path].ts` already has a `getSetCookies()` helper that preserves multiple cookies.

Recommended pattern:

- Port the `/api/v1` cookie extraction approach into `/api/auth/*`.
- Keep domain stripping and redirect rewriting.
- Remove or redact logs so they never print `code`, `state`, reset tokens, or callback URLs.

### Pattern 3: Make `session.activeOrganizationId` canonical

Current state:

- `backend/src/common/auth/better-auth.guard.ts` maps `request.user.tenantId` from `session.activeOrganizationId || user.tenantId`.
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` ignores `activeOrganizationId` and binds to `persistedUser.tenantId`.
- `frontend/components/organizations/OrgSwitcher.tsx` uses `session.user.tenantId` as the selected org.

Recommended contract:

- Primary source of active org: `session.activeOrganizationId`
- Fallback only when absent: `user.tenantId`

This needs to be applied uniformly to:

- HTTP guard mapping
- WebSocket handshake tenant room resolution
- frontend session typing and selected-org rendering
- post-switch cache invalidation and realtime reconnect behavior

### Pattern 4: Verification-aware signup and shared provisioning

Current state:

- Backend config sets `emailAndPassword.requireEmailVerification: true`.
- `frontend/pages/auth/register.tsx` still calls `authClient.getSession()` and redirects to `/dashboard`.
- `frontend/pages/api/onboarding/create-workspace.ts` recreates only part of `provisionWorkspaceForUser()`.

Relevant Better Auth behavior:

- With `requireEmailVerification: true`, signup can return a user payload without a real session.
- `emailVerification.sendOnSignIn` exists and can resend verification mail on blocked sign-in attempts.

Recommended pattern:

- Replace the current "signup then dashboard" assumption with a verification-pending screen or dedicated `/auth/verify-email` page.
- Add resend verification support for unverified users.
- Remove or rewire duplicated workspace creation so all provisioning flows use the backend canonical path.

## Common Pitfalls

### Pitfall 1: Enabling OAuth token encryption before replacing the consumer

If `encryptOAuthTokens` is turned on while `autoConnectSocialProvider()` still expects plaintext tokens, Google and Microsoft onboarding will silently regress.

### Pitfall 2: Fixing active org only in HTTP

The guard already resolves active org correctly. If WebSocket handshake and org switcher stay stale, the UI and realtime events will keep drifting even though API calls look correct.

### Pitfall 3: Logging full auth URLs during OAuth flows

Callback URLs often contain `code`, `state`, reset tokens, and verification tokens. Logging those values is equivalent to writing bearer material to server logs.

### Pitfall 4: Treating signup as authenticated when verification is mandatory

Better Auth can intentionally withhold session creation until the email is verified. The frontend must not infer success from `signUp.email()` alone.

### Pitfall 5: Keeping two workspace-provisioning implementations

`provisionWorkspaceForUser()` creates tenant, member, preferences, and legal records. `create-workspace.ts` creates only tenant plus user update. Leaving both paths active guarantees drift.

## Validation Architecture

### Test Frameworks

| Area | Framework | Existing Anchor |
|------|-----------|-----------------|
| Backend auth/provider | Jest | `backend/test/integration/auto-connect-social.spec.ts` |
| Backend auth/org/realtime | Jest | `backend/src/common/auth/__tests__/active-org-guard.spec.ts`, `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` |
| Frontend proxy and auth UI | Jest | Existing frontend Jest setup + route/component test patterns |
| Browser auth/org/onboarding | Playwright | `frontend/e2e/auth.spec.ts`, `frontend/e2e/middleware-redirects.spec.ts` |
| Provider correctness | Manual | real Google and Microsoft flows |

### Validation Strategy

- Add characterization tests first for the token-handoff and org-context rules.
- Add frontend route tests for multi-cookie auth proxy behavior before changing the proxy.
- Extend Playwright coverage for org switching and verification-aware onboarding.
- Finish with manual Google and Microsoft smoke tests because provider cookies and OAuth callbacks are environment-sensitive.

## Open Questions

1. **Best token handoff point**
   - What we know: Better Auth offers `account.encryptOAuthTokens` and database hooks.
   - What is still uncertain: whether PMSync can reliably access OAuth token material in a hook before encryption, or if a dedicated callback/bootstrap step is cleaner.
   - Recommendation: resolve this with characterization tests before changing config.

2. **Legacy `create-workspace` API**
   - What we know: `frontend/pages/api/onboarding/create-workspace.ts` duplicates only a subset of canonical provisioning.
   - What is still uncertain: whether any non-onboarding flow still depends on it.
   - Recommendation: prefer deletion unless a current frontend step still requires it, in which case rewire it to a canonical backend endpoint.

## Sources

### Primary (HIGH confidence)

- `backend/src/common/auth/better-auth.instance.ts`
- `backend/src/common/auth/better-auth.guard.ts`
- `backend/src/modules/providers/services/provider-config.service.ts`
- `backend/src/modules/realtime/services/realtime-handshake.service.ts`
- `frontend/pages/api/auth/[...all].ts`
- `frontend/pages/api/v1/[...path].ts`
- `frontend/components/organizations/OrgSwitcher.tsx`
- `frontend/pages/auth/register.tsx`
- `frontend/pages/onboarding.tsx`
- `frontend/components/onboarding/StepWorkspace.tsx`
- `frontend/pages/api/onboarding/create-workspace.ts`
- `backend/test/integration/auto-connect-social.spec.ts`
- `backend/test/integration/social-login-provisioning.spec.ts`
- `backend/src/common/auth/__tests__/active-org-guard.spec.ts`
- `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts`

### Secondary (HIGH confidence)

- `backend/node_modules/@better-auth/core/src/types/init-options.ts`

## Metadata

**Confidence breakdown:**

- Token encryption recommendation: HIGH
- Auth proxy remediation: HIGH
- Active org unification: HIGH
- Verification/onboarding UX alignment: HIGH

**Research date:** 2026-03-10
**Valid until:** 2026-04-10
