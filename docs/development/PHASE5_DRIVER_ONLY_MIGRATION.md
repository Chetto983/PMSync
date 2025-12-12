# Phase 5: Driver-Only Migration

> **Created:** 2025-12-12
> **Status:** GoogleSyncService Complete ✅ | MicrosoftSyncService & ImapSyncService Pending
> **Goal:** Remove all legacy provider code and use only EmailDriverFactory pattern

---

## Executive Summary

Phase 5 removes legacy provider implementations and migrates all services to use the unified `EmailDriverFactory` pattern. This eliminates code duplication and creates a single source of truth for email operations.

### Benefits

- **51% code reduction** in sync services
- **Single source of truth** for email operations
- **Consistent error handling** via driver resilience module
- **Easier testing** with driver mocks
- **Future-proof** - new providers only need driver implementation

---

## Progress Tracker

### ✅ Completed (2025-12-12)

#### 1. GoogleSyncService Driver-Only Refactoring

**File:** `backend/src/modules/email-sync/services/gmail/google-sync.service.ts`

**Metrics:**
- Lines of code: 789 → 384 (51% reduction)
- Dependencies removed: 14 (googleapis-specific imports)
- Tests passing: 7/7 ✅
- TypeScript errors: 0 ✅

**Before:**
```typescript
// Legacy approach - direct Gmail API calls
private createGmailClient(accessToken: string): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

private async syncFull(gmail: gmail_v1.Gmail, ...) {
  // 100+ lines of Gmail-specific code
  const response = await gmail.users.messages.list(...);
  // Complex batch processing, attachment handling, etc.
}
```

**After:**
```typescript
// Driver-only approach - clean abstraction
const driver = await this.driverFactory.createConnectedDriver('google', {
  type: 'oauth2',
  accessToken,
  emailHint: provider.email,
}) as GoogleDriver;

private async syncFullWithDriver(driver: GoogleDriver, ...) {
  // Clean, provider-agnostic logic
  const result = await driver.listMessages({
    folder: 'INBOX',
    pageSize: this.fullSyncMaxMessages,
  });

  for (const message of result.messages) {
    await this.upsertMessageFromDriver(message, providerId, tenantId);
  }
}
```

**Key Changes:**

1. **Removed Legacy Methods:**
   - `createGmailClient()` - 5 lines
   - `syncFull()` - 82 lines
   - `syncIncremental()` - 175 lines
   - `withRetry()` - 8 lines
   - `refreshMessageMetadata()` - 68 lines
   - `handleMessageDeletion()` - 65 lines (replaced with simpler 30-line version)
   - `enforceTrashState()` - 40 lines
   - `removeEmailPermanently()` - 48 lines
   - `applyStatusMetadata()` - 25 lines
   - `processMessage()` - 38 lines
   - `handleMissingRemoteMessage()` - 27 lines
   - `notifyGmailMailboxChange()` - 10 lines

2. **Added Driver-Based Methods:**
   - `syncFullWithDriver()` - 55 lines
   - `syncIncrementalWithDriver()` - 70 lines
   - `upsertMessageFromDriver()` - 68 lines
   - `handleMessageDeletion()` - 28 lines (simplified)

3. **Maintained Integrations:**
   - ✅ Multi-tenancy (tenantId in all operations)
   - ✅ BullMQ (EmailEmbeddingQueueService for AI)
   - ✅ Realtime events (Socket.IO via RealtimeEventsService)
   - ✅ Full & incremental sync modes
   - ✅ Gmail History API sync tokens

**Test Results:**
```bash
PASS src/modules/email-sync/services/gmail/google-sync.service.spec.ts
  ✓ should be defined
  ✓ should sync provider successfully
  ✓ should handle full sync
  ✓ should handle incremental sync
  ✓ should emit realtime events
  ✓ should queue embeddings
  ✓ should handle errors gracefully

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

---

## Architecture Changes

### Before (Legacy Pattern)

```
┌─────────────────────────────────────────────────────────────┐
│                    SyncSchedulerService                      │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├──> GoogleSyncService (legacy)
                │    ├─> googleapis library (direct)
                │    ├─> gmail_v1.Gmail client
                │    └─> Complex Gmail-specific code
                │
                ├──> MicrosoftSyncService (legacy)
                │    ├─> axios + Graph API (direct)
                │    └─> Microsoft-specific code
                │
                └──> ImapSyncService (legacy)
                     ├─> node-imap library (direct)
                     └─> IMAP-specific code
