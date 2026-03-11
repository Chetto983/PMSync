# Phase 69: Backend Integration Tests - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Write integration tests proving cross-cutting backend concerns work correctly with a real database: tenant isolation prevents data leaks between tenants, the BetterAuth→TenantGuard→RolesGuard pipeline correctly rejects unauthorized requests, and API contracts for calendar, labels, providers, subscription, orgs, and admin endpoints match expected response shapes. This is a test-writing phase — no new feature code.

</domain>

<decisions>
## Implementation Decisions

### Auth guard test mechanism (BINT-02)
- Use **full NestJS bootstrap + supertest** — `Test.createTestingModule()` with the real guard chain wired up
- This breaks the Phase 67/68 direct-instantiation pattern intentionally: guards require real HTTP request lifecycle to test the sequential pipeline (BetterAuth → TenantGuard → RolesGuard)
- Use a **real controller**: reuse an existing controller (e.g., HealthController or similar minimal one) rather than a dummy fixture controller
- **Real DB session resolution**: `createTestSession()` from shared factories inserts a real `better_auth` session row; BetterAuthGuard does a real DB lookup — no mock drift
- Spec file location: `backend/test/integration/auth-guard-chain.spec.ts` (alongside csrf-token-endpoint.spec.ts, realtime-redis-adapter.spec.ts)
- Scenarios to cover: unauthenticated → 401, wrong-tenant → 403, insufficient-role → 403, valid request → 200

### Tenant isolation scope (BINT-01)
- **Representative per-domain sample** — 1-2 models per domain (~8-10 models total), not all 42
  - Domains: email, calendar, contacts, labels, providers, subscription
  - Rationale: TenantContext/Prisma middleware applies uniformly — proving the pattern once per domain is sufficient
- **Direct Prisma queries with TenantContext** — use `getTestPrismaClient()` + tenant-scoping context to prove tenant A can't see tenant B's rows; no HTTP layer needed
- **Both data outcome + middleware assertion**:
  - Data outcome: create data for two tenants, query as each, assert zero cross-tenant rows
  - Middleware assertion: verify the tenant-scoping middleware is registered on the Prisma client
- Reuse shared factory helpers (`createTestTenant()`, `createTestUser()`) from `test/helpers/factories.ts`

### Contract test approach (BINT-03)
- **Same static OpenAPI spec pattern** as existing contract tests — load `openapi-spec.json`, skip gracefully if missing
- **One spec file per endpoint group** — 6 files total:
  - `calendar.contract.spec.ts`
  - `labels.contract.spec.ts`
  - `providers.contract.spec.ts`
  - `subscription.contract.spec.ts`
  - `orgs.contract.spec.ts`
  - `admin.contract.spec.ts`
- **Depth per endpoint: success shape + error envelope format**
  - Validate 200 response has expected fields (matching what frontend API modules consume)
  - Validate 400/401/403 errors use the unified `ApiExceptionFilter` envelope shape
  - No exhaustive status code coverage — just the contract boundaries

### Plan organization
- **3 plans, 1 per requirement:**
  - `69-01-PLAN.md` — Cross-tenant isolation tests (BINT-01)
  - `69-02-PLAN.md` — Auth guard chain test (BINT-02)
  - `69-03-PLAN.md` — Contract tests for all 6 endpoint groups (BINT-03)

### Claude's Discretion
- Which specific Prisma models to select as representatives within each domain
- Exact NestJS module imports needed for the test app bootstrap (minimal module set)
- Which controller to reuse for the auth guard test scenarios
- Order of contract test assertions within each spec file
- Whether to assert middleware by checking `prisma._middlewares` or by the data outcome alone if the middleware internals aren't exposed

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/helpers/factories.ts`: `createTestTenant()`, `createTestUser()`, `createTestSession()`, `createTestLabel()` — reuse directly, no new factories needed for this phase
- `test/helpers/cleanup.ts`: `cleanupTestData()` — per-factory targeted cleanup pattern from Phase 68 applies; avoid full TRUNCATE in parallel runs
- `test/helpers/prisma-test-client.ts`: `getTestPrismaClient()` — real Prisma client for isolation tests
- `test/contract/contract-helpers.ts`: `loadSpec()`, `expectPathExists()`, `getResponseSchema()` — reuse for all 6 new contract specs
- Existing integration tests in `backend/test/integration/` (csrf-token-endpoint, realtime-redis-adapter, auto-connect-social) — follow their bootstrap/setup patterns

### Established Patterns
- `Test.createTestingModule()` + supertest: used in existing integration tests — valid pattern for auth guard test
- Static OpenAPI spec loading with graceful skip: used in 5 existing contract specs — replicate exactly
- Direct Prisma queries with `getTestPrismaClient()`: proven in Phase 67/68 — use for isolation tests
- `jest.clearAllMocks()` in `beforeEach`, factory cleanup in `afterAll`

### Integration Points
- Auth guards: `backend/src/common/auth/` — BetterAuthGuard, TenantGuard, RolesGuard
- Tenant scoping middleware: `backend/src/prisma/tenant-scoping/` — TenantContext, withTenantScoping
- Contract endpoints: controllers in `backend/src/modules/{calendar,labels,providers,subscription}/` and `backend/src/modules/organizations/`, `backend/src/modules/admin/`
- OpenAPI spec: generated at `backend/openapi-spec.json` via `scripts/generate-openapi.ts`
- Frontend API references: `frontend/lib/api/` — use these to know which fields each contract test should assert

</code_context>

<specifics>
## Specific Ideas

- Auth guard test reuses a real controller (e.g., HealthController) rather than a dummy fixture — avoids writing fixture code
- Tenant isolation proves both the data outcome (zero cross-tenant rows) AND that the middleware is registered on the Prisma client
- Contract tests reference `frontend/lib/api/` modules to know exactly which fields the frontend expects — same approach as existing contacts-list.contract.spec.ts

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 69-backend-integration-tests*
*Context gathered: 2026-03-11*
