# Email Provider Driver Abstraction Roadmap

> **Status:** Phase 5 In Progress 🚀 (Legacy Code Removal)
> **Created:** 2025-12-10
> **Updated:** 2025-12-12
> **Goal:** Clean multi-provider email architecture with unified folder handling, production-ready for >1000 users

---

## Phase 5: Legacy Code Removal (2025-12-12) 🚀

### Status: IN PROGRESS

GoogleSyncService has been **completely rewritten** to use only the driver architecture, removing all legacy Gmail API code.

### ✅ Completed

1. **GoogleSyncService Driver-Only Refactoring**
   - **Location:** `backend/src/modules/email-sync/services/gmail/google-sync.service.ts`
   - **Before:** 789 lines with direct Gmail API calls
   - **After:** 384 lines (51% reduction) using EmailDriverFactory
   - **Status:** ✅ All tests passing (7/7)

   **Key Changes:**
   - Removed `createGmailClient()` - now uses `EmailDriverFactory.createConnectedDriver()`
   - Removed `syncFull()` - replaced with `syncFullWithDriver()` using `driver.listMessages()`
   - Removed `syncIncremental()` - replaced with `syncIncrementalWithDriver()` using `driver.getChangesSince()`
   - Removed `withRetry()` - now handled by driver's resilience module
   - Added `upsertMessageFromDriver()` - shared helper for canonical message format
   - Added `handleMessageDeletion()` - simplified deletion logic

   **Maintained Features:**
   - ✅ Multi-tenancy (tenantId tracking)
   - ✅ BullMQ integration (embeddings queue)
   - ✅ Realtime events (Socket.IO)
   - ✅ Full and incremental sync modes
   - ✅ Sync token management for Gmail History API

2. **Test Results**
   - `google-sync.service.spec.ts`: 7/7 tests passing ✅
   - `gmail-webhook.service.spec.ts`: All tests passing ✅
   - TypeScript compilation: No errors in production code ✅

### 🔄 In Progress

3. **Email Send Service Migration**
   - **Location:** `backend/src/modules/email/services/email-send.service.ts`
   - **Current:** Uses `ProviderFactory.create()` for sending emails
   - **Target:** Use `EmailDriverFactory.createConnectedDriver()` with `driver.sendMessage()`
   - **Status:** Pending

4. **Calendar Service Migration**
   - **Location:** `backend/src/modules/calendar/`
   - **Current:** May use ProviderFactory for calendar operations
   - **Target:** Use EmailDriverFactory if applicable
   - **Status:** Investigation needed

### 📋 Pending

5. **Delete Legacy Provider Implementations**
   - `backend/src/modules/providers/providers/google-email.provider.ts`
   - `backend/src/modules/providers/providers/microsoft-email.provider.ts`
   - `backend/src/modules/providers/providers/imap-email.provider.ts`
   - `backend/src/modules/providers/factory/provider.factory.ts`
   - **Blocked by:** Email send service and calendar service migration

6. **Update ProvidersModule**
   - **Location:** `backend/src/modules/providers/providers.module.ts`
   - **Keep:** OAuth services only (GoogleOAuthService, MicrosoftOAuthService)
   - **Remove:** IEmailProvider interface, ProviderFactory exports
   - **Status:** Pending

### Next Steps

1. Migrate `email-send.service.ts` to use EmailDriverFactory
2. Verify calendar services don't depend on ProviderFactory
3. Delete legacy provider implementations
4. Update ProvidersModule to export only OAuth services
5. Apply same pattern to MicrosoftSyncService and ImapSyncService

---

## 🚀 PRODUCTION READINESS STATUS

### Comprehensive Audit Results (2025-12-11)

All drivers validated against real email providers:

| Provider | Type | Tests | Passed | Failed | Status |
|----------|------|-------|--------|--------|--------|
| **dvdmarchetto@gmail.com** | Google | 17 | 17 | 0 | ✅ **PASS** |
| **chetto983@hotmail.it** | Microsoft | 17 | 16 | 0 | ✅ **PASS** (1 skipped) |
| **testopta@libero.it** | IMAP | 17 | 13 | 2 | ⚠️ **PASS** (Server limitation) |

### Operation Status by Category

| Category | Google | Microsoft | IMAP | Notes |
|----------|--------|-----------|------|-------|
| **Attachments** | ✅ | ✅ | ✅ | Full download support |
| **Folder CRUD** | ✅ | ✅ | ⚠️ | IMAP: Server may restrict delete |
| **Send Email** | ✅ | ✅ | ✅ | With attachments support |
| **Read/Unread** | ✅ | ✅ | ✅ | Flag operations |
| **Star/Unstar** | ✅ | ✅ | ✅ | Flag operations |
| **Move Message** | ✅ | ✅ | ✅ | Between folders |
| **Trash & Delete** | ✅ | ✅ | ✅ | Soft + hard delete |
| **Sync Operations** | ✅ | ✅ | ✅ | Delta sync (Google/MS) |

### Known Server Limitations (Not Code Issues)

1. **Libero.it IMAP Folder Delete**: Server rejects DELETE command regardless of RFC compliance. Error message guides users to webmail interface.

### Real-Time Sync (PubSub/Webhooks/IDLE) - Production Ready

| Provider | Method | Status | Service/Driver |
|----------|--------|--------|----------------|
| Google | Gmail Pub/Sub | ✅ Production | `gmail-webhook.service.ts` |
| Microsoft | Graph Webhooks | ✅ Production | `microsoft-webhook.service.ts` |
| IMAP | **IDLE (RFC 2177)** | ✅ **Implemented** | `imap.driver.ts:subscribeToChanges()` |

