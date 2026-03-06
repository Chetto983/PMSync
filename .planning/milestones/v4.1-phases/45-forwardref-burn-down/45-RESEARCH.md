# Phase 45: forwardRef Burn-Down - Research

**Researched:** 2026-03-06
**Domain:** NestJS circular dependency elimination
**Confidence:** HIGH

## Summary

The codebase has 17 distinct `forwardRef()` call sites across the backend (excluding comments and documentation). These break down into four clear clusters: (1) module-level circular imports between EmailModule, EmailSyncModule, AuthModule, AiModule, and CalendarModule; (2) intra-module circular references between queue services and workers within EmailSyncModule; (3) intra-module circular references between KnowledgeBaseService and embedding queue services within AiModule; (4) unnecessary forwardRef to a @Global service (DeadLetterQueueService).

The project already has a mature EventEmitter2 setup (`@nestjs/event-emitter ^3.0.1`, `EventEmitterModule.forRoot()` in AppModule) with 5 domain event types defined in `common/events/`. Phase 32 successfully used this pattern to eliminate forwardRef from ProvidersModule, ComplianceModule, LabelsModule, and UsersModule. The same patterns directly apply here.

**Primary recommendation:** Eliminate forwardRef in 4 waves: (1) remove 3 unnecessary DLQ forwardRefs, (2) break worker-queue circular refs via direct injection or interfaces, (3) break AI service circular refs via interface extraction, (4) break module-level circular imports via shared service extraction and domain events.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEBT-01 | forwardRef reduced from 24 to <=12 files | Full inventory: 17 actual call sites in 14 files; all elimination strategies documented |
| DEBT-02 | email.module.ts forwardRef (4 refs) reduced to 1 via EventEmitter2 domain events | EmailModule has 2 forwardRef (EmailSyncModule, CalendarModule); EmailSyncModule has 2 (EmailModule, AiModule); strategies documented |
| DEBT-03 | email-sync.module.ts forwardRef (3 refs) reduced to 1 via shared interfaces in common/ | Worker-queue forwardRef pattern identified; interface extraction strategy documented |
| DEBT-04 | auth.module.ts forwardRef (3 refs) reduced to 1 via shared user lookup service | Auth has 1 forwardRef to EmailModule; EmailService extraction to common/ documented |
| DEBT-05 | Worker file forwardRef removed via module provider injection | 5 worker files with forwardRef; all are same-module refs resolvable via provider ordering |
| TEST-08 | forwardRef removal regression -- NestJS module bootstrap succeeds, all DI chains resolve | Bootstrap smoke test + event-wiring test patterns documented |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/common | ^11.1.13 | DI container, Inject, Injectable | Already in use |
| @nestjs/event-emitter | ^3.0.1 | EventEmitter2 integration | Already wired in AppModule |
| @nestjs/core | ^11.1.13 | Module system, forwardRef (removing) | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nestjs/testing | ^11.1.13 | Test module builder | Bootstrap validation tests |
| jest | ^30.2.0 | Test runner | All regression tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| EventEmitter2 domain events | Dedicated message broker (Redis pub/sub) | Overkill -- EventEmitter2 is synchronous in-process, zero latency, already wired |
| Interface injection tokens | Barrel file reordering | Reordering is fragile; interface tokens are explicit and stable |

**Installation:** No new packages needed. Everything required is already installed.

## Architecture Patterns

### Current forwardRef Inventory (17 call sites, 14 files)

