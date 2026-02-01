# Phase 5: Google & Microsoft Drivers - Research Document

**Date:** 2026-02-01
**Phase:** 05-google-microsoft-drivers
**Researcher:** GSD Phase Researcher Agent
**Status:** COMPLETE

---

## Executive Summary

Phase 5 focuses on splitting the monolithic `google.driver.ts` (1364 lines) and `microsoft.driver.ts` (1227 lines) into focused service classes following the proven IMAP facade pattern. The IMAP driver demonstrates a successful split into 5 services with the main driver reduced to 199 lines as a pure facade.

**Key finding:** GmailFolderService (429 lines) and MicrosoftFolderService (447 lines) already exist from Phase 4, so this phase focuses ONLY on message, send, and sync services.

---

## Research Question Answers

### 1. Current Structure of google.driver.ts and microsoft.driver.ts

#### Google Driver (1364 lines)

**File:** `D:\MailAgent\backend\src\modules\email-sync\drivers\google\google.driver.ts`

```
Lines 1-78:     Imports, class declaration, connect/disconnect
Lines 79-105:   Retry logic (executeWithRetry wrapper)
Lines 107-229:  Folder Operations (listFolders, getFolder, createFolder, deleteFolder, renameFolder)
Lines 231-334:  Message Listing (listMessages, getMessage, getMessageWithBody, getMessageRaw)
Lines 336-507:  Message Mutations (sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage)
Lines 509-593:  Flags/Status (setReadStatus, setStarredStatus, setFlaggedStatus, addLabels, removeLabels)
Lines 595-648:  Attachments (getAttachment)
Lines 650-690:  User Info (getUserInfo, getEmailAliases)
Lines 692-874:  Batch Operations (batchGetMessages, batchSetReadStatus, batchMoveMessages, batchDeleteMessages)
Lines 876-1080: Delta Sync (getInitialSyncToken, getChangesSince with comprehensive error handling)
Lines 1082-1363: Private Helpers (parsing, conversions, label mapping)
```

**Dependencies:**
- `googleapis` (gmail_v1, google.auth.OAuth2)
- `../interfaces/email-driver.interface` (BaseEmailDriver, interfaces)
- `../interfaces/canonical.types` (types, mappings)
- `../../../../common/utils` (MimeBuilder, withRetry)

**Internal State:**
- `gmail: gmail_v1.Gmail | null`
- `userEmail: string | null`
- `credentials` (inherited)
- `connected` (inherited)

#### Microsoft Driver (1227 lines)

**File:** `D:\MailAgent\backend\src\modules\email-sync\drivers\microsoft\microsoft.driver.ts`

```
Lines 1-105:    Imports, class declaration, connect/disconnect
Lines 106-268:  Folder Operations (listFolders, getFolder, createFolder, deleteFolder, renameFolder)
Lines 270-382:  Message Listing (listMessages, getMessage, getMessageWithBody, getMessageRaw)
Lines 384-486:  Message Mutations (sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage)
Lines 488-571:  Flags/Status and Categories (setReadStatus, setStarredStatus, setFlaggedStatus, addLabels, removeLabels)
Lines 573-638:  Attachments (getAttachment)
Lines 640-731:  Delta Sync (getInitialSyncToken, getChangesSince)
Lines 733-828:  User Info (getUserInfo, getEmailAliases)
Lines 829-1072: Batch Operations (batchGetMessages, batchSetReadStatus, batchMoveMessages, batchDeleteMessages)
Lines 1074-1227: Private Helpers (parsing, conversions, Graph API utilities)
```

**Dependencies:**
- `axios` (HTTP client for Graph API)
- `../interfaces/email-driver.interface` (BaseEmailDriver, interfaces)
- `../interfaces/canonical.types` (types, mappings)
- `../../../../common/utils` (MimeBuilder, withRetry)
- `../../../../common/services/crypto.service` (token decryption)

**Internal State:**
- `accessToken: string`
- `userEmail: string | null`
- `GRAPH_API_BASE` constant
- `credentials` (inherited)
- `connected` (inherited)

---

### 2. Methods/Functionality in Each Driver

#### Methods by Category

