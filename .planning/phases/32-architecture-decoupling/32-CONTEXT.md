# Phase 32: Architecture Decoupling - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Break circular dependencies from 17 forwardRef edges to 5 or fewer, wire typed domain events so modules communicate without direct imports, implement ToolRegistryModule so AiChatModule discovers tools without forwardRef to domain modules, and promote dependency-cruiser from warn-only to error mode in CI to block new violations on PR merge.

</domain>

<decisions>
## Implementation Decisions

### forwardRef Triage
- Attack AiChatModule cluster first — ToolRegistry interface already designed in Phase 31 (IToolRegistryService, IAiTool), clear 4-edge reduction
- Then attack ProvidersModule cluster — the worst hub with 5 outgoing + 3 incoming forwardRef edges
- Use interface injection to break ProvidersModule coupling: define IProviderTokenService, ICryptoService in common/interfaces/. ProvidersModule provides implementations, other modules depend on interfaces only
- Break compliance edges (ScheduledJobsModule→ComplianceModule, TenantsModule→ComplianceModule) with domain events: TenantDeletedEvent, DeletionExpiredEvent
- Which 5 edges survive: Claude decides based on dependency graph analysis — genuinely bidirectional edges that are too costly to decouple can remain

### Event Bus Scope
- Minimal event count — only emit events where they replace a forwardRef import (~6-8 events total)
- Keep direct service calls where no circular dependency exists; don't over-eventify
- 4 events from Phase 31: EmailSyncedEvent, ProviderConnectedEvent, ContactUpdatedEvent, CalendarIcsDetectedEvent
- Additional events needed: TenantDeletedEvent, DeletionExpiredEvent, plus any identified during forwardRef analysis
- Event payloads: IDs + 3-5 essential fields. Consumer re-fetches if it needs more. Lightweight, avoids stale data
- Delivery: In-process via @nestjs/event-emitter (fire-and-forget). If consumer fails, next sync/poll catches up. No BullMQ durability needed for Phase 32
- Event handlers live in the consuming module — standard NestJS @OnEvent pattern (e.g., ContactsModule listens for EmailSyncedEvent)

### ToolRegistry Wiring
- OnModuleInit self-registration: each domain module implements OnModuleInit and calls toolRegistry.registerTool()
- Tool implementations live in domain modules — EmailModule owns email-search-tool.ts, CalendarModule owns calendar-tool.ts, etc.
- ToolRegistryModule is @Global() — available everywhere without explicit imports, reduces import noise
- Thin wrapper classes: create EmailSearchTool that implements IAiTool and delegates to EmailSearchService. Tool metadata + parameter validation in wrapper, business logic stays in service
- After wiring: AiChatModule imports only ToolRegistryModule, zero forwardRef to domain modules

### CI Enforcement
- dep-cruiser error mode for circular deps only — cross-module deep imports stay as warnings (reducing 989 is a separate effort)
- Gate logic: baseline file checked into repo with current violation count. PR blocked if circular count > baseline. Baseline updated when violations are intentionally reduced
- Install madge alongside dep-cruiser — madge --circular for visual checks (success criterion #1), dep-cruiser for CI rules with forbidden patterns
- GitHub Actions step only — no pre-commit hook, no local developer friction. CI runs dep-cruiser in ~10-20s

### Claude's Discretion
- Exact interface method signatures for IProviderTokenService and ICryptoService (follow existing pattern from IStorageService, ISyncAuthService)
- Which specific forwardRef edges survive (up to 5) based on dependency graph analysis
- Exact event payloads (which 3-5 fields per event)
- Tool wrapper class structure and parameter schema design
- dep-cruiser baseline file format and update workflow
- madge configuration and output format for CI reporting

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `common/interfaces/tool-registry.interface.ts`: IAiTool, IToolContext, IToolRegistryService, TOOL_REGISTRY_SERVICE symbol — ready for implementation
- `common/interfaces/storage.interface.ts`, `sync-auth.interface.ts`: Existing interface injection patterns to follow
- `common/events/`: 4 domain event types defined (EmailSynced, ProviderConnected, ContactUpdated, CalendarIcsDetected) with barrel export
- `@nestjs/event-emitter`: Installed and registered in AppModule (EventEmitterModule.forRoot())
- `.dependency-cruiser.cjs`: Baseline config with 3 rules (cross-module, circular, orphan) all in warn mode

### Established Patterns
- NestJS modules use forwardRef(() => ModuleName) for circular deps — this is what we're eliminating
- Interface injection: common/interfaces/ exports interfaces + DI symbols, modules provide implementations via `{ provide: SYMBOL, useClass: Implementation }`
- @OnEvent handlers: not yet used in codebase but EventEmitterModule is registered — Phase 32 introduces this pattern
- Global modules: CacheModule, PrismaModule are @Global() — ToolRegistryModule follows this pattern

### Integration Points
- 11 module files with forwardRef: ai-chat, users, scheduled-jobs, calendar, labels, ai, tenants, contacts, email, email-sync, providers
- `backend/src/app.module.ts`: ToolRegistryModule registration point
- `backend/src/modules/ai-chat/ai-chat.module.ts`: 4 forwardRef to remove after ToolRegistry wiring
- `backend/src/modules/providers/providers.module.ts`: 5 forwardRef outgoing — interface injection target
- `.github/workflows/`: CI pipeline for dep-cruiser step
- `package.json` (backend): madge dependency addition

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward architecture refactoring work. Follow existing NestJS patterns, use the interface contracts and events infrastructure installed in Phase 31.

</specifics>

<deferred>
## Deferred Ideas

- Reducing 989 cross-module deep import violations — separate cleanup effort, not Phase 32 scope
- BullMQ-backed durable domain events — evaluate if in-process events prove insufficient
- Frontend dependency-cruiser rules (MUI/Tailwind boundary) — evaluate after backend rules prove valuable (noted in Phase 31)
- Comprehensive domain events for all actions (email sent, folder created, etc.) — add as needed in future phases
- Pre-commit hook for dep-cruiser — add if developers want local feedback

</deferred>

---

*Phase: 32-architecture-decoupling*
*Context gathered: 2026-03-03*
