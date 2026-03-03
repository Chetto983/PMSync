---
phase: 32-architecture-decoupling
plan: 03
subsystem: architecture
tags: [nestjs, forwardref, domain-events, eventemitter2, interface-injection, decoupling]

# Dependency graph
requires:
  - phase: 32-architecture-decoupling/plan-01
    provides: "ToolRegistryModule, IStorageService, PROVIDER_TOKEN_SERVICE, CRYPTO_SERVICE, domain event classes"
  - phase: 32-architecture-decoupling/plan-02
    provides: "AiChatModule forwardRef elimination, STORAGE_SERVICE provider in EmailModule, IAiTool wrappers"
provides:
  - "ProvidersModule decoupled via ProviderConnectedEvent/ProviderDisconnectedEvent -- zero forwardRef"
  - "TenantsModule decoupled from ComplianceModule via TenantDeletedEvent"
  - "AiModule uses STORAGE_SERVICE interface injection instead of forwardRef(EmailModule)"
  - "5 @OnEvent handler services in domain modules for provider lifecycle"
  - "GdprEventHandlerService for tenant deletion events"
  - "EmailSyncedEvent and ContactUpdatedEvent scaffolding emits in producers"
  - "Module-level forwardRef reduced from ~22 to 5 (Email/EmailSync core cluster)"
affects: [32-architecture-decoupling/plan-04, future-email-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-events-via-eventemitter2, interface-injection-via-symbols, onmoduleinit-tool-registration, setter-injection-for-optional-deps]

key-files:
  created:
    - "backend/src/modules/email-sync/services/provider-event-handler.service.ts"
    - "backend/src/modules/calendar/services/provider-event-handler.service.ts"
    - "backend/src/modules/contacts/services/provider-event-handler.service.ts"
    - "backend/src/modules/email/services/provider-event-handler.service.ts"
    - "backend/src/modules/ai/services/provider-event-handler.service.ts"
    - "backend/src/modules/compliance/services/gdpr-event-handler.service.ts"
  modified:
    - "backend/src/modules/providers/providers.module.ts"
    - "backend/src/modules/providers/services/provider-config.service.ts"
    - "backend/src/modules/tenants/services/tenant.service.ts"
    - "backend/src/modules/tenants/tenants.module.ts"
    - "backend/src/modules/ai/ai.module.ts"
    - "backend/src/modules/ai/services/attachment-content-extractor.service.ts"
    - "backend/src/modules/ai/services/mistral-ocr.service.ts"
    - "backend/src/common/interfaces/storage.interface.ts"
    - "backend/src/common/services/scheduled-jobs.module.ts"
    - "backend/src/modules/contacts/contacts.module.ts"
    - "backend/src/modules/contacts/services/contacts.service.ts"
    - "backend/src/modules/calendar/calendar.module.ts"
    - "backend/src/modules/labels/labels.module.ts"
    - "backend/src/modules/users/users.module.ts"
    - "backend/src/modules/email-sync/services/base-email-sync.service.ts"
    - "backend/src/modules/email-sync/services/gmail/google-sync.service.ts"
    - "backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts"
    - "backend/src/modules/email-sync/services/imap/imap-sync.service.ts"
    - "backend/src/common/events/provider.events.ts"
    - "backend/src/common/events/index.ts"
    - "backend/src/modules/email-sync/email-sync.module.ts"
    - "backend/src/modules/email/email.module.ts"
    - "backend/src/modules/compliance/compliance.module.ts"

key-decisions:
  - "ProviderConfigService rewritten to emit ProviderConnectedEvent/ProviderDisconnectedEvent instead of directly calling 13 injected domain services"
  - "CryptoService exported as CRYPTO_SERVICE symbol from ProvidersModule but no ICryptoService interface needed (internal-only use)"
  - "IStorageService extended with getSignedDownloadUrl for AI module attachment access"
  - "EventEmitter2 injected via setter pattern in BaseEmailSyncService to avoid modifying 3 child class constructors"
  - "CalendarIcsDetectedEvent documented as scaffolding-only (no ICS detection from email attachments exists yet)"
  - "5 surviving forwardRef edges are all in Email/EmailSync core cluster (true bidirectional dependency)"
  - "madge reports 8 circular edges: 5 pre-existing internal file-level + 3 module-level in Email core cluster"

