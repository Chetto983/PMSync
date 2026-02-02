# Phase 6: Base Sync Extraction - Research

**Researched:** 2026-02-02
**Domain:** Internal codebase refactoring - base-email-sync.service.ts extraction
**Confidence:** HIGH (codebase analysis, established patterns from Phases 3-5)

## Summary

This research analyzes `base-email-sync.service.ts` (1,382 lines) to identify natural extraction boundaries for sync orchestration components. The file is an abstract base class extended by `GoogleSyncService`, `MicrosoftSyncService`, and `ImapSyncService`. The extraction follows the proven facade pattern from Phases 3-5.

**Key finding:** The file has 3 clear functional groups:
1. **Sync orchestration** (lines 81-219): Entry point `syncProvider()` + token refresh logic
2. **Full/Incremental sync** (lines 331-552): `syncFullWithDriver()` + `syncIncrementalWithDriver()`
3. **Message processing** (lines 652-1317): `handleMessageDeletion()` + `upsertMessageFromDriver()` + `processMessagesBatch()`

**Primary recommendation:** Extract 3 services following the composition pattern rather than inheritance to avoid circular dependencies.

## Current File Analysis

### Line Count by Section

| Section | Lines | Method(s) | Responsibility |
|---------|-------|-----------|----------------|
| Imports + Class Declaration | 1-50 | constructor, properties | Setup |
| Module Init | 51-76 | `onModuleInit()` | Configuration |
| **Sync Orchestration** | 81-219 | `syncProvider()` | Entry point, driver lifecycle |
| Abstract Methods | 224-242 | `getDriverCredentials()`, `createDriver()`, `onBeforeSync()` | Provider-specific hooks |
| **Token Management** | 247-306 | `isTokenExpiringSoon()`, `refreshDriverIfNeeded()`, `getListMessagesOptions()` | OAuth token handling |
| Hooks | 313-328 | `onIncrementalChanges()` | Provider-specific incremental handling |
| **Full Sync** | 331-446 | `syncFullWithDriver()` | Multi-folder full sync |
| **Incremental Sync** | 453-552 | `syncIncrementalWithDriver()` | Delta/history sync |
| Abstract Embedding/Batch | 558-584 | `getEmbeddingQueue()`, `getBatchIndexingService()`, `processAttachmentsForMessage()` | Provider injection |
| IMAP Parser | 597-638 | `parseImapExternalId()` | Legacy IMAP format |
| **Message Deletion** | 652-708 | `handleMessageDeletion()` | DB deletion + realtime events |
| **Message Upsert** | 725-1013 | `upsertMessageFromDriver()` | Single message with locks |
| **Batch Processing** | 1027-1317 | `processMessagesBatch()` | Bulk upsert + AI triggers |
| Utilities | 1340-1382 | `truncateText()`, `sleep()`, `extractErrorMessage()` | Helpers |

### Method Dependencies

```
syncProvider() ─────────────────────────────────────────────────────────┐
    │                                                                    │
    ├── getDriverCredentials() [abstract - provider implements]          │
    ├── createDriver() [abstract - provider implements]                  │
    ├── onBeforeSync() [virtual - IMAP overrides]                       │
    │                                                                    │
    ├── syncIncrementalWithDriver() ──────┐                             │
    │   ├── refreshDriverIfNeeded() ──────┼── isTokenExpiringSoon()     │
    │   │   └── getDriverCredentials()    │                             │
    │   ├── driver.getChangesSince()      │                             │
    │   ├── onIncrementalChanges() [virtual - MS overrides]             │
    │   ├── handleMessageDeletion() ──────┼── parseImapExternalId()     │
    │   │   └── emitEmailDelete()         │                             │
    │   └── upsertMessageFromDriver() ────┤                             │
    │                                     │                             │
    └── syncFullWithDriver() ─────────────┘                             │
        ├── refreshDriverIfNeeded()                                     │
        ├── driver.listMessages()                                       │
        ├── processMessagesBatch() ────────────────────────────────────┤
        │   ├── getEmbeddingQueue() [abstract]                          │
        │   ├── getBatchIndexingService() [abstract]                    │
        │   ├── processAttachmentsForMessage() [abstract]               │
        │   ├── followUpService.analyzeAndCreateFollowUp()              │
        │   ├── followUpService.checkAndResolveReplyFollowUp()          │
        │   └── writingStyleService.learnFromEmail()                    │
        └── driver.getInitialSyncToken()                                │
                                                                        │
realtimeEvents ────────────────────────────────────────────────────────┘
```

### Inheritance Chain

