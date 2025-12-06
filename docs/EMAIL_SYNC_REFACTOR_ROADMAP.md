# Email Sync Refactoring Roadmap

## Core Principle: Provider is Source of Truth

The email provider (Gmail, Outlook, IMAP server) is the **authoritative source** for:
- Folder names and structure
- Email locations
- Email state (read, starred, deleted)

Our database is a **cache** that syncs from the provider.

---

## Current Issues Fixed

### 1. Folder Name Normalization (FIXED)
- **Problem**: We were normalizing folder names (e.g., "Posta Inviata" -> "SENT")
- **Solution**: Use actual folder paths from provider
- **Files Changed**:
  - `imap-sync.service.ts` - Use `folder.path` not normalized names
  - `microsoft-folder.service.ts` - Return actual folder display name
  - `email-send.service.ts` - Look up actual sent folder path

### 2. Delete Operations (FIXED)
- **Problem**: Manually tracking and updating folder to "TRASH"
- **Solution**: Just mark `isDeleted=true`, sync to provider, let sync update folder
- **Files Changed**:
  - `emails.service.ts` - Simplified `deleteEmail()` and `bulkDelete()`

---

## Remaining Refactoring Tasks

### Phase 1: Clean Up Sync Services

#### 1.1 IMAP Sync Service
- [x] Remove `normalizeFolderName()` usage - now uses actual folder.path
- [x] Folder comparisons use `specialUse` field for type detection
- [x] Reconcile logic uses actual folder paths from provider

#### 1.2 Gmail Sync Service
- [x] Gmail uses label IDs (INBOX, SENT, TRASH) which ARE the canonical names
- [x] No changes needed - Gmail labels are standard

#### 1.3 Microsoft Sync Service
- [x] `determineFolderFromParentId` returns actual folder name
- [x] Folder sync uses actual display names from Graph API

### Phase 2: Folder Table Schema

#### 2.1 Current Schema
```prisma
model Folder {
  id          String   @id @default(uuid())
  providerId  String
  tenantId    String
  path        String   // Actual IMAP/API path
  name        String   // Display name
  specialUse  String?  // INBOX, SENT, TRASH, DRAFTS, etc.
  // ...
}
```

#### 2.2 Recommendations
- [x] `path` = actual provider path (e.g., "Posta Inviata", folder GUID)
- [x] `name` = display name for UI
- [x] `specialUse` = normalized type (INBOX, SENT, TRASH, DRAFTS, SPAM, ARCHIVE)
- [x] Unique constraint exists: `@@unique([providerId, path])`

### Phase 3: Email Operations

#### 3.1 Delete Flow
```
User clicks delete
    -> Mark isDeleted=true in DB (for UI)
    -> Sync delete to provider
    -> Provider moves to Trash
    -> Next sync updates email.folder from provider
```

#### 3.2 Move Flow
```
User moves email
    -> Sync move to provider
    -> Provider updates folder
    -> Next sync updates email.folder from provider
```

#### 3.3 Star/Read Flow
```
User stars/reads email
    -> Update DB for immediate UI
    -> Sync to provider
    -> Provider confirms (or next sync corrects)
```

### Phase 4: Provider-Specific Handlers

#### 4.1 Gmail
| Operation | API Call | Our Action |
|-----------|----------|------------|
| Delete | `messages.trash()` | Sync, Gmail moves to TRASH |
| Permanent Delete | `messages.delete()` | Delete from DB + API |
| Star | `messages.modify(addLabels: STARRED)` | Sync flag |
| Read | `messages.modify(removeLabels: UNREAD)` | Sync flag |

#### 4.2 Microsoft/Outlook
| Operation | API Call | Our Action |
|-----------|----------|------------|
| Delete | `messages/{id}/move` to deleteditems | Sync, Outlook moves |
| Permanent Delete | `DELETE messages/{id}` | Delete from DB + API |
| Star | `PATCH messages/{id}` flag.flagStatus | Sync flag |
| Read | `PATCH messages/{id}` isRead | Sync flag |

#### 4.3 IMAP/Generic
| Operation | IMAP Command | Our Action |
|-----------|--------------|------------|
| Delete | `COPY` to Trash + `STORE \Deleted` + `EXPUNGE` | Sync, server moves |
| Permanent Delete | `STORE \Deleted` + `EXPUNGE` | Delete from DB + IMAP |
| Star | `STORE +FLAGS \Flagged` | Sync flag |
| Read | `STORE +FLAGS \Seen` | Sync flag |

### Phase 5: Error Handling & Conflict Resolution

#### 5.1 Sync Conflicts
- [ ] If local change conflicts with server, server wins
- [ ] Queue failed operations for retry
- [ ] Log conflicts for debugging

#### 5.2 Offline Support (Future)
- [ ] Queue operations when offline
- [ ] Sync when back online
- [ ] Handle merge conflicts

---

## Files Reference

