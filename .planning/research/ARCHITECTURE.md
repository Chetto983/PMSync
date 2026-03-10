# Architecture Patterns: Test Infrastructure for PMSync v5.1

**Domain:** Deep test coverage for NestJS + Next.js multi-tenant email platform
**Researched:** 2026-03-10
**Overall confidence:** HIGH (based on existing codebase patterns + established testing libraries)

## Current Test Infrastructure Inventory

### What Exists

| Layer | Runner | Count | Pattern |
|-------|--------|-------|---------|
| Backend unit (.spec.ts) | Jest + ts-jest | ~80 files | NestJS `Test.createTestingModule` with manual mocks |
| Backend integration (.spec.ts) | Jest | 4 files | Real Redis/Prisma, skip-on-unavailable |
| Backend AI pipeline (.test.ts) | Vitest + MSW | 8 files | MSW streaming handlers, no real API |
| Backend contract (.spec.ts) | Jest | 5 files | OpenAPI spec validation |
| Frontend unit (.test.ts/.tsx) | Jest + jsdom | 5 files | @testing-library/react, manual mocks |
| Frontend E2E (.spec.ts) | Playwright | 12 specs + 1 setup | Route interception, auth cookie injection |

### What is Missing

| Gap | Impact | Priority |
|-----|--------|----------|
| Backend: calendar, labels, providers, subscription, tenants, users, health modules | Zero test coverage on 7/16 modules | HIGH |
| Frontend: hooks/queries/* unit tests | TanStack Query hooks untested | HIGH |
| Frontend: Zustand store tests | State management logic untested | HIGH |
| Frontend: MUI component rendering tests | No visual regression at unit level | MEDIUM |
| Backend: BullMQ worker tests | 7 workers with zero unit tests | HIGH |
| Backend: AI tool tests (individual) | ~20 injectable tools untested as units | MEDIUM |
| Frontend: org/admin/security E2E | v5.0 features with zero E2E coverage | HIGH |

## Recommended Architecture

### Test Pyramid for This Stack

```
                    /\
                   /  \     Playwright E2E (12 existing + ~8 new)
                  /    \    Full browser, mocked API, auth cookie injection
                 /------\
                /        \  Integration (4 existing + ~6 new)
               /          \ Real Redis/Prisma, skip-on-unavailable
              /------------\
             /              \ Vitest AI pipeline (8 existing + ~4 new)
            /                \ MSW streaming, deterministic AI responses
           /------------------\
          /                    \ Jest backend unit (~80 existing + ~60 new)
         /                      \ NestJS TestingModule, manual Prisma mocks
        /------------------------\
       /                          \ Frontend Jest unit (~5 existing + ~25 new)
      /                            \ RTL, mock hooks, Zustand store tests
     /------------------------------\
```

**Target ratio:** 60% unit : 20% integration/pipeline : 15% E2E : 5% contract

### Dual Runner Strategy (Keep It -- Do NOT Consolidate)

The codebase already splits cleanly:

- **Jest** (.spec.ts): NestJS unit tests, contract tests, frontend unit tests. CJS-compatible, NestJS Testing module works natively.
- **Vitest** (.test.ts): AI pipeline tests requiring MSW + ESM streaming. SWC plugin handles decorators.

Do NOT consolidate runners. The split is intentional: Jest handles NestJS DI well; Vitest handles ESM-only MSW/AI SDK streaming. Mixing causes transform hell.

## Component Boundaries

### Backend Test Utilities (New -- to be created)

| Utility | Location | Purpose |
|---------|----------|---------|
| `createMockPrisma()` | `backend/test/helpers/mock-prisma.ts` | Typed Prisma mock factory replacing per-file manual mocks |
| `createMockUser()` | `backend/test/helpers/mock-auth.ts` | Standard tenant-scoped user with better-auth session |
| `createMockExecutionContext()` | `backend/test/helpers/mock-context.ts` | NestJS ExecutionContext with request.user pre-populated |
| `createMockJob()` | `backend/test/helpers/mock-bullmq.ts` | BullMQ Job mock for worker testing |
| `createMockSocket()` | `backend/test/helpers/mock-socket.ts` | Socket.IO client mock for realtime testing |

### Frontend Test Utilities (New -- to be created)

| Utility | Location | Purpose |
|---------|----------|---------|
| `renderWithProviders()` | `frontend/test/helpers/render.tsx` | MUI ThemeProvider + QueryProvider + Zustand wrapper |
| `createMockSession()` | `frontend/test/helpers/mock-session.ts` | better-auth session mock for hook/component tests |
| `mockApiRoute()` | `frontend/test/helpers/mock-api.ts` | axios-mock-adapter convenience wrapper |

### Existing Utilities (Keep -- Already Working)

| Utility | Location | Used By |
|---------|----------|---------|
| `contract-helpers.ts` | `backend/test/contract/` | All 5 contract tests |
| `msw-handlers/` | `backend/src/test/msw-handlers/` | AI pipeline Vitest tests |
| `fixtures.ts` | `frontend/e2e/` | All Playwright E2E specs |
| `auth.setup.ts` | `frontend/e2e/` | Playwright auth state bootstrapping |
| `better-auth-node.mock.ts` | `backend/test/mocks/` | Jest moduleNameMapper for ESM boundary |

## Patterns to Follow

### Pattern 1: Multi-Tenant Prisma Query Testing

Every Prisma service test MUST verify tenant isolation. The existing pattern (email-crud.service.spec.ts) is the canonical reference.

**What:** Mock PrismaService with jest.fn() for each model method. Verify every query includes `tenantId` in the `where` clause.

**When:** Every service that touches the database (all 7 untested modules).

**Example (follow email-crud.service.spec.ts exactly):**
```typescript
const mockPrismaService = {
  calendar: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

// In test -- verify tenantId is ALWAYS in the where clause:
expect(prisma.calendar.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({ tenantId: 'tenant-1' }),
  }),
);
```

**Critical:** The tenant-scoping extension (tested in tenant-scoping.extension.spec.ts) provides runtime enforcement via AsyncLocalStorage, but unit tests operate OUTSIDE that context. A service that forgets tenantId would pass unit tests but rely on runtime injection -- masking the bug until `withoutTenantScoping()` is used in migration scripts or raw queries. Test the service's intent explicitly.

### Pattern 2: better-auth Session Mocking

The existing pattern (better-auth.guard.spec.ts) is the canonical reference.

**What:** Mock the BETTER_AUTH injection token with `{ api: { getSession: jest.fn() } }`. Mock the ESM module BEFORE importing the class under test.

**When:** Any guard, controller, or service test that needs authenticated context.

**Example (follow better-auth.guard.spec.ts exactly):**
```typescript
// MUST mock before importing -- better-auth is ESM-only
jest.mock('../better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

const mockAuth = {
  api: {
    getSession: jest.fn().mockResolvedValue({
      session: { id: 'sess-1', activeOrganizationId: 'tenant-1' },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        tenantId: 'tenant-1',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        isActive: true,
      },
    }),
  },
};
```

**Critical:** Always mock `better-auth.module` with `jest.mock()` BEFORE importing the guard/service. The real module is ESM and causes Jest transform failures. The existing `backend/test/mocks/better-auth-node.mock.ts` handles the `better-auth/node` import via moduleNameMapper.

### Pattern 3: BullMQ Worker Testing

Workers extend `BaseWorker` which handles Redis lifecycle. Unit tests should NOT spin up Redis.

**What:** Test the job processing logic in isolation by creating fake Job objects and mocking service dependencies.

**When:** All 7 workers (sync, sync-back, folder-ops, email-send, bulk-ops, contacts-sync, calendar-sync).

**Example:**
```typescript
const mockJob = {
  id: 'job-1',
  name: 'sync-emails',
  data: {
    tenantId: 'tenant-1',
    providerId: 'provider-1',
    operation: 'full-sync',
  },
  attemptsMade: 0,
  updateProgress: jest.fn(),
  log: jest.fn(),
  moveToFailed: jest.fn(),
} as unknown as Job;

// Test the processing method directly -- skip Worker constructor (needs Redis)
// Option A: If worker exposes a processJob method, call it directly
// Option B: Extract processing logic into a testable service
await workerService.handleSyncJob(mockJob);

expect(mockSyncService.syncEmails).toHaveBeenCalledWith(
  expect.objectContaining({ tenantId: 'tenant-1' }),
);
```

**Key insight:** The `BaseWorker` constructor creates a BullMQ `Worker` instance which requires Redis. Two strategies:
1. **Extract processing logic** into a separate `@Injectable()` service that the worker calls. Test the service, not the worker lifecycle.
2. **Mock the Worker constructor** and test the callback passed to it.

Strategy 1 is preferred because it follows existing NestJS patterns and makes the logic independently testable.

### Pattern 4: WebSocket / Realtime Testing

Two tiers exist and should continue:

**Unit tier** (existing in realtime-handshake.cookie.spec.ts):
- Direct instantiation of service with mocked dependencies
- Mock `BETTER_AUTH`, PrismaService, RealtimeAuthTokenService
- Test authentication logic, room assignment, tenant isolation
- No actual Socket.IO server

**Integration tier** (existing in realtime-redis-adapter.spec.ts):
- Real Socket.IO servers with Redis adapter
- Tests cross-instance message delivery and room isolation
- Skips gracefully when Redis unavailable: `if (!redisAvailable) return;`

**New tests needed:**
- RealtimeEventsService unit tests: verify correct events emitted to correct tenant rooms
- WebSocket reconnection behavior after org switch

### Pattern 5: AI SDK Mocking (Vitest + MSW)

The existing MSW pattern (chat-pipeline-msw.test.ts) is the gold standard.

**What:** MSW intercepts HTTP calls to Mistral API, returns deterministic streaming/non-streaming responses. Vitest runs these because MSW v2 requires ESM.

**When:** Testing AI pipeline logic (intent routing, tool selection, HITL triggers, PII handling).

**DO NOT test AI pipeline with Jest.** MSW + streaming requires ESM module resolution that Vitest handles natively via SWC plugin.

**Example (existing -- follow chat-pipeline-msw.test.ts):**
```typescript
import { setupServer } from 'msw/node';
import { mistralChatHandler, mistralEmbedHandler } from '../../../test/msw-handlers';

const server = setupServer(mistralChatHandler, mistralEmbedHandler);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**New tests needed:**
- Individual tool unit tests (Jest, NOT Vitest -- tools are plain @Injectable NestJS classes with no ESM dependency)
- Tool registry integration (verify all ~20 tools register and are discoverable)
- Rate limiter edge cases in AI pipeline

### Pattern 6: MUI Component Testing (Frontend)

**What:** Use @testing-library/react with MUI ThemeProvider wrapper. Test rendering, accessibility, interaction.

**When:** Critical components. Focus on components that were migrated from shadcn/Radix in v5.0 (highest risk of inconsistency).

**Example:**
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@/lib/theme';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={theme}>{ui}</ThemeProvider>
  );
}

it('renders email list item with sender name', () => {
  renderWithTheme(<EmailListItem email={mockEmail} />);
  expect(screen.getByText('Alice Smith')).toBeInTheDocument();
});

it('calls onSelect when clicked', async () => {
  const onSelect = jest.fn();
  renderWithTheme(<EmailListItem email={mockEmail} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('listitem'));
  expect(onSelect).toHaveBeenCalledWith('email-1');
});
```

**Key:** Do NOT test MUI internals (popover positioning, animation timing, ripple effects). Test that YOUR component renders the right content and responds to user interaction correctly.

### Pattern 7: TanStack Query Hook Testing

**What:** Use `renderHook` with `QueryProvider` wrapper. Mock the underlying API module (not axios directly).

**When:** All hooks in `frontend/hooks/queries/`.

**Example (follow query-client.test.tsx pattern):**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '@/lib/query-client';
import { useEmails } from '@/hooks/queries/use-emails';

jest.mock('@/lib/api/emails', () => ({
  emailsApi: {
    list: jest.fn().mockResolvedValue({
      data: { emails: mockEmails, pagination: { total: 3, page: 1, limit: 50 } },
    }),
  },
}));

it('fetches emails and returns data', async () => {
  const { result } = renderHook(() => useEmails({ folder: 'INBOX' }), {
    wrapper: QueryProvider,
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.emails).toHaveLength(3);
});
```

### Pattern 8: Zustand Store Testing

**What:** Test stores by calling actions directly and asserting state changes. No React rendering needed for pure store logic.

**When:** All stores in `frontend/stores/`.

**Example:**
```typescript
import { useEmailUiStore } from '@/stores/email-ui-store';

beforeEach(() => {
  // Reset store to initial state between tests
  useEmailUiStore.setState(useEmailUiStore.getInitialState());
});

it('selects an email', () => {
  useEmailUiStore.getState().selectEmail('email-1');
  expect(useEmailUiStore.getState().selectedEmailId).toBe('email-1');
});

it('clears selection', () => {
  useEmailUiStore.getState().selectEmail('email-1');
  useEmailUiStore.getState().clearSelection();
  expect(useEmailUiStore.getState().selectedEmailId).toBeNull();
});
```

### Pattern 9: Playwright E2E for v5.0 Features

**What:** Extend existing fixtures.ts with new route mocks for org/admin/security endpoints.

**When:** Testing v5.0 features (orgs, admin, onboarding, security settings).

**Example (extend existing fixtures pattern):**
```typescript
import { test as base, Page } from '@playwright/test';
import { injectAuthCookie, mockUser } from './fixtures';

const orgTest = base.extend<{ orgPage: Page }>({
  orgPage: async ({ page }, use) => {
    await injectAuthCookie(page.context(), 'test-session-token');

    // Mock org-specific endpoints
    await page.route('**/localhost:3000/api/v1/organizations', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'org-1', name: 'Test Org', slug: 'test-org' }],
        }),
      });
    });

    await page.route('**/localhost:3000/api/v1/organizations/*/members', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ userId: 'user-1', role: 'admin', ...mockUser }],
        }),
      });
    });

    await use(page);
  },
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Testing NestJS Modules via Full App Bootstrap
**What:** Using `NestFactory.create(AppModule)` in unit tests
**Why bad:** Pulls entire dependency graph, requires all env vars, slow (seconds per test), flaky with external services
**Instead:** Use `Test.createTestingModule` with only the service under test and its direct mocked dependencies

