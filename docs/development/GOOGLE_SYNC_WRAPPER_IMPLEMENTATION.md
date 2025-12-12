# GoogleSyncService Wrapper Implementation Plan

> **Status:** Ready to Implement
> **Created:** 2025-12-12
> **Risk Level:** Medium (keeps fallback, tests with real provider)
> **Estimated Time:** 1 week with testing

---

## Overview

Refactor `GoogleSyncService` to use `GoogleDriver` internally while keeping all business logic (database persistence, embeddings, realtime events) intact. This is **Phase 2.1** from the DRIVER_MIGRATION_PLAN.md.

---

## Current Architecture

```
GoogleSyncService.syncProvider()
  ├─> createGmailClient(accessToken)          // Direct Gmail API
  ├─> syncIncremental() OR syncFull()
  │   ├─> gmail.users.history.list()          // Direct Gmail API
  │   ├─> gmail.users.messages.batchGet()     // Direct Gmail API
  │   ├─> GmailBatchProcessor.processMessagesBatch()
  │   │   ├─> GmailMessageParser.parseMessage()
  │   │   ├─> Database persistence (Prisma)
  │   │   ├─> EmailEmbeddingQueue.addJob()
  │   │   └─> RealtimeEvents.emit()
  │   └─> Return sync results
  └─> Update provider metadata
```

---

## Target Architecture

```
GoogleSyncService.syncProvider()
  ├─> EmailDriverFactory.createDriverForProvider()  // NEW: Get driver
  ├─> syncIncremental() OR syncFull()
  │   ├─> driver.getChangesSince()                   // Driver method
  │   ├─> driver.listMessages()                      // Driver method
  │   ├─> processCanonicalMessages()                 // NEW: Process canonical messages
  │   │   ├─> Database persistence (Prisma)         // UNCHANGED
  │   │   ├─> EmailEmbeddingQueue.addJob()          // UNCHANGED
  │   │   └─> RealtimeEvents.emit()                  // UNCHANGED
  │   └─> Return sync results
  └─> Update provider metadata
```

---

## Implementation Steps

### Step 1: Add Driver Factory Dependency ✅

**File:** `google-sync.service.ts`

**Changes:**

```typescript
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { GoogleDriver } from '../../drivers/google/google.driver';

@Injectable()
export class GoogleSyncService extends BaseEmailSyncService {
  constructor(
    // ... existing dependencies
    private driverFactory: EmailDriverFactory,  // NEW
  ) {
    super(prisma, realtimeEvents, config);
  }
}
```

**Testing:**
- ✅ Service should compile
- ✅ No runtime errors on module load

---

### Step 2: Add Feature Flag for Gradual Rollout

**File:** `google-sync.service.ts`

**Changes:**

```typescript
onModuleInit() {
  super.onModuleInit();

  // ... existing config

  // NEW: Feature flag for driver-based sync
  this.useDriverSync = this.config.get<boolean>('USE_DRIVER_SYNC_GOOGLE', false);
  this.logger.log(`Google sync using ${this.useDriverSync ? 'DRIVER' : 'LEGACY'} mode`);
}
```

**Environment Variable:**
```bash
USE_DRIVER_SYNC_GOOGLE=false  # Start with legacy, flip to true after testing
```

**Benefits:**
- Safe rollout: can toggle via env var
- Easy rollback if issues arise
- Can A/B test performance

**Testing:**
- ✅ With flag=false, sync should work as before
- ✅ With flag=true, sync should use driver (after implementing Step 3)

---

### Step 3: Create Driver-Based Sync Path

**File:** `google-sync.service.ts`

**Changes:**

