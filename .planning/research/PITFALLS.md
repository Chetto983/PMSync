# Domain Pitfalls: Adding Test Coverage to PMSync

**Domain:** Deep test coverage for existing multi-tenant NestJS + Next.js codebase with better-auth, AI SDK v6, MUI, and Playwright
**Researched:** 2026-03-10
**Overall confidence:** HIGH (based on codebase analysis + verified documentation)

## Critical Pitfalls

Mistakes that cause rewrites, false confidence, or multi-day debugging sessions.

---

### Pitfall C1: Tenant Scoping Bypass in Test Mocks

**What goes wrong:** Tests mock PrismaService or individual repositories without engaging the tenant-scoping Prisma extension. Tests pass with raw queries that would throw `TenantContextRequiredError` in production because the `CorrelationContext` (AsyncLocalStorage) is never set up in the test harness.

**Why it happens:** The existing tenant-scoping extension (`prisma/tenant-scoping/`) relies on `CorrelationContext.getContext()` returning a context with `tenantId`. In unit tests, there is no HTTP request to trigger the NestJS middleware that populates this. Developers mock Prisma methods directly (e.g., `prisma.email.findMany.mockResolvedValue(...)`) and never discover that their service code would fail without a tenant context.

**Consequences:** Tests give false confidence. A service that works in tests may silently return cross-tenant data or throw in production. The existing test for `tenant-scoping.extension.spec.ts` only tests the extension itself -- it does not validate that services USE it correctly.

**Prevention:**
1. Create a `TestTenantContext` helper that wraps test execution in `CorrelationContext.run({ tenantId: 'test-tenant', correlationId: 'test' })`.
2. For integration-level tests of any service that touches Prisma, always run through the tenant-scoping layer rather than mocking Prisma directly.
3. Add a lint rule or test helper that fails if any new `.spec.ts` file mocks `PrismaService` methods on tenant-scoped models without also setting up tenant context.

**Detection:** Tests that mock `prisma.X.findMany` without setting `mockTenantId` or wrapping in `CorrelationContext`. Search for `prisma.*.find` in spec files that lack any tenant context setup.

**Phase:** Backend unit test phase. Address FIRST, before writing any new service tests.

---

### Pitfall C2: better-auth ESM/CJS Boundary in Jest

**What goes wrong:** `better-auth` is an ESM-only package. Jest (CJS by default) cannot import it. Tests crash with `SyntaxError: Cannot use import statement outside a module` or `ERR_REQUIRE_ESM`. The existing codebase already has `better-auth-node.mock.ts` and `jest.mock('../better-auth.module')` patterns, but new test authors do not know to follow them.

**Why it happens:** `better-auth` ships ESM-only. The existing `moduleNameMapper` in `jest.config.js` maps `better-auth/node` to a CJS mock. But any test that imports a module that imports from `better-auth` (not just `better-auth/node`) will fail unless that import chain is also mocked. The `BetterAuthGuard` test already demonstrates the pattern (`jest.mock('../better-auth.module')`), but this is easy to miss.

**Consequences:** New tests hang or crash. Developers spend hours debugging ESM vs CJS issues instead of writing tests. Some give up and skip testing auth-adjacent modules.

**Prevention:**
1. Document the mandatory mock pattern in a `TESTING.md` or inline comment at the top of `test/setup.ts`.
2. Create a shared `test/helpers/mock-better-auth.ts` that exports a pre-configured mock factory for the auth instance.
3. Add `better-auth` and all its subpath exports to `moduleNameMapper` in `jest.config.js` proactively.

**Detection:** Jest test runs that fail with `SyntaxError` mentioning `import` or `export` in `node_modules/better-auth`.

**Phase:** Test infrastructure setup phase. Must be solved before any new guard/auth tests are written.

---

### Pitfall C3: AI SDK streamText Mocking Without Official Test Utilities

**What goes wrong:** Tests for AI chat streaming either (a) mock at too high a level (mock the entire service, test nothing), or (b) try to mock `streamText` at the HTTP level and get the SSE format wrong, causing tests to hang or produce garbled output.

