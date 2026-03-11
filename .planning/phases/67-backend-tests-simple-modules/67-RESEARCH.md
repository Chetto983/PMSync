# Phase 67: Backend Tests - Simple Modules - Research

**Researched:** 2026-03-11
**Domain:** NestJS service testing with real PostgreSQL -- health, users, tenants, labels modules
**Confidence:** HIGH

## Summary

Phase 66 delivered a fully operational test infrastructure: globalSetup/globalTeardown run real DB migrations and seed, `test/helpers/` has `factories.ts`, `cleanup.ts`, and `prisma-test-client.ts` with a singleton PrismaClient, and `jest.config.js` is wired with 50% coverage thresholds. Phase 67's job is to write the actual test suites for four modules using that infrastructure.

The four modules split naturally into two test strategies. **Tenants and labels** are pure Prisma services -- `TenantService` and `LabelsService` take only `PrismaService` (plus `EventEmitter2` or `RealtimeEventsService`) as constructor dependencies. Tests can instantiate services directly with a real Prisma test client and no NestJS module bootstrap. **Users** has four injected services (`PrismaService`, `EmailEmbeddingQueueService`, `QueueService`, `StorageService`, `CacheService`) -- only Prisma operations are in scope per BTEST-07 (profile CRUD and preferences); the queue/storage dependencies need lightweight mocks to let the service compile. **Health** is the most complex: `HealthService` creates a Redis client at construction time via a module-level `createClient()` call from the `redis` package (not `ioredis`), and calls `this.redisClient.connect()` in the constructor. Testing degraded-Redis requires controlling that client, which means either mocking `redis.createClient` or wrapping the service to inject the client.

The clean test target for each module is its **service class directly** (not the controller). The controller tests would test guard chains (Phase 69 scope). Service tests verify business logic and DB state.

**Primary recommendation:** Write service-level tests. Instantiate each service with `getTestPrismaClient()` for real Prisma and `jest.fn()` or `mockDeep()` for non-Prisma dependencies. Use `createTestTenant()` / `createTestUser()` factories from Phase 66. Call `cleanupTestData()` in `afterAll`. Place test files as `src/modules/{module}/services/__tests__/{service}.spec.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BTEST-05 | Labels module has tests for CRUD and nested label operations | `LabelsService` has `create`, `findOne`, `findAllByTenant`, `update`, `delete` (soft), `archiveDescendants` (recursive). Key behaviors: slug uniqueness per tenant, circular reference guard, cascade soft-delete. Test with real `userLabel` rows via a `createTestLabel` factory. |
| BTEST-06 | Tenants module has tests for tenant CRUD with isolation verification | `TenantService` has `createTenant` (slug-unique guard), `updateTenant`, `deleteTenant` (soft), `hardDeleteTenant`. Isolation test: verify tenant A's labels/users don't appear when querying tenant B. `deleteTenant` emits `TenantDeletedEvent` via `EventEmitter2`. |
| BTEST-07 | Users module has tests for profile management and preferences | `UsersService.getUserProfile`, `updateUserProfile`, `getUserPreferences` (auto-create if missing), `updateUserPreferences` (upsert), `deleteUserAccount` (transaction). Tenant isolation: user A cannot read user B's profile (DB query is by userId, not tenantId -- isolation is controller-level; test that wrong userId returns null). |
| BTEST-08 | Health module has tests for DB/Redis/queue connectivity probes | `HealthService.getSystemHealth()` returns `{ status, services }`. DB probe uses `prisma.$queryRaw`. Redis probe uses `this.redisClient.ping()` from `redis` package. BullMQ probe is optional (`queueService` is `@Optional()`). Test healthy and degraded cases by mocking the clients. |
</phase_requirements>

## Standard Stack

### Core (already installed from Phase 66)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| jest | 30.2.0 | Test runner | Installed, configured |
| ts-jest | 29.4.6 | TypeScript transform | Installed |
| jest-mock-extended | ^4.0.0 | `mockDeep<PrismaService>()` | Installed (Phase 66) |
| @nestjs/testing | 11.1.13 | `Test.createTestingModule()` if needed | Installed |

### Not Needed for Phase 67
| Skipped | Why |
|---------|-----|
| `Test.createTestingModule()` per test file | Full NestJS bootstrap is slow and fragile; service-level tests skip module loading (confirmed working pattern in `module-bootstrap.spec.ts`) |
| `supertest` | Controller/HTTP testing is Phase 69 scope |
| Additional npm installs | Phase 66 already installed all needed test libraries |

## Architecture Patterns

### Recommended Test File Locations
```
backend/src/modules/
  health/services/__tests__/
    health.service.spec.ts         # BTEST-08
  users/services/__tests__/
    users.service.spec.ts          # BTEST-07
  tenants/services/__tests__/
    tenant.service.spec.ts         # BTEST-06
  labels/services/__tests__/
    labels.service.spec.ts         # BTEST-05