| Category | Google Driver Methods | Microsoft Driver Methods |
|----------|----------------------|--------------------------|
| **Connection** | connect, disconnect | connect, disconnect |
| **Folders** | listFolders, getFolder, createFolder, deleteFolder, renameFolder | listFolders, getFolder, createFolder, deleteFolder, renameFolder |
| **Message List** | listMessages, getMessage, getMessageWithBody, getMessageRaw | listMessages, getMessage, getMessageWithBody, getMessageRaw |
| **Message Mutate** | sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage | sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage |
| **Flags** | setReadStatus, setStarredStatus, setFlaggedStatus | setReadStatus, setStarredStatus, setFlaggedStatus |
| **Labels** | addLabels, removeLabels | addLabels (categories), removeLabels (categories) |
| **Attachments** | getAttachment | getAttachment |
| **Batch** | batchGetMessages, batchSetReadStatus, batchMoveMessages, batchDeleteMessages | batchGetMessages, batchSetReadStatus, batchMoveMessages, batchDeleteMessages |
| **Sync** | getInitialSyncToken, getChangesSince | getInitialSyncToken, getChangesSince |
| **User** | getUserInfo, getEmailAliases | getUserInfo, getEmailAliases |

#### Provider-Specific Differences

| Aspect | Google (Gmail) | Microsoft (Graph) |
|--------|---------------|-------------------|
| Auth | OAuth2 with googleapis SDK | Bearer token with axios |
| Folders | Labels (flat structure) | Actual folders (hierarchical) |
| Move | Add/remove labels | Graph API move endpoint |
| Archive | Remove INBOX label | Move to Archive folder |
| Delta Sync | History API (historyId) | Delta query ($deltatoken) |
| Categories | CATEGORY_* labels | Graph categories array |
| Draft handling | Draft API (separate) | Messages with isDraft flag |

---

### 3. How Drivers Interact with Existing Services

#### Current State (Phase 4 Complete)

**Existing folder services that MUST be reused:**

1. **GmailFolderService** (`services/gmail/gmail-folder.service.ts` - 429 lines)
   - `syncGmailFolders(gmail, tenantId, providerId)`
   - `syncFolders(tenantId, providerId)` - facade method
   - `createGmailFolder(providerId, name)`
   - `renameGmailFolder(providerId, labelId, newName)`
   - `deleteGmailFolder(providerId, labelId)`
   - `determineFolderFromLabels(labelIds, fallback)`
   - `getFolderPathForLabel(labelId, labelName)`
   - `getSpecialUseForLabel(labelId)`

2. **MicrosoftFolderService** (`services/microsoft/microsoft-folder.service.ts` - 447 lines)
   - `syncMicrosoftFolders(tenantId, providerId)`
   - `syncFolders(tenantId, providerId)` - facade method
   - `createMicrosoftFolder(providerId, name, parentFolderId?)`
   - `renameMicrosoftFolder(providerId, folderId, newName)`
   - `deleteMicrosoftFolder(providerId, folderId)`
   - `determineFolderFromParentId(parentFolderId, providerId, isDraft)`
   - `fetchMicrosoftFolders(accessToken)` - delta query support

**Shared Dependencies:**
- `PrismaService` - Database operations
- `CryptoService` - Token encryption/decryption
- `ProviderTokenService` - Token management and refresh

#### Integration Points

The folder services use `ProviderTokenService.getProviderWithToken(providerId)` which:
1. Loads provider config from database
2. Decrypts access token using CryptoService
3. Checks token expiry and refreshes if needed
4. Returns `{ accessToken, provider }`

This pattern should be replicated in new message/send/sync services.

---

### 4. Proven IMAP Split Pattern

**File:** `D:\MailAgent\backend\src\modules\email-sync\drivers\imap\imap.driver.ts` (199 lines)

#### Pattern Architecture

```typescript
@Injectable()
export class IMAPDriver extends BaseEmailDriver {
  constructor(
    private readonly connectionPool: ImapConnectionPoolService,
    private readonly folderService: ImapFolderService,
    private readonly messageService: ImapMessageService,
    private readonly idleService: ImapIdleService,
    private readonly sendService: ImapSendService,
  ) { super(); }

  // === Connection Lifecycle ===
  async connect(credentials: DriverCredentials): Promise<void> {
    // Initialize connection pool
    // Build shared context
    // Initialize sub-services with context
  }

  async disconnect(): Promise<void> {
    await this.idleService.stopIdleSubscription();
    await this.connectionPool.closeAll();
    this.sendService.clearConfig();
    this.folderService.clearCache();
    // ...
  }

  // === Folder Operations - DELEGATE ===
  async listFolders(): Promise<CanonicalFolder[]> {
    return this.folderService.listFolders();
  }

  // === Message Operations - DELEGATE ===
  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResult> {
    return this.messageService.listMessages(options);
  }

  // === Send Operations - DELEGATE with callbacks ===
  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    return this.sendService.saveDraft(
      message,
      existingDraftId,
      (id: string, permanent: boolean) => this.messageService.deleteMessage(id, permanent),
    );
  }
}
```

