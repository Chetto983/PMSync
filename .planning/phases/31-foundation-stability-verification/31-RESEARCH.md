# Phase 31: Foundation & Stability Verification - Research

**Researched:** 2026-03-03
**Domain:** NestJS backend infrastructure, Playwright E2E, Prisma schema, dependency analysis
**Confidence:** HIGH

## Summary

Phase 31 is a stabilization phase: close three Phase 28 gaps (chat 403 error, dead `action-counts` polling, E2E mobile viewport) and install four foundation pieces for v4.0 (EventEmitterModule, dependency-cruiser, domain event types, AiRunLedger schema). No behavioral changes to existing code -- purely additive infrastructure and targeted bug fixes.

The codebase is in good shape for this work. The chat 403 is almost certainly caused by the guard chain on `AiChatController` (JwtAuthGuard -> TenantGuard -> ConsentGuard -> QuotaGuard), where `QuotaGuard` throws `ForbiddenException` when subscription state is missing or blocked. The dead `action-counts` polling is already half-cleaned (the query was disabled on line 116 of `use-ai-actions.ts`) but invalidation calls and E2E mocks remain. Playwright config already has mobile projects (`mobile-chrome`, `mobile-safari`) in both the config and CI workflow, but the tests themselves use `test.skip()` for mobile viewports -- the E2E tests exist but are desktop-only.

**Primary recommendation:** Attack Plan 31-01 (gap closure) first since it validates the working baseline, then Plan 31-02 (foundation installs) which are purely additive registrations. Both plans are low-risk with no cross-cutting changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Chat 403: Root-cause investigation + cleanup: trace the auth flow end-to-end, fix the root cause, and clean up any stale VoltAgent references that contributed to the broken path. Document the root cause in the plan summary so Phase 32+ doesn't repeat the issue. Verify fix with both desktop and mobile viewport after patching.
- Dead Action-Counts Polling: Full sweep: remove all traces of the dead `action-counts` endpoint. Clean up: `aiActionsKeys.counts()` key invalidation calls in `use-ai-actions.ts`, the `ActionCounts` type import if unused elsewhere, E2E mock for `/api/v1/ai/stats/action-counts` in `chat-e2e.spec.ts`. Keep the `countsQuery` hardcoded empty object pattern as-is if removing it would break the hook's return type contract -- but remove the `refetchCounts` invalidation calls that fire on every approve/reject action.
- E2E Mobile Viewport Tests: Separate mobile test suite: keep desktop tests with their skip guards, create dedicated mobile-specific tests that run the same core flows at 375px with mobile-specific assertions. Run on every PR. 375px viewport only for Phase 31.
- AiRunLedger Schema Design: Per-run totals initially. Track both `tenantId` and `userId`. Include error tracking: `status` enum (SUCCESS, FAILED, TIMEOUT), `errorCode` and `errorMessage` nullable fields. Include `promptVersion` nullable string. Schema only in Phase 31 -- migration runs, no service wiring until Phase 35.
- dependency-cruiser Baseline: Start with full cross-module import rules (not just cycles). Flag all direct imports that bypass module public APIs. Warn-only mode. Backend only. Baseline config captures current violation count.
- EventEmitterModule: Install `@nestjs/event-emitter` and register `EventEmitterModule.forRoot()` in AppModule. App boots without errors.

### Claude's Discretion
- Chat 403 debugging approach (reproduction steps, which auth middleware to trace first)
- Exact event type file structure in `common/events/` (naming, barrel exports)
- Interface contract file organization in `common/interfaces/`
- ToolRegistryModule implementation details (registration pattern, DI token design)
- dependency-cruiser rule syntax and forbidden dependency patterns
- E2E mobile test implementation details (selectors, fixtures, mock patterns)