backend/test/helpers/
  factories.ts                     # EXTEND: add createTestLabel()
```

### Pattern 1: Direct Service Instantiation (preferred for simple dependencies)

**What:** Instantiate the service with real PrismaService and mocked non-Prisma dependencies. No NestJS module needed.

**When to use:** TenantService, LabelsService (few dependencies, all Prisma-centric).

```typescript
// tenant.service.spec.ts
import { TenantService } from '../tenant.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestTenant } from '../../../../../test/helpers/factories';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';

describe('TenantService', () => {
  let service: TenantService;
  let prisma: PrismaService;
  const mockEventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;

  beforeAll(() => {
    prisma = getTestPrismaClient() as unknown as PrismaService;
    service = new TenantService(prisma, mockEventEmitter);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // tests...
});
```

**Why this works:** `PrismaService` in the codebase extends `PrismaClient` -- the test Prisma client from `getTestPrismaClient()` is the same type. Cast with `as unknown as PrismaService` since `PrismaService` adds NestJS lifecycle hooks but tests don't invoke them.

### Pattern 2: Mocked Non-Prisma Dependencies (for UsersService, LabelsService)

**What:** Use `jest.fn()` stubs for services the test doesn't exercise (queues, storage, realtime).

**When to use:** UsersService (has `EmailEmbeddingQueueService`, `QueueService`, `StorageService`), LabelsService (has `EmailsService`, `RealtimeEventsService`).

```typescript
// users.service.spec.ts
import { UsersService } from '../users.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant, createTestUser } from '../../../../../test/helpers/factories';

const mockEmailEmbeddingQueue = { removeJobsForTenant: jest.fn() };
const mockQueueService = { removeJobsForTenant: jest.fn() };
const mockStorageService = {
  putObject: jest.fn().mockResolvedValue(undefined),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
};
const mockCacheService = { del: jest.fn().mockResolvedValue(undefined) };

describe('UsersService', () => {
  let service: UsersService;

  beforeAll(() => {
    const prisma = getTestPrismaClient() as any;
    service = new UsersService(
      prisma,
      mockEmailEmbeddingQueue as any,
      mockQueueService as any,
      mockStorageService as any,
      mockCacheService as any,
    );
  });

  afterAll(async () => {
    await cleanupTestData();
  });
  // tests...
});
```

### Pattern 3: HealthService Redis Mocking

**What:** `HealthService` creates a Redis client at module load time via `createClient(getRedisNodeConnectionOptions(...))`. The constructor immediately calls `this.redisClient.connect()`. Testing degraded-Redis requires mocking `createClient` before the class is imported.

**When to use:** All `health.service.spec.ts` tests.

```typescript
// health.service.spec.ts
// Must mock BEFORE importing HealthService
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../../config/configuration', () => ({
  getConfiguration: jest.fn(() => ({ redis: { host: 'localhost', port: 6380 } })),
  getRedisNodeConnectionOptions: jest.fn(() => ({})),
}));

import { HealthService } from '../health.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';