#### Key Pattern Features

1. **Pure Facade** - Driver contains no business logic, only delegation
2. **DI Constructor** - All services injected via NestJS DI
3. **Context Sharing** - Shared context passed to services during connect()
4. **Callback Pattern** - Cross-service calls use callbacks, avoiding circular deps
5. **Clean Disconnect** - Each service has explicit cleanup method

#### IMAP Service Split (5 Services)

| Service | Responsibility | Lines |
|---------|---------------|-------|
| ImapConnectionPoolService | Connection management, pooling | ~300 |
| ImapFolderService | Folder CRUD, listing | ~250 |
| ImapMessageService | Message operations, batch ops | ~400 |
| ImapIdleService | Real-time notifications | ~150 |
| ImapSendService | SMTP send, draft management | ~200 |

---

### 5. Natural Split Boundaries for Message, Send, Sync Services

#### Proposed Service Structure

##### Google Driver Services

| Service | Methods | Est. Lines | Risk |
|---------|---------|-----------|------|
| **GoogleDriver** (facade) | connect, disconnect, delegation | ~150 | Low |
| **GmailFolderService** (EXISTS) | listFolders, CRUD, sync | 429 | N/A |
| **GmailMessageService** (NEW) | listMessages, getMessage, batchGet, flags, attachments | ~400 | Medium |
| **GmailSendService** (NEW) | sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage | ~250 | Medium |
| **GmailSyncService** (NEW) | getInitialSyncToken, getChangesSince | ~200 | High |

##### Microsoft Driver Services

| Service | Methods | Est. Lines | Risk |
|---------|---------|-----------|------|
| **MicrosoftDriver** (facade) | connect, disconnect, delegation | ~150 | Low |
| **MicrosoftFolderService** (EXISTS) | listFolders, CRUD, sync | 447 | N/A |
| **MicrosoftMessageService** (NEW) | listMessages, getMessage, batchGet, flags, categories, attachments | ~400 | Medium |
| **MicrosoftSendService** (NEW) | sendMessage, saveDraft, sendDraft, moveMessage, copyMessage, deleteMessage | ~250 | Medium |
| **MicrosoftSyncService** (NEW) | getInitialSyncToken, getChangesSince | ~200 | High |

#### Method Distribution

**GmailMessageService:**
```typescript
// From google.driver.ts lines 231-334, 509-593, 595-648, 692-874
- listMessages(options: ListMessagesOptions)
- getMessage(messageId, options?)
- getMessageWithBody(messageId)
- getMessageRaw(messageId)
- batchGetMessages(messageIds, includeBody)
- setReadStatus(messageId, isRead)
- setStarredStatus(messageId, isStarred)
- setFlaggedStatus(messageId, isFlagged)
- addLabels(messageId, labels)
- removeLabels(messageId, labels)
- batchSetReadStatus(updates)
- getAttachment(messageId, attachmentId)
// Private helpers: gmailMessageToCanonical, determineFolderFromLabels, parsing
```

**GmailSendService:**
```typescript
// From google.driver.ts lines 336-507, part of 692-874
- sendMessage(message: ComposeMessage)
- saveDraft(message, existingDraftId?)
- sendDraft(draftId)
- moveMessage(messageId, targetFolder)
- copyMessage(messageId, targetFolder)
- deleteMessage(messageId, permanent)
- batchMoveMessages(messageIds, targetFolder)
- batchDeleteMessages(messageIds, permanent)
// Private helpers: composeToRaw
```

**GmailSyncService:**
```typescript
// From google.driver.ts lines 876-1080
- getInitialSyncToken()
- getChangesSince(syncToken)
// All history API error handling logic
```

---

### 6. Dependencies That Could Cause Circular Imports

#### Identified Dependency Chains

```
GoogleDriver
  ├── GmailFolderService (EXISTS)
  │     └── ProviderTokenService
  │           └── PrismaService, CryptoService
  ├── GmailMessageService (NEW)
  │     ├── ProviderTokenService (same instance)
  │     └── GmailFolderService (for determineFolderFromLabels)  ⚠️ RISK
  ├── GmailSendService (NEW)
  │     ├── ProviderTokenService
  │     └── GmailMessageService? (for deleteMessage callback)  ⚠️ RISK
  └── GmailSyncService (NEW)
        └── ProviderTokenService
```

