# Phase 69: Backend Integration Tests - Research

**Researched:** 2026-03-11
**Domain:** NestJS integration testing — tenant isolation, auth guard pipeline, OpenAPI contract validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth guard test mechanism (BINT-02)**
- Use full NestJS bootstrap + supertest — `Test.createTestingModule()` with the real guard chain wired up
- This breaks the Phase 67/68 direct-instantiation pattern intentionally: guards require real HTTP request lifecycle
- Use a real controller: reuse an existing controller (e.g., HealthController or similar minimal one)
- Real DB session resolution: `createTestSession()` inserts a real `better_auth` session row; BetterAuthGuard does a real DB lookup — no mock drift
- Spec file location: `backend/test/integration/auth-guard-chain.spec.ts`
- Scenarios: unauthenticated → 401, wrong-tenant → 403, insufficient-role → 403, valid request → 200

**Tenant isolation scope (BINT-01)**
- Representative per-domain sample — 1-2 models per domain (~8-10 models total), not all 42
  - Domains: email, calendar, contacts, labels, providers, subscription
- Direct Prisma queries with TenantContext — use `getTestPrismaClient()` + tenant-scoping context
- Both data outcome + middleware assertion
- Reuse shared factory helpers from `test/helpers/factories.ts`

**Contract test approach (BINT-03)**
- Same static OpenAPI spec pattern as existing contract tests — load `openapi-spec.json`, skip gracefully if missing
- One spec file per endpoint group — 6 files total:
  - `calendar.contract.spec.ts`, `labels.contract.spec.ts`, `providers.contract.spec.ts`
  - `subscription.contract.spec.ts`, `orgs.contract.spec.ts`, `admin.contract.spec.ts`
- Depth per endpoint: success shape + error envelope format

**Plan organization**
- 3 plans, 1 per requirement:
  - `69-01-PLAN.md` — Cross-tenant isolation tests (BINT-01)
  - `69-02-PLAN.md` — Auth guard chain test (BINT-02)
  - `69-03-PLAN.md` — Contract tests for all 6 endpoint groups (BINT-03)

### Claude's Discretion
- Which specific Prisma models to select as representatives within each domain
- Exact NestJS module imports needed for the test app bootstrap (minimal module set)
- Which controller to reuse for the auth guard test scenarios
- Order of contract test assertions within each spec file
- Whether to assert middleware by checking `prisma._middlewares` or by the data outcome alone

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BINT-01 | Cross-tenant isolation test proves tenant scoping prevents data leaks between tenants | TenantScopingExtension + CorrelationContext.run() pattern documented below; representative models identified |
| BINT-02 | Auth guard chain test validates BetterAuth -> Tenant -> Roles pipeline end-to-end | Guard chain architecture documented; HealthController confirmed as bypass-free test target; session factory exists |
| BINT-03 | Contract tests for calendar, labels, providers, subscription, orgs, and admin endpoints | All 6 endpoint groups identified; orgs/admin confirmed as better-auth plugin routes at `/api/auth/organization/*` and `/api/auth/admin/*`; contract-helpers.ts ready |
</phase_requirements>

---

## Summary

Phase 69 writes three categories of backend integration tests against a real PostgreSQL database. No new feature code is produced. All required infrastructure (factories, helpers, test client, cleanup utilities) was built in Phases 66-68 and is directly reusable.

The codebase has a clear separation between the plain `PrismaClient` returned by `getTestPrismaClient()` (no extensions, bypasses tenant scoping) and the `PrismaService` (with `createTenantScopingExtension()` applied in `onModuleInit`). Tenant isolation tests must apply the extension manually or drive queries through a real `PrismaService` instance wired inside a `Test.createTestingModule()`. The tenant-scoping extension reads its tenantId from `CorrelationContext.getContext()?.tenantId` via AsyncLocalStorage — so tests must use `CorrelationContext.run({ tenantId }, fn)` to provide context.

