# Phase 66: Test Infrastructure - Research

**Researched:** 2026-03-10
**Domain:** Test tooling, database/Redis test environment, factory helpers, coverage thresholds
**Confidence:** HIGH

## Summary

Phase 66 establishes the shared test infrastructure that all subsequent v5.1 phases depend on. The codebase already has a functional dual-runner setup (Jest 30 for `.spec.ts`, Vitest 4 for `.test.ts`), 61 backend spec files, 15 Playwright E2E specs, and basic Jest configs for both backend and frontend. However, there are critical gaps: no `.env.test` file, no test database isolation strategy, no shared factory helpers for creating real DB rows (tenant/user/session), no coverage thresholds configured, and the existing Playwright E2E fixtures use fully mocked API routes (violating INFRA-04's requirement for real backend).

The primary challenge is that the project uses Neon PostgreSQL (cloud-hosted) as its database. Running tests against real PostgreSQL requires either: (a) a local Docker PostgreSQL for test isolation, or (b) a dedicated Neon test database. Docker is the correct choice -- it provides deterministic cleanup, fast resets, no network latency, and zero risk of corrupting development data. Redis is already local (`localhost:6379`), so it only needs a dedicated test DB number.

**Primary recommendation:** Create a `docker-compose.test.yml` with PostgreSQL + Redis, a `.env.test` file pointing to local containers, test factory helpers using raw Prisma (no NestJS bootstrap), a `globalSetup`/`globalTeardown` Jest configuration for DB provisioning and cleanup, and coverage thresholds in both Jest configs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Test environment runs against real PostgreSQL and Redis (Docker Compose or existing instances) | docker-compose.test.yml with pg:16 + redis:7; .env.test with local connection strings; Jest globalSetup runs migrations |
| INFRA-02 | Shared test helpers provide tenant context, auth session, and user/tenant factories for real DB | `backend/test/helpers/factories.ts` with createTestTenant/createTestUser/createTestSession using raw Prisma inserts |
| INFRA-03 | Test database is seeded with baseline data and cleaned between test suites | Jest globalSetup seeds baseline; afterAll per suite truncates test-created rows; transaction rollback or TRUNCATE cascade |
| INFRA-04 | Frontend E2E tests run against real backend server (no mocked API routes) | Playwright config adds backend webServer; auth.setup.ts creates real session via API; remove catch-all route mocks |
| INFRA-05 | Jest coverage thresholds enforce minimum coverage (50% backend, 30% frontend) | `coverageThreshold.global` in both jest.config files |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| jest | 30.2.0 | Backend + frontend test runner (.spec.ts) | Installed, configured |
| vitest | 4.0.18 | AI pipeline test runner (.test.ts) | Installed, configured |
| @playwright/test | 1.58.2 | Frontend E2E | Installed, configured |
| @nestjs/testing | 11.1.13 | NestJS test module builder | Installed |
| supertest | 7.2.2 | HTTP assertion library | Installed |
| @testing-library/react | 16.3.2 | React component testing | Installed |
| @testing-library/jest-dom | 6.9.1 | DOM assertion matchers | Installed |
| ts-jest | 29.4.6 | TypeScript transform for Jest | Installed |

### New (must add)
| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| jest-mock-extended | ^4.0.0 | Type-safe `mockDeep<PrismaService>()` | Prisma official recommendation; replaces fragile manual mocks |
| dotenv-cli | ^8.0.0 | Load `.env.test` before Jest runs | Cleaner than manual `dotenv/config` in every setup file |

### Not Needed
| Instead of | Why Not |
|------------|---------|
| prismock / jest-prisma | User requirement: real database, not mocked Prisma |
| testcontainers-node | Overkill for a static docker-compose; adds startup complexity |
| @faker-js/faker | Factory helpers need deterministic data, not random; use fixed test values |

## Architecture Patterns

### Project Structure (new files)
```
backend/
  docker-compose.test.yml          # PostgreSQL 16 + Redis 7 for tests
  .env.test                        # Test-specific env vars
  test/
    setup.ts                       # (EXISTS) -- extend with DB connection
    global-setup.ts                # NEW: start DB, run migrations, seed baseline
    global-teardown.ts             # NEW: disconnect, optionally stop containers
    helpers/
      prisma-test-client.ts        # NEW: raw PrismaClient for test factories
      factories.ts                 # NEW: createTestTenant, createTestUser, createTestSession
      cleanup.ts                   # NEW: truncate tables between suites
      mock-redis.ts                # NEW: ioredis mock or real Redis test DB
    jest-e2e.json                  # NEW: e2e config if needed
frontend/
  e2e/
    fixtures.ts                    # MODIFY: remove API mocking, add real backend auth
    auth.setup.ts                  # MODIFY: authenticate against real backend
  playwright.config.ts             # MODIFY: add backend webServer
```

### Pattern 1: Test Database Lifecycle (Jest globalSetup/globalTeardown)

**What:** A single Prisma client connects to the test PostgreSQL, runs migrations, and seeds baseline data once before all test suites. Each suite cleans up after itself.

**When to use:** All backend Jest test runs.

```typescript
// backend/test/global-setup.ts
import { execSync } from 'child_process';
import 'dotenv/config'; // loads .env.test via dotenv-cli in npm script

export default async function globalSetup() {
  // Run Prisma migrations against test DB
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });

  // Seed baseline data (tenant, admin user)
  execSync('npx prisma db seed', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
}
```

### Pattern 2: Test Factories with Real DB Inserts

**What:** Typed factory functions that insert real rows and return typed objects. Each factory accepts optional overrides.

```typescript
// backend/test/helpers/factories.ts
import { PrismaClient, Tenant, User, Session } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';
import { getTestPrismaClient } from './prisma-test-client';

const prisma = getTestPrismaClient();

let counter = 0;
function uniqueId(prefix: string): string {
  return `${prefix}-test-${++counter}-${Date.now()}`;
}

export async function createTestTenant(overrides: Partial<Tenant> = {}): Promise<Tenant> {
  const slug = uniqueId('tenant');
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? `Test Tenant ${slug}`,
      slug,
      description: overrides.description ?? 'Test tenant',
      isActive: overrides.isActive ?? true,
      ...overrides,
    },
  });
}

export async function createTestUser(
  tenantId: string,
  overrides: Partial<User> = {},
): Promise<User> {
  const email = overrides.email ?? `${uniqueId('user')}@test.local`;
  return prisma.user.create({
    data: {
      tenantId,
      email,
      name: overrides.name ?? 'Test User',
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      role: overrides.role ?? 'member',
      isActive: true,
      emailVerified: true,
      ...overrides,
    },
  });
}

export async function createTestSession(
  userId: string,
  tenantId?: string,
  overrides: Partial<Session> = {},
): Promise<Session> {
  const token = overrides.token ?? randomBytes(32).toString('hex');
  return prisma.session.create({
    data: {
      userId,
      tenantId: tenantId ?? null,
      token,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: overrides.ipAddress ?? '127.0.0.1',
      userAgent: overrides.userAgent ?? 'jest-test-runner',
      ...overrides,
    },
  });
}
```

### Pattern 3: Suite-Level Database Cleanup

**What:** Each test suite truncates the rows it created. Use `TRUNCATE ... CASCADE` on test-specific tables or delete by known test IDs.

```typescript
// backend/test/helpers/cleanup.ts
import { getTestPrismaClient } from './prisma-test-client';

const prisma = getTestPrismaClient();

// Tables in deletion order (respects FK constraints)
const CLEANUP_TABLES = [
  'sessions', 'member', 'account', 'user_preferences',
  'users', 'tenants',
];

export async function cleanupTestData() {
  // Use raw SQL TRUNCATE for speed; CASCADE handles FKs
  for (const table of CLEANUP_TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}
```

### Pattern 4: Playwright E2E Against Real Backend

**What:** Playwright starts the real backend server, creates a real user/session via the API or direct DB insert, then runs E2E tests against live endpoints.

```typescript
// frontend/playwright.config.ts additions
webServer: [
  {
    command: 'cd ../backend && npx dotenv-cli -e .env.test -- npm run start:dev',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  startWebServer ? {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  } : undefined,
].filter(Boolean),
```

### Anti-Patterns to Avoid
- **Mocking Prisma for "real DB" tests:** The user explicitly requires real PostgreSQL. jest-mock-extended is for unit tests of services where you test business logic, NOT for integration/factory tests.
- **Sharing test DB with development:** Test runs TRUNCATE tables. A separate `pmsync_test` database (or Docker instance on a different port) is mandatory.
- **NestJS full app bootstrap per unit test:** Slow (2-5s per test file). Reserve `Test.createTestingModule()` for integration tests only. Unit tests mock dependencies directly.
- **Global Prisma client singleton in tests:** Creates connection pool exhaustion. Use a single client per test run via globalSetup, share via `globalThis`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed Prisma mocks | Manual `{ findMany: jest.fn() }` objects | `jest-mock-extended` `mockDeep<PrismaClient>()` | Type-safe, auto-complete, catches schema drift |
| Database migration in tests | Custom SQL scripts | `prisma migrate deploy` in globalSetup | Migrations are already defined; reuse them |
| Password hashing in factories | New hash function | Reuse `hashBetterAuthPassword` from seed.ts | Must match better-auth's exact format |
| Coverage enforcement | Custom CI scripts | Jest `coverageThreshold` config | Built-in, fails `npm test` locally |
| E2E auth | Custom cookie injection hacks | Real session via POST to `/api/v1/auth/sign-in/email` or direct DB insert | INFRA-04 requires real backend |

## Common Pitfalls

### Pitfall 1: Neon Cold Start Timeout in Tests
**What goes wrong:** Tests connect to Neon (production/dev DB) and hit 5-10s cold start delays, making test suites unreliable.
**Why it happens:** No `.env.test` exists; tests use the default `.env` which points to Neon.
**How to avoid:** Always use local Docker PostgreSQL for tests. `.env.test` must override `DATABASE_URL` to `postgresql://pmsync_test:pmsync_test@localhost:5433/pmsync_test`.
**Warning signs:** Flaky timeouts in CI, tests passing locally but failing in CI.

### Pitfall 2: Prisma 7 Adapter Requirement
**What goes wrong:** `new PrismaClient()` without an adapter fails in Prisma 7. The existing `createPrismaClient()` factory handles this.
**Why it happens:** Prisma 7 requires explicit `PrismaPg` adapter; no implicit `DATABASE_URL` parsing.
**How to avoid:** Test factory must use `createPrismaClient()` from `src/prisma/prisma-client.factory.ts` (or a test-specific variant).
**Warning signs:** `PrismaClientInitializationError: adapter is required`.

### Pitfall 3: Table Cleanup Order (FK Constraints)
**What goes wrong:** TRUNCATE fails with FK violation errors if tables are cleaned in wrong order.
**Why it happens:** Complex FK chains (Session -> User -> Tenant, Member -> User + Tenant, etc.).
**How to avoid:** Use `TRUNCATE ... CASCADE` which handles FK chains automatically. Or delete in leaf-first order.
**Warning signs:** `foreign key constraint violation` errors in afterAll hooks.

### Pitfall 4: better-auth ESM in Jest
**What goes wrong:** Importing better-auth modules crashes Jest with `ERR_REQUIRE_ESM`.
**Why it happens:** better-auth is ESM-only; Jest uses CJS by default.
**How to avoid:** The existing `moduleNameMapper` for `better-auth/node` must be extended for any new better-auth subpath imports. Keep the mock in `test/mocks/better-auth-node.mock.ts`.
**Warning signs:** `SyntaxError: Cannot use import statement outside a module` in test output.

### Pitfall 5: Test Port Conflicts
**What goes wrong:** Docker PostgreSQL on port 5432 conflicts with an existing local PostgreSQL or the Neon connection.
**Why it happens:** Default PostgreSQL port collision.
**How to avoid:** Use port `5433` for test PostgreSQL in docker-compose.test.yml. Redis test can use same host but different DB number (e.g., `REDIS_DB=1`).
**Warning signs:** `EADDRINUSE` or connection refused errors.

### Pitfall 6: Coverage Threshold Too High Too Soon
**What goes wrong:** Setting 50% backend coverage threshold immediately makes `npm test` fail because current coverage is near 0% on most modules.
**Why it happens:** Only 61 spec files exist; most modules are untested.
**How to avoid:** Configure thresholds but set them to current baseline initially (measure first, then set). The requirement says 50% backend / 30% frontend -- these should be the targets AFTER subsequent phases add tests, not on day one. Phase 66 should configure the mechanism and set initial thresholds at current levels, documenting the target.
**Warning signs:** `npm test` fails immediately after threshold config.

## Code Examples

### docker-compose.test.yml
```yaml
version: '3.8'
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pmsync_test
      POSTGRES_PASSWORD: pmsync_test
      POSTGRES_DB: pmsync_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data  # RAM disk for speed
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pmsync_test"]
      interval: 2s
      timeout: 5s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --save "" --appendonly no  # No persistence for speed
```

### .env.test
```bash
NODE_ENV=test
DATABASE_URL=postgresql://pmsync_test:pmsync_test@localhost:5433/pmsync_test
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=
REDIS_DB=0
BETTER_AUTH_SECRET=test-secret-for-jest-32-chars-min
FIELD_ENCRYPTION_ENABLED=false
API_PORT=3100
API_HOST=localhost
API_PUBLIC_URL=http://localhost:3100
```

### Jest Config Changes (backend)
```javascript
// Add to jest.config.js
module.exports = {
  // ... existing config ...
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  coverageThreshold: {
    global: {
      branches: 20,    // Initial baseline; target: 50%
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
};
```

### npm Script for Test with .env.test
```json
{
  "test": "dotenv-cli -e .env.test -- jest",
  "test:cov": "dotenv-cli -e .env.test -- jest --coverage",
  "test:e2e": "dotenv-cli -e .env.test -- jest --config ./test/jest-e2e.json"
}
```

### Shared Prisma Test Client
```typescript
// backend/test/helpers/prisma-test-client.ts
import { createPrismaClient } from '../../src/prisma/prisma-client.factory';
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

export function getTestPrismaClient(): PrismaClient {
  if (!client) {
    client = createPrismaClient();
  }
  return client;
}

export async function disconnectTestClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `jest-prisma` mock client | Real DB with `prisma migrate deploy` | Prisma 7 (2025) | Mock clients break on schema changes; real DB catches real bugs |
| `moduleNameMapper` for ESM | Still required for better-auth in Jest 30 | Ongoing | Jest 30 still doesn't natively handle ESM without transform |
| Manual test DB setup | Docker Compose + globalSetup | Standard practice | Deterministic, reproducible test environments |
| Coverage in CI only | `coverageThreshold` in Jest config | Jest 26+ | Fails locally, catches regressions before push |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 (backend .spec.ts) + Vitest 4.0.18 (backend .test.ts) + Playwright 1.58.2 (frontend E2E) |
| Config files | `backend/jest.config.js`, `backend/vitest.config.ts`, `frontend/jest.config.js`, `frontend/playwright.config.ts` |
| Quick run command | `cd backend && npm test -- --testPathPattern=test/helpers` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Real PG + Redis connection in tests | smoke | `cd backend && npx dotenv-cli -e .env.test -- jest --testPathPattern=test/smoke` | No - Wave 0 |
| INFRA-02 | Factory helpers create real DB rows | unit | `cd backend && npx dotenv-cli -e .env.test -- jest --testPathPattern=test/helpers` | No - Wave 0 |
| INFRA-03 | DB cleanup between suites | unit | `cd backend && npx dotenv-cli -e .env.test -- jest --testPathPattern=test/helpers/cleanup` | No - Wave 0 |
| INFRA-04 | Playwright E2E against real backend | e2e | `cd frontend && npx playwright test --project=chromium e2e/smoke.spec.ts` | No - Wave 0 |
| INFRA-05 | Coverage thresholds configured | config | `cd backend && npx dotenv-cli -e .env.test -- jest --coverage` (fails if below threshold) | No - config change |

### Sampling Rate
- **Per task commit:** `cd backend && npx dotenv-cli -e .env.test -- jest --testPathPattern=test/ --forceExit`
- **Per wave merge:** `cd backend && npx dotenv-cli -e .env.test -- jest --coverage --forceExit`
- **Phase gate:** All 5 requirements verified; coverage thresholds active

### Wave 0 Gaps
- [ ] `backend/docker-compose.test.yml` -- PostgreSQL 16 + Redis 7 containers
- [ ] `backend/.env.test` -- test environment variables
- [ ] `backend/test/global-setup.ts` -- DB migration + seed
- [ ] `backend/test/global-teardown.ts` -- DB disconnect
- [ ] `backend/test/helpers/prisma-test-client.ts` -- shared test Prisma client
- [ ] `backend/test/helpers/factories.ts` -- createTestTenant, createTestUser, createTestSession
- [ ] `backend/test/helpers/cleanup.ts` -- TRUNCATE between suites
- [ ] `backend/test/smoke.spec.ts` -- verifies INFRA-01 (PG + Redis connectivity)
- [ ] `frontend/e2e/smoke.spec.ts` -- verifies INFRA-04 (real backend E2E)
- [ ] `dotenv-cli` install: `cd backend && npm install -D dotenv-cli`
- [ ] `jest-mock-extended` install: `cd backend && npm install -D jest-mock-extended`

## Open Questions

1. **Docker Compose availability on Windows dev machine**
   - What we know: Project uses Windows 11 Pro. Docker Desktop is likely available but not confirmed.
   - What's unclear: Whether Docker is installed and running.
   - Recommendation: Plan should include a fallback for running tests against a manually started PostgreSQL (e.g., existing local PG). Docker is preferred but not strictly required if local PG exists on a separate port.

2. **Coverage threshold initial values**
   - What we know: Target is 50% backend / 30% frontend. Current coverage is likely very low (many modules untested).
   - What's unclear: Exact current coverage numbers.
   - Recommendation: First task should measure current coverage, then set thresholds at measured baseline (not target). Document that subsequent phases raise the bar.

3. **Playwright real backend authentication**
   - What we know: Current E2E uses mocked API routes and fake cookies. INFRA-04 requires real backend.
   - What's unclear: Whether to use Playwright to call the real auth endpoint (POST sign-in) or create a session directly in the test DB.
   - Recommendation: Direct DB session insertion is more reliable and faster. Create session in DB, inject cookie, skip the full auth flow for test setup.

## Sources

### Primary (HIGH confidence)
- Project codebase: `backend/jest.config.js`, `backend/vitest.config.ts`, `frontend/playwright.config.ts`, `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`
- Project research: `.planning/research/SUMMARY.md` (v5.1 research completed 2026-03-10)
- Project decisions: `.planning/STATE.md` (real DB requirement, dual runner preservation)

### Secondary (MEDIUM confidence)
- Prisma 7 adapter requirement: observed in `backend/src/prisma/prisma-client.factory.ts` (PrismaPg adapter mandatory)
- Jest 30 globalSetup/globalTeardown: standard Jest API, verified in installed version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed; only dotenv-cli and jest-mock-extended are new
- Architecture: HIGH - patterns derived from existing codebase (seed.ts, prisma-client.factory.ts, jest.config.js)
- Pitfalls: HIGH - ESM issue documented in existing mocks; Prisma 7 adapter seen in source; port conflicts are standard knowledge
- Validation: MEDIUM - smoke test patterns are straightforward but exact Playwright real-backend integration needs implementation-time verification

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable infrastructure; no fast-moving dependencies)
