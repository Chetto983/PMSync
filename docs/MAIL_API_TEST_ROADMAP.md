# Mail API Test & Refactor Roadmap

## Test Results Summary (Production Ready)

| Module | Tests | Status |
|--------|-------|--------|
| Email Services | 132 | ✅ PASS |
| Email Sync | 49 | ✅ PASS |
| **Total** | **181** | ✅ **ALL PASS** |

---

## Overview

This document provides a comprehensive roadmap for testing and refactoring the mail module to ensure:
1. **Provider is Source of Truth** - Database is a cache that syncs from provider
2. **RFC 6154 Compliance** - Use `specialUse` attribute for folder type detection
3. **Locale Independence** - No hardcoded folder names, support for localized providers (Libero, etc.)
4. **Cross-Provider Consistency** - Unified behavior across Gmail, Microsoft, and IMAP

---

## Audit Summary

### Issues Fixed

| File | Issue | Fix |
|------|-------|-----|
| `emails.service.ts` | `searchEmails()` used hardcoded `['TRASH', 'SPAM']` | Now uses `getFolderPathsBySpecialUse()` to lookup actual paths |
| `emails.service.ts` | `getConversations()` used hardcoded folder names | Now uses `specialUse` lookup for locale-independent filtering |
| `emails.service.ts` | `updateFolderCounts()` compared `folder === 'TRASH'` | Now uses `specialUse` from folder record |
| `email-sync-back.service.ts` | `getMicrosoftFolderId()` had incomplete mapping | Added proper folder lookup by path/specialUse |
| `cross-provider-conflict.service.ts` | Hardcoded 'INBOX' in union/intersection | Removed - now uses most recent folder |
| `email-send.service.ts` | Hardcoded Italian folder names | Uses only RFC 6154 `specialUse` attribute |
| `FolderContextMenu.tsx` | Hardcoded English strings | Added i18n translations |

### Files Verified OK

| File | Status | Notes |
|------|--------|-------|
| `imap-sync.service.ts` | ✅ | Uses `folder.path` correctly |
| `google-sync.service.ts` | ✅ | Gmail labels are standardized |
| `microsoft-sync.service.ts` | ✅ | Uses Graph API folder IDs |
| `folder-sync.service.ts` | ✅ | Multi-locale detection (EN, IT, DE, FR, ES) |
| `base-email-sync.service.ts` | ✅ | `normalizeFolderName()` for classification only |
| `Mailbox.tsx` | ✅ | Uses translations + specialUse for API |
| `FolderSelectorDialog.tsx` | ✅ | Uses translations for display |

---

## Test Coverage Roadmap

### Phase 1: Unit Tests - Email CRUD Operations

#### 1.1 emails.service.ts
```
Tests to add/update:
- [ ] searchEmails: Verify locale-independent folder exclusion with Cestino/Posta Eliminata
- [ ] getConversations: Verify TRASH/SPAM exclusion with localized paths
- [ ] updateFolderCounts: Verify TRASH detection using specialUse
- [ ] deleteEmail: Verify provider sync uses actual folder path
- [ ] bulkDelete: Verify batch operations work with localized folders
- [ ] moveToFolder: Verify folder path lookup by specialUse
```

#### 1.2 email-send.service.ts
```
Tests to add:
- [ ] getSentFolderName: Returns actual path ("Posta Inviata") not normalized ("SENT")
- [ ] sendEmail: Saves sent email to correct localized folder
- [ ] saveDraft: Uses drafts folder from provider
```

### Phase 2: Unit Tests - Sync Services

#### 2.1 email-sync-back.service.ts
```
Tests to add:
- [ ] syncOperationToProvider (Gmail): Uses correct label IDs
- [ ] syncOperationToProvider (Microsoft): Uses getMicrosoftFolderId()
- [ ] syncOperationToProvider (IMAP): Uses getImapFolderPath()
- [ ] Batch operations: Process localized folders correctly
```

#### 2.2 folder-sync.service.ts
```
Tests to verify:
- [ ] detectSpecialUse: Detects INBOX/SENT/TRASH from IT/DE/FR/ES names
- [ ] syncFolders: Creates folders with correct specialUse
- [ ] Multi-provider: Same tenant, different locales
```