describe('HealthService', () => {
  let service: HealthService;

  beforeAll(() => {
    const prisma = getTestPrismaClient() as any;
    const mockConfigService = { get: jest.fn() };
    service = new HealthService(prisma, mockConfigService as any);
  });

  it('returns healthy status when DB and Redis are up', async () => {
    mockRedisClient.ping.mockResolvedValueOnce('PONG');
    const result = await service.getSystemHealth();
    expect(result.status).toBe('healthy');
    expect(result.services.database.status).toBe('up');
    expect(result.services.redis.status).toBe('up');
  });

  it('returns degraded when Redis ping fails', async () => {
    mockRedisClient.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await service.getSystemHealth();
    expect(result.status).toBe('degraded');
    expect(result.services.redis.status).toBe('down');
  });
});
```

**Critical:** The `jest.mock()` calls must appear at the top of the file before any `import` of `HealthService`, because Jest hoists `jest.mock()` but the module-level `createClient()` call in `health.service.ts` runs at import time.

### Pattern 4: createTestLabel Factory (extend factories.ts)

**What:** A factory for `UserLabel` rows needed by `labels.service.spec.ts`.

```typescript
// Extension to backend/test/helpers/factories.ts
export async function createTestLabel(
  tenantId: string,
  overrides: Partial<{
    name: string;
    parentId: string | null;
    color: Record<string, unknown> | null;
    icon: string | null;
  }> = {},
): Promise<UserLabel> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  const name = overrides.name ?? `Test Label ${uid}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return prisma.userLabel.create({
    data: {
      tenantId,
      name,
      slug,
      type: 'USER',
      parentId: overrides.parentId ?? null,
      level: overrides.parentId ? 1 : 0,
      orderIndex: 0,
      color: overrides.color ?? undefined,
      icon: overrides.icon ?? null,
    },
  });
}
```

### Anti-Patterns to Avoid

- **Bootstrapping the full NestJS module per test:** `Test.createTestingModule({ imports: [LabelsModule] })` pulls in `EmailModule` and `RealtimeModule` chains -- dozens of providers need mocking. Direct service instantiation is simpler and faster.
- **Testing `withoutTenantScopingAsync` wrapper in health:** The `getPrometheusMetrics` method is marked `@deprecated` and contains Prisma queries that have no `tenantId` filter. These are not in scope for BTEST-08. Test only `getSystemHealth()`.
- **Testing avatar upload in users:** `updateUserAvatar` calls `storageService.putObject` and `getSignedDownloadUrl` -- these are storage-layer operations. Mock the StorageService and verify the `prisma.user.update` result only. Don't test R2 upload logic.
- **Asserting `emitLabelNew` was called:** WebSocket realtime events are side effects on `RealtimeEventsService`. Mock the service and optionally assert it was called, but keep the assertion light -- don't test the socket.io internals.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Label slug generation | Duplicate `generateSlug` logic in tests | Call `service.create()` and inspect the returned `slug` field | The method is private; test via the public API |
| Circular reference detection | Simulate full graph traversal in tests | Create a real 3-level hierarchy with `createTestLabel` and assert `ConflictException` is thrown | Real DB rows exercise the real recursive `wouldCreateCircularReference` logic |
| Tenant isolation assertion | Custom cross-tenant query | Create two tenants, insert labels in tenant A, call `findAllByTenant(tenantB.id)` and assert empty array | `findAllByTenant` has `where: { tenantId }` -- the real DB filter is the assertion |
| Redis connection mocking | Custom mock Redis server | `jest.mock('redis', ...)` with a mock client object | Redis behavior in health tests is about error handling, not protocol; a mock is correct |

## Common Pitfalls

### Pitfall 1: Module-Level Redis Client Creation in HealthService
**What goes wrong:** `HealthService` calls `createClient(getRedisNodeConnectionOptions(...))` at class definition time (not in the constructor body). When Jest imports the module, the real `createClient` runs before any mock is set.
**Why it happens:** The property initializer `private redisClient = createClient(...)` executes when the class is instantiated, which happens when Jest imports the class for the first time.
**How to avoid:** Place `jest.mock('redis', ...)` and `jest.mock('../../../config/configuration', ...)` BEFORE all import statements in the test file. Jest hoists `jest.mock()` calls automatically -- they run before module evaluation.
**Warning signs:** `Error: Redis client initialization failed` or real Redis connection attempts during tests.

