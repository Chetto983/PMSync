# Phase 71: Frontend E2E Tests - Research

**Researched:** 2026-03-11
**Domain:** Playwright E2E testing, better-auth flows (organizations, admin, onboarding, security/MFA/WebAuthn)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- A second seed user `member@pmsync.local` must be added to backend seed data alongside `admin@pmsync.local`
- Both users exist on every test run — no per-test user creation
- A second auth setup file `auth.setup.member.ts` logs in as `member@pmsync.local` and saves state to `playwright/.auth/member.json`
- Tests that need a second user perspective use `browser.newContext({ storageState: 'playwright/.auth/member.json' })`
- After admin sends invite via UI, retrieve the invitation token by calling the backend API (e.g. GET /organizations/invitations) — no real email required
- Navigate to `/invite/{token}` as member to accept — tests the frontend accept UI
- After banning `member@pmsync.local` via admin panel UI, open a second browser context (no auth)
- Navigate to `/auth/login`, submit member credentials, assert the error response or redirect to a banned/error page
- Unban after verification to keep DB state clean for re-runs
- TOTP: full real flow — extract QR code URL/secret from the page, compute a real TOTP code using `otplib` (or similar), submit it. Do not stub.
- WebAuthn passkeys: use Playwright's CDP virtual authenticator (`cdpSession.send('WebAuthn.enable', ...)`) — does not require real hardware
- The onboarding "connect email provider" step requires real OAuth — cannot complete against a real provider headlessly
- Claude's Discretion: use `page.route()` to mock the OAuth callback for that specific step only (exception to no-mocking rule, scoped to OAuth redirect only)

### Claude's Discretion
- Exact TOTP library choice (otplib vs custom TOTP implementation)
- Exact CDP commands for virtual authenticator setup/teardown
- Whether to mock only the OAuth callback URL or the entire provider step
- Test file naming and describe block structure
- Database cleanup strategy for org/invitation data left by tests (e.g. afterEach cleanup via API call or accepting re-run idempotency)
- Whether to rewrite existing mocked specs (auth.spec.ts, email-list.spec.ts, etc.) — not discussed; Claude can decide based on Phase 66 no-mocking mandate

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FE2E-01 | Organization flows tested end-to-end (create org, invite member, accept invitation, switch org) | OrgAdminPage + InviteMemberDialog + PendingInvitationBanner + OrgSwitcher all mapped. Invitation acceptance uses `/dashboard/invitations/accept?id=` page. Token retrieved via backend API call. |
| FE2E-02 | Admin panel tested end-to-end (user list, search, ban/unban, impersonation, session revocation) | UserListTable, BanUserDialog, UserSessionsDialog, ImpersonationBanner all mapped. Admin page requires `super-admin` role — seed must use that role. |
| FE2E-03 | Onboarding wizard tested end-to-end (all steps: name, workspace, email provider, MFA, avatar) | 6 steps: Legal, Name, Workspace, EmailProvider, Avatar, MFA. Steps 1-3 and 5 are real-backend testable. Step 4 (EmailProvider) requires `page.route()` mock for OAuth callback. Step 6 (MFA) requires TOTP + CDP passkey. |
| FE2E-04 | Security settings tested end-to-end (password change, TOTP setup/remove, session management) | SecurityPasswordSection, SecurityMfaSection, SecuritySessionsSection all mapped. TOTP flow is 4-step dialog. Passkey uses CDP virtual authenticator. |
</phase_requirements>

---

## Summary

Phase 71 writes four Playwright E2E spec files against a real running backend: organizations, admin panel, onboarding wizard, and security settings. No new application code is produced — only test code and one seed file change.

The existing Playwright infrastructure (playwright.config.ts, auth.setup.ts, fixtures.ts) is solid and well-structured. Adding a second setup project for `member@pmsync.local` follows the exact pattern already used for `admin@pmsync.local`. The only required change to non-test code is in `backend/prisma/seed.ts` (add member user, fix admin role to `super-admin`).

The two technically complex flows are TOTP and WebAuthn. TOTP is solved: extract the `secret` query param from the `otpauth://` URI that `authClient.twoFactor.enable()` returns, pass it to `otplib.authenticator.generate()`, fill the code. WebAuthn is solved: Playwright CDP virtual authenticator via `cdpSession.send('WebAuthn.enable', ...)` + `WebAuthn.addVirtualAuthenticator`. Both are standard patterns in Playwright testing.