#### Cluster A: Module-Level Circular Imports (5 forwardRef)
| File | forwardRef Target | Circular Chain |
|------|-------------------|----------------|
| email.module.ts:66 | EmailSyncModule | Email <-> EmailSync |
| email.module.ts:67 | CalendarModule | Email <-> Calendar (via EmailSyncModule) |
| email-sync.module.ts:77 | EmailModule | EmailSync <-> Email |
| email-sync.module.ts:78 | AiModule | EmailSync <-> AI (via embedding queues) |
| auth.module.ts:56 | EmailModule | Auth -> Email (Email doesn't import Auth -- may not be truly circular) |

#### Cluster B: Worker <-> Queue Service (7 forwardRef)
| File | forwardRef Target | Pattern |
|------|-------------------|---------|
| sync.worker.ts:54 | SyncSchedulerService | Worker needs scheduler for reschedule |
| bulk-operations.worker.ts:45 | BulkOperationsQueueService | Worker needs queue for metrics/pause |
| bulk-operations.worker.ts:47 | ProviderSyncBackQueueService | Worker triggers sync-back after bulk op |
| email-send.worker.ts:43 | EmailSendQueueService | Worker needs queue for metrics |
| folder-operations.worker.ts:54 | RealtimeEventsService | Worker emits realtime events |
| sync-back.worker.ts:45 | ProviderSyncBackQueueService | Worker needs queue for metrics |
| email-send.service.ts:42 | EmailSendQueueService | Service queues async send |

#### Cluster C: AI Embedding Circular Refs (4 forwardRef)
| File | forwardRef Target | Pattern |
|------|-------------------|---------|
| email-embedding.queue.ts:51 | KnowledgeBaseService | Queue calls KB for processing |
| contact-embedding.queue.ts:53 | KnowledgeBaseService | Queue calls KB for processing |
| knowledge-base.service.ts:53 | EmailEmbeddingQueueService | KB enqueues embedding jobs |
| embedding-backfill.service.ts:104 | EmailEmbeddingQueueService | Backfill enqueues jobs |

#### Cluster D: Unnecessary forwardRef to @Global Service (3 forwardRef)
| File | forwardRef Target | Why Unnecessary |
|------|-------------------|-----------------|
| bulk-operations-queue.service.ts:123 | DeadLetterQueueService | DLQ is @Global via CacheModule |
| provider-sync-back-queue.service.ts:108 | DeadLetterQueueService | DLQ is @Global via CacheModule |
| email-send-queue.service.ts:134 | DeadLetterQueueService | DLQ is @Global via CacheModule |

**Note:** The grep count of 46 lines includes imports, comments, and documentation references. The actual `forwardRef()` **call sites** are 17+2 (the 2 at import level in modules that also have service-level ones).

### Pattern 1: Remove Unnecessary forwardRef (Cluster D)
**What:** DeadLetterQueueService is provided by CacheModule which is @Global. No forwardRef needed.
**When to use:** Service is globally available.
**Example:**
```typescript
// BEFORE
@Inject(forwardRef(() => DeadLetterQueueService))
deadLetterQueue: DeadLetterQueueService,

// AFTER - just remove forwardRef wrapper
deadLetterQueue: DeadLetterQueueService,
// Or if inherited from BaseQueueService, the base class already accepts it as optional
```

### Pattern 2: Interface Token Extraction (Clusters B and C)
**What:** Extract an interface to `common/interfaces/`, use injection token, provider registers concrete class.
**When to use:** Two services in the same module reference each other.
**Example:**
```typescript
// common/interfaces/embedding-queue.interface.ts
export const EMBEDDING_QUEUE = Symbol('EMBEDDING_QUEUE');
export interface IEmbeddingQueue {
  enqueueEmail(job: EmailEmbeddingJob): Promise<void>;
}

// ai.module.ts
providers: [
  { provide: EMBEDDING_QUEUE, useClass: EmailEmbeddingQueueService },
]

// knowledge-base.service.ts -- no forwardRef needed
constructor(
  @Inject(EMBEDDING_QUEUE) private readonly embeddingQueue: IEmbeddingQueue,
) {}
```

### Pattern 3: Shared Transactional Email Service (Auth -> Email)
**What:** Extract EmailService (nodemailer transactional sender) to `common/services/` or a lightweight `TransactionalEmailModule`. It has ZERO dependencies on the email domain -- it only uses nodemailer + config.
**When to use:** Auth needs to send OTP/password-reset emails but doesn't need the full EmailModule graph.
**Example:**
```typescript
// common/services/transactional-email.service.ts (renamed from EmailService)
// Move the 100-line nodemailer service out of email module
// Make it a @Global provider or a lightweight TransactionalEmailModule

// auth.module.ts -- no forwardRef(() => EmailModule) needed
```

### Pattern 4: Domain Events (Module-Level Decoupling)
**What:** Replace direct module imports with EventEmitter2 events for cross-module communication.
**When to use:** Module A triggers behavior in Module B but doesn't need a return value.
**Already proven:** Phase 32 used this pattern for Provider -> Calendar/Contacts/Compliance/AI.

### Pattern 5: Provider Ordering Fix (Workers)
**What:** Workers and queue services in the same module can use direct injection if provider ordering is correct (services before workers in the providers array). NestJS resolves within the same module without forwardRef if declaration order is correct.
**When to use:** forwardRef between two providers in the same @Module.
**Caveat:** This works because NestJS 11 resolves same-module providers regardless of array order. The forwardRef in workers was likely defensive. Test by removing and verifying bootstrap.

### Anti-Patterns to Avoid
- **Moving services between modules without updating exports:** Always verify the service is exported from its new home module.
- **Breaking the @OnEvent handler contract:** Event handlers must wrap body in try/catch (established pattern, Pitfall 3 in codebase).
- **Creating deep module import chains:** Prefer @Global for truly shared services, interface tokens for same-module cycles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-module decoupling | Custom mediator/message bus | @nestjs/event-emitter EventEmitter2 | Already wired, proven in Phase 32, zero config |
| DI token abstraction | String-based injection tokens | Symbol-based tokens with interface | Type-safe, discoverable, refactor-friendly |
| Transactional email | Inline nodemailer in each module | Extracted shared service/module | EmailService has zero domain dependencies |

## Common Pitfalls

### Pitfall 1: Breaking Provider Resolution Order
**What goes wrong:** Removing forwardRef between same-module providers causes "Cannot resolve dependency" error.
**Why it happens:** NestJS needs to resolve all constructor params before instantiation. If Service A and Service B reference each other, NestJS can handle it within the same module, but NOT if one is from an imported module.
**How to avoid:** For same-module cycles, test bootstrap after each removal. For cross-module, use interface tokens or events.
**Warning signs:** `Nest can't resolve dependencies of...` error at startup.

### Pitfall 2: EventEmitter2 Handlers Not Firing
**What goes wrong:** @OnEvent handler is defined but never triggers.
**Why it happens:** The handler's host module wasn't imported in AppModule, or the event name doesn't match.
**How to avoid:** Use static `eventName` constants (already the pattern). Verify module is registered. Write event-wiring integration test (pattern exists in `common/events/__tests__/event-wiring.spec.ts`).
**Warning signs:** No handler log output when event should fire.

### Pitfall 3: Transactional Email Service Extraction Breaking Auth
**What goes wrong:** After extracting EmailService from EmailModule, auth registration or password reset stops sending emails.
**Why it happens:** The service reference path changes, or the new module isn't imported.
**How to avoid:** Keep the same class name or create a re-export alias. Run auth flow E2E test after extraction.
**Warning signs:** Registrations/password resets complete without sending email.

### Pitfall 4: Queue Services Losing DLQ Integration
**What goes wrong:** After removing forwardRef to DLQ, failed jobs silently disappear instead of going to DLQ.
**Why it happens:** BaseQueueService accepts DLQ as optional (`?`). If injection fails silently, DLQ becomes undefined.
**How to avoid:** DLQ is @Global, so removing forwardRef should just work. But verify by checking DLQ is still injected (not undefined) after change.

### Pitfall 5: Breaking Email <-> EmailSync Bidirectional Dependency
**What goes wrong:** EmailModule and EmailSyncModule have legitimate bidirectional needs (Email needs sync queue services; EmailSync needs AttachmentStorageService).
**Why it happens:** These modules are tightly coupled by design.
**How to avoid:** Extract shared services (AttachmentStorageService is already in StorageModule). For remaining deps, consider merging these modules or using interface tokens.

## Code Examples

### Example 1: Removing DeadLetterQueueService forwardRef
```typescript
// BEFORE (bulk-operations-queue.service.ts)
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

constructor(
  // ...
  @Inject(forwardRef(() => DeadLetterQueueService))
  deadLetterQueue: DeadLetterQueueService,
) { super(configService, deadLetterQueue); }

// AFTER
import { Injectable } from '@nestjs/common';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';

constructor(
  // ...
  deadLetterQueue: DeadLetterQueueService,
) { super(configService, deadLetterQueue); }
```

### Example 2: AI Embedding Interface Token
```typescript
// common/interfaces/embedding-queue.interface.ts
import { EmailEmbeddingJob } from '../../modules/ai/services/email-embedding.queue';

export const EMAIL_EMBEDDING_QUEUE = Symbol('EMAIL_EMBEDDING_QUEUE');

export interface IEmailEmbeddingQueue {
  enqueue(job: EmailEmbeddingJob): Promise<void>;
  enqueueBulk(jobs: EmailEmbeddingJob[]): Promise<void>;
}
```

### Example 3: Extracting TransactionalEmailService
```typescript
// common/services/transactional-email.service.ts
// Move EmailService from modules/email/services/email.service.ts
// It has NO NestJS module dependencies -- only nodemailer + config
// Keep the same API: sendOtp(), sendPasswordReset(), sendEmail()

// common/services/transactional-email.module.ts
@Global()
@Module({
  providers: [TransactionalEmailService],
  exports: [TransactionalEmailService],
})
export class TransactionalEmailModule {}
```

### Example 4: Domain Event for Email -> EmailSync Decoupling
```typescript
// common/events/email.events.ts (extend existing)
export class EmailSendRequestedEvent {
  static readonly eventName = 'email.send-requested' as const;
  constructor(
    public readonly tenantId: string,
    public readonly providerId: string,
    public readonly sendData: Record<string, unknown>,
  ) {}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| forwardRef() everywhere | EventEmitter2 domain events | Phase 32 (v4.0) | Eliminated 6+ forwardRef in providers/compliance/labels/users |
| Direct cross-module service injection | @Global modules for shared infra | NestJS 10+ | CacheModule, ToolRegistryModule already @Global |
| Class-based injection tokens | Symbol-based InjectionToken | NestJS best practice | Type-safe, prevents name collisions |

**NestJS 11 note:** Same-module provider resolution works without forwardRef in most cases. The forwardRef in worker constructors may be unnecessary defensive coding from earlier NestJS versions.

## Open Questions

1. **EmailModule <-> EmailSyncModule: Can these be merged?**
   - What we know: They have extensive bidirectional dependencies. StorageModule already extracted shared parts.
   - What's unclear: Whether merging would exceed the 500-line module file limit or create too-large a module.
   - Recommendation: Keep separate but use interface tokens for the remaining cross-references. AttachmentStorageService is already in StorageModule.

2. **Are all worker forwardRef actually necessary?**
   - What we know: Workers and queue services are in the same module (EmailSyncModule). NestJS 11 should resolve same-module deps without forwardRef.
   - What's unclear: Whether there's a circular initialization issue with BullMQ worker setup during OnModuleInit.
   - Recommendation: Test removing forwardRef one at a time with bootstrap validation. High chance 5+ are unnecessary.

3. **folder-operations.worker.ts -> RealtimeEventsService**
   - What we know: RealtimeEventsService is in RealtimeModule (imported by EmailSyncModule). This is a cross-module ref but RealtimeModule is imported directly (no forwardRef at module level).
   - What's unclear: Why forwardRef is used at the service level when the module import isn't circular.
   - Recommendation: Remove forwardRef -- likely unnecessary since RealtimeModule import is direct.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest 29.4.6 |
| Config file | backend/jest.config.js |
| Quick run command | `cd backend && npx jest --testPathPattern="<pattern>" --no-coverage` |
| Full suite command | `cd backend && npx jest --no-coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEBT-01 | forwardRef count <= 12 | smoke | `grep -r "forwardRef(" backend/src \| grep -v "node_modules\|\.spec\.\|\.test\.\|// \|\\* " \| wc -l` | N/A (shell check) |
| DEBT-02 | email.module.ts forwardRef reduced | unit | `cd backend && npx jest --testPathPattern="email.module" --no-coverage` | TBD Wave 0 |
| DEBT-03 | email-sync.module.ts forwardRef reduced | unit | `cd backend && npx jest --testPathPattern="email-sync" --no-coverage` | TBD Wave 0 |
| DEBT-04 | auth.module.ts forwardRef reduced | unit | `cd backend && npx jest --testPathPattern="auth" --no-coverage` | TBD Wave 0 |
| DEBT-05 | Worker forwardRef removed | unit | `cd backend && npx jest --testPathPattern="worker" --no-coverage` | TBD Wave 0 |
| TEST-08 | NestJS bootstrap succeeds, all DI resolves | integration | `cd backend && npx jest --testPathPattern="bootstrap\|module-bootstrap" --no-coverage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `grep -rc "forwardRef(" backend/src/ | grep -v ":0$" | wc -l` (count files with forwardRef)
- **Per wave merge:** `cd backend && npx jest --no-coverage` (full suite)
- **Phase gate:** Full suite green + forwardRef count <= 12 + bootstrap test green

### Wave 0 Gaps
- [ ] `backend/src/__tests__/module-bootstrap.spec.ts` -- NestJS TestingModule.compile() smoke test verifying all modules resolve
- [ ] Event-wiring tests for new domain events (extend `common/events/__tests__/event-wiring.spec.ts`)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All 17 forwardRef call sites manually traced and categorized
- Existing event pattern: `common/events/` (5 event types), `provider-event-handler.service.ts` (4 handler services)
- Phase 32 precedent: Documented in STATE.md -- successfully eliminated forwardRef from ProvidersModule, ComplianceModule, LabelsModule, UsersModule
- CacheModule: Confirmed @Global with DeadLetterQueueService export (cache.module.ts)

### Secondary (MEDIUM confidence)
- NestJS 11 same-module resolution: Worker forwardRef may be unnecessary based on NestJS DI behavior, but needs empirical verification via bootstrap test

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all tools already in use
- Architecture: HIGH - 4 clear clusters identified with proven elimination patterns
- Pitfalls: HIGH - codebase-specific pitfalls documented from actual dependency analysis

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- NestJS DI patterns don't change within minor versions)