#### Circular Import Risks and Mitigations

| Risk | Services Involved | Mitigation |
|------|-------------------|------------|
| Message needs folder lookup | GmailMessageService -> GmailFolderService | Inject folder service directly (safe - folder has no message deps) |
| Send needs delete | GmailSendService -> GmailMessageService | Use callback pattern from facade (proven in IMAP) |
| Sync needs message batch | GmailSyncService -> GmailMessageService | Return IDs only, let facade batch fetch |

#### Safe Dependency Graph

```
ProviderTokenService (shared, no driver deps)
         ↑
    ┌────┴────────┬──────────────┬────────────────┐
    │             │              │                │
GmailFolder   GmailMessage   GmailSend       GmailSync
    │             │              │                │
    └─────────────┴──────────────┴────────────────┘
                        ↑
                  GoogleDriver (facade)
```

#### Recommended Approach

1. **ProviderTokenService** - Shared by all services (already exists)
2. **Folder service** - No dependencies on message/send/sync
3. **Message service** - Can depend on folder service for label mapping
4. **Send service** - Uses callback for delete (injected by facade)
5. **Sync service** - Returns raw change data, facade enriches if needed

---

### 7. Existing Tests That Must Continue to Pass

#### Test Inventory

| Test File | Status | Coverage |
|-----------|--------|----------|
| `microsoft-folder.service.spec.ts` | EXISTS | MicrosoftFolderService |
| `google-folder.service.spec.ts` | NOT FOUND | - |
| `google.driver.spec.ts` | NOT FOUND | - |
| `microsoft.driver.spec.ts` | NOT FOUND | - |

#### Test Pattern from IMAP (Reference)

**File:** `imap-message.spec.ts` (561 lines)

```typescript
describe('ImapMessageService', () => {
  let service: ImapMessageService;
  let mockConnectionPool: jest.Mocked<ImapConnectionPoolService>;
  let mockFolderService: jest.Mocked<ImapFolderService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ImapMessageService,
        { provide: ImapConnectionPoolService, useValue: createMockConnectionPool() },
        { provide: ImapFolderService, useValue: createMockFolderService() },
      ],
    }).compile();

    service = module.get<ImapMessageService>(ImapMessageService);
    // ...
  });

  describe('listMessages', () => {
    it('should fetch messages from folder', async () => { /* ... */ });
    it('should handle pagination', async () => { /* ... */ });
    it('should handle empty folder', async () => { /* ... */ });
  });

  describe('getMessage', () => {
    it('should fetch single message', async () => { /* ... */ });
    it('should return null for not found', async () => { /* ... */ });
  });

  // ... batch operations, flags, sync tokens
});
```

#### Required Test Coverage for New Services

**GmailMessageService tests:**
- listMessages with pagination
- getMessage with body/metadata format
- batchGetMessages with memory optimization
- Flag operations (read, starred, flagged)
- Label operations (add, remove)
- Attachment retrieval
- Error handling (404, 429, 401, 403)

**GmailSendService tests:**
- sendMessage with attachments
- saveDraft (new and update)
- sendDraft
- moveMessage (including archive)
- copyMessage (label-based)
- deleteMessage (trash and permanent)
- Batch operations

**GmailSyncService tests:**
- getInitialSyncToken
- getChangesSince with pagination
- History ID expiration handling (404)
- Quota exceeded handling (403)
- Rate limit handling (429)
- Server error handling (5xx)

---

### 8. Risk Assessment for Each Extraction

#### Risk Matrix

| Extraction | Risk Level | Rationale | Mitigation |
|------------|------------|-----------|------------|
| **GmailMessageService** | MEDIUM | Core message operations, complex parsing | Extract with comprehensive tests, preserve exact behavior |
| **GmailSendService** | MEDIUM | SMTP-equivalent ops, draft management | Keep MimeBuilder integration intact |
| **GmailSyncService** | HIGH | History API edge cases, error handling | Extensive error scenario tests |
| **MicrosoftMessageService** | MEDIUM | Graph API operations, batch JSON processing | Test batch endpoints thoroughly |
| **MicrosoftSendService** | MEDIUM | Graph API send/draft, MIME handling | Preserve existing MIME building |
| **MicrosoftSyncService** | HIGH | Delta query complexity, token management | Test delta token expiration scenarios |

