# Architecture Research: Service Decomposition

## Summary

The 7 large service files (1,300-2,249 lines each) exhibit clear functional groupings that can be extracted into focused sub-modules. The decomposition strategy follows NestJS best practices: extract cohesive method groups into dedicated services, maintain backward-compatible facade patterns during migration, and wire new modules via DI. Build order must respect dependency chains: shared utilities first, then drivers, then sync services, finally AI services.

## File Analysis & Current Line Counts

| File | Lines | Location |
|------|-------|----------|
| `imap.driver.ts` | 2,249 | `modules/email-sync/drivers/imap/` |
| `folder-sync.service.ts` | 1,629 | `modules/email-sync/services/` |
| `microsoft.driver.ts` | 1,429 | `modules/email-sync/drivers/microsoft/` |
| `base-email-sync.service.ts` | 1,382 | `modules/email-sync/services/` |
| `knowledge-base.service.ts` | 1,371 | `modules/ai/services/` |
| `google.driver.ts` | 1,364 | `modules/email-sync/drivers/google/` |
| `email.service.ts` | 104 | `modules/email/services/` (NOT a target - already small) |

**Note:** The project context mentioned `emails.service.ts` at 1,705 lines, but the actual file `email.service.ts` is only 104 lines. The monolithic email operations are likely spread across `base-email-sync.service.ts` and the sync services.

---

## Decomposition Strategies

### Strategy 1: Driver Files (IMAP, Google, Microsoft)

#### Pattern: Vertical Slicing by Capability Group

All three drivers implement `IEmailDriver` interface with these method groups:

```
┌─────────────────────────────────────────────────────────────┐
│                     BaseEmailDriver                         │
├─────────────────┬─────────────────┬────────────────────────┤
│  Connection     │  Folder Ops     │  Message Ops           │
│  ───────────    │  ──────────     │  ────────────          │
│  • connect()    │  • listFolders()│  • listMessages()      │
│  • disconnect() │  • getFolder()  │  • getMessage()        │
│  • refreshTokens│  • createFolder │  • sendMessage()       │
│                 │  • deleteFolder │  • moveMessage()       │
│                 │  • renameFolder │  • deleteMessage()     │
├─────────────────┼─────────────────┼────────────────────────┤
│  Sync/Delta     │  Attachments    │  Flags/Labels          │
│  ───────────    │  ───────────    │  ────────────          │
│  • getChanges() │  • getAttachment│  • setReadStatus()     │
│  • subscribe()  │                 │  • setStarredStatus()  │
│  • getSyncToken │                 │  • addLabels()         │
└─────────────────┴─────────────────┴────────────────────────┘
```

#### IMAP Driver Split (2,249 lines → ~5 modules)

```
imap/
├── imap.driver.ts              (~200 lines) - Facade, DI, interface impl
├── imap-connection-pool.ts     (~300 lines) - Pool mgmt, semaphore, cleanup
├── imap-folder.service.ts      (~250 lines) - Folder CRUD, cache
├── imap-message.service.ts     (~500 lines) - Message fetch, parse, batch
├── imap-send.service.ts        (~300 lines) - SMTP send, draft, reply
├── imap-idle.service.ts        (~350 lines) - IDLE subscription, reconnect
├── imap-sync.service.ts        (~250 lines) - Delta sync, CONDSTORE/QRESYNC
└── imap-capabilities.ts        (~100 lines) - Server capability detection
```

**Key extractions:**
1. **Connection Pool** (lines 529-678): `acquireConnection()`, `releaseConnection()`, `cleanupIdleConnections()`, semaphore logic
2. **IDLE Subscription** (lines 226-491): `subscribeToChanges()`, `startIdleConnection()`, `setupIdleEventHandlers()`, reconnect logic
3. **Message Parsing** (lines ~900-1500): `parseMessage()`, `extractBody()`, `parseHeaders()`, attachment handling
4. **Folder Operations** (lines 748-900): `listFolders()`, `getFolder()`, `createFolder()`, `mailboxToCanonicalFolder()`

