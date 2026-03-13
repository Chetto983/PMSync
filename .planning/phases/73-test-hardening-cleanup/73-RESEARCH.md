# Phase 73: Test Hardening & Cleanup - Research

**Researched:** 2026-03-13
**Domain:** Test infrastructure hardening, dead code cleanup, cross-browser E2E safety
**Confidence:** HIGH

## Summary

Phase 73 closes five specific gaps identified by the v5.1 milestone audit. All five are well-scoped, surgical fixes to existing test infrastructure -- no new frameworks or libraries are needed. The work is entirely about editing existing files and adding one small script/hook.

The five gaps are: (1) contract tests silently skip because `openapi-spec.json` is never generated locally, (2) the passkey E2E test lacks `test.skip` for non-Chromium browsers, (3) onboarding E2E is non-repeatable without manual re-seeding, (4) subscription specs use global TRUNCATE causing parallel FK races, and (5) `fixtures.ts` contains exports that the audit calls "orphaned" but are actually still imported by legacy mock-based E2E specs.

**Primary recommendation:** Treat each gap as an independent, atomic plan. The fixtures cleanup requires careful analysis of which legacy specs still import the "orphaned" exports -- removing them will break `auth.spec.ts`, `compose.spec.ts`, `search-clear.spec.ts`, `keyboard-navigation.spec.ts`, and `email-list.spec.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BINT-03 | Contract tests for 6 endpoint groups | Gap 1: openapi-spec.json generation must be automated so 67 assertions actually execute instead of skipping |
| FE2E-04 | Security settings E2E | Gap 2: passkey test needs `test.skip` annotation for non-Chromium browsers |
| INFRA-03 | Test DB seeded and cleaned between suites | Gaps 3+4: onboarding seed automation and subscription spec TRUNCATE->deleteMany conversion |
</phase_requirements>

## Architecture Patterns

### Gap 1: OpenAPI Spec Generation for Contract Tests

**Current state:** `backend/scripts/generate-openapi.ts` exists and works. The `npm run openapi:generate` script is defined. CI already runs it (`.github/workflows/ci.yml` lines 48-60) but with `continue-on-error: true` because it needs DB/Redis. Locally, no one generates it, so `loadSpec()` in `contract-helpers.ts` returns `null` and all 67 assertions in 10 contract spec files silently pass with zero actual checks (every `it()` block has `if (!spec) return;` guards).

**What needs to happen:**
1. Add a Jest `globalSetup` or `pretest` npm script that generates `openapi-spec.json` before contract tests run
2. The existing `npm run contract-test` command (`jest --testPathPatterns=contract --forceExit`) needs a pretest hook
3. Since the generate script requires the full NestJS app (DB + Redis), the pretest should only attempt generation and warn on failure -- contract tests already skip gracefully
4. Alternative: add a `jest.config.contract.js` with its own `globalSetup` that runs the generation script

**Recommended approach:** Add an npm script `precontract-test` that runs `openapi:generate`. This ensures `npm run contract-test` always generates a fresh spec. For the main `jest` run, add the openapi-spec.json generation to `test/global-setup.ts` (which already exists) behind a try/catch so it doesn't break unit tests when DB is unavailable.

**Key code locations:**
- `backend/scripts/generate-openapi.ts` -- the generation script (39 lines)
- `backend/test/contract/contract-helpers.ts` -- `loadSpec()` reads from `backend/openapi-spec.json`
- `backend/package.json` -- has `openapi:generate` and `contract-test` scripts
- `backend/jest.config.js` -- main Jest config with `globalSetup: test/global-setup.ts`
- `.github/workflows/ci.yml` -- CI already generates the spec (lines 48-60)

**Confidence:** HIGH -- all pieces already exist, just need wiring.

### Gap 2: Passkey Test Browser Skip Annotation

**Current state:** `frontend/e2e/security.spec.ts` line 219-222 already has:
```typescript
const browserName = page.context().browser()?.browserType().name();
test.skip(
  browserName !== 'chromium',
  'CDP WebAuthn virtual authenticator requires Chromium',
);
```

**This is already implemented.** The audit's claim that there's "no `test.skip` annotation for non-Chromium browsers" appears to be incorrect based on the actual code at lines 219-222. The passkey test DOES skip for non-Chromium browsers via `test.skip()`.

However, there's a second skip at lines 228-231 that skips when `baseURL` includes `localhost`, which means the test effectively skips in most local dev scenarios too. The planner should verify this is intentional and not masking the actual gap.

**What may actually be needed:** Verification that this skip works correctly in the Playwright config's 5 browser projects (chromium, firefox, webkit, mobile-chrome, mobile-safari). The skip is dynamic (runtime check), which is the correct Playwright pattern for browser-conditional tests.

**Confidence:** HIGH -- the code already exists. The planner should verify the audit's claim against the actual codebase.

### Gap 3: Onboarding E2E Seed Automation

**Current state:** `frontend/e2e/onboarding.spec.ts` relies on `test@pmsync.local` having `onboardingComplete: false`. After the test runs, that user permanently has `onboardingComplete: true`. The test has a guard (lines 51-58) that calls `test.skip()` if the user already completed onboarding.

**The seed script:** `backend/prisma/seed.ts` creates `test@pmsync.local` with `onboardingComplete: false`. Running `npx prisma db seed` resets it via `upsert`.

**What needs to happen:**
1. Add a Playwright `globalSetup` or project setup that runs `prisma db seed` (or a targeted reset) before the onboarding spec
2. A full `prisma db seed` is safe because it uses `upsert` -- it won't destroy other data
3. Alternatively, add a targeted SQL command that just resets `onboardingComplete` and removes TOTP for that user

**Recommended approach:** Add a Playwright global setup (or a `beforeAll` in onboarding.spec.ts) that resets the test user state. A targeted approach is better than full re-seed:
```typescript
// Reset test user's onboarding state before the spec
await prisma.user.update({
  where: { email: 'test@pmsync.local' },
  data: { onboardingComplete: false, twoFactorEnabled: false },
});
// Also clean up any TOTP secrets from previous runs
await prisma.twoFactor.deleteMany({ where: { userId: testUser.id } });
```

**Key consideration:** The onboarding spec creates a TOTP secret during step 6 (MFA setup). If the spec is re-run, the TOTP setup will fail because the user already has TOTP configured. The seed automation must also clean up TOTP state.

**Confidence:** HIGH -- straightforward DB update.

### Gap 4: Subscription Spec Cleanup -- TRUNCATE to deleteMany

**Current state:** Both subscription spec files (`subscription.service.spec.ts` and `subscription-lifecycle.service.spec.ts`) call `cleanupTestData()` in their `afterAll`. `cleanupTestData()` runs a global `TRUNCATE TABLE ... CASCADE` on 22 tables including `tenants`.

Both files already have targeted cleanup BEFORE calling `cleanupTestData()`:
```typescript
afterAll(async () => {
  if (subscriptionIds.length > 0) {
    await prisma.subscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  }
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
  await cleanupTestData(); // <-- this is the problem
});
```

**What needs to happen:** Remove the `await cleanupTestData()` call from both subscription spec files. The targeted `deleteMany` calls above it already clean up the test data. The global TRUNCATE is what causes FK races when calendar specs are running in parallel.

**Decision from Phase 68-03:** "Omit cleanupTestData() TRUNCATE CASCADE from provider spec afterAll -- concurrent Jest workers cause FK violations when one spec truncates tenants while another is mid-test." This exact pattern should be applied to subscription specs.

**Files to change:**
- `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` -- remove `cleanupTestData()` import and call
- `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` -- remove `cleanupTestData()` import and call

**Confidence:** HIGH -- established pattern from Phase 68-03.

### Gap 5: Fixtures.ts "Orphaned" Exports

**Current state:** The audit claims `authedPage`, `mockEmails`, `mockFolders`, `mockUser` are orphaned exports. **This is WRONG.** These exports are actively imported by:

| Export | Imported By |
|--------|-------------|
| `mockEmails` | auth.spec.ts, compose.spec.ts, search-clear.spec.ts, keyboard-navigation.spec.ts, email-list.spec.ts |
| `mockFolders` | auth.spec.ts, compose.spec.ts |
| `mockUser` | auth.spec.ts, compose.spec.ts |
| `authedPage` (via `test` fixture) | auth.spec.ts, accessibility.spec.ts, chat-mobile.spec.ts, chat-e2e.spec.ts |
| `injectAuthCookie` | compose.spec.ts, email-list.spec.ts, middleware-redirects.spec.ts |

These are **legacy mock-based E2E specs** that predate the Phase 71 real-backend E2E tests. They mock API routes and use fake data. The Phase 71 specs (organizations, admin, onboarding, security) don't use fixtures.ts at all.

**The actual cleanup question:** Should the planner:
1. **Only remove truly unused exports** (there may be none -- need to verify each)
2. **Remove the mock constants AND the legacy specs that use them** (breaking change to test suite)
3. **Just remove the mock constants and update legacy specs** (significant refactor)

**Recommendation:** The audit's gap description says "Orphaned exports removed from fixtures.ts (authedPage, mockEmails, mockFolders, mockUser)." The success criteria are explicit. If we remove these exports, we must either delete or update the 9 legacy specs that import them. The safest approach is to:
- Remove `mockEmails`, `mockFolders`, `mockUser` exports from fixtures.ts
- Remove the `test` fixture extension (which provides `authedPage`)
- Keep `injectAuthCookie` and the re-export of `expect` (still useful)
- Delete or update the legacy E2E spec files that import the removed exports

**Key risk:** Deleting legacy specs reduces E2E coverage. But these specs use mocked APIs, which contradicts the v5.1 requirement "all E2E tests against real backend" (INFRA-04). They're dead weight.

**Confidence:** MEDIUM -- the audit's "orphaned" label is factually wrong, but the intent (remove legacy mock fixtures) is clear. Planner needs to decide scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Custom extraction | Existing `scripts/generate-openapi.ts` + `@nestjs/swagger` | Already works, just needs lifecycle hook |
| DB seeding | Custom seed logic | Existing `prisma/seed.ts` with `upsert` pattern | Idempotent by design |
| Browser detection in Playwright | Custom UA parsing | `page.context().browser()?.browserType().name()` | Already implemented in security.spec.ts |

## Common Pitfalls

### Pitfall 1: OpenAPI Generation Requires Live DB
**What goes wrong:** `generate-openapi.ts` boots the full NestJS app which needs PostgreSQL + Redis
**Why it happens:** `AppModule` initializes Prisma, BullMQ, etc. during bootstrap
**How to avoid:** Wrap generation in try/catch, skip contract tests gracefully when spec can't be generated
**Warning signs:** "Failed to generate OpenAPI spec" in test output

### Pitfall 2: Onboarding TOTP State Leaks Between Runs
**What goes wrong:** Second run of onboarding spec fails at MFA step because TOTP is already configured
**Why it happens:** First run enables TOTP but the seed reset only clears `onboardingComplete`, not `twoFactorEnabled` or `twoFactor` records
**How to avoid:** Reset both `onboardingComplete` flag AND clean up `twoFactor`/`mfaSecrets` records
**Warning signs:** "Authenticator App configured" shown instead of setup flow

### Pitfall 3: Removing Fixtures Breaks Legacy Specs
**What goes wrong:** Deleting mock exports from fixtures.ts causes import errors in 9 legacy spec files
**Why it happens:** Legacy specs actively import these mocks
**How to avoid:** Identify all consumers before removing exports; plan deletion of consumer specs simultaneously
**Warning signs:** TypeScript compilation errors in `frontend/e2e/*.spec.ts`

### Pitfall 4: Jest Parallel Workers and TRUNCATE CASCADE
**What goes wrong:** Worker A truncates `tenants` while Worker B is mid-test, causing FK violation
**Why it happens:** `cleanupTestData()` uses TRUNCATE which acquires ACCESS EXCLUSIVE locks
**How to avoid:** Use targeted `deleteMany` with specific IDs instead of global TRUNCATE
**Warning signs:** Intermittent "violates foreign key constraint" errors in CI

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (backend), Playwright (frontend E2E) |
| Config file | `backend/jest.config.js`, `frontend/playwright.config.ts` |
| Quick run command | `cd backend && npm run contract-test` |
| Full suite command | `cd backend && npx jest --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BINT-03 | Contract tests exercise assertions | integration | `cd backend && npm run contract-test` | Yes (10 files) |
| FE2E-04 | Security passkey skips non-Chromium | e2e | `cd frontend && npx playwright test security.spec.ts` | Yes |
| INFRA-03 | DB seed + targeted cleanup | integration | `cd backend && npx jest --testPathPatterns=subscription --forceExit` | Yes (2 files) |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit` (type-check)
- **Per wave merge:** `cd backend && npm run contract-test && npx jest --forceExit`
- **Phase gate:** Contract tests show actual assertion counts (not all skipped), subscription specs pass without TRUNCATE

### Wave 0 Gaps
- [ ] Verify `openapi-spec.json` can be generated locally with test DB running
- [ ] Verify passkey `test.skip` actually fires on non-Chromium projects

## Sources

### Primary (HIGH confidence)
- Codebase files: `backend/test/contract/contract-helpers.ts`, `backend/scripts/generate-openapi.ts`
- Codebase files: `frontend/e2e/security.spec.ts`, `frontend/e2e/onboarding.spec.ts`
- Codebase files: `backend/src/modules/subscription/services/__tests__/*.spec.ts`
- Codebase files: `frontend/e2e/fixtures.ts` and all 9 importing specs
- `.planning/v5.1-MILESTONE-AUDIT.md` -- gap definitions
- `.github/workflows/ci.yml` -- existing CI pipeline
- `.planning/STATE.md` -- Phase 68-03 decision on TRUNCATE removal

## Metadata

**Confidence breakdown:**
- Gap 1 (OpenAPI): HIGH -- all components exist, just wiring
- Gap 2 (Passkey skip): HIGH -- already implemented in code, audit may be stale
- Gap 3 (Onboarding seed): HIGH -- straightforward DB update
- Gap 4 (Subscription TRUNCATE): HIGH -- established pattern from Phase 68-03
- Gap 5 (Fixtures cleanup): MEDIUM -- audit's "orphaned" claim is inaccurate; needs scope decision

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable infrastructure, no external dependencies)