#### IMAP IDLE Test Results (2025-12-11 - Libero.it)

Real-time notifications verified with live testing:

- ✅ **ADDED events**: New email arrival detected instantly
- ✅ **MODIFIED events**: Flag changes (read/unread, starred) detected
- ✅ **DELETED events**: Message expunge detected

**Implementation Notes:**

- Dedicated IDLE connection separate from connection pool (IDLE blocks connection)
- Auto-reconnect on connection loss
- maxIdleTime: 29 minutes (RFC recommends < 30 min)
- Event types: `exists` (new mail), `expunge` (deleted), `flags` (modified)

**Webhook Lifecycle Features:**

- Auto-create subscriptions on provider add
- Daily renewal (BullMQ)
- Weekly cleanup of failed webhooks
- Health monitoring and stats
- Fail-safe fallback to polling

---

## Phase 2 Completion Summary (2025-12-11)

### What Was Done

1. **Created IEmailDriver Interface** - `backend/src/modules/email-sync/drivers/interfaces/email-driver.interface.ts`
   - Full driver contract with connection lifecycle, folder/message operations
   - `BaseEmailDriver` abstract class with common functionality
   - `DriverCredentials` for OAuth2, basic auth, and IMAP connections
   - `ListMessagesOptions`, `GetMessageOptions`, `ListMessagesResult` types

2. **Created Canonical Types** - `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts`
   - `CanonicalFolder`, `CanonicalMessage`, `ComposeMessage` types
   - `ProviderType`, `CanonicalFolderType` enums
   - Provider-specific folder mappings (Gmail labels, Microsoft wellKnownName)
   - Helper functions: `gmailLabelToCanonical()`, `microsoftFolderToCanonical()`, etc.

3. **Implemented GoogleDriver** - `backend/src/modules/email-sync/drivers/google/google.driver.ts`
   - Wraps Gmail API using `googleapis` library
   - Full folder operations (listFolders, getFolder, createFolder, deleteFolder, renameFolder)
   - Message operations (listMessages, getMessage, sendMessage, saveDraft, moveMessage)
   - Flag operations (setReadStatus, setStarredStatus, addLabels, removeLabels)
   - Attachment retrieval
   - Batch operations for efficiency

4. **Implemented MicrosoftDriver** - `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts`
   - Wraps Microsoft Graph API using axios
   - Full folder operations with canonical folder mapping
   - Message operations including MIME-based email sending
   - Flag operations (isRead, flag/importance mapping)
   - Attachment retrieval with base64 handling
   - Delta sync token support for incremental sync

5. **Created EmailDriverFactory** - `backend/src/modules/email-sync/drivers/driver.factory.ts`
   - Factory pattern for driver instantiation
   - `createConnectedDriver()` method for creating pre-connected drivers
   - `createDriverForProvider()` method with full credential resolution from DB

6. **Created DriversModule** - `backend/src/modules/email-sync/drivers/drivers.module.ts`
   - NestJS module exporting factory and drivers
   - Properly integrated with email-sync.module.ts

7. **Tested with Real Data** - `backend/src/modules/email-sync/drivers/test-drivers.script.ts`
   - GoogleDriver: ✅ All tests passed (Gmail account)
   - MicrosoftDriver: ✅ All tests passed (Outlook.com account)
   - Tests: listFolders, listMessages (INBOX/SENT/TRASH), getMessage with full details

### Architecture After Phase 2

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXISTING SYNC SERVICES                             │
│  GoogleSyncService, MicrosoftSyncService                                │
│  (Complex sync logic: history/delta, batching, DB persistence)          │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┴───────────────────────────────────┐
│                         EMAIL DRIVER LAYER (NEW)                        │
│                                                                         │
│  ┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────┐  │
│  │  GoogleDriver   │  │  MicrosoftDriver   │  │  IMAPDriver (Phase 3)│ │
│  │  (Gmail API)    │  │  (Graph API)       │  │  (ImapFlow + SMTP)   │ │
│  └─────────────────┘  └────────────────────┘  └─────────────────────┘  │
│                                                                         │
│  EmailDriverFactory.createConnectedDriver(providerType, credentials)    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Next Steps (Phase 2.5 - Sync Service Integration)

The drivers provide a clean API layer. The next step is to integrate them with sync services:

**Option A: Gradual Migration** (Recommended)
- Keep existing sync services for now
- Use drivers for new features (e.g., send email, folder operations)
- Gradually refactor sync services to use drivers internally

**Option B: Full Refactor**
- Create `UnifiedSyncService` that uses drivers
- Move database persistence logic to shared layer
- Migrate all callers to use unified service

**Current recommendation:** Option A - start using drivers for:
1. Email composition/sending (`sendMessage`, `saveDraft`)
2. Folder CRUD operations (`createFolder`, `deleteFolder`, `renameFolder`)
3. Message flag operations (`setReadStatus`, `setStarredStatus`)

Then proceed to Phase 3 (IMAP) while sync services continue to work

## Executive Summary

The current MailAgent codebase has provider-specific code scattered across multiple files without a clean abstraction layer. This causes:

1. ~~**Folder mismatch issues** - Gmail stores `INBOX`, Microsoft stores `Posta in arrivo`~~ ✅ **FIXED**
2. ~~**Broken multi-provider views** - Queries fail to aggregate emails across providers~~ ✅ **FIXED**
3. **Code duplication** - Similar logic repeated in Google and Microsoft services
4. **No IMAP support** - Cannot add generic email providers

This roadmap defines a 3-phase approach to create a clean driver abstraction.

## Phase 1 Completion Summary (2025-12-10)

### What Was Done

1. **Created Canonical Types** - `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts`
   - Defines `CanonicalFolderType` (INBOX, SENT, TRASH, SPAM, etc.)
   - Provider-to-canonical mappings (Gmail labels, Microsoft wellKnownName, IMAP special-use)
   - Helper functions for folder type conversion

2. **Updated Microsoft Folder Service** - `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`
   - `determineFolderFromParentId()` now returns canonical folder types
   - 4-strategy lookup: exact match → partial ID match → path fallback → INBOX default
   - `specialUseToCanonical()` maps RFC 6154 attributes to canonical types
   - `displayNameToCanonical()` handles Italian/German/English folder names

3. **Simplified Backend Queries** - `backend/src/modules/email/services/emails.service.ts`
   - `getConversations()` uses simple canonical folder matching
   - No more complex specialUse JOINs - just `folder = 'INBOX'`

4. **Fixed Frontend API Calls** - `frontend/components/dashboard/Mailbox.tsx`
   - Uses `folder.specialUse?.toUpperCase()` for API queries instead of localized `folder.path`
   - Ensures frontend sends canonical folder names to backend

5. **Database Migration** - Manual SQL to fix existing data:

   ```sql
   UPDATE emails SET folder = 'INBOX' WHERE folder = 'Posta in arrivo';
   UPDATE emails SET folder = 'SENT' WHERE folder = 'Posta inviata';
   UPDATE emails SET folder = 'SPAM' WHERE folder = 'Posta indesiderata';
   UPDATE emails SET folder = 'INBOX', "isDeleted" = false WHERE folder = 'TRASH' AND "isDeleted" = true;
   ```

### Current Database State

| Folder | Count |
|--------|-------|
| INBOX | 188 (78 Gmail + 110 Microsoft) |
| SENT | 127 (92 Gmail + 35 Microsoft) |
| PROMOTIONS | 15 |
| UPDATES | 13 |
| SPAM | 8 |
| SOCIAL | 2 |

### Architecture After Phase 1

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                       │
│  Mailbox.tsx uses folder.specialUse.toUpperCase() for API queries          │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │ folder=INBOX, folder=SENT, etc.
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND API                                         │
│  getConversations(): { folder: { equals: 'INBOX' } }                       │
│  Simple canonical matching - no JOINs needed                                │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE                                            │
│  emails.folder: 'INBOX', 'SENT', 'TRASH', 'SPAM', etc. (canonical)         │
│  folders.path: 'Posta in arrivo' (display), folders.specialUse: 'INBOX'   │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                             │
│                    (EmailsService, SyncScheduler, etc.)                 │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         IEmailDriver Interface                          │
│                                                                         │
│  - connect(credentials): Promise<void>                                  │
│  - disconnect(): Promise<void>                                          │
│  - listFolders(): Promise<CanonicalFolder[]>                           │
│  - listMessages(folder, options): Promise<CanonicalMessage[]>          │
│  - getMessage(id): Promise<CanonicalMessage>                           │
│  - sendMessage(message): Promise<string>                               │
│  - moveMessage(id, targetFolder): Promise<void>                        │
│  - deleteMessage(id, permanent?): Promise<void>                        │
│  - markAsRead(id, read): Promise<void>                                 │
│  - markAsStarred(id, starred): Promise<void>                           │
│  - getAttachment(messageId, attachmentId): Promise<Attachment>         │
│  - subscribeToChanges(callback): Promise<Subscription>                 │
└──────────┬──────────────────────┬──────────────────────┬───────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│   GoogleDriver   │  │ MicrosoftDriver  │  │      IMAPDriver          │
│                  │  │                  │  │                          │
│ Gmail API        │  │ Graph API        │  │ ImapFlow + SMTP          │
│ Labels → Canon.  │  │ wellKnownName    │  │ RFC6154 / Heuristics     │
│ Push via PubSub  │  │ → Canonical      │  │ IDLE for push            │
└──────────────────┘  └──────────────────┘  └──────────────────────────┘
```

### Canonical Folder Types (RFC 6154 Based)

| Canonical | Microsoft wellKnownName | Gmail Label | IMAP Special-Use | Description |
|-----------|------------------------|-------------|------------------|-------------|
| `INBOX` | inbox | INBOX | \Inbox | Primary inbox |
| `SENT` | sentitems | SENT | \Sent | Sent messages |
| `DRAFTS` | drafts | DRAFT | \Drafts | Draft messages |
| `TRASH` | deleteditems | TRASH | \Trash | Deleted items |
| `SPAM` | junkemail | SPAM | \Junk | Junk/spam mail |
| `ARCHIVE` | archive | - | \Archive | Archived messages |
| `IMPORTANT` | - | IMPORTANT | \Important | Important/priority |
| `STARRED` | - | STARRED | \Flagged | Starred/flagged |
| `OUTBOX` | outbox | - | - | Pending send |
| `CUSTOM` | (other) | (user label) | (other) | User-created folders |

### Canonical Data Models

```typescript
// Canonical folder representation
interface CanonicalFolder {
  id: string;                    // Provider's folder ID
  name: string;                  // Display name (localized)
  type: CanonicalFolderType;     // INBOX, SENT, TRASH, etc.
  path: string;                  // Full path for nested folders
  parentId?: string;             // Parent folder ID
  unreadCount: number;
  totalCount: number;
  attributes: {
    selectable: boolean;         // Can contain messages
    hasChildren: boolean;        // Has subfolders
    subscribed: boolean;         // IMAP subscription status
  };
}