### Deferred Ideas (OUT OF SCOPE)
- 768px tablet viewport E2E tests -- Phase 37 if needed
- Backend dead service audit (old VoltAgent stubs, BatchIndexingService no-op) -- Phase 32+
- Frontend dependency-cruiser rules (MUI/Tailwind boundary) -- evaluate after backend rules prove valuable
- Per-step AI run breakdown (parentRunId self-referencing) -- Phase 35 when service wiring happens
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-03 | Phase 28 gap closure complete (chat 403 fix, dead polling disabled, E2E mobile tests passing) | All three gaps investigated: chat 403 is guard chain issue (QuotaGuard/ConsentGuard), dead polling traces mapped in 2 files, E2E mobile config already exists in CI |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/event-emitter` | 3.0.1 | Typed in-process event bus for NestJS | Official NestJS package; wraps `eventemitter2`; `@OnEvent` decorator integrates with DI |
| `dependency-cruiser` | 17.3.8 | Static dependency analysis and rule enforcement | De facto standard for JS/TS dependency validation; 8.5k GitHub stars; regex-based rules |
| `@playwright/test` | 1.58.2 | E2E testing framework (already installed) | Already used in project; mobile device presets available |
| `prisma` | 7.3.0 | ORM and migrations (already installed) | Already used; AiRunLedger model follows existing patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eventemitter2` | (transitive) | Underlying event library | Installed automatically by `@nestjs/event-emitter`; provides wildcard support |
| `typescript` | (existing) | Type checking | Existing; used for domain event type definitions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@nestjs/event-emitter` | `@nestjs/cqrs` | CQRS is overkill for Phase 31; event-emitter is simpler and sufficient for decoupling |
| `dependency-cruiser` | `eslint-plugin-import` | eslint-plugin-import handles single-file rules but can't enforce cross-module architecture boundaries |

**Installation:**
```bash
# Backend
cd backend
npm install @nestjs/event-emitter
npm install --save-dev dependency-cruiser
```

## Architecture Patterns

### Recommended Project Structure (new files)
```
backend/src/
├── common/
│   ├── events/                    # NEW: Domain event type definitions
│   │   ├── index.ts               # Barrel export
│   │   ├── email.events.ts        # EmailSynced, etc.
│   │   ├── provider.events.ts     # ProviderConnected, etc.
│   │   ├── contact.events.ts      # ContactUpdated, etc.
│   │   └── calendar.events.ts     # CalendarIcsDetected, etc.
│   └── interfaces/                # NEW: Cross-module interface contracts
│       ├── index.ts               # Barrel export
│       ├── email-search.interface.ts
│       └── tool-registry.interface.ts
├── app.module.ts                  # MODIFIED: add EventEmitterModule.forRoot()
└── prisma/
    └── schema.prisma              # MODIFIED: add AiRunLedger model + AiRunStatus enum

frontend/e2e/
├── chat-e2e.spec.ts               # MODIFIED: remove action-counts mock
└── chat-mobile.spec.ts            # NEW: mobile-specific E2E test suite
```

### Pattern 1: EventEmitterModule Registration
**What:** Register EventEmitterModule.forRoot() in AppModule imports
**When to use:** One-time setup; enables `@OnEvent` decorator and `EventEmitter2` injection throughout the app
**Example:**
```typescript
// Source: NestJS official docs (https://docs.nestjs.com/techniques/events)
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // ... existing imports
    EventEmitterModule.forRoot(), // Global by default in v3.x
    // ... rest of imports
  ],
})
export class AppModule implements NestModule { ... }
```

### Pattern 2: Typed Domain Events
**What:** Define typed event payloads as classes/interfaces in `common/events/`
**When to use:** Phase 32 will wire listeners; Phase 31 just defines the types
**Example:**
```typescript
// common/events/email.events.ts
export class EmailSyncedEvent {
  static readonly eventName = 'email.synced' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly emailId: string,
    public readonly providerId: string,
    public readonly syncedAt: Date,
  ) {}
}
```

### Pattern 3: dependency-cruiser Forbidden Rules for NestJS Modules
**What:** Rules that flag imports bypassing module public APIs (barrel exports)
**When to use:** Enforce NestJS module boundaries -- each module should only be accessed through its barrel `index.ts` or `*.module.ts` exports
**Example:**
```javascript
// .dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-deep-imports',
      comment: 'Modules should import from barrel exports or module files, not deep internal paths',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: [
          '^src/modules/$1',  // Same module is fine
          '\\.module\\.ts$',  // Module files are public API
          'index\\.ts$',      // Barrel exports are public API
        ],
      },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