```typescript
async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
  const { providerId, email, syncType } = jobData;

  this.logger.log(`Starting ${syncType} Gmail sync for ${email} (${this.useDriverSync ? 'DRIVER' : 'LEGACY'})`);

  try {
    if (this.useDriverSync) {
      // NEW: Driver-based sync path
      return await this.syncProviderWithDriver(jobData);
    } else {
      // EXISTING: Legacy sync path (unchanged)
      return await this.syncProviderLegacy(jobData);
    }
  } catch (error) {
    this.logger.error(`Gmail sync failed for ${email}:`, error);
    throw error;
  }
}

// EXISTING: Rename current implementation
private async syncProviderLegacy(jobData: SyncJobData): Promise<SyncJobResult> {
  const { providerId, email, syncType } = jobData;

  const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
  const gmail = this.createGmailClient(accessToken);

  // ... rest of existing implementation
}

// NEW: Driver-based implementation
private async syncProviderWithDriver(jobData: SyncJobData): Promise<SyncJobResult> {
  const { providerId, email, syncType } = jobData;

  // Get driver using factory
  const driver = await this.driverFactory.createDriverForProvider(providerId) as GoogleDriver;

  if (!driver.isConnected()) {
    throw new Error(`Driver not connected for provider ${providerId}`);
  }

  // Get provider for metadata
  const provider = await this.prisma.providerConfig.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error(`Provider ${providerId} not found`);
  }

  const metadata = (provider.metadata as any) || {};
  const lastHistoryId = metadata.lastSyncToken;

  let messagesProcessed = 0;
  let newMessages = 0;
  let newHistoryId: string | undefined;
  let metadataUpdates: Record<string, any> | undefined;

  if (syncType === 'incremental' && lastHistoryId) {
    // Incremental sync using driver
    const historyResult = await this.syncIncrementalWithDriver(
      driver,
      lastHistoryId,
      providerId,
      provider.tenantId,
    );
    messagesProcessed = historyResult.messagesProcessed;
    newMessages = historyResult.newMessages;
    newHistoryId = historyResult.newHistoryId;
    metadataUpdates = historyResult.metadata;
  } else {
    // Full sync using driver
    const fullResult = await this.syncFullWithDriver(
      driver,
      email,
      providerId,
      provider.tenantId,
    );
    messagesProcessed = fullResult.messagesProcessed;
    newMessages = fullResult.newMessages;
    newHistoryId = fullResult.historyId;
  }

  // Emit realtime events (unchanged)
  if (this.suppressMessageEvents && messagesProcessed > 0) {
    this.realtimeEvents.emitEmailBatchProcessed(provider.tenantId, {
      providerId,
      processed: messagesProcessed,
      created: newMessages,
      syncType,
    });
    this.realtimeEvents.emitSyncStatus(provider.tenantId, {
      providerId,
      status: 'in_progress',
      processed: messagesProcessed,
    });
  }

  return {
    success: true,
    providerId,
    email,
    messagesProcessed,
    newMessages,
    syncDuration: 0,
    lastSyncToken: newHistoryId,
    metadata: metadataUpdates,
  };
}
```

**Testing:**
- ✅ With flag=false: Legacy path works as before
- ✅ With flag=true: Driver path executes
- ✅ Both paths return same SyncJobResult structure

---

### Step 4: Implement Driver-Based Full Sync

**File:** `google-sync.service.ts`

**Changes:**