#### Google Driver Split (1,364 lines → ~4 modules)

```
google/
├── google.driver.ts            (~200 lines) - Facade, DI, interface impl
├── google-folder.service.ts    (~200 lines) - Label CRUD, canonical mapping
├── google-message.service.ts   (~400 lines) - Message fetch, parse, batch
├── google-send.service.ts      (~250 lines) - Send, draft, MIME building
└── google-sync.service.ts      (~300 lines) - History API, delta sync
```

#### Microsoft Driver Split (1,429 lines → ~4 modules)

```
microsoft/
├── microsoft.driver.ts         (~200 lines) - Facade, DI, interface impl
├── microsoft-folder.service.ts (~250 lines) - Folder CRUD, wellKnown mapping
├── microsoft-message.service.ts(~400 lines) - Message fetch, parse, batch
├── microsoft-send.service.ts   (~250 lines) - Send, draft, attachments
└── microsoft-sync.service.ts   (~300 lines) - Delta API, subscription
```

### Strategy 2: Service Files (folder-sync, base-sync)

#### folder-sync.service.ts (1,629 lines → 4 modules)

**Current structure:** Provider-specific sync methods duplicated for IMAP, Gmail, Microsoft

```
folder-sync/
├── folder-sync.service.ts      (~150 lines) - Orchestrator, public API
├── imap-folder-sync.ts         (~350 lines) - IMAP-specific folder sync
├── gmail-folder-sync.ts        (~350 lines) - Gmail label sync
├── microsoft-folder-sync.ts    (~350 lines) - Microsoft folder sync
└── folder-db.service.ts        (~400 lines) - Prisma operations, count updates
```

**Extract by responsibility:**
1. **Provider Routing** (lines 60-85): `syncProviderFolders()` → Keep in main service
2. **IMAP Sync** (lines 90-219): `syncImapFolders()`, `parseImapFolders()` → `imap-folder-sync.ts`
3. **Gmail Sync** (lines 420-558): `syncGmailFolders()` → `gmail-folder-sync.ts`
4. **Microsoft Sync** (lines 563-698): `syncMicrosoftFolders()`, `fetchMicrosoftFolders()` → `microsoft-folder-sync.ts`
5. **DB Operations** (lines 254-415, 700-800): `syncFoldersToDatabase()`, `updateFolderCounts()`, `getFolders()` → `folder-db.service.ts`

#### base-email-sync.service.ts (1,382 lines → 3 modules)

```
sync/
├── base-email-sync.service.ts  (~300 lines) - Abstract base, public API
├── sync-incremental.service.ts (~400 lines) - Delta/incremental sync logic
├── sync-full.service.ts        (~300 lines) - Full sync logic
└── sync-token.service.ts       (~200 lines) - Token refresh, validation
```

**Abstract class refactoring pattern:**
```typescript
// Keep abstract methods in base
abstract class BaseEmailSyncService {
  abstract getDriverCredentials(providerId: string): Promise<{...}>;
  abstract createDriver(driverType: string, credentials: any): Promise<IEmailDriver>;

  // Delegate to extracted services
  constructor(
    private incrementalSync: SyncIncrementalService,
    private fullSync: SyncFullService,
    private tokenService: SyncTokenService,
  ) {}

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    // Orchestration only - delegate to focused services
  }
}
```

### Strategy 3: RAG Services (knowledge-base)

#### knowledge-base.service.ts (1,371 lines → 5 modules)

**Current responsibilities mixed:**
- Embedding creation/deletion
- Content composition (email → embeddable text)
- Backfill orchestration
- Search/retrieval
- Result hydration

```
knowledge-base/
├── knowledge-base.service.ts   (~200 lines) - Public API facade
├── embedding-composer.service.ts(~300 lines) - Content composition, chunking
├── embedding-crud.service.ts   (~250 lines) - Create/delete/list embeddings
├── embedding-search.service.ts (~350 lines) - Vector search, hydration
├── embedding-backfill.service.ts(~200 lines) - Batch backfill orchestration
└── contact-embedding.service.ts(~150 lines) - Contact-specific embeddings
```

