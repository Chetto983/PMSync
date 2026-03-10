# Project Research Summary

**Project:** PMSync
**Domain:** Test coverage, MUI consistency audit, and production polish for full-stack NestJS + Next.js multi-tenant email platform
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

PMSync v5.1 is a test coverage and polish milestone for an existing multi-tenant email + calendar + AI platform. The codebase is architecturally mature but has severe coverage gaps: 7 of 16 backend modules have zero tests, the entire frontend data layer (30 TanStack Query hooks, 14 Zustand store files) is untested, and v5.0 org/admin/security features have no E2E coverage. The recommended approach is a layered build-out that starts with shared test infrastructure (mocks, factories, helpers), then covers backend modules by complexity order, then frontend stores and hooks, and finally E2E for the new v5.0 feature surface. This order is non-negotiable due to strict dependencies: shared helpers must exist before module tests, module tests must exist before coverage enforcement, and E2E specs must be written after the auth strategy is locked in.

The key risk is false confidence from poorly written tests. Three failure modes are likely without explicit guardrails: tenant isolation bypass (unit tests that mock Prisma without CorrelationContext pass locally but mask real security bugs), ESM/CJS boundary confusion (better-auth is ESM-only and will crash Jest if the mock pattern is not followed exactly), and happy-path-only coverage gaming (hitting line coverage targets with tests that avoid error paths and cross-tenant boundary violations). All three must be addressed at the infrastructure phase, not discovered mid-execution.

The MUI consistency audit is a parallel track that does not block other phases. The migration from shadcn/Radix/Tailwind to MUI (completed in v5.0) covered 25 components and 12 chat files but cannot be trusted without automated scanning. A grep-based or ESLint-based scanner should be built first to measure violation scope, then violations fixed. The audit is unlikely to be massive but must be instrumented before declaring the migration complete.

## Key Findings

### Recommended Stack

The existing test stack (Jest 30 + Vitest 4 + Playwright 1.58 + @testing-library/react 16) is sufficient and must not be replaced or consolidated. The dual-runner split (Jest for .spec.ts NestJS unit tests, Vitest for .test.ts AI pipeline MSW tests) is intentional — mixing causes ESM transform failures. Three targeted additions are needed.

**Core technologies:**
- `jest-mock-extended@^4.0.0` (backend devDep): type-safe `mockDeep<PrismaService>()` replaces fragile manual mock objects — Prisma official recommendation; HIGH confidence
- `eslint-plugin-mui@^1.0.0` (frontend devDep): `no-literal-colors` + `prefer-named-imports` automate MUI audit and prevent regression — MEDIUM confidence, small community plugin; verified fallback is a grep-based CI script
- `k6 v1.6.0` (standalone binary, NOT npm): Go-based load testing, 70% less CPU than Node alternatives, native WebSocket support for Socket.IO — HIGH confidence, industry standard
- Jest `coverageThreshold` (config change only): built-in enforcement, no new dependency

**What to avoid:** Storybook (300+ deps for what one ESLint rule does), Cypress (Playwright already configured with 13 specs), prismock/jest-prisma (fragile with Prisma 7 compiler), Codecov/Coveralls (Jest thresholds fail locally — simpler and sufficient).

### Expected Features

The v5.1 feature set is entirely about test coverage and code quality. It is not a product feature milestone.

**Must have (table stakes):**
- Backend unit tests for calendar (33 files), contacts (27 files), providers (17 files), subscription (13 files) — highest-risk untested surface (security, money, scheduling)
- Backend unit tests for labels (4 files), tenants (5 files), users (4 files), health (3 files) — quick wins with zero coverage
- Frontend Zustand store tests — 14 store files, zero tests; drive all UI state
- Frontend TanStack Query hook tests — ~30 hooks, zero tests; entire data-fetching layer untested
- MUI consistency scanner + fixes — CLAUDE.md mandates zero Tailwind classes in .tsx/.ts; automated enforcement required
- Cross-tenant data isolation integration test — security proof that Prisma tenant-scoping extension prevents leaks under real DB conditions

**Should have (quality differentiators):**
- Settings component tests — TOTP, passkeys, session management UI (security-critical)
- Frontend E2E for org flows, admin panel, security settings, onboarding wizard — all v5.0 features with zero E2E
- Contract tests expansion (6 new contracts: calendar, labels, providers, subscription, organizations, admin)
- Coverage threshold enforcement in both Jest configs
- Accessibility audit expansion (axe-core on new pages)
- Visual regression baseline expansion for v5.0 pages

**Defer to future milestones:**
- Mutation testing with Stryker (slow, one-time audit; not a CI gate)
- BullMQ worker integration tests (workers delegate to services; service unit tests provide most value)
- Performance regression assertions (need baseline data first)
- API schema runtime validation against OpenAPI spec (premature before spec stabilizes)