#### 2.3 cross-provider-dedup.service.ts
```
Tests to add:
- [ ] dedupEmail: Links emails across providers correctly
- [ ] findLinkedEmails: Returns all linked instances
- [ ] Conflict detection: Folder divergence with localized paths
```

#### 2.4 cross-provider-conflict.service.ts
```
Tests to verify:
- [ ] resolveLastWriteWins: Uses actual folder paths
- [ ] resolveUnion: No hardcoded INBOX
- [ ] resolveIntersection: No hardcoded INBOX
- [ ] resolvePriorityBased: Respects provider priority
```

### Phase 3: Integration Tests

#### 3.1 IMAP Provider (Libero/Generic)
```
Test scenarios:
- [ ] Sync folders: "Posta in arrivo" → specialUse: INBOX
- [ ] Sync folders: "Posta Inviata" → specialUse: SENT
- [ ] Sync folders: "Cestino" → specialUse: TRASH
- [ ] Delete email: Mark isDeleted, sync to "Cestino"
- [ ] Move email: Frontend sends actual path, backend syncs
- [ ] Send email: Saved to "Posta Inviata" (actual path)
- [ ] Search: Excludes "Cestino" and "Spam" by specialUse lookup
```

#### 3.2 Gmail Provider
```
Test scenarios:
- [ ] Sync labels: INBOX, SENT, TRASH (standard IDs)
- [ ] Delete email: Uses TRASH label
- [ ] Star email: Uses STARRED label
- [ ] Mark read: Removes UNREAD label
- [ ] Batch operations: Uses batchModify API
```

#### 3.3 Microsoft/Outlook Provider
```
Test scenarios:
- [ ] Sync folders: Uses Graph API folder IDs
- [ ] Delete email: Moves to deleteditems
- [ ] Move email: Uses /move endpoint with folder ID
- [ ] Well-known folders: inbox, sentitems, drafts, deleteditems
```

#### 3.4 Cross-Provider Scenarios
```
Test scenarios:
- [ ] Same email in Gmail + IMAP: Linked via messageId
- [ ] Delete in one provider: Syncs to other via cross-provider link
- [ ] Read status: Conflict resolution works
- [ ] Star status: Conflict resolution works
```

### Phase 4: E2E Tests

#### 4.1 Folder Operations
```
E2E scenarios:
- [ ] Create subfolder via context menu
- [ ] Rename custom folder
- [ ] Delete custom folder
- [ ] Refresh folder (re-sync)
- [ ] System folder protection (INBOX cannot be deleted)
```

#### 4.2 Email Operations
```
E2E scenarios:
- [ ] View emails by folder (using specialUse aggregation)
- [ ] Delete email → appears in Trash
- [ ] Move email → updates folder immediately
- [ ] Bulk operations (select multiple, delete/archive/move)
- [ ] Search → excludes Trash/Spam regardless of locale
```

#### 4.3 Multi-Provider
```
E2E scenarios:
- [ ] Add Gmail + Libero accounts
- [ ] View unified inbox
- [ ] Delete from unified view
- [ ] Search across providers
```

---

## API Endpoints to Test

### Email Controller (`/api/emails`)

| Endpoint | Method | Test Cases |
|----------|--------|------------|
| `/` | GET | Filter by folder, specialUse, pagination |
| `/:id` | GET | Get email with attachments |
| `/:id` | DELETE | Soft delete, provider sync |
| `/:id/star` | PATCH | Toggle star, provider sync |
| `/:id/read` | PATCH | Toggle read, provider sync |
| `/:id/move` | PATCH | Move to folder by path |
| `/bulk/delete` | POST | Bulk delete IDs |
| `/bulk/read` | POST | Bulk mark read |
| `/bulk/star` | POST | Bulk toggle star |
| `/bulk/move` | POST | Bulk move to folder |
| `/search` | GET | Search with TRASH/SPAM exclusion |
| `/thread/:threadId` | GET | Get thread emails |

### Folder Controller (`/api/folders`)

| Endpoint | Method | Test Cases |
|----------|--------|------------|
| `/` | GET | List folders by provider |
| `/` | POST | Create folder (validates parent) |
| `/:id` | PATCH | Rename folder (not system) |
| `/:id` | DELETE | Delete folder (not system) |
| `/:id/sync` | POST | Force sync folder |