### Anti-Pattern 2: Real Database in Unit Tests
**What:** Using PrismaClient connected to PostgreSQL for service-level tests
**Why bad:** Tests become slow, order-dependent, require DB setup/teardown, flaky on CI
**Instead:** Mock PrismaService at the unit level. Reserve real DB for integration tests only (like hitl.test.ts pattern with explicit cleanup)

### Anti-Pattern 3: Shared Mutable State Between Test Files
**What:** Global mock state that leaks between describe blocks
**Why bad:** Order-dependent failures, impossible to debug in isolation
**Instead:** `jest.clearAllMocks()` in `beforeEach`. New mock instances per test via `Test.createTestingModule`

### Anti-Pattern 4: Relying on Tenant-Scoping Extension as Substitute for Service Tests
**What:** Not testing tenantId in service methods because "the extension adds it"
**Why bad:** Extension can be bypassed (`withoutTenantScoping()`), migration scripts bypass it, raw `$queryRaw` bypasses it
**Instead:** Unit tests must verify services pass tenantId explicitly in every query

### Anti-Pattern 5: Mixing Jest and Vitest Patterns
**What:** Using `vi.fn()` in .spec.ts files or `jest.fn()` in .test.ts files
**Why bad:** Wrong runner picks up wrong file, cryptic failures
**Instead:** .spec.ts = Jest (jest.fn/jest.mock). .test.ts = Vitest (vi.fn/vi.mock). No exceptions

