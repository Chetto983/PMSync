# Phase 89: Auth & Onboarding Verification - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify that all auth flows (login, register, forgot-password, reset-password, verify-email, 2FA), user profile operations, and the onboarding wizard work correctly end-to-end. Fix bugs found during verification. No new features — this is testing and hardening what exists.

Requirements: BAPI-01, BAPI-24, FE-01, FE-02

</domain>

<decisions>
## Implementation Decisions

### Verification method
- Playwright E2E tests for all auth pages and onboarding wizard
- One test file per auth flow (auth-login.spec.ts, auth-register.spec.ts, auth-2fa.spec.ts, etc.)
- User profile endpoints: both API-level tests (HTTP calls for all 9 endpoints) AND Playwright tests for UI-visible profile operations
- All test files in `frontend/e2e/`

### Bug fix scope
- Fix inline: write test, run it, fix if broken, move to next
- Fix depth: Claude's discretion per case — fix if trivial (< 5 lines), defer if cosmetic or complex to Phase 96

### Test environment
- Run against Railway deployment (not local dev)
- Base URL via `E2E_BASE_URL` env var
- Fresh user registration per test run (e.g., test+timestamp@pmsync.local) — no pre-seeded test users
- Email-dependent flows (verify-email, password-reset): test that API returns 200 and page shows correct message, don't verify actual email delivery

### Coverage depth
- Exhaustive: happy path + every documented error case per flow
- Onboarding wizard: rewrite existing `onboarding.spec.ts` from scratch with full error coverage (skip required step, invalid input, back navigation)
- 2FA: set up during test — capture TOTP secret from setup response, generate codes programmatically
- OAuth (Google, Microsoft): skip E2E — cannot automate external provider consent screens. Only verify buttons render.

### Claude's Discretion
- Exact Playwright page object structure (if any)
- Test utilities and helpers (auth helper, TOTP generator)
- Order of test file implementation
- Whether to use Playwright fixtures or setup/teardown
- Minor fix decisions (fix inline vs defer) based on complexity

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth infrastructure
- `backend/src/common/auth/better-auth.instance.ts` — Auth instance config, plugins (2FA, org, admin, passkey), workspace provisioning
- `backend/src/common/auth/better-auth.controller.ts` — Catch-all auth route handler (POST/GET /api/auth/*)
- `backend/src/common/auth/onboarding.controller.ts` — Onboarding completion + workspace provisioning endpoints
- `backend/src/common/auth/csrf-token.controller.ts` — CSRF token endpoint

### User profile
- `backend/src/modules/users/controllers/users.controller.ts` — All 9 profile endpoints (get/update me, avatar, preferences, dashboard prefs, clear AI memory)

### Frontend auth pages
- `frontend/pages/auth/login.tsx` — Login page
- `frontend/pages/auth/register.tsx` — Registration page
- `frontend/pages/auth/forgot-password.tsx` — Password reset request
- `frontend/pages/auth/reset-password.tsx` — Password reset with token
- `frontend/pages/auth/verify-email.tsx` — Email verification
- `frontend/pages/auth/two-factor.tsx` — 2FA verification

### Frontend onboarding
- `frontend/components/onboarding/OnboardingWizard.tsx` — 6-step wizard orchestrator
- `frontend/components/onboarding/StepLegalConsent.tsx` — Step 1: TOS + Privacy
- `frontend/components/onboarding/StepNameConfirm.tsx` — Step 2: Name
- `frontend/components/onboarding/StepWorkspace.tsx` — Step 3: Workspace
- `frontend/components/onboarding/StepEmailProvider.tsx` — Step 4: Email provider (optional)
- `frontend/components/onboarding/StepAvatar.tsx` — Step 5: Avatar (optional)
- `frontend/components/onboarding/StepMfaSetup.tsx` — Step 6: MFA setup

### Auth client
- `frontend/lib/auth-client.ts` — better-auth React client, session types, convenience exports
- `frontend/pages/api/auth/[...all].ts` — Auth API proxy to backend

### Existing tests (to review/replace)
- `frontend/e2e/onboarding.spec.ts` — Existing onboarding E2E (will be rewritten)
- `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` — Existing auth flow tests
- `backend/test/contract/auth-login.contract.spec.ts` — Existing login contract test

### Auth guards
- `backend/src/common/auth/better-auth.guard.ts` — Session validation guard
- `backend/src/common/auth/tenant.guard.ts` — Tenant isolation
- `backend/src/common/auth/roles.guard.ts` — RBAC guard

### Project docs
- `.planning/REQUIREMENTS.md` — BAPI-01, BAPI-24, FE-01, FE-02 acceptance criteria
- `docs/AUDIT.md` — Security audit context (dual-stack auth note)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/e2e/onboarding.spec.ts`: Existing Playwright E2E with TOTP generation pattern — reference for 2FA test approach before rewriting
- `frontend/components/auth/AuthLayout.tsx`: Shared auth page layout — useful for understanding page structure in tests
- `frontend/components/auth/SocialLoginButtons.tsx`: OAuth buttons component — verify render only
- `backend/src/common/auth/__tests__/better-auth-flows.spec.ts`: Existing auth flow tests — reference for expected API behavior

### Established Patterns
- Better-auth catch-all route: all auth endpoints go through `/api/auth/*` proxy
- Cookie-based sessions (no JWT) — tests must handle cookies correctly
- CSRF double-submit cookie pattern — mutation requests need CSRF token from `GET /api/v1/auth/csrf-token`
- Multi-tenant: auth operations use `withoutTenantScopingAsync` to bypass tenant guard

### Integration Points
- Auth API proxy: `frontend/pages/api/auth/[...all].ts` forwards to backend — tests hit frontend URL, not backend directly
- Onboarding completion: `POST /onboarding/complete` + `POST /onboarding/provision-workspace`
- User profile: `GET/PUT /users/me`, `PUT/DELETE /users/me/avatar`, `GET/PATCH /users/me/preferences`, etc.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 89-auth-onboarding-verification*
*Context gathered: 2026-03-20*
