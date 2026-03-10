# Feature Landscape

**Domain:** Test coverage, MUI consistency audit, and production polish for full-stack NestJS + Next.js app
**Researched:** 2026-03-10

## Current State Inventory

Before defining features, here is what exists today:

**Backend tests (56 spec files):**
- Email module: CRUD, bulk, search (3 unit), controller + sync-back pre-split (2)
- Email-sync: folder sync (4), IMAP drivers (5), Gmail folder (1), Microsoft folder (1), sync-token (1), sync-message-processor (1)
- AI: embeddings (3), PII (2), prompt guard (1), email-insights pre-split (1)
- AI-chat: conversation, HITL, hybrid-search, chat-pipeline, ledger, RAG E2E (7 test files)
- Auth: better-auth guard (1), org guards (3), member provisioning (1), seed health (1), auth flows (1), audit hooks (1), admin plugin (1)
- Common: prisma-retry (1), tool-registry (1), event-wiring (1), response-envelope interceptor (1), api-exception filter (1), crypto (1), hash-search (1), vector-validation (1), tenant-key (1), data-cleanup audit (1)
- Compliance: consent service (1), consent guard (1), GDPR integration (1), legal acceptance (1), data export (1), account deletion (1)
- Encryption: field-encryption utils (1), extension (1), integration (1)
- Tenant-scoping: extension (1)
- Audit: interceptor (1), service (1)
- Realtime: handshake cookie (1), auth-token service (1)
- Scripts: backfill encryption (1), backfill from hash (1)
- Contract tests: 5 (auth-login, emails-list, contacts-list, ai-chat, briefing)
- Integration tests: 4 (realtime-redis, social-login, csrf-token, auto-connect-social)
- Module bootstrap: 1

**Frontend tests (15 files, excluding E2E):**
- Unit tests: query-client (1), store-hydration (1), SearchHighlight (1), LabelTreeDndWrapper (1), api-client-interceptor (1), error-utils (1), constants (1)
- Hook tests: use-ai-compose (1), use-ai-actions (1)
- Component tests: OrgSwitcher (1), login page (1), register page (1), SocialLoginButtons (1), invitation accept (1)

**Frontend E2E (13 Playwright specs):**
- auth, chat-e2e, chat-mobile, chat-visual-audit, compose, email-list, keyboard-navigation, accessibility, screenshot-settings, search, search-clear, visual-regression-splits, middleware-redirects

**Zero-test modules (backend):**
- calendar (33 source files, 0 tests)
- labels (4 source files, 0 tests)
- providers (17 source files, 0 tests)
- subscription (13 source files, 0 tests)
- tenants (5 source files, 0 tests)
- users (4 source files, 0 tests)
- health (3 source files, 0 tests)
- contacts (27 source files, 1 stale pre-split test)
- mistral (5 source files, 1 test)

**Zero-test areas (frontend):**
- Zustand stores (8 stores + 6 email-ui slices = 14 files, 0 tests)
- TanStack Query hooks (~30 hook files, 0 tests except 2 AI hooks)
- Settings components (14 files, 0 tests)
- Admin components (4 files, 0 tests)
- Onboarding components (7 files, 0 tests)

## Table Stakes

Features the test suite must have. Missing = cannot confidently release.

### Backend Unit Tests (untested modules)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Calendar module tests | 33 files, zero tests. Webhooks, sync, conflict resolution, ICS parsing, meeting prep, focus time. Business-critical scheduling logic. | High | ~15 service/util files need tests. Abstract classes + provider factory need mock strategies. Calendar-sync worker is BullMQ job processor. |
| Labels module tests | CRUD + nested label support. Used by AI triage. Simple but untested. | Low | 1 service, 1 controller. Straightforward Prisma mock tests. |
| Providers module tests | OAuth flows, IMAP config, token lifecycle. Security-sensitive: handles OAuth tokens, client secrets. | Med | 7 services. oauth-state, google-oauth, microsoft-oauth need external API mocking. provider-config is pure logic. |
| Subscription module tests | Billing, quotas, cost protection, usage tracking. Money-adjacent = must be tested. | Med | 7 services + 1 guard. Autumn billing provider needs mock. QuotaGuard is security-critical (enforces plan limits). |
| Tenants module tests | Multi-tenant isolation is the core security invariant. | Low | 1 service, 1 controller. Must verify tenantId in every query. |
| Users module tests | Profile management, preferences. | Low | 1 service, 1 controller. Basic CRUD. |
| Health module tests | Deployment readiness probes. If health check lies, bad deploys happen. | Low | 1 service, 1 controller. Verify DB/Redis/queue connectivity assertions. |
| Contacts module tests (refresh) | 27 files, only 1 stale pre-split spec. Sync, webhooks, CRM scoring, cache. | High | Similar scope to calendar. Relationship scoring and sync scheduler are business-critical. Pre-split test needs full rewrite. |