**Extract by domain:**
1. **Content Composition** (lines 177-262, 341-480): `composeEmailEmbeddingContent()`, `chunkContentForEmbedding()`, `createBulkEmbeddingsForEmails()`
2. **CRUD Operations** (lines 484-569): `listEmbeddings()`, `deleteEmbedding()`, `deleteEmbeddingsForEmail()`
3. **Search** (lines 571-709): `searchKnowledgeBase()`, `hydrateKnowledgeHits()`, `fetchEmailHydrationMap()`
4. **Backfill** (lines 106-169): `backfillEmailEmbeddingsForTenant()`

---

## Component Boundaries

### Interface Contracts

```
┌──────────────────────────────────────────────────────────────────┐
│                        PUBLIC APIs                               │
│  (Controllers/Queues call these - DO NOT BREAK)                 │
├──────────────────────────────────────────────────────────────────┤
│  IMAPDriver.connect/disconnect/listMessages/getMessage/...      │
│  GoogleDriver.connect/disconnect/listMessages/getMessage/...    │
│  MicrosoftDriver.connect/disconnect/listMessages/getMessage/... │
│  FolderSyncService.syncProviderFolders                          │
│  BaseEmailSyncService.syncProvider                              │
│  KnowledgeBaseService.searchKnowledgeBase                       │
│  KnowledgeBaseService.createEmbeddingForEmail                   │
│  KnowledgeBaseService.backfillEmailEmbeddingsForTenant          │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐
│ Internal Svc A │  │ Internal Svc B  │  │  Internal Svc C    │
│ (Pool Mgmt)    │  │ (Folder Ops)    │  │  (Embedding CRUD)  │
└────────────────┘  └─────────────────┘  └────────────────────┘
```

### Dependency Graph

```
                    ┌───────────────────┐
                    │  common/utils/    │ ← Build FIRST
                    │  (retry, error)   │
                    └─────────┬─────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ IMAP Pool  │    │ Google API │    │ MS Graph   │
    │ Manager    │    │ Client     │    │ Client     │
    └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │ IMAP       │    │ Google     │    │ Microsoft  │
    │ Driver     │    │ Driver     │    │ Driver     │
    └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                  ┌─────────────────┐
                  │ Driver Factory  │
                  └────────┬────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────────┐
    │ Folder     │  │ Base Email │  │ Knowledge Base │
    │ Sync       │  │ Sync       │  │ Service        │
    └────────────┘  └────────────┘  └────────────────┘
```

---

## Build Order

### Phase 1: Foundation (Week 1)
**Goal:** Extract shared utilities, no behavior change

1. **imap-connection-pool.ts** - Pure extraction, no external deps
2. **imap-capabilities.ts** - Pure extraction
3. **retry.utils.ts** consolidation - Already exists in `common/utils/`
4. **prisma-retry.service.ts** consolidation - Already exists

**Validation:** All existing tests pass, no API changes

### Phase 2: Driver Internals (Week 2)
**Goal:** Split driver internals, facade pattern

1. **IMAP Driver Split:**
   - Extract `imap-idle.service.ts`
   - Extract `imap-folder.service.ts`
   - Extract `imap-message.service.ts`
   - Keep `imap.driver.ts` as facade delegating to new services

2. **Google Driver Split:**
   - Extract `google-folder.service.ts`
   - Extract `google-message.service.ts`

3. **Microsoft Driver Split:**
   - Extract `microsoft-folder.service.ts`
   - Extract `microsoft-message.service.ts`

**Validation:** `IEmailDriver` interface unchanged, all driver tests pass

### Phase 3: Sync Services (Week 3)
**Goal:** Split sync orchestration

1. **folder-sync.service.ts Split:**
   - Extract `folder-db.service.ts` (Prisma operations)
   - Extract provider-specific sync modules
   - Keep `folder-sync.service.ts` as orchestrator

