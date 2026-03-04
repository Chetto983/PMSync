# Phase 32: Architecture Decoupling - Research

**Researched:** 2026-03-03
**Domain:** NestJS module dependency graph, domain events, interface injection, CI enforcement
**Confidence:** HIGH

## Summary

Phase 32 targets the 15 circular dependency edges reported by madge (down from 17 mentioned in planning -- the baseline shifted during Phase 31 work). The codebase has three distinct circular-dependency clusters and two isolated edges that require different decoupling strategies. Phase 31 already installed all the scaffolding: EventEmitterModule.forRoot(), four domain event classes, three interface contracts (IStorageService, ISyncAuthService, IToolRegistryService), and a dependency-cruiser baseline in warn-only mode.

The work is well-scoped: AiChatModule has 4 forwardRef imports to domain modules (Email, Calendar, Contacts, Ai) that can be eliminated by ToolRegistryModule with OnModuleInit self-registration. ProvidersModule has 5 forwardRef imports (EmailSync, Email, Ai, Calendar, Contacts) that ProviderConfigService pulls services from -- these break via interface injection and domain events. The remaining edges (Tenants/ScheduledJobs to Compliance, Labels to Email, Users to EmailSync, and several intra-module/locale cycles) are addressed by events or are intra-module and tolerable.