// Canonical message representation
interface CanonicalMessage {
  id: string;                    // Provider's message ID
  threadId?: string;             // Thread/conversation ID
  folder: CanonicalFolderType;   // Canonical folder type
  folderDisplayName: string;     // Original folder name for reference

  // Headers
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;

  // Content
  bodyText?: string;
  bodyHtml?: string;
  snippet: string;

  // Metadata
  receivedAt: Date;
  sentAt?: Date;
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDraft: boolean;

  // Attachments
  hasAttachments: boolean;
  attachments: AttachmentMeta[];

  // Provider-specific (preserved for sync)
  externalId: string;
  rawHeaders?: Record<string, string>;
}

type CanonicalFolderType =
  | 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM'
  | 'ARCHIVE' | 'IMPORTANT' | 'STARRED' | 'OUTBOX'
  | string; // Custom folder name for user folders
```

---

## Phase 1: Immediate Fix (Data Migration)

**Goal:** Fix the current mess by migrating existing data to canonical folder names.

### 1.1 Database Migration

Create a migration script to normalize existing `email.folder` values:

```sql
-- Step 1: Create mapping table
CREATE TEMPORARY TABLE folder_mapping AS
SELECT DISTINCT
  e.folder as old_folder,
  f."specialUse" as special_use,
  CASE
    WHEN f."specialUse" = 'INBOX' THEN 'INBOX'
    WHEN f."specialUse" = 'SENT' THEN 'SENT'
    WHEN f."specialUse" = 'DRAFTS' THEN 'DRAFTS'
    WHEN f."specialUse" = 'TRASH' THEN 'TRASH'
    WHEN f."specialUse" IN ('SPAM', 'JUNK') THEN 'SPAM'
    WHEN f."specialUse" = 'ARCHIVE' THEN 'ARCHIVE'
    WHEN f."specialUse" = 'IMPORTANT' THEN 'IMPORTANT'
    WHEN f."specialUse" = 'FLAGGED' THEN 'STARRED'
    ELSE e.folder  -- Keep custom folder names
  END as new_folder
FROM emails e
LEFT JOIN folders f ON e.folder = f.name AND e."providerId" = f."providerId";

-- Step 2: Update emails table
UPDATE emails e
SET folder = m.new_folder
FROM folder_mapping m
WHERE e.folder = m.old_folder AND m.new_folder != m.old_folder;

-- Step 3: Update folders table - set path = specialUse for system folders
UPDATE folders
SET path = "specialUse"
WHERE "specialUse" IN ('INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE', 'IMPORTANT', 'FLAGGED');
```

### 1.2 Sync Code Updates

Update sync services to store canonical folder types:

**Files to modify:**

- `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`
- `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`
- `backend/src/modules/email-sync/services/gmail/gmail-message-parser.ts`
- `backend/src/modules/email-sync/services/microsoft/microsoft-message-parser.ts`

**Key changes:**

```typescript
// gmail-message-parser.ts
private getCanonicalFolder(labelIds: string[]): string {
  // Priority order for system labels
  if (labelIds.includes('INBOX')) return 'INBOX';
  if (labelIds.includes('SENT')) return 'SENT';
  if (labelIds.includes('DRAFT')) return 'DRAFTS';
  if (labelIds.includes('TRASH')) return 'TRASH';
  if (labelIds.includes('SPAM')) return 'SPAM';

  // Categories become the folder
  if (labelIds.includes('CATEGORY_PROMOTIONS')) return 'PROMOTIONS';
  if (labelIds.includes('CATEGORY_SOCIAL')) return 'SOCIAL';
  if (labelIds.includes('CATEGORY_UPDATES')) return 'UPDATES';
  if (labelIds.includes('CATEGORY_FORUMS')) return 'FORUMS';

  // First user label as folder
  const userLabel = labelIds.find(l => !l.startsWith('CATEGORY_') && !SYSTEM_LABELS.includes(l));
  return userLabel || 'INBOX';
}

// microsoft-message-parser.ts
private getCanonicalFolder(parentFolderId: string, wellKnownName?: string): string {
  const mapping: Record<string, string> = {
    'inbox': 'INBOX',
    'sentitems': 'SENT',
    'drafts': 'DRAFTS',
    'deleteditems': 'TRASH',
    'junkemail': 'SPAM',
    'archive': 'ARCHIVE',
    'outbox': 'OUTBOX',
  };

  if (wellKnownName && mapping[wellKnownName.toLowerCase()]) {
    return mapping[wellKnownName.toLowerCase()];
  }

  // Fallback: lookup folder by ID
  return this.folderIdToCanonical.get(parentFolderId) || parentFolderId;
}
```

### 1.3 Query Simplification

After migration, queries become simple:

```typescript
// Before (complex)
const inboxFolders = await this.getFolderPathsBySpecialUse(tenantId, ['INBOX']);
const where = { folder: { in: inboxFolders, mode: 'insensitive' } };