```typescript
private async syncFullWithDriver(
  driver: GoogleDriver,
  email: string,
  providerId: string,
  tenantId: string,
): Promise<{
  messagesProcessed: number;
  newMessages: number;
  historyId: string;
}> {
  this.logger.debug(`Full sync with driver - fetching latest messages (limit ${this.fullSyncMaxMessages})`);

  try {
    // Use driver to list messages
    const result = await driver.listMessages({
      folder: 'INBOX',  // Start with INBOX, can expand later
      pageSize: this.fullSyncMaxMessages,
      includeDeleted: false,
    });

    this.logger.debug(`Found ${result.messages.length} messages via driver`);

    // Process canonical messages (NEW helper method)
    const { processed, created } = await this.processCanonicalMessages(
      result.messages,
      providerId,
      tenantId,
    );

    // Get current historyId for next incremental sync
    // Note: Driver should expose this, for now use legacy method
    const gmail = await this.getLegacyGmailClient(providerId);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const historyId = profile.data.historyId!;

    return {
      messagesProcessed: processed,
      newMessages: created,
      historyId,
    };
  } catch (error) {
    this.logger.error('Full sync with driver error:', error);
    throw error;
  }
}

// NEW: Process canonical messages (driver returns these)
private async processCanonicalMessages(
  messages: CanonicalMessage[],
  providerId: string,
  tenantId: string,
): Promise<{ processed: number; created: number }> {
  let processed = 0;
  let created = 0;

  for (const canonicalMsg of messages) {
    try {
      // Check if message already exists
      const existing = await this.prisma.email.findFirst({
        where: {
          providerId,
          externalId: canonicalMsg.externalId,
        },
      });

      if (existing) {
        // Update existing message
        await this.prisma.email.update({
          where: { id: existing.id },
          data: {
            subject: canonicalMsg.subject,
            folder: canonicalMsg.folder,
            isRead: canonicalMsg.isRead,
            isStarred: canonicalMsg.isStarred,
            isFlagged: canonicalMsg.isFlagged,
            // ... other fields
          },
        });
        processed++;
      } else {
        // Create new message
        const newEmail = await this.prisma.email.create({
          data: {
            providerId,
            tenantId,
            externalId: canonicalMsg.externalId,
            threadId: canonicalMsg.threadId || canonicalMsg.externalId,
            subject: canonicalMsg.subject,
            from: canonicalMsg.from.email,
            fromName: canonicalMsg.from.name,
            to: canonicalMsg.to.map(t => t.email),
            cc: canonicalMsg.cc?.map(c => c.email) || [],
            bcc: canonicalMsg.bcc?.map(b => b.email) || [],
            folder: canonicalMsg.folder,
            bodyText: canonicalMsg.bodyText,
            bodyHtml: canonicalMsg.bodyHtml,
            snippet: canonicalMsg.snippet || '',
            receivedAt: canonicalMsg.receivedAt,
            sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
            isRead: canonicalMsg.isRead,
            isStarred: canonicalMsg.isStarred,
            isFlagged: canonicalMsg.isFlagged,
            isDraft: canonicalMsg.isDraft,
            hasAttachments: canonicalMsg.hasAttachments,
            labels: canonicalMsg.labels || [],
            size: 0, // Can be calculated if needed
          },
        });

        // Queue for embeddings
        await this.emailEmbeddingQueue.addJob({
          emailId: newEmail.id,
          tenantId,
        });

        // Emit realtime event
        if (!this.suppressMessageEvents) {
          this.realtimeEvents.emitEmailCreated(tenantId, {
            emailId: newEmail.id,
            providerId,
            folder: newEmail.folder,
            reason: 'sync',
          });
        }

        created++;
        processed++;
      }
    } catch (error) {
      this.logger.error(`Failed to process canonical message ${canonicalMsg.id}:`, error);
    }
  }

  return { processed, created };
}
```

**Testing:**
- ✅ Full sync retrieves messages via driver
- ✅ Messages are persisted to database
- ✅ Embeddings are queued
- ✅ Realtime events are emitted
- ✅ Compare counts with legacy sync

---

### Step 5: Implement Driver-Based Incremental Sync

**File:** `google-sync.service.ts`

**Changes:**

