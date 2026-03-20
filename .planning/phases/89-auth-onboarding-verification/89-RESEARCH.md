# Phase 89: Auth & Onboarding Verification - Research

**Researched:** 2026-03-20
**Domain:** Playwright E2E testing of better-auth flows, user profile API, and onboarding wizard
**Confidence:** HIGH

## Summary

This phase is a verification-and-fix phase, not a greenfield build. All auth pages, profile endpoints, and the onboarding wizard already exist and are functional. The work is: write exhaustive Playwright E2E tests against the Railway deployment, discover bugs, and fix trivial ones inline.

The existing codebase has a mature Playwright setup (v1.58.2) with auth setup projects, storage state management, and an existing onboarding E2E test that demonstrates the TOTP interception pattern. The `otplib` package (v13.3.0) is already installed for TOTP code generation. The test infrastructure is solid -- the main work is writing new test files and rewriting the existing onboarding spec with exhaustive error coverage.

**Primary recommendation:** Write one Playwright spec file per auth flow, use fresh user registration per test run (timestamped emails), test against Railway via `E2E_BASE_URL`, and fix-inline any bugs under 5 lines of changes.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Playwright E2E tests for all auth pages and onboarding wizard
- One test file per auth flow (auth-login.spec.ts, auth-register.spec.ts, auth-2fa.spec.ts, etc.)
- User profile endpoints: both API-level tests (HTTP calls for all 9 endpoints) AND Playwright tests for UI-visible profile operations
- All test files in `frontend/e2e/`
- Run against Railway deployment (not local dev)
- Base URL via `PLAYWRIGHT_BASE_URL` env var (NOTE: existing config uses `E2E_BASE_URL` -- reconcile)
- Fresh user registration per test run (e.g., test+timestamp@pmsync.local) -- no pre-seeded test users
- Email-dependent flows (verify-email, password-reset): test that API returns 200 and page shows correct message, don't verify actual email delivery
- Exhaustive: happy path + every documented error case per flow
- Onboarding wizard: rewrite existing `onboarding.spec.ts` from scratch with full error coverage
- 2FA: set up during test -- capture TOTP secret from setup response, generate codes programmatically
- OAuth (Google, Microsoft): skip E2E -- cannot automate external provider consent screens. Only verify buttons render
- Fix inline: write test, run it, fix if broken, move to next
- Fix depth: Claude's discretion per case -- fix if trivial (< 5 lines), defer if cosmetic or complex to Phase 96
- Bug fix scope: Fix inline (write test, run it, fix if broken, move to next)

### Claude's Discretion
- Exact Playwright page object structure (if any)
- Test utilities and helpers (auth helper, TOTP generator)
- Order of test file implementation
- Whether to use Playwright fixtures or setup/teardown
- Minor fix decisions (fix inline vs defer) based on complexity

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-01 | User can authenticate via all auth flows (login, register, forgot-password, reset-password, verify-email, 2FA, OAuth) | E2E tests for each flow; OAuth limited to button render verification |
| BAPI-24 | User profile operations work (get/update me, avatar upload/delete, preferences, dashboard preferences, clear AI memory) | API-level tests via Playwright `request` context hitting all 9 endpoints |
| FE-01 | Auth pages render and function (login, register, forgot-password, reset-password, verify-email, 2FA) | Playwright browser tests for each page with form submissions |
| FE-02 | Onboarding wizard completes all steps (avatar, name, provider, workspace, MFA, legal consent) | Rewrite of onboarding.spec.ts with exhaustive error coverage |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E test framework | Already installed, project standard |
| otplib | 13.3.0 | TOTP code generation for 2FA tests | Already installed, used in existing onboarding spec |
| better-auth | (server) | Auth framework under test | Project's auth solution, not a test dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| playwright request API | built-in | API-level testing for profile endpoints | BAPI-24 profile endpoint tests without browser UI |

No new dependencies needed. Everything required is already installed.

## Architecture Patterns