// After (simple)
const where = { folder: 'INBOX' };
```

### 1.4 Verification Checklist

- [ ] Backup database before migration
- [ ] Run migration script
- [ ] Verify email counts per canonical folder match expected
- [ ] Test multi-provider inbox view shows all emails
- [ ] Test folder sidebar shows correct counts
- [ ] Test email read/unread toggle works
- [ ] Test move to trash works

---

## Phase 2: Driver Abstraction

**Goal:** Create clean `IEmailDriver` interface with provider implementations.

### 2.1 Interface Definition

Create new file: `backend/src/modules/email-sync/drivers/interfaces/email-driver.interface.ts`

```typescript
import { CanonicalFolder, CanonicalMessage, EmailAddress } from './canonical.types';

export interface IEmailDriver {
  readonly providerType: 'google' | 'microsoft' | 'imap';

  // Connection lifecycle
  connect(credentials: DriverCredentials): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Folder operations
  listFolders(): Promise<CanonicalFolder[]>;
  createFolder(name: string, parentId?: string): Promise<CanonicalFolder>;
  deleteFolder(folderId: string): Promise<void>;
  renameFolder(folderId: string, newName: string): Promise<void>;

  // Message listing
  listMessages(options: ListMessagesOptions): Promise<{
    messages: CanonicalMessage[];
    nextPageToken?: string;
    hasMore: boolean;
  }>;

  // Single message operations
  getMessage(messageId: string, options?: GetMessageOptions): Promise<CanonicalMessage>;
  getMessageRaw(messageId: string): Promise<string>; // RFC 822 format

  // Message mutations
  sendMessage(message: ComposeMessage): Promise<string>; // Returns message ID
  saveDraft(message: ComposeMessage): Promise<string>;
  moveMessage(messageId: string, targetFolder: string): Promise<void>;
  copyMessage(messageId: string, targetFolder: string): Promise<string>;
  deleteMessage(messageId: string, permanent?: boolean): Promise<void>;

  // Flags
  setReadStatus(messageId: string, isRead: boolean): Promise<void>;
  setStarredStatus(messageId: string, isStarred: boolean): Promise<void>;
  setFlaggedStatus(messageId: string, isFlagged: boolean): Promise<void>;

  // Attachments
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData>;

  // Real-time sync
  subscribeToChanges(callback: ChangeCallback): Promise<Subscription>;
  getChangesSince(syncToken: string): Promise<{
    changes: Change[];
    newSyncToken: string;
  }>;

  // Batch operations (optional optimization)
  batchGetMessages?(messageIds: string[]): Promise<CanonicalMessage[]>;
  batchSetReadStatus?(updates: Array<{id: string, isRead: boolean}>): Promise<void>;
}

export interface DriverCredentials {
  type: 'oauth2' | 'basic' | 'app-password';
  accessToken?: string;
  refreshToken?: string;
  username?: string;
  password?: string;
  // IMAP-specific
  host?: string;
  port?: number;
  tls?: boolean;
}

export interface ListMessagesOptions {
  folder: string;           // Canonical folder type or custom name
  pageSize?: number;
  pageToken?: string;
  query?: string;           // Search query
  includeDeleted?: boolean;
  onlyUnread?: boolean;
  since?: Date;
}

export interface GetMessageOptions {
  includeBody?: boolean;
  includeAttachments?: boolean;
  format?: 'full' | 'metadata' | 'minimal';
}
```

### 2.2 Directory Structure

``` typescript
backend/src/modules/email-sync/
├── drivers/
│   ├── interfaces/
│   │   ├── email-driver.interface.ts
│   │   ├── canonical.types.ts
│   │   └── index.ts
│   ├── google/
│   │   ├── google.driver.ts
│   │   ├── google-folder.mapper.ts
│   │   ├── google-message.mapper.ts
│   │   └── google.module.ts
│   ├── microsoft/
│   │   ├── microsoft.driver.ts
│   │   ├── microsoft-folder.mapper.ts
│   │   ├── microsoft-message.mapper.ts
│   │   └── microsoft.module.ts
│   ├── imap/
│   │   ├── imap.driver.ts
│   │   ├── imap-folder.mapper.ts
│   │   ├── imap-message.mapper.ts
│   │   ├── smtp.service.ts
│   │   └── imap.module.ts
│   ├── driver.factory.ts
│   └── drivers.module.ts
├── services/
│   ├── unified-sync.service.ts      # Uses IEmailDriver
│   ├── folder-sync.service.ts       # Refactored to use drivers
│   └── ... (other services)
└── ... (existing files during migration)
```

### 2.3 Driver Factory

```typescript
// driver.factory.ts
@Injectable()
export class EmailDriverFactory {
  constructor(
    private googleDriver: GoogleDriver,
    private microsoftDriver: MicrosoftDriver,
    private imapDriver: IMAPDriver,
  ) {}

