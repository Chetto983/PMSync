# Phase 68: Backend Tests - Complex Modules - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Write integration tests for calendar, contacts, providers, and subscription modules against a real PostgreSQL and Redis test database. Tests prove security-sensitive and business-critical flows are correct. External provider APIs (Google, Microsoft) are mocked at the service adapter level or HTTP level as appropriate. This is a test-writing phase — no new feature code.

</domain>

<decisions>
## Implementation Decisions

### External API mocking strategy
- Calendar and Contacts: mock at **service adapter class level** using `jest.fn()` (e.g., mock `GoogleCalendarSyncService`, `MicrosoftCalendarSyncService`, `GoogleContactsSyncService`, `MicrosoftContactsSyncService` as constructor dependencies)
- Consistent with Phase 67 pattern — no extra HTTP mocking library for these modules
- Providers module (OAuth flows): mock at **HTTP level using nock** — intercept Google/Microsoft token endpoints to test token parsing, storage, expiry handling, and error paths with realistic HTTP responses
- Redis/cache: use **real Redis test instance** (from Phase 66 infra) for `ContactsCacheService` and any calendar cache tests

### Queue/worker scope
- BullMQ workers (CalendarSyncQueueService, ContactsSyncQueueService): test **by calling `processJob()` directly** on the worker with a mock job object
- Assert that the correct service methods are called and correct outcomes occur (rows inserted/updated, events emitted)
- Also assert that services correctly enqueue jobs with the right type and payload (mock the Queue)

### Factory strategy
- Add new factory helpers to **shared `test/helpers/factories.ts`** — reusable across Phase 69 integration tests
- New factories needed: `createTestCalendarEvent()`, `createTestContact()`, `createTestProviderAccount()`, `createTestSubscription()`
- Cleanup strategy: **per-factory tracking with targeted cleanup** — factories return IDs; each spec tracks created IDs and deletes them specifically (not full table truncation, which would break parallel suites)
- Global `cleanupTestData()` remains as final safety net in `afterAll`

### Plan organization
- **1 plan per module = 4 plans total**
  - 68-01: Calendar module tests (sync lifecycle, webhook processing, conflict resolution, ICS parsing)
  - 68-02: Contacts module tests (sync flow, CRM relationship scoring, cache invalidation, webhook processing)
  - 68-03: Providers module tests (OAuth acquire/refresh/revocation, IMAP config validation, token lifecycle)
  - 68-04: Subscription module tests (billing state transitions, quota calculation, usage tracking, QuotaGuard rejection)

### ICS parsing and OAuth coverage depth
- **Exhaustive edge case matrix** — not just happy path
- ICS parsing: cover all RRULE frequencies (DAILY, WEEKLY, MONTHLY, YEARLY), DST transitions, leap year edge cases, all-day events, timezone offset variants
- OAuth: cover every error code path — token acquire success/failure, refresh with expired token, refresh with invalid token, revocation success, revocation with already-revoked token, network errors

### Claude's Discretion
- Exact nock scope setup for OAuth (which base URLs to intercept)
- Whether to use `jest.useFakeTimers()` for token expiry testing or insert rows with past `expiresAt` timestamps
- Order of test cases within each describe block
- Exact Prisma model field values in factory defaults

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/helpers/factories.ts`: `createTestTenant()`, `createTestUser()`, `createTestSession()`, `createTestLabel()` — extend here with phase 68 factories
- `test/helpers/cleanup.ts`: `cleanupTestData()` — truncates all tables; supplement with per-factory targeted cleanup
- `test/helpers/prisma-test-client.ts`: `getTestPrismaClient()` — real Prisma client pointing to test DB
- Phase 67 spec pattern (`labels.service.spec.ts`): `new Service(prisma, mock1, mock2)` constructor instantiation — replicate for all 4 modules
- Phase 66 infra: real PostgreSQL + Redis test instances available via Docker Compose; `globalSetup`/`globalTeardown` already configured

### Established Patterns
- Direct service instantiation (no NestJS `Test.createTestingModule()`)
- `jest.fn()` for all non-Prisma, non-Redis dependencies
- `beforeAll`: create service instance
- `beforeEach`: `jest.clearAllMocks()`
- `afterAll`: cleanup
- Tenant-scoped data: every factory requires `tenantId` — tests prove multi-tenant isolation

### Integration Points
- Calendar services in `backend/src/modules/calendar/services/` — 12+ services; focus on: `CalendarService`, `CalendarConflictService`, `IcsParserService`, `GoogleCalendarSyncService`, `GoogleCalendarWebhookService`
- Contacts services in `backend/src/modules/contacts/services/` — focus on: `ContactSyncService`, `RelationshipScoreService`, `ContactsCacheService`, `GoogleContactsWebhookService`
- Providers services in `backend/src/modules/providers/services/` — focus on: `GoogleOAuthService`, `MicrosoftOAuthService`, `ProviderConfigService`, `ImapService`
- Subscription services in `backend/src/modules/subscription/services/` — focus on: `SubscriptionService`, `SubscriptionLifecycleService`, `UsageTrackingService`, `QuotaGuard`
- Cleanup table list in `cleanup.ts` does NOT yet include calendar/contacts/provider/subscription tables — must extend TRUNCATE list

</code_context>

<specifics>
## Specific Ideas

- For OAuth tests, insert rows with past `expiresAt` timestamps to simulate expiry rather than mocking timers — cleaner and doesn't interfere with other timing logic
- ICS parsing tests should use real `.ics` fixture strings (inline or from `test/fixtures/`) — not mocked parser output
- The `cleanup.ts` TRUNCATE list needs calendar_events, contacts, provider_accounts, subscriptions, usage_records tables added — researcher should verify exact Prisma model names

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 68-backend-tests-complex-modules*
*Context gathered: 2026-03-11*
