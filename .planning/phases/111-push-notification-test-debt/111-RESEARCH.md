# Phase 111: Push Notification Test Debt - Research

**Researched:** 2026-03-25
**Domain:** NestJS unit testing, Jest mocking patterns for BullMQ/Redis/web-push
**Confidence:** HIGH

## Summary

Phase 111 is a pure test-debt phase. Phase 107 delivered the push notification feature across 4 source files with 19 RED test stubs (`expect(true).toBe(false)`) distributed across 4 spec files. All implementation code already exists and is production-validated. The task is to replace every stub with a real assertion that validates actual service/handler/worker/controller behavior.

The 4 spec files map 1:1 to 4 implementation files. Each implementation file uses a combination of PrismaService, web-push, BullMQ (Queue/Worker), Redis (ioredis), and the project's `withoutTenantScopingAsync` utility. The project has well-established mocking patterns for all of these dependencies, found across 80+ existing spec files.

**Primary recommendation:** Use direct constructor injection with mock objects (the project's dominant pattern). Mock `withoutTenantScopingAsync` via `jest.mock` to passthrough callbacks. Mock `bullmq` and `web-push` at module level. Mock Redis as a plain object with jest.fn() methods.

## Project Constraints (from CLAUDE.md)

- **NEVER MODIFY TESTS TO MAKE THEM PASS** -- unless the task explicitly asks. This phase explicitly asks to replace RED stubs, so modifying the spec files IS the task.
- **Post-Edit Validation (MANDATORY):** After every file edit, run `cd backend && npx tsc --noEmit`. Fix issues before moving on.
- **FOLLOW EXISTING PATTERNS.** Never invent new approaches when codebase patterns exist.
- **SCOPE CONTROL.** Replace the 19 stubs. Do not add extra tests, refactor source files, or "improve" anything.
- **Max 500 lines per file.** No exceptions.
- **Test command:** `cd backend && npm run test -- --testPathPattern=push`

## Standard Stack

### Testing Infrastructure (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| jest | ^30.2.0 | Test runner | Configured via package.json `"test"` script |
| ts-jest | ^29.4.6 | TypeScript transform | Already configured |
| @nestjs/testing | (matches NestJS 11) | Test module builder | Used in some specs, but direct instantiation is also common |

No new packages needed. This is purely writing test logic against existing infrastructure.

## Architecture Patterns

### Stub Inventory (19 RED stubs across 4 files)

**File 1: `push.controller.spec.ts`** (2 stubs)
| # | Test Name | What to Assert |
|---|-----------|----------------|
| 1 | should accept a valid push subscription DTO | Controller calls `pushService.subscribe()` with tenantId, userId, dto, user-agent |
| 2 | should delete subscription by endpoint | Controller calls `pushService.unsubscribe()` with tenantId, endpoint |

**File 2: `push.service.spec.ts`** (5 stubs)
| # | Test Name | What to Assert |
|---|-----------|----------------|
| 3 | should return all subscriptions for a given tenantId + userId (PUSH-04) | Calls `prisma.pushSubscription.findMany({ where: { tenantId, userId } })` |
| 4 | should delete subscription by id with tenantId filter (PUSH-03) | Calls `prisma.pushSubscription.deleteMany({ where: { id, tenantId } })` |
| 5 | should call webpush.sendNotification with correct subscription keys | Calls `webpush.sendNotification` with `{ endpoint, keys: { p256dh, auth } }` and payload |
| 6 | should return push preferences for user (PUSH-05) | Calls `prisma.userPreferences.findUnique` and returns prefs |
| 7 | should return defaults when no preferences record exists | Returns `{ pushEmailEnabled: true, pushCalendarEnabled: true, pushAiEnabled: true }` when findUnique returns null |

**File 3: `push-dispatch.worker.spec.ts`** (6 stubs)
| # | Test Name | What to Assert |
|---|-----------|----------------|
| 8 | should call sendNotification for each user subscription (PUSH-02) | For N subscriptions, sendNotification called N times |
| 9 | should fan out to all subscriptions for multi-device delivery (PUSH-04) | All subscriptions receive the notification payload |
| 10 | should delete stale subscription on 410 response (PUSH-03) | On 410 error, calls deleteStaleSubscription |
| 11 | should delete stale subscription on 404 response (PUSH-03) | On 404 error, calls deleteStaleSubscription |
| 12 | should build grouped notification payload with count for push-email-grouped jobs | Job name `push-email-grouped` produces `"N new emails in ..."` title |
| 13 | should include /mail/{emailId} URL in payload data (PUSH-06) | Payload `data.url` equals `/mail/${emailId}` |

**File 4: `push-dispatch.handler.spec.ts`** (6 stubs)
| # | Test Name | What to Assert |
|---|-----------|----------------|
| 14 | should enqueue a BullMQ job when email.indexed fires (PUSH-01) | Calls `queue.add('push-email', {...})` |
| 15 | should skip push when user has pushEmailEnabled=false | Does NOT call `queue.add` |
| 16 | should look up userId from providerId via ProviderConfig | Calls `prisma.providerConfig.findUnique({ where: { id: providerId } })` |
| 17 | should use Redis INCR for dedup key on first email in thread | Calls `redis.incr(dedupKey)`, returns 1, then calls `queue.add('push-email-grouped', ...)` with delay |
| 18 | should skip dispatch for subsequent emails in same thread within 60s window | `redis.incr` returns >1, does NOT call `queue.add` |
| 19 | should dispatch immediately when email has no threadId | No redis call, calls `queue.add('push-email', ...)` with `threadId: null` |

### Mocking Pattern: withoutTenantScopingAsync

Established project pattern (used in 6+ existing spec files):
```typescript
// MUST be BEFORE imports of the module under test
jest.mock('../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));
```
This makes the bypass wrapper transparent -- it just executes the callback directly.

### Mocking Pattern: BullMQ Queue/Worker

Established project pattern (used in module-bootstrap.spec.ts, reminder-scheduler.service.spec.ts):
```typescript
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
```

### Mocking Pattern: web-push

No existing mock in the codebase (push is the only consumer). Standard approach:
```typescript
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));
```

### Mocking Pattern: Redis (ioredis)

For the handler and worker, Redis is accessed via `getSharedRedisConnection()`. Mock the config barrel:
```typescript
jest.mock('../../common/config', () => ({
  QUEUE_NAMES: { PUSH_DISPATCH: 'push-dispatch' },
  getRedisConnectionOptions: jest.fn(() => ({})),
  getDefaultJobOptions: jest.fn(() => ({})),
  getSharedRedisConnection: jest.fn(() => mockRedis),
  releaseSharedRedisConnection: jest.fn(),
}));
```
Where `mockRedis` is:
```typescript
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};
```

### Mocking Pattern: PrismaService

Direct mock object (project standard):
```typescript
const mockPrisma = {
  pushSubscription: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
  providerConfig: {
    findUnique: jest.fn(),
  },
  email: {
    findFirst: jest.fn(),
  },
};
```

### Test Instantiation Pattern

Two patterns exist in the codebase. For this phase:

1. **PushService + PushController**: Use `Test.createTestingModule` (NestJS DI) since the controller has constructor injection. Alternatively, direct `new PushController(mockPushService)` is simpler for the controller since it has a single dependency.

2. **PushDispatchHandler + PushDispatchWorker**: Direct instantiation is tricky because `onModuleInit` creates real BullMQ Queue/Worker instances. Mock `bullmq` at module level (jest.mock hoisting), then instantiate and call `onModuleInit()` to set up the mocked queue/worker, then test the `handleEmailIndexed` / `process` methods.

### Testing the Worker's private `process` method

The worker's `process` method is private and registered as a BullMQ callback. Two approaches:
1. **Capture the callback** from the mocked `Worker` constructor call
2. **Access via `(service as any).process(job)`** -- simpler, used in other specs in this project

Recommendation: Use approach 2 (direct private access) -- it matches project style and is more readable.

### Testing the Handler's event method

`handleEmailIndexed` is a public method decorated with `@OnEvent`. It can be called directly in tests -- no event emitter needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant scoping bypass | Custom AsyncLocalStorage manipulation | `jest.mock withoutTenantScopingAsync` passthrough | Established pattern, 6+ precedents |
| BullMQ isolation | Real Redis connections | `jest.mock('bullmq')` | Prevents flaky tests, established pattern |
| web-push isolation | Real VAPID key generation | `jest.mock('web-push')` | No network calls in unit tests |

## Common Pitfalls

### Pitfall 1: jest.mock hoisting order
**What goes wrong:** Mocking `withoutTenantScopingAsync` or `bullmq` AFTER importing the module under test means the real module loads first.
**Why it happens:** Jest hoists `jest.mock()` calls to the top of the file, but only if they appear at the top level (not inside describe/beforeEach).
**How to avoid:** Place ALL `jest.mock()` calls at the very top of the file, BEFORE any import statements for modules that depend on the mocked modules.
**Warning signs:** "Cannot connect to Redis" errors, real web-push calls being made.

### Pitfall 2: Worker process method not directly callable
**What goes wrong:** The `process` callback is registered inside `onModuleInit` as a BullMQ Worker callback.
**How to avoid:** Either capture the callback from the mocked Worker constructor, or call `(worker as any).process(mockJob)` directly. The worker stores the method as a class method, so direct access works.

### Pitfall 3: ConfigService mock for PushService
**What goes wrong:** PushService constructor needs ConfigService. Its `onModuleInit` calls `config.get()` for VAPID keys.
**How to avoid:** Provide a mock ConfigService with `get: jest.fn()` returning empty strings (VAPID init will be skipped since both keys must be truthy).

### Pitfall 4: Forgetting tenantId in assertions
**What goes wrong:** Tests pass but don't verify tenant isolation.
**How to avoid:** Always assert that `tenantId` appears in the `where` clause of Prisma calls.

### Pitfall 5: Promise.allSettled in worker fan-out
**What goes wrong:** The worker uses `Promise.allSettled`, so one failing subscription doesn't block others. Tests for 410/404 must set up the mock to throw for a specific subscription.
**How to avoid:** Use `mockImplementation` that throws `{ statusCode: 410 }` for the first call and resolves for others, then verify deleteStaleSubscription was called for the failing one.

## Code Examples

### PushService test setup (verified from codebase patterns)
```typescript
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

import * as webpush from 'web-push';
import { PushService } from './push.service';

const mockPrisma = {
  pushSubscription: { findMany: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
  userPreferences: { findUnique: jest.fn() },
} as any;

const mockConfig = {
  get: jest.fn().mockReturnValue(''),
} as any;

describe('PushService', () => {
  let service: PushService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushService(mockPrisma, mockConfig);
  });
  // ...tests
});
```

### PushDispatchHandler test setup (verified from codebase patterns)
```typescript
jest.mock('../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
}));

jest.mock('../../common/config', () => ({
  QUEUE_NAMES: { PUSH_DISPATCH: 'push-dispatch' },
  getRedisConnectionOptions: jest.fn(() => ({})),
  getDefaultJobOptions: jest.fn(() => ({})),
  getSharedRedisConnection: jest.fn(() => mockRedis),
  releaseSharedRedisConnection: jest.fn(),
}));

const mockQueue = { add: jest.fn(), close: jest.fn() };
const mockRedis = { incr: jest.fn(), expire: jest.fn() };

import { PushDispatchHandler } from './push-dispatch.handler';

const mockPrisma = { ... } as any;
const mockPushService = { getUserPushPreferences: jest.fn() } as any;
```

### PushDispatchWorker test setup (verified from codebase patterns)
```typescript
jest.mock('../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => mockWorkerInstance),
}));

jest.mock('../../common/config', () => ({
  QUEUE_NAMES: { PUSH_DISPATCH: 'push-dispatch' },
  getRedisConnectionOptions: jest.fn(() => ({})),
  getSharedRedisConnection: jest.fn(() => mockRedis),
  releaseSharedRedisConnection: jest.fn(),
}));

const mockWorkerInstance = { on: jest.fn(), close: jest.fn() };
const mockRedis = { get: jest.fn(), del: jest.fn() };

import { PushDispatchWorker } from './push-dispatch.worker';
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest 29.4.6 |
| Config file | `backend/package.json` (jest section) |
| Quick run command | `cd backend && npm run test -- --testPathPattern=push` |
| Full suite command | `cd backend && npm run test` |

### Phase Requirements -> Test Map
| Stub # | Behavior | Spec File | Approach |
|--------|----------|-----------|----------|
| 1-2 | Controller subscribe/unsubscribe | push.controller.spec.ts | Mock PushService, verify delegation |
| 3-7 | Service CRUD + preferences | push.service.spec.ts | Mock Prisma + web-push, verify calls |
| 8-13 | Worker fan-out, stale cleanup, grouping | push-dispatch.worker.spec.ts | Mock PushService + Redis, test process() |
| 14-19 | Handler event dispatch, prefs check, thread dedup | push-dispatch.handler.spec.ts | Mock Prisma + PushService + Queue + Redis |

### Sampling Rate
- **Per task commit:** `cd backend && npm run test -- --testPathPattern=push`
- **Per wave merge:** `cd backend && npm run test`
- **Phase gate:** Full suite green + zero `expect(true).toBe(false)` remaining

### Wave 0 Gaps
None -- all 4 spec files exist. Test infrastructure (Jest) is configured. No new fixtures or config needed.

## Open Questions

None. All implementation code is readable, all mocking patterns have codebase precedent, and the 19 stubs have clear 1:1 mappings to implementation logic.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/modules/push/*.ts` (all 4 implementation files + 4 spec files)
- Codebase inspection: 6+ existing spec files using `withoutTenantScopingAsync` mock pattern
- Codebase inspection: `module-bootstrap.spec.ts`, `reminder-scheduler.service.spec.ts` for BullMQ mock pattern
- Codebase inspection: `audit.service.spec.ts`, `reminder-email-monitor.service.spec.ts` for direct-instantiation and NestJS TestingModule patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all testing dependencies already installed, zero new packages
- Architecture: HIGH - all 19 stubs map directly to readable implementation code
- Pitfalls: HIGH - mocking patterns verified against 6+ existing spec files in the same codebase

**Research date:** 2026-03-25
**Valid until:** Indefinite (test debt against stable implementation)