### Architecture Approach

The test architecture follows a strict pyramid (60% unit : 20% integration/pipeline : 15% E2E : 5% contract) with the existing dual-runner strategy preserved. Nine canonical patterns govern all new tests, all based on existing codebase examples: multi-tenant Prisma query testing (verify tenantId in every where clause, from `email-crud.service.spec.ts`), better-auth session mocking (mock the module before importing, from `better-auth.guard.spec.ts`), BullMQ worker testing (extract processing logic into injectable service, bypass Worker constructor that needs Redis), WebSocket unit and integration tiers, AI SDK mocking via `MockLanguageModelV3` from `ai/test` (not global module mocks), MUI component testing with ThemeProvider wrapper, TanStack Query hook testing with fresh QueryClient per test, Zustand store testing via direct action calls with `setState` reset in `beforeEach`, and Playwright E2E via route interception extending existing `fixtures.ts`.

**Major components:**
1. Backend test helpers (NEW: `backend/test/helpers/` — mock-prisma, mock-auth, mock-context, mock-bullmq): typed factory functions replacing per-file manual mocks across all backend unit tests
2. Frontend test helpers (NEW: `frontend/test/helpers/` — render.tsx with MUI ThemeProvider + QueryProvider, mock-session.ts): wrapper functions for component and hook tests
3. Playwright fixture extensions (extend existing `frontend/e2e/fixtures.ts`): route mocks for org/admin/security/onboarding endpoints required by v5.0 E2E specs

### Critical Pitfalls

1. **Tenant scoping bypass in test mocks (C1)** — mocking PrismaService without CorrelationContext gives false confidence; services that skip tenantId pass unit tests but expose cross-tenant data in production. The tenant-scoping Prisma extension (AsyncLocalStorage) is not active in unit tests. Prevention: require explicit tenantId assertion in every service test for tenant-scoped models; create a `TestTenantContext` helper.

2. **better-auth ESM/CJS boundary (C2)** — `better-auth` is ESM-only; Jest crashes with `ERR_REQUIRE_ESM` unless `jest.mock('../better-auth.module')` is used before importing the class under test. Existing `backend/test/mocks/better-auth-node.mock.ts` handles `better-auth/node` but not all subpath exports. Prevention: proactively add all better-auth subpath exports to `moduleNameMapper`, document the pattern prominently.