Five existing contract spec files and three existing integration specs establish the exact patterns to replicate. The "orgs" and "admin" contract groups target better-auth plugin routes (`/api/auth/organization/*`, `/api/auth/admin/*`) exposed through `BetterAuthController`, not NestJS module controllers.

**Primary recommendation:** Follow existing patterns exactly — no new patterns or abstractions needed for this phase. The research exposes the one non-obvious wiring detail (CorrelationContext for isolation tests) and the mapping from CONTEXT.md "orgs/admin" to actual better-auth routes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/testing` | project version | `Test.createTestingModule()` bootstrap | Used in all existing integration specs |
| `supertest` | project version | HTTP request simulation | Used in csrf-token-endpoint.spec.ts |
| `@prisma/client` | project version | Real DB queries | All Phase 67/68 tests use real DB |
| Jest | project version | Test runner | Configured in `backend/jest.config.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cookie-parser` | project version | Cookie middleware for NestJS test app | Required for BetterAuth session cookie parsing |
| `@nestjs/common` | project version | `INestApplication`, `ValidationPipe` | App setup in integration tests |

### Installation
No new packages needed. All dependencies exist.

---

## Architecture Patterns

### Existing Test File Locations
```
backend/
├── test/
│   ├── helpers/
│   │   ├── factories.ts          # createTestTenant, createTestUser, createTestSession, etc.
│   │   ├── cleanup.ts            # cleanupTestData() — TRUNCATE CASCADE
│   │   └── prisma-test-client.ts # getTestPrismaClient() — plain PrismaClient, no extensions
│   ├── integration/
│   │   ├── csrf-token-endpoint.spec.ts        # Pattern: Test.createTestingModule + supertest
│   │   ├── realtime-redis-adapter.spec.ts     # Pattern: skip-gracefully on unavailable resource
│   │   ├── auto-connect-social.spec.ts        # Pattern: direct service instantiation
│   │   └── social-login-provisioning.spec.ts
│   └── contract/
│       ├── contract-helpers.ts                 # loadSpec, expectPathExists, getResponseSchema, expectResponseHasFields
│       ├── contacts-list.contract.spec.ts      # Reference pattern for new contract specs
│       ├── emails-list.contract.spec.ts
│       ├── ai-chat.contract.spec.ts
│       ├── auth-login.contract.spec.ts
│       └── briefing.contract.spec.ts
├── src/
│   ├── prisma/
│   │   ├── prisma.service.ts                   # Applies createTenantScopingExtension() in onModuleInit
│   │   ├── prisma-client.factory.ts            # createPrismaClient() — NO extensions
│   │   └── tenant-scoping/
│   │       ├── tenant-context.ts               # withoutTenantScopingAsync, getTenantIdFromContext
│   │       ├── tenant-scoped-models.ts         # TENANT_SCOPED_MODELS (42 models), COMPOSITE_PK_MODELS
│   │       └── tenant-scoping.extension.ts     # createTenantScopingExtension, TenantContextRequiredError
│   └── common/
│       ├── auth/
│       │   ├── better-auth.guard.ts            # BetterAuthGuard — reads session from DB via auth.api.getSession
│       │   ├── tenant.guard.ts                 # TenantGuard — validates tenantId, resolves tenant row
│       │   ├── roles.guard.ts                  # RolesGuard — checks request.user.role
│       │   └── better-auth.controller.ts       # Handles /api/auth/* including /organization/*, /admin/*
│       └── services/
│           └── correlation-context.service.ts  # CorrelationContext.run({ tenantId }, fn) — sets ALS context
```

### Pattern 1: Tenant Isolation Test (BINT-01)

**What:** Create two tenants with data, then prove queries scoped to tenant A return zero rows from tenant B.

**The critical wiring:** `getTestPrismaClient()` returns a plain client with NO tenant-scoping extension. The extension must be applied explicitly. The extension reads tenantId from `CorrelationContext.getContext()?.tenantId` via AsyncLocalStorage.

**Two valid approaches for BINT-01:**

Approach A — Apply extension manually to test client:
```typescript
// Source: backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts
// Source: backend/src/common/services/correlation-context.service.ts
import { getTestPrismaClient } from '../../test/helpers/prisma-test-client';
import { createTenantScopingExtension } from '../../src/prisma/tenant-scoping/tenant-scoping.extension';
import { CorrelationContext } from '../../src/common/services/correlation-context.service';

