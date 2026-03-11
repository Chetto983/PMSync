# Phase 71: Frontend E2E Tests - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Write Playwright E2E tests for four v5.0 feature areas against a real running backend (no route mocking). The four flows are: organization flows, admin panel, onboarding wizard, and security settings. No new feature code — test-writing phase only.

Requirements: FE2E-01, FE2E-02, FE2E-03, FE2E-04

</domain>

<decisions>
## Implementation Decisions

### Multi-user test data
- A second seed user `member@pmsync.local` must be added to backend seed data alongside `admin@pmsync.local`
- Both users exist on every test run — no per-test user creation
- A second auth setup file `auth.setup.member.ts` logs in as `member@pmsync.local` and saves state to `playwright/.auth/member.json`
- Tests that need a second user perspective use `browser.newContext({ storageState: 'playwright/.auth/member.json' })`

### Invitation acceptance flow (FE2E-01)
- After admin sends invite via UI, retrieve the invitation token by calling the backend API (e.g. GET /organizations/invitations) — no real email required
- Navigate to `/invite/{token}` as member to accept — tests the frontend accept UI
- Relies on `PendingInvitationBanner` (exists in `components/organizations/`)

### Admin ban verification (FE2E-02)
- After banning `member@pmsync.local` via admin panel UI, open a **second browser context** (no auth)
- Navigate to `/auth/login`, submit member credentials, assert the error response or redirect to a banned/error page
- This is a full E2E login attempt — tests both the ban effect and the frontend error display
- Unban after verification to keep DB state clean for re-runs

### TOTP and WebAuthn (FE2E-04)
- TOTP: full real flow — extract QR code URL/secret from the page, compute a real TOTP code using `otplib` (or similar), submit it. Do not stub.
- WebAuthn passkeys: use Playwright's CDP virtual authenticator (`cdpSession.send('WebAuthn.enable', ...)`) — does not require real hardware
- These were not discussed further; Claude has discretion on the exact implementation approach

### OAuth / email provider step (FE2E-03)
- The onboarding "connect email provider" step requires real OAuth — cannot complete against a real provider headlessly
- Not discussed; Claude's Discretion: use `page.route()` to mock the OAuth callback for that specific step only (exception to no-mocking rule, scoped to OAuth redirect only)

### Claude's Discretion
- Exact TOTP library choice (otplib vs custom TOTP implementation)
- Exact CDP commands for virtual authenticator setup/teardown
- Whether to mock only the OAuth callback URL or the entire provider step
- Test file naming and describe block structure
- Database cleanup strategy for org/invitation data left by tests (e.g. afterEach cleanup via API call or accepting re-run idempotency)
- Whether to rewrite existing mocked specs (auth.spec.ts, email-list.spec.ts, etc.) — not discussed; Claude can decide based on Phase 66 no-mocking mandate

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/fixtures.ts`: `authedPage` fixture (httpOnly cookie injection, cookie consent pre-set) — use as base for all new tests
- `e2e/auth.setup.ts`: pattern for creating storageState — duplicate for `auth.setup.member.ts`
- `components/organizations/PendingInvitationBanner.tsx`: UI for accepting invitations — target for member acceptance flow
- `components/organizations/InviteMemberDialog.tsx`: UI for sending invites — target for admin invite action
- `components/admin/BanUserDialog.tsx`, `UserListTable.tsx`, `UserSessionsDialog.tsx`: admin panel UI targets
- `components/onboarding/OnboardingWizard.tsx`, step components: each step is a distinct UI target
- `components/settings/SecurityMfaSection.tsx`, `SecurityPasswordSection.tsx`, `SecuritySessionsSection.tsx`, `SecurityAccountsSection.tsx`: security settings UI targets

### Established Patterns
- No API route mocking (Phase 66 mandate) — `fixtures.ts` confirms "No API route mocking -- E2E tests hit real backend on port 3100"
- Auth via `auth.setup.ts` real login → `playwright/.auth/user.json` storageState
- `playwright.config.ts` starts both frontend (3001) and backend (3100) servers; `reuseExistingServer: true`
- Timeout: 120s test, 15s expect — generous for real backend

### Integration Points
- Backend seed data: `backend/prisma/seed.ts` (or equivalent) — add `member@pmsync.local` here
- New auth setup file: `frontend/e2e/auth.setup.member.ts` → `playwright/.auth/member.json`
- `playwright.config.ts` `projects` array — add `setup-member` project that runs `auth.setup.member.ts`, referenced as dependency in tests that need member auth
- Pages under test: `/dashboard/admin/users`, `/dashboard/admin/organizations`, `/onboarding`, `/dashboard/settings`

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — standard Playwright patterns apply
- The invitation token retrieval via API (not real email) is the key insight for FE2E-01

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 71-frontend-e2e-tests*
*Context gathered: 2026-03-11*