### Backend Integration Tests (gaps)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cross-tenant data isolation proof | Verify Prisma tenant-scoping extension actually prevents cross-tenant leaks under real DB conditions. | Med | Create 2 tenants in test DB, seed data, query from wrong tenant context, assert empty results. Covers the 42-model scoping from v4.1. |
| Auth guard chain integration | BetterAuthGuard -> TenantGuard -> RolesGuard as a full pipeline. Individual unit tests exist but the chain is untested. | Med | Test: unauthenticated (401), wrong tenant (403), wrong role (403), correct (200). On real controller endpoints. |
| BullMQ worker tests | Calendar-sync and contacts-sync workers process jobs but have zero tests. Job failure = silent data staleness. | High | Requires BullMQ test setup with mocked external APIs. Workers orchestrate multiple services internally. |

### Backend Contract Tests (expansion)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Calendar contract test | Calendar endpoints response shape validation. | Low | Follow `backend/test/contract/` existing pattern. |
| Labels contract test | Label CRUD response envelope. | Low | Same pattern. |
| Providers contract test | OAuth + IMAP provider response shapes. | Low | Same pattern. |
| Subscription contract test | Billing/quota endpoint shapes. | Low | Same pattern. |
| Organizations contract test | Org CRUD, invite, member management response shapes. | Low | Same pattern. |
| Admin contract test | User list, ban, impersonation response shapes. | Low | Same pattern. |

### Frontend Unit Tests (critical gaps)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Zustand store tests | 14 store files drive all UI state. Zero tests. Selection, filter, compose, kanban, sidebar state. | Med | Pure logic testing via `getState()/setState()`. No DOM needed. Priority: email-ui slices (selection, filter, view, compose) -- they handle the main email interaction. |
| TanStack Query hook tests | ~30 hook files, 0 tested (except 2 AI hooks). Entire data fetching layer between API and UI is untested. | Med | Use `@tanstack/react-query` test utils with `QueryClientProvider` wrapper. Test cache keys, error states, staleTime behavior. Priority: use-emails, use-folders, use-contacts, use-organizations. |
| Settings component tests | 14 settings components, 0 tests. Security settings components handle TOTP, passkeys, sessions -- security-critical UI. | Med | MUI form interaction tests. SecurityMfaSection and SecuritySessionsSection are highest priority (expose 2FA management). |

### Frontend E2E Tests (new v5.0 features)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Organization flows E2E | Create org, invite member, accept invitation, switch org, role-based visibility. Core v5.0 feature with zero E2E. | High | Multi-user scenario: needs second auth state in Playwright. Invitation acceptance is cross-session flow. |
| Admin panel E2E | User list, search, ban/unban, impersonation, session revocation. Admin operations must work correctly. | High | Requires admin role setup in test fixture. Impersonation changes auth context mid-test (tricky). |
| Onboarding wizard E2E | 6-step wizard: name, MFA, avatar, workspace, email provider, legal consent. New user entry point. | Med | Linear flow but each step has validation. MFA step needs TOTP mock or conditional skip. |
| Security settings E2E | Password change, TOTP setup/remove, passkey registration, session management, backup codes. | High | WebAuthn/passkey needs Playwright virtual authenticator via CDP protocol. TOTP needs shared secret injection. |
| Settings page E2E | General, notifications, accounts, signatures, AI settings. | Med | Form interactions with save/cancel. Some settings trigger backend API calls. |