**Primary recommendation:** Four spec files, one setup file, one seed change. Plan as five sequential plans: seed/setup-member, organizations spec, admin spec, onboarding spec, security spec.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.58.2 (already installed) | E2E test runner | Already configured |
| `otplib` | Must be added | TOTP code generation from secret | Standard TOTP library, works in Node.js context (Playwright runs in Node) |
| `better-auth` (client) | 1.5.4 | Auth flows under test | Already wired in auth.setup.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `qrcode` | 1.5.4 (already installed) | Already used in app | Not needed in tests — secret extracted from totpURI directly |
| `@simplewebauthn/browser` | 13.2.2 (already installed) | WebAuthn in app | Not used in tests — CDP virtual authenticator replaces hardware |

### Not Needed / Anti-patterns
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parsing QR code image | Extracting secret from `totpURI` string | totpURI is a plain string returned by the API; no image parsing needed |
| Real WebAuthn hardware | CDP virtual authenticator | CDP works headlessly without physical keys |
| Real OAuth provider | `page.route()` mock for OAuth callback | Only this one step needs mocking — Phase 66 no-mocking mandate preserved |

**Installation:**
```bash
# from frontend/
npm install --save-dev otplib
```

---

## Architecture Patterns

### Recommended Test File Structure
```
frontend/e2e/
├── auth.setup.ts              # existing — admin@pmsync.local → user.json
├── auth.setup.member.ts       # NEW — member@pmsync.local → member.json
├── fixtures.ts                # existing — authedPage fixture
├── organizations.spec.ts      # NEW — FE2E-01
├── admin.spec.ts              # NEW — FE2E-02
├── onboarding.spec.ts         # NEW — FE2E-03
├── security.spec.ts           # NEW — FE2E-04
└── [existing specs]           # kept as-is (old mocked tests)
playwright/.auth/
├── user.json                  # admin auth state
└── member.json                # NEW — member auth state
```

### Pattern 1: Multi-User Test Setup
**What:** Two storageState files, two setup projects in playwright.config.ts
**When to use:** Any test that needs two simultaneous user perspectives (org invite/accept, ban verification)

```typescript
// playwright.config.ts additions
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts$/ },
  { name: 'setup-member', testMatch: /auth\.setup\.member\.ts$/ },
  {
    name: 'chromium',
    use: { storageState: 'playwright/.auth/user.json' },
    dependencies: ['setup', 'setup-member'],
  },
  // ... other browsers
]
```

Note: Tests that use `browser.newContext({ storageState: 'playwright/.auth/member.json' })` must NOT be in `fullyParallel` mode if they mutate shared DB state (ban/unban). Use `test.describe.serial` for the ban sequence.

### Pattern 2: TOTP Code Generation
**What:** Extract secret from `otpauth://` URI, generate live TOTP code with `otplib`
**When to use:** FE2E-03 onboarding MFA step, FE2E-04 security settings TOTP enable flow

The app's TOTP enable dialog (SecurityMfaSection) renders a QR code image from `qrDataUrl`. The `totpURI` is the underlying `otpauth://totp/...?secret=BASE32SECRET&...` string. The test must intercept the response from `authClient.twoFactor.enable()`. The cleanest approach is to use `page.route()` to observe the network response from the better-auth TOTP enable endpoint, capture the `totpURI`, then compute the code.

Alternative: expose `data-totp-uri` attribute on the QR container in the component. Claude's discretion call — the `page.route()` intercept approach avoids touching app code.

```typescript
// Source: otplib documentation + Playwright docs
import { authenticator } from 'otplib';

// Intercept the two-factor/enable response to capture totpURI
let capturedTotpUri = '';
await page.route('**/api/auth/two-factor/enable', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  capturedTotpUri = body.totpURI;
  await route.fulfill({ response });
});

// ... trigger enable flow in UI, fill password, click continue ...

// Extract secret and generate code
const secret = new URL(capturedTotpUri).searchParams.get('secret')!;
const code = authenticator.generate(secret);
await page.fill('[inputmode="numeric"]', code);
await page.click('button:has-text("Verify")');
```

### Pattern 3: CDP Virtual Authenticator (WebAuthn)
**What:** Register a software-based WebAuthn authenticator via Chrome DevTools Protocol
**When to use:** FE2E-03 onboarding passkey step, FE2E-04 security settings passkey add

