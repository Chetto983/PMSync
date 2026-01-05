# IMAP Protocol - Comprehensive Reference Guide

> **Purpose**: Complete reference for implementing IMAP email synchronization in MailAgent.
> **Date**: 2025-01-04
> **Status**: Production Reference - DO NOT modify without consensus

---

## Table of Contents

1. [IMAP Fundamentals](#1-imap-fundamentals)
2. [Connection Management](#2-connection-management)
3. [Authentication](#3-authentication)
4. [Mailbox (Folder) Operations](#4-mailbox-folder-operations)
5. [Message Operations](#5-message-operations)
6. [UIDs vs Sequence Numbers](#6-uids-vs-sequence-numbers)
7. [CONDSTORE & QRESYNC Extensions](#7-condstore--qresync-extensions)
8. [IDLE Command (Real-time)](#8-idle-command-real-time)
9. [Bulk Operations](#9-bulk-operations)
10. [Provider-Specific Quirks](#10-provider-specific-quirks)
11. [Error Handling](#11-error-handling)
12. [Best Practices](#12-best-practices)
13. [ImapFlow Library Reference](#13-imapflow-library-reference)

---

## 1. IMAP Fundamentals

### 1.1 Protocol Overview

IMAP (Internet Message Access Protocol) defined in RFC 3501 provides:
- Remote mailbox access (messages stay on server)
- Multiple concurrent connections
- Folder hierarchy
- Message flags and metadata
- Search capabilities

### 1.2 Key Concepts

| Concept | Description |
|---------|-------------|
| **Mailbox** | Folder containing messages (INBOX, Sent, etc.) |
| **UID** | Unique Identifier - permanent message ID within mailbox |
| **Sequence Number** | Temporary position (1, 2, 3...) - changes on delete! |
| **UIDVALIDITY** | Mailbox version - if changed, all UIDs are invalid |
| **Flags** | Message state: \Seen, \Flagged, \Deleted, \Draft, \Answered |

### 1.3 Connection States

```
NOT AUTHENTICATED → AUTHENTICATED → SELECTED → LOGOUT
      │                  │              │
      └── LOGIN ─────────┘              │
                         └── SELECT ────┘
```

---

## 2. Connection Management

### 2.1 Connection Settings

```typescript
interface ImapConfig {
  host: string;           // e.g., 'imap.gmail.com'
  port: number;           // 993 (TLS) or 143 (STARTTLS)
  secure: boolean;        // true for port 993
  auth: {
    user: string;         // Email address
    pass: string;         // Password or app-specific password
  };
  // Optional
  tls?: {
    rejectUnauthorized: boolean;  // Validate certificates
    servername?: string;          // SNI hostname
  };
  connectionTimeout?: number;     // Default: 90000ms
  greetingTimeout?: number;       // Default: 16000ms
  socketTimeout?: number;         // Default: 300000ms
}
```

### 2.2 Standard IMAP Ports

| Port | Security | Use Case |
|------|----------|----------|
| 993 | TLS/SSL | **Recommended** - encrypted from start |
| 143 | STARTTLS | Legacy - upgrade after connect |

### 2.3 Connection Limits by Provider

**Note:** These limits are from community experience, not official documentation. Test with your specific provider.

| Provider | Reported Limit | Source |
|----------|----------------|--------|
| **Gmail** | ~15 | Community reports |
| **Outlook/Hotmail** | Unknown | Not officially documented |
| **Yahoo** | ~10 | Community reports |
| **iCloud** | ~10 | Community reports |

**Best Practice:** Use 2-3 connections max per account to avoid issues. Providers may reduce limits without notice.

**Error:** "Too many simultaneous connections" = reduce connection count.

### 2.4 Connection Pooling Strategy

```typescript
class ImapConnectionPool {
  private connections: Map<string, ImapConnection> = new Map();
  private maxConnections = 3;  // Stay well under provider limits

  async getConnection(accountId: string): Promise<ImapConnection> {
    if (this.connections.size >= this.maxConnections) {
      // Wait for a connection to be released
      await this.waitForAvailable();
    }
    // Create or reuse connection
    return this.createOrReuse(accountId);
  }

  releaseConnection(accountId: string): void {
    // Return connection to pool or close if idle too long
  }
}
```

---

## 3. Authentication

### 3.1 Authentication Methods

| Method | Security | Support |
|--------|----------|---------|
| **XOAUTH2** | Best | Gmail, Outlook, Yahoo |
| **PLAIN** | Good (over TLS) | Most providers |
| **LOGIN** | Legacy | Deprecated |

### 3.2 OAuth2 Authentication (XOAUTH2)

```typescript
// XOAUTH2 token format
function buildXOAuth2Token(user: string, accessToken: string): string {
  // Format: user={user}\x01auth=Bearer {token}\x01\x01
  const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}

// ImapFlow XOAUTH2 config
const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    accessToken: 'ya29.xxx...',  // OAuth2 access token
  }
});
```

### 3.3 App-Specific Passwords

Many providers (Gmail, Yahoo) require app-specific passwords when 2FA is enabled:
- Gmail: Google Account → Security → App passwords
- Yahoo: Account Security → Generate app password
- Outlook: Usually allows regular password with "modern auth"

### 3.4 Handling Token Expiry

```typescript
async function connectWithTokenRefresh() {
  try {
    await client.connect();
  } catch (error) {
    if (error.message.includes('AUTHENTICATIONFAILED') ||
        error.message.includes('Invalid credentials')) {
      // Token may be expired, refresh it
      const newToken = await refreshOAuthToken();
      client.options.auth.accessToken = newToken;
      await client.connect();
    } else {
      throw error;
    }
  }
}
```

---

## 4. Mailbox (Folder) Operations

### 4.1 List All Mailboxes

```typescript
// IMAP Command: LIST "" "*"
const mailboxes = await client.list();

// Returns tree structure
interface MailboxInfo {
  path: string;           // Full path: 'INBOX' or 'Folder/Subfolder'
  name: string;           // Display name
  delimiter: string;      // Hierarchy separator: '/' or '.'
  flags: Set<string>;     // \Noselect, \HasChildren, etc.
  specialUse?: string;    // \Inbox, \Sent, \Trash, \Drafts, etc.
  listed: boolean;
  subscribed: boolean;
}
```

### 4.2 Special-Use Folders (RFC 6154)

| Attribute | Meaning | Notes |
|-----------|---------|-------|
| `\All` | All messages in user's store | Virtual mailbox, may omit Trash/Junk |
| `\Archive` | Archive messages | Get messages out of Inbox while accessible |
| `\Drafts` | Draft messages | Messages being composed, not yet sent |
| `\Flagged` | Important/flagged messages | Virtual mailbox with `\Flagged` flag |
| `\Junk` | Spam/junk mail | Server may auto-move messages here |
| `\Sent` | Sent message copies | Server may auto-save, or client advice |
| `\Trash` | Deleted messages | Messages marked for deletion |

**Common Folder Name Mappings:**

| Special-Use | Gmail | Outlook | Yahoo | Generic |
|-------------|-------|---------|-------|---------|
| `\Sent` | Sent Mail | Sent Items | Sent | Sent |
| `\Trash` | Trash | Deleted Items | Trash | Trash |
| `\Junk` | Spam | Junk E-mail | Bulk Mail | Junk/Spam |
| `\Drafts` | Drafts | Drafts | Draft | Drafts |
| `\Archive` | All Mail | Archive | Archive | Archive |
| `\All` | All Mail | N/A | N/A | N/A |

### 4.3 Select Mailbox

```typescript
// IMAP Command: SELECT "INBOX"
const mailbox = await client.mailboxOpen('INBOX');

// Returns mailbox status
interface MailboxStatus {
  path: string;
  exists: number;         // Total messages
  recent: number;         // New since last select
  uidNext: number;        // Next UID to be assigned
  uidValidity: number;    // CRITICAL: Mailbox version
  highestModseq?: bigint; // For CONDSTORE
  flags: string[];        // Available flags
  permanentFlags: string[];
}
```

### 4.4 UIDVALIDITY - Critical Concept

**CRITICAL**: When UIDVALIDITY changes, ALL cached UIDs are invalid!

```typescript
interface FolderSyncState {
  path: string;
  uidValidity: number;
  lastSyncedUid: number;
  highestModseq?: bigint;
}

async function syncFolder(state: FolderSyncState) {
  const mailbox = await client.mailboxOpen(state.path);

  // CHECK UIDVALIDITY FIRST!
  if (mailbox.uidValidity !== state.uidValidity) {
    // FULL RESYNC REQUIRED - all local data is invalid
    await fullResync(state.path);
    state.uidValidity = mailbox.uidValidity;
    state.lastSyncedUid = 0;
  }

  // Continue with incremental sync...
}
```

### 4.5 Create/Delete/Rename Mailbox

```typescript
// Create mailbox
await client.mailboxCreate('Custom Folder');
await client.mailboxCreate('Parent/Child');  // Nested folder

// Delete mailbox
await client.mailboxDelete('Custom Folder');

// Rename mailbox
await client.mailboxRename('Old Name', 'New Name');
```

---

## 5. Message Operations

### 5.1 Fetch Messages

```typescript
// Fetch by UID (RECOMMENDED)
const messages = client.fetch('1:*', {
  uid: true,
  envelope: true,
  bodyStructure: true,
  flags: true,
  internalDate: true,
});

// Async iterator for large mailboxes
for await (const message of messages) {
  console.log(message.uid, message.envelope.subject);
}
```

### 5.2 Fetch Options

| Option | Description | Use Case |
|--------|-------------|----------|
| `envelope` | Headers (from, to, subject, date) | List view |
| `flags` | Message flags (\Seen, \Flagged) | Status |
| `internalDate` | Server receive date | Sorting |
| `bodyStructure` | MIME structure (no content) | Attachment list |
| `source` | Full RFC822 content | Full message |
| `bodyParts` | Specific MIME parts | Body/attachments |

### 5.3 Fetch Body Content

```typescript
// Fetch HTML body without marking as read
// CRITICAL: Use BODY.PEEK to avoid setting \Seen flag
const message = await client.fetchOne(uid, {
  uid: true,
  bodyParts: ['TEXT'],  // or specific part like '1.2'
}, { uid: true });

// Or fetch full source
const fullMessage = await client.fetchOne(uid, {
  source: true
}, { uid: true });
```

### 5.4 Search Messages

```typescript
// IMAP SEARCH command
const uids = await client.search({
  seen: false,           // Unread
  since: new Date('2025-01-01'),
  from: 'sender@example.com',
});

// Complex search
const uids = await client.search({
  or: [
    { from: 'alice@example.com' },
    { from: 'bob@example.com' }
  ],
  since: new Date('2025-01-01')
});
```

### 5.5 Search Criteria

| Criteria | Description |
|----------|-------------|
| `all` | All messages |
| `seen` / `unseen` | Read/Unread |
| `flagged` / `unflagged` | Starred/Not starred |
| `since` / `before` / `on` | Date filters |
| `from` / `to` / `subject` | Header search |
| `body` / `text` | Content search |
| `larger` / `smaller` | Size filters |
| `uid` | Specific UIDs |

### 5.6 Modify Flags

```typescript
// Add flags
await client.messageFlagsAdd('1:5', ['\\Seen', '\\Flagged'], { uid: true });

// Remove flags
await client.messageFlagsRemove('1:5', ['\\Flagged'], { uid: true });

// Set flags (replace all)
await client.messageFlagsSet('1:5', ['\\Seen'], { uid: true });
```

### 5.7 Move/Copy Messages

```typescript
// Move (requires MOVE extension, otherwise COPY+DELETE)
await client.messageMove('1:5', 'Archive', { uid: true });

// Copy
await client.messageCopy('1:5', 'Backup', { uid: true });

// Delete (mark as \Deleted)
await client.messageFlagsAdd('1:5', ['\\Deleted'], { uid: true });

// Permanent delete (EXPUNGE)
await client.messageDelete('1:5', { uid: true });
```

### 5.8 Append Message (Save Draft/Sent)

```typescript
// Append message to mailbox
const result = await client.append('Drafts', rawMessage, {
  flags: ['\\Draft'],
  internalDate: new Date()
});

// Returns assigned UID
console.log('Saved with UID:', result.uid);
```

---

## 6. UIDs vs Sequence Numbers

### 6.1 The Critical Difference

| Aspect | UID | Sequence Number |
|--------|-----|-----------------|
| **Persistence** | Permanent (within UIDVALIDITY) | **Changes on any delete!** |
| **Uniqueness** | Unique within mailbox | Position-based (1, 2, 3...) |
| **Usage** | **ALWAYS use for sync** | Never store, never cache |

### 6.2 Why Sequence Numbers Are Dangerous

```
Before delete:
  Seq 1 → UID 100 → "Meeting notes"
  Seq 2 → UID 101 → "Invoice"
  Seq 3 → UID 102 → "Hello"

After deleting UID 101:
  Seq 1 → UID 100 → "Meeting notes"
  Seq 2 → UID 102 → "Hello"  ← SEQUENCE CHANGED!

If you stored "Seq 2 = Invoice", you now have WRONG data!
```

### 6.3 Always Use UID Commands

```typescript
// WRONG - Using sequence numbers
await client.fetch('1:10', { envelope: true });

// CORRECT - Using UIDs
await client.fetch('1:*', { envelope: true }, { uid: true });

// All ImapFlow methods support { uid: true } option
await client.messageFlagsAdd('100:110', ['\\Seen'], { uid: true });
await client.messageMove('105', 'Archive', { uid: true });
await client.messageDelete('107', { uid: true });
```

### 6.4 Storing Message References

```typescript
// CORRECT: Store UID + UIDVALIDITY
interface StoredMessage {
  uid: number;           // The UID
  uidValidity: number;   // MUST store this too!
  mailbox: string;
}

// Validate before using stored UID
async function getMessage(stored: StoredMessage) {
  const mailbox = await client.mailboxOpen(stored.mailbox);

  if (mailbox.uidValidity !== stored.uidValidity) {
    // UID is no longer valid!
    throw new Error('Mailbox UIDVALIDITY changed, need full resync');
  }

  return client.fetchOne(stored.uid, { source: true }, { uid: true });
}
```

---

## 7. CONDSTORE & QRESYNC Extensions

### 7.1 CONDSTORE Overview

CONDSTORE (RFC 7162) provides:
- MODSEQ: Modification sequence number for each message
- Efficient change detection without full mailbox scan

### 7.2 Checking Extension Support

```typescript
// After connect, check capabilities
const capabilities = client.capabilities;

const hasCondstore = capabilities.has('CONDSTORE');
const hasQresync = capabilities.has('QRESYNC');

console.log('CONDSTORE:', hasCondstore);  // Most modern servers
console.log('QRESYNC:', hasQresync);      // Fewer servers
```

### 7.3 Using CONDSTORE for Incremental Sync

```typescript
interface FolderSyncState {
  path: string;
  uidValidity: number;
  highestModseq: bigint;
}

async function incrementalSync(state: FolderSyncState) {
  const mailbox = await client.mailboxOpen(state.path);

  // Check UIDVALIDITY first
  if (mailbox.uidValidity !== state.uidValidity) {
    return fullResync(state);
  }

  // Fetch only messages changed since last sync
  // IMAP: FETCH 1:* (FLAGS) (CHANGEDSINCE {modseq})
  const changed = client.fetch('1:*', {
    uid: true,
    flags: true,
    modseq: true,
  }, {
    uid: true,
    changedSince: state.highestModseq
  });

  let newHighestModseq = state.highestModseq;

  for await (const message of changed) {
    // Process changed message
    await updateLocalMessage(message);

    if (message.modseq > newHighestModseq) {
      newHighestModseq = message.modseq;
    }
  }

  state.highestModseq = newHighestModseq;
}
```

### 7.4 QRESYNC for Expunge Detection

QRESYNC (RFC 7162) additionally provides:
- Information about deleted messages since last sync
- More efficient than detecting deletions manually

```typescript
// QRESYNC SELECT provides deleted UIDs
const mailbox = await client.mailboxOpen('INBOX', {
  qresync: {
    uidValidity: state.uidValidity,
    modseq: state.highestModseq,
    knownUids: '1:*'  // UIDs we know about
  }
});

// mailbox.qresync contains expunged UIDs
if (mailbox.qresync?.expunged) {
  for (const uid of mailbox.qresync.expunged) {
    await deleteLocalMessage(uid);
  }
}
```

---

## 8. IDLE Command (Real-time)

### 8.1 IDLE Overview

IDLE (RFC 2177) allows server to push notifications:
- New message arrival
- Flag changes
- Message expunge

**CRITICAL LIMITATION**: IDLE monitors ONE mailbox at a time!

### 8.2 IDLE Usage

```typescript
// Start IDLE on INBOX
const mailbox = await client.mailboxOpen('INBOX');

client.on('exists', (data) => {
  console.log('New message count:', data.count);
  // Fetch new messages
});

client.on('flags', (data) => {
  console.log('Flags changed for UID:', data.uid);
});

client.on('expunge', (data) => {
  console.log('Message deleted, seq:', data.seq);
});

// IDLE starts automatically when mailbox is open and idle
// ImapFlow handles IDLE internally
```

### 8.3 IDLE Timeout Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| **RFC Timeout** | 29 minutes | Must send NOOP or re-IDLE before |
| **Server Timeout** | Varies | Some servers are stricter |
| **Recommended** | 25-28 minutes | Re-issue IDLE before timeout |

```typescript
// ImapFlow handles IDLE timeouts automatically
// But if implementing manually:
const IDLE_TIMEOUT = 25 * 60 * 1000;  // 25 minutes

let idleTimer: NodeJS.Timer;

function startIdle() {
  client.idle();

  idleTimer = setTimeout(() => {
    client.idleDone();
    startIdle();  // Restart IDLE
  }, IDLE_TIMEOUT);
}
```

### 8.4 Multi-Folder Monitoring Strategy

Since IDLE only monitors one folder:

```typescript
// Strategy 1: Rotate through important folders
const IMPORTANT_FOLDERS = ['INBOX', 'Drafts', 'Sent'];
let currentIndex = 0;

async function rotateIdle() {
  const folder = IMPORTANT_FOLDERS[currentIndex];
  await client.mailboxOpen(folder);

  setTimeout(() => {
    currentIndex = (currentIndex + 1) % IMPORTANT_FOLDERS.length;
    rotateIdle();
  }, 60000);  // Switch every minute
}

// Strategy 2: Multiple connections (one per folder)
// WARNING: Respect connection limits!
const connections = IMPORTANT_FOLDERS.map(folder => {
  const client = new ImapFlow(config);
  client.connect().then(() => client.mailboxOpen(folder));
  return client;
});

// Strategy 3: Primary IDLE on INBOX, poll others less frequently
await client.mailboxOpen('INBOX');  // IDLE here
setInterval(() => pollOtherFolders(), 5 * 60 * 1000);  // Poll every 5 min
```

---

## 9. Bulk Operations

### 9.1 UID Ranges

```typescript
// Single UID
'123'

// Range
'100:200'

// Multiple ranges
'1:10,50:60,100:*'

// All messages
'1:*'

// Last 10 messages (by sequence, be careful!)
// Better to search and get UIDs first
```

### 9.2 Bulk Fetch

```typescript
// Fetch multiple messages efficiently
const messages = client.fetch('1:100', {
  uid: true,
  envelope: true,
  flags: true
}, { uid: true });

// Process as stream (memory efficient)
for await (const msg of messages) {
  await processMessage(msg);
}
```

### 9.3 Bulk Flag Updates

```typescript
// Mark many messages as read
await client.messageFlagsAdd('1:50', ['\\Seen'], { uid: true });

// Star multiple messages
await client.messageFlagsAdd('100,105,110', ['\\Flagged'], { uid: true });

// Bulk unread
await client.messageFlagsRemove('1:*', ['\\Seen'], { uid: true });
```

### 9.4 Bulk Move/Delete

```typescript
// Move range to archive
await client.messageMove('1:100', 'Archive', { uid: true });

// Bulk delete
await client.messageDelete('1:50', { uid: true });
```

### 9.5 Bulk Operation Limits

| Provider | Recommended Batch | Max Batch | Notes |
|----------|-------------------|-----------|-------|
| Gmail | 100 | 1000 | May timeout on large batches |
| Outlook | 100 | 500 | Conservative recommended |
| Yahoo | 50 | 200 | Stricter limits |
| Generic | 50-100 | Varies | Test with provider |

---

## 10. Provider-Specific Quirks

### 10.1 Gmail (imap.gmail.com)

| Quirk | Description | Workaround |
|-------|-------------|------------|
| **Labels = Folders** | Gmail labels appear as IMAP folders | All Mail contains everything |
| **\All Mail** | Contains all messages (excluding Trash/Spam) | Use for full backup |
| **Thread grouping** | Messages grouped by thread | X-GM-THRID header |
| **Requires app password** | With 2FA enabled | Create in Google Account |
| **OAuth recommended** | Basic auth deprecated June 2022 | Use XOAUTH2 |
| **Connection limit** | Not officially documented | Use 2-3 max per account |

```typescript
// Gmail-specific: Search by label
const uids = await client.search({ 'X-GM-LABELS': 'important' });

// Gmail-specific: Get thread ID
const msg = await client.fetchOne(uid, { headers: ['X-GM-THRID'] });
```

### 10.2 Outlook/Hotmail (outlook.office365.com)

| Quirk | Description | Workaround |
|-------|-------------|------------|
| **Connection limit** | Not officially documented | Use 2-3 max per account |
| **Folder paths** | Uses `/` delimiter | Standard |
| **OAuth required** | For most scenarios | Use XOAUTH2 |
| **Junk folder name** | "Junk E-mail" not "Spam" | Check specialUse attribute |

### 10.3 Yahoo (imap.mail.yahoo.com)

| Quirk | Description | Workaround |
|-------|-------------|------------|
| **10 connection limit** | Very strict | Minimal connections |
| **App password required** | Always | Generate in Yahoo settings |
| **Slow SEARCH** | Can be very slow | Limit search scope |
| **Bulk folder name** | "Bulk Mail" for spam | Check specialUse |

### 10.4 iCloud (imap.mail.me.com)

| Quirk | Description | Workaround |
|-------|-------------|------------|
| **App password required** | With 2FA | Apple ID settings |
| **10 connection limit** | Per account | Minimal connections |
| **Folder encoding** | UTF-7 modified | ImapFlow handles |

### 10.5 Generic IMAP

```typescript
// Detect provider capabilities
async function detectProviderFeatures(client: ImapFlow) {
  const caps = client.capabilities;

  return {
    hasIdle: caps.has('IDLE'),
    hasCondstore: caps.has('CONDSTORE'),
    hasQresync: caps.has('QRESYNC'),
    hasMove: caps.has('MOVE'),
    hasCompress: caps.has('COMPRESS=DEFLATE'),
    hasUtf8: caps.has('UTF8=ACCEPT'),
    hasSort: caps.has('SORT'),
    hasThread: caps.has('THREAD'),
  };
}
```

---

## 11. Error Handling

### 11.1 Common IMAP Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `AUTHENTICATIONFAILED` | Bad credentials | Check password/token |
| `NOPERM` | Permission denied | Check folder permissions |
| `TRYCREATE` | Destination doesn't exist | Create folder first |
| `NONEXISTENT` | Folder doesn't exist | Remove from local DB |
| `CANNOT` | Operation not allowed | Check folder type |
| `QUOTA` | Mailbox full | Alert user |
| `ALREADYEXISTS` | Folder already exists | Use existing folder |
| `CONNECTIONFAILED` | Network error | Retry with backoff |

### 11.2 Error Handling Pattern

```typescript
async function safeImapOperation<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error.message || '';

    // Authentication errors
    if (message.includes('AUTHENTICATIONFAILED')) {
      throw new AuthError('Invalid credentials', { needsReauth: true });
    }

    // Folder errors
    if (message.includes('NONEXISTENT')) {
      throw new FolderError('Folder does not exist', { code: 'NOT_FOUND' });
    }

    // Connection errors - retry
    if (message.includes('CONNECTIONFAILED') ||
        message.includes('ETIMEDOUT') ||
        message.includes('ECONNRESET')) {
      throw new ConnectionError('Connection failed', { retryable: true });
    }

    // UIDVALIDITY changed
    if (message.includes('UIDVALIDITY')) {
      throw new SyncError('UIDVALIDITY changed', { needsFullSync: true });
    }

    // Unknown error
    throw new ImapError(`${context}: ${message}`);
  }
}
```

### 11.3 Reconnection Strategy

```typescript
class ImapConnectionManager {
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly baseDelay = 1000;

  async ensureConnected(): Promise<void> {
    while (!this.client.usable) {
      try {
        await this.client.connect();
        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        this.reconnectAttempts++;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          throw new Error('Max reconnection attempts exceeded');
        }

        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
        await sleep(Math.min(delay, 30000));
      }
    }
  }
}
```

---

## 12. Best Practices

### 12.1 Always Use UIDs

```typescript
// ALWAYS pass { uid: true } to all operations
await client.fetch('1:*', options, { uid: true });
await client.messageFlagsAdd(uids, flags, { uid: true });
await client.messageMove(uids, destination, { uid: true });
```

### 12.2 Check UIDVALIDITY on Every Sync

```typescript
async function syncMailbox(folderPath: string, lastUidValidity: number) {
  const mailbox = await client.mailboxOpen(folderPath);

  if (mailbox.uidValidity !== lastUidValidity) {
    // CRITICAL: All cached UIDs are now invalid!
    await deleteAllLocalMessages(folderPath);
    return fullSync(folderPath, mailbox.uidValidity);
  }

  return incrementalSync(folderPath);
}
```

### 12.3 Use BODY.PEEK for Reading

```typescript
// WRONG - Sets \Seen flag
await client.fetchOne(uid, { source: true });

// CORRECT - Doesn't modify flags
// ImapFlow uses BODY.PEEK by default, but be aware of this
// when using raw IMAP commands
```

### 12.4 Handle Disconnections Gracefully

```typescript
client.on('close', async () => {
  console.log('Connection closed');
  // Attempt reconnection
  await reconnect();
});

client.on('error', (error) => {
  console.error('IMAP error:', error);
  // Log and potentially reconnect
});
```

### 12.5 Use Mailbox Locking

```typescript
// ImapFlow provides mailbox locking for safe concurrent access
async function safeOperation(folder: string) {
  const lock = await client.getMailboxLock(folder);

  try {
    // Perform operations
    await client.messageFlagsAdd('1:10', ['\\Seen'], { uid: true });
  } finally {
    // ALWAYS release the lock
    lock.release();
  }
}
```

### 12.6 Batch Operations Appropriately

```typescript
// DON'T: One request per message
for (const uid of uids) {
  await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
}

// DO: Batch into ranges
const uidRange = uids.join(',');  // '1,5,10,15'
await client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true });

// Or use proper ranges for consecutive UIDs
const range = `${Math.min(...uids)}:${Math.max(...uids)}`;
```

### 12.7 Memory-Efficient Large Mailbox Handling

```typescript
// DON'T: Load all messages into memory
const allMessages = [];
for await (const msg of client.fetch('1:*', opts)) {
  allMessages.push(msg);  // Memory explosion!
}

// DO: Process as stream
for await (const msg of client.fetch('1:*', opts)) {
  await processAndSaveToDb(msg);  // Don't accumulate
}

// DO: Paginate with UID ranges
const pageSize = 100;
let startUid = 1;

while (true) {
  const endUid = startUid + pageSize - 1;
  const messages = client.fetch(`${startUid}:${endUid}`, opts, { uid: true });

  let count = 0;
  for await (const msg of messages) {
    await processMessage(msg);
    count++;
  }

  if (count < pageSize) break;
  startUid = endUid + 1;
}
```

---

## 13. ImapFlow Library Reference

### 13.1 Installation

```bash
npm install imapflow
```

### 13.2 Basic Connection

```typescript
import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.example.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@example.com',
    pass: 'password'
  },
  logger: false  // Disable logging in production
});

await client.connect();
```

### 13.3 Key Methods

| Method | Description |
|--------|-------------|
| `connect()` | Establish connection |
| `logout()` | Graceful disconnect |
| `list()` | List all mailboxes |
| `mailboxOpen(path)` | Select mailbox |
| `mailboxClose()` | Deselect mailbox |
| `fetch(range, opts)` | Fetch messages |
| `fetchOne(uid, opts)` | Fetch single message |
| `search(query)` | Search messages |
| `messageFlagsAdd/Remove/Set()` | Modify flags |
| `messageMove()` | Move messages |
| `messageCopy()` | Copy messages |
| `messageDelete()` | Delete messages |
| `append()` | Add message to mailbox |
| `getMailboxLock()` | Get exclusive lock |

### 13.4 Events

| Event | Description |
|-------|-------------|
| `exists` | Message count changed |
| `flags` | Message flags changed |
| `expunge` | Message deleted |
| `close` | Connection closed |
| `error` | Error occurred |

### 13.5 Full Example

```typescript
import { ImapFlow } from 'imapflow';

async function syncInbox() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'user@gmail.com',
      accessToken: 'oauth-token'
    }
  });

  try {
    await client.connect();

    // Get mailbox status
    const mailbox = await client.mailboxOpen('INBOX');
    console.log(`INBOX has ${mailbox.exists} messages`);
    console.log(`UIDVALIDITY: ${mailbox.uidValidity}`);

    // Fetch unread messages
    const unreadUids = await client.search({ seen: false }, { uid: true });
    console.log(`Unread UIDs: ${unreadUids}`);

    // Fetch message details
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch(unreadUids.join(','), {
        uid: true,
        envelope: true,
        flags: true
      }, { uid: true })) {
        console.log(`${msg.uid}: ${msg.envelope.subject}`);
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error('IMAP error:', error);
    throw error;
  }
}
```

---

## Quick Reference Card

### Essential Commands

| Operation | ImapFlow Method |
|-----------|-----------------|
| Connect | `client.connect()` |
| List folders | `client.list()` |
| Select folder | `client.mailboxOpen('INBOX')` |
| Fetch messages | `client.fetch('1:*', opts, { uid: true })` |
| Search | `client.search({ seen: false })` |
| Mark read | `client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })` |
| Move | `client.messageMove(uids, 'Archive', { uid: true })` |
| Delete | `client.messageDelete(uids, { uid: true })` |
| Logout | `client.logout()` |

### Critical Rules

1. **ALWAYS use UIDs, never sequence numbers**
2. **ALWAYS check UIDVALIDITY before sync**
3. **ALWAYS handle disconnections gracefully**
4. **ALWAYS use mailbox locks for concurrent access**
5. **ALWAYS respect connection limits**
6. **ALWAYS use BODY.PEEK to avoid marking read**

### Sync State Requirements

```typescript
interface ImapSyncState {
  uidValidity: number;    // CRITICAL: Must match server
  highestUid: number;     // Last synced UID
  highestModseq?: bigint; // For CONDSTORE (optional)
}
```

---

## References

- [RFC 3501 - IMAP4rev1](https://tools.ietf.org/html/rfc3501)
- [RFC 2177 - IDLE](https://tools.ietf.org/html/rfc2177)
- [RFC 7162 - CONDSTORE/QRESYNC](https://tools.ietf.org/html/rfc7162)
- [RFC 6154 - Special-Use Mailboxes](https://tools.ietf.org/html/rfc6154)
- [RFC 6851 - MOVE Extension](https://tools.ietf.org/html/rfc6851)
- [ImapFlow Documentation](https://imapflow.com/docs/)
- [ImapFlow GitHub](https://github.com/postalsys/imapflow)