const baseClient = getTestPrismaClient();
const scopedClient = baseClient.$extends(createTenantScopingExtension()) as any;

// Query as tenant A:
const rowsSeenByA = await CorrelationContext.run({ tenantId: tenantA.id }, () =>
  scopedClient.userLabel.findMany()
);
// Rows from tenant B are never returned because extension injects WHERE tenantId=tenantA.id
```

Approach B — Bypass to insert, use context to query:
```typescript
// Insert data for both tenants without scoping (like factories.ts does)
// Then query with scoping context to prove isolation
await withoutTenantScopingAsync(() =>
  prisma.userLabel.create({ data: { tenantId: tenantA.id, ... } })
);

const results = await CorrelationContext.run({ tenantId: tenantA.id }, () =>
  scopedClient.userLabel.findMany()
);
expect(results.every(r => r.tenantId === tenantA.id)).toBe(true);
```

**Middleware registration assertion:** Since `PrismaService` uses `Object.assign(this, client)` to apply the extended client, checking `prisma._middlewares` won't work. The data-outcome assertion alone is the recommended approach — if zero cross-tenant rows are returned, the middleware is functioning.

**Representative models by domain (Claude's discretion):**
- email: `User` (simple, indexed FK) + `Subscription` (unique-per-tenant constraint)
- calendar: `CalendarEvent` (composite PK model)
- contacts: `Contact` (composite PK model)
- labels: `UserLabel` (factory already exists: `createTestLabel`)
- providers: `ProviderConfig` (factory already exists: `createTestProviderAccount`)
- subscription: `Subscription` (factory already exists: `createTestSubscription`)

Total: ~6-8 models, well within the 8-10 target.

### Pattern 2: Auth Guard Chain Test (BINT-02)

**What:** Bootstrap a real NestJS app with the full guard pipeline, send HTTP requests via supertest, assert correct HTTP status codes.

**Controller to reuse:** `HealthController` is NOT suitable — it has `@Public()` which bypasses `BetterAuthGuard`. Use a controller that requires auth. `TenantsController` is a better choice — it uses `@UseGuards(TenantGuard, RolesGuard)` and has `@Roles('super-admin')` on GET, making it suitable for testing the full pipeline including role rejection.

**Alternative:** `LabelsController` uses `@UseGuards(TenantGuard, RolesGuard, FeatureFlagGuard)`. Adding `FeatureFlagGuard` may complicate the minimal bootstrap. `TenantsController` is cleaner.

**NestJS module bootstrap for BINT-02:**
```typescript
// Source: backend/test/integration/csrf-token-endpoint.spec.ts (reference pattern)
// Mock better-auth ESM module (required — same pattern used throughout codebase)
jest.mock('../../src/common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

// The guard chain requires:
// - BetterAuthGuard (APP_GUARD, needs BETTER_AUTH injection + Reflector)
// - TenantGuard (needs PrismaService)
// - RolesGuard (needs Reflector)
// Minimal module set:
const moduleFixture = await Test.createTestingModule({
  imports: [PrismaModule],  // provides PrismaService
  controllers: [TenantsController],
  providers: [
    TenantService,
    { provide: BETTER_AUTH, useValue: mockBetterAuth },
    BetterAuthGuard,
    TenantGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: BetterAuthGuard },
  ],
}).compile();
```

**Session creation for valid auth scenario:**
```typescript
// Source: backend/test/helpers/factories.ts — createTestSession()
// Creates a real session row; BetterAuthGuard calls auth.api.getSession
// which does a real DB lookup via withoutTenantScopingAsync
const tenant = await createTestTenant();
const user = await createTestUser(tenant.id, { role: 'super-admin' });
const session = await createTestSession(user.id, { tenantId: tenant.id });