**Primary recommendation:** Attack in three waves -- (1) implement ToolRegistryModule + wire AiChat, (2) interface-inject ProvidersModule cluster + wire domain events for Compliance edges, (3) flip dependency-cruiser circular rule to error severity with a known-violations baseline and add CI step.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Attack AiChatModule cluster first -- ToolRegistry interface already designed in Phase 31 (IToolRegistryService, IAiTool), clear 4-edge reduction
- Then attack ProvidersModule cluster -- the worst hub with 5 outgoing + 3 incoming forwardRef edges
- Use interface injection to break ProvidersModule coupling: define IProviderTokenService, ICryptoService in common/interfaces/. ProvidersModule provides implementations, other modules depend on interfaces only
- Break compliance edges (ScheduledJobsModule->ComplianceModule, TenantsModule->ComplianceModule) with domain events: TenantDeletedEvent, DeletionExpiredEvent
- Minimal event count -- only emit events where they replace a forwardRef import (~6-8 events total)
- Keep direct service calls where no circular dependency exists; don't over-eventify
- 4 events from Phase 31: EmailSyncedEvent, ProviderConnectedEvent, ContactUpdatedEvent, CalendarIcsDetectedEvent
- Additional events needed: TenantDeletedEvent, DeletionExpiredEvent, plus any identified during forwardRef analysis
- Event payloads: IDs + 3-5 essential fields. Consumer re-fetches if it needs more. Lightweight, avoids stale data
- Delivery: In-process via @nestjs/event-emitter (fire-and-forget). If consumer fails, next sync/poll catches up. No BullMQ durability needed
- Event handlers live in the consuming module -- standard NestJS @OnEvent pattern
- OnModuleInit self-registration: each domain module implements OnModuleInit and calls toolRegistry.registerTool()
- Tool implementations live in domain modules -- EmailModule owns email-search-tool.ts, CalendarModule owns calendar-tool.ts, etc.
- ToolRegistryModule is @Global() -- available everywhere without explicit imports
- Thin wrapper classes: create EmailSearchTool that implements IAiTool and delegates to EmailSearchService. Tool metadata + parameter validation in wrapper, business logic stays in service
- After wiring: AiChatModule imports only ToolRegistryModule, zero forwardRef to domain modules
- dep-cruiser error mode for circular deps only -- cross-module deep imports stay as warnings
- Gate logic: baseline file checked into repo with current violation count. PR blocked if circular count > baseline. Baseline updated when violations are intentionally reduced
- Install madge alongside dep-cruiser -- madge --circular for visual checks (success criterion #1), dep-cruiser for CI rules
- GitHub Actions step only -- no pre-commit hook, no local developer friction

### Claude's Discretion
- Exact interface method signatures for IProviderTokenService and ICryptoService (follow existing pattern from IStorageService, ISyncAuthService)
- Which specific forwardRef edges survive (up to 5) based on dependency graph analysis
- Exact event payloads (which 3-5 fields per event)
- Tool wrapper class structure and parameter schema design
- dep-cruiser baseline file format and update workflow
- madge configuration and output format for CI reporting

### Deferred Ideas (OUT OF SCOPE)
- Reducing 989 cross-module deep import violations -- separate cleanup effort, not Phase 32 scope
- BullMQ-backed durable domain events -- evaluate if in-process events prove insufficient
- Frontend dependency-cruiser rules (MUI/Tailwind boundary) -- evaluate after backend rules prove valuable
- Comprehensive domain events for all actions (email sent, folder created, etc.) -- add as needed in future phases
- Pre-commit hook for dep-cruiser -- add if developers want local feedback
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Circular dependencies reduced from 17 forwardRef edges to <=5 using event bus, interface injection, and ToolRegistry | Madge reports 15 current circular edges in 3 clusters. ToolRegistry eliminates AiChat cluster (4 edges). Interface injection + events eliminate Providers cluster (~6 edges). Compliance events eliminate 2 edges. 3 intra-module/locale edges survive as tolerable. |
| ARCH-02 | Typed domain event contracts defined and wired (EmailSynced, ProviderConnected, ContactUpdated, CalendarIcsDetected) | Event classes exist in common/events/. EventEmitterModule.forRoot() registered. @OnEvent pattern documented. Need emit calls in producers and @OnEvent handlers in consumers. |
| ARCH-03 | dependency-cruiser enforces module boundary rules in CI, blocking forbidden imports on PR merge | .dependency-cruiser.cjs exists with warn-only rules. Need to: flip no-circular to error severity, generate known-violations baseline, add CI step in .github/workflows/ci.yml, install madge for visual reporting. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/common | ^11.1.13 | Core NestJS framework | Already installed, provides @Module, @Global, @Inject, forwardRef, OnModuleInit |
| @nestjs/event-emitter | ^3.0.1 | In-process event bus | Already installed + registered in AppModule (Phase 31) |
| dependency-cruiser | ^17.3.8 | Dependency analysis and rule enforcement | Already installed (Phase 31), baseline exists |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| madge | latest | Circular dependency visualization | CI visual check, success criterion #1 (`madge --circular` count) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @nestjs/event-emitter | @nestjs/cqrs | CQRS is heavier, adds Command/Query separation overkill for simple decoupling |
| madge | dep-cruiser alone | madge gives cleaner circular-only output; dep-cruiser reports all violations mixed together |

**Installation:**
```bash
cd backend && npm install --save-dev madge
```

## Architecture Patterns

### Current Circular Dependency Map (madge --circular, 2026-03-03)

```
Found 15 circular dependencies:

CLUSTER 1: Intra-module (3 edges -- tolerable, NOT forwardRef)
  1) realtime-events.service.ts <-> realtime.gateway.ts           (RealtimeModule internal)
  2) ai/locales/index.ts -> action-summaries.ts -> en.ts          (Locale barrel cycle)
  3) ai/locales/index.ts -> action-summaries.ts -> it.ts          (Locale barrel cycle)

CLUSTER 2: Subscription internal (1 edge -- NOT forwardRef)
  4) cost-protection.service.ts <-> billing-alert.service.ts      (SubscriptionModule internal)

CLUSTER 3: Core module mesh (10 edges -- ALL forwardRef)
  5)  AiModule <-> EmailModule
  6)  AiModule -> EmailModule -> CalendarModule -> EmailSyncModule
  7)  EmailModule -> CalendarModule -> EmailSyncModule
  8)  AiModule -> EmailModule -> CalendarModule -> EmailSyncModule -> ProvidersModule
  9)  CalendarModule -> EmailSyncModule -> ProvidersModule
  10) AiModule -> ... -> ProvidersModule -> ContactsModule
  11) EmailSyncModule -> ProvidersModule -> ContactsModule
  12) ProvidersModule <-> ContactsModule
  13) EmailSyncModule <-> ProvidersModule
  14) EmailModule -> CalendarModule -> EmailSyncModule -> ProvidersModule

ISOLATED: Compliance edges (forwardRef, but NOT in madge -- module-level only)
  - TenantsModule -> forwardRef(ComplianceModule)
  - ScheduledJobsModule -> forwardRef(ComplianceModule)
  - Labels -> forwardRef(EmailModule) -- part of cluster 3
  - Users -> forwardRef(EmailSyncModule) -- part of cluster 3
```

### Recommended Decoupling Structure

```
backend/src/
├── common/
│   ├── events/                     # Domain event classes (exists)
│   │   ├── email.events.ts         # EmailSyncedEvent (exists)
│   │   ├── provider.events.ts      # ProviderConnectedEvent (exists)
│   │   ├── contact.events.ts       # ContactUpdatedEvent (exists)
│   │   ├── calendar.events.ts      # CalendarIcsDetectedEvent (exists)
│   │   ├── tenant.events.ts        # NEW: TenantDeletedEvent
│   │   ├── compliance.events.ts    # NEW: DeletionExpiredEvent
│   │   └── index.ts                # Barrel export (update)
│   ├── interfaces/                 # Interface contracts (exists)
│   │   ├── storage.interface.ts    # IStorageService (exists)
│   │   ├── sync-auth.interface.ts  # ISyncAuthService (exists)
│   │   ├── tool-registry.interface.ts # IToolRegistryService (exists)
│   │   ├── provider-token.interface.ts # NEW: IProviderTokenService
│   │   ├── crypto.interface.ts     # NEW: ICryptoService
│   │   └── index.ts                # Barrel export (update)
│   └── modules/
│       └── tool-registry/          # NEW: @Global() ToolRegistryModule
│           ├── tool-registry.module.ts
│           └── tool-registry.service.ts
├── modules/
│   ├── email/
│   │   └── tools/
│   │       └── email-search.tool.ts   # NEW: IAiTool wrapper
│   ├── calendar/
│   │   └── tools/
│   │       └── calendar.tool.ts       # NEW: IAiTool wrapper
│   ├── contacts/
│   │   └── tools/
│   │       └── contacts.tool.ts       # NEW: IAiTool wrapper
│   ├── ai/
│   │   └── tools/
│   │       └── rag.tool.ts            # NEW: IAiTool wrapper
│   └── ai-chat/
│       └── tools/                     # Existing tools become thin adapters
└── ...
```

### Pattern 1: ToolRegistry Self-Registration (OnModuleInit)

**What:** Domain modules register their tools with the global ToolRegistryService during initialization, eliminating AiChatModule's need to import domain modules.
**When to use:** When a consumer module needs capabilities from multiple producer modules without direct coupling.

```typescript
// backend/src/common/modules/tool-registry/tool-registry.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { IToolRegistryService, IAiTool } from '../../interfaces';

@Injectable()
export class ToolRegistryService implements IToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, IAiTool>();

  registerTool(tool: IAiTool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool "${tool.name}" already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    this.logger.log(`Tool "${tool.name}" registered`);
  }

  getTool(name: string): IAiTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): IAiTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
```

```typescript
// backend/src/common/modules/tool-registry/tool-registry.module.ts
import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';
import { TOOL_REGISTRY_SERVICE } from '../../interfaces';

@Global()
@Module({
  providers: [
    ToolRegistryService,
    { provide: TOOL_REGISTRY_SERVICE, useExisting: ToolRegistryService },
  ],
  exports: [ToolRegistryService, TOOL_REGISTRY_SERVICE],
})
export class ToolRegistryModule {}
```

```typescript
// backend/src/modules/email/email.module.ts -- OnModuleInit registration
import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { TOOL_REGISTRY_SERVICE, IToolRegistryService } from '../../common/interfaces';
import { EmailSearchTool } from './tools/email-search.tool';

@Module({ /* ... existing config, but NO forwardRef to AiChatModule */ })
export class EmailModule implements OnModuleInit {
  constructor(
    @Inject(TOOL_REGISTRY_SERVICE) private readonly toolRegistry: IToolRegistryService,
    private readonly emailSearchTool: EmailSearchTool,
    // ... other tool wrappers
  ) {}

  onModuleInit() {
    this.toolRegistry.registerTool(this.emailSearchTool);
    // register other tools...
  }
}
```

### Pattern 2: Interface Injection (Symbol-based DI)

**What:** Define an interface + Symbol token in common/interfaces/. The provider module registers `{ provide: SYMBOL, useClass: Implementation }`. Consumer modules inject via `@Inject(SYMBOL)` and depend only on the interface.
**When to use:** When module A imports module B solely to use one or two services from B.

```typescript
// common/interfaces/provider-token.interface.ts
export interface IProviderTokenService {
  getAccessToken(tenantId: string, providerId: string): Promise<string>;
  refreshAccessToken(tenantId: string, providerId: string): Promise<string>;
  getProviderConfig(tenantId: string, providerId: string): Promise<{ type: string; email: string }>;
}
export const PROVIDER_TOKEN_SERVICE = Symbol('IProviderTokenService');

// common/interfaces/crypto.interface.ts
export interface ICryptoService {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}
export const CRYPTO_SERVICE = Symbol('ICryptoService');
```

```typescript
// ProvidersModule provides the implementation
@Module({
  providers: [
    ProviderTokenService,
    { provide: PROVIDER_TOKEN_SERVICE, useExisting: ProviderTokenService },
    CryptoService,
    { provide: CRYPTO_SERVICE, useExisting: CryptoService },
  ],
  exports: [PROVIDER_TOKEN_SERVICE, CRYPTO_SERVICE, /* ...other exports */],
})
export class ProvidersModule {}
```

```typescript
// CalendarModule consumes via interface -- NO forwardRef to ProvidersModule
@Module({
  imports: [/* NO ProvidersModule import needed -- symbols are provided globally or via re-export */],
})
export class CalendarModule {
  // Services inject via: @Inject(PROVIDER_TOKEN_SERVICE) private readonly tokens: IProviderTokenService
}
```

**Critical caveat:** If ProvidersModule is not @Global(), consumer modules still need to import it. The interface injection eliminates the circular direction of the import, not the import itself. The key is that ProvidersModule no longer needs to import CalendarModule/ContactsModule/etc. -- it only exports interfaces.

### Pattern 3: Domain Events for Cross-Module Side Effects

**What:** Producer emits a typed event via EventEmitter2. Consumer listens with @OnEvent() in a handler service. No direct import between modules.
**When to use:** When module A triggers side effects in module B but doesn't need the result (fire-and-forget).

```typescript
// Producer: TenantsModule emits TenantDeletedEvent
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantDeletedEvent } from '../../common/events';

@Injectable()
export class TenantService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async deleteTenant(tenantId: string): Promise<void> {
    // ... deletion logic ...
    this.eventEmitter.emit(
      TenantDeletedEvent.eventName,
      new TenantDeletedEvent(tenantId, new Date()),
    );
  }
}

// Consumer: ComplianceModule handles the event
import { OnEvent } from '@nestjs/event-emitter';
import { TenantDeletedEvent } from '../../common/events';

@Injectable()
export class GdprEventHandler {
  constructor(private readonly gdprService: GdprService) {}

  @OnEvent(TenantDeletedEvent.eventName)
  async handleTenantDeleted(event: TenantDeletedEvent): Promise<void> {
    await this.gdprService.scheduleDataPurge(event.tenantId);
  }
}
```

### Anti-Patterns to Avoid
- **Over-eventifying:** Don't replace direct service calls with events when there's no circular dependency. Events add indirection and make debugging harder. Only use events to break actual cycles.
- **Fat event payloads:** Don't put entire entities in events. IDs + 3-5 essential fields. Consumer re-fetches if it needs more.
- **@OnEvent without error handling:** A thrown exception in an @OnEvent handler is swallowed silently by default. Always wrap in try/catch with logging.
- **Forgetting to export interface symbols:** The `{ provide: SYMBOL, useExisting: Service }` must be in both `providers` and `exports` arrays, or consuming modules can't resolve it.
- **Circular via barrel exports:** The ai/locales barrel cycle exists because index.ts re-exports from files that import back. This is a TypeScript module resolution issue, not a NestJS DI issue. Fix by removing the cyclic re-export or restructuring the barrel.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event bus | Custom EventEmitter wrapper | @nestjs/event-emitter (EventEmitter2) | Already installed, integrates with NestJS DI lifecycle, supports wildcards, async handlers |
| Circular detection | Manual import tracing | madge + dependency-cruiser | Automated, catches transitive cycles, integrable with CI |
| DI symbol management | String tokens | Symbol('InterfaceName') | Type-safe, no collision risk, existing pattern in codebase |
| Tool discovery | Custom scanning/reflection | OnModuleInit + ToolRegistryService | Simple, explicit, no reflection magic, easy to debug |

**Key insight:** The NestJS ecosystem already provides every primitive needed for this decoupling. The work is wiring, not building.

## Common Pitfalls

### Pitfall 1: ToolRegistryModule Load Order
**What goes wrong:** If ToolRegistryModule is not imported early enough in AppModule, domain modules' OnModuleInit runs before the registry service is available, causing injection errors.
**Why it happens:** NestJS resolves modules in import order. @Global() makes it available everywhere but doesn't guarantee initialization order.
**How to avoid:** Place ToolRegistryModule in AppModule imports BEFORE all domain modules (after PrismaModule, CacheModule). Test by running `npm run build && npm run start:dev`.
**Warning signs:** `Nest can't resolve dependencies of [Module]` error mentioning TOOL_REGISTRY_SERVICE.

### Pitfall 2: Interface Injection Without Re-export
**What goes wrong:** Module B injects `@Inject(PROVIDER_TOKEN_SERVICE)` but gets `undefined` at runtime.
**Why it happens:** The Symbol provider is in ProvidersModule's `providers` but not in `exports`. Or the consuming module doesn't import ProvidersModule (and it's not @Global).
**How to avoid:** Always add the Symbol to both `providers` and `exports`. Verify with a minimal integration test or a quick `npm run start:dev` smoke test.
**Warning signs:** NestJS silently resolves to `undefined` for optional injections, or throws "Cannot resolve" for required ones.

### Pitfall 3: @OnEvent Swallowed Exceptions
**What goes wrong:** An @OnEvent handler throws, but the error is silently swallowed. The side effect never completes, and no one notices until production.
**Why it happens:** EventEmitter2 by default catches and swallows errors in listeners.
**How to avoid:** Every @OnEvent handler MUST wrap its body in try/catch with this.logger.error(). Consider the `async: true` option in EventEmitterModule.forRoot({ wildcard: false }) if you want async error propagation.
**Warning signs:** Missing log entries for events that should have been processed.

### Pitfall 4: Breaking AiChatService's PII Closure Pattern
**What goes wrong:** The current tool services receive a `piiResolve` closure from AiChatService. If tools move to domain modules as IAiTool wrappers, the PII resolution pipeline breaks.
**Why it happens:** IAiTool.execute() receives IToolContext (tenantId, userId), NOT the PII closure.
**How to avoid:** Two options: (a) ToolRegistryService passes PII resolution context when AiChatService calls tools, wrapping the IAiTool.execute() call; or (b) AiChatService continues to use the existing ToolsService classes internally but the tool DISCOVERY (knowing which tools exist) goes through the registry. Option (b) is safer and preserves PII semantics.
**Warning signs:** PII tokens appearing in tool outputs instead of resolved values.

### Pitfall 5: madge vs dependency-cruiser Count Mismatch
**What goes wrong:** madge reports 15 circular deps, dep-cruiser reports 21. Success criterion says "5 or fewer" -- which count?
**Why it happens:** dep-cruiser counts each individual edge in a cycle as a violation. madge counts distinct cycles. The success criterion (#1) says "madge --circular reports 5 or fewer."
**How to avoid:** Use madge for the success criterion count. Use dep-cruiser for CI enforcement (it catches individual edges, which is more granular).
**Warning signs:** Celebrating "5 madge cycles" when dep-cruiser still shows 15+ circular edges.

### Pitfall 6: ProviderConfigService God Object
**What goes wrong:** ProviderConfigService (in ProvidersModule) injects services from 6+ other modules via forwardRef. Simply replacing forwardRef with interface injection doesn't fix the design problem -- it just hides it behind abstractions.
**Why it happens:** ProviderConfigService is a coordinator that connects providers to sync, calendar, contacts, AI embedding, and storage on provider connect/disconnect.
**How to avoid:** For Phase 32, use domain events for the "provider connected" flow: emit ProviderConnectedEvent, let each module handle its own initialization. ProviderConfigService only emits the event and does provider-level work (OAuth, config persistence). This eliminates most of its cross-module imports.
**Warning signs:** ProviderConfigService still having 10+ constructor parameters after refactoring.

## Code Examples

### Tool Wrapper Class (IAiTool Implementation)

```typescript
// backend/src/modules/email/tools/email-search.tool.ts
import { Injectable } from '@nestjs/common';
import { IAiTool, IToolContext } from '../../../common/interfaces';
import { EmailSearchService } from '../services/email-search.service';

@Injectable()
export class EmailSearchTool implements IAiTool {
  readonly name = 'search_emails';
  readonly description = 'Search emails by query, sender, date range, folder, or labels';
  readonly parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      folder: { type: 'string', description: 'Folder to search in' },
      from: { type: 'string', description: 'Sender email address' },
      limit: { type: 'number', description: 'Max results', default: 10 },
    },
    required: ['query'],
  };

  constructor(private readonly emailSearchService: EmailSearchService) {}

  async execute(input: Record<string, unknown>, context: IToolContext): Promise<unknown> {
    return this.emailSearchService.search(context.tenantId, {
      query: input.query as string,
      folder: input.folder as string | undefined,
      from: input.from as string | undefined,
      limit: (input.limit as number) || 10,
    });
  }
}
```

### Domain Event Definition + Wiring

```typescript
// common/events/tenant.events.ts
export class TenantDeletedEvent {
  static readonly eventName = 'tenant.deleted' as const;
  constructor(
    public readonly tenantId: string,
    public readonly deletedAt: Date,
  ) {}
}

// common/events/compliance.events.ts
export class DeletionExpiredEvent {
  static readonly eventName = 'compliance.deletion-expired' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly expiredAt: Date,
  ) {}
}
```

### dependency-cruiser Baseline Generation

```bash
# Generate baseline of known violations
cd backend
npx depcruise --config .dependency-cruiser.cjs --output-type baseline \
  --output-to .dependency-cruiser-known-violations.json src

# Run with baseline (only new violations cause errors)
npx depcruise --config .dependency-cruiser.cjs \
  --ignore-known .dependency-cruiser-known-violations.json src
```

### CI Step for dependency-cruiser

```yaml
# In .github/workflows/ci.yml, under backend job steps
- name: Dependency boundary check
  run: |
    npx depcruise --config .dependency-cruiser.cjs \
      --ignore-known .dependency-cruiser-known-violations.json src
    npx madge --circular --extensions ts --ts-config tsconfig.json src \
      | tail -1 | grep -q "Found 0" || echo "::warning::Circular dependencies found"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| forwardRef everywhere | Interface injection + events | NestJS v9+ best practice | Eliminates runtime circular resolution overhead, clearer module boundaries |
| Manual import audits | dependency-cruiser in CI | dep-cruiser v14+ (2023) baseline feature | Automated enforcement, prevents regression |
| Fat tool discovery (import all modules) | Self-registration via OnModuleInit | Standard NestJS pattern | Inverts dependency direction, producer registers with consumer's registry |
| String-based DI tokens | Symbol-based DI tokens | TypeScript best practice | No collision risk, better IDE support, type-safe |

**Deprecated/outdated:**
- `@nestjs/cqrs` for simple decoupling: overkill unless you actually need CQRS/Event Sourcing patterns. @nestjs/event-emitter is the right choice for fire-and-forget domain events.

## Open Questions

1. **PII Closure Pattern Preservation**
   - What we know: Current AiChat tools receive a `piiResolve` closure that detokenizes PII in tool inputs. The IAiTool interface uses `IToolContext` which doesn't include PII resolution.
   - What's unclear: Whether to extend IToolContext with PII support or keep existing ToolsService classes as an adapter layer between ToolRegistryService and the AI SDK `tool()` function.
   - Recommendation: Keep existing ToolsService classes in AiChatModule as the AI SDK adapter layer. Use ToolRegistryService only for tool DISCOVERY (listing available tools, getting tool metadata). AiChatService.createToolSet() continues to use ToolsService.getTools() for actual execution with PII resolution. This means AiChatModule no longer needs forwardRef to domain modules for DISCOVERY, but the actual EXECUTION adapter stays local. The IAiTool wrappers in domain modules are used by the registry for metadata only, and by AiChatService as a fallback/direct execution path for non-PII contexts.

2. **ProvidersModule Inversion**
   - What we know: ProvidersModule currently imports EmailSyncModule, EmailModule, AiModule, CalendarModule, ContactsModule. Most of these are consumed by ProviderConfigService for "on provider connect" orchestration.
   - What's unclear: Whether ProviderConnectedEvent alone is sufficient to replace ALL of ProviderConfigService's cross-module calls, or if some synchronous operations (e.g., initial folder sync) need a return value.
   - Recommendation: Emit ProviderConnectedEvent for async initialization. For synchronous operations that need return values (e.g., verifying OAuth token validity), keep a small set of interface-injected services (IProviderTokenService, ICryptoService). Audit ProviderConfigService's methods one by one during implementation.

3. **Which 5 Edges Survive?**
   - What we know: 15 current edges. Clusters 1 (Realtime internal) and 2 (Subscription internal) are intra-module and don't use forwardRef. The 2 locale barrel cycles are TypeScript import cycles, not NestJS DI cycles.
   - What's unclear: Whether locale barrel cycles count toward the madge target of 5.
   - Recommendation: The 5 surviving edges should be the non-forwardRef, intra-module cycles: (1) realtime internal, (2) subscription internal, (3-4) ai locale barrel cycles. That's 4. The 5th could be a genuinely bidirectional edge that proves too costly to decouple (to be identified during implementation). All 10 core mesh forwardRef edges MUST be eliminated.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest (backend) |
| Config file | backend/jest.config.js |
| Quick run command | `cd backend && npx jest --passWithNoTests --ci --forceExit` |
| Full suite command | `cd backend && npx jest --passWithNoTests --ci --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | madge --circular reports <=5 edges | smoke (CLI) | `cd backend && npx madge --circular --extensions ts --ts-config tsconfig.json src 2>&1 \| tail -1` | N/A -- CLI check, no test file needed |
| ARCH-01 | TypeScript compiles with no forwardRef in AiChatModule | smoke (build) | `cd backend && npx tsc --noEmit` | N/A -- build check |
| ARCH-02 | Domain events fire and consumers react | integration | `cd backend && npx jest --testPathPattern=event-wiring --forceExit` | Wave 0: create `backend/src/common/events/__tests__/event-wiring.spec.ts` |
| ARCH-02 | ToolRegistryService registers and returns tools | unit | `cd backend && npx jest --testPathPattern=tool-registry --forceExit` | Wave 0: create `backend/src/common/modules/tool-registry/__tests__/tool-registry.service.spec.ts` |
| ARCH-03 | dep-cruiser CI step exits 0 on clean PRs | smoke (CLI) | `cd backend && npx depcruise --config .dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src` | N/A -- CI step |
| ARCH-03 | dep-cruiser CI step exits non-zero on new circular dep | integration (CI) | manual-only: introduce a deliberate circular import in a branch and verify CI fails | manual-only: requires GitHub Actions run |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && npx madge --circular --extensions ts --ts-config tsconfig.json src`
- **Per wave merge:** Full Jest suite + madge + dep-cruiser check
- **Phase gate:** madge reports <=5, dep-cruiser exits 0, full Jest suite green

### Wave 0 Gaps
- [ ] `backend/src/common/modules/tool-registry/__tests__/tool-registry.service.spec.ts` -- covers ARCH-01 (ToolRegistry unit test)
- [ ] `backend/src/common/events/__tests__/event-wiring.spec.ts` -- covers ARCH-02 (event emit + @OnEvent handler integration)
- [ ] `madge` npm package -- install as devDependency in backend/package.json

## Sources

### Primary (HIGH confidence)
- Codebase analysis: Direct inspection of all 11 module files with forwardRef, all 4 event files, all 3 interface files, .dependency-cruiser.cjs, and .github/workflows/ci.yml
- `madge --circular` output: Ran locally, 15 edges found (2026-03-03)
- `depcruise --output-type err` output: Ran locally, warns for circular + cross-module violations
- [NestJS Events documentation](https://docs.nestjs.com/techniques/events) - @OnEvent, EventEmitter2 patterns
- [NestJS Modules documentation](https://docs.nestjs.com/modules) - @Global(), forwardRef, OnModuleInit lifecycle

### Secondary (MEDIUM confidence)
- [dependency-cruiser CLI docs](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) - Baseline feature, --ignore-known, --output-type baseline
- [madge npm](https://www.npmjs.com/package/madge) - --circular flag, TypeScript support, CI integration
- [Trilon: Circular Dependencies in NestJS](https://trilon.io/blog/avoiding-circular-dependencies-in-nestjs) - Interface injection pattern, event-driven decoupling
- [DigitalOcean: Understanding Circular Dependency in NestJS](https://www.digitalocean.com/community/tutorials/understanding-circular-dependency-in-nestjs) - forwardRef internals, refactoring strategies

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, patterns verified in codebase
- Architecture: HIGH - forwardRef edges counted directly from source, decoupling patterns are standard NestJS
- Pitfalls: HIGH - PII closure pattern identified from actual code, ProviderConfigService god object identified from actual constructor

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable domain -- NestJS patterns don't change rapidly)