### MUI Consistency Audit

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Automated MUI pattern scanner | CLAUDE.md mandates "ALL components use MUI" and "Zero Tailwind utility classes in .tsx/.ts files." Manual audit does not scale. | Med | ESLint rule or standalone AST script that flags: (1) Tailwind classes in className props, (2) hardcoded color values in sx, (3) raw CSS-in-JS outside MUI's sx/styled, (4) non-theme color references. |
| Fix audit findings | Whatever the scanner catches needs fixing. v5.0 was a large migration; some non-MUI patterns likely slipped through. | Unknown | Complexity depends on how many violations exist. Could be 5 files or 50. |

## Differentiators

Features that elevate the test suite from "adequate" to "trustworthy." Not required for MVP.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Coverage threshold enforcement | Jest `coverageThreshold` in both configs. Prevents regression once coverage improves. | Low | Backend target: 50% lines (realistic given current state). Frontend target: 30% lines. Increase over time. |
| Visual regression baseline expansion | `visual-regression-splits.spec.ts` exists. Extend to new v5.0 pages (orgs, admin, onboarding, security settings). | Med | Baseline management: store in git or artifact? Git is simpler but adds repo bloat. |
| Accessibility audit expansion | `accessibility.spec.ts` exists. Add axe-core checks for every new page. | Low | Playwright + @axe-core/playwright. One assertion per page. High value-to-effort ratio. |
| API schema validation in contract tests | Validate responses against generated OpenAPI spec using `ajv`. Catch Swagger-vs-reality drift. | Med | `spectral lint` already validates the spec itself. This validates runtime responses match the spec. |
| Performance regression assertions | Assert p95 response times in integration tests. Backend already has Prometheus histograms. | Med | Useful but premature without baseline data. Better as a future milestone concern. |
| Mutation testing on security paths | Stryker-js on auth guards, tenant scoping, crypto services. Validates tests actually catch regressions. | High | Slow to run. Best as a one-time audit, not CI gate. Focus: `common/auth/`, `prisma/encryption/`, `prisma/tenant-scoping/`. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| 100% code coverage target | Diminishing returns past 70%. Incentivizes testing getters/setters and writing trivial assertions. | Set pragmatic thresholds (50% backend, 30% frontend). Focus on business logic and security paths. |
| Component snapshot tests | Brittle: every MUI theme token change breaks snapshots. High maintenance, low signal. | Visual regression via Playwright for layout. Unit tests for behavior/logic only. |
| Full E2E for every page | Slow, flaky, expensive. E2E pyramid inversion is a common anti-pattern. | E2E for critical user journeys only. Unit/integration for everything else. |
| Backend supertest E2E bootstrap | Full NestJS app bootstrap per test is slow and fragile. `module-bootstrap.spec.ts` already verifies wiring. | Unit tests (mocked deps) + contract tests (shape validation) + targeted integration tests. |
| Cypress migration | Playwright is configured with 13 specs, multi-browser setup, auth state management. Zero reason to switch. | Extend existing Playwright infrastructure. |
| Testing third-party internals | Testing that MUI renders a button, or TanStack caches correctly. Waste of effort. | Test your code's interaction with libraries -- not the libraries themselves. |
| Mocking Prisma with real DB for unit tests | Test DB management complexity, seed data rot, migration conflicts. | Mock Prisma at service level for unit tests. Reserve real DB for specific integration tests. |
| Test file colocation everywhere | Moving all tests next to source files. Some modules already use `__tests__/` dirs, others use colocated `.spec.ts`. | Keep existing conventions per module. Don't reorganize test locations as part of this milestone. |

## Feature Dependencies

