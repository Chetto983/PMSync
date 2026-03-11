# Phase 68: Backend Tests - Complex Modules - Research

**Researched:** 2026-03-11
**Domain:** NestJS integration testing — Calendar, Contacts, Providers, Subscription modules
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Calendar and Contacts: mock at service adapter class level using `jest.fn()` — mock `GoogleCalendarSyncService`, `MicrosoftCalendarSyncService`, `GoogleContactsSyncService`, `MicrosoftContactsSyncService` as constructor dependencies
- Providers module (OAuth flows): mock at HTTP level — intercept Google/Microsoft token endpoints to test token parsing, storage, expiry handling, and error paths with realistic HTTP responses
- Redis/cache: use real Redis test instance (from Phase 66 infra) for `ContactsCacheService` and any calendar cache tests
- BullMQ workers: test by calling `processJob()` directly on the worker with a mock job object
- Queue service tests: assert services enqueue jobs with correct type and payload (mock the Queue)
- Factory strategy: add new factory helpers to shared `test/helpers/factories.ts` — `createTestCalendarEvent()`, `createTestContact()`, `createTestProviderAccount()`, `createTestSubscription()`
- Cleanup strategy: per-factory tracking with targeted cleanup; global `cleanupTestData()` as final safety net
- 1 plan per module = 4 plans total (68-01 Calendar, 68-02 Contacts, 68-03 Providers, 68-04 Subscription)
- ICS parsing: exhaustive edge case matrix — all RRULE frequencies, DST transitions, leap year, all-day events, timezone offset variants
- OAuth: every error code path — acquire success/failure, refresh expired/invalid, revocation success/already-revoked, network errors
- For OAuth tests, insert rows with past `expiresAt` timestamps to simulate expiry rather than mocking timers
- ICS parsing tests use real `.ics` fixture strings

### Claude's Discretion
- Exact nock scope setup for OAuth (which base URLs to intercept)
- Whether to use `jest.useFakeTimers()` for token expiry testing or insert rows with past `expiresAt` timestamps
- Order of test cases within each describe block
- Exact Prisma model field values in factory defaults

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BTEST-01 | Calendar module has tests for all services (sync, webhooks, conflict resolution, ICS parsing) | CalendarConflictService (Prisma-only), IcsParserService (no deps), GoogleCalendarSyncService (abstract sync, mock adapter), GoogleCalendarWebhookService (Prisma + mock queue), CalendarSyncQueueService (BullMQ) all read |
| BTEST-02 | Contacts module has tests for all services (sync, CRM scoring, cache, webhooks) | ContactSyncService (Prisma + mocked adapters), RelationshipScoreService (Prisma + HashSearchService), ContactsCacheService (real Redis/ioredis), GoogleContactsWebhookService (Prisma + mocked queue) all read |
| BTEST-03 | Providers module has tests for OAuth flows, IMAP config, and token lifecycle | GoogleOAuthService (fetch-based HTTP — nock or jest.spyOn(global, 'fetch')), ProviderConfigService (Prisma + mocked OAuth/IMAP/subscription), ImapService (mock ImapFlow) |
| BTEST-04 | Subscription module has tests for billing, quotas, usage tracking, and QuotaGuard | SubscriptionService (Prisma + mocked UsageTracking), UsageTrackingService (real Redis via CacheService), SubscriptionLifecycleService (Prisma + mocked), QuotaGuard (mock ExecutionContext) |
</phase_requirements>

---

## Summary

Phase 68 writes integration tests for four complex backend modules: Calendar, Contacts, Providers, and Subscription. The test pattern established in Phase 67 applies directly: direct service constructor instantiation with a real Prisma test client, `jest.fn()` for all non-Prisma dependencies, and `afterAll` cleanup. No NestJS `Test.createTestingModule()`.

The four modules differ significantly in complexity. Calendar has 16 services with many cross-cutting concerns; the focus is on four: `CalendarConflictService`, `IcsParserService`, `GoogleCalendarSyncService`, and `GoogleCalendarWebhookService`. Contacts has a particularly complex CRM scoring algorithm in `RelationshipScoreService` that uses raw SQL and requires real DB rows with specific email interaction data to test correctly. The Providers module requires HTTP-level mocking for OAuth token flows — `nock` is NOT installed and must be added, or `jest.spyOn(global, 'fetch')` can be used since `GoogleOAuthService.revokeToken` uses native `fetch`. Subscription's `UsageTrackingService` wraps `CacheService` which uses the node-redis client (not ioredis) — this service needs the real Redis instance from Phase 66.