**Why it happens:** AI SDK v6 provides `MockLanguageModelV3` and `simulateReadableStream` from `ai/test`, but most developers are unaware of these. They instead mock `fetch` or mock the Mistral provider, neither of which correctly simulates the streaming protocol. The `AiChatService` likely calls `streamText()` from `ai`, and the tool loop + streaming response shape is non-trivial.

**Consequences:** AI module tests are either trivially mocked (testing nothing real) or impossibly fragile (break on any AI SDK update). Tool calls within streams are especially hard to test -- the mock must simulate the tool-call / tool-result cycle.

**Prevention:**
1. Use `MockLanguageModelV3` from `ai/test` as the model in unit tests. This is the officially supported approach.
2. Use `simulateReadableStream` for tests that need to verify streaming behavior (e.g., SSE endpoint tests).
3. For service-level tests, inject the mock model via DI rather than mocking the `ai` module globally.
4. Create a `test/helpers/mock-ai-model.ts` that provides pre-configured mock models with common tool responses.

**Detection:** AI test files that `jest.mock('ai')` globally or that mock `fetch` for streaming endpoints.

**Phase:** AI module test phase. Create the mock helpers first, then write the tests.

**Sources:**
- [AI SDK Core: Testing](https://ai-sdk.dev/docs/ai-sdk-core/testing) (official docs)
- [Testing Streaming Responses with AI SDK](https://blog.atrera.com/post/unit-testing-streaming-ai-vercel-sdk/)

---

### Pitfall C4: Playwright E2E Tests With Stale Auth State

**What goes wrong:** E2E tests use stored `playwright/.auth/user.json` (from `auth.setup.ts`), but the session token in the cookie expires or the backend session is invalidated between test runs. Tests fail with auth redirects that look like application bugs.

**Why it happens:** The current Playwright config uses a `setup` project that creates auth state, then all browser projects depend on that `storageState`. If the backend session has a short TTL (better-auth `cookieCache` with 300s maxAge), and the test suite takes longer than that, mid-suite tests hit expired sessions. Worse: the existing fixtures use `'test-jwt-token'` as a hardcoded cookie value, which only works when ALL API calls are mocked. If any test hits a real backend, it fails.

**Consequences:** Flaky tests that pass locally (fast) but fail in CI (slow). Tests that pass in isolation but fail in suite order. Debugging auth-related E2E failures is especially painful because the symptoms (blank page, redirect loops) don't point to the root cause.

**Prevention:**
1. For fully-mocked E2E tests (current pattern): ensure the catch-all mock at `**/localhost:3000/**` is robust and returns correct shapes for new endpoints.
2. For any future real-backend E2E tests: implement programmatic session creation via `better-auth` test utilities (see [GitHub issue #5609](https://github.com/better-auth/better-auth/issues/5609)) and refresh before each test.
3. Add a test-health check at the start of each E2E spec that validates the auth state is still valid.
4. Keep the current `injectAuthCookie` pattern but add explicit comments that it ONLY works with fully-mocked backends.

**Detection:** E2E tests that intermittently redirect to `/auth/login` when they should be on authenticated pages.

**Phase:** E2E test phase. Establish the auth strategy BEFORE writing new E2E tests.

---

### Pitfall C5: Coverage Metric Gaming -- Testing Happy Paths Only

**What goes wrong:** Coverage target (e.g., 80%) is hit by testing only happy paths through services. The resulting test suite has high line coverage but zero confidence in error handling, edge cases, multi-tenant boundary violations, race conditions, or partial failure scenarios.

**Why it happens:** Happy path tests are fast to write. Error paths require understanding failure modes. Multi-tenant boundary tests require careful setup of two tenant contexts. Developers gravitate toward the easiest tests that move the coverage number.

**Consequences:** False confidence. The test suite is green but production bugs slip through in error handling, concurrent access, and tenant isolation -- the exact areas where PMSync has the most historical issues (see v1 race condition fixes, v4.1 security hardening).

**Prevention:**
1. Define coverage goals by risk category, not raw percentage:
   - Tenant isolation: 100% of tenant-scoped services must have cross-tenant rejection tests.
   - Error handling: Every Prisma P2002/P2034 retry path must be tested.
   - Auth boundaries: Every guard (BetterAuthGuard, TenantGuard, RolesGuard, ConsentGuard) must have deny-case tests.
2. Use mutation testing (e.g., Stryker) on critical modules to validate test quality, not just coverage.
3. Require that every `.spec.ts` file has at least one negative/error test case.

**Detection:** Coverage report shows >80% lines but `git log` shows production bugs in "covered" code. Spec files with zero `expect(...).rejects` or `expect(...).toThrow()`.

**Phase:** All phases. Enforce from the start via PR review checklist.

**Sources:**
- [Full Test Coverage: Myths vs Reality](https://www.testdevlab.com/blog/full-test-coverage-explained)

---

## Moderate Pitfalls

---

### Pitfall M1: MUI Theme Provider Missing in Component Tests

**What goes wrong:** Component unit tests render MUI components without wrapping them in `ThemeProvider`. Components that use `useTheme()` or `sx` props with theme tokens crash with cryptic errors like "Cannot read properties of undefined (reading 'palette')".

**Why it happens:** The existing `jest.setup.ts` mocks `next/router`, `localStorage`, and `matchMedia`, but does NOT set up a MUI `ThemeProvider`. Every component test must manually wrap in a provider, and developers forget.

**Prevention:**
1. Create a `test/helpers/render-with-theme.tsx` that wraps `@testing-library/react`'s `render` with the project's MUI theme.
2. Export this as the default `render` function in test utils so developers use it by default.
3. The wrapper should include: `ThemeProvider`, `QueryClientProvider` (with fresh client per test), and the translation provider.

**Detection:** Component tests that fail with "Cannot read properties of undefined" on `theme.*` or `palette.*`.

**Phase:** Frontend test infrastructure phase. Create the wrapper BEFORE any component tests.

**Sources:**
- [MUI Testing Guide](https://mui.com/material-ui/guides/testing/)

---

### Pitfall M2: QueryClient Shared Across Tests

**What goes wrong:** Multiple frontend tests share a single `QueryClient` instance. Cached data from one test bleeds into the next, causing order-dependent test failures. Test A populates a query cache; Test B runs and sees stale data.

**Why it happens:** TanStack Query's `QueryClient` retains cache across renders. If tests use a module-level `QueryClient` (or the one from `lib/query-client.ts`), all tests in a file share state.

**Prevention:**
1. Create a fresh `QueryClient` in `beforeEach` or in the test wrapper function.
2. Set `retry: false` and `gcTime: 0` in test QueryClient to prevent retry delays and cache leakage.
3. Never import the production `queryClient` instance in tests.

**Detection:** Tests that pass individually (`jest --testPathPattern=MyTest`) but fail when run with the full suite.

**Phase:** Frontend test infrastructure phase.

---

### Pitfall M3: Testing Encrypted Fields Without Encryption Setup

**What goes wrong:** Integration tests that touch encrypted fields (AES-256-GCM) fail because the encryption keys are not configured in the test environment. The Prisma encryption extension either throws or returns garbled data.

**Why it happens:** PMSync uses per-tenant HKDF key derivation for field encryption. Test environments typically don't have `ENCRYPTION_MASTER_KEY` or the per-tenant key derivation configured. The `withoutTenantScoping` bypass exists but doesn't bypass encryption.

**Prevention:**
1. For unit tests: mock the encryption extension or use `jest.mock` on `field-encryption.utils.ts`.
2. For integration tests: provide a stable test `ENCRYPTION_MASTER_KEY` in `.env.test` and ensure the test tenant has derived keys.
3. Never test with production encryption keys.

**Detection:** Tests that fail with "Invalid key length" or produce Base64-encoded garbage in assertions.

**Phase:** Backend integration test phase.

---

### Pitfall M4: BullMQ Job Testing Without Redis

**What goes wrong:** Tests for queue processors (email sync, contact embedding, cleanup) either require a running Redis instance or fail silently when the queue is mocked too aggressively.

**Why it happens:** BullMQ requires Redis. In unit tests, developers mock the queue entirely, but then the processor logic (which handles retries, DLQ, rate limiting) is untested. In integration tests, spinning up Redis adds CI complexity.

**Prevention:**
1. For processor logic: extract the processing function from the BullMQ handler so it can be tested without the queue infrastructure.
2. For queue behavior (retry, DLQ): use a dedicated Redis test container in CI.
3. Never mock the processor function itself -- mock only the external dependencies it calls.

**Detection:** Queue processor spec files that mock the processor's own method instead of its dependencies.

**Phase:** Backend unit test phase for processors; integration test phase for queue behavior.

---

### Pitfall M5: Playwright Catch-All Mock Hiding Bugs

**What goes wrong:** The existing E2E fixtures have a catch-all route handler (`**/localhost:3000/**`) that returns `200 {}` for any unmocked API call. New features that add API calls appear to work in E2E tests even when the response shape is completely wrong, because the catch-all returns an empty object instead of a 404.

**Why it happens:** The catch-all was added (see `fixtures.ts` line 222) to prevent E2E failures when new endpoints are added. This is pragmatic but dangerous -- it masks missing mocks and makes E2E tests unable to catch frontend code that mishandles empty/malformed responses.

**Prevention:**
1. Log a warning (to Playwright trace) whenever the catch-all is triggered, including the URL that was not explicitly mocked.
2. In strict mode (for CI), make the catch-all return 500 instead of 200 so unmocked endpoints fail loudly.
3. When adding new E2E tests for a feature, always add explicit mocks for that feature's endpoints FIRST.

**Detection:** E2E tests that pass despite having no explicit mock for the endpoints they exercise.

**Phase:** E2E test infrastructure phase.

---

### Pitfall M6: Mocking `request.user` Incorrectly in Controller/Guard Tests

**What goes wrong:** Controller tests set `request.user = { id, tenantId }` but miss fields that guards or decorators rely on (e.g., `userId`, `role`, `sessionId`, `email`). The `BetterAuthGuard` maps session data to a specific shape with BOTH `id` and `userId` (for backward compatibility). Tests that use a partial mock pass the guard but fail in service calls that expect the full shape.

**Why it happens:** The `request.user` shape in PMSync has evolved through multiple auth migrations (JWT -> better-auth). It now has both `id` and `userId` pointing to the same value, plus `sessionId`, `role`, `email`, `firstName`, `lastName`. Missing any field may not cause an immediate crash but leads to subtle bugs.

**Prevention:**
1. Create a `test/factories/mock-user.factory.ts` that returns the full `SessionUser` shape with sensible defaults.
2. Use this factory in ALL controller and guard tests.
3. Type the mock: `const mockUser: SessionUser = createMockUser({ tenantId: 'test' })`.

**Detection:** Controller tests where `request.user` is assigned an object literal with fewer than 5 properties.

**Phase:** Backend test infrastructure phase.

---

### Pitfall M7: Composite Primary Key Confusion in Test Data

**What goes wrong:** Tests create Email, Folder, Contact, CalendarEvent, or Embedding records using simple `id` fields, but these models use composite primary keys (e.g., `@@id([tenantId, externalId, providerId])` for Email). Test assertions using `findUnique({ where: { id } })` fail because `id` is not the primary key.

**Why it happens:** 5 core models use composite PKs (documented in `COMPOSITE_PK_MODELS` set). Developers accustomed to simple `id`-based lookups write tests that don't account for the composite key structure.

**Prevention:**
1. Create test data factories for each composite PK model that generate valid composite keys.
2. Document the composite PK models in the test README with examples of correct `findUnique` calls.
3. In test helpers, always use `where: { tenantId_externalId_providerId: { ... } }` patterns.

**Detection:** Tests with `prisma.email.findUnique({ where: { id: ... } })` -- this will fail at runtime.

**Phase:** Backend test infrastructure phase.

---

## Minor Pitfalls

---

### Pitfall L1: Console Silence Hiding Test Failures

**What goes wrong:** The current `test/setup.ts` silences `console.log` and `console.debug` globally. Errors that are logged (not thrown) are invisible during test runs. A service that catches an error and logs it will appear to pass in tests.

**Prevention:** Only silence `console.log`/`console.debug`, keep `console.error` and `console.warn` visible. The current setup already does this correctly (only mocks `log` and `debug`), but verify this is preserved as test infrastructure evolves.

**Phase:** All phases. Monitor during test infrastructure setup.

---

### Pitfall L2: Playwright `waitForSelector` vs Web-First Assertions

**What goes wrong:** Existing E2E tests mix `waitForSelector` (Playwright classic) with `expect(locator).toBeVisible()` (web-first assertions). The `waitForSelector` approach is more fragile and does not auto-retry like web-first assertions.

**Prevention:** Prefer `expect(page.getByRole(...)).toBeVisible()` over `page.waitForSelector('css-selector')`. Refactor existing tests during the E2E phase. The current `auth.spec.ts` already uses both patterns -- standardize on web-first.

**Phase:** E2E test phase.

---

### Pitfall L3: Contract Tests Depending on Live OpenAPI Spec

**What goes wrong:** The existing contract tests (`test/contract/`) load the OpenAPI spec from a file and skip if unavailable (`if (!spec) return`). This means contract tests silently pass (by skipping) in environments where the spec isn't generated, giving false confidence.

**Prevention:** In CI, fail contract tests if the spec file is missing rather than skipping. Locally, document how to generate the spec before running contract tests.

**Phase:** CI/infrastructure phase.

---

### Pitfall L4: Frontend Test Transform for ESM Packages

**What goes wrong:** The frontend `jest.config.js` has `transformIgnorePatterns` for `@tanstack`, `clsx`, and `tailwind-merge`. New dependencies added during v5.1 (e.g., `assistant-ui`, `@ai-sdk/*`) may also need to be transformed, causing cryptic import errors.

**Prevention:** When adding any new ESM-only dependency to the frontend, immediately add it to `transformIgnorePatterns` in `jest.config.js`. Keep a comment in the config explaining why each package is listed.

**Phase:** All phases. Ongoing vigilance.

---

### Pitfall L5: Zustand Store Testing Without Reset

**What goes wrong:** Zustand stores persist state across tests in the same file. Test A modifies store state; Test B sees the modified state instead of the initial state.

**Prevention:** Call `useStore.setState(initialState)` in `beforeEach`, or use Zustand's `create` with a factory function in tests. The email-ui-store uses domain slices -- each slice's initial state must be reset independently.

**Phase:** Frontend unit test phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Test infrastructure setup | ESM/CJS boundary issues (C2) | Build all mocks and helpers first |
| Backend unit tests (services) | Tenant scoping bypass (C1) | Require CorrelationContext in all service tests |
| Backend unit tests (guards) | Incomplete request.user shape (M6) | Use typed mock user factory |
| Backend unit tests (queues) | Missing Redis / over-mocked processors (M4) | Extract processor logic from queue handler |
| Backend integration tests | Encryption key setup (M3) | Provide .env.test with test encryption keys |
| Frontend unit tests (components) | Missing ThemeProvider (M1) | Use render-with-theme wrapper |
| Frontend unit tests (hooks/stores) | Shared QueryClient / Zustand state (M2, L5) | Fresh instances per test |
| AI module tests | streamText mock complexity (C3) | Use MockLanguageModelV3 from ai/test |
| E2E auth flows | Stale session state (C4) | Validate auth before each test spec |
| E2E feature tests | Catch-all mock hiding bugs (M5) | Log or fail on catch-all hits |
| Coverage reporting | Happy-path-only gaming (C5) | Require negative tests per spec file |
| Contract tests | Silent skip on missing spec (L3) | Fail in CI if spec missing |

## Sources

- PMSync codebase analysis (backend/test/, frontend/e2e/, jest configs, existing spec files)
- [AI SDK Core: Testing](https://ai-sdk.dev/docs/ai-sdk-core/testing) -- official mock utilities documentation
- [MUI Testing Guide](https://mui.com/material-ui/guides/testing/) -- official component testing guidance
- [Playwright Authentication](https://playwright.dev/docs/auth) -- session reuse patterns
- [better-auth test utilities discussion](https://github.com/better-auth/better-auth/issues/5609) -- programmatic session creation for E2E
- [NestJS + Prisma transaction propagation & test rollback](https://blog.callgent.com/nestjs-prisma-transaction-propagation-test-rollback-multi-tenancy) -- multi-tenant test patterns
- [Testing Streaming Responses with AI SDK](https://blog.atrera.com/post/unit-testing-streaming-ai-vercel-sdk/) -- streamText mock patterns
- [Full Test Coverage: Myths vs Reality](https://www.testdevlab.com/blog/full-test-coverage-explained) -- coverage metric pitfalls