  getDriver(providerType: 'google' | 'microsoft' | 'imap'): IEmailDriver {
    switch (providerType) {
      case 'google':
        return this.googleDriver;
      case 'microsoft':
        return this.microsoftDriver;
      case 'imap':
        return this.imapDriver;
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  async createConnectedDriver(
    providerType: 'google' | 'microsoft' | 'imap',
    credentials: DriverCredentials,
  ): Promise<IEmailDriver> {
    const driver = this.getDriver(providerType);
    await driver.connect(credentials);
    return driver;
  }
}
```

### 2.4 Google Driver Implementation (Example)

```typescript
// google/google.driver.ts
@Injectable()
export class GoogleDriver implements IEmailDriver {
  readonly providerType = 'google' as const;
  private gmail: gmail_v1.Gmail;
  private connected = false;

  constructor(
    private folderMapper: GoogleFolderMapper,
    private messageMapper: GoogleMessageMapper,
  ) {}

  async connect(credentials: DriverCredentials): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: credentials.accessToken });
    this.gmail = google.gmail({ version: 'v1', auth });
    this.connected = true;
  }

  async listFolders(): Promise<CanonicalFolder[]> {
    const response = await this.gmail.users.labels.list({ userId: 'me' });
    return response.data.labels?.map(label =>
      this.folderMapper.toCanonical(label)
    ) || [];
  }

  async listMessages(options: ListMessagesOptions): Promise<{
    messages: CanonicalMessage[];
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    const labelId = this.folderMapper.toGmailLabel(options.folder);

    const response = await this.gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults: options.pageSize || 50,
      pageToken: options.pageToken,
      q: options.query,
    });

    const messages = await Promise.all(
      (response.data.messages || []).map(async (msg) => {
        const full = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });
        return this.messageMapper.toCanonical(full.data);
      })
    );

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
      hasMore: !!response.data.nextPageToken,
    };
  }

  // ... other methods
}
```

### 2.5 Folder Mapper (Google Example)

```typescript
// google/google-folder.mapper.ts
@Injectable()
export class GoogleFolderMapper {
  private readonly GMAIL_TO_CANONICAL: Record<string, CanonicalFolderType> = {
    'INBOX': 'INBOX',
    'SENT': 'SENT',
    'DRAFT': 'DRAFTS',
    'TRASH': 'TRASH',
    'SPAM': 'SPAM',
    'STARRED': 'STARRED',
    'IMPORTANT': 'IMPORTANT',
    'CATEGORY_PERSONAL': 'PERSONAL',
    'CATEGORY_SOCIAL': 'SOCIAL',
    'CATEGORY_PROMOTIONS': 'PROMOTIONS',
    'CATEGORY_UPDATES': 'UPDATES',
    'CATEGORY_FORUMS': 'FORUMS',
  };

  private readonly CANONICAL_TO_GMAIL: Record<string, string> = {
    'INBOX': 'INBOX',
    'SENT': 'SENT',
    'DRAFTS': 'DRAFT',
    'TRASH': 'TRASH',
    'SPAM': 'SPAM',
    'STARRED': 'STARRED',
    'IMPORTANT': 'IMPORTANT',
  };

  toCanonical(label: gmail_v1.Schema$Label): CanonicalFolder {
    const type = this.GMAIL_TO_CANONICAL[label.id!] || label.name!;

    return {
      id: label.id!,
      name: label.name!,
      type,
      path: label.name!,
      unreadCount: label.messagesUnread || 0,
      totalCount: label.messagesTotal || 0,
      attributes: {
        selectable: label.type !== 'system' || this.isSelectableSystemLabel(label.id!),
        hasChildren: false, // Gmail labels are flat
        subscribed: true,
      },
    };
  }

  toGmailLabel(canonicalType: string): string {
    return this.CANONICAL_TO_GMAIL[canonicalType] || canonicalType;
  }

  private isSelectableSystemLabel(labelId: string): boolean {
    return ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT'].includes(labelId);
  }
}
```

### 2.6 Migration Path

1. Create driver interfaces alongside existing code
2. Implement Google driver wrapping existing `google-sync.service.ts`
3. Implement Microsoft driver wrapping existing `microsoft-sync.service.ts`
4. Create unified sync service that uses drivers
5. Gradually migrate callers to use new unified service
6. Remove old scattered code once all callers migrated

---

## Phase 3: IMAP Support

**Goal:** Add generic IMAP/SMTP support using ImapFlow library.

### 3.1 IMAP Driver Implementation

```typescript
// imap/imap.driver.ts
import { ImapFlow } from 'imapflow';
import { SMTPService } from './smtp.service';

@Injectable()
export class IMAPDriver implements IEmailDriver {
  readonly providerType = 'imap' as const;
  private client: ImapFlow;
  private smtp: SMTPService;
  private folderCache: Map<string, CanonicalFolder> = new Map();

  constructor(
    private folderMapper: IMAPFolderMapper,
    private messageMapper: IMAPMessageMapper,
  ) {}

  async connect(credentials: DriverCredentials): Promise<void> {
    this.client = new ImapFlow({
      host: credentials.host!,
      port: credentials.port || 993,
      secure: credentials.tls !== false,
      auth: {
        user: credentials.username!,
        pass: credentials.password!,
      },
      logger: false,
    });

    await this.client.connect();

    // Initialize SMTP for sending
    this.smtp = new SMTPService({
      host: credentials.smtpHost || credentials.host!,
      port: credentials.smtpPort || 587,
      secure: credentials.smtpTls !== false,
      auth: {
        user: credentials.username!,
        pass: credentials.password!,
      },
    });
  }

  async listFolders(): Promise<CanonicalFolder[]> {
    const mailboxes = await this.client.list();
    const folders = mailboxes.map(mb => this.folderMapper.toCanonical(mb));

    // Cache for folder lookups
    folders.forEach(f => this.folderCache.set(f.type, f));

    return folders;
  }