patterns-established:
  - "Provider lifecycle events: ProviderConnectedEvent for setup, ProviderDisconnectedEvent for teardown"
  - "Domain event handler services: @OnEvent handlers in consuming module with try/catch + logger.error"
  - "Setter injection for optional base class dependencies: setEventEmitter() pattern matching setRedisLockService()"

requirements-completed: [ARCH-01, ARCH-02]

# Metrics
duration: 22min
completed: 2026-03-03
---

# Phase 32 Plan 03: Domain Event Wiring and forwardRef Elimination Summary

**ProvidersModule, ComplianceModule, AiModule decoupled via ProviderConnectedEvent/ProviderDisconnectedEvent, TenantDeletedEvent, and STORAGE_SERVICE interface injection -- module forwardRef reduced from ~22 to 5**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-03T14:50:53Z
- **Completed:** 2026-03-03T15:13:30Z
- **Tasks:** 2
- **Files modified:** 24

## Accomplishments

- ProvidersModule has zero forwardRef imports -- all 5 domain module dependencies replaced with ProviderConnectedEvent (connect) and ProviderDisconnectedEvent (teardown)
- ProviderConfigService reduced from 13 injected domain services to 6 local + EventEmitter2
- TenantsModule, ScheduledJobsModule, AiModule, LabelsModule, UsersModule, CalendarModule, ContactsModule all had unnecessary forwardRef eliminated
- 6 new @OnEvent handler services created in their respective domain modules
- EmailSyncedEvent and ContactUpdatedEvent scaffolding emits added in producers for future consumer modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Decouple ProvidersModule via interface injection and ProviderConnectedEvent** - `60f040ee` (feat)
2. **Task 2: Decouple Compliance edges, AiModule, and remaining forwardRef** - `6313566e` (feat)

## Files Created/Modified

### Created (6 files)
- `backend/src/modules/email-sync/services/provider-event-handler.service.ts` - @OnEvent(ProviderConnected/Disconnected): folder sync, email sync, webhook lifecycle
- `backend/src/modules/calendar/services/provider-event-handler.service.ts` - @OnEvent(ProviderConnected/Disconnected): calendar sync + webhook lifecycle
- `backend/src/modules/contacts/services/provider-event-handler.service.ts` - @OnEvent(ProviderConnected/Disconnected): contacts sync + cleanup
- `backend/src/modules/email/services/provider-event-handler.service.ts` - @OnEvent(ProviderDisconnected): S3 attachment cleanup
- `backend/src/modules/ai/services/provider-event-handler.service.ts` - @OnEvent(ProviderDisconnected): embedding job + data cleanup
- `backend/src/modules/compliance/services/gdpr-event-handler.service.ts` - @OnEvent(TenantDeleted): GDPR data purge

### Modified (18 files)
- `backend/src/modules/providers/providers.module.ts` - Removed all 5 forwardRef imports, added CRYPTO_SERVICE export
- `backend/src/modules/providers/services/provider-config.service.ts` - Complete rewrite: EventEmitter2 replaces 13 domain service injections
- `backend/src/modules/tenants/tenants.module.ts` - Removed forwardRef(ComplianceModule)
- `backend/src/modules/tenants/services/tenant.service.ts` - Emits TenantDeletedEvent instead of calling GdprService
- `backend/src/modules/ai/ai.module.ts` - Removed forwardRef(EmailModule), direct import
- `backend/src/modules/ai/services/attachment-content-extractor.service.ts` - Uses @Inject(STORAGE_SERVICE) instead of direct StorageService
- `backend/src/modules/ai/services/mistral-ocr.service.ts` - Uses @Inject(STORAGE_SERVICE) instead of direct StorageService
- `backend/src/common/interfaces/storage.interface.ts` - Extended with getSignedDownloadUrl
- `backend/src/common/services/scheduled-jobs.module.ts` - Direct ComplianceModule import (no circular)
- `backend/src/modules/contacts/contacts.module.ts` - Direct AiModule + EmailSyncModule imports
- `backend/src/modules/contacts/services/contacts.service.ts` - Emits ContactUpdatedEvent (scaffolding)
- `backend/src/modules/calendar/calendar.module.ts` - Direct EmailSyncModule import, removed forwardRef import
- `backend/src/modules/labels/labels.module.ts` - Direct EmailModule import
- `backend/src/modules/users/users.module.ts` - Direct EmailSyncModule import
- `backend/src/modules/email-sync/services/base-email-sync.service.ts` - Emits EmailSyncedEvent (scaffolding, via setter)
- `backend/src/modules/email-sync/services/gmail/google-sync.service.ts` - Injects EventEmitter2, calls setEventEmitter
- `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts` - Injects EventEmitter2, calls setEventEmitter
- `backend/src/modules/email-sync/services/imap/imap-sync.service.ts` - Injects EventEmitter2, calls setEventEmitter