#### High-Risk Areas

1. **Gmail History API** (lines 876-1080)
   - Complex error handling for expired historyId
   - Pagination with MAX_PAGES limit
   - Memory limits (MAX_CHANGES = 10000)
   - Must preserve all error code handling (404, 403, 429, 5xx)

2. **Microsoft Delta Query** (lines 640-731)
   - Delta token management
   - Pagination through @odata.nextLink
   - Change type mapping

3. **Batch Operations Memory**
   - Gmail batchGetMessages has CONCURRENT_LIMIT = 5
   - setImmediate for GC opportunity
   - Must preserve memory optimization patterns

4. **Cross-Service Callbacks**
   - saveDraft needs deleteMessage
   - sendDraft needs getMessage then deleteMessage
   - Must use callback pattern to avoid circular deps

---

## Recommended Implementation Order

### Wave 1: Message Services (Parallel)
1. **GmailMessageService** - Extract message listing, flags, attachments
2. **MicrosoftMessageService** - Extract message listing, flags, attachments

### Wave 2: Send Services (Parallel)
3. **GmailSendService** - Extract send, draft, move, delete
4. **MicrosoftSendService** - Extract send, draft, move, delete

### Wave 3: Sync Services (Parallel)
5. **GmailSyncService** - Extract history API operations
6. **MicrosoftSyncService** - Extract delta query operations

### Wave 4: Facade Refactor (Sequential)
7. **GoogleDriver** - Refactor to pure facade
8. **MicrosoftDriver** - Refactor to pure facade

---

## File Structure After Split

```
backend/src/modules/email-sync/
├── drivers/
│   ├── google/
│   │   ├── google.driver.ts           (~150 lines - facade)
│   │   ├── services/
│   │   │   ├── gmail-message.service.ts    (~400 lines)
│   │   │   ├── gmail-send.service.ts       (~250 lines)
│   │   │   └── gmail-sync.service.ts       (~200 lines)
│   │   └── __tests__/
│   │       ├── gmail-message.service.spec.ts
│   │       ├── gmail-send.service.spec.ts
│   │       └── gmail-sync.service.spec.ts
│   ├── microsoft/
│   │   ├── microsoft.driver.ts        (~150 lines - facade)
│   │   ├── services/
│   │   │   ├── microsoft-message.service.ts   (~400 lines)
│   │   │   ├── microsoft-send.service.ts      (~250 lines)
│   │   │   └── microsoft-sync.service.ts      (~200 lines)
│   │   └── __tests__/
│   │       ├── microsoft-message.service.spec.ts
│   │       ├── microsoft-send.service.spec.ts
│   │       └── microsoft-sync.service.spec.ts
│   └── imap/  (reference implementation - unchanged)
├── services/
│   ├── gmail/
│   │   └── gmail-folder.service.ts    (EXISTS - 429 lines)
│   └── microsoft/
│       └── microsoft-folder.service.ts (EXISTS - 447 lines)
```

---

## Open Questions for Planning

1. **Should message/send/sync services be in `drivers/google/services/` or `services/gmail/`?**
   - Recommendation: Keep in `drivers/google/services/` to mirror IMAP pattern

2. **Should we create a shared base class for message services?**
   - Not recommended for Phase 5 - extract first, refactor commonality in future phase

3. **How to handle the helper methods (1082-1363 in Google, 1074-1227 in Microsoft)?**
   - Move parsing helpers to respective services that use them
   - Consider extracting truly shared helpers to common/utils if duplicated

4. **Should subscribeToChanges be added to Google/Microsoft?**
   - Not in scope for Phase 5 - IMAP has idleService, API providers use polling

---

## Conclusion

Phase 5 has clear boundaries and a proven pattern to follow. The main risks are in the sync services due to complex error handling. The folder services from Phase 4 can be reused directly.

**Confidence Level:** HIGH for successful extraction following IMAP pattern.

**Estimated Effort:**
- GmailMessageService: 4-6 hours
- GmailSendService: 3-4 hours
- GmailSyncService: 4-6 hours (high complexity)
- MicrosoftMessageService: 4-6 hours
- MicrosoftSendService: 3-4 hours
- MicrosoftSyncService: 4-6 hours (high complexity)
- Facade refactors: 2-3 hours each
- Test creation: 8-12 hours total

**Total Estimated:** 32-47 hours