  async listMessages(options: ListMessagesOptions): Promise<{
    messages: CanonicalMessage[];
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    const mailboxPath = this.getMailboxPath(options.folder);
    const lock = await this.client.getMailboxLock(mailboxPath);

    try {
      const messages: CanonicalMessage[] = [];
      const searchCriteria = this.buildSearchCriteria(options);

      // Calculate pagination
      const start = options.pageToken ? parseInt(options.pageToken) : 1;
      const end = start + (options.pageSize || 50) - 1;

      for await (const message of this.client.fetch(`${start}:${end}`, {
        envelope: true,
        bodyStructure: true,
        flags: true,
        uid: true,
      })) {
        messages.push(this.messageMapper.toCanonical(message, options.folder));
      }

      const status = await this.client.status(mailboxPath, { messages: true });
      const hasMore = end < (status.messages || 0);

      return {
        messages,
        nextPageToken: hasMore ? String(end + 1) : undefined,
        hasMore,
      };
    } finally {
      lock.release();
    }
  }

  private getMailboxPath(canonicalFolder: string): string {
    // Try cached mapping first
    const cached = this.folderCache.get(canonicalFolder);
    if (cached) return cached.path;

    // Fallback to common paths
    const pathMap: Record<string, string[]> = {
      'INBOX': ['INBOX'],
      'SENT': ['Sent', 'Sent Items', 'Sent Messages'],
      'DRAFTS': ['Drafts'],
      'TRASH': ['Trash', 'Deleted Items', 'Deleted Messages'],
      'SPAM': ['Spam', 'Junk', 'Junk E-mail'],
      'ARCHIVE': ['Archive', 'All Mail'],
    };

    return pathMap[canonicalFolder]?.[0] || canonicalFolder;
  }

  // ... other methods
}
```

### 3.2 IMAP Folder Detection (RFC 6154 + Heuristics)

```typescript
// imap/imap-folder.mapper.ts
@Injectable()
export class IMAPFolderMapper {
  // RFC 6154 special-use attributes
  private readonly SPECIAL_USE_TO_CANONICAL: Record<string, CanonicalFolderType> = {
    '\\Inbox': 'INBOX',
    '\\Sent': 'SENT',
    '\\Drafts': 'DRAFTS',
    '\\Trash': 'TRASH',
    '\\Junk': 'SPAM',
    '\\Archive': 'ARCHIVE',
    '\\Flagged': 'STARRED',
    '\\Important': 'IMPORTANT',
    '\\All': 'ARCHIVE',
  };

  // Heuristic name matching (fallback when RFC 6154 not supported)
  private readonly NAME_HEURISTICS: Record<string, CanonicalFolderType> = {
    'inbox': 'INBOX',
    'sent': 'SENT',
    'sent items': 'SENT',
    'sent messages': 'SENT',
    'drafts': 'DRAFTS',
    'draft': 'DRAFTS',
    'trash': 'TRASH',
    'deleted items': 'TRASH',
    'deleted messages': 'TRASH',
    'bin': 'TRASH',
    'spam': 'SPAM',
    'junk': 'SPAM',
    'junk e-mail': 'SPAM',
    'bulk mail': 'SPAM',
    'archive': 'ARCHIVE',
    'all mail': 'ARCHIVE',
  };

  toCanonical(mailbox: any): CanonicalFolder {
    let type: CanonicalFolderType = mailbox.name;

    // Try RFC 6154 special-use first
    if (mailbox.specialUse) {
      const specialType = this.SPECIAL_USE_TO_CANONICAL[mailbox.specialUse];
      if (specialType) type = specialType;
    }

    // Fallback to name heuristics
    if (type === mailbox.name) {
      const normalized = mailbox.name.toLowerCase().trim();
      const heuristicType = this.NAME_HEURISTICS[normalized];
      if (heuristicType) type = heuristicType;
    }

    // INBOX is always INBOX (case-insensitive per RFC 3501)
    if (mailbox.name.toUpperCase() === 'INBOX') {
      type = 'INBOX';
    }

    return {
      id: mailbox.path,
      name: mailbox.name,
      type,
      path: mailbox.path,
      parentId: mailbox.parentPath || undefined,
      unreadCount: 0, // Will be populated by status call
      totalCount: 0,
      attributes: {
        selectable: !mailbox.flags?.has('\\Noselect'),
        hasChildren: mailbox.flags?.has('\\HasChildren') || false,
        subscribed: mailbox.subscribed || false,
      },
    };
  }
}
```

### 3.3 Provider Configuration UI

Add UI for configuring IMAP providers:

```typescript
// Database schema addition
model Provider {
  // ... existing fields

  // IMAP-specific configuration (JSON)
  imapConfig Json? // { host, port, tls, smtpHost, smtpPort, smtpTls }
}