### Anti-Pattern 6: Testing MUI Component Internals
**What:** Asserting on MUI internal class names, DOM structure, or animation states
**Why bad:** MUI internal implementation changes between versions, breaking tests that test nothing useful
**Instead:** Test user-visible behavior: text content, accessibility roles, click handlers, form values

## Data Flow for Test Fixtures

```
backend/test/helpers/           (NEW -- shared utilities)
  mock-prisma.ts        -> All backend .spec.ts files
  mock-auth.ts          -> Guard/controller/service tests needing auth
  mock-context.ts       -> Controller/interceptor tests
  mock-bullmq.ts        -> Worker tests
  mock-socket.ts        -> Realtime unit tests

backend/test/mocks/             (EXISTING -- Jest moduleNameMapper mocks)
  better-auth-node.mock.ts -> better-auth ESM boundary
  nanoid.mock.ts           -> ESM nanoid
  p-retry.mock.ts          -> ESM p-retry
  jsdom.mock.ts            -> ESM jsdom
  is-network-error.mock.ts -> ESM is-network-error

backend/src/test/msw-handlers/  (EXISTING -- Vitest MSW handlers)
  mistral-chat.handler.ts  -> AI pipeline .test.ts
  mistral-embed.handler.ts -> Embedding .test.ts
  index.ts                 -> Re-exports

backend/test/contract/          (EXISTING -- contract test helpers)
  contract-helpers.ts   -> All 5 contract .spec.ts files

frontend/test/helpers/          (NEW -- shared utilities)
  render.tsx            -> All component .test.tsx files
  mock-session.ts       -> Auth-dependent component tests
  mock-api.ts           -> API-dependent hook tests

frontend/e2e/                   (EXISTING -- Playwright infrastructure)
  fixtures.ts           -> All Playwright .spec.ts files
  auth.setup.ts         -> Shared auth state (better-auth cookie injection)
```