// Mock auth.api.getSession to return this session's user (or use real better-auth)
```

**Scenarios:**
1. No session cookie → BetterAuthGuard throws 401
2. Valid session, X-Tenant-Id header for wrong tenant + user is not super-admin → TenantGuard throws 403
3. Valid session, valid tenant, insufficient role → RolesGuard throws 403
4. Valid session, valid tenant, super-admin role → 200

### Pattern 3: Contract Tests (BINT-03)

**What:** Load static `openapi-spec.json`, assert paths exist and response schemas have required fields.

**Exact pattern from `contacts-list.contract.spec.ts`:**
```typescript
// Source: backend/test/contract/contacts-list.contract.spec.ts
import { loadSpec, expectPathExists, getResponseSchema, OpenApiSpec } from './contract-helpers';

describe('Calendar Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- calendar contract tests skipped');
    }
  });

  it('GET /api/v1/calendar/events path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/calendar/events', 'get');
  });

  it('calendar event response has required fields', () => {
    if (!spec) return;
    const schema = getResponseSchema(spec, '/api/v1/calendar/events', 'get', '200');
    if (!schema) return;
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('events');
      expect(schema.properties).toHaveProperty('total');
    }
  });
});
```

**Orgs and Admin endpoints:** These are better-auth plugin routes, NOT NestJS module controllers. They are exposed via `BetterAuthController` at `/api/auth/*`. In the OpenAPI spec (when generated), they appear under `/api/auth/organization/*` and `/api/auth/admin/*`. Contract tests should check these paths.

**Frontend field references for each group:**

| Group | Frontend Source | Key Fields to Assert |
|-------|----------------|---------------------|
| calendar | `frontend/lib/api/calendar.ts` | events array, CalendarEvent: id, tenantId, title, startTime, endTime |
| labels | `frontend/lib/api/labels.ts` | labels array, Label: id, name, slug, color, parentId |
| providers | `frontend/lib/api/providers.ts` | ProviderConfig: id, providerType, email, isActive, supportsCalendar |
| subscription | `frontend/lib/api/billing.ts` | Subscription: id, plan, status, monthlyEmailLimit, usage |
| orgs | `frontend/hooks/queries/use-organizations.ts` | org list: id, name, slug |
| admin | `frontend/hooks/queries/use-admin.ts` | admin user list: users array, total |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test tenant/user creation | Custom INSERT statements | `createTestTenant()`, `createTestUser()` in `test/helpers/factories.ts` | Factories handle uid uniqueness, defaults, FK ordering |
| Test cleanup | Manual DELETE statements | `cleanupTestData()` in `test/helpers/cleanup.ts` — but use targeted cleanup in parallel runs | Full TRUNCATE causes FK violations with parallel Jest workers |
| Prisma test connection | New PrismaClient per test | `getTestPrismaClient()` — singleton via globalThis | Connection pool exhaustion with 50+ test files |
| OpenAPI spec loading | Custom fs.readFile | `loadSpec()` from `test/contract/contract-helpers.ts` | Handles multiple candidate paths, graceful null on missing |
| Response schema assertions | Custom property checks | `expectResponseHasFields()` from `test/contract/contract-helpers.ts` | Handles `$ref` resolution and `allOf` merging |
| Tenant context in tests | Mocking CorrelationContext | `CorrelationContext.run({ tenantId }, fn)` — real AsyncLocalStorage | Mock drift; real ALS is the production path |

**Key insight:** Phase 66-68 built exactly the infrastructure Phase 69 needs. Zero new helpers required.

---

## Common Pitfalls

### Pitfall 1: Cleanup TRUNCATE in Parallel Jest Workers
**What goes wrong:** `cleanupTestData()` (full TRUNCATE CASCADE) in `afterAll` causes FK violations when one worker truncates `tenants` while another is mid-test.
**Why it happens:** Jest runs spec files in parallel worker processes.
**How to avoid:** Use targeted cleanup — delete only the specific rows created by the current spec, keyed by tenantId. Phase 68 decision: "Omit cleanupTestData() TRUNCATE CASCADE from spec afterAll."
**Warning signs:** Intermittent FK violation errors only seen during parallel runs.

### Pitfall 2: getTestPrismaClient() Has No Tenant Extension
**What goes wrong:** BINT-01 test writes with factories (which use the plain client with `withoutTenantScopingAsync`), then reads with the same plain client and gets ALL rows, not just tenant-scoped rows.
**Why it happens:** `createPrismaClient()` in `prisma-client.factory.ts` does NOT apply `createTenantScopingExtension()`. The extension is only applied by `PrismaService.onModuleInit()`.
**How to avoid:** For BINT-01, explicitly call `baseClient.$extends(createTenantScopingExtension())` on the test client, then use `CorrelationContext.run({ tenantId }, fn)` for scoped queries.
**Warning signs:** Isolation test passes even when tenant data is NOT isolated.

### Pitfall 3: HealthController is @Public() — Wrong Choice for BINT-02
**What goes wrong:** Using `HealthController` as the test target means BetterAuthGuard always returns `true` (public route), so the 401 scenario never fires.
**Why it happens:** `@Public()` decorator sets `IS_PUBLIC_KEY`, and `BetterAuthGuard.canActivate()` checks for it and returns true early.
**How to avoid:** Use `TenantsController` or `LabelsController` — both require `TenantGuard` + `RolesGuard` and have no `@Public()` decorator.
**Warning signs:** "unauthenticated → 401" test always returns 200.

### Pitfall 4: BetterAuth ESM Import Requires Mock
**What goes wrong:** `import { fromNodeHeaders } from 'better-auth/node'` (used by BetterAuthGuard) throws "Cannot import ESM in Jest" during bootstrap.
**Why it happens:** `better-auth/node` is ESM-only; Jest is CJS by default.
**How to avoid:** Add `jest.mock('../../src/common/auth/better-auth.module', ...)` before imports. Also mock `better-auth/node` via `moduleNameMapper` in jest.config.js (already configured: `'^better-auth/node$': '<rootDir>/test/mocks/better-auth-node.mock.ts'`).
**Warning signs:** SyntaxError about ES modules during test bootstrap.

### Pitfall 5: Contract Tests Fail If openapi-spec.json Not Generated
**What goes wrong:** All contract assertions are skipped, tests appear green, but no contracts are actually checked.
**Why it happens:** `loadSpec()` returns `null` and every `it()` block returns early with `if (!spec) return`.
**How to avoid:** Generate the spec before running contract tests: `cd backend && npx ts-node scripts/generate-openapi.ts`. Include this in the plan's prerequisites.
**Warning signs:** All contract tests pass in under 1ms each.

### Pitfall 6: CorrelationContext.run() Must Wrap Both Write and Read for Isolation Tests
**What goes wrong:** Using `withoutTenantScopingAsync` for writes (correct) but then calling the scoped client WITHOUT `CorrelationContext.run()` — the ALS store is empty, `getTenantIdFromContext()` returns undefined, extension throws `TenantContextRequiredError`.
**Why it happens:** The extension is in enforce mode (`AUDIT_MODE = false`).
**How to avoid:** Reads on the scoped client must always be wrapped in `CorrelationContext.run({ tenantId }, fn)`.

---

## Code Examples

### Creating Scoped Prisma Client for Isolation Tests
```typescript
// Source: backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts
// Source: backend/test/helpers/prisma-test-client.ts
import { getTestPrismaClient } from '../helpers/prisma-test-client';
import { createTenantScopingExtension } from '../../src/prisma/tenant-scoping/tenant-scoping.extension';
import { CorrelationContext } from '../../src/common/services/correlation-context.service';
import { withoutTenantScopingAsync } from '../../src/prisma/tenant-scoping/tenant-context';

const baseClient = getTestPrismaClient();
// Apply the same extension PrismaService uses in production
const scopedClient = baseClient.$extends(createTenantScopingExtension()) as any;

// Insert data without scoping (factory pattern)
await withoutTenantScopingAsync(() =>
  baseClient.userLabel.create({ data: { tenantId: tenantA.id, name: 'Label A', ... } })
);

// Query with tenant A's context
const resultsAsA = await CorrelationContext.run({ tenantId: tenantA.id }, () =>
  scopedClient.userLabel.findMany()
);
// resultsAsA contains only tenant A's labels — tenant B's data is filtered out
```

### Auth Guard Chain Bootstrap
```typescript
// Source: backend/test/integration/csrf-token-endpoint.spec.ts (bootstrap reference)
// Source: backend/src/common/auth/better-auth.guard.ts
process.env.BETTER_AUTH_SECRET = 'test-secret';

jest.mock('../../src/common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { BETTER_AUTH } from '../../src/common/auth/better-auth.module';
import { BetterAuthGuard } from '../../src/common/auth/better-auth.guard';
import { TenantGuard } from '../../src/common/auth/tenant.guard';
import { RolesGuard } from '../../src/common/auth/roles.guard';
import { APP_GUARD } from '@nestjs/core';
const request = require('supertest');

let app: INestApplication;
let mockAuth: { api: { getSession: jest.Mock } };

beforeAll(async () => {
  mockAuth = { api: { getSession: jest.fn() } };

  const moduleFixture = await Test.createTestingModule({
    controllers: [TenantsController],
    providers: [
      TenantService,
      PrismaService,
      { provide: BETTER_AUTH, useValue: mockAuth },
      { provide: APP_GUARD, useClass: BetterAuthGuard },
      TenantGuard,
      RolesGuard,
      Reflector,
    ],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
});

it('unauthenticated request gets 401', async () => {
  mockAuth.api.getSession.mockResolvedValue(null);
  await request(app.getHttpServer()).get('/api/v1/tenants').expect(401);
});
```

### Contract Test Pattern (Graceful Skip)
```typescript
// Source: backend/test/contract/contacts-list.contract.spec.ts
import { loadSpec, expectPathExists, expectResponseHasFields, OpenApiSpec } from './contract-helpers';

describe('Calendar Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) console.warn('OpenAPI spec unavailable -- calendar contract tests skipped');
  });

  it('GET /api/v1/calendar/events path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/calendar/events', 'get');
  });

  it('calendar event response has expected fields', () => {
    if (!spec) return;
    expectResponseHasFields(spec, '/api/v1/calendar/events', 'get', '200', ['events', 'total']);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT session validation | DB-backed sessions via BetterAuth | Phase 52 | BetterAuthGuard does real DB lookup; tests must provide real session rows OR mock `auth.api.getSession` |
| Mocked Prisma in tests | Real PostgreSQL (user requirement) | v5.1 | No mocking; all factories insert real rows |
| Audit mode for tenant scoping | Enforce mode (`AUDIT_MODE = false`) | Current | Unscoped queries throw `TenantContextRequiredError` — tests must provide context |

---

## Open Questions

1. **BINT-02: Does PrismaModule provide enough for TenantGuard in minimal bootstrap?**
   - What we know: `TenantGuard` depends on `PrismaService`. `PrismaModule` exports `PrismaService`. But `PrismaService.onModuleInit` calls `TenantKeyService.isEnabled` — `TenantKeyService` may not be in scope.
   - What's unclear: Whether `PrismaModule` exports `TenantKeyService` and whether it's needed for guard tests.
   - Recommendation: The planner should check `PrismaModule` imports/providers and include `TenantKeyService` if needed, or provide a mock.

2. **BINT-03: Orgs and admin routes in the generated OpenAPI spec**
   - What we know: Better-auth plugin routes are handled by `BetterAuthController` at `/api/auth/*`, not standard NestJS controllers. The OpenAPI spec generation may or may not include them depending on `scripts/generate-openapi.ts`.
   - What's unclear: Whether `openapi-spec.json` includes `/api/auth/organization/*` and `/api/auth/admin/*` paths.
   - Recommendation: The planner should note that if the spec doesn't include these paths, the orgs/admin contract tests should check `/api/auth/organization/list` and `/api/auth/admin/list-users` paths with the graceful-skip pattern. If absent from spec, the test still passes (skips) which is acceptable.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest) |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest test/integration/auth-guard-chain.spec.ts --no-coverage` |
| Full suite command | `cd backend && npx jest --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BINT-01 | Tenant A queries return zero rows from Tenant B data | integration | `cd backend && npx jest test/integration/tenant-isolation.spec.ts --no-coverage` | ❌ Wave 0 |
| BINT-02 | Guard pipeline returns 401/403/200 for auth scenarios | integration | `cd backend && npx jest test/integration/auth-guard-chain.spec.ts --no-coverage` | ❌ Wave 0 |
| BINT-03 | Contract specs for 6 endpoint groups pass | contract | `cd backend && npx jest test/contract/*.contract.spec.ts --no-coverage` | ❌ Wave 0 (6 new files) |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest <specific-spec-file> --no-coverage`
- **Per wave merge:** `cd backend && npx jest test/integration/ test/contract/ --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/test/integration/tenant-isolation.spec.ts` — covers BINT-01
- [ ] `backend/test/integration/auth-guard-chain.spec.ts` — covers BINT-02
- [ ] `backend/test/contract/calendar.contract.spec.ts` — covers BINT-03 (calendar)
- [ ] `backend/test/contract/labels.contract.spec.ts` — covers BINT-03 (labels)
- [ ] `backend/test/contract/providers.contract.spec.ts` — covers BINT-03 (providers)
- [ ] `backend/test/contract/subscription.contract.spec.ts` — covers BINT-03 (subscription)
- [ ] `backend/test/contract/orgs.contract.spec.ts` — covers BINT-03 (orgs)
- [ ] `backend/test/contract/admin.contract.spec.ts` — covers BINT-03 (admin)

---

## Sources

### Primary (HIGH confidence)
- Codebase direct reads — `backend/src/prisma/tenant-scoping/` (extension, context, models)
- Codebase direct reads — `backend/src/common/auth/` (BetterAuthGuard, TenantGuard, RolesGuard)
- Codebase direct reads — `backend/test/` (all helper and existing spec files)
- Codebase direct reads — `backend/src/prisma/prisma.service.ts` (extension application pattern)
- Codebase direct reads — `backend/src/common/services/correlation-context.service.ts`

### Secondary (MEDIUM confidence)
- `frontend/lib/api/` modules — used to identify expected contract fields per endpoint group
- `frontend/hooks/queries/use-admin.ts`, `use-organizations.ts` — confirm orgs/admin go through better-auth client, not NestJS REST controllers

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries and patterns verified in codebase
- Architecture: HIGH — extension application, guard chain, contract helpers all directly read from source
- Pitfalls: HIGH — derived from actual code mechanics (not guesses), corroborated by Phase 68 STATE.md decisions
- Tenant isolation wiring: HIGH — traced through `prisma.service.ts` → `tenant-scoping.extension.ts` → `correlation-context.service.ts`
- Orgs/admin endpoint mapping: MEDIUM — confirmed better-auth plugin usage but OpenAPI spec not generated to verify exact paths

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable NestJS/Jest patterns; short valid window for better-auth plugin route paths if spec is regenerated)