```typescript
// Source: Playwright official docs (Virtual Authenticator API)
const client = await page.context().newCDPSession(page);
await client.send('WebAuthn.enable');
await client.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
// ... trigger Add Passkey button in UI ...
// Clean up after test
await client.send('WebAuthn.disable');
```

**Critical notes:**
- Only works in Chromium (CDP is Chromium-specific). WebAuthn tests MUST run in chromium project only.
- `automaticPresenceSimulation: true` makes the virtual authenticator auto-respond to registration prompts without user interaction.
- `isUserVerified: true` simulates user verification (Touch ID / PIN) passing.
- Must `WebAuthn.disable` in `afterEach` or the authenticator persists to the next test.

### Pattern 4: Invitation Token Retrieval
**What:** After admin sends invite via UI, fetch the pending invitation ID from the backend API without real email
**When to use:** FE2E-01 organization invite/accept flow

The invitation is accepted via `/dashboard/invitations/accept?id={invitationId}`. The `useAcceptInvitation` hook calls `authClient.organization.acceptInvitation({ invitationId })`.

To get the invitation ID: call `GET /api/auth/organization/list-invitations` as admin (the same endpoint `organizationsOptions` uses internally). This returns the list of pending invitations for the org.

```typescript
// As admin context — after sending invite via UI
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3100';
const invitationsResponse = await page.request.get(
  `${baseURL}/api/auth/organization/list-invitations?organizationId=${orgId}`,
  { headers: { 'Accept': 'application/json' } }
);
const invitations = await invitationsResponse.json();
const invitationId = invitations[0]?.id;

// As member context — navigate to accept page
await memberPage.goto(`/dashboard/invitations/accept?id=${invitationId}`);
await memberPage.waitForURL(/\/dashboard/);
```

Note: The better-auth route is `/api/auth/organization/list-invitations`. Confirm exact path by checking the auth API prefix in better-auth.module.ts before implementation.

### Pattern 5: Ban Verification with Second Context
**What:** Open a fresh browser context (no auth) and attempt login as the banned user
**When to use:** FE2E-02 admin ban verification

```typescript
// After banning via UI, open new unauthenticated context
const bannedContext = await browser.newContext();
const bannedPage = await bannedContext.newPage();
await bannedPage.goto('/auth/login');
await bannedPage.fill('input[type="email"]', 'member@pmsync.local');
await bannedPage.fill('input[type="password"]', 'MemberPassword123!');
await bannedPage.click('button[type="submit"]');
// Assert error message or ban redirect
await expect(bannedPage.locator('[role="alert"]')).toBeVisible();
await bannedContext.close();
```

### Pattern 6: OAuth Callback Mock (FE2E-03 only)
**What:** Mock only the OAuth redirect so `StepEmailProvider` can be bypassed without real Google/Microsoft
**When to use:** Onboarding step 4 (email provider) only

The `StepEmailProvider` component calls `providersApi.getGoogleAuthUrl()` → gets URL → navigates `window.location.href = authUrl`. The test should intercept the authUrl request and the subsequent callback.

Recommended approach: call `handleSkip()` equivalent by clicking the "Skip for now" button. This avoids any OAuth involvement entirely and the step still advances. The skip path is a legitimate user flow.

Alternative: `page.route()` to mock the OAuth callback if the requirement strictly demands the connect button be clicked.

