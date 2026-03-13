# Phase 74: E2E Runtime Validation - Research

**Researched:** 2026-03-13
**Domain:** Playwright E2E test execution, runtime debugging, evidence capture
**Confidence:** HIGH

## Summary

Phase 74 is not a code-writing phase. It is an execution and debugging phase. The four E2E spec files (organizations, admin, onboarding, security) already exist and were hardened by Phase 73. They have never been run against a real backend -- Plan 71-06 was written but never executed. This phase stands up infrastructure, runs the suite, diagnoses and fixes any runtime mismatches (selectors, timing, API contracts), and captures passing evidence.

The key challenge is operational, not architectural. The specs require Docker (PostgreSQL on 5433, Redis on 6380), a running NestJS backend on port 3100, a running Next.js frontend on port 3001, and seeded test data. Playwright's `webServer` config can auto-start both servers, but Docker must be running first. The user must manually start Docker containers and seed the database before Claude can run `npx playwright test`.

**Primary recommendation:** Structure as two tasks -- one human-action checkpoint to start infrastructure, one automated task to run the suite, diagnose failures, fix spec files, and capture evidence. This matches the pattern from the never-executed Plan 71-06.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FE2E-01 | Organization flows E2E (create, invite, accept, switch) | `organizations.spec.ts` exists with 4 tests; currently `test.describe.skip` due to org creation API 500 -- needs runtime investigation |
| FE2E-02 | Admin panel E2E (user list, search, ban/unban, impersonate, sessions) | `admin.spec.ts` exists with 7 tests; impersonate test already has `test.skip` with documented reason |
| FE2E-03 | Onboarding wizard E2E (all steps including TOTP) | `onboarding.spec.ts` exists with 1 test; Phase 73 added `prisma db seed` in beforeAll for repeatability |
| FE2E-04 | Security settings E2E (password, TOTP, passkey, sessions) | `security.spec.ts` exists with 5 tests; passkey test skips on non-Chromium and on localhost |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | (installed) | E2E test runner | Already configured in playwright.config.ts |
| otplib | (installed) | TOTP code generation for MFA tests | Already used in onboarding.spec.ts and security.spec.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv-cli | (installed) | Load .env.test for backend | Backend server startup |
| prisma | (installed) | Database seeding | Reset onboarding user state |

No new libraries needed. Everything is already installed and configured.

## Architecture Patterns

### Infrastructure Setup Sequence

```
1. Docker: docker compose -f backend/docker-compose.test.yml up -d
2. Wait: PostgreSQL healthy on 5433, Redis on 6380
3. Schema: cd backend && npx dotenv-cli -e .env.test -- npx prisma db push --skip-generate
4. Seed: cd backend && npx dotenv-cli -e .env.test -- npx prisma db seed
5. Backend: cd backend && npx dotenv-cli -e .env.test -- npm run start:dev (port 3100)
6. Frontend: cd frontend && npm run dev (port 3001)
7. Run: cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium
```

The `E2E_NO_WEB_SERVER=1` flag tells `playwright.config.ts` to skip auto-starting servers (since the user already started them). Without this flag, Playwright would attempt to start backend and frontend, which may conflict with already-running instances.

### Test Execution Strategy

Run Chromium only. Rationale:
- `workers: 1` in playwright.config.ts -- tests are serial (shared mutable state)
- Passkey test requires CDP (Chromium only)
- Organizations test is `describe.skip` -- won't run regardless of browser
- Running all 5 browser projects would take 5x longer with no additional coverage for this phase's goals

Command: `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium`

To run a single failing spec for debugging:
`cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium e2e/{spec-name}.spec.ts`

### Evidence Capture

Playwright is configured with `reporter: [['html', { open: 'never' }], ['list']]`. After a passing run:
- HTML report at `frontend/playwright-report/index.html`
- Can be opened with `npx playwright show-report`
- Terminal output (`list` reporter) shows pass/fail per test

Evidence to commit: the HTML report directory or a screenshot/log of the passing terminal output.

## Known Issues in Spec Files (Pre-Runtime)

### 1. organizations.spec.ts -- ENTIRE SUITE SKIPPED

The suite uses `test.describe.skip('Organization flows', ...)` with comment: "better-auth organization.create API returns 500 on the deployed backend."

**Impact on FE2E-01:** This test will not execute. The skip is already documented with a legitimate reason (backend bug, not test bug). The success criteria says "pass or have documented skip reasons" -- this qualifies.

**Action:** Verify the 500 error is still present at runtime. If it is, the skip stays. If the org API now works (e.g., Phase 73 or other fixes resolved it), remove the skip and let it run.

### 2. admin.spec.ts -- IMPERSONATE TEST SKIPPED

Line 64: `test.skip(true, 'Impersonated user lacks legal acceptance -- onboarding redirect blocks banner');`

**Impact on FE2E-02:** 6 of 7 tests should run. The impersonate skip is a genuine feature gap, not a test issue.