### Test File Structure
```
frontend/e2e/
├── auth.setup.ts              # Existing - admin auth state (keep)
├── auth.setup.member.ts       # Existing - member auth state (keep)
├── auth-login.spec.ts         # NEW - login flow tests
├── auth-register.spec.ts      # NEW - registration flow tests
├── auth-forgot-password.spec.ts # NEW - forgot password tests
├── auth-reset-password.spec.ts  # NEW - reset password tests
├── auth-verify-email.spec.ts    # NEW - email verification tests
├── auth-2fa.spec.ts           # NEW - 2FA setup + verification tests
├── auth-profile-api.spec.ts   # NEW - API-level profile tests (BAPI-24)
├── onboarding.spec.ts         # REWRITE - exhaustive wizard tests
├── fixtures.ts                # Existing - shared utilities (extend)
└── ...                        # Other existing specs (untouched)
```

### Pattern 1: Fresh User Per Test Run
**What:** Register a new user with timestamped email for each test run to avoid state pollution.
**When to use:** All auth flow tests except profile API tests (which use pre-authenticated admin).
**Example:**
```typescript
const timestamp = Date.now();
const TEST_EMAIL = `test+${timestamp}@pmsync.local`;
const TEST_PASSWORD = 'TestPassword123!';

// Register via better-auth API (not UI) for speed
const response = await request.post('/api/auth/sign-up/email', {
  data: { email: TEST_EMAIL, password: TEST_PASSWORD, name: 'Test User' }
});
```

### Pattern 2: TOTP Code Generation (from existing onboarding.spec.ts)
**What:** Intercept the two-factor/enable response to capture totpURI, extract secret, generate code.
**When to use:** 2FA setup and verification tests.
**Example:**
```typescript
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

function generateTotpCode(secret: string): Promise<string> {
  const instance = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
    secret,
  });
  return instance.generate();
}

// Intercept enable response to get secret
let totpUri = '';
await page.route('**/two-factor/enable', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  totpUri = body.totpURI ?? '';
  await route.fulfill({ response });
});
```

### Pattern 3: Cookie Consent Injection
**What:** Set cookie consent in localStorage before page load to prevent consent banner from blocking UI.
**When to use:** Every test that navigates to any page.
**Example:**
```typescript
await page.addInitScript(() => {
  localStorage.setItem(
    'pmsync:cookie-consent',
    JSON.stringify({ necessary: true, analytics: false, marketing: false }),
  );
});
```

### Pattern 4: API-Level Profile Tests via Playwright Request Context
**What:** Use `request.newContext()` with stored cookies to make direct HTTP calls to profile endpoints.
**When to use:** BAPI-24 profile endpoint tests -- all 9 endpoints.
**Example:**
```typescript
test('GET /api/v1/users/me returns profile', async ({ request }) => {
  const response = await request.get('/api/v1/users/me');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toHaveProperty('email');
});
```

### Pattern 5: CSRF Token Handling for Mutation Requests
**What:** Fetch CSRF token before mutation requests in API-level tests.
**When to use:** Any API test making POST/PUT/PATCH/DELETE requests.
**Example:**
```typescript
async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/auth/csrf-token');
  const { csrfToken } = await res.json();
  return csrfToken;
}

// Use in mutation
const csrf = await getCsrfToken(request);
await request.put('/api/v1/users/me', {
  data: { firstName: 'Updated' },
  headers: { 'X-CSRF-Token': csrf },
});
```

### Anti-Patterns to Avoid
- **Do NOT use `prisma db seed` for test setup.** The context mandates fresh user registration, not seeded users. The existing onboarding spec uses seed but this approach is being replaced.
- **Do NOT test against localhost.** Tests must run against Railway deployment via `E2E_BASE_URL`.
- **Do NOT verify actual email delivery.** Only test that the API returns success and the page shows the expected message.
- **Do NOT attempt to automate OAuth flows.** Only verify that Google/Microsoft login buttons render correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP generation | Custom HMAC-SHA1 | `otplib` (already installed) | RFC 6238 has edge cases around time windows |
| Auth state management | Custom cookie injection | Playwright `storageState` | Built-in Playwright pattern, already used in auth.setup.ts |
| API testing | `fetch` or `axios` in tests | Playwright `request` context | Shares cookies with browser context, built into framework |
| Test user cleanup | Manual DB cleanup scripts | Timestamped email addresses | Avoids DB access, tests are self-contained |