3. **AI SDK streamText mocking (C3)** — do not mock `fetch` or the Mistral provider; use `MockLanguageModelV3` from `ai/test` (official AI SDK test utilities). Tool-call/tool-result cycles in streams are non-trivial to fake any other way. Source: [AI SDK Core: Testing](https://ai-sdk.dev/docs/ai-sdk-core/testing).

4. **Stale Playwright auth state (C4)** — stored `playwright/.auth/user.json` expires; mid-suite tests hit auth redirects that look like application bugs. The existing `injectAuthCookie` pattern only works with fully-mocked backends. Prevention: validate auth state at start of each E2E spec; keep catch-all API mock robust.

5. **Happy-path coverage gaming (C5)** — line coverage targets incentivize skipping error paths. Prevention: require at least one `expect(...).rejects` or `expect(...).toThrow()` per spec file; define coverage goals by risk category (tenant isolation 100%, auth guard deny cases 100%), not raw percentage.

## Implications for Roadmap

Based on research, the natural phase structure follows a strict dependency graph. Shared helpers must precede module tests; module tests must precede coverage gates; E2E auth strategy must be locked before E2E specs are written.

### Phase 1: Shared Test Infrastructure

**Rationale:** ESM/CJS mock failures (C2), missing ThemeProvider crashes (M1), shared QueryClient state leakage (M2), and incomplete request.user shape bugs (M6) will sabotage every subsequent phase if not addressed here. Build once, reuse everywhere.
**Delivers:** `backend/test/helpers/` (mock-prisma, mock-auth, mock-context, mock-bullmq), `frontend/test/helpers/` (render-with-theme, mock-session, mock-api), all better-auth subpath exports in `moduleNameMapper`, documented test pattern guide.
**Addresses:** All infrastructure prerequisites; unblocks all later phases.
**Avoids:** C2 (ESM boundary), M1 (missing ThemeProvider), M2 (shared QueryClient), M6 (incomplete request.user shape), L4 (ESM transform gap for new dependencies).

### Phase 2: Backend Unit Tests — Simple Modules

**Rationale:** Start with modules that have minimal external dependency complexity (no OAuth, no BullMQ, no external APIs). Quick wins that establish the Prisma mock + tenantId assertion pattern as the codebase standard before tackling the 33-file calendar surface.
**Delivers:** Unit tests for health (3 files), users (4 files), tenants (5 files), labels (4 files) — roughly 12-16 new spec files.
**Uses:** `mock-prisma.ts` from Phase 1, `jest-mock-extended` for typed Prisma mocks.
**Avoids:** C1 (tenant scoping bypass — pattern established here propagates to complex modules in Phase 3).

### Phase 3: Backend Unit Tests — Complex Modules

**Rationale:** Providers (OAuth, token lifecycle — security-sensitive), subscription (billing, QuotaGuard — money-adjacent), contacts (27 files, CRM scoring, sync scheduler — business-critical), and calendar (33 files, BullMQ worker, ICS parsing, conflict resolution — business-critical) are the highest-risk untested surface.
**Delivers:** Unit tests for providers (~7 services), subscription (~7 services + QuotaGuard), contacts (full rewrite of stale pre-split test), calendar (~15 service/util files). Estimated 25-35 new spec files.
**Uses:** `mock-bullmq.ts` for calendar-sync worker, `mock-auth.ts` for OAuth guard tests.
**Avoids:** C1 (tenant isolation in complex modules), M4 (BullMQ without Redis — extract processor logic into injectable service), M7 (composite PK models — Email/Folder/CalendarEvent use composite PKs, not simple `id`).

### Phase 4: Backend Contract + Integration Tests

**Rationale:** Contract tests are low-complexity (established pattern in `backend/test/contract/`) and validate response shapes for 6 untested endpoint groups. Cross-tenant isolation integration test is the security proof that unit tests cannot provide — validates Prisma extension behavior under real DB conditions with two real tenants.
**Delivers:** 6 new contract specs (calendar, labels, providers, subscription, organizations, admin), 1 cross-tenant isolation integration test, 1 auth guard chain integration test.
**Avoids:** L3 (contract tests silently skipping on missing spec — fail in CI if spec file absent), M3 (encryption key setup for integration tests via `.env.test`).

### Phase 5: Frontend Unit Tests

**Rationale:** Zustand stores are pure logic (no DOM) — highest value per effort ratio. TanStack Query hooks follow a near-identical pattern once the QueryProvider wrapper from Phase 1 exists. Security settings components (TOTP/passkey management) are highest priority in the component subset.
**Delivers:** Zustand store tests (8-10 files), TanStack Query hook tests (10-15 files), settings component tests (8-12 files). Frontend coverage rises from near-zero to meaningful.
**Uses:** `render-with-theme.tsx` from Phase 1, fresh QueryClient per test, Zustand `setState` reset in `beforeEach`.
**Avoids:** M1 (ThemeProvider missing), M2 (QueryClient shared state), L5 (Zustand state leakage between tests).

### Phase 6: Frontend E2E for v5.0 Features

**Rationale:** E2E specs depend on the auth strategy being stable (locked in Phase 1) and require explicit route mocks. Organization flows must precede admin panel E2E (admin needs org context). Security settings E2E requires Playwright virtual authenticator for WebAuthn (CDP protocol) — the most technically complex item.
**Delivers:** 5 new Playwright specs — org create/invite/switch, admin user management, security settings (MFA/passkeys), onboarding wizard, settings page.
**Avoids:** C4 (stale auth state — validate before each spec), M5 (catch-all mock hiding bugs — explicit route mocks first, log or return 500 on catch-all hits in CI).

### Phase 7: MUI Consistency Audit

**Rationale:** Standalone track that does not block other phases. Build the scanner to measure violation scope (unknown — could be 5 or 50 files), fix findings, promote ESLint rules from `warn` to `error`.
**Delivers:** ESLint plugin or grep-based CI script for MUI enforcement, fixed violations, regression prevention.
**Uses:** `eslint-plugin-mui` if MUI v7 compatible; grep-based fallback script otherwise.
**Avoids:** Regression into Tailwind/hardcoded-color patterns that violate CLAUDE.md mandate.

### Phase 8: Hardening + Coverage Gates

**Rationale:** Coverage enforcement requires tests to exist first. Visual regression and accessibility additions compound E2E investment at low marginal cost. These are the final locks preventing future regression.
**Delivers:** `coverageThreshold` in both Jest configs (backend 50% lines, frontend 30% lines as conservative baselines — ratchet up over time), visual regression baselines for org/admin/onboarding/security pages, axe-core assertions on every new page.
**Avoids:** C5 (happy-path gaming — thresholds enforce minimum quality bars at the CI gate level).

### Phase Ordering Rationale

- Phase 1 is mandatory first: pitfalls C2, M1, and M2 will cause cryptic failures in every subsequent phase if not pre-empted.
- Phases 2-3 sequence simple-before-complex because the tenantId assertion pattern established on health/users/tenants propagates cleanly to calendar's 33-file surface.
- Phase 4 (integration tests) follows unit tests because the auth guard chain integration test depends on individual guard unit tests existing.
- Phases 5 and 6 are independent of each other after Phase 1; they can run in parallel if team capacity allows.
- Phase 7 (MUI audit) is genuinely parallel — can run alongside Phases 2-6.
- Phase 8 must be last: thresholds set before tests exist will break CI immediately.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Calendar + Contacts):** ICS parsing, BullMQ job processor extraction, external calendar API mock shapes — read actual calendar source files before writing test specs.
- **Phase 6 (Security settings E2E):** WebAuthn virtual authenticator via Playwright CDP (`addVirtualAuthenticator`) and TOTP shared-secret injection approach need verification before planning this spec.
- **Phase 3 (Providers):** OAuth token refresh flow and provider factory pattern — read actual implementation to determine mock level (OAuth client vs service).