### 3. admin.spec.ts -- waitForTimeout ANTI-PATTERN

Line 194 in the "verify banned user cannot log in" test: `await bannedPage.waitForTimeout(3_000)`. Plan 71-06 flagged this for replacement with a proper wait condition. Should be replaced with waiting for the error alert or URL check.

### 4. security.spec.ts -- PASSKEY TEST DOUBLE-SKIP

Lines 219-231: The passkey test skips on both non-Chromium AND localhost. Since E2E tests run against localhost by default, this test will always skip locally. It would only run if `E2E_BASE_URL` is set to a non-localhost URL AND the browser is Chromium.

**Impact on FE2E-04:** 4 of 5 security tests should run. Passkey skip is legitimate (RP ID mismatch).

### 5. onboarding.spec.ts -- SEED TIMING

Phase 73 added `execSync('npx prisma db seed', ...)` in file-scope `beforeAll`. This resets `test@pmsync.local` to `onboardingComplete: false` and `twoFactorEnabled: false`. If the seed fails (e.g., backend DB not reachable from the Playwright process), the test skips gracefully.

**Potential issue:** The `execSync` runs `npx prisma db seed` which uses the backend's `.env` (not `.env.test`). If the frontend Playwright process doesn't have access to the backend's database connection string, the seed will fail. The `cwd` is set to `../../backend` from `__dirname`, which is correct. But `DATABASE_URL` must be in the backend's `.env` or the environment.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test infrastructure | Custom Docker scripts | Existing docker-compose.test.yml | Already tested and working |
| Auth state | Manual cookie injection | auth.setup.ts storageState | Already produces playwright/.auth/user.json |
| Onboarding reset | Raw SQL | prisma db seed | Phase 73 already wired this |
| Evidence capture | Screenshot scripts | Playwright HTML reporter | Already configured in playwright.config.ts |

## Common Pitfalls

### Pitfall 1: Backend Not Running on Port 3100
**What goes wrong:** Playwright navigates to localhost:3001 (frontend) but all API calls fail because backend isn't running on 3100
**Why it happens:** User forgot to start backend with .env.test, or backend crashed during startup
**How to avoid:** Verify `curl http://localhost:3100/health` returns OK before running tests
**Warning signs:** All tests fail with navigation timeout or network error

### Pitfall 2: Database Not Seeded
**What goes wrong:** Auth setup fails because admin@pmsync.local doesn't exist
**Why it happens:** Docker containers started but `prisma db push` and `prisma db seed` were skipped
**How to avoid:** Always run push + seed after Docker starts
**Warning signs:** auth.setup.ts fails with "invalid credentials" or 401

### Pitfall 3: Stale Auth State
**What goes wrong:** Tests fail because playwright/.auth/user.json has expired/invalid session
**Why it happens:** Previous test run left stale storageState; security tests change passwords/sessions
**How to avoid:** Delete playwright/.auth/ directory before running; setup projects recreate it
**Warning signs:** First test after setup fails with redirect to /auth/login

### Pitfall 4: Onboarding Seed Using Wrong DATABASE_URL
**What goes wrong:** onboarding.spec.ts beforeAll runs `npx prisma db seed` but it connects to production/dev DB instead of test DB
**Why it happens:** The seed command inherits environment from the Playwright process, not from .env.test
**How to avoid:** Either set DATABASE_URL in the Playwright environment, or modify the onboarding beforeAll to use `dotenv-cli -e .env.test` prefix
**Warning signs:** Seed appears to succeed but test still skips (onboardingComplete is true in the test DB)

### Pitfall 5: Port Conflicts
**What goes wrong:** Backend or frontend can't start because ports 3100/3001 are already in use
**Why it happens:** Previous dev session left servers running
**How to avoid:** Kill existing processes on those ports before starting, or use `reuseExistingServer: true` (already set)
**Warning signs:** "Address already in use" error on server start

## Code Examples

### Running the Full Suite (Chromium Only)
```bash
# With servers already running (recommended)
cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium

# Let Playwright start servers (requires Docker already running + seeded)
cd frontend && npx playwright test --project=chromium
```

### Running a Single Spec for Debugging
```bash
cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium e2e/admin.spec.ts
```

### Debugging with UI Mode
```bash
cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium --ui
```

### Viewing the HTML Report
```bash
cd frontend && npx playwright show-report
```