```

### Pattern 4: AiRunLedger Prisma Model
**What:** Schema-only model for tracking AI run costs/metrics
**When to use:** Migration runs in Phase 31; service wiring deferred to Phase 35
**Example:**
```prisma
enum AiRunStatus {
  SUCCESS
  FAILED
  TIMEOUT
}

model AiRunLedger {
  id              String       @id @default(cuid())
  tenantId        String
  userId          String
  runType         String       // e.g., 'chat', 'briefing', 'follow-up-detection', 'draft-generation'
  model           String       // e.g., 'mistral-large-latest'
  promptTokens    Int          @default(0)
  completionTokens Int         @default(0)
  totalTokens     Int          @default(0)
  estimatedCostUsd Float       @default(0)
  latencyMs       Int          @default(0)
  toolCallCount   Int          @default(0)
  hitlRequired    Boolean      @default(false)
  requestId       String?      // Correlation ID from X-Request-Id header
  status          AiRunStatus  @default(SUCCESS)
  errorCode       String?
  errorMessage    String?
  promptVersion   String?      // Correlate cost changes to prompt changes
  createdAt       DateTime     @default(now())

  @@index([tenantId, createdAt(sort: Desc)])
  @@index([tenantId, userId, createdAt(sort: Desc)])
  @@index([tenantId, runType])
  @@map("ai_run_ledger")
}
```

### Pattern 5: Playwright Mobile Test Fixture
**What:** Separate test file using existing `authedPage` fixture with mobile viewport
**When to use:** Mobile-specific E2E tests at 375px
**Example:**
```typescript
// frontend/e2e/chat-mobile.spec.ts
import { test, expect } from './fixtures';

