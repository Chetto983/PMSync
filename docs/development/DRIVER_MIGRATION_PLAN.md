# Driver Migration Plan: Old Services → Driver Abstraction

> **Status:** Analysis Complete - Migration Strategy Defined
> **Created:** 2025-12-12
> **Migration Approach:** Gradual (Option A from EMAIL_DRIVER_ROADMAP.md)
> **Timeline:** 4-6 weeks (can be done incrementally)

---

## Executive Summary

The email driver abstraction layer is **complete and production-validated** (Phase 2-4 ✅). However, the old provider-specific sync services (`GoogleSyncService`, `MicrosoftSyncService`, `ImapSyncService`) remain in use for email synchronization. This document defines a **gradual migration strategy** to transition from old services to driver-based architecture without disrupting production.

---

## Current Architecture (After Phase 4)

### ✅ What's Complete

1. **Driver Layer** (`backend/src/modules/email-sync/drivers/`)
   - `IEmailDriver` interface with full CRUD operations
   - `GoogleDriver` - Production validated (17/17 tests passed)
   - `MicrosoftDriver` - Production validated (16/16 tests passed)
   - `IMAPDriver` - Production validated (13/15 tests passed, 2 server limitations)
   - `EmailDriverFactory` with `createConnectedDriver()` and `createDriverForProvider()`
   - `ResilientDriverWrapper` with retry, rate limiting, circuit breaker

2. **Canonical Types** (`backend/src/modules/email-sync/drivers/interfaces/`)
   - `CanonicalFolder`, `CanonicalMessage`, `ComposeMessage`
   - Provider-specific mappings (Gmail labels, Microsoft wellKnownName, IMAP special-use)
   - Helper functions for folder type conversion

3. **Real-Time Sync**
   - Gmail Pub/Sub webhooks ✅
   - Microsoft Graph webhooks ✅
   - IMAP IDLE (RFC 2177) ✅

### ⚠️ What's Still Old

1. **Sync Services** (still using direct API calls)
   - `GoogleSyncService` - Full/incremental sync logic
   - `MicrosoftSyncService` - Delta sync logic
   - `ImapSyncService` - IMAP sync logic
   - `BaseEmailSyncService` - Shared sync logic
   - `SyncSchedulerService` - Orchestrates sync jobs

2. **Folder Services** (partially migrated)
   - `GmailFolderService` - Gmail label operations
   - `MicrosoftFolderService` - Graph folder operations (canonical mapping ✅)

3. **Message Parsers** (still provider-specific)
   - `GmailMessageParser` - Parse Gmail messages
   - `MicrosoftMessageParser` - Parse Graph messages

4. **Attachment Handlers** (still provider-specific)
   - `GmailAttachmentHandler` - Download Gmail attachments
   - `MicrosoftAttachmentHandler` - Download Graph attachments

---

## Migration Strategy: Gradual Approach (Recommended)

**Philosophy:** Keep old sync services running for reliability while gradually migrating features to drivers.

### Phase 1: Use Drivers for New Features ✅ COMPLETE

**Status:** Already implemented via driver layer.

**Implementation:**
- ✅ Email composition/sending → Use `driver.sendMessage()`
- ✅ Folder CRUD → Use `driver.createFolder()`, `driver.deleteFolder()`, `driver.renameFolder()`
- ✅ Flag operations → Use `driver.setReadStatus()`, `driver.setStarredStatus()`
- ✅ Attachment retrieval → Use `driver.getAttachment()`

**Benefits:**
- New code uses clean driver API
- Old sync services continue to work
- No risk of breaking existing sync

---

### Phase 2: Wrapper Pattern for Sync Services (Current Step)

**Goal:** Refactor old sync services to use drivers internally, without changing their external API.

**Timeline:** 2-3 weeks

#### Step 2.1: Refactor GoogleSyncService to Use GoogleDriver

**File:** `backend/src/modules/email-sync/services/gmail/google-sync.service.ts`

**Changes:**

```typescript
@Injectable()
export class GoogleSyncService extends BaseEmailSyncService {
  constructor(
    // ... existing dependencies
    private driverFactory: EmailDriverFactory,  // NEW
  ) {
    super(prisma, realtimeEvents, config);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId } = jobData;

    // Get driver instead of creating Gmail client manually
    const driver = await this.driverFactory.createDriverForProvider(providerId);

    // Use driver methods instead of direct Gmail API calls
    const folders = await driver.listFolders();
    const messages = await driver.listMessages({ folder: 'INBOX', pageSize: this.batchSize });

    // ... existing sync logic (database persistence, embeddings, etc.)
  }

  private async syncIncremental(...) {
    // Replace `gmail.users.history.list()` with `driver.getChangesSince()`
  }

  private async syncFull(...) {
    // Replace `gmail.users.messages.list()` with `driver.listMessages()`
  }
}
```