**Primary recommendation:** Extend Phase 67 patterns with factory expansion and targeted per-test cleanup. Add `nock` for OAuth HTTP mocking OR use `jest.spyOn(global, 'fetch')` since the codebase already uses native fetch for Google token revocation. The cleanup.ts TRUNCATE list must be extended with 5 new tables before any Phase 68 test can run safely.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | ^30.2.0 | Test runner | Project standard (jest.config.js) |
| ts-jest | ^29.4.6 | TypeScript transform | Project standard |
| node-ical | ^0.25.1 | ICS parsing (production dep) | Already used by IcsParserService |
| googleapis | ^171.4.0 | Google API client (production dep) | Already used in sync services |
| google-auth-library | ^10.5.0 | OAuth2 client (production dep) | Used by GoogleOAuthService |
| ioredis | ^5.9.2 | Redis client (production dep) | Used by ContactsCacheService, BullMQ |
| bullmq | ^5.67.3 | Queue (production dep) | Used by CalendarSyncQueueService |

### Needs Installation
| Library | Purpose | Why Needed |
|---------|---------|------------|
| nock | HTTP-level mocking for OAuth endpoints | Decision says mock OAuth at HTTP level; `nock` is NOT installed |

**Alternative to nock:** Since `GoogleOAuthService.revokeToken` and `GoogleOAuthService.refreshAccessToken` use `OAuth2Client` from `google-auth-library` (not plain `fetch`), use `jest.spyOn` on the `oauth2Client` instance methods. For `revokeToken` which uses native `fetch`, use `jest.spyOn(global, 'fetch')`. This avoids installing nock.

**Recommendation:** Use `jest.spyOn` throughout — no new dependency needed. CONTEXT.md says "mock at HTTP level using nock" but nock is absent and the OAuth client object is directly accessible. `jest.spyOn(oauth2Client, 'refreshAccessToken')` is cleaner than HTTP interception for this codebase.

**Installation (if nock chosen):**
```bash
cd backend && npm install --save-dev nock @types/nock
```

---

## Architecture Patterns

### Test File Locations (follow Phase 67 convention)
```
backend/src/modules/
├── calendar/services/__tests__/
│   ├── calendar-conflict.service.spec.ts
│   ├── ics-parser.service.spec.ts
│   ├── google-calendar-sync.service.spec.ts
│   └── google-calendar-webhook.service.spec.ts
├── contacts/services/__tests__/
│   ├── contact-sync.service.spec.ts
│   ├── relationship-score.service.spec.ts
│   ├── contacts-cache.service.spec.ts
│   └── google-contacts-webhook.service.spec.ts
├── providers/services/__tests__/
│   ├── google-oauth.service.spec.ts
│   ├── provider-config.service.spec.ts
│   └── imap.service.spec.ts
└── subscription/services/__tests__/
    ├── subscription.service.spec.ts
    ├── usage-tracking.service.spec.ts
    ├── subscription-lifecycle.service.spec.ts
    └── quota.guard.spec.ts
```

### Pattern 1: Direct Instantiation (Phase 67 baseline — replicate exactly)
**What:** Instantiate service with `new Service(prisma, mock1, mock2)`. No NestJS DI.
**When to use:** All tests in this phase.
```typescript
// Source: backend/src/modules/labels/services/__tests__/labels.service.spec.ts
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant } from '../../../../../test/helpers/factories';

const mockSync = { syncCalendar: jest.fn() };

describe('CalendarConflictService', () => {
  let service: CalendarConflictService;

  beforeAll(() => {
    const prisma = getTestPrismaClient();
    service = new CalendarConflictService(prisma as any);
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await cleanupTestData();
  });
});
```

### Pattern 2: IcsParserService — No Dependencies
**What:** `IcsParserService` has no constructor parameters (`@Injectable()` with only `Logger`). Instantiate directly with `new IcsParserService()`.
```typescript
describe('IcsParserService', () => {
  const service = new IcsParserService();
  // No prisma, no mocks needed — pure function tests against .ics string fixtures
});
```