```typescript
private async syncIncrementalWithDriver(
  driver: GoogleDriver,
  startHistoryId: string,
  providerId: string,
  tenantId: string,
): Promise<{
  messagesProcessed: number;
  newMessages: number;
  newHistoryId: string;
  metadata?: Record<string, any>;
}> {
  this.logger.debug(`Incremental sync with driver from historyId: ${startHistoryId}`);

  try {
    // Use driver's getChangesSince method
    const changes = await driver.getChangesSince(startHistoryId);

    if (!changes || changes.changes.length === 0) {
      return {
        messagesProcessed: 0,
        newMessages: 0,
        newHistoryId: changes?.newSyncToken || startHistoryId,
      };
    }

    let messagesProcessed = 0;
    let newMessages = 0;

    // Process each change
    for (const change of changes.changes) {
      if (change.type === 'added') {
        // Fetch full message via driver
        const fullMessage = await driver.getMessage(change.messageId, {
          includeBody: true,
          includeAttachments: true,
        });

        if (fullMessage) {
          const { processed, created } = await this.processCanonicalMessages(
            [fullMessage],
            providerId,
            tenantId,
          );
          messagesProcessed += processed;
          newMessages += created;
        }
      } else if (change.type === 'modified') {
        // Refresh message metadata
        const fullMessage = await driver.getMessage(change.messageId, {
          includeBody: false,
        });

        if (fullMessage) {
          await this.updateMessageFromCanonical(fullMessage, providerId, tenantId);
          messagesProcessed++;
        }
      } else if (change.type === 'deleted') {
        // Mark as deleted
        await this.markMessageDeleted(change.messageId, providerId, tenantId);
        messagesProcessed++;
      }
    }

    return {
      messagesProcessed,
      newMessages,
      newHistoryId: changes.newSyncToken,
      metadata: changes.changes.length > 1000 ? { historyTruncated: true } : undefined,
    };
  } catch (error) {
    this.logger.error('Incremental sync with driver error:', error);
    throw error;
  }
}

// NEW: Update existing message from canonical
private async updateMessageFromCanonical(
  canonicalMsg: CanonicalMessage,
  providerId: string,
  tenantId: string,
): Promise<void> {
  const existing = await this.prisma.email.findFirst({
    where: {
      providerId,
      externalId: canonicalMsg.externalId,
    },
  });

  if (!existing) {
    return;
  }

  await this.prisma.email.update({
    where: { id: existing.id },
    data: {
      folder: canonicalMsg.folder,
      isRead: canonicalMsg.isRead,
      isStarred: canonicalMsg.isStarred,
      isFlagged: canonicalMsg.isFlagged,
      labels: canonicalMsg.labels || existing.labels,
    },
  });

  // Emit realtime event
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: existing.id,
    providerId,
    folder: canonicalMsg.folder,
    reason: 'labels-updated',
  });
}

// NEW: Mark message as deleted
private async markMessageDeleted(
  messageId: string,
  providerId: string,
  tenantId: string,
): Promise<void> {
  const existing = await this.prisma.email.findFirst({
    where: {
      providerId,
      externalId: messageId,
    },
  });

  if (!existing) {
    return;
  }

  await this.prisma.email.update({
    where: { id: existing.id },
    data: {
      isDeleted: true,
      folder: 'TRASH',
    },
  });

  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: existing.id,
    providerId,
    folder: 'TRASH',
    reason: 'message-deleted',
  });
}
```

**Testing:**
- ✅ Incremental sync retrieves changes via driver
- ✅ Added messages are created
- ✅ Modified messages are updated
- ✅ Deleted messages are marked as deleted
- ✅ Compare with legacy incremental sync

---

## Testing Strategy

### Unit Tests

**File:** `google-sync.service.spec.ts` (create new)

```typescript
describe('GoogleSyncService with Driver', () => {
  let service: GoogleSyncService;
  let driverFactory: jest.Mocked<EmailDriverFactory>;
  let mockDriver: jest.Mocked<GoogleDriver>;

  beforeEach(() => {
    // Mock driver factory and driver
    mockDriver = {
      isConnected: jest.fn().mockReturnValue(true),
      listMessages: jest.fn().mockResolvedValue({ messages: [], hasMore: false }),
      getMessage: jest.fn().mockResolvedValue(null),
      getChangesSince: jest.fn().mockResolvedValue({ changes: [], newSyncToken: '123' }),
    } as any;

    driverFactory = {
      createDriverForProvider: jest.fn().mockResolvedValue(mockDriver),
    } as any;

    // Create service with mocked dependencies
    service = new GoogleSyncService(/* ... mocked deps, driverFactory */);
  });

  it('should use driver for full sync when flag enabled', async () => {
    // Test implementation
  });

  it('should use legacy for full sync when flag disabled', async () => {
    // Test implementation
  });

  // More tests...
});
```

