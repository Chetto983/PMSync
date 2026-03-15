# Requirements: PMSync v5.1

**Defined:** 2026-03-10
**Core Value:** The best professional AI mail client -- fast, intelligent, and secure

## v5.1 Requirements

Requirements for test coverage, MUI audit, and production polish. Each maps to roadmap phases.

### Test Infrastructure

- [x] **INFRA-01**: Test environment runs against real PostgreSQL and Redis (Docker Compose or existing instances)
- [x] **INFRA-02**: Shared test helpers provide tenant context, auth session, and user/tenant factories for real DB
- [x] **INFRA-03**: Test database is seeded with baseline data and cleaned between test suites
- [x] **INFRA-04**: Frontend E2E tests run against real backend server (no mocked API routes)
- [x] **INFRA-05**: Jest coverage thresholds enforce minimum coverage (50% backend, 30% frontend)

### Backend Unit Tests

- [x] **BTEST-01**: Calendar module has tests for all services (sync, webhooks, conflict resolution, ICS parsing)
- [x] **BTEST-02**: Contacts module has tests for all services (sync, CRM scoring, cache, webhooks)
- [x] **BTEST-03**: Providers module has tests for OAuth flows, IMAP config, and token lifecycle
- [x] **BTEST-04**: Subscription module has tests for billing, quotas, usage tracking, and QuotaGuard
- [x] **BTEST-05**: Labels module has tests for CRUD and nested label operations
- [x] **BTEST-06**: Tenants module has tests for tenant CRUD with isolation verification
- [x] **BTEST-07**: Users module has tests for profile management and preferences
- [x] **BTEST-08**: Health module has tests for DB/Redis/queue connectivity probes

### Backend Integration Tests

- [x] **BINT-01**: Cross-tenant isolation test proves tenant scoping prevents data leaks between tenants
- [x] **BINT-02**: Auth guard chain test validates BetterAuth -> Tenant -> Roles pipeline end-to-end
- [x] **BINT-03**: Contract tests exist for calendar, labels, providers, subscription, orgs, and admin endpoints

### Frontend Unit Tests

- [x] **FTEST-01**: Zustand store tests cover all 14 store files (email-ui slices, compose, sidebar, kanban)
- [x] **FTEST-02**: TanStack Query hook tests cover critical data hooks (emails, folders, contacts, organizations)
- [x] **FTEST-03**: Settings component tests cover security-critical UI (MFA, passkeys, sessions, password)

### Frontend E2E Tests

- [x] **FE2E-01**: Organization flows tested end-to-end (create org, invite member, accept invitation, switch org)
- [x] **FE2E-02**: Admin panel tested end-to-end (user list, search, ban/unban, impersonation, session revocation)
- [x] **FE2E-03**: Onboarding wizard tested end-to-end (all steps: name, workspace, email provider, MFA, avatar)
- [x] **FE2E-04**: Security settings tested end-to-end (password change, TOTP setup/remove, session management)

### MUI Audit & Polish

- [ ] **MUI-01**: Automated scanner detects non-MUI patterns (Tailwind classes, hardcoded colors, raw CSS-in-JS)
- [ ] **MUI-02**: All scanner violations fixed -- zero non-MUI patterns in any .tsx/.ts file
- [ ] **MUI-03**: Accessibility audit (axe-core) passes on all v5.0 pages (orgs, admin, onboarding, security)
- [ ] **MUI-04**: Visual regression baselines exist for all v5.0 pages

## Future Requirements

### Advanced Testing

- **ATEST-01**: Mutation testing (Stryker) on security-critical paths (auth guards, encryption, tenant scoping)
- **ATEST-02**: BullMQ worker integration tests (calendar-sync, contacts-sync, email-sync workers)
- **ATEST-03**: Performance regression assertions (p95 response times in integration tests)
- **ATEST-04**: API schema validation against OpenAPI spec (runtime response vs Swagger drift)
- **ATEST-05**: k6 load testing for concurrent users and large mailbox scalability

## Out of Scope

| Feature | Reason |
|---------|--------|
| 100% code coverage target | Diminishing returns past 70%; incentivizes trivial assertions |
| Component snapshot tests | Brittle with MUI theme changes; visual regression via Playwright instead |
| Cypress migration | Playwright already configured with 13 specs and multi-browser setup |
| Full NestJS app bootstrap per unit test | Slow and fragile; real DB integration tests cover wiring |
| Mocked Prisma unit tests | User requirement: all tests must use real database |
| Testing third-party library internals | Test our code's interaction, not MUI/TanStack internals |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 66 | Complete |
| INFRA-02 | Phase 66 | Complete |
| INFRA-03 | Phase 66, Phase 73 (hardening) | Complete (race fix pending) |
| INFRA-04 | Phase 66 | Complete |
| INFRA-05 | Phase 66 | Complete |
| BTEST-01 | Phase 68 | Complete |
| BTEST-02 | Phase 68 | Complete |
| BTEST-03 | Phase 68 | Complete |
| BTEST-04 | Phase 68 | Complete |
| BTEST-05 | Phase 67 | Complete |
| BTEST-06 | Phase 67 | Complete |
| BTEST-07 | Phase 67 | Complete |
| BTEST-08 | Phase 67 | Complete |
| BINT-01 | Phase 69 | Complete |
| BINT-02 | Phase 69 | Complete |
| BINT-03 | Phase 69, Phase 73 (hardening), Phase 76 (CI gate) | Pending |
| FTEST-01 | Phase 70 | Complete |
| FTEST-02 | Phase 70 | Complete |
| FTEST-03 | Phase 70 | Complete |
| FE2E-01 | Phase 71, Phase 74 (runtime), Phase 75 (fix) | Complete |
| FE2E-02 | Phase 71, Phase 74 (runtime) | Complete (runtime pending) |
| FE2E-03 | Phase 71, Phase 74 (runtime) | Complete (runtime pending) |
| FE2E-04 | Phase 71, Phase 73 (Chromium skip), Phase 74 (runtime) | Complete (runtime pending) |
| MUI-01 | Phase 72 | Pending |
| MUI-02 | Phase 72 | Pending |
| MUI-03 | Phase 72 | Pending |
| MUI-04 | Phase 72 | Pending |

**Coverage:**
- v5.1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-13 after gap closure phases 75-76 added (27/27 mapped, 2 reset to Pending)*