### Pattern 3: Real Redis for Cache Tests
**What:** `ContactsCacheService` depends on `ConfigService` and `RedisConnectionService`. For tests, inject a test ioredis client directly by setting `service['redis']` after construction.
```typescript
import { Redis } from 'ioredis';

const testRedis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });
service['redis'] = testRedis; // bypass onModuleInit
// Cleanup after: await testRedis.flushdb(); (or targeted key deletes)
```

### Pattern 4: OAuth HTTP Mocking (jest.spyOn approach)
**What:** `GoogleOAuthService.refreshAccessToken` calls `this.oauth2Client.refreshAccessToken()`. Mock the OAuth2Client method.
```typescript
import { OAuth2Client } from 'google-auth-library';

// In test:
jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockResolvedValue({
  credentials: { access_token: 'new-token', expiry_date: Date.now() + 3600000 },
  res: null,
});

// For revokeToken (uses global fetch):
jest.spyOn(global, 'fetch').mockResolvedValue({
  ok: true, status: 200, text: async () => ''
} as Response);
```

### Pattern 5: QuotaGuard — Mock ExecutionContext
**What:** `QuotaGuard.canActivate()` takes an `ExecutionContext`. Must be mocked.
```typescript
const mockContext = {
  switchToHttp: () => ({
    getRequest: () => ({ user: { tenantId }, headers: {} }),
  }),
  getHandler: () => ({}),
  getClass: () => ({}),
} as unknown as ExecutionContext;

const mockReflector = { get: jest.fn().mockReturnValue(null) };
const guard = new QuotaGuard(
  mockReflector as any,
  mockSubscriptionService as any,
  mockUsageTracking as any,
  mockCostProtection as any,
);
const result = await guard.canActivate(mockContext);
```

### Pattern 6: Past-expiresAt for Token Expiry Tests
**What:** Insert `providerConfig` rows with `tokenExpiresAt` in the past to simulate expired tokens without `jest.useFakeTimers()`.
```typescript
const expiredProvider = await createTestProviderAccount(tenantId, userId, {
  tokenExpiresAt: new Date(Date.now() - 60000), // 1 minute ago
  accessToken: encryptedToken,
  refreshToken: encryptedRefreshToken,
});
```

### Anti-Patterns to Avoid
- **Mocking Prisma:** User requirement — all tests use real DB. Never mock Prisma.
- **Table truncation in beforeEach:** Slow and unnecessary; use targeted cleanup per factory-returned ID.
- **NestJS Test.createTestingModule():** Deemed too slow and fragile; direct instantiation only.
- **jest.useFakeTimers() for token expiry:** Chosen alternative is past-`expiresAt` timestamps (CONTEXT.md decision).
- **Calling ICS parser with mocked node-ical output:** Tests must use real `.ics` string fixtures.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis distributed locking | Custom lock polling | Real ioredis SET NX EX (via ContactsCacheService.acquireSyncLock) | Already implemented, test the real thing |
| ICS fixture generation | Template string builder | Inline `.ics` strings in test fixtures | node-ical parses text; building programmatically misses encoding nuances |
| OAuth token encryption | Test-specific encrypt | `CryptoService` from production code | CryptoService already has encrypt/decrypt; use it to create factory data |
| BullMQ job assertions | Re-implement job structure | Mock the Queue and assert `queue.add` args | addSyncJob's deduplication logic is the thing being tested |

---

## Common Pitfalls

### Pitfall 1: cleanup.ts Missing New Tables
**What goes wrong:** Tests create rows in `calendar_events`, `unified_contacts`, `provider_configs`, `subscriptions`, `webhook_subscriptions` — `cleanupTestData()` does not truncate these tables. Rows accumulate across test runs, causing unique constraint violations and false positives.
**Why it happens:** cleanup.ts was written for Phase 67 which only touched `user_labels` and `tenants`.
**How to avoid:** FIRST task in every plan should extend the TRUNCATE list in `cleanup.ts`.
**New tables to add:**
```sql
"calendar_events",
"calendar_sync_states",
"calendar_event_attachments",
"calendar_preferences",
"webhook_subscriptions",
"unified_contacts",
"provider_contacts",
"provider_configs",
"subscriptions"
```
**Warning signs:** `UniqueConstraintViolation` on `providerConfig.tenantId_email_providerType` or `subscription.tenantId` in test runs.