```
BaseEmailSyncService (abstract, 1382 lines)
        │
        ├── GoogleSyncService (134 lines)
        │   └── Implements: getDriverCredentials, createDriver, getEmbeddingQueue,
        │                   getBatchIndexingService, processAttachmentsForMessage
        │
        ├── MicrosoftSyncService (175 lines)
        │   └── Implements: Same + overrides onIncrementalChanges()
        │
        └── ImapSyncService (183 lines)
            └── Implements: Same + overrides onBeforeSync(), getListMessagesOptions()
```

## Architecture Patterns

### Pattern 1: Composition Over Inheritance (RECOMMENDED)

The roadmap proposes extracting `sync-incremental`, `sync-full`, and `sync-token` services. However, the current inheritance-based design creates tight coupling.

**Recommended approach:** Keep `BaseEmailSyncService` as an abstract orchestrator but extract the heavy implementation into composable services:

```typescript
// NEW: Extracted service (injected by composition)
@Injectable()
export class SyncOrchestrationService {
  async executeFullSync(context: SyncContext): Promise<SyncResult> { /* ... */ }
  async executeIncrementalSync(context: SyncContext): Promise<SyncResult> { /* ... */ }
}

// NEW: Extracted service
@Injectable()
export class SyncMessageProcessorService {
  async handleDeletion(messageId: string, context: SyncContext): Promise<void> { /* ... */ }
  async upsertMessage(message: CanonicalMessage, context: SyncContext): Promise<UpsertResult> { /* ... */ }
  async processBatch(messages: CanonicalMessage[], context: SyncContext): Promise<BatchResult> { /* ... */ }
}

// NEW: Extracted service
@Injectable()
export class SyncTokenService {
  isTokenExpiringSoon(tokenExpiresAt: Date | null): boolean { /* ... */ }
  async refreshDriverIfNeeded(driver: IEmailDriver, context: RefreshContext): Promise<RefreshResult> { /* ... */ }
}

// REFACTORED: Thin abstract base
abstract class BaseEmailSyncService {
  constructor(
    private syncOrchestration: SyncOrchestrationService,
    private messageProcessor: SyncMessageProcessorService,
    private tokenService: SyncTokenService,
    // ... other deps
  ) {}

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    // Thin orchestration using injected services
  }
}
```

### Pattern 2: Context Object for Cross-Service Communication

To avoid circular dependencies and excessive parameter passing:

```typescript
interface SyncContext {
  tenantId: string;
  providerId: string;
  userId?: string;
  driver: IEmailDriver;
  tokenExpiresAt?: Date | null;

  // Callbacks for provider-specific behavior
  getEmbeddingQueue: () => EmailEmbeddingQueueService;
  getBatchIndexingService: () => BatchIndexingService;
  processAttachments: (driver, emailId, tenantId, providerId, externalId, attachments) => Promise<void>;
}
```

### Pattern 3: Keep Virtual Hooks in Base Class

The following methods are provider-specific hooks that should remain in the base class:
- `onBeforeSync()` - IMAP checks CONDSTORE capability
- `onIncrementalChanges()` - Microsoft detects delta token expiration
- `getListMessagesOptions()` - IMAP adds `includeBody: true`

These are small (5-20 lines each) and provide extension points.

## Proposed Extraction Boundaries

### Service 1: SyncOrchestrationService (~300 lines)

**Extracts from:** Lines 331-446 (`syncFullWithDriver`) + Lines 453-552 (`syncIncrementalWithDriver`)

**Methods:**
- `executeFullSync(context: SyncContext, config: FullSyncConfig): Promise<SyncResult>`
- `executeIncrementalSync(context: SyncContext, lastSyncToken: string): Promise<IncrementalResult>`

**Key behaviors to preserve:**
1. Multi-folder sync: `foldersToSync = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE']`
2. Per-folder pagination with `messagesPerFolder` limit
3. Cross-folder deduplication via `processedExternalIds` Set
4. Token refresh check every batch (`refreshDriverIfNeeded`)
5. MAX_PAGES safety limit (25 for full, 50 for incremental per TOKEN_CHECK_INTERVAL)

### Service 2: SyncMessageProcessorService (~450 lines)

**Extracts from:** Lines 652-708 (`handleMessageDeletion`) + Lines 725-1013 (`upsertMessageFromDriver`) + Lines 1027-1317 (`processMessagesBatch`)

**Methods:**
- `handleDeletion(messageId: string, providerId: string, tenantId: string): Promise<DeletionResult>`
- `upsertMessage(driver, message, providerId, tenantId, userId?): Promise<UpsertResult>`
- `processBatch(driver, messages, providerId, tenantId, userId?): Promise<BatchResult>`

**Key behaviors to preserve:**
1. RC-1: Redis distributed lock (`email:upsert:${providerId}:${msg.id}`)
2. RC-2/RC-6: Optimistic locking - preserve user modifications within 5 minutes
3. Raw SQL conditional update for atomicity
4. P2002/P2034 retry logic (3 attempts, exponential backoff)
5. P11: Batch indexing for 100+ emails (50% cost savings)
6. Follow-up analysis only for recent emails (`isRecentEmailHelper`)
7. Writing style learning for SENT folder