### Backend Services
| File | Purpose | Status |
|------|---------|--------|
| `emails.service.ts` | Email CRUD operations | REFACTORED |
| `emails.controller.ts` | Email API endpoints | REFACTORED (added specialUse filter) |
| `email-send.service.ts` | Send emails | REFACTORED (uses specialUse for folder lookup) |
| `email-sync-back.service.ts` | Sync operations to provider | REFACTORED (folder lookup by specialUse) |
| `imap-sync.service.ts` | IMAP email sync | REFACTORED |
| `google-sync.service.ts` | Gmail email sync | OK |
| `microsoft-sync.service.ts` | Outlook email sync | OK |
| `folder-sync.service.ts` | Folder sync | OK (multi-locale support) |
| `gmail-folder.service.ts` | Gmail labels | OK |
| `microsoft-folder.service.ts` | Outlook folders | REFACTORED |
| `cross-provider-conflict.service.ts` | Conflict resolution | REFACTORED (removed hardcoded INBOX) |
| `base-email-sync.service.ts` | Base sync class | OK (normalizeFolderName for classification) |

### Frontend Components
| File | Purpose | Status |
|------|---------|--------|
| `Mailbox.tsx` | Main mailbox view | REFACTORED (RFC 6154 specialUse) |
| `lib/api/email.ts` | Email API types | REFACTORED (added specialUse) |

### Key Concepts

1. **`specialUse`** - Normalized folder type (INBOX, SENT, TRASH, DRAFTS, SPAM, ARCHIVE) per RFC 6154
2. **`path`** - Actual provider folder path/ID (never normalized)
3. **`name`** - Display name for UI
4. **Provider is truth** - Our DB is a cache, sync updates it
5. **Locale handling** - Backend uses `specialUse` for type detection, frontend handles display localization

### Locale Support

The backend's `folder-sync.service.ts` detects folder types from localized names:

- **English**: Inbox, Sent, Trash, Drafts, Junk, Archive
- **Italian**: Posta in arrivo, Posta Inviata, Cestino, Bozze, Spam, Archivio
- **German**: Posteingang, Gesendet, Papierkorb, Entwürfe, Spam, Archiv
- **French**: Boîte de réception, Envoyés, Corbeille, Brouillons, Courrier indésirable
- **Spanish**: Bandeja de entrada, Enviados, Papelera, Borradores, Spam, Archivo

The detected type is stored in `specialUse` - frontend uses this for aggregation and icons.

---

## Testing Checklist

### IMAP (Libero, etc.)
- [ ] Sync folders - actual names stored
- [ ] Sync emails - folder field has actual path
- [ ] Delete email - provider moves to trash, sync updates folder
- [ ] Bulk delete - same behavior
- [ ] Send email - saved with actual Sent folder path

### Gmail
- [ ] Labels sync correctly
- [ ] Delete moves to TRASH label
- [ ] Permanent delete removes from server

### Outlook
- [ ] Folders sync with actual display names
- [ ] Delete moves to Deleted Items
- [ ] Permanent delete removes from server

---

## Best Practices Reference

From [Stack Overflow - IMAP Best Practices](https://stackoverflow.com/questions/69045401/best-practice-updating-imap-client-about-deleted-messages-set-flags):
> "The server contains an authoritative copy of the mail. Clients are simply caching for performance."

From [TechTarget - IMAP Protocol](https://www.techtarget.com/whatis/definition/IMAP-Internet-Message-Access-Protocol):
> "IMAP keeps everything in sync. Delete in one place, deleted everywhere."

---

## Online Resources & References

### IMAP Protocol

- [What is IMAP (Internet Message Access Protocol)? - TechTarget](https://www.techtarget.com/whatis/definition/IMAP-Internet-Message-Access-Protocol)
- [Internet Message Access Protocol (IMAP) Explained - Iotec Digital](https://iotecdigital.com/blog/internet-message-access-protocol/)
- [What is IMAP - Nylas](https://www.nylas.com/products/email-api/what-is-imap/)

### Best Practices

- [Best practice updating IMAP client about deleted messages - Stack Overflow](https://stackoverflow.com/questions/69045401/best-practice-updating-imap-client-about-deleted-messages-set-flags)
- [Be Careful Deleting Email If You Use IMAP - Ask Leo](https://askleo.com/be-careful-deleting-email-if-you-use-imap/)
- [Option to turn off sync emails on IMAP - Mozilla Connect](https://connect.mozilla.org/t5/ideas/option-to-turn-off-sync-emails-on-imap-i-e-do-not-let-the-server/idi-p/46227)

### Data Management

- [Keep IMAP messages locally when deleted remotely - Super User](https://superuser.com/questions/416741/keep-imap-messages-locally-when-deleted-remotely)
- [Retain IMAP emails when changing providers - Super User](https://superuser.com/questions/1081639/how-do-i-retain-my-imap-emails-when-changing-email-host-providers-export-import)
- [Save IMAP emails locally and delete from server - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4731141/can-you-save-imap-emails-locally-and-still-delete)

### Provider APIs

- [Gmail API - Messages](https://developers.google.com/gmail/api/reference/rest/v1/users.messages)
- [Microsoft Graph Mail API](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [IMAP RFC 3501](https://datatracker.ietf.org/doc/html/rfc3501)
- [IMAP QRESYNC Extension RFC 7162](https://datatracker.ietf.org/doc/html/rfc7162)

### Open Source Email Clients (Reference Implementations)

- [imapflow - Node.js IMAP Client](https://github.com/postalsys/imapflow)
- [nodemailer - Email Sending](https://github.com/nodemailer/nodemailer)
- [mailparser - Email Parsing](https://github.com/nodemailer/mailparser)