### Pitfall 2: IcsParserService — async/sync confusion
**What goes wrong:** `IcsParserService.parseIcs()` is async (calls `ical.async.parseICS`). Forgetting `await` returns a Promise object, causing assertions to always pass.
**Why it happens:** node-ical has both sync and async APIs; the service uses async.
**How to avoid:** All test assertions must `await service.parseIcs(icsContent)`.

### Pitfall 3: RelationshipScoreService — Raw SQL table name
**What goes wrong:** `RelationshipScoreService.getRelationshipScores()` queries `"unified_contacts"` via `$queryRaw`. If test contacts are inserted into the wrong model (e.g., `prisma.contact.create` which maps to `unified_contacts`), this works. But if the view name differs, tests fail.
**How to avoid:** `Contact` model maps to `"unified_contacts"` table (confirmed from schema). `createTestContact()` should use `prisma.contact.create`.

### Pitfall 4: CacheService vs RedisConnectionService
**What goes wrong:** `UsageTrackingService` depends on `CacheService` (which uses `redis` node-redis client via `onModuleInit`). `ContactsCacheService` depends on `RedisConnectionService` (ioredis). These are different Redis clients — different connection setup for tests.
**Why it happens:** The codebase has two Redis client wrappers for different use cases.
**How to avoid:**
- For `ContactsCacheService` tests: inject raw ioredis client directly into `service['redis']`
- For `UsageTrackingService` tests: must instantiate `CacheService` fully or mock it with `{ get: jest.fn(), set: jest.fn(), incrBy: jest.fn(), incrByFloat: jest.fn(), del: jest.fn() }`. Using a real `CacheService` in tests requires calling `onModuleInit()` manually.

### Pitfall 5: ProviderConfigService — `@Inject(BETTER_AUTH)` dependency
**What goes wrong:** `ProviderConfigService` has `@Inject(BETTER_AUTH) private readonly auth: any` — this token cannot be resolved with `new ProviderConfigService(...)` without providing a mock.
**How to avoid:** Pass `jest.fn()` as the last constructor argument. The `autoConnectSocialProvider` method calls `this.auth.api.refreshToken` but other methods (connectGoogleProvider, deleteProviderConfig) do not use it.

### Pitfall 6: GoogleCalendarSyncService — abstract class instantiation
**What goes wrong:** `GoogleCalendarSyncService extends AbstractCalendarSyncService`. The abstract base calls `configService.get()` in constructor. Tests must supply a mock ConfigService.
**How to avoid:**
```typescript
const mockConfig = { get: jest.fn().mockImplementation((key, def) => def) };
const service = new GoogleCalendarSyncService(
  prisma as any, mockProviderToken, mockRealtime, mockConfig as any, mockRedisLock
);
```

### Pitfall 7: Import path depth from __tests__ dir
**What goes wrong:** Plans from Phase 67 consistently showed wrong relative path depth. The actual depth from `src/modules/*/services/__tests__/` to `test/helpers/` is 5 levels up (`'../../../../../test/helpers/...'`), not 6.
**Why it happens:** Template showed 6 levels but the actual directory nesting is 5.
**How to avoid:** Use `'../../../../../test/helpers/prisma-test-client'` for all specs in `src/modules/*/services/__tests__/`.

---

## Code Examples

### Factory: createTestCalendarEvent
```typescript
// Add to backend/test/helpers/factories.ts
import type { CalendarEvent } from '@prisma/client';

export async function createTestCalendarEvent(
  tenantId: string,
  providerId: string,
  overrides: Partial<{
    title: string;
    startTime: Date;
    endTime: Date;
    isCancelled: boolean;
    isDeleted: boolean;
    externalId: string;
    calendarId: string;
  }> = {},
): Promise<CalendarEvent> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  const now = new Date();
  return prisma.calendarEvent.create({
    data: {
      tenantId,
      providerId,
      externalId: overrides.externalId ?? `ext-event-${uid}`,
      calendarId: overrides.calendarId ?? `calendar-${uid}`,
      calendarName: 'Test Calendar',
      title: overrides.title ?? `Test Event ${uid}`,
      startTime: overrides.startTime ?? now,
      endTime: overrides.endTime ?? new Date(now.getTime() + 3600000),
      isCancelled: overrides.isCancelled ?? false,
      isDeleted: overrides.isDeleted ?? false,
      timeZone: 'UTC',
      isAllDay: false,
      lastSyncedAt: now,
    },
  });
}
```