```
MUI consistency scanner ---------> (standalone, no deps)
Fix audit findings --------------> MUI consistency scanner (finds what to fix)

Backend unit tests (all modules) -> (standalone, no deps)
Backend contract tests expansion -> (standalone, follows existing pattern)
Cross-tenant isolation test -----> (standalone, needs test DB)
Auth guard chain integration ----> Backend unit tests for guards (already exist)
BullMQ worker tests -------------> Backend unit tests for services (workers call services)

Zustand store tests -------------> (standalone, no deps)
TanStack Query hook tests -------> (standalone, no deps)
Settings component tests --------> (standalone, no deps)

Organization flows E2E ----------> Auth E2E setup (already exists in auth.spec.ts)
Admin panel E2E -----------------> Org flows E2E (admin needs org context)
Security settings E2E -----------> Auth E2E setup (needs authenticated state)
Onboarding wizard E2E -----------> Auth E2E setup (new user flow)
Settings page E2E ---------------> Auth E2E setup (needs authenticated state)

Coverage threshold enforcement --> Backend + Frontend unit tests (need tests first)
Visual regression expansion -----> New E2E specs exist (pages must be navigable)
Accessibility audit expansion ---> New E2E specs exist (pages must be reachable)
```

## MVP Recommendation

### Phase 1 - Backend unit tests + MUI audit tooling (highest impact, no deps)

1. **Calendar module tests** -- Largest untested module. ~15 service/util files.
2. **Labels module tests** -- Small, quick win.
3. **Providers module tests** -- Security-sensitive OAuth handling.
4. **Subscription module tests** -- Money-adjacent logic.
5. **Tenants + Users + Health module tests** -- Small modules, fast to cover.
6. **MUI consistency scanner** -- Build once, run forever.
7. **Fix MUI audit findings** -- Address whatever the scanner catches.

Prioritize: Calendar and providers are highest risk. Labels/tenants/users/health are quick wins.

### Phase 2 - Frontend unit tests + contract expansion

8. **Zustand store tests** -- Pure logic, high value per effort.
9. **TanStack Query hook tests** -- Data layer coverage.
10. **Settings component tests** -- Security settings UI coverage.
11. **Contract tests expansion** -- 6 new contracts, follows existing pattern.
12. **Contacts module tests** -- Apply calendar test patterns to contacts.

### Phase 3 - E2E for v5.0 features

13. **Organization flows E2E** -- Most complex new feature.
14. **Admin panel E2E** -- Security-sensitive operations.
15. **Security settings E2E** -- MFA/passkey management.
16. **Onboarding wizard E2E** -- New user entry point.

### Phase 4 - Hardening

17. **Cross-tenant isolation integration test** -- Security proof.
18. **Coverage threshold enforcement** -- Lock in gains.
19. **Accessibility audit expansion** -- axe-core on new pages.
20. **Visual regression baseline expansion** -- Screenshot comparison for new pages.

### Defer to future milestones

- **Mutation testing**: High value but extremely slow. Run manually after this milestone.
- **BullMQ worker integration tests**: Complex setup for diminishing returns. Workers delegate to services that will be unit-tested.
- **Performance regression assertions**: Need baseline data first.
- **API schema validation**: Nice-to-have once OpenAPI spec is stabilized.

## Complexity Summary

| Category | Items | Est. Test Files | Complexity |
|----------|-------|-----------------|------------|
| Backend untested modules (unit) | 8 modules, ~106 source files | 25-35 spec files | High (calendar + contacts dominate) |
| Backend contract tests | 6 new contracts | 6 spec files | Low |
| Backend integration tests | 2-3 scenarios | 2-3 spec files | Med |
| Frontend store tests | 14 store files | 8-10 test files | Med |
| Frontend hook tests | ~30 hooks | 10-15 test files | Med |
| Frontend component tests | ~25 untested components | 8-12 test files | Med |
| Frontend E2E | 5 new journeys | 5 spec files | High (multi-user, WebAuthn) |
| MUI audit tooling | 1 scanner + fixes | 1-2 files + edits | Med |
| Coverage enforcement | Config changes | 0 new files | Low |

**Total estimated new test files: 65-90**
**Total estimated effort: 4-6 phases of focused work**

## Sources

- Direct codebase analysis: module listings, test file inventory, jest/playwright configs
- Existing test patterns in `backend/test/contract/`, `backend/src/**/__tests__/`, `frontend/e2e/`, `frontend/__tests__/`
- PROJECT.md v5.1 milestone definition
- CLAUDE.md MUI mandate and testing rules
- MEMORY.md MUI migration history (v5.0 removed all shadcn/Radix, converted to MUI)