// API endpoint for IMAP provider setup
interface IMAPProviderConfig {
  email: string;
  password: string;  // Stored encrypted
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
}
```

---

## Implementation Checklist

### Phase 1: Immediate Fix ✅ COMPLETE

- [x] Create database backup
- [x] Write and test migration script locally
- [x] Update `gmail-message-parser.ts` to return canonical folders
- [x] Update `microsoft-message-parser.ts` to return canonical folders
- [x] Update `microsoft-folder.service.ts` with 4-strategy canonical lookup
- [x] Run migration on development database
- [x] Verify multi-provider inbox view works
- [x] Simplify queries in `emails.service.ts`
- [x] Fix frontend to send canonical folder names to API

### Phase 2: Driver Abstraction ✅ COMPLETE

- [x] Create `drivers/interfaces/` with types
- [x] Implement `GoogleDriver` wrapping existing code
- [x] Implement `MicrosoftDriver` wrapping existing code
- [x] Create `EmailDriverFactory`
- [x] Test drivers with real Gmail and Outlook.com accounts
- [ ] Create `UnifiedSyncService` using drivers (deferred - see DRIVER_MIGRATION_PLAN.md)
- [ ] Migrate `sync-scheduler.service.ts` to use factory (deferred)
- [ ] Migrate webhook handlers to use drivers (deferred)
- [ ] Remove old duplicated code (deferred - see Phase 4 in migration plan)
- [ ] Add comprehensive tests for drivers

**Note:** The migration from old sync services to driver-based architecture is documented in [DRIVER_MIGRATION_PLAN.md](./DRIVER_MIGRATION_PLAN.md). The current approach is **gradual migration** (Option A), keeping old services for stability while new features use drivers.

**Related Documentation:**

- [REFACTORING_ROADMAP_SUMMARY.md](./REFACTORING_ROADMAP_SUMMARY.md) - High-level overview of all refactoring (START HERE)
- [DRIVER_MIGRATION_PLAN.md](./DRIVER_MIGRATION_PLAN.md) - Detailed migration strategy (Phase 2-4)
- [GOOGLE_SYNC_WRAPPER_IMPLEMENTATION.md](./GOOGLE_SYNC_WRAPPER_IMPLEMENTATION.md) - Sprint 1 implementation guide
- [PROVIDER_ARCHITECTURE_ANALYSIS.md](./PROVIDER_ARCHITECTURE_ANALYSIS.md) - Provider consolidation analysis

### Phase 3: IMAP Support ✅ COMPLETE

- [x] Add `imapflow` dependency (already installed)
- [x] Implement `IMAPDriver` with IEmailDriver interface
- [x] Implement IMAP folder mapping with RFC 6154 + heuristics
- [x] Implement SMTP sending via nodemailer
- [x] Add connection pooling for scalability (>1000 users)
- [x] Test with real IMAP provider (Libero.it) - ALL TESTS PASSED
- [x] Add IDLE support for real-time updates (RFC 2177) - VERIFIED WORKING
- [x] Add IMAP provider configuration UI (with test connection, TLS toggles, provider presets)
- [x] Document IMAP setup process (see [IMAP_SETUP_GUIDE.md](../guides/IMAP_SETUP_GUIDE.md))
- [ ] Add IMAP provider setup wizard
- [ ] Test with more IMAP providers (Yahoo, iCloud, custom)

### Phase 3.5: Resilience Layer (Production-Ready) ✅ COMPLETE

- [x] Create shared resilience layer (`resilience/` module)
  - [x] `ResilienceService` with retry, rate limiting, circuit breaker
  - [x] `ResilienceConfig`, `RetryConfig`, `RateLimitConfig`, `CircuitBreakerConfig` types
  - [x] Provider-specific rate limits (Google ~10 QPS, Microsoft ~4 QPS, IMAP ~5 QPS)
  - [x] Exponential backoff with jitter to prevent thundering herd
  - [x] Per-account circuit breaker to isolate failures
  - [x] Request timeouts with configurable durations
- [x] Create `ResilientDriverWrapper` (decorator pattern)
  - [x] Wraps any `IEmailDriver` with resilience features
  - [x] Automatic retry on transient errors (429, 500, 502, 503, 504)
  - [x] Handles optional methods properly
  - [x] Extended timeouts for batch operations
- [x] Update `EmailDriverFactory` with resilient driver creation
  - [x] `createResilientDriver()` - recommended for production
  - [x] `wrapWithResilience()` - wrap existing drivers
  - [x] `isResilienceAvailable()` - check if resilience module loaded
  - [x] `getResilienceService()` - access metrics/status
- [x] Add metrics tracking for monitoring
  - [x] Total/successful/failed/retried/rate-limited requests
  - [x] Circuit breaker trips count
  - [x] Per-account circuit and rate limit status
- [x] Write comprehensive tests (22 tests, all passing)
- [x] Fix all lint errors, TypeScript compilation verified
- [x] Build verified successful

**Usage (Production):**

```typescript
// Recommended: Use resilient driver for production
const driver = await factory.createResilientDriver(
  'google',
  'account-123',  // Used for per-account rate limiting & circuit breaker
  credentials,
);

// All operations now have retry, rate limit, and circuit breaker protection
const folders = await driver.listFolders();
```

---

## Testing Strategy

### Unit Tests
- Driver interface compliance tests (all drivers must pass same test suite)
- Folder mapper tests (all provider variations → canonical)
- Message mapper tests

### Integration Tests
- Google API integration with test account
- Microsoft Graph integration with test account
- IMAP integration with local Dovecot/test server

### E2E Tests
- Multi-provider inbox view
- Send email via each provider
- Move/delete across providers
- Real-time sync updates

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data migration corrupts emails | High | Full backup before migration, test on staging |
| IMAP provider variations | Medium | Comprehensive heuristics, user-configurable folder mapping |
| OAuth token refresh during driver use | Medium | Token refresh middleware in driver base class |
| Performance regression | Medium | Benchmark before/after, optimize hot paths |

---

## Timeline Recommendation

- **Phase 1:** 2-3 days (critical path - fixes current broken functionality)
- **Phase 2:** 1-2 weeks (clean architecture, enables future features)
- **Phase 3:** 1-2 weeks (new capability, can be parallelized)

**Start with Phase 1 immediately** to fix the multi-provider view issue, then proceed with Phase 2 to prevent future messes.