### Factory: createTestContact
```typescript
export async function createTestContact(
  tenantId: string,
  overrides: Partial<{
    displayName: string;
    emails: Array<{ value: string; type: string }>;
    totalInteractions: number;
    sentCount: number;
    receivedCount: number;
    lastInteractedAt: Date | null;
  }> = {},
): Promise<any> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  return prisma.contact.create({
    data: {
      tenantId,
      displayName: overrides.displayName ?? `Test Contact ${uid}`,
      emails: overrides.emails
        ? (overrides.emails as any)
        : [{ value: `contact-${uid}@test.local`, type: 'work' }],
      totalInteractions: overrides.totalInteractions ?? 0,
      sentCount: overrides.sentCount ?? 0,
      receivedCount: overrides.receivedCount ?? 0,
      lastInteractedAt: overrides.lastInteractedAt ?? null,
      isDeleted: false,
    },
  });
}
```

### Factory: createTestProviderAccount
```typescript
export async function createTestProviderAccount(
  tenantId: string,
  userId: string,
  overrides: Partial<{
    providerType: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date | null;
    supportsCalendar: boolean;
    supportsContacts: boolean;
  }> = {},
): Promise<any> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  return prisma.providerConfig.create({
    data: {
      tenantId,
      userId,
      providerType: overrides.providerType ?? 'google',
      email: overrides.email ?? `provider-${uid}@test.local`,
      supportsEmail: true,
      supportsCalendar: overrides.supportsCalendar ?? true,
      supportsContacts: overrides.supportsContacts ?? true,
      accessToken: overrides.accessToken ?? 'test-access-token',
      tokenEncryptionIv: 'test-iv',
      refreshToken: overrides.refreshToken ?? null,
      tokenExpiresAt: overrides.tokenExpiresAt ?? new Date(Date.now() + 3600000),
      isActive: true,
      isDefault: false,
    },
  });
}
```

### Factory: createTestSubscription
```typescript
export async function createTestSubscription(
  tenantId: string,
  overrides: Partial<{
    plan: string;
    status: string;
    monthlyEmailLimit: number;
    monthlyAICallLimit: number;
    emailsProcessed: number;
    aiCallsUsed: number;
  }> = {},
): Promise<any> {
  const prisma = getTestPrismaClient();
  return prisma.subscription.create({
    data: {
      tenantId,
      plan: (overrides.plan as any) ?? 'FREE',
      status: (overrides.status as any) ?? 'ACTIVE',
      monthlyEmailLimit: overrides.monthlyEmailLimit ?? 100,
      monthlyAICallLimit: overrides.monthlyAICallLimit ?? 50,
      maxUsers: 1,
      emailsProcessed: overrides.emailsProcessed ?? 0,
      aiCallsUsed: overrides.aiCallsUsed ?? 0,
      usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    },
  });
}
```