### Pitfall 2: PrismaService Cast
**What goes wrong:** TypeScript rejects `getTestPrismaClient() as PrismaService` because `PrismaService` (which extends `PrismaClient` with `implements OnModuleInit`) is not assignable to the raw `PrismaClient` return type.
**Why it happens:** `PrismaService` has additional lifecycle methods (`onModuleInit`, `enableShutdownHooks`).
**How to avoid:** Use `as unknown as PrismaService` double cast. The lifecycle methods are never called in tests; only Prisma query methods matter.
**Warning signs:** TypeScript compile error: `Type 'PrismaClient' is not assignable to type 'PrismaService'`.

### Pitfall 3: Missing `createTestLabel` in `cleanupTestData`
**What goes wrong:** Labels created in tests persist across suites if `cleanupTestData()` doesn't include the `user_labels` table. Slug uniqueness constraint `@@unique([tenantId, slug])` will cause `ConflictException` in unrelated tests.
**Why it happens:** The existing `cleanupTestData` in Phase 66 truncates user/tenant tables but does NOT include `user_labels` (that table didn't exist in the initial cleanup list).
**How to avoid:** Add `"user_labels"` to the TRUNCATE statement in `backend/test/helpers/cleanup.ts`. The CASCADE from `tenants` TRUNCATE would delete labels anyway, but explicit inclusion is safer.
**Warning signs:** Slug conflict errors in second test run or in parallel test suites.

### Pitfall 4: TenantDeletedEvent in TenantService Tests
**What goes wrong:** `deleteTenant` and `hardDeleteTenant` call `this.eventEmitter.emit(TenantDeletedEvent.eventName, ...)`. If the mock EventEmitter isn't set up, the call throws.
**Why it happens:** `EventEmitter2` is not `@Optional()` in `TenantService` -- it's a required constructor dependency.
**How to avoid:** Always inject `{ emit: jest.fn() } as unknown as EventEmitter2`. Assert `mockEventEmitter.emit` was called with the correct event name for completeness.
**Warning signs:** `Cannot read properties of undefined (reading 'emit')` in tenant delete tests.

### Pitfall 5: Labels Soft Delete vs. Hard Delete
**What goes wrong:** Test asserts label no longer appears in `findAllByTenant` after `delete()`, but the row still exists in the DB (`isArchived = true`).
**Why it happens:** `LabelsService.delete()` is a soft delete -- it sets `isArchived = true`, not a real DB delete. `findAllByTenant` filters `where: { isArchived: false }`, so the label disappears from list results.
**How to avoid:** Assert via `findAllByTenant` (returns filtered list) and separately verify via raw Prisma that the row exists with `isArchived: true`. This confirms the soft-delete behavior, not accidental hard delete.
**Warning signs:** Test passes but next test run creates a slug conflict because the row still exists.

### Pitfall 6: UsersService.getUserPreferences Creates on First Call
**What goes wrong:** Test for "get preferences returns default values" calls `getUserPreferences` on a user with no preferences row, which auto-creates one. If the test doesn't account for this, a second call to `getUserPreferences` returns the created row (not null), which can confuse assertion logic.
**Why it happens:** `getUserPreferences` has an explicit `if (!preferences) { create... }` branch.
**How to avoid:** Test this explicitly: first call creates with defaults, second call returns existing. This is the behavior to verify, not an error.
**Warning signs:** Flaky tests that pass on first run but fail on retry because the auto-created preferences row already exists.

## Code Examples

### Tenant CRUD and Isolation Test Sketch
```typescript
// Source: derived from tenant.service.ts business logic
describe('TenantService - isolation', () => {
  it('findAllByTenant returns only non-deleted tenants', async () => {
    const tenantA = await createTestTenant({ name: 'Tenant A', slug: 'tenant-a-test' });
    const tenantB = await createTestTenant({ name: 'Tenant B', slug: 'tenant-b-test' });

    await service.deleteTenant(tenantA.id); // soft delete

    const all = await service.getAllTenants();
    const ids = all.map((t) => t.id);
    expect(ids).not.toContain(tenantA.id); // soft-deleted, filtered out
    expect(ids).toContain(tenantB.id);
  });

  it('createTenant throws if slug already exists', async () => {
    await createTestTenant({ slug: 'duplicate-slug' });
    await expect(
      service.createTenant({ name: 'Another', slug: 'duplicate-slug' }),
    ).rejects.toThrow('Slug already exists');
  });
});
```

### Labels Nested Tree Test Sketch
```typescript
// Source: derived from labels.service.ts archiveDescendants logic
describe('LabelsService - nested operations', () => {
  it('delete parent soft-deletes all descendants', async () => {
    const tenant = await createTestTenant();
    const parent = await createTestLabel(tenant.id, { name: 'Parent' });
    const child = await createTestLabel(tenant.id, { name: 'Child', parentId: parent.id });
    const grandchild = await createTestLabel(tenant.id, { name: 'Grandchild', parentId: child.id });

    await service.delete(tenant.id, parent.id);

    // All three must be archived
    const prisma = getTestPrismaClient();
    const rows = await prisma.userLabel.findMany({
      where: { id: { in: [parent.id, child.id, grandchild.id] } },
      select: { id: true, isArchived: true },
    });
    expect(rows.every((r) => r.isArchived)).toBe(true);
  });

  it('create throws ConflictException on circular reparent', async () => {
    const tenant = await createTestTenant();
    const parent = await createTestLabel(tenant.id, { name: 'A' });
    const child = await createTestLabel(tenant.id, { name: 'B', parentId: parent.id });

    // Attempt to make parent a child of child (circular)
    await expect(
      service.update(tenant.id, parent.id, { parentId: child.id }),
    ).rejects.toThrow('Cannot create circular label hierarchy');
  });
});
```

### Health Service - Degraded DB Test Sketch
```typescript
// Source: derived from health.service.ts getSystemHealth logic
it('returns degraded when $queryRaw throws', async () => {
  // Temporarily make Prisma throw
  const originalQuery = prisma.$queryRaw.bind(prisma);
  jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB connection refused'));

  const result = await service.getSystemHealth();

  expect(result.status).toBe('degraded');
  expect(result.services.database.status).toBe('down');
  expect(result.services.database.error).toContain('DB connection refused');

  jest.restoreAllMocks();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock Prisma with `jest-prisma` | Real test DB + direct instantiation | Phase 66 decision | Tests catch real schema constraint violations (unique, FK) |
| Full `Test.createTestingModule()` per suite | Direct service `new Service(deps)` | Phase 67 approach | 10-20x faster test startup; no NestJS DI overhead |
| Seeded baseline data per test | Factory helpers per test, `cleanupTestData` in `afterAll` | Phase 66 pattern | Tests are isolated and order-independent |

**Deprecated/outdated:**
- `getPrometheusMetrics()` in HealthService: marked `@deprecated` since Phase 46. Do not write tests for it.

## Open Questions

1. **`user_labels` in `cleanupTestData`**
   - What we know: Phase 66's `cleanup.ts` TRUNCATE list covers 15 auth/user tables. `user_labels` is not listed.
   - What's unclear: Whether CASCADE from `tenants` TRUNCATE already handles label rows (it should, given `onDelete: Cascade` on the `tenantId` FK).
   - Recommendation: Add `"user_labels"` explicitly to the TRUNCATE list as a Wave 0 task to be safe.

2. **HealthService Mistral probe in tests**
   - What we know: `getSystemHealth()` calls `checkMistral()` which is a private method making an `axios.get()` to the Mistral API. In tests, `MISTRAL_API_KEY` will be unset.
   - What's unclear: Whether `configService.get('MISTRAL_API_KEY')` returns `undefined` when ConfigService is a mock returning `undefined` by default.
   - Recommendation: The `checkMistral` method has an early return `if (!apiKey) { return { status: 'disabled', ... } }`. Mock ConfigService `.get()` to return `undefined` for `MISTRAL_API_KEY` and the Mistral probe will be `disabled`, which doesn't affect `health.status`. No need to mock axios.

3. **StorageService in deleteUserAccount tests**
   - What we know: `deleteUserAccount` calls `storageService.deleteObject` in a best-effort loop for avatar cleanup before the Prisma transaction.
   - What's unclear: Whether to test the full `deleteUserAccount` path including the queue cleanup.
   - Recommendation: Mock `emailEmbeddingQueue.removeJobsForTenant` and `queueService.removeJobsForTenant` as `jest.fn()` and assert the user row is deleted from the real DB. This fully validates the transactional logic.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 (ts-jest transform) |
| Config file | `backend/jest.config.js` (globalSetup + globalTeardown already configured) |
| Quick run command | `cd backend && npm test -- --testPathPattern=modules/(health\|users\|tenants\|labels) --forceExit` |
| Full suite command | `cd backend && npm test --forceExit` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BTEST-05 | Labels CRUD + nested soft-delete + slug uniqueness | integration (real DB) | `cd backend && npm test -- --testPathPattern=labels/services --forceExit` | No - Wave 0 |
| BTEST-06 | Tenant CRUD + soft/hard delete + slug uniqueness + isolation | integration (real DB) | `cd backend && npm test -- --testPathPattern=tenants/services --forceExit` | No - Wave 0 |
| BTEST-07 | User profile get/update + preferences upsert + account delete | integration (real DB) | `cd backend && npm test -- --testPathPattern=users/services --forceExit` | No - Wave 0 |
| BTEST-08 | Health: DB probe up, DB probe degraded, Redis probe up, Redis probe degraded, BullMQ optional | unit (mocked clients) | `cd backend && npm test -- --testPathPattern=health/services --forceExit` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --testPathPattern=<module> --forceExit`
- **Per wave merge:** `cd backend && npm test --forceExit`
- **Phase gate:** All four spec files green; `npm test --coverage` does not regress below 50% threshold

### Wave 0 Gaps
- [ ] `backend/src/modules/health/services/__tests__/health.service.spec.ts` -- covers BTEST-08
- [ ] `backend/src/modules/users/services/__tests__/users.service.spec.ts` -- covers BTEST-07
- [ ] `backend/src/modules/tenants/services/__tests__/tenant.service.spec.ts` -- covers BTEST-06
- [ ] `backend/src/modules/labels/services/__tests__/labels.service.spec.ts` -- covers BTEST-05
- [ ] Add `createTestLabel()` to `backend/test/helpers/factories.ts`
- [ ] Add `"user_labels"` to TRUNCATE list in `backend/test/helpers/cleanup.ts`

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/health/services/health.service.ts` -- read directly
- `backend/src/modules/users/services/users.service.ts` -- read directly
- `backend/src/modules/tenants/services/tenant.service.ts` -- read directly
- `backend/src/modules/labels/services/labels.service.ts` -- read directly
- `backend/test/helpers/factories.ts` -- read directly (Phase 66 output)
- `backend/test/helpers/cleanup.ts` -- read directly (Phase 66 output)
- `backend/test/helpers/prisma-test-client.ts` -- read directly (Phase 66 output)
- `backend/test/smoke.spec.ts` -- read directly (test pattern reference)
- `backend/jest.config.js` -- read directly (test runner config)
- `backend/prisma/schema.prisma` -- queried for `UserLabel`, `UserPreferences`, `Tenant` models

### Secondary (MEDIUM confidence)
- `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` -- pattern reference for direct service instantiation without `Test.createTestingModule()`
- `backend/src/__tests__/module-bootstrap.spec.ts` -- confirms `jest.mock()` at top + direct `new Service(deps)` pattern works in this codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed; no new installs required
- Architecture: HIGH - patterns derived directly from existing Phase 66 test infrastructure and existing spec files in the codebase
- Pitfalls: HIGH - HealthService Redis-at-class-definition pitfall verified by reading the source; other pitfalls derived from the actual service implementations
- Validation: HIGH - test locations and commands follow the established Jest config pattern

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable; service implementations and test infrastructure don't change between phases)