**This is the largest extraction** due to complex upsert logic with race condition fixes.

### Service 3: SyncTokenService (~150 lines)

**Extracts from:** Lines 247-298 (`isTokenExpiringSoon`, `refreshDriverIfNeeded`)

**Methods:**
- `isTokenExpiringSoon(tokenExpiresAt: Date | null, thresholdMs?: number): boolean`
- `refreshDriverIfNeeded(currentDriver, providerId, tokenExpiresAt, getDriverCredentials, createDriver): Promise<RefreshResult>`

**Key behaviors to preserve:**
1. CRIT-3 FIX: 2-minute threshold before expiry
2. Graceful driver swap: disconnect old, create new
3. Error handling: throw on refresh failure (FIX Phase 1.3)

### Remaining in Base Class (~350 lines)

**Keeps:**
- Constructor + `onModuleInit()` (~50 lines)
- `syncProvider()` entry point, refactored to use services (~100 lines)
- Abstract method declarations (~30 lines)
- Virtual hooks (`onBeforeSync`, `onIncrementalChanges`, `getListMessagesOptions`) (~40 lines)
- Utilities (`parseImapExternalId`, `truncateText`, `sleep`, `extractErrorMessage`) (~80 lines)

## Dependency Analysis

### External Dependencies (Keep in Base)

These are injected in constructor and passed to child classes:
- `PrismaService` - DB operations
- `RealtimeEventsService` - WebSocket events
- `ConfigService` - Configuration
- `FollowUpService` - AI follow-up analysis
- `WritingStyleService` - Writing style learning

### Cross-Cutting Concerns

| Concern | Currently | After Extraction |
|---------|-----------|------------------|
| Redis locks | `redisLock` property, `setRedisLockService()` | Pass to `SyncMessageProcessorService` |
| Realtime events | `realtimeEvents` property | Pass via context to services |
| Embeddings queue | Abstract `getEmbeddingQueue()` | Callback in context |
| Batch indexing | Abstract `getBatchIndexingService()` | Callback in context |
| Attachments | Abstract `processAttachmentsForMessage()` | Callback in context |

## Don't Hand-Roll

| Problem | Already Exists | Where |
|---------|---------------|-------|
| Distributed locks | `RedisLockService` | `common/services/redis-lock.service.ts` |
| P2002/P2034 retry | `PrismaRetryService` | `common/services/prisma-retry.service.ts` |
| Retry with backoff | `withRetry()` | `common/utils/retry.utils.ts` |
| Circuit breaker | `RedisCircuitBreakerService` | `common/services/redis-circuit-breaker.service.ts` |
| Token refresh | `ProviderTokenService` | `services/provider-token.service.ts` |

**CRITICAL:** Do NOT create new retry or lock mechanisms. Use existing services.

## Common Pitfalls

### Pitfall 1: Breaking Child Class Contracts

**What goes wrong:** Child classes (GoogleSyncService, MicrosoftSyncService, ImapSyncService) depend on protected methods being available.

**Why it happens:** Extracting methods to services makes them inaccessible to child classes.

**How to avoid:**
1. Keep method signatures in base class
2. Delegate to injected services
3. Maintain backward compatibility - child classes should not change

**Warning signs:** Child class tests fail after extraction.

### Pitfall 2: Circular Dependencies with Callbacks

**What goes wrong:** Extracted services need access to abstract methods that child classes implement.

**Why it happens:** `processAttachmentsForMessage()` is abstract in base but called by message processor.

**How to avoid:** Use callback pattern (proven in Phase 5):
```typescript
const context: SyncContext = {
  processAttachments: (driver, emailId, tenantId, providerId, externalId, attachments) =>
    this.processAttachmentsForMessage(driver, emailId, tenantId, providerId, externalId, attachments),
};
```

### Pitfall 3: Lost Race Condition Fixes

**What goes wrong:** Race condition fixes (RC-1 through RC-9) scattered across methods get lost during extraction.

**Why it happens:** Complex upsert logic with multiple fix comments.

**How to avoid:**
1. Keep all `// RC-* FIX:` comments during extraction
2. Verify Redis lock key format: `email:upsert:${providerId}:${msg.id}`
3. Test concurrent upserts after extraction
4. Verify conditional update SQL is preserved exactly

**Warning signs:** P2002 errors under concurrent sync.

### Pitfall 4: P11 Batch Indexing Logic Split

**What goes wrong:** Batch indexing threshold logic (100+ emails) separated from batch processing.

**Why it happens:** Logic spans `processMessagesBatch` and requires pre-calculating `newEmailIdsForEmbedding`.

