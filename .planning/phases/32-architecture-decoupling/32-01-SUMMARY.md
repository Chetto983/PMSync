---
phase: 32-architecture-decoupling
plan: 01
subsystem: infra
tags: [nestjs, di, event-emitter, interface-contracts, tool-registry]

requires:
  - phase: 31-foundation-stability-verification
    provides: "IToolRegistryService interface, EventEmitterModule, domain event class pattern"
provides:
  - "@Global() ToolRegistryModule with TOOL_REGISTRY_SERVICE provider"
  - "IProviderTokenService + PROVIDER_TOKEN_SERVICE symbol contract"
  - "ICryptoService + CRYPTO_SERVICE symbol contract"
  - "TenantDeletedEvent and DeletionExpiredEvent domain events"
  - "Event wiring integration test proving emit -> @OnEvent pattern"
affects: [32-02, 32-03, 32-04, architecture-decoupling]

tech-stack:
  added: []
  patterns: ["@Global() module with Symbol token + useExisting for DI", "domain event class with static readonly eventName"]

key-files:
  created:
    - backend/src/common/modules/tool-registry/tool-registry.service.ts
    - backend/src/common/modules/tool-registry/tool-registry.module.ts
    - backend/src/common/modules/tool-registry/__tests__/tool-registry.service.spec.ts
    - backend/src/common/interfaces/provider-token.interface.ts
    - backend/src/common/interfaces/crypto.interface.ts
    - backend/src/common/events/tenant.events.ts
    - backend/src/common/events/compliance.events.ts
    - backend/src/common/events/__tests__/event-wiring.spec.ts
  modified:
    - backend/src/app.module.ts
    - backend/src/common/interfaces/index.ts
    - backend/src/common/events/index.ts

key-decisions:
  - "ToolRegistryModule placed after PrismaModule/CacheModule but before all domain modules in AppModule imports"
  - "Used useExisting provider pattern so ToolRegistryService is available both by class and by TOOL_REGISTRY_SERVICE symbol"

patterns-established:
  - "@Global() module with Symbol token: provide + useExisting + export both class and symbol"
  - "Domain event class: static readonly eventName as const, typed constructor params"

requirements-completed: [ARCH-01, ARCH-02]

duration: 5min
completed: 2026-03-03
---

# Phase 32 Plan 01: Foundation Contracts Summary

**@Global() ToolRegistryModule with Map-based service, IProviderTokenService/ICryptoService interface contracts, TenantDeleted/DeletionExpired domain events, 10 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T14:27:03Z
- **Completed:** 2026-03-03T14:31:55Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- ToolRegistryService implementing IToolRegistryService with Map-based tool storage, duplicate-overwrite with warning
- @Global() ToolRegistryModule registered in AppModule before all domain modules for proper DI ordering
- IProviderTokenService and ICryptoService contracts with Symbol injection tokens following established pattern
- TenantDeletedEvent and DeletionExpiredEvent domain events following existing event class pattern
- Event wiring integration test proving NestJS EventEmitter2 emit -> @OnEvent handler fires correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ToolRegistryModule and write unit test** - `ec5b68f3` (feat, TDD)
2. **Task 2: Create interface contracts and domain events** - `31369db1` (feat)

## Files Created/Modified
- `backend/src/common/modules/tool-registry/tool-registry.service.ts` - Map-based IToolRegistryService implementation
- `backend/src/common/modules/tool-registry/tool-registry.module.ts` - @Global() module with TOOL_REGISTRY_SERVICE provider
- `backend/src/common/modules/tool-registry/__tests__/tool-registry.service.spec.ts` - 7 unit tests for registry service
- `backend/src/common/interfaces/provider-token.interface.ts` - IProviderTokenService + PROVIDER_TOKEN_SERVICE symbol
- `backend/src/common/interfaces/crypto.interface.ts` - ICryptoService + CRYPTO_SERVICE symbol
- `backend/src/common/interfaces/index.ts` - Barrel: added 4 new exports (2 type, 2 symbol)
- `backend/src/common/events/tenant.events.ts` - TenantDeletedEvent domain event
- `backend/src/common/events/compliance.events.ts` - DeletionExpiredEvent domain event
- `backend/src/common/events/index.ts` - Barrel: added 2 new event exports
- `backend/src/common/events/__tests__/event-wiring.spec.ts` - 3 integration tests for event wiring
- `backend/src/app.module.ts` - ToolRegistryModule import added before domain modules

## Decisions Made
- ToolRegistryModule placed after infrastructure modules (PrismaModule, CacheModule) but before all domain modules in AppModule imports array -- ensures domain modules can inject TOOL_REGISTRY_SERVICE in their OnModuleInit
- Used `useExisting` provider pattern so ToolRegistryService is injectable both by class reference and by TOOL_REGISTRY_SERVICE symbol -- avoids two separate instances

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All contracts and infrastructure are in place for Plan 02 to eliminate forwardRef edges
- Domain modules can now inject TOOL_REGISTRY_SERVICE to self-register tools
- IProviderTokenService and ICryptoService ready for adapter implementations in Plan 02
- TenantDeletedEvent and DeletionExpiredEvent ready for @OnEvent handler wiring in Plan 02

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (ec5b68f3, 31369db1) verified in git log.

---
*Phase: 32-architecture-decoupling*
*Completed: 2026-03-03*