2. **base-email-sync.service.ts Split:**
   - Extract `sync-token.service.ts`
   - Extract `sync-incremental.service.ts`
   - Extract `sync-full.service.ts`

**Validation:** Queue workers still function, sync jobs complete

### Phase 4: AI Services (Week 4)
**Goal:** Split knowledge-base

1. **knowledge-base.service.ts Split:**
   - Extract `embedding-composer.service.ts`
   - Extract `embedding-crud.service.ts`
   - Extract `embedding-search.service.ts`
   - Extract `embedding-backfill.service.ts`

**Validation:** RAG queries return same results, backfill works

---

## Interface Preservation

### Facade Pattern (Recommended)

```typescript
// BEFORE: Monolithic
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  // 2,249 lines of mixed concerns
}

// AFTER: Facade + Focused Services
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  constructor(
    private pool: ImapConnectionPoolService,
    private folders: ImapFolderService,
    private messages: ImapMessageService,
    private idle: ImapIdleService,
    private sync: ImapSyncService,
  ) {}

  // Interface methods delegate to focused services
  async listFolders(): Promise<CanonicalFolder[]> {
    return this.folders.listFolders();
  }

  async subscribeToChanges(callback: ChangeCallback): Promise<ProviderSubscription> {
    return this.idle.subscribeToChanges(callback);
  }
}
```

### Module Registration

```typescript
// drivers.module.ts - Wire new services
@Module({
  providers: [
    // New internal services
    ImapConnectionPoolService,
    ImapFolderService,
    ImapMessageService,
    ImapIdleService,
    ImapSyncService,
    // Existing facade (unchanged public API)
    IMAPDriver,
    GoogleDriver,
    MicrosoftDriver,
    // Factory
    DriverFactory,
  ],
  exports: [
    IMAPDriver,
    GoogleDriver,
    MicrosoftDriver,
    DriverFactory,
  ],
})
export class DriversModule {}
```

### Backward Compatibility Checklist

- [ ] `IEmailDriver` interface unchanged
- [ ] `FolderSyncService.syncProviderFolders()` signature unchanged
- [ ] `BaseEmailSyncService.syncProvider()` signature unchanged
- [ ] `KnowledgeBaseService.searchKnowledgeBase()` signature unchanged
- [ ] All queue job handlers work without modification
- [ ] All controller endpoints work without modification
- [ ] All existing tests pass without modification

---

## Risk Mitigation

### High-Risk Extractions

1. **IMAP Connection Pool** - Semaphore/mutex logic is delicate
   - Mitigation: Extract with unit tests for concurrency scenarios
   - Test: 100 concurrent connection requests

2. **IDLE Subscription** - Event listener lifecycle is complex
   - Mitigation: Extract with integration tests against real IMAP server
   - Test: Reconnection after network drop

3. **Folder Sync DB Operations** - Race condition fixes embedded
   - Mitigation: Keep P2002/P2034 retry logic in extracted module
   - Test: Concurrent folder syncs for same provider

### Rollback Strategy

Each phase should be deployable independently:
```
main ─── phase-1-utils ─── phase-2-drivers ─── phase-3-sync ─── phase-4-ai
           │                    │                  │                │
           └─ revert point      └─ revert point    └─ revert point  └─ revert point
```

---

## References

- [NestJS Documentation: Providers](https://docs.nestjs.com/providers)
- [NestJS Documentation: Modules](https://docs.nestjs.com/modules)
- [Clean Architecture in NestJS](https://docs.nestjs.com/fundamentals/custom-providers)
- Existing codebase patterns:
  - `modules/email-sync/services/gmail/gmail-folder.service.ts` (already split)
  - `modules/email-sync/services/microsoft/microsoft-folder.service.ts` (already split)
  - `common/services/prisma-retry.service.ts` (retry pattern)
  - `common/services/redis-lock.service.ts` (concurrency pattern)

---

*Research date: 2026-01-31*
*Analyst: Claude Code Architecture Research*