Phases with standard patterns (skip deeper research):
- **Phase 2 (Simple backend modules):** Canonical Prisma mock + TestingModule pattern. Well-documented, no external dependencies.
- **Phase 4 (Contract tests):** Pattern established in `backend/test/contract/`. Direct copy-and-adapt.
- **Phase 5 (Zustand stores):** Pure state logic, no async. Pattern is trivial.
- **Phase 7 (MUI audit):** Run scanner, fix findings. No pre-planning needed.
- **Phase 8 (Coverage gates):** Jest `coverageThreshold` config change. Minimal work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Additions are minimal (2 devDeps + 1 binary). All based on official documentation. Only uncertainty: eslint-plugin-mui compat with MUI v7 — has a documented fallback. |
| Features | HIGH | Based on direct codebase analysis: module listings, test file inventory, config inspection. No guesswork. |
| Architecture | HIGH | Based on existing canonical test patterns already in the codebase. Patterns are proven and in use today. |
| Pitfalls | HIGH | Based on codebase analysis + official library documentation. ESM/CJS boundary, tenant scoping gap, and QueryClient leakage are concrete verified failure modes. |

**Overall confidence:** HIGH

### Gaps to Address

- **eslint-plugin-mui MUI v7 compatibility:** Not verified. Install and test during Phase 7. If incompatible, use grep-based fallback.
- **Calendar module internal structure:** 33 source files identified as zero-test. Read actual service boundaries and BullMQ worker structure before Phase 3 planning.
- **MUI violation scope:** Unknown count. Run scanner first in Phase 7 before estimating remediation effort.
- **Playwright WebAuthn CDP API:** Passkey test implementation details need verification before Phase 6 security settings spec is planned.
- **Current coverage baselines:** Unknown. Run `jest --coverage` on both workspaces before setting `coverageThreshold` values in Phase 8.

## Sources

### Primary (HIGH confidence)

- PMSync codebase — direct inspection of test configs, spec files, module inventories, jest.config.js, playwright.config.ts
- [Prisma Unit Testing (official)](https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing) — jest-mock-extended recommendation
- [Jest Configuration (official)](https://jestjs.io/docs/configuration) — coverageThreshold API
- [NestJS Testing (official)](https://docs.nestjs.com/fundamentals/testing) — TestingModule patterns
- [Playwright Fixtures (official)](https://playwright.dev/docs/test-fixtures) — fixture extension patterns
- [Playwright Authentication (official)](https://playwright.dev/docs/auth) — session reuse patterns
- [AI SDK Core: Testing (official)](https://ai-sdk.dev/docs/ai-sdk-core/testing) — MockLanguageModelV3, simulateReadableStream
- [MUI Testing Guide (official)](https://mui.com/material-ui/guides/testing/) — ThemeProvider wrapping pattern
- [@testing-library/react API (official)](https://testing-library.com/docs/react-testing-library/api/) — renderHook built-in
- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/) — v1.6.0

### Secondary (MEDIUM confidence)

- [eslint-plugin-mui (npm)](https://www.npmjs.com/package/eslint-plugin-mui) — MUI linting rules; small community plugin, MUI v7 compat unverified
- [better-auth test utilities discussion](https://github.com/better-auth/better-auth/issues/5609) — programmatic session creation for E2E
- [NestJS + Prisma multi-tenant test rollback](https://blog.callgent.com/nestjs-prisma-transaction-propagation-test-rollback-multi-tenancy) — multi-tenant test patterns

### Tertiary (LOW confidence)

- [Testing Streaming Responses with AI SDK](https://blog.atrera.com/post/unit-testing-streaming-ai-vercel-sdk/) — streamText mock patterns; needs verification against AI SDK v6 specifics
- [Full Test Coverage: Myths vs Reality](https://www.testdevlab.com/blog/full-test-coverage-explained) — coverage metric pitfalls; general guidance

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