### Send Controller (`/api/emails/send`)

| Endpoint | Method | Test Cases |
|----------|--------|------------|
| `/` | POST | Send email, save to Sent folder |
| `/draft` | POST | Save draft to Drafts folder |
| `/draft/:id` | PATCH | Update draft |
| `/draft/:id/send` | POST | Send draft |

---

## Frontend Components to Test

### Email Components

| Component | Test Cases |
|-----------|------------|
| `Mailbox.tsx` | Folder selection, email list, bulk bar |
| `ThreadDisplay.tsx` | Email rendering, actions, attachments |
| `FolderContextMenu.tsx` | Create/rename/delete folders (i18n) |
| `FolderSelectorDialog.tsx` | Folder selection for move (i18n) |
| `EmailBody.tsx` | HTML/text rendering, attachments |

### Translations Required

```typescript
// Already added:
t.dashboard.folders.createSubfolder
t.dashboard.folders.moveEmailsHere
t.dashboard.folders.refresh
t.dashboard.folders.systemFolder
t.common.rename
t.common.delete

// Verify exist:
t.dashboard.folders.inbox
t.dashboard.folders.sent
t.dashboard.folders.drafts
t.dashboard.folders.trash
t.dashboard.folders.spam
t.dashboard.folders.archive
```

---

## Database Schema Verification

### Folder Table
```prisma
model Folder {
  id         String  @id
  providerId String
  tenantId   String
  path       String  // Actual IMAP/API path (e.g., "Posta Inviata")
  name       String  // Display name
  specialUse String? // RFC 6154: INBOX, SENT, TRASH, DRAFTS, SPAM, ARCHIVE

  @@unique([providerId, path])
}
```

### Email Table
```prisma
model Email {
  id       String  @id
  folder   String  // Actual folder path from provider
  // Note: folder contains actual path, use Folder.specialUse for type
}
```

---

## Implementation Checklist

### Backend
- [x] `emails.service.ts` - Fixed folder filtering
- [x] `email-sync-back.service.ts` - Fixed Microsoft folder lookup
- [x] `cross-provider-conflict.service.ts` - Removed hardcoded INBOX
- [x] `email-send.service.ts` - Uses specialUse only
- [ ] Add more comprehensive tests for locale scenarios
- [ ] Add E2E tests for cross-provider sync

### Frontend
- [x] `FolderContextMenu.tsx` - Added translations
- [x] `Mailbox.tsx` - Uses specialUse for API queries
- [ ] `ThreadDisplay.tsx` - Verify relative time i18n
- [ ] Add Cypress E2E tests for folder operations

### Documentation
- [x] `EMAIL_SYNC_REFACTOR_ROADMAP.md` - Updated
- [x] `MAIL_API_TEST_ROADMAP.md` - Created (this file)

---

## Priority Matrix

| Priority | Task | Effort |
|----------|------|--------|
| **P0** | Fix remaining hardcoded folder comparisons | Done ✅ |
| **P0** | Verify IMAP sync with Libero | Manual test |
| **P1** | Add unit tests for locale scenarios | 1-2 days |
| **P1** | Add integration tests for cross-provider | 2-3 days |
| **P2** | Add Cypress E2E tests | 3-5 days |
| **P2** | Add German/French locale detection | 0.5 day |
| **P3** | Add offline support queueing | Future |

---

## Testing Commands

```bash
# Run all email module tests
npx jest src/modules/email --coverage

# Run sync service tests
npx jest src/modules/email-sync --coverage

# Run specific service test
npx jest src/modules/email/services/emails.service.spec.ts

# Run with verbose output
npx jest --verbose src/modules/email

# Run E2E tests (when available)
npx cypress run --spec "cypress/e2e/email/**"
```

---

## References

- [RFC 6154 - IMAP LIST Extension for Special-Use Mailboxes](https://datatracker.ietf.org/doc/html/rfc6154)
- [Gmail API - Labels](https://developers.google.com/gmail/api/reference/rest/v1/users.labels)
- [Microsoft Graph - Mail Folders](https://learn.microsoft.com/en-us/graph/api/resources/mailfolder)
- [IMAP RFC 3501](https://datatracker.ietf.org/doc/html/rfc3501)