### Fixing the waitForTimeout Anti-Pattern
```typescript
// BAD (admin.spec.ts line 194)
await bannedPage.waitForTimeout(3_000);

// GOOD -- wait for the error alert OR confirm still on login page
await expect(
  bannedPage.locator('[role="alert"]').first()
    .or(bannedPage.locator('button[type="submit"]'))
).toBeVisible({ timeout: 10_000 });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock-based E2E specs | Real-backend E2E specs | Phase 71 (2026-03-12) | 8 legacy mock specs deleted in Phase 73 |
| Manual seed before each run | prisma db seed in beforeAll | Phase 73 (2026-03-13) | Onboarding test is repeatable |
| No browser skip for passkey | test.skip for non-Chromium | Phase 71 (2026-03-12) | Passkey test safe across all browser projects |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (version installed in frontend) |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && E2E_NO_WEB_SERVER=1 npx playwright test --project=chromium` |
| Full suite command | Same as quick run (all specs in e2e/ directory) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FE2E-01 | Org lifecycle (create, invite, accept, switch) | e2e | `npx playwright test --project=chromium e2e/organizations.spec.ts` | Yes (currently describe.skip) |
| FE2E-02 | Admin panel (list, search, ban/unban, impersonate, sessions) | e2e | `npx playwright test --project=chromium e2e/admin.spec.ts` | Yes (impersonate skipped) |
| FE2E-03 | Onboarding wizard (6 steps + TOTP) | e2e | `npx playwright test --project=chromium e2e/onboarding.spec.ts` | Yes |
| FE2E-04 | Security settings (password, TOTP, passkey, sessions) | e2e | `npx playwright test --project=chromium e2e/security.spec.ts` | Yes (passkey skipped on localhost) |

### Sampling Rate
- **Per task commit:** Run the specific spec being fixed: `npx playwright test --project=chromium e2e/{spec}.spec.ts`
- **Per wave merge:** Full suite: `npx playwright test --project=chromium`
- **Phase gate:** Full suite green with HTML report evidence

### Wave 0 Gaps
None -- all test infrastructure exists. The phase is pure execution.

## Expected Test Outcome Summary

| Spec File | Tests | Expected Passing | Expected Skipped | Skip Reason |
|-----------|-------|-----------------|-----------------|-------------|
| organizations.spec.ts | 4 | 0 | 4 | `describe.skip` -- org create API 500 (backend bug) |
| admin.spec.ts | 7 | 6 | 1 | Impersonate -- onboarding redirect blocks banner |
| onboarding.spec.ts | 1 | 1 | 0 | (skips only if seed fails) |
| security.spec.ts | 5 | 4 | 1 | Passkey -- localhost RP ID mismatch |
| **Total** | **17** | **11** | **6** | |

These numbers assume the current skip annotations remain valid at runtime. If the org create API is fixed, all 4 org tests may pass. If any test has a runtime selector/timing mismatch, it needs fixing (not skipping).

## Open Questions

1. **Organization API 500 -- still present?**
   - What we know: organizations.spec.ts has describe.skip citing org.create returns 500
   - What's unclear: Whether Phase 73 or other changes fixed this
   - Recommendation: Try removing describe.skip at runtime to verify; re-skip if still broken

2. **Onboarding seed DATABASE_URL**
   - What we know: execSync runs `npx prisma db seed` with cwd=backend, but without explicit DATABASE_URL
   - What's unclear: Whether the backend's .env or .env.test is picked up by the child process
   - Recommendation: If seed fails, add `env: { ...process.env, DATABASE_URL: '...' }` to execSync options

3. **Non-target spec files**
   - What we know: 10 spec files exist in e2e/ but only 4 are in scope (organizations, admin, onboarding, security)
   - What's unclear: Whether `npx playwright test` runs ALL specs or just the 4 target specs
   - Recommendation: Running all specs is fine -- the phase goal is "full Playwright suite". Non-target specs (smoke, search, middleware-redirects, etc.) should pass or have pre-existing skips. If they fail, fix or skip with documentation.

## Sources

### Primary (HIGH confidence)
- Codebase: `frontend/playwright.config.ts` -- full config with webServer, projects, reporter
- Codebase: `frontend/e2e/organizations.spec.ts` -- 4 tests, all skipped
- Codebase: `frontend/e2e/admin.spec.ts` -- 7 tests, 1 skipped
- Codebase: `frontend/e2e/onboarding.spec.ts` -- 1 test with seed automation
- Codebase: `frontend/e2e/security.spec.ts` -- 5 tests, 1 double-skipped
- Codebase: `frontend/e2e/auth.setup.ts` + `auth.setup.member.ts` -- auth state setup
- Codebase: `backend/prisma/seed.ts` -- 3 users seeded with upsert
- Codebase: `backend/docker-compose.test.yml` -- PostgreSQL 5433, Redis 6380
- Codebase: `backend/.env.test` -- test environment variables
- `.planning/v5.1-MILESTONE-AUDIT.md` -- gap identification
- `.planning/phases/71-frontend-e2e-tests/71-06-PLAN.md` -- original gap closure plan (never executed)
- `.planning/phases/73-test-hardening-cleanup/73-02-SUMMARY.md` -- Phase 73 hardening results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- everything is already installed and configured
- Architecture: HIGH -- no new architecture needed, just execution
- Pitfalls: HIGH -- well-understood from Phase 71/73 history and code review

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable infrastructure, no external dependencies changing)