**Decision (Claude's discretion):** Click "Skip for now" — zero routing needed, legitimate flow, avoids mock complexity.

### Anti-Patterns to Avoid
- **Running WebAuthn tests in Firefox/WebKit:** CDP virtual authenticator is Chromium-only. Tag these tests `@chromium-only` or use `test.skip(!chromium)`.
- **Using `fullyParallel` for ban/unban tests:** The ban sequence is stateful (ban → verify → unban). Wrap in `test.describe.serial`.
- **Calling `page.evaluate()` to access internal auth state:** Use network interception or page selectors only.
- **Assuming `admin@pmsync.local` has `super-admin` role:** The current seed uses `role: 'admin'`. The seed MUST be updated to `role: 'super-admin'` for the admin panel to render.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP code computation | Custom RFC 6238 HMAC-SHA1 implementation | `otplib` authenticator | 30-second window edge cases, clock skew |
| WebAuthn credential management | Manual WebAuthn ceremony via page.evaluate | CDP virtual authenticator | Protocol complexity, transport binding |
| Invitation email parsing | Mailhog or SMTP capture | Backend API call to list-invitations | Simpler, no external service needed |
| Org/member cleanup | Custom Prisma cleanup in E2E | API calls via `authClient` (delete org, unban) | Tests should clean up via the same API surface they test |

---

## Critical Findings

### Finding 1: Admin User Role Mismatch — BLOCKER
**What:** `backend/prisma/seed.ts` creates `admin@pmsync.local` with `role: 'admin'`.
**Problem:** `frontend/pages/dashboard/admin/users.tsx` and `admin/organizations.tsx` check `user.role !== 'super-admin'` and render "Access denied" for non-super-admins.
**Fix Required:** `seed.ts` must use `role: 'super-admin'` for `admin@pmsync.local`. The `member@pmsync.local` user should use `role: 'user'` so they appear as a non-admin target for ban/impersonate operations.
**Confidence:** HIGH — verified in both seed.ts and page components.

### Finding 2: Invitation Acceptance Route
**What:** Invitations are accepted via `/dashboard/invitations/accept?id={invitationId}` (not `/invite/{token}`).
**Source:** `frontend/pages/dashboard/invitations/accept.tsx` — reads `router.query.id` and calls `acceptInvitation.mutate(id)`.
**Impact:** CONTEXT.md mentions `/invite/{token}` but the real route is `/dashboard/invitations/accept?id=`. The planner must use the correct route.
**Confidence:** HIGH — code confirmed.

### Finding 3: TOTP Secret Extraction Strategy
**What:** `authClient.twoFactor.enable({ password })` returns `{ totpURI, backupCodes }` via network response.
**Strategy:** Use `page.route()` to intercept the `**/two-factor/enable` response, capture `totpURI`, and extract the secret via `new URL(totpURI).searchParams.get('secret')`.
**Alternative:** Add a `data-testid="totp-uri"` hidden span to the component — cleaner but requires touching app code.
**Recommendation (Claude's discretion):** Network intercept via `page.route()` — avoids modifying app code.

### Finding 4: Onboarding Wizard Step Order
**Actual steps (from OnboardingWizard.tsx):**
1. Legal consent (TOS + privacy policy + AI consent toggles) — testable against real backend
2. Name confirm — testable (calls `authClient.updateUser`)
3. Workspace — testable (calls POST `/onboarding/provision-workspace`)
4. Email provider — has "Skip for now" button, use it
5. Avatar — has "Skip" button, use it
6. MFA setup — TOTP or passkey, then finish

The REQUIREMENTS.md lists "set display name, create/join workspace, connect email provider, configure MFA, upload avatar" — order in the spec differs slightly from actual implementation. Test must follow the actual wizard order.

### Finding 5: SecurityMfaSection QR URL Source
**What:** `SecurityMfaSection.tsx` generates `qrDataUrl` via `https://api.qrserver.com/...` (external HTTP call) rather than the `qrcode` npm package used in the onboarding step.
**Impact:** In E2E tests, this external call will work in CI if internet is available. The secret is still extracted from `totpURI` string, not the QR image. No issue.

### Finding 6: WebAuthn Tests are Chromium-Only
**What:** CDP (`WebAuthn.enable` / `WebAuthn.addVirtualAuthenticator`) is a Chromium-exclusive protocol.
**Impact:** Security settings passkey tests and onboarding MFA passkey path must only run in the `chromium` project.
**Pattern:** Use `test.skip` in non-chromium browsers, or create a separate chromium-only project in playwright.config.ts.

### Finding 7: Impersonation Flow
**What:** `useImpersonateUser()` calls `authClient.admin.impersonateUser({ userId })` then `window.location.reload()`. The `ImpersonationBanner` renders when `session.session.impersonatedBy` is truthy.
**E2E Pattern:** After clicking impersonate (with `window.confirm` dialog), wait for page reload and assert `ImpersonationBanner` is visible. Then call stop-impersonating to restore session.
**Playwright dialog handling:** `page.on('dialog', dialog => dialog.accept())` before clicking impersonate.

### Finding 8: member@pmsync.local — No Tenant Needed
**What:** `member@pmsync.local` is invited to an org during tests, not pre-seeded into one. The seed can create this user with `tenantId: null` (or into the default tenant, to be accepted). If they need to log in for `auth.setup.member.ts`, they must have an account. Set them up with `role: 'user'` — not admin, not super-admin.
**Onboarding skip:** The member user must have `onboardingComplete: true` in seed or the auth setup will hit `/onboarding` instead of `/dashboard`.

---

## Common Pitfalls

### Pitfall 1: TOTP Code Expiry During Test
**What goes wrong:** TOTP codes are valid for 30 seconds. If the test takes >30s between capturing the URI and submitting the code, the code expires and verification fails.
**Why it happens:** Long network calls, slow page loads, CI latency.
**How to avoid:** Generate the code immediately before filling the input field. `otplib` generates codes valid at the current timestamp. Most TOTP servers accept T-1 as well (30s grace).
**Warning signs:** "Invalid TOTP code" errors only on slow CI machines.

### Pitfall 2: setup-member Project Missing as Dependency
**What goes wrong:** Tests using `member.json` storageState start before `auth.setup.member.ts` completes; member context is unauthenticated.
**Why it happens:** `playwright.config.ts` projects must list `setup-member` in `dependencies` for every project that could run member-dependent tests.
**How to avoid:** Both `setup` and `setup-member` must be in the `dependencies` array of chromium/firefox/webkit projects.

### Pitfall 3: Admin Panel Requires super-admin — Seed Has admin
**What goes wrong:** E2E test navigates to `/dashboard/admin/users` and sees "Access denied" alert, not the user table.
**Why it happens:** Seed creates user with `role: 'admin'`; page checks `role !== 'super-admin'`.
**How to avoid:** Fix seed.ts as part of Wave 0 (first plan in this phase).

### Pitfall 4: Invitation ID vs Token Confusion
**What goes wrong:** Test navigates to `/invite/{token}` but the accept page reads `router.query.id`.
**Why it happens:** CONTEXT.md references `/invite/{token}` but the actual route is `/dashboard/invitations/accept?id=`.
**How to avoid:** Use `better-auth`'s list-invitations endpoint to get the `id` field and navigate to the correct route.

### Pitfall 5: Onboarding Page Redirect Loop for member User
**What goes wrong:** `auth.setup.member.ts` logs in, page redirects to `/onboarding` because `onboardingComplete` is false, setup never reaches `/dashboard`.
**Why it happens:** The middleware checks `pmsync:onboarding-complete` cookie AND `session.user.onboardingComplete`.
**How to avoid:** Seed `member@pmsync.local` with `onboardingComplete: true` in seed.ts. Also inject the cookie in `auth.setup.member.ts` as `auth.setup.ts` does for cookie consent.

### Pitfall 6: Ban Test Order Dependency
**What goes wrong:** If ban test fails before unban cleanup, `member@pmsync.local` remains banned in subsequent runs, breaking `auth.setup.member.ts`.
**Why it happens:** No `afterEach` cleanup on test failure.
**How to avoid:** Wrap ban+verify+unban in `test.describe.serial` with `afterAll` that always unbans, using `try/finally`.

### Pitfall 7: `window.confirm` Blocks Playwright
**What goes wrong:** `handleImpersonate` calls `window.confirm('Start impersonating this user?')`. If not handled, test hangs.
**Why it happens:** Native browser dialogs block execution until dismissed.
**How to avoid:** Register `page.on('dialog', d => d.accept())` before clicking the impersonate icon.

---

## Code Examples

### member auth setup file skeleton
```typescript
// frontend/e2e/auth.setup.member.ts
import { expect, test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/member.json';
const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL ?? 'member@pmsync.local';
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD ?? 'MemberPassword123!';

setup('authenticate as member', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pmsync:cookie-consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });

  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
```

### TOTP enable + verify pattern
```typescript
import { authenticator } from 'otplib';

// Intercept TOTP enable response
let totpUri = '';
await page.route('**/two-factor/enable', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  totpUri = body.totpURI ?? '';
  await route.fulfill({ response });
});

// Trigger enable dialog in UI, fill password, click Continue...
// (at this point totpUri is populated)

const secret = new URL(totpUri).searchParams.get('secret')!;
const code = authenticator.generate(secret);
await page.fill('[inputmode="numeric"]', code);
```

### CDP virtual authenticator
```typescript
const client = await page.context().newCDPSession(page);
await client.send('WebAuthn.enable');
const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

// ... click "Add Passkey" in UI, wait for success alert ...

// Cleanup
await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
await client.send('WebAuthn.disable');
```

### Seed additions (backend/prisma/seed.ts)
Two changes required:
1. Change `admin@pmsync.local` seed call from `role: 'admin'` to `role: 'super-admin'`
2. Add new `seedUser` call for `member@pmsync.local` with `role: 'user'` and `onboardingComplete: true`

```typescript
// Change existing admin seed
const adminUser = await seedUser({
  email: 'admin@pmsync.local',
  password: 'TestPassword123!',
  firstName: 'Admin',
  lastName: 'User',
  role: 'super-admin', // was 'admin' — must be super-admin for admin panel
  tenantId: defaultTenant.id,
  onboardingComplete: true,
});

// Add member user
const memberUser = await seedUser({
  email: 'member@pmsync.local',
  password: 'MemberPassword123!',
  firstName: 'Member',
  lastName: 'User',
  role: 'user',
  tenantId: defaultTenant.id,
  onboardingComplete: true,
});
```

Note: `seedUser` function must be extended to accept and set `onboardingComplete`. Check the Prisma User schema to confirm the field name.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test --project=chromium e2e/smoke.spec.ts` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FE2E-01 | Create org, invite member, accept invitation, switch org | E2E (Playwright) | `npx playwright test e2e/organizations.spec.ts` | ❌ Wave 0 |
| FE2E-02 | Admin: list users, search, ban/unban, impersonate, revoke sessions | E2E (Playwright) | `npx playwright test e2e/admin.spec.ts` | ❌ Wave 0 |
| FE2E-03 | Onboarding wizard all steps | E2E (Playwright) | `npx playwright test e2e/onboarding.spec.ts` | ❌ Wave 0 |
| FE2E-04 | Security: password change, TOTP enable/disable, passkey, sessions | E2E (Playwright) | `npx playwright test e2e/security.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/smoke.spec.ts --project=chromium`
- **Per wave merge:** `npx playwright test --project=chromium`
- **Phase gate:** Full suite (all browsers except WebAuthn tests) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/e2e/auth.setup.member.ts` — member auth setup
- [ ] `frontend/e2e/organizations.spec.ts` — FE2E-01
- [ ] `frontend/e2e/admin.spec.ts` — FE2E-02
- [ ] `frontend/e2e/onboarding.spec.ts` — FE2E-03
- [ ] `frontend/e2e/security.spec.ts` — FE2E-04
- [ ] `backend/prisma/seed.ts` update — super-admin role + member user
- [ ] `frontend/playwright.config.ts` update — setup-member project + dependency wiring
- [ ] `npm install --save-dev otplib` in frontend/

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `frontend/playwright.config.ts`, `frontend/e2e/auth.setup.ts`, `frontend/e2e/fixtures.ts` — existing Playwright infrastructure
- Direct file reads: `backend/prisma/seed.ts` — current seed structure and role values
- Direct file reads: `frontend/components/admin/*`, `frontend/components/organizations/*`, `frontend/components/onboarding/*`, `frontend/components/settings/Security*` — all UI targets for E2E tests
- Direct file reads: `frontend/hooks/queries/use-admin.ts`, `frontend/hooks/queries/use-organizations.ts` — API surface under test
- Direct file reads: `frontend/pages/dashboard/invitations/accept.tsx` — actual invitation acceptance route
- Direct file reads: `frontend/components/admin/ImpersonationBanner.tsx` — impersonation session detection

### Secondary (MEDIUM confidence)
- Playwright CDP WebAuthn API: documented in Playwright official docs for `WebAuthn.enable` / `addVirtualAuthenticator` — standard Chromium CDP protocol, stable across versions
- `otplib` authenticator.generate() pattern: widely documented, works in Node.js (Playwright test context)

### Tertiary (LOW confidence)
- Exact better-auth route for `list-invitations`: inferred from `use-organizations.ts` `getAuthJson('/organization/list-user-invitations')` — this is the user's own invitations. Admin listing of org invitations may use a different path. Verify against backend before implementing.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed except otplib; pattern is well-established
- Architecture: HIGH — all UI components read, routes confirmed, hook implementations verified
- Pitfalls: HIGH — role mismatch (seed bug) and invitation route confusion confirmed from source code
- TOTP extraction: MEDIUM — network intercept approach is standard but exact better-auth route prefix should be verified at implementation time
- WebAuthn CDP: MEDIUM — CDP API is stable and documented but browser-specific (Chromium only)

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable libraries, no fast-moving dependencies)