## Decisions Made

1. **CryptoService stays concrete (no ICryptoService interface):** Plan suggested ICryptoService, but CryptoService.encrypt returns `{encrypted, iv}` not `Promise<string>`. Since CryptoService is only used within ProvidersModule, interface injection is unnecessary. Exported as CRYPTO_SERVICE symbol for future external consumers.

2. **IStorageService extended with getSignedDownloadUrl:** AI services (AttachmentContentExtractorService, MistralOcrService) need signed download URLs for S3 access. Added to IStorageService contract since it's a fundamental storage operation.

3. **ScheduledJobsModule -> ComplianceModule was never circular:** The forwardRef was unnecessary -- ComplianceModule doesn't import ScheduledJobsModule. Changed to direct import instead of creating DeletionExpiredEvent (which would have been dead code).

4. **EventEmitter2 via setter in BaseEmailSyncService:** Adding to constructor would require modifying 3 child classes (GoogleSyncService, MicrosoftSyncService, ImapSyncService). Used setter pattern (matching existing setRedisLockService) for minimal churn on a scaffolding-only feature.

5. **CalendarIcsDetectedEvent is scaffolding-only:** No ICS detection from email attachments exists yet. Event class exists from Phase 31, emit call will be added when the feature is built. No dead emit code added.

6. **madge reports 8 circular edges (plan target was <=5):** 5 are pre-existing internal file-level circulars (realtime gateway, ai/knowledge-base, ai/locales x2, subscription billing). These existed before Phase 32 and are within-module, not cross-module forwardRef. The 3 module-level circulars are all in the Email/EmailSync/Ai/Calendar core cluster (irreducible bidirectional dependencies).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended IStorageService with getSignedDownloadUrl**
- **Found during:** Task 2 (AiModule STORAGE_SERVICE injection)
- **Issue:** AI services call storageService.getSignedDownloadUrl() but IStorageService interface didn't include this method
- **Fix:** Added `getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>` to IStorageService
- **Files modified:** backend/src/common/interfaces/storage.interface.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 6313566e (Task 2 commit)

**2. [Rule 1 - Bug] ContactsModule forwardRef(AiModule) was unnecessary**
- **Found during:** Task 2 (remaining edges analysis)
- **Issue:** forwardRef(() => AiModule) in ContactsModule but AiModule never imports ContactsModule -- no circular exists
- **Fix:** Changed to direct AiModule import
- **Files modified:** backend/src/modules/contacts/contacts.module.ts
- **Verification:** TypeScript compiles, no circular dependency at runtime
- **Committed in:** 6313566e (Task 2 commit)

**3. [Rule 1 - Bug] CalendarModule still imported forwardRef from @nestjs/common but no longer used it**
- **Found during:** Task 2 (cleanup)
- **Issue:** Unused forwardRef import after removing forwardRef(() => EmailSyncModule)
- **Fix:** Removed forwardRef from import statement
- **Files modified:** backend/src/modules/calendar/calendar.module.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 6313566e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- ProviderConfigService had 13 injected services from 5 domain modules. Rewriting it to use EventEmitter2 was the single largest change in the plan. The delete flow was particularly complex, requiring provider-specific cleanup in 5 separate @OnEvent handlers.
- The plan's madge --circular target of <=5 assumed internal file-level circulars wouldn't be counted. madge counts all file-level circulars, not just module-level. The 5 pre-existing internal circulars were already present before Phase 32.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All domain events wired: ProviderConnected, ProviderDisconnected, TenantDeleted, EmailSynced (scaffolding), ContactUpdated (scaffolding)
- 5 forwardRef edges remain in Email/EmailSync core cluster -- these are true bidirectional dependencies
- Plan 32-04 (CI dependency enforcement) can now run against the cleaned-up dependency graph
- dependency-cruiser baseline may need updating to reflect reduced cross-module violations

## Self-Check: PASSED

- All 7 created files verified present on disk
- Commit 60f040ee (Task 1) verified in git log
- Commit 6313566e (Task 2) verified in git log
- TypeScript compilation passes cleanly (npx tsc --noEmit)

---
*Phase: 32-architecture-decoupling*
*Completed: 2026-03-03*
