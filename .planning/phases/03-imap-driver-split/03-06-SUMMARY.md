---
phase: 03-imap-driver-split
plan: 06
subsystem: email-sync/drivers/imap
tags: [imap, facade, refactor, drivers, nestjs]

dependency_graph:
  requires: ["03-02", "03-03", "03-04", "03-05"]
  provides: ["imap-driver-facade", "driver-module-wiring", "backward-compatibility"]
  affects: ["04-google-driver-split", "05-microsoft-driver-split"]

tech_stack:
  added: []
  patterns: ["facade-pattern", "dependency-injection", "service-delegation"]

key_files:
  created: []
  modified:
    - backend/src/modules/email-sync/drivers/imap/imap.driver.ts
    - backend/src/modules/email-sync/drivers/imap/index.ts
    - backend/src/modules/email-sync/drivers/drivers.module.ts
    - backend/src/modules/email-sync/drivers/driver.factory.ts

decisions:
  - id: "03-06-01"
    description: "IMAPDriver facade uses DI-injected instance in factory instead of new"
    rationale: "Facade requires 5 sub-service dependencies; factory returns injected instance for IMAP"

metrics:
  duration: "~9 min"
  completed: "2026-02-01"
---

# Phase 3 Plan 6: IMAP Facade and Consumer Migration Summary

**One-liner:** Thin 244-line facade delegating to 5 extracted services, replacing 2,249-line monolith

## What Was Done

### Task 1: Refactor imap.driver.ts to Thin Facade

Replaced the entire 2,249-line `imap.driver.ts` with a 244-line facade that:

- Delegates folder operations to `ImapFolderService`
- Delegates message operations to `ImapMessageService`
- Delegates IDLE/real-time to `ImapIdleService`
- Delegates SMTP/draft operations to `ImapSendService`
- Delegates connection management to `ImapConnectionPoolService`
- Preserves all `IEmailDriver` interface methods
- Maintains backward compatibility for callers

**Key implementation details:**
- `connect()` initializes pool, then sub-services with config
- `disconnect()` stops IDLE, closes pool, clears service state
- Cross-service operations (saveDraft, sendDraft) use callback pattern
- Factory returns DI-injected instance instead of `new IMAPDriver()`

### Task 2: Update Barrel Export and Module Registration

**index.ts updates:**
```typescript
// Public API
export { IMAPDriver } from './imap.driver';

// Internal services (exported for testing and DI)
export { ImapConnectionPoolService } from './services/imap-connection-pool.service';
export { ImapFolderService } from './services/imap-folder.service';
export { ImapMessageService } from './services/imap-message.service';
export { ImapIdleService } from './services/imap-idle.service';
export { ImapSendService } from './services/imap-send.service';

// Internal interfaces (exported for testing)
export * from './interfaces/imap-internal.interface';
```

**DriversModule updates:**
- Register 5 IMAP sub-services BEFORE IMAPDriver (for DI ordering)
- Export sub-services for testing

### Task 3: Verify Backward Compatibility

All verification passed:
- `npm run type-check` - no errors
- 100 IMAP tests pass
- Line counts within limits:
  - `imap.driver.ts`: 244 lines (target: <250)
  - `imap-connection-pool.service.ts`: 310 lines (target: <500)
  - `imap-folder.service.ts`: 306 lines (target: <500)
  - `imap-idle.service.ts`: 408 lines (target: <500)
  - `imap-message.service.ts`: 811 lines (exceeds 500 - documented decision)
  - `imap-send.service.ts`: 242 lines (target: <500)

## Line Count Analysis

| File | Before | After | Target | Status |
|------|--------|-------|--------|--------|
| imap.driver.ts | 2,249 | 244 | <250 | PASS |
| imap-connection-pool.service.ts | - | 310 | <500 | PASS |
| imap-folder.service.ts | - | 306 | <500 | PASS |
| imap-message.service.ts | - | 811 | <500 | EXCEEDS* |
| imap-idle.service.ts | - | 408 | <500 | PASS |
| imap-send.service.ts | - | 242 | <500 | PASS |
| **Total** | **2,249** | **2,321** | - | +72 lines |

*ImapMessageService exceeds 500 line target - documented decision from 03-04 that splitting would harm cohesion.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| e3edaed | refactor(03-06): transform IMAPDriver into thin facade | imap.driver.ts, driver.factory.ts, imap-send.service.ts |
| 3f46bbf | feat(03-06): update barrel export and module registration | index.ts, drivers.module.ts |

## Decisions Made

1. **Factory returns DI instance for IMAP** - `EmailDriverFactory.createDriver('imap')` returns the DI-injected `IMAPDriver` instance instead of `new IMAPDriver()` because the facade requires 5 sub-service dependencies

2. **Callback pattern for cross-service operations** - `saveDraft()` and `sendDraft()` pass callbacks to the send service for folder resolution and message deletion, avoiding circular dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

```
PASS src/modules/email-sync/drivers/imap/__tests__/imap-connection-pool.spec.ts
PASS src/modules/email-sync/drivers/imap/__tests__/imap-idle.spec.ts
PASS src/modules/email-sync/drivers/imap/__tests__/imap-message.spec.ts
PASS src/modules/email-sync/drivers/imap/__tests__/imap-send.spec.ts
PASS src/modules/email-sync/drivers/imap/__tests__/imap-folder.spec.ts

Test Suites: 5 passed, 5 total
Tests:       100 passed, 100 total
```

## Next Phase Readiness

Phase 3 (IMAP Driver Split) is now complete:
- [x] 03-01: Research (skipped - covered by 03-RESEARCH.md)
- [x] 03-02: ImapConnectionPoolService
- [x] 03-03: ImapFolderService
- [x] 03-04: ImapMessageService
- [x] 03-05: ImapIdleService + ImapSendService
- [x] 03-06: Facade and wiring

Ready to proceed to Phase 4: Google Driver Split