**How to avoid:** Keep P11 logic together in `SyncMessageProcessorService.processBatch()`.

## Code Examples

### Existing Pattern: Phase 5 GmailSyncService (Callback Delegation)

**Source:** `drivers/google/services/gmail-sync.service.ts`

```typescript
@Injectable()
export class GmailSyncService {
  private gmail: gmail_v1.Gmail | null = null;

  initialize(gmail: gmail_v1.Gmail): void {
    this.gmail = gmail;
  }

  clear(): void {
    this.gmail = null;
  }

  private ensureInitialized(): void {
    if (!this.gmail) {
      throw new Error('GmailSyncService not initialized. Call initialize() first.');
    }
  }

  async getInitialSyncToken(): Promise<string> {
    this.ensureInitialized();
    // Implementation...
  }

  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureInitialized();
    // Implementation with all error handling preserved...
  }
}
```

### Proposed Pattern: SyncMessageProcessorService

```typescript
@Injectable()
export class SyncMessageProcessorService {
  private readonly logger = new Logger(SyncMessageProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly redisLock: RedisLockService,
  ) {}

  /**
   * RC-1/RC-2/RC-6 preserved: Distributed lock + optimistic locking
   */
  async upsertMessage(
    driver: IEmailDriver,
    message: CanonicalMessage,
    providerId: string,
    tenantId: string,
    context: MessageProcessorContext,
  ): Promise<UpsertResult> {
    const lockKey = `email:upsert:${providerId}:${message.id}`;
    const lockTtlMs = 5000;

    // RC-9: Lock is REQUIRED
    if (!this.redisLock) {
      throw new Error('RC-9: RedisLockService is REQUIRED');
    }

    return this.redisLock.withLock(lockKey, lockTtlMs, async () => {
      // Exact implementation from lines 740-1013...
    });
  }

  /**
   * P11: Batch processing with 100+ email optimization
   */
  async processBatch(
    driver: IEmailDriver,
    messages: CanonicalMessage[],
    providerId: string,
    tenantId: string,
    context: MessageProcessorContext,
  ): Promise<BatchResult> {
    // Exact implementation from lines 1027-1317...
  }
}

interface MessageProcessorContext {
  userId?: string;
  getEmbeddingQueue: () => EmailEmbeddingQueueService;
  getBatchIndexingService: () => BatchIndexingService;
  processAttachments: ProcessAttachmentsCallback;
  followUpService: FollowUpService;
  writingStyleService: WritingStyleService;
}
```

## Open Questions

### 1. Should parseImapExternalId move to common/utils?

**What we know:** Only used by `handleMessageDeletion()` which is IMAP-specific behavior.
**What's unclear:** Is it called from other IMAP code?
**Recommendation:** Keep in base class for now. Extract to `common/utils/imap-utils.ts` only if used elsewhere.

### 2. Should utilities (truncateText, sleep, extractErrorMessage) move?

**What we know:** Generic utilities, could be in `common/utils`.
**What's unclear:** Are they used by child classes directly?
**Recommendation:** Move to `common/utils/format.utils.ts` (truncateText), keep sleep/extractErrorMessage in base (tiny).

### 3. Alternative: Extract by responsibility vs by sync type?

**Current plan:** sync-incremental, sync-full, sync-token (by sync type)
**Alternative:** sync-orchestration, message-processor, token-service (by responsibility)
**Recommendation:** Responsibility-based extraction is cleaner because sync-full and sync-incremental share message processing logic.

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Extraction boundaries | HIGH | Clear method groups, established pattern from Phases 3-5 |
| Race condition preservation | HIGH | All RC-* fixes documented inline, tests exist |
| Child class compatibility | HIGH | GoogleSyncService/MicrosoftSyncService/ImapSyncService are thin |
| Line count targets | MEDIUM | 350 for base seems achievable, message processor may exceed 450 |
| Test coverage | MEDIUM | No direct tests for base-email-sync.service.ts exist |

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** `base-email-sync.service.ts` (1,382 lines)
- **Phase 5 patterns:** `drivers/google/services/gmail-sync.service.ts`, `microsoft-sync.service.ts`
- **Child class contracts:** `GoogleSyncService` (134 lines), `MicrosoftSyncService` (175 lines), `ImapSyncService` (183 lines)
- **STATE.md:** Prior decisions on facade pattern, DI ordering, callback pattern

### Secondary (MEDIUM confidence)
- **ROADMAP.md:** Phase 6 success criteria and plan structure

## Metadata

**Confidence breakdown:**
- Extraction boundaries: HIGH - Clear functional groups identified
- Patterns: HIGH - Phase 3-5 patterns directly applicable
- Pitfalls: HIGH - Known race condition fixes documented

**Research date:** 2026-02-02
**Valid until:** 2026-02-16 (14 days - internal refactoring, stable domain)