**Benefits:**
- Sync logic remains unchanged
- Database persistence stays in GoogleSyncService
- Webhook handling stays the same
- External API (used by `SyncSchedulerService`) unchanged

**Affected Files:**
- `google-sync.service.ts`
- `gmail-folder.service.ts` (can delegate to driver)
- `gmail-message-parser.ts` (drivers already return canonical types)
- `gmail-attachment-handler.ts` (can delegate to driver)

---

#### Step 2.2: Refactor MicrosoftSyncService to Use MicrosoftDriver

**File:** `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts`

**Changes:**

```typescript
@Injectable()
export class MicrosoftSyncService extends BaseEmailSyncService {
  constructor(
    // ... existing dependencies
    private driverFactory: EmailDriverFactory,  // NEW
  ) {
    super(prisma, realtimeEvents, config);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    // Use driver instead of direct axios calls
    const driver = await this.driverFactory.createDriverForProvider(jobData.providerId);

    const folders = await driver.listFolders();
    const messages = await driver.listMessages({ folder: 'INBOX', pageSize: this.batchSize });

    // ... existing sync logic
  }

  private async syncIncrementalDelta(...) {
    // Replace axios delta sync with `driver.getChangesSince()`
  }
}
```

**Affected Files:**
- `microsoft-sync.service.ts`
- `microsoft-folder.service.ts` (already has canonical mapping ✅)
- `microsoft-message-parser.ts`
- `microsoft-attachment-handler.ts`

---

#### Step 2.3: Refactor ImapSyncService to Use IMAPDriver

**File:** `backend/src/modules/email-sync/services/imap/imap-sync.service.ts`

**Changes:**

```typescript
@Injectable()
export class ImapSyncService extends BaseEmailSyncService {
  constructor(
    // ... existing dependencies
    private driverFactory: EmailDriverFactory,  // NEW
  ) {
    super(prisma, realtimeEvents, config);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    // Use IMAPDriver instead of raw ImapFlow
    const driver = await this.driverFactory.createDriverForProvider(jobData.providerId);

    const folders = await driver.listFolders();
    const messages = await driver.listMessages({ folder: 'INBOX', pageSize: this.batchSize });

    // ... existing sync logic
  }
}
```

**Affected Files:**
- `imap-sync.service.ts`
- `imap.service.ts` (can delegate to IMAPDriver)

---

### Phase 3: Create UnifiedSyncService (Future)

**Goal:** Replace provider-specific sync services with a single unified service.

**Timeline:** 2-3 weeks (after Phase 2 complete)

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        UnifiedSyncService                               │
│  - Uses IEmailDriver for all providers                                  │
│  - Provider-agnostic sync logic                                         │
│  - Database persistence layer                                           │
│  - Embeddings queue integration                                         │
│  - Realtime events emission                                             │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         IEmailDriver                                    │
│  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────────┐ │
│  │  GoogleDriver   │  │  MicrosoftDriver   │  │   IMAPDriver         │ │
│  └─────────────────┘  └────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
@Injectable()
export class UnifiedSyncService {
  constructor(
    private prisma: PrismaService,
    private driverFactory: EmailDriverFactory,
    private realtimeEvents: RealtimeEventsService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
  ) {}

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    // Works for ANY provider (google, microsoft, imap)
    const driver = await this.driverFactory.createDriverForProvider(jobData.providerId);

    const folders = await driver.listFolders();
    await this.syncFoldersToDatabase(folders, jobData.providerId, jobData.tenantId);

    const messages = await driver.listMessages({ folder: 'INBOX', pageSize: 100 });
    await this.syncMessagesToDatabase(messages, jobData.providerId, jobData.tenantId);

    // Queue embeddings
    for (const msg of messages) {
      await this.emailEmbeddingQueue.addJob({ emailId: msg.id, tenantId: jobData.tenantId });
    }