test.describe('AI Chat Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ authedPage: page }) => {
    // Same API mocks as desktop suite (extract to shared helper)
    await page.route('**/localhost:3000/api/v1/ai/chat/conversations**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    // ... more mocks
  });

  test('mobile layout visible, desktop layout hidden', async ({ authedPage: page }) => {
    await page.goto('/dashboard/ai');
    await expect(page.locator('.chat-mobile-layout')).toBeVisible();
    await expect(page.locator('.chat-desktop-layout')).toBeHidden();
  });

  test('mobile send and receive message', async ({ authedPage: page }) => {
    // ... mock chat endpoint, send message via mobile layout composer
  });
});
```

### Anti-Patterns to Avoid
- **Deep importing across NestJS modules:** Importing `modules/email/services/email-search.service.ts` directly from `modules/ai-chat/` bypasses the module boundary. Always go through barrel exports or module-level exports.
- **Wiring AiRunLedger service in Phase 31:** The decision is schema-only. Do not create a service, do not inject anywhere. Migration runs, that's it.
- **Mixing mobile and desktop tests:** Desktop tests already have `test.skip(!vp || vp.width < 768)` guards. The mobile suite should be a separate file with `test.use({ viewport: ... })`, not conditional logic in the same test.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-process event bus | Custom EventEmitter wrapper | `@nestjs/event-emitter` (EventEmitter2) | Handles DI integration, wildcard events, async listeners, error handling |
| Dependency analysis | Custom import scanner | `dependency-cruiser` | Handles TS path aliases, circular detection, configurable rules, graph output |
| Mobile device emulation | Manual viewport + UA scripts | Playwright `devices` preset | Pixel-perfect device profiles including viewport, UA, DPR, touch settings |
| Schema migration | Raw SQL | `prisma migrate dev` | Version-tracked, diffable, rollback support |

**Key insight:** Every piece of Phase 31 infrastructure has a well-maintained, standard tool. The only custom code needed is the domain event type definitions, which are just TypeScript interfaces.

## Common Pitfalls

### Pitfall 1: Chat 403 -- Guard Chain Confusion
**What goes wrong:** The chat endpoint at `/api/v1/ai/chat` has four guards: `JwtAuthGuard`, `TenantGuard`, `ConsentGuard`, `QuotaGuard`. A 403 (Forbidden) can come from any of the last three. The `QuotaGuard` checks subscription status and throws 403 for CANCELED, PAST_DUE, feature unavailable, or quota exceeded. The `ConsentGuard` is registered both globally (APP_GUARD in AppModule) and at controller level.
**Why it happens:** The `@RequiresConsent('ai_chat')` decorator is currently commented out (line 69 of `ai-chat.controller.ts`), so `ConsentGuard` should pass. But `QuotaGuard` calls `subscriptionService.getOrCreateSubscription(tenantId)` which creates a subscription if none exists -- if this creation fails or returns unexpected state, it throws 403.
**How to avoid:** Trace the 403 by checking the response body -- `QuotaGuard` sends structured error objects with `code` field (SUBSCRIPTION_CANCELED, PAYMENT_PAST_DUE, etc.). Reproduce by accessing `/dashboard/ai` with a fresh user and checking the network tab for the exact 403 response payload.
**Warning signs:** 403 on chat but other AI endpoints work (different guard chains); 403 only for new users (subscription auto-creation edge case).

### Pitfall 2: action-counts Invalidation Cascades
**What goes wrong:** Removing `aiActionsKeys.counts()` invalidation calls from WebSocket listeners might cause stale data if a future phase re-adds the counts endpoint.
**Why it happens:** The invalidation calls are scattered across 4 WebSocket event handlers (lines 163-189 of `use-ai-actions.ts`) and 2 mutation onSuccess handlers.
**How to avoid:** Remove all `counts()` invalidation calls cleanly. The `aiActionsKeys.counts()` key factory can stay in the keys object (it's just a data structure), but all `queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() })` calls should be removed. If a future phase needs counts, it will add its own query + invalidation.
**Warning signs:** TypeScript errors if `ActionCounts` type is still imported somewhere after cleanup.

### Pitfall 3: E2E Mobile Test Flakiness from Shared State
**What goes wrong:** Mobile tests share the `authedPage` fixture which sets `localStorage` auth state. If desktop tests run first and modify state, mobile tests may inherit stale state.
**Why it happens:** Playwright projects run in isolation (separate browser contexts), so this shouldn't happen. But if tests within the same file share `beforeEach` state (like the `partIdCounter` in `chat-e2e.spec.ts`), IDs may collide.
**How to avoid:** Reset `partIdCounter` in `beforeEach` or use a separate counter in the mobile file. Use `test.describe` blocks with `test.use({ viewport })` to scope viewport setting to the entire describe block.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 4: dependency-cruiser TypeScript Path Aliases
**What goes wrong:** dependency-cruiser can't resolve `@/` or `~` path aliases without explicit TS config pointer.
**Why it happens:** The tool needs `tsconfig.json` paths to resolve aliases.
**How to avoid:** Set `options.tsConfig.fileName` to `'tsconfig.json'` in the depcruise config. The backend's `tsconfig.json` is at `backend/tsconfig.json`.
**Warning signs:** All aliased imports show as "could not resolve" violations.

### Pitfall 5: Prisma Schema Size / Migration Naming
**What goes wrong:** The schema is already 1449 lines. Adding AiRunLedger + enum adds ~30 more. Migration names must be unique and descriptive.
**Why it happens:** Prisma enforces unique migration folder names under `prisma/migrations/`.
**How to avoid:** Use a descriptive migration name: `npx prisma migrate dev --name add_ai_run_ledger`. Place the AiRunLedger model near the other AI models (after AiMessage, around line 1083).
**Warning signs:** Migration conflict if another developer adds a migration at the same time.

### Pitfall 6: No Global Prefix in main.ts
**What goes wrong:** The backend does NOT use `app.setGlobalPrefix()`. Controllers manually declare dual paths like `@Controller(['ai', 'api/v1/ai'])`. This is intentional but confusing.
**Why it happens:** Historical decision -- some routes are under `api/v1/` and some aren't. Phase 33 (API-03) will standardize this.
**How to avoid:** Don't change the dual-path pattern in Phase 31. Accept it as-is.
**Warning signs:** If a new controller is added with only one path prefix, it won't be reachable under both old and new URL patterns.

## Code Examples

Verified patterns from the existing codebase:

### AppModule Registration Pattern (existing)
```typescript
// Source: backend/src/app.module.ts (lines 40-85)
// forRoot() pattern used by ConfigModule, ScheduleModule, ThrottlerModule, LoggerModule
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ... }),
    LoggerModule.forRoot(pinoLoggerConfig),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [...] }),
    // EventEmitterModule.forRoot() follows this exact pattern
  ],
})
```

### E2E Fixture Auth Pattern (existing)
```typescript
// Source: frontend/e2e/fixtures.ts (lines 87-106)
// authedPage fixture sets localStorage + cookie
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { token: 'test-jwt-token' },
        version: 0,
      }));
      document.cookie = 'auth-token=test-jwt-token; path=/; SameSite=Lax';
      localStorage.setItem('mailagent:cookie-consent', JSON.stringify({
        necessary: true, analytics: false, marketing: false
      }));
    });
    // ... mock routes
    await use(page);
  },
});
```

### Existing Mobile Test (to be extracted/replicated)
```typescript
// Source: frontend/e2e/chat-e2e.spec.ts (lines 346-398)
// Current test uses setViewportSize() within a desktop describe block
// Phase 31 should extract this to a dedicated mobile test file
test('mobile chat layout at 375px', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // ... mocks and assertions on .chat-mobile-layout, .chat-desktop-layout
});
```

### Prisma Model Pattern (existing reference for AiRunLedger)
```prisma
// Source: backend/prisma/schema.prisma (lines 1051-1067)
// AiConversation model shows the tenantId + userId + index pattern to follow
model AiConversation {
  id        String      @id @default(cuid())
  tenantId  String
  userId    String
  title     String?
  // ...
  @@index([tenantId, userId, updatedAt(sort: Desc)])
  @@index([tenantId, updatedAt(sort: Desc)])
  @@map("ai_conversations")
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@nestjs/event-emitter` v2.x (NestJS 9/10) | v3.0.1 (NestJS 11 compatible) | 2024 | Global by default in v3; no need for `isGlobal: true` option |
| `dependency-cruiser` init generates `.js` | Now generates `.cjs` by default | v16+ | CommonJS config works with ESM projects |
| Playwright `--device` flag | `test.use({ viewport })` or `devices` import | Playwright 1.40+ | Project-level device config preferred over per-test |
| Prisma `@prisma/client` v6 | v7.3.0 (already on project) | 2025 | Improved relation loading, adapter-pg, no migration changes |

**Deprecated/outdated:**
- `nest-emitter` (nestjsx): Unmaintained. Use official `@nestjs/event-emitter` instead.
- `madge` for circular deps: `dependency-cruiser` does everything `madge` does plus rule enforcement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test --project=chromium e2e/chat-e2e.spec.ts` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-03a | Chat 403 error resolved | e2e | `cd frontend && npx playwright test --project=chromium e2e/chat-e2e.spec.ts` | Yes (existing chat tests prove chat works) |
| PERF-03b | Dead action-counts polling disabled | e2e / manual | Network tab inspection; E2E mock removal proves no request is made | Partial (mock removal in chat-e2e.spec.ts) |
| PERF-03c | E2E mobile viewport tests pass | e2e | `cd frontend && npx playwright test --project=mobile-chrome e2e/chat-mobile.spec.ts` | No -- Wave 0 |
| SC-4 | EventEmitterModule registered, app boots | smoke | `cd backend && npm run build && npx ts-node -e "require('./dist/main')"` (boot check) | No -- manual boot verification |
| SC-5 | dependency-cruiser runs without blocking | smoke | `cd backend && npx depcruise --validate .dependency-cruiser.cjs src/` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx playwright test --project=chromium e2e/chat-e2e.spec.ts` (quick desktop chat tests)
- **Per wave merge:** `cd frontend && npx playwright test` (full suite including mobile)
- **Phase gate:** Full suite green + backend boot check + depcruise run before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/e2e/chat-mobile.spec.ts` -- covers PERF-03c (mobile E2E)
- [ ] `backend/.dependency-cruiser.cjs` -- covers SC-5 (dependency analysis baseline config)
- [ ] Backend boot verification after EventEmitterModule addition -- covers SC-4 (can be `npm run build`)

## Open Questions

1. **Chat 403 exact root cause**
   - What we know: Guard chain is JwtAuth -> Tenant -> Consent -> Quota. ConsentGuard's `@RequiresConsent` is commented out. QuotaGuard checks subscription and throws 403 for various conditions.
   - What's unclear: Whether the 403 happens on first request (subscription auto-creation race), on every request (persistent subscription state issue), or only for certain users.
   - Recommendation: Reproduce first with a fresh user, capture the exact 403 response body (it has a `code` field). The `code` will tell us exactly which guard threw. If it's QuotaGuard, check the Subscription table for the user's tenant.

2. **VoltAgent references in frontend**
   - What we know: 5 frontend files still reference VoltAgent types (`types/api.ts`, `types/entities.ts`, `lib/api/ai.ts`, `lib/websocket-client.ts`, `pages/dashboard/email.tsx`). These are type-only references, not active polling.
   - What's unclear: Whether cleaning these up is in Phase 31 scope (CONTEXT.md says "clean up stale VoltAgent references" for chat 403 fix).
   - Recommendation: Only clean up VoltAgent references that are directly related to the chat 403 auth flow. Full dead code audit is deferred to Phase 32+.

3. **dependency-cruiser baseline violation count**
   - What we know: 25 files use `forwardRef` (proxy for circular dependencies). There are likely many more cross-module deep imports.
   - What's unclear: Exact violation count until depcruise actually runs.
   - Recommendation: Run depcruise after config creation, record the baseline count in a comment in the config file. Phase 32 targets reducing this.

## Sources

### Primary (HIGH confidence)
- `backend/src/app.module.ts` -- Existing forRoot() registration pattern (lines 40-85)
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` -- Guard chain causing 403 (line 51)
- `backend/src/modules/subscription/guards/quota.guard.ts` -- QuotaGuard 403 throw conditions
- `backend/src/modules/compliance/guards/consent.guard.ts` -- ConsentGuard behavior
- `frontend/hooks/ai/use-ai-actions.ts` -- Dead action-counts code (line 116, invalidation calls)
- `frontend/e2e/chat-e2e.spec.ts` -- Existing E2E tests with mobile skip guards and action-counts mock
- `frontend/e2e/fixtures.ts` -- Auth fixture pattern
- `frontend/playwright.config.ts` -- Existing mobile-chrome/mobile-safari projects
- `.github/workflows/e2e.yml` -- CI already runs mobile projects (lines 53-90)
- `backend/prisma/schema.prisma` -- Model patterns (AiConversation, ActionQueue) for AiRunLedger design

### Secondary (MEDIUM confidence)
- [NestJS Events Documentation](https://docs.nestjs.com/techniques/events) -- EventEmitterModule.forRoot() setup
- [@nestjs/event-emitter npm](https://www.npmjs.com/package/@nestjs/event-emitter) -- v3.0.1 is current, global by default
- [dependency-cruiser GitHub](https://github.com/sverweij/dependency-cruiser) -- v17.3.8, CJS config, rule syntax
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) -- Forbidden rule format, severity levels, path regex

### Tertiary (LOW confidence)
- Chat 403 root cause hypothesis (QuotaGuard subscription state) -- needs reproduction to confirm

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are either already installed or are official/de-facto standards with verified versions
- Architecture: HIGH -- patterns directly copied from existing codebase (AppModule registration, E2E fixtures, Prisma models)
- Pitfalls: MEDIUM -- Chat 403 root cause is hypothesized but not yet confirmed by reproduction
- Validation: HIGH -- Playwright and CI infrastructure already exist; just need new test file and config

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable infrastructure, no fast-moving dependencies)