### Integration Tests (Real Provider)

**File:** `google-sync-driver.integration.spec.ts` (create new)

```typescript
describe('GoogleSyncService with Real Driver', () => {
  let service: GoogleSyncService;
  let prisma: PrismaService;
  let testProviderId: string;

  beforeAll(async () => {
    // Find active Google provider from database
    const providers = await prisma.providerConfig.findMany({
      where: { providerType: 'google', isActive: true },
      take: 1,
    });

    if (providers.length === 0) {
      throw new Error('No active Google provider found for testing');
    }

    testProviderId = providers[0].id;
  });

  it('should perform full sync using driver with real Gmail', async () => {
    const result = await service.syncProvider({
      providerId: testProviderId,
      email: 'test@gmail.com',
      syncType: 'full',
    });

    expect(result.success).toBe(true);
    expect(result.messagesProcessed).toBeGreaterThan(0);
  }, 60000); // 60s timeout

  it('should perform incremental sync using driver with real Gmail', async () => {
    // First do a full sync to get historyId
    await service.syncProvider({
      providerId: testProviderId,
      email: 'test@gmail.com',
      syncType: 'full',
    });

    // Then do incremental sync
    const result = await service.syncProvider({
      providerId: testProviderId,
      email: 'test@gmail.com',
      syncType: 'incremental',
    });

    expect(result.success).toBe(true);
  }, 60000);
});
```

**Run Tests:**
```bash
# Unit tests (fast, mocked)
npx jest google-sync.service.spec.ts

# Integration tests (slow, real provider)
npx jest google-sync-driver.integration.spec.ts --passWithNoTests
```

---

## Rollout Plan

### Phase A: Development & Testing (Days 1-3)

1. ✅ Implement Steps 1-5 (add driver, feature flag, new methods)
2. ✅ Write unit tests
3. ✅ Test with real Gmail provider (dev environment)
4. ✅ Compare legacy vs driver results (message counts, performance)

### Phase B: Staging Deployment (Day 4)

1. Deploy to staging with `USE_DRIVER_SYNC_GOOGLE=false` (legacy mode)
2. Verify no regressions
3. Flip to `USE_DRIVER_SYNC_GOOGLE=true` (driver mode)
4. Monitor for 24 hours:
   - Sync success rate
   - Message counts
   - Error logs
   - Performance metrics

### Phase C: Production Rollout (Days 5-7)

1. Deploy to production with `USE_DRIVER_SYNC_GOOGLE=false`
2. Enable driver mode for 10% of users (canary)
3. Monitor metrics, compare with 90% legacy
4. Gradually increase to 50%, then 100%
5. Remove legacy code after 2 weeks of stable driver mode

---

## Success Criteria

✅ **Functional:**
- Full sync retrieves same messages as legacy
- Incremental sync detects all changes
- Database records match legacy format
- Embeddings are queued correctly
- Realtime events are emitted correctly

✅ **Performance:**
- Sync duration within 20% of legacy
- No increase in API rate limit errors
- No increase in database query time

✅ **Reliability:**
- Sync success rate >= 99% (same as legacy)
- Zero data loss
- Error handling works correctly

---

## Rollback Plan

If issues arise during rollout:

1. **Immediate:** Set `USE_DRIVER_SYNC_GOOGLE=false` via env var (no deployment needed)
2. **Quick:** Revert to previous deployment
3. **Debug:** Check logs for driver-specific errors
4. **Fix:** Address issues, re-test in dev, re-deploy

---

## Next Steps After Completion

1. Apply same pattern to `MicrosoftSyncService`
2. Apply same pattern to `ImapSyncService`
3. Create `UnifiedSyncService` (Phase 3)
4. Remove legacy code (Phase 4)

---

## Notes

- **Keep legacy code** until driver mode is stable in production (2+ weeks)
- **Feature flag** allows instant rollback without deployment
- **Real provider testing** at every step ensures correctness
- **Gradual rollout** minimizes risk to production users