## Common Pitfalls

### Pitfall 1: Base URL Environment Variable Mismatch
**What goes wrong:** CONTEXT.md says `PLAYWRIGHT_BASE_URL` but existing `playwright.config.ts` uses `E2E_BASE_URL`.
**Why it happens:** Naming convention drift between context discussion and implementation.
**How to avoid:** Use `E2E_BASE_URL` (matches existing config). Do NOT create a new env var.
**Warning signs:** Tests hit localhost instead of Railway.

### Pitfall 2: Cookie-Based Auth in API Tests
**What goes wrong:** API-level tests fail with 401 because cookies aren't forwarded.
**Why it happens:** better-auth uses cookie-based sessions (`credentials: 'include'`), not JWT Authorization headers.
**How to avoid:** Use Playwright's `request` context which inherits cookies from storageState, or explicitly set session cookies.
**Warning signs:** All API tests return 401 despite valid credentials.

### Pitfall 3: CSRF Token Required for Mutations
**What goes wrong:** PUT/POST/DELETE profile requests fail with 403.
**Why it happens:** The app uses CSRF double-submit cookie pattern. All mutation endpoints require `X-CSRF-Token` header.
**How to avoid:** Fetch CSRF token from `GET /api/v1/auth/csrf-token` before every mutation request.
**Warning signs:** GET requests work but mutation requests fail with 403.

### Pitfall 4: Onboarding Cookie Gate
**What goes wrong:** After completing onboarding in tests, subsequent navigation still redirects to /onboarding.
**Why it happens:** Middleware checks `pmsync:onboarding-complete` cookie, not just DB flag. The cookie may not be set by the test.
**How to avoid:** After onboarding completion, verify the cookie is set or set it explicitly.
**Warning signs:** Test passes onboarding wizard but next page visit redirects back to /onboarding.

### Pitfall 5: Email Verification Blocks Login
**What goes wrong:** Newly registered users can't log in because email isn't verified.
**Why it happens:** better-auth requires email verification before allowing sign-in.
**How to avoid:** For registration tests, verify the "check your inbox" success state. For tests that need an authenticated fresh user, either bypass verification or use the pre-seeded admin user.
**Warning signs:** Registration test creates user, but login test for same user fails with "email not verified."

### Pitfall 6: TOTP Time Window
**What goes wrong:** Generated TOTP code is rejected.
**Why it happens:** TOTP codes are time-sensitive (30s window). Network latency to Railway can eat into the window.
**How to avoid:** Generate the TOTP code as late as possible (right before submitting), not at test setup time.
**Warning signs:** 2FA tests pass locally but fail intermittently against Railway.

### Pitfall 7: Single Worker Constraint
**What goes wrong:** Tests interfere with each other's auth state.
**Why it happens:** Playwright config sets `workers: 1` and `fullyParallel: false` because tests share mutable user state.
**How to avoid:** Keep this constraint. Do not change to parallel execution. Design tests to be independent within sequential execution.
**Warning signs:** Tests pass individually but fail when run as a suite.

## Code Examples

### Auth Page Selectors (verified from source code)

**Login page (`/auth/login`):**
- Email: `input[name="email"]` or `input[type="email"]`
- Password: `input[name="password"]` or `input[type="password"]` (PasswordField component)
- Submit: `button[type="submit"]`
- Error: `Alert` with `severity="error"`
- Verification notice: `Alert` with `severity="info"`
- Social buttons: `SocialLoginButtons` component renders Google/Microsoft buttons
- Forgot password link: linked text to `/auth/forgot-password`

**Register page (`/auth/register`):**
- First name: `TextField` with label from translations
- Last name: `TextField` with label from translations
- Email: `TextField` type="email"
- Password + Confirm: `PasswordField` components
- Terms checkbox: `Checkbox` component
- Submit: `button[type="submit"]` -- disabled until all fields filled + terms checked
- Success: switches to verification pending UI with `Mail` icon and "Check your inbox" heading
- Resend button: "Resend verification email"