## Build Order for Test Infrastructure

Dependencies flow downward. Build in this order:

### Phase 1: Shared Test Utilities (foundation -- no dependencies)
1. `backend/test/helpers/mock-prisma.ts` -- typed Prisma mock factory
2. `backend/test/helpers/mock-auth.ts` -- standard session/user shapes for better-auth
3. `backend/test/helpers/mock-context.ts` -- NestJS ExecutionContext factory
4. `backend/test/helpers/mock-bullmq.ts` -- BullMQ Job/Queue mocks
5. `frontend/test/helpers/render.tsx` -- MUI ThemeProvider + QueryProvider wrapper
6. `frontend/test/helpers/mock-session.ts` -- better-auth session mock

### Phase 2: Backend Unit Tests for Untested Modules
**Depends on:** Phase 1 utilities

Order by dependency complexity (simpler modules first):
1. **health** -- zero dependencies beyond NestJS, trivial health check
2. **users** -- Prisma-only, CRUD operations
3. **tenants** -- Prisma-only, CRUD + tenant lifecycle
4. **labels** -- Prisma-only, CRUD + tree structure
5. **providers** -- Prisma + OAuth config, provider lifecycle
6. **subscription** -- Prisma, may have payment logic
7. **calendar** -- Prisma + BullMQ worker + external calendar API mocks

