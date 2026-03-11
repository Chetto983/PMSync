# Roadmap: PMSync

## Milestones

- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** - Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** - Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** - Phases 50-65 (shipped 2026-03-10)
- **v5.1 Test Coverage & Polish** - Phases 66-72 (in progress)

## Phases

<details>
<summary>v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

Phases 1-12: VoltAgent audit, modern chat UI, priority scoring, follow-ups refactor, nested labels, chat UI on mail, chat improvements, email tool triage, artifact renderers, UI review, AI module audit, test fixes. 12 phases, 42 plans, 19/19 requirements.

</details>

<details>
<summary>v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) - SHIPPED 2026-02-27</summary>

Phases 13-22: PII tokenization, database encryption at rest, GDPR core compliance, data rights & legal, rich artifacts UI, AI triage & bulk ops, AI draft generation, GDPR guard mounting, triage prompt enrichment, bug audit. 10 phases, 31/32 requirements (ENC-03 deferred).

</details>

<details>
<summary>v3.2 AI Rebuild & Cleanup (Phases 23-30) - SHIPPED 2026-03-03 (partial)</summary>

Phases 23-28: SDK foundation, backend core pipeline, tools & RAG, non-chat AI, chat frontend, cleanup & VoltAgent deletion. 6 phases complete (20 plans). Phases 29-30 carried forward to v4.0.

</details>