    return { messagesProcessed: messages.length, newMessages: messages.length };
  }

  private async syncFoldersToDatabase(folders: CanonicalFolder[], providerId: string, tenantId: string) {
    // Provider-agnostic folder sync
  }

  private async syncMessagesToDatabase(messages: CanonicalMessage[], providerId: string, tenantId: string) {
    // Provider-agnostic message sync
  }
}
```

**Benefits:**
- **Single source of truth** for sync logic
- **Easier to maintain** (one service instead of three)
- **Consistent behavior** across providers
- **Easier to add new providers** (just implement IEmailDriver)

**Migration Path:**
1. Create `UnifiedSyncService` alongside old services
2. Update `SyncSchedulerService` to use `UnifiedSyncService` for new providers
3. Gradually migrate existing providers one at a time
4. Remove old services once all providers migrated

---

### Phase 4: Remove Old Code (Final Cleanup)

**Goal:** Delete old provider-specific code after full migration.

**Timeline:** 1 week

**Files to Delete:**

```
backend/src/modules/email-sync/services/
├── gmail/
│   ├── google-sync.service.ts           ❌ DELETE (replaced by UnifiedSyncService + GoogleDriver)
│   ├── gmail-folder.service.ts          ❌ DELETE (functionality in GoogleDriver)
│   ├── gmail-message-parser.ts          ❌ DELETE (drivers return canonical types)
│   ├── gmail-attachment-handler.ts      ❌ DELETE (driver.getAttachment())
│   └── gmail-batch-processor.ts         ❌ DELETE (driver handles batching)
├── microsoft/
│   ├── microsoft-sync.service.ts        ❌ DELETE (replaced by UnifiedSyncService + MicrosoftDriver)
│   ├── microsoft-folder.service.ts      ❌ DELETE (functionality in MicrosoftDriver)
│   ├── microsoft-message-parser.ts      ❌ DELETE (drivers return canonical types)
│   ├── microsoft-attachment-handler.ts  ❌ DELETE (driver.getAttachment())
│   └── microsoft-batch-processor.ts     ❌ DELETE (driver handles batching)
├── imap/
│   └── imap-sync.service.ts             ❌ DELETE (replaced by UnifiedSyncService + IMAPDriver)
└── base-email-sync.service.ts           ❌ DELETE (logic moved to UnifiedSyncService)
```

**Files to Keep:**

```
backend/src/modules/email-sync/services/
├── sync-scheduler.service.ts            ✅ KEEP (orchestrates sync jobs)
├── folder-sync.service.ts               ✅ KEEP (high-level folder operations)
├── provider-token.service.ts            ✅ KEEP (token refresh, used by drivers)
├── gmail-webhook.service.ts             ✅ KEEP (Pub/Sub webhook handler)
├── microsoft-webhook.service.ts         ✅ KEEP (Graph webhook handler)
├── webhook-lifecycle.service.ts         ✅ KEEP (webhook subscription management)
├── cross-provider-sync.service.ts       ✅ KEEP (cross-provider operations)
├── cross-provider-dedup.service.ts      ✅ KEEP (deduplication logic)
├── email-send-queue.service.ts          ✅ KEEP (email sending queue)
└── ... (other queue services)           ✅ KEEP
```

---

## Detailed Analysis: What Each Old Service Does

### GoogleSyncService

**Current Responsibilities:**
- **Full sync**: Fetch recent messages from Gmail API
- **Incremental sync**: Use historyId to get changes since last sync
- **Database persistence**: Save emails, folders, attachments to PostgreSQL
- **Embedding queue**: Queue emails for AI embeddings
- **Realtime events**: Emit Socket.IO events for UI updates
- **Attachment handling**: Download and store attachments
- **Batch processing**: Batch get messages for efficiency

**What Can Be Migrated to Driver:**
- ✅ Gmail API calls → `GoogleDriver.listMessages()`, `GoogleDriver.getMessage()`
- ✅ Label/folder operations → `GoogleDriver.listFolders()`, `GoogleDriver.createFolder()`
- ✅ Flag operations → `GoogleDriver.setReadStatus()`, `GoogleDriver.setStarredStatus()`
- ✅ Attachment retrieval → `GoogleDriver.getAttachment()`
- ✅ History/delta sync → `GoogleDriver.getChangesSince()`

**What Stays in Sync Service:**
- ❌ Database persistence (Prisma operations)
- ❌ Embedding queue integration
- ❌ Realtime events emission
- ❌ Sync job orchestration
- ❌ Error handling and retry logic (OR move to ResilientDriverWrapper)

---

### MicrosoftSyncService

**Current Responsibilities:**
- **Delta sync**: Use @odata.deltaLink for incremental sync
- **Timestamp-based sync**: Fallback when delta sync fails
- **Database persistence**: Save emails, folders, attachments to PostgreSQL
- **Embedding queue**: Queue emails for AI embeddings
- **Realtime events**: Emit Socket.IO events for UI updates
- **Attachment handling**: Download attachments via Graph API
- **Batch processing**: Batch get messages

**What Can Be Migrated to Driver:**
- ✅ Graph API calls → `MicrosoftDriver.listMessages()`, `MicrosoftDriver.getMessage()`
- ✅ Folder operations → `MicrosoftDriver.listFolders()`
- ✅ Flag operations → `MicrosoftDriver.setReadStatus()`
- ✅ Attachment retrieval → `MicrosoftDriver.getAttachment()`
- ✅ Delta sync → `MicrosoftDriver.getChangesSince()`

**What Stays in Sync Service:**
- ❌ Database persistence
- ❌ Embedding queue integration
- ❌ Realtime events emission
- ❌ Sync job orchestration

---

### ImapSyncService

**Current Responsibilities:**
- **Full sync**: Fetch messages from IMAP server using ImapFlow
- **Incremental sync**: Use UID ranges for delta sync
- **Database persistence**: Save emails, folders, attachments to PostgreSQL
- **IDLE support**: Real-time sync using IMAP IDLE (RFC 2177)
- **Embedding queue**: Queue emails for AI embeddings
- **Realtime events**: Emit Socket.IO events for UI updates

**What Can Be Migrated to Driver:**
- ✅ ImapFlow operations → `IMAPDriver.listMessages()`, `IMAPDriver.getMessage()`
- ✅ Folder operations → `IMAPDriver.listFolders()`
- ✅ Flag operations → `IMAPDriver.setReadStatus()`
- ✅ IDLE subscription → `IMAPDriver.subscribeToChanges()`
- ✅ Attachment retrieval → `IMAPDriver.getAttachment()`

**What Stays in Sync Service:**
- ❌ Database persistence
- ❌ Embedding queue integration
- ❌ Realtime events emission
- ❌ Sync job orchestration

---

## Testing Strategy

### Phase 2 Testing (Wrapper Pattern)

1. **Unit Tests:** Mock drivers and test sync logic
2. **Integration Tests:** Use drivers.integration.spec.ts framework
3. **E2E Tests:** Run full sync with real providers

**Test Checklist:**
- [ ] Full sync still works for all providers
- [ ] Incremental sync still works for all providers
- [ ] Webhook handling still triggers sync
- [ ] Database persistence unchanged
- [ ] Realtime events still emitted
- [ ] Embeddings still queued
- [ ] No performance regression

---

### Phase 3 Testing (UnifiedSyncService)

1. **Unit Tests:** Test UnifiedSyncService with mocked drivers
2. **Integration Tests:** Test all providers with real APIs
3. **Migration Tests:** Verify data consistency before/after migration

**Test Checklist:**
- [ ] UnifiedSyncService works for Google provider
- [ ] UnifiedSyncService works for Microsoft provider
- [ ] UnifiedSyncService works for IMAP provider
- [ ] Cross-provider queries still work
- [ ] No data loss during migration
- [ ] Performance matches or exceeds old services

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking sync for existing users** | High | Use wrapper pattern (Phase 2) first; keep old services as fallback |
| **Performance regression** | Medium | Benchmark before/after; optimize hot paths; use ResilientDriverWrapper |
| **Data loss during migration** | High | Backup database before migration; test on staging first; incremental rollout |
| **Webhook handling breaks** | Medium | Keep webhook services unchanged; test webhook → sync flow |
| **Missing features in drivers** | Medium | Audit drivers vs old services; add missing features before migration |

---

## Implementation Checklist

### Phase 2: Wrapper Pattern (Current Priority)

- [ ] **GoogleSyncService**
  - [ ] Inject `EmailDriverFactory`
  - [ ] Replace Gmail API calls with `GoogleDriver` methods
  - [ ] Test full sync
  - [ ] Test incremental sync (historyId)
  - [ ] Test webhook handling
  - [ ] Verify embeddings still queued
  - [ ] Verify realtime events emitted

- [ ] **MicrosoftSyncService**
  - [ ] Inject `EmailDriverFactory`
  - [ ] Replace Graph API calls with `MicrosoftDriver` methods
  - [ ] Test delta sync (@odata.deltaLink)
  - [ ] Test timestamp-based sync fallback
  - [ ] Test webhook handling
  - [ ] Verify embeddings still queued
  - [ ] Verify realtime events emitted

- [ ] **ImapSyncService**
  - [ ] Inject `EmailDriverFactory`
  - [ ] Replace ImapFlow calls with `IMAPDriver` methods
  - [ ] Test full sync
  - [ ] Test IDLE subscription
  - [ ] Verify embeddings still queued
  - [ ] Verify realtime events emitted

- [ ] **Update SyncSchedulerService**
  - [ ] No changes needed (sync services keep same API)

- [ ] **Integration Testing**
  - [ ] Run drivers.integration.spec.ts
  - [ ] Test all providers with real accounts
  - [ ] Verify no data loss
  - [ ] Verify no performance regression

---

### Phase 3: UnifiedSyncService (Future)

- [ ] Create `UnifiedSyncService`
- [ ] Implement provider-agnostic sync logic
- [ ] Implement database persistence layer
- [ ] Implement embedding queue integration
- [ ] Implement realtime events emission
- [ ] Test with Google provider
- [ ] Test with Microsoft provider
- [ ] Test with IMAP provider
- [ ] Update `SyncSchedulerService` to use `UnifiedSyncService`
- [ ] Gradual rollout (feature flag?)

---

### Phase 4: Cleanup (Future)

- [ ] Verify all providers using `UnifiedSyncService`
- [ ] Remove `GoogleSyncService`
- [ ] Remove `MicrosoftSyncService`
- [ ] Remove `ImapSyncService`
- [ ] Remove `BaseEmailSyncService`
- [ ] Remove provider-specific parsers
- [ ] Remove provider-specific attachment handlers
- [ ] Remove provider-specific batch processors
- [ ] Update module imports
- [ ] Update tests
- [ ] Update documentation

---

## Timeline Estimate

| Phase | Duration | Effort | Risk |
|-------|----------|--------|------|
| **Phase 2.1** (GoogleSyncService wrapper) | 1 week | Medium | Low (keeps fallback) |
| **Phase 2.2** (MicrosoftSyncService wrapper) | 1 week | Medium | Low |
| **Phase 2.3** (ImapSyncService wrapper) | 1 week | Low | Low |
| **Phase 3** (UnifiedSyncService) | 2-3 weeks | High | Medium (new architecture) |
| **Phase 4** (Cleanup) | 1 week | Low | Low (safe to delete after Phase 3) |
| **Total** | **6-8 weeks** | | |

---

## Recommendations

### Immediate Next Steps (This Sprint)

1. **Start with Phase 2.1** (GoogleSyncService wrapper)
   - Lowest risk, highest value
   - Validates driver API completeness
   - Provides template for Microsoft and IMAP

2. **Create feature flag** for driver-based sync
   - Allow gradual rollout per provider
   - Easy rollback if issues arise

3. **Add monitoring** to compare old vs new
   - Sync duration
   - Message count
   - Error rate

### Long-Term Strategy

- **Phase 2 (Wrapper)** is safe and can be done now
- **Phase 3 (UnifiedSyncService)** should wait until Phase 2 is stable in production
- **Phase 4 (Cleanup)** only after Phase 3 is fully validated

### Alternative: Keep Both

If migration risk is too high, consider keeping old services as a permanent fallback:

```typescript
@Injectable()
export class SyncSchedulerService {
  async scheduleSync(provider: ProviderConfig) {
    if (this.config.get('USE_DRIVER_SYNC')) {
      // New: Use UnifiedSyncService + drivers
      return this.unifiedSync.syncProvider({ providerId: provider.id });
    } else {
      // Old: Use provider-specific services
      switch (provider.providerType) {
        case 'google': return this.googleSync.syncProvider(...);
        case 'microsoft': return this.microsoftSync.syncProvider(...);
        case 'imap': return this.imapSync.syncProvider(...);
      }
    }
  }
}
```

This allows:
- Fast rollback via config
- A/B testing
- Per-provider migration
- Zero-downtime deployment

---

## Conclusion

The driver abstraction layer is **production-ready** and has been **validated with real providers**. The migration from old services to drivers is a **low-risk, high-value refactoring** that should be done gradually using the **wrapper pattern** (Phase 2) first, then **UnifiedSyncService** (Phase 3) once stable.

**Start with GoogleSyncService wrapper this sprint** to validate the approach before proceeding with full migration.