### Phase 3: BullMQ Worker Tests
**Depends on:** Phase 1 (mock-bullmq.ts)

All 7 workers follow BaseWorker pattern. Test `processJob()` logic:
1. sync.worker -- email sync orchestration
2. sync-back.worker -- write-back to provider
3. email-send.worker -- SMTP/API send path
4. folder-operations.worker -- folder CRUD with Redis locks
5. bulk-operations.worker -- batch email operations
6. contacts-sync.worker -- contacts import from provider
7. calendar-sync.worker -- calendar event sync

### Phase 4: Frontend Unit Tests
**Depends on:** Phase 1 (render helpers)

1. **Zustand stores** -- pure logic, no rendering needed
2. **TanStack Query hooks** -- renderHook + API module mocks
3. **Critical MUI components** -- rendering + interaction tests for migrated components

### Phase 5: Frontend E2E for v5.0 Features
**Depends on:** existing Playwright fixtures (extend with new route mocks)

1. Organization create/switch flow
2. Admin user management (list, ban/unban, impersonation)
3. Security settings (2FA setup, passkeys, backup codes)
4. Onboarding flow (new user first-time experience)
5. Invitation accept flow

### Phase 6: MUI Consistency Audit
**Depends on:** Phase 4 component tests (reveal non-MUI patterns during testing)