<details>
<summary>v4.0 Enterprise Stabilization (Phases 31-41) - SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>v4.1 Security Hardening & Debt Reduction (Phases 42-49) - SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `.planning/milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>v5.0 better-auth Migration (Phases 50-65) - SHIPPED 2026-03-10</summary>

- [x] Phase 50: Schema & Infrastructure (2/2 plans)
- [x] Phase 51: Core Email/Password Auth (2/2 plans)
- [x] Phase 52: NestJS Session Validation (3/3 plans)
- [x] Phase 53: Frontend Auth UI (2/2 plans)
- [x] Phase 54: WebSocket Auth (1/1 plans)
- [x] Phase 55: Social Login & MFA (5/5 plans)
- [x] Phase 56: Organizations (3/3 plans)
- [x] Phase 57: Admin Panel (2/2 plans)
- [x] Phase 58: Compliance & Cleanup (3/3 plans)
- [x] Phase 59: Safety Hardening (5/5 plans)
- [x] Phase 60: Middleware & Auth Cleanup (2/2 plans)
- [x] Phase 61: GDPR Org Compliance (1/1 plans)
- [x] Phase 62: Auth Audit Remediation (1/1 plans)
- [x] Phase 63: Email Invitation Accept Page (1/1 plans)
- [x] Phase 64: WS Org-Switch Reconnect (1/1 plans)

15 phases, 34 plans, 51/51 requirements.

</details>

### v5.1 Test Coverage & Polish (In Progress)

**Milestone Goal:** Deep automated test coverage across backend and frontend, MUI consistency enforcement, and production polish. All tests run against real database and real backend -- no Prisma mocking, no mocked API routes.

- [x] **Phase 66: Test Infrastructure** - Real DB test environment, shared helpers, factories, coverage thresholds (completed 2026-03-10)
- [x] **Phase 67: Backend Tests - Simple Modules** - Unit tests for health, users, tenants, labels (completed 2026-03-11)
- [ ] **Phase 68: Backend Tests - Complex Modules** - Unit tests for calendar, contacts, providers, subscription
- [ ] **Phase 69: Backend Integration Tests** - Cross-tenant isolation, auth guard chain, contract tests
- [ ] **Phase 70: Frontend Unit Tests** - Zustand stores, TanStack Query hooks, settings components
- [ ] **Phase 71: Frontend E2E Tests** - Org flows, admin panel, onboarding wizard, security settings
- [ ] **Phase 72: MUI Audit & Polish** - Automated scanner, violation fixes, accessibility audit, visual regression

## Phase Details

### Phase 66: Test Infrastructure
**Goal**: All test tooling, helpers, and environment config exist so every subsequent phase can write tests against real PostgreSQL/Redis without setup friction
**Depends on**: Nothing (first phase of v5.1)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Running `npm test` in backend starts tests against a real PostgreSQL database and real Redis instance (Docker Compose or existing)
  2. Test helpers provide `createTestTenant()`, `createTestUser()`, and `createTestSession()` factories that insert real rows and return typed objects
  3. Each test suite starts with a clean database state (seeded baseline data, cleaned between suites) so tests are isolated and deterministic
  4. Frontend E2E tests (`npx playwright test`) execute against a real running backend server -- no MSW route mocking for API calls
  5. Jest coverage thresholds are configured (50% backend, 30% frontend) and `npm test` fails if coverage drops below threshold
**Plans:** 4/4 plans complete
Plans:
- [ ] 66-01-PLAN.md -- Docker Compose, .env.test, globalSetup/Teardown, Prisma test client
- [ ] 66-02-PLAN.md -- Factory helpers, cleanup utility, smoke test
- [ ] 66-03-PLAN.md -- Playwright real backend config, E2E auth, coverage thresholds
- [ ] 66-04-PLAN.md -- Fix TS2769 type error in playwright.config.ts (gap closure)

### Phase 67: Backend Tests - Simple Modules
**Goal**: Health, users, tenants, and labels modules have comprehensive test coverage proving correct behavior against real database
**Depends on**: Phase 66
**Requirements**: BTEST-05, BTEST-06, BTEST-07, BTEST-08
**Success Criteria** (what must be TRUE):
  1. Health endpoint tests verify DB, Redis, and BullMQ connectivity probes return correct status under healthy and degraded conditions
  2. Users module tests verify profile CRUD and preferences update/retrieval with tenant isolation (user A cannot read user B's profile in a different tenant)
  3. Tenants module tests verify tenant creation, update, and deletion with cascading cleanup and cross-tenant isolation
  4. Labels module tests verify CRUD, nested label tree operations (create child, move, delete with children), and tenant scoping
**Plans:** 5/5 plans complete
Plans:
- [ ] 67-01-PLAN.md -- Extend test helpers: createTestLabel factory + user_labels cleanup
- [ ] 67-02-PLAN.md -- Health service tests (BTEST-08): DB probe, Redis probe, Mistral disabled, BullMQ optional
- [ ] 67-03-PLAN.md -- Users service tests (BTEST-07): profile CRUD, preferences upsert, account deletion
- [ ] 67-04-PLAN.md -- Tenants service tests (BTEST-06): CRUD, soft/hard delete, event emission, isolation
- [ ] 67-05-PLAN.md -- Labels service tests (BTEST-05): CRUD, nested cascade delete, circular guard, isolation

### Phase 68: Backend Tests - Complex Modules
**Goal**: Calendar, contacts, providers, and subscription modules have comprehensive test coverage proving correct behavior for security-sensitive and business-critical flows
**Depends on**: Phase 66
**Requirements**: BTEST-01, BTEST-02, BTEST-03, BTEST-04
**Success Criteria** (what must be TRUE):
  1. Calendar module tests cover sync lifecycle, webhook processing, conflict resolution logic, and ICS parsing edge cases (recurring events, timezone handling)
  2. Contacts module tests cover sync flow, CRM relationship scoring calculation, cache invalidation, and webhook processing
  3. Providers module tests cover OAuth token acquisition, refresh, and revocation flows; IMAP config validation; and token lifecycle (expiry, rotation)
  4. Subscription module tests cover billing state transitions, quota calculation, usage tracking increments, and QuotaGuard rejection when limits are exceeded
**Plans:** 4/5 plans executed
Plans:
- [ ] 68-00-PLAN.md -- Extend test helpers: 4 new factories + 9 new cleanup tables
- [ ] 68-01-PLAN.md -- Calendar module tests (BTEST-01): ICS parsing, conflict detection, sync, webhook
- [ ] 68-02-PLAN.md -- Contacts module tests (BTEST-02): sync flow, CRM scoring, Redis cache, webhook
- [ ] 68-03-PLAN.md -- Providers module tests (BTEST-03): OAuth token lifecycle, IMAP validation, provider config
- [ ] 68-04-PLAN.md -- Subscription module tests (BTEST-04): billing transitions, quota guard, usage tracking, lifecycle

### Phase 69: Backend Integration Tests
**Goal**: Integration tests prove cross-cutting concerns work correctly with real database -- tenant isolation prevents data leaks, auth guard pipeline rejects unauthorized access, and API contracts match expected response shapes
**Depends on**: Phase 67, Phase 68
**Requirements**: BINT-01, BINT-02, BINT-03
**Success Criteria** (what must be TRUE):
  1. Cross-tenant isolation test creates two tenants with distinct data, then proves queries scoped to tenant A return zero rows from tenant B (and vice versa) across all tenant-scoped models
  2. Auth guard chain test validates the full BetterAuth -> Tenant -> Roles pipeline: unauthenticated request gets 401, wrong-tenant request gets 403, insufficient-role request gets 403, valid request succeeds
  3. Contract tests exist for calendar, labels, providers, subscription, organizations, and admin endpoints -- each validates response envelope shape, required fields, and error format
**Plans**: TBD

### Phase 70: Frontend Unit Tests
**Goal**: Frontend data layer and security-critical UI components have test coverage proving correct state management, data fetching, and user interaction behavior
**Depends on**: Phase 66
**Requirements**: FTEST-01, FTEST-02, FTEST-03
**Success Criteria** (what must be TRUE):
  1. All 14 Zustand store files have tests verifying state transitions, action side effects, and store isolation (no cross-store leakage between tests)
  2. Critical TanStack Query hooks (emails, folders, contacts, organizations) have tests verifying correct query key construction, cache behavior, and error/loading state handling
  3. Security settings components (MFA toggle, passkey management, session list, password change) have tests verifying user interactions trigger correct API calls and display correct feedback
**Plans**: TBD

### Phase 71: Frontend E2E Tests
**Goal**: All v5.0 features have end-to-end Playwright tests proving complete user workflows against a real running backend
**Depends on**: Phase 66, Phase 69
**Requirements**: FE2E-01, FE2E-02, FE2E-03, FE2E-04
**Success Criteria** (what must be TRUE):
  1. Organization E2E test completes the full flow: create org, invite member by email, accept invitation (as invited user), switch between organizations -- all against real backend
  2. Admin panel E2E test completes: navigate to admin, search users, ban a user (verify they cannot log in), unban, impersonate a user, revoke a session
  3. Onboarding wizard E2E test completes all steps: set display name, create/join workspace, connect email provider, configure MFA, upload avatar -- wizard marks complete and redirects to dashboard
  4. Security settings E2E test completes: change password, enable TOTP (scan QR, enter code), disable TOTP, register passkey (via virtual authenticator), view and revoke active sessions
**Plans**: TBD

### Phase 72: MUI Audit & Polish
**Goal**: Zero non-MUI patterns exist in the codebase, all v5.0 pages pass accessibility audit, and visual regression baselines prevent future drift
**Depends on**: Phase 71
**Requirements**: MUI-01, MUI-02, MUI-03, MUI-04
**Success Criteria** (what must be TRUE):
  1. An automated scanner (ESLint rule or CI script) detects Tailwind utility classes, hardcoded color values, and raw CSS-in-JS in .tsx/.ts files -- and it runs in CI
  2. Running the scanner produces zero violations across the entire frontend codebase
  3. axe-core accessibility audit passes on all v5.0 pages (organizations, admin panel, onboarding wizard, security settings) with zero critical or serious violations
  4. Playwright visual regression baselines exist for all v5.0 pages and can detect unintended visual changes in CI
**Plans**: TBD

## Progress

**Execution Order:**
Phases 67, 68, and 70 can run in parallel after Phase 66 completes.
Phase 69 depends on 67 + 68. Phase 71 depends on 66 + 69.
Phase 72 depends on 71 (needs pages working to screenshot).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 66. Test Infrastructure | 4/4 | Complete   | 2026-03-10 | - |
| 67. Backend Tests - Simple Modules | 5/5 | Complete    | 2026-03-11 | - |
| 68. Backend Tests - Complex Modules | 4/5 | In Progress|  | - |
| 69. Backend Integration Tests | v5.1 | 0/? | Not started | - |
| 70. Frontend Unit Tests | v5.1 | 0/? | Not started | - |
| 71. Frontend E2E Tests | v5.1 | 0/? | Not started | - |
| 72. MUI Audit & Polish | v5.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-02-09*
*v5.0 completed: 2026-03-10 -- 15 phases, 34 plans, 51/51 requirements*
*v5.1 roadmap added: 2026-03-10 -- 7 phases, 27 requirements*