### ICS Fixture: Recurring Event with RRULE
```typescript
// Place inline in spec or in test/fixtures/ics/
const DAILY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:daily-recur-001@test.local
DTSTART;TZID=America/New_York:20260315T090000
DTEND;TZID=America/New_York:20260315T100000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Daily Standup
ORGANIZER;CN=Alice:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:allday-001@test.local
DTSTART;VALUE=DATE:20260315
DTEND;VALUE=DATE:20260316
SUMMARY:All Day Event
ORGANIZER:mailto:alice@test.local
END:VEVENT
END:VCALENDAR`;
```

### CalendarConflictService — Conflict Test Pattern
```typescript
it('detects hard conflict when one event fully contains another', async () => {
  const now = new Date();
  const eventA = await createTestCalendarEvent(tenant.id, provider.id, {
    title: 'Outer Event',
    startTime: new Date(now.getTime() + 3600000),
    endTime: new Date(now.getTime() + 7200000),   // 1h to 2h from now
  });
  const eventB = await createTestCalendarEvent(tenant.id, provider.id, {
    title: 'Inner Event',
    startTime: new Date(now.getTime() + 4200000),
    endTime: new Date(now.getTime() + 5400000),   // 1h10m to 1h30m from now (inside A)
  });

  const conflicts = await service.detectConflicts(tenant.id, {
    startDate: now,
    endDate: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
  });

  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].severity).toBe('hard');
});
```

---

## Prisma Model → Table Name Reference

| Prisma Model | Table Name | Notes |
|---|---|---|
| `CalendarEvent` | `calendar_events` | Add to cleanup.ts TRUNCATE |
| `CalendarSyncState` | `calendar_sync_states` | Add to cleanup.ts TRUNCATE |
| `CalendarEventAttachment` | `calendar_event_attachments` | Add to cleanup.ts TRUNCATE |
| `Contact` | `unified_contacts` | Add to cleanup.ts TRUNCATE |
| `ProviderContact` | `provider_contacts` | Add to cleanup.ts TRUNCATE |
| `ProviderConfig` | `provider_configs` | Add to cleanup.ts TRUNCATE |
| `WebhookSubscription` | `webhook_subscriptions` | Add to cleanup.ts TRUNCATE |
| `Subscription` | `subscriptions` | Add to cleanup.ts TRUNCATE |
| `CalendarPreference` (if used) | `calendar_preferences` | Optional, add if tests create rows |

---

## Service Dependency Map

### 68-01: Calendar Module

| Service | Constructor Dependencies | Mock Strategy |
|---------|--------------------------|---------------|
| `CalendarConflictService` | `PrismaService` | Direct `new CalendarConflictService(prisma)` |
| `IcsParserService` | none | Direct `new IcsParserService()` |
| `GoogleCalendarSyncService` | `PrismaService`, `ProviderTokenService`, `RealtimeEventsService`, `ConfigService`, `RedisLockService` | Mock all except Prisma; mock ConfigService with `get(key, def) => def` |
| `GoogleCalendarWebhookService` | `PrismaService`, `CryptoService`, `ConfigService`, `CalendarSyncQueueService` | Mock all except Prisma; mock `calendarSyncQueue.addSyncJob` |

### 68-02: Contacts Module

| Service | Constructor Dependencies | Mock Strategy |
|---------|--------------------------|---------------|
| `ContactSyncService` | `PrismaService`, `GoogleContactsSyncService`, `MicrosoftContactsSyncService`, `ContactsCacheService`, `ContactsImportService`, `ContactCrudService` | Mock all except Prisma |
| `RelationshipScoreService` | `PrismaService`, `HashSearchService` | `HashSearchService` wraps `TenantKeyService` — either mock `HashSearchService` entirely OR construct it with mocked `TenantKeyService` |
| `ContactsCacheService` | `ConfigService`, `RedisConnectionService` | Construct with mocked ConfigService; inject real ioredis into `service['redis']` after `onModuleInit` bypass |
| `GoogleContactsWebhookService` | `PrismaService`, `CryptoService`, `ConfigService`, `GoogleContactsSyncService`, `ContactsSyncQueueService` | Mock all except Prisma |

### 68-03: Providers Module

| Service | Constructor Dependencies | Mock Strategy |
|---------|--------------------------|---------------|
| `GoogleOAuthService` | `PrismaService`, `CryptoService` | Direct instantiation; mock `oauth2Client` methods via `jest.spyOn(OAuth2Client.prototype, ...)` |
| `ProviderConfigService` | `PrismaService`, `CryptoService`, `GoogleOAuthService`, `MicrosoftOAuthService`, `ImapService`, `CalDavService`, `SubscriptionService`, `EventEmitter2`, `auth (BETTER_AUTH)` | Mock all non-Prisma; auth = `{ api: { refreshToken: jest.fn(), getAccessToken: jest.fn() } }` |
| `ImapService` | none | Direct `new ImapService()`; mock ImapFlow via `jest.mock('imapflow')` |

### 68-04: Subscription Module

| Service | Constructor Dependencies | Mock Strategy |
|---------|--------------------------|---------------|
| `SubscriptionService` | `PrismaService`, `UsageTrackingService` | Mock `UsageTrackingService`; use real Prisma |
| `UsageTrackingService` | `CacheService` | Mock `CacheService` with `{ get, set, del, incrBy, incrByFloat }` all `jest.fn()` — tests verify atomic counter behavior via mocked return values |
| `SubscriptionLifecycleService` | `PrismaService`, `UsageTrackingService`, `SubscriptionService`, `ScheduledJobsQueueService` | Mock UsageTracking and ScheduledJobsQueueService; use real Prisma |
| `QuotaGuard` | `Reflector`, `SubscriptionService`, `UsageTrackingService`, `CostProtectionService` | All mocked; test via `canActivate(mockContext)` |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Mocked Prisma in unit tests | Real PostgreSQL test database | Phase 66 decision | Tests catch real DB constraint violations |
| `Test.createTestingModule()` per spec | Direct `new Service(...)` constructor | Phase 66/67 decision | 10x faster, no DI overhead |
| `jest.useFakeTimers()` for time-sensitive tests | Real `expiresAt` timestamps in DB | Phase 68 decision | Avoids timer interactions with async Redis ops |
| `jest.mock('ioredis')` (health service) | Real Redis for cache-dependent services | Phase 68 extension | ContactsCacheService tests prove lock/cache behavior |

---

## Open Questions

1. **HashSearchService for RelationshipScoreService tests**
   - What we know: `RelationshipScoreService` calls `hashSearchService.buildExactSenderFilter()` which uses `TenantKeyService.getHmacKey()`. The HMAC key derivation requires a real tenant key.
   - What's unclear: Whether the test HMAC key setup from Phase 66 covers this, or whether `HashSearchService` should be fully mocked.
   - Recommendation: Mock `HashSearchService` entirely with `{ buildExactSenderFilter: jest.fn().mockReturnValue({ OR: [{ from: { in: emails } }] }) }` — this avoids key setup complexity and keeps the test focused on scoring logic, not HMAC.

2. **GoogleOAuthService — constructor reads config at init time**
   - What we know: `GoogleOAuthService` constructor calls `getConfiguration()` and builds `oauth2Client` with real OAuth credentials from config.
   - What's unclear: Whether test environment has valid OAuth client ID/secret in `.env.test`.
   - Recommendation: The `oauth2Client` is used only for `refreshAccessToken`. Since we mock `OAuth2Client.prototype.refreshAccessToken`, the actual credentials don't matter. Verify `.env.test` has placeholder values for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

3. **CacheService for UsageTrackingService tests**
   - What we know: `CacheService.onModuleInit()` connects to Redis at node-redis level (separate from ioredis). The Phase 66 test infrastructure uses ioredis.
   - Recommendation: Mock `CacheService` for `UsageTrackingService` tests rather than using the real service — the node-redis connection setup has different lifecycle than ioredis. This is the cleanest boundary.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 with ts-jest 29.4.6 |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="68" --no-coverage` |