**Forgot password (`/auth/forgot-password`):**
- Email: `TextField` type="email"
- Submit: `button[type="submit"]`
- Success: shows `CheckCircleOutline` icon with description, "Back to login" link

**Reset password (`/auth/reset-password?token=...`):**
- Password + Confirm: `PasswordField` components
- Submit: `button[type="submit"]`
- No token: shows error "Missing reset token"
- Success: shows `CheckCircleOutline` icon, "Go to sign in" button

**Verify email (`/auth/verify-email?token=...`):**
- With token: auto-verifies, shows `CheckCircle` on success or `XCircle` on error
- No token: shows resend form with email input
- Success: redirects to /dashboard after 2s

**Two-factor (`/auth/two-factor`):**
- TOTP input: `TextField` with 6-digit constraint (digits only, max 6)
- Backup code toggle: link button to switch between TOTP and backup code mode
- Submit: `button[type="submit"]`

### User Profile Endpoints (all 9, from users.controller.ts)

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | /api/v1/users/me | - | Get profile |
| PUT | /api/v1/users/me | `{ firstName?, lastName?, avatarUrl? }` | Update profile |
| DELETE | /api/v1/users/me | - | Delete account (GDPR) |
| PUT | /api/v1/users/me/avatar | `{ avatarUrl: string }` | Upload avatar (base64) |
| DELETE | /api/v1/users/me/avatar | - | Delete avatar |
| GET | /api/v1/users/me/preferences | - | Get preferences |
| PATCH | /api/v1/users/me/preferences | `UpdatePreferencesDto` | Update preferences |
| GET | /api/v1/users/me/dashboard-preferences | - | Get dashboard prefs |
| PUT | /api/v1/users/me/dashboard-preferences | `{ layout: any[] }` | Update dashboard prefs |

Additional endpoint (not in the 9 count):
| DELETE | /api/v1/users/me/ai-memory | - | Clear AI memory |

That makes 10 endpoints total. The CONTEXT.md says 9 but the controller has 10 (including ai-memory).

### Onboarding Wizard Steps (verified from OnboardingWizard.tsx)

Steps in order (full flow, not `legalOnly`):
1. **StepLegalConsent** -- TOS + Privacy checkboxes, both required
2. **StepNameConfirm** -- First/last name, pre-filled from user data
3. **StepWorkspace** -- Shows "ready" if tenant exists, else create
4. **StepEmailProvider** -- Connect email provider or skip
5. **StepAvatar** -- Upload avatar or skip
6. **StepMfaSetup** -- TOTP setup or skip ("Get Started" finishes)

Completion: calls `POST /onboarding/complete`, sets `pmsync:onboarding-complete` cookie, redirects to `/dashboard`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma db seed` for test user reset | Fresh registration per test run | This phase | No DB access needed from tests |
| Single onboarding test (happy path) | Exhaustive error coverage rewrite | This phase | Catches more bugs |
| Local dev testing | Railway deployment testing | This phase | Tests real infrastructure |

## Open Questions

1. **Fresh user email verification bypass**
   - What we know: better-auth requires email verification. Fresh users registered in tests won't have verified emails.
   - What's unclear: Can we hit the verify-email API endpoint directly to auto-verify, or do we need to accept that registration tests can only verify up to "check your inbox" state?
   - Recommendation: Test registration up to "check your inbox" success state. For tests needing authenticated users, use pre-seeded admin/member accounts via existing auth setup projects.

2. **Account deletion test safety**
   - What we know: `DELETE /api/v1/users/me` exists and would delete the test user's account.
   - What's unclear: Should we test account deletion? It would destroy the test user.
   - Recommendation: Only test with a fresh throwaway user created during the test, not the admin user.

3. **CSRF token in API tests via Railway**
   - What we know: CSRF uses double-submit cookie pattern. The token endpoint is at `/api/v1/auth/csrf-token`.
   - What's unclear: Whether Playwright's request context correctly handles the CSRF cookie round-trip against Railway (different domain than localhost).
   - Recommendation: Test this early. If CSRF cookies don't work cross-domain in Playwright request context, may need to use browser-based requests instead.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/auth-login.spec.ts --project=chromium` |