```

**Problems:**
- 70% code duplication between sync services and drivers
- Two sources of truth (sync services + drivers)
- Inconsistent error handling
- Hard to maintain and test

### After (Driver-Only Pattern)

```
┌─────────────────────────────────────────────────────────────┐
│                    SyncSchedulerService                      │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├──> GoogleSyncService (driver-only) ✅
                │    └─> EmailDriverFactory
                │         └─> GoogleDriver
                │              └─> googleapis (abstracted)
                │
                ├──> MicrosoftSyncService (pending)
                │    └─> EmailDriverFactory
                │         └─> MicrosoftDriver
                │              └─> Graph API (abstracted)
                │
                └──> ImapSyncService (pending)
                     └─> EmailDriverFactory
                          └─> IMAPDriver
                               └─> node-imap (abstracted)
```

**Benefits:**
- Single source of truth (drivers only)
- Consistent error handling via ResilienceService
- Easy to test with driver mocks
- Clean separation of concerns

---

## Migration Pattern (Template for Microsoft & IMAP)

Follow this pattern for MicrosoftSyncService and ImapSyncService:

### Step 1: Update Constructor

**Before:**
```typescript
constructor(
  prisma: PrismaService,
  realtimeEvents: RealtimeEventsService,
  config: ConfigService,
  private crypto: CryptoService,
  private emailEmbeddingQueue: EmailEmbeddingQueueService,
  private embeddingsService: EmbeddingsService,
  private knowledgeBaseService: KnowledgeBaseService,
  private providerTokenService: ProviderTokenService,
  private retryService: RetryService,
  private attachmentStorage: AttachmentStorageService,
  private storage: StorageService,
  private gmailAttachmentHandler: GmailAttachmentHandler,
  private gmailFolderService: GmailFolderService,
  private gmailMessageParser: GmailMessageParser,
  private gmailBatchProcessor: GmailBatchProcessor,
) {
  super(prisma, realtimeEvents, config);
}
```

**After:**
```typescript
constructor(
  prisma: PrismaService,
  realtimeEvents: RealtimeEventsService,
  config: ConfigService,
  private emailEmbeddingQueue: EmailEmbeddingQueueService,
  private providerTokenService: ProviderTokenService,
  private driverFactory: EmailDriverFactory,
) {
  super(prisma, realtimeEvents, config);
}
```

### Step 2: Replace syncProvider() Method

**Before:**
```typescript
async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
  const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

  // Create provider-specific client
  const client = this.createClient(accessToken);

  // Provider-specific sync logic
  if (syncType === 'incremental' && lastSyncToken) {
    return await this.syncIncremental(client, lastSyncToken, ...);
  } else {
    return await this.syncFull(client, ...);
  }
}
```

**After:**
```typescript
async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
  const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

  // Create connected driver
  const driver = await this.driverFactory.createConnectedDriver('google', {
    type: 'oauth2',
    accessToken,
    emailHint: provider.email,
  }) as GoogleDriver;

  try {
    // Clean, provider-agnostic sync logic
    if (syncType === 'incremental' && lastSyncToken) {
      return await this.syncIncrementalWithDriver(driver, lastSyncToken, ...);
    } else {
      return await this.syncFullWithDriver(driver, ...);
    }
  } finally {
    await driver.disconnect();
  }
}
```

### Step 3: Implement syncFullWithDriver()

```typescript
private async syncFullWithDriver(
  driver: GoogleDriver,
  providerId: string,
  tenantId: string,
): Promise<{ messagesProcessed: number; newMessages: number; syncToken: string }> {
  let messagesProcessed = 0;
  let newMessages = 0;
  let pageToken: string | undefined;
  let fetchedCount = 0;

  do {
    const result = await driver.listMessages({
      folder: 'INBOX',
      pageSize: Math.min(100, this.fullSyncMaxMessages - fetchedCount),
      pageToken,
    });

    for (const message of result.messages) {
      const upsertResult = await this.upsertMessageFromDriver(message, providerId, tenantId);
      messagesProcessed++;
      if (upsertResult.wasNew) {
        newMessages++;
      }
    }

    fetchedCount += result.messages.length;
    pageToken = result.nextPageToken;
  } while (pageToken && fetchedCount < this.fullSyncMaxMessages);

  const syncToken = await driver.getInitialSyncToken();

  return { messagesProcessed, newMessages, syncToken };
}
```

### Step 4: Implement syncIncrementalWithDriver()

```typescript
private async syncIncrementalWithDriver(
  driver: GoogleDriver,
  lastSyncToken: string,
  providerId: string,
  tenantId: string,
): Promise<{ messagesProcessed: number; newMessages: number; newSyncToken: string }> {
  let messagesProcessed = 0;
  let newMessages = 0;
  const processedIds = new Set<string>();

  const changesResult = await driver.getChangesSince(lastSyncToken);

  for (const change of changesResult.changes) {
    if (processedIds.has(change.messageId)) continue;
    processedIds.add(change.messageId);

    try {
      if (change.type === 'deleted') {
        await this.handleMessageDeletion(change.messageId, providerId, tenantId);
        messagesProcessed++;
      } else if (change.type === 'added' || change.type === 'modified') {
        const message = await driver.getMessage(change.messageId);
        if (message) {
          const upsertResult = await this.upsertMessageFromDriver(message, providerId, tenantId);
          messagesProcessed++;
          if (upsertResult.wasNew) newMessages++;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to process change: ${error.message}`);
    }
  }

  return { messagesProcessed, newMessages, newSyncToken: changesResult.newSyncToken };
}
```

### Step 5: Implement upsertMessageFromDriver()

```typescript
private async upsertMessageFromDriver(
  canonicalMsg: CanonicalMessage,
  providerId: string,
  tenantId: string,
): Promise<{ wasNew: boolean }> {
  const existing = await this.prisma.email.findFirst({
    where: { providerId, externalId: canonicalMsg.id },
    select: { id: true },
  });

  if (existing) {
    await this.prisma.email.update({
      where: { id: existing.id },
      data: {
        subject: canonicalMsg.subject || '(No Subject)',
        from: canonicalMsg.from.email,
        to: canonicalMsg.to?.map((r) => r.email) || [],
        // ... other fields
        bodyText: canonicalMsg.bodyText || '',
        bodyHtml: canonicalMsg.bodyHtml || '',
      },
    });
    return { wasNew: false };
  } else {
    const createdEmail = await this.prisma.email.create({
      data: {
        tenantId,
        providerId,
        externalId: canonicalMsg.id,
        // ... all required fields
      },
    });

    // Queue for embeddings
    await this.emailEmbeddingQueue.enqueue({
      emailId: createdEmail.id,
      tenantId,
      subject: createdEmail.subject,
      snippet: createdEmail.snippet || '',
    });

    // Emit realtime event
    this.realtimeEvents.emitEmailNew(tenantId, {
      emailId: createdEmail.id,
      providerId,
      folder: createdEmail.folder,
      reason: 'message-processed',
    });

    return { wasNew: true };
  }
}
```

---

## Pending Work

### 1. MicrosoftSyncService Migration

**File:** `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts`

**Status:** Not started

**Estimated Effort:** 4-6 hours

**Approach:**
1. Follow the migration pattern above
2. Use `MicrosoftDriver` instead of `GoogleDriver`
3. Use `driver.getChangesSince()` for delta sync (Microsoft Graph Delta API)
4. Test with real Outlook.com account

### 2. ImapSyncService Migration

**File:** `backend/src/modules/email-sync/services/imap/imap-sync.service.ts`

**Status:** Not started

**Estimated Effort:** 4-6 hours

**Approach:**
1. Follow the migration pattern above
2. Use `IMAPDriver` instead of `GoogleDriver`
3. IMAP doesn't have history API - use UID-based sync
4. Test with real IMAP provider (Libero.it)

### 3. Email Send Service Migration

**File:** `backend/src/modules/email/services/email-send.service.ts`

**Current Code:**
```typescript
const emailProvider = ProviderFactory.create(provider.providerType, providerConfig);
await emailProvider.sendEmail(sendData);
```

**Target Code:**
```typescript
const driver = await this.driverFactory.createConnectedDriver(
  provider.providerType,
  { type: 'oauth2', accessToken }
);
await driver.sendMessage(composeData);
await driver.disconnect();
```

**Status:** Not started

**Estimated Effort:** 2-3 hours

### 4. Delete Legacy Code

**Files to Delete:**
- `backend/src/modules/providers/providers/google-email.provider.ts`
- `backend/src/modules/providers/providers/microsoft-email.provider.ts`
- `backend/src/modules/providers/providers/imap-email.provider.ts`
- `backend/src/modules/providers/factory/provider.factory.ts`
- `backend/src/modules/providers/interfaces/email-provider.interface.ts`

**Status:** Blocked by email-send.service migration

**Estimated Effort:** 1 hour (after unblocking)

### 5. Update ProvidersModule

**File:** `backend/src/modules/providers/providers.module.ts`

**Keep:**
- `GoogleOAuthService` - OAuth flow for Google
- `MicrosoftOAuthService` - OAuth flow for Microsoft

**Remove:**
- `ProviderFactory` export
- `IEmailProvider` export
- Legacy provider class exports

**Status:** Blocked by step 4

**Estimated Effort:** 30 minutes

---

## Testing Strategy

### Unit Tests

Each migrated service must maintain test coverage:

```typescript
describe('GoogleSyncService (Driver-Only)', () => {
  it('should sync using driver', async () => {
    const mockDriver = {
      listMessages: jest.fn().mockResolvedValue({
        messages: [/* mock canonical messages */],
        nextPageToken: undefined,
      }),
      getInitialSyncToken: jest.fn().mockResolvedValue('12345'),
      disconnect: jest.fn(),
    };

    jest.spyOn(driverFactory, 'createConnectedDriver').mockResolvedValue(mockDriver);

    const result = await service.syncProvider({
      providerId: 'test-id',
      email: 'test@example.com',
      syncType: 'full',
      tenantId: 'tenant-1',
    });

    expect(result.success).toBe(true);
    expect(mockDriver.listMessages).toHaveBeenCalled();
    expect(mockDriver.disconnect).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test with real providers:

```bash
# Google
npx ts-node src/modules/email-sync/drivers/test-google-sync-modes.script.ts

# Microsoft (after migration)
npx ts-node src/modules/email-sync/drivers/test-microsoft-sync-modes.script.ts

# IMAP (after migration)
npx ts-node src/modules/email-sync/drivers/test-imap-sync-modes.script.ts
```

---

## Rollout Plan

### Phase 5.1: GoogleSyncService ✅ COMPLETE

- [x] Refactor GoogleSyncService to driver-only
- [x] Update tests
- [x] Verify all tests pass
- [x] Document changes

### Phase 5.2: MicrosoftSyncService & ImapSyncService

- [ ] Refactor MicrosoftSyncService
- [ ] Refactor ImapSyncService
- [ ] Test with real providers
- [ ] Deploy to staging

### Phase 5.3: Email Send Service

- [ ] Migrate email-send.service.ts
- [ ] Test sending emails via drivers
- [ ] Verify attachments work
- [ ] Deploy to staging

### Phase 5.4: Cleanup

- [ ] Delete legacy provider implementations
- [ ] Update ProvidersModule
- [ ] Remove unused dependencies
- [ ] Update documentation

### Phase 5.5: Production Deployment

- [ ] Deploy to production
- [ ] Monitor sync metrics
- [ ] Verify no regressions
- [ ] Remove feature flags (if any)

---

## Success Metrics

### Code Quality

- ✅ 51% code reduction in GoogleSyncService
- Target: 50%+ reduction in MicrosoftSyncService and ImapSyncService
- Target: 0 legacy provider code remaining

### Test Coverage

- ✅ GoogleSyncService: 7/7 tests passing
- Target: MicrosoftSyncService: All tests passing
- Target: ImapSyncService: All tests passing
- Target: email-send.service: All tests passing

### Performance

- Target: Sync duration within 20% of legacy performance
- Target: No increase in error rates
- Target: Same or better API call efficiency

---

## Risks & Mitigations

### Risk 1: Regression in Sync Functionality

**Likelihood:** Low
**Impact:** High
**Mitigation:**
- Comprehensive test suite
- Test with real providers before deployment
- Gradual rollout with monitoring

### Risk 2: Breaking Changes in Email Sending

**Likelihood:** Low
**Impact:** High
**Mitigation:**
- Test sending with all provider types
- Test with attachments
- Verify MIME encoding works correctly

### Risk 3: Calendar Integration Dependencies

**Likelihood:** Medium
**Impact:** Medium
**Mitigation:**
- Audit calendar module for ProviderFactory usage
- Update if needed before deleting legacy code

---

## Questions & Answers

**Q: Why not use feature flags for gradual rollout?**
A: GoogleSyncService is completely rewritten - there's no hybrid mode. Tests validate correctness before deployment.

**Q: What about webhook services (gmail-webhook.service.ts)?**
A: Webhook services already queue sync jobs for sync services. No changes needed.

**Q: Can we add new providers easily?**
A: Yes! Just implement `IEmailDriver` interface and add to `EmailDriverFactory`. No sync service changes needed.

**Q: What about performance?**
A: Driver abstraction adds minimal overhead. Resilience module (retry, rate limiting) improves reliability.

---

## Related Documentation

- [EMAIL_DRIVER_ROADMAP.md](./EMAIL_DRIVER_ROADMAP.md) - Main roadmap
- [DRIVER_MIGRATION_PLAN.md](./DRIVER_MIGRATION_PLAN.md) - Original migration plan
- [REFACTORING_ROADMAP_SUMMARY.md](./REFACTORING_ROADMAP_SUMMARY.md) - Consolidation plan

---

**Last Updated:** 2025-12-12
**Next Review:** After MicrosoftSyncService migration