| Full suite command | `cd backend && npx jest --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BTEST-01 | Calendar conflict detection (hard/soft/no conflict) | integration | `npx jest calendar-conflict.service.spec.ts -t "conflict"` | Wave 0 |
| BTEST-01 | ICS parsing — all RRULE frequencies, all-day, timezone | unit | `npx jest ics-parser.service.spec.ts` | Wave 0 |
| BTEST-01 | Calendar sync triggers DB upsert, emits realtime event | integration | `npx jest google-calendar-sync.service.spec.ts` | Wave 0 |
| BTEST-01 | Calendar webhook routes notification to queue sync | integration | `npx jest google-calendar-webhook.service.spec.ts` | Wave 0 |
| BTEST-02 | Contact sync flow — lock acquired, providers called, cache invalidated | integration | `npx jest contact-sync.service.spec.ts` | Wave 0 |
| BTEST-02 | CRM scoring algorithm — recency/frequency/reciprocity/trend math | integration | `npx jest relationship-score.service.spec.ts` | Wave 0 |
| BTEST-02 | Redis cache set/get/invalidate/lock behavior | integration | `npx jest contacts-cache.service.spec.ts` | Wave 0 |
| BTEST-02 | Contacts webhook — polling interval gate, queue dispatch | integration | `npx jest google-contacts-webhook.service.spec.ts` | Wave 0 |
| BTEST-03 | OAuth token exchange success and failure paths | integration | `npx jest google-oauth.service.spec.ts` | Wave 0 |
| BTEST-03 | Token refresh — expired triggers blocking refresh, near-expiry triggers background refresh | integration | `npx jest google-oauth.service.spec.ts -t "refresh"` | Wave 0 |
| BTEST-03 | Token revocation — success, already-invalid (400), network error | integration | `npx jest google-oauth.service.spec.ts -t "revoke"` | Wave 0 |
| BTEST-03 | IMAP config validation — test connection success/failure | integration | `npx jest imap.service.spec.ts` | Wave 0 |
| BTEST-03 | Provider connect — enforces plan limit, encrypts tokens, emits event | integration | `npx jest provider-config.service.spec.ts` | Wave 0 |
| BTEST-04 | Subscription get-or-create — creates FREE plan on first call | integration | `npx jest subscription.service.spec.ts` | Wave 0 |
| BTEST-04 | Plan transitions FREE→STARTER→PROFESSIONAL→ENTERPRISE | integration | `npx jest subscription.service.spec.ts -t "updatePlan"` | Wave 0 |
| BTEST-04 | Usage tracking increments — atomic counter behavior | unit | `npx jest usage-tracking.service.spec.ts` | Wave 0 |
| BTEST-04 | QuotaGuard — rejects CANCELED/PAST_DUE, enforces email and AI quotas | unit | `npx jest quota.guard.spec.ts` | Wave 0 |
| BTEST-04 | Lifecycle — expired trials downgraded, past-due past grace period downgraded | integration | `npx jest subscription-lifecycle.service.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="(calendar|contacts|providers|subscription).*spec" --no-coverage`
- **Per wave merge:** `cd backend && npx jest --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/calendar/services/__tests__/calendar-conflict.service.spec.ts` — covers BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/ics-parser.service.spec.ts` — covers BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/google-calendar-sync.service.spec.ts` — covers BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/google-calendar-webhook.service.spec.ts` — covers BTEST-01
- [ ] `backend/src/modules/contacts/services/__tests__/contact-sync.service.spec.ts` — covers BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/relationship-score.service.spec.ts` — covers BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/contacts-cache.service.spec.ts` — covers BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/google-contacts-webhook.service.spec.ts` — covers BTEST-02
- [ ] `backend/src/modules/providers/services/__tests__/google-oauth.service.spec.ts` — covers BTEST-03
- [ ] `backend/src/modules/providers/services/__tests__/provider-config.service.spec.ts` — covers BTEST-03
- [ ] `backend/src/modules/providers/services/__tests__/imap.service.spec.ts` — covers BTEST-03
- [ ] `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` — covers BTEST-04
- [ ] `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts` — covers BTEST-04
- [ ] `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` — covers BTEST-04
- [ ] `backend/src/modules/subscription/guards/__tests__/quota.guard.spec.ts` — covers BTEST-04
- [ ] Extend `backend/test/helpers/factories.ts` with 4 new factories
- [ ] Extend `backend/test/helpers/cleanup.ts` TRUNCATE list with 9 new tables

---

## Sources

### Primary (HIGH confidence)
- Direct source file reads: all 16 target service files, factories.ts, cleanup.ts, prisma-test-client.ts, labels.service.spec.ts (Phase 67 pattern), jest.config.js, schema.prisma
- Package.json dependency scan: confirmed installed versions and nock absence

### Secondary (MEDIUM confidence)
- Phase 67 STATE.md accumulated context (import path corrections: 5 levels up not 6)
- CONTEXT.md decisions (locked choices from user discussion)

### Tertiary (LOW confidence)
- None — all findings sourced directly from codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read directly from package.json
- Architecture: HIGH — patterns read from Phase 67 spec files and source files
- Pitfalls: HIGH — identified from direct source code inspection
- Service dependency map: HIGH — constructor signatures read from source

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable test infrastructure)