| Full suite command | `cd frontend && E2E_BASE_URL=<railway-url> E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-01 (login) | Login with valid/invalid credentials | E2E | `npx playwright test e2e/auth-login.spec.ts` | No -- Wave 0 |
| BAPI-01 (register) | Register new user, verify success page | E2E | `npx playwright test e2e/auth-register.spec.ts` | No -- Wave 0 |
| BAPI-01 (forgot-pw) | Request password reset, verify success | E2E | `npx playwright test e2e/auth-forgot-password.spec.ts` | No -- Wave 0 |
| BAPI-01 (reset-pw) | Reset password page states | E2E | `npx playwright test e2e/auth-reset-password.spec.ts` | No -- Wave 0 |
| BAPI-01 (verify-email) | Verify email page states | E2E | `npx playwright test e2e/auth-verify-email.spec.ts` | No -- Wave 0 |
| BAPI-01 (2FA) | TOTP setup + verify + backup code | E2E | `npx playwright test e2e/auth-2fa.spec.ts` | No -- Wave 0 |
| BAPI-01 (OAuth) | OAuth buttons render | E2E | Included in auth-login.spec.ts | No -- Wave 0 |
| BAPI-24 | All profile endpoints return correct responses | API | `npx playwright test e2e/auth-profile-api.spec.ts` | No -- Wave 0 |
| FE-01 | Auth pages render and forms work | E2E | All auth-*.spec.ts files | No -- Wave 0 |
| FE-02 | Onboarding wizard all steps + errors | E2E | `npx playwright test e2e/onboarding.spec.ts` | Yes -- rewrite needed |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/<changed-spec>.spec.ts --project=chromium`
- **Per wave merge:** `npx playwright test e2e/auth-*.spec.ts e2e/onboarding.spec.ts --project=chromium`
- **Phase gate:** All auth + onboarding specs green

### Wave 0 Gaps
- [ ] `frontend/e2e/auth-login.spec.ts` -- covers BAPI-01 login + FE-01
- [ ] `frontend/e2e/auth-register.spec.ts` -- covers BAPI-01 register + FE-01
- [ ] `frontend/e2e/auth-forgot-password.spec.ts` -- covers BAPI-01 forgot-pw + FE-01
- [ ] `frontend/e2e/auth-reset-password.spec.ts` -- covers BAPI-01 reset-pw + FE-01
- [ ] `frontend/e2e/auth-verify-email.spec.ts` -- covers BAPI-01 verify-email + FE-01
- [ ] `frontend/e2e/auth-2fa.spec.ts` -- covers BAPI-01 2FA + FE-01
- [ ] `frontend/e2e/auth-profile-api.spec.ts` -- covers BAPI-24
- [ ] `frontend/e2e/onboarding.spec.ts` -- rewrite for FE-02

## Sources

### Primary (HIGH confidence)
- `frontend/playwright.config.ts` -- Playwright configuration, project setup, env vars
- `frontend/e2e/onboarding.spec.ts` -- Existing onboarding E2E with TOTP pattern
- `frontend/e2e/auth.setup.ts` -- Existing auth setup project
- `frontend/e2e/fixtures.ts` -- Existing shared test utilities
- `frontend/lib/auth-client.ts` -- better-auth client config, plugins, session types
- `frontend/pages/auth/*.tsx` -- All 6 auth pages (login, register, forgot-password, reset-password, verify-email, two-factor)
- `backend/src/modules/users/controllers/users.controller.ts` -- All profile endpoints
- `backend/src/common/auth/onboarding.controller.ts` -- Onboarding completion endpoints
- `backend/src/common/auth/csrf-token.controller.ts` -- CSRF token endpoint
- `frontend/components/onboarding/OnboardingWizard.tsx` -- Wizard orchestrator, step order

### Secondary (MEDIUM confidence)
- `backend/src/common/auth/better-auth.instance.ts` -- Auth instance config (partially read)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed, versions verified via npm ls
- Architecture: HIGH -- test file structure follows established project patterns
- Pitfalls: HIGH -- derived from reading actual source code and existing test patterns
- Profile endpoints: HIGH -- enumerated directly from controller source code

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- no fast-moving dependencies)