1. Grep for non-MUI patterns (Tailwind utility classes in .tsx, raw CSS, Radix remnants)
2. Fix violations found
3. Add regression tests for fixed components

## Integration Points with Existing Architecture

### NestJS DI Container
All backend unit tests use `Test.createTestingModule()`. New tests follow the same pattern. The module under test gets its real class; dependencies get mock providers via `{ provide: ServiceClass, useValue: mockObject }`.

### Prisma Tenant-Scoping Extension
The extension auto-injects tenantId via AsyncLocalStorage context. Tests operate OUTSIDE this context (no CorrelationContext active), so mocked Prisma calls do not go through the extension. This is correct -- unit tests verify the service's intent, not the runtime enforcement layer.

### better-auth ESM Boundary
The `better-auth` package is ESM-only. All tests touching auth MUST use the `jest.mock('../better-auth.module')` pattern before importing the class under test. The existing `backend/test/mocks/better-auth-node.mock.ts` handles the `better-auth/node` import via Jest moduleNameMapper in jest.config.js.

### Vitest/Jest Split
- `backend/jest.config.js` testMatch: `*.spec.ts` only
- `backend/vitest.config.ts` include: `*.test.ts` only
- No overlap. New tests MUST use the correct extension for the correct runner.

### Playwright Auth State
Playwright uses `auth.setup.ts` project to inject `better-auth.session_token` httpOnly cookie. All browser projects depend on the `setup` project. New E2E specs get auth state for free via `storageState: 'playwright/.auth/user.json'`.

### Frontend Jest Setup
`frontend/jest.setup.ts` provides: @testing-library/jest-dom matchers, next/router mock, localStorage mock, matchMedia mock. New component tests inherit all of this automatically.

## Scalability Considerations

| Concern | Current (~120 tests) | Target (~250 tests) | At 500+ tests |
|---------|---------------------|---------------------|---------------|
| Test speed | ~30s backend, ~15s frontend | ~60s backend, ~30s frontend | Shard with `jest --shard` |
| Flakiness | Low (mocked I/O) | Low if patterns followed | Redis integration tests: `--runInBand` |
| CI time | ~2min total | ~4min total | Parallel matrix: unit / integration / e2e |
| Fixture duplication | Per-file manual mocks | Shared helpers from Phase 1 | Factory functions with overrides |
| Coverage tracking | No coverage gates | Add `--coverage` with thresholds | Per-module coverage enforcement |

## Sources

- Existing test patterns in codebase (HIGH confidence -- direct inspection):
  - `backend/src/modules/email/services/email-crud.service.spec.ts` -- canonical Prisma mock pattern
  - `backend/src/common/auth/__tests__/better-auth.guard.spec.ts` -- canonical auth mock pattern
  - `backend/test/integration/realtime-redis-adapter.spec.ts` -- canonical integration test pattern
  - `backend/src/modules/ai-chat/__tests__/chat-pipeline-msw.test.ts` -- canonical MSW/Vitest pattern
  - `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` -- canonical WS unit test
  - `frontend/lib/query-client.test.tsx` -- canonical TanStack Query test
  - `frontend/e2e/fixtures.ts` -- canonical Playwright fixture
- Config files (HIGH confidence):
  - `backend/jest.config.js`, `backend/vitest.config.ts`, `frontend/jest.config.js`, `frontend/playwright.config.ts`
- NestJS testing docs: https://docs.nestjs.com/fundamentals/testing (HIGH confidence)
- Playwright fixture docs: https://playwright.dev/docs/test-fixtures (HIGH confidence)
- @testing-library/react docs: https://testing-library.com/docs/react-testing-library/intro (HIGH confidence)
