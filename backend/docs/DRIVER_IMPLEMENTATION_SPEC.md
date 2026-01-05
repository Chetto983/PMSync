# Email Driver Implementation Specification

> **Purpose**: Complete, mechanical specification for implementing IEmailDriver across all providers.
> **Date**: 2025-01-05
> **Status**: AUTHORITATIVE - Follow exactly, no guessing
> **Pre-requisites**: Read before writing ANY driver code

---

## Table of Contents

1. [Interface Overview](#1-interface-overview)
2. [Per-Method Specifications](#2-per-method-specifications)
3. [Error Handling Matrix](#3-error-handling-matrix)
4. [Database Field Mapping](#4-database-field-mapping)
5. [Retry Strategy](#5-retry-strategy)
6. [Test Scenarios](#6-test-scenarios)

---

## 1. Interface Overview

### 1.1 IEmailDriver Methods (26 total)

| Category | Method | Required | Returns |
|----------|--------|----------|---------|
| **Lifecycle** | `connect()` | YES | `void` |
| | `disconnect()` | YES | `void` |
| | `isConnected()` | YES | `boolean` |
| | `refreshTokens()` | NO | `DriverCredentials` |
| **Folders** | `listFolders()` | YES | `CanonicalFolder[]` |
| | `getFolder()` | YES | `CanonicalFolder \| null` |
| | `createFolder()` | YES | `CanonicalFolder` |
| | `deleteFolder()` | YES | `void` |
| | `renameFolder()` | YES | `void` |
| **Messages** | `listMessages()` | YES | `ListMessagesResult` |
| | `getMessage()` | YES | `CanonicalMessage \| null` |
| | `getMessageRaw()` | NO | `string` |
| **Mutations** | `sendMessage()` | YES | `string` (messageId) |
| | `saveDraft()` | YES | `string` (draftId) |
| | `sendDraft()` | YES | `void` |
| | `moveMessage()` | YES | `void` |
| | `copyMessage()` | NO | `string` (newId) |
| | `deleteMessage()` | YES | `void` |
| **Flags** | `setReadStatus()` | YES | `void` |
| | `setStarredStatus()` | YES | `void` |
| | `setFlaggedStatus()` | NO | `void` |
| **Labels** | `addLabels()` | NO | `void` |
| | `removeLabels()` | NO | `void` |
| **Attachments** | `getAttachment()` | YES | `AttachmentData` |
| **Sync** | `getInitialSyncToken()` | NO | `string` |
| | `getChangesSince()` | NO | `ChangesResult` |
| | `subscribeToChanges()` | NO | `ProviderSubscription` |
| **Batch** | `batchGetMessages()` | NO | `CanonicalMessage[]` |
| | `batchSetReadStatus()` | NO | `void` |
| | `batchMoveMessages()` | NO | `void` |
| | `batchDeleteMessages()` | NO | `void` |
| **User** | `getUserInfo()` | YES | `{email, name, photo?}` |
| | `getEmailAliases()` | NO | `EmailAlias[]` |

### 1.2 Provider Characteristics

| Aspect | Gmail | Microsoft | IMAP |
|--------|-------|-----------|------|
| **Auth** | OAuth 2.0 | OAuth 2.0 (MSAL) | Basic/App-Password |
| **Folder Model** | Labels (multi-label) | Folders (single parent) | Mailboxes (single parent) |
| **Delta Sync** | historyId (number) | deltaLink (full URL) | CONDSTORE/MODSEQ |
| **Batch Limit** | 100 (50 recommended) | 20 (hard limit) | N/A |
| **ID Stability** | Always stable | **NEEDS ImmutableId** | Stable per UIDVALIDITY |
| **Move Behavior** | Add/remove labels | POST /move (ID changes!) | COPY + DELETE |

### 1.3 Critical Headers

```typescript
// GMAIL - No special headers needed
headers: {
  'Authorization': `Bearer ${accessToken}`,
}

// MICROSOFT - CRITICAL: Must include ImmutableId
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Prefer': 'outlook.body-content-type="html"',
  'Prefer': 'IdType="ImmutableId"',  // ← CRITICAL: IDs change without this!
}

// IMAP - Connection config, not headers
{
  host: 'imap.example.com',
  port: 993,
  secure: true,
  auth: { user, pass }
}
```

---

## 2. Per-Method Specifications

### 2.1 connect(credentials: DriverCredentials)

**Purpose**: Establish connection to email provider

#### Gmail Implementation
```typescript
// API: googleapis library
// Steps:
1. Create OAuth2 client with credentials
2. Set credentials on client
3. Test connection with gmail.users.getProfile({ userId: 'me' })
4. Cache user email for later use
5. Set connected = true

// Errors:
- 401 → throw AuthError('Token expired or invalid')
- 403 → throw AuthError('Insufficient permissions')
- Network error → throw ConnectionError('Cannot reach Gmail API')
```

#### Microsoft Implementation
```typescript
// API: axios with Graph API base URL
// Steps:
1. Create axios instance with headers (INCLUDE ImmutableId!)
2. Set 30s timeout
3. If emailHint provided, use it; else call GET /me
4. Cache folder IDs via listFolders()
5. Set connected = true

// CRITICAL HEADER:
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Prefer': 'IdType="ImmutableId"',  // ← MUST INCLUDE
  'Prefer': 'outlook.body-content-type="html"',
}

// Errors:
- 401 → throw AuthError('Token expired')
- 403 → User.Read scope missing, continue with emailHint
- Network error → throw ConnectionError
```

#### IMAP Implementation
```typescript
// API: ImapFlow library
// Steps:
1. Create ImapFlow client with connection config
2. Call client.connect()
3. Detect capabilities (CONDSTORE, QRESYNC, IDLE, SPECIAL-USE)
4. Initialize connection pool (max 3 connections)
5. Set connected = true

// Errors:
- AUTHENTICATIONFAILED → throw AuthError('Invalid credentials')
- ECONNREFUSED → throw ConnectionError('Cannot reach IMAP server')
- ETIMEDOUT → throw ConnectionError('Connection timeout')
```

#### DB Mapping: None (connection state only)

---

### 2.2 listFolders(): Promise<CanonicalFolder[]>

**Purpose**: Get all folders/mailboxes from provider

#### Gmail Implementation
```typescript
// API: gmail.users.labels.list({ userId: 'me' })
// Returns: { labels: [...] }

// Mapping per label:
{
  id: label.id,                    // e.g., 'INBOX', 'Label_123'
  externalId: label.id,
  name: label.name,                // Display name
  type: GMAIL_TO_CANONICAL[label.id] || label.name,
  path: label.name,
  unreadCount: label.messagesUnread || 0,
  totalCount: label.messagesTotal || 0,
  attributes: {
    selectable: label.type !== 'system' || isCoreSysLabel(label.id),
    hasChildren: false,            // Gmail labels are flat
    subscribed: true,
  }
}

// Filter out: CATEGORY_* labels (except map to type)
// Special handling: 'DRAFT' → 'DRAFTS' in canonical
```

#### Microsoft Implementation
```typescript
// API: GET /me/mailFolders?$top=100
// MUST: Handle pagination with @odata.nextLink
// MUST: Recursively fetch childFolders

// For each folder:
{
  id: folder.id,
  externalId: folder.id,
  name: folder.displayName,
  type: MICROSOFT_WELLKNOWN_TO_CANONICAL[folder.wellKnownName] || folder.displayName,
  path: buildPath(folder),         // Include parent path for nested
  parentId: folder.parentFolderId,
  unreadCount: folder.unreadItemCount || 0,
  totalCount: folder.totalItemCount || 0,
  attributes: {
    selectable: true,
    hasChildren: folder.childFolderCount > 0,
    subscribed: true,
  }
}

// Recursive child fetch:
if (folder.childFolderCount > 0) {
  GET /me/mailFolders/{id}/childFolders
}
```

#### IMAP Implementation
```typescript
// API: client.list() or client.listTree()
// Returns: Array of mailbox objects

// For each mailbox:
{
  id: mailbox.path,                // Use path as ID
  externalId: mailbox.path,
  name: mailbox.name,
  type: detectType(mailbox),       // Check specialUse first, then heuristics
  path: mailbox.path,
  parentId: mailbox.parent?.path,
  unreadCount: 0,                  // Need STATUS command for counts
  totalCount: 0,
  attributes: {
    selectable: !mailbox.flags.includes('\\Noselect'),
    hasChildren: mailbox.flags.includes('\\HasChildren'),
    subscribed: mailbox.subscribed,
  }
}

// Type detection order:
1. Check mailbox.specialUse (RFC 6154 flags)
2. Check IMAP_SPECIAL_USE_TO_CANONICAL mapping
3. Fall back to IMAP_NAME_HEURISTICS (folder name matching)
```

#### DB Mapping: `Folder` table

| CanonicalFolder | Prisma Folder |
|-----------------|---------------|
| id | id (generate new) |
| externalId | externalId |
| name | name |
| type | specialUse |
| path | path |
| parentId | parentId (lookup) |
| unreadCount | unreadCount |
| totalCount | totalCount |
| attributes.selectable | isSelectable |
| attributes.hasChildren | (check children relation) |

---

### 2.3 listMessages(options: ListMessagesOptions)

**Purpose**: Get messages from a folder with pagination

#### Gmail Implementation
```typescript
// API: gmail.users.messages.list + gmail.users.messages.get (batch)

// Step 1: List message IDs
const listResponse = await gmail.users.messages.list({
  userId: 'me',
  labelIds: [resolveLabelId(options.folder)],
  maxResults: options.pageSize || 50,
  pageToken: options.pageToken,
  q: buildQuery(options),  // 'is:unread', 'after:2025/01/01'
});

// Step 2: Batch get full messages (BATCH_SIZE = 50)
const messages = await batchGetMessages(listResponse.messages.map(m => m.id));

// Return:
{
  messages: messages.map(toCanonicalMessage),
  nextPageToken: listResponse.nextPageToken,
  hasMore: !!listResponse.nextPageToken,
  totalEstimate: listResponse.resultSizeEstimate,
}
```

#### Microsoft Implementation
```typescript
// API: GET /me/mailFolders/{folderId}/messages

const params = {
  $top: options.pageSize || 50,
  $select: 'id,conversationId,subject,body,bodyPreview,from,toRecipients,...',
  $orderby: 'receivedDateTime desc',
  $filter: buildFilter(options),  // 'isRead eq false'
};

if (options.query) {
  params.$search = `"${options.query}"`;
}

// Handle pagination via @odata.nextLink (full URL)
if (options.pageToken) {
  response = await client.get(options.pageToken, { baseURL: '' });
} else {
  response = await client.get(`/me/mailFolders/${folderId}/messages`, { params });
}

// Return:
{
  messages: response.data.value.map(toCanonicalMessage),
  nextPageToken: response.data['@odata.nextLink'],
  hasMore: !!response.data['@odata.nextLink'],
  totalEstimate: response.data['@odata.count'],
}
```

#### IMAP Implementation
```typescript
// API: ImapFlow fetch with BODYSTRUCTURE

// Step 1: Select mailbox
await client.mailboxOpen(options.folder);

// Step 2: Build search criteria
const searchCriteria = buildSearchCriteria(options);
// e.g., { seen: false, since: options.since }

// Step 3: Search for UIDs
const uids = await client.search(searchCriteria, { uid: true });

// Step 4: Paginate UIDs
const pageUids = paginateUids(uids, options.pageSize, options.pageToken);

// Step 5: Fetch messages
const messages = [];
for await (const msg of client.fetch(pageUids, {
  uid: true,
  envelope: true,
  bodyStructure: true,
  flags: true,
  source: options.includeBody,  // Full RFC 822 if needed
})) {
  messages.push(toCanonicalMessage(msg, options.folder));
}

// Return with cursor-based pagination:
{
  messages,
  nextPageToken: encodePageToken(lastUid, options.folder),
  hasMore: hasMoreUids,
}
```

#### DB Mapping: `Email` table

| CanonicalMessage | Prisma Email |
|------------------|--------------|
| id | id (generate new) |
| externalId | externalId |
| threadId | threadId |
| folder | folder |
| from | from (JSON string) |
| to | to (string[]) |
| cc | cc (string[]) |
| subject | subject |
| bodyText | bodyText |
| bodyHtml | bodyHtml |
| snippet | snippet |
| receivedAt | receivedAt |
| sentAt | sentAt |
| isRead | isRead |
| isStarred | isStarred |
| isFlagged | isFlagged |
| isDraft | isDraft |
| isDeleted | isDeleted |
| labels | labels (string[]) |
| hasAttachments | (check attachments.length) |

---

### 2.4 getMessage(messageId: string, options?: GetMessageOptions)

**Purpose**: Get single message by ID

#### Gmail Implementation
```typescript
// API: gmail.users.messages.get
const response = await gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: options?.format === 'minimal' ? 'minimal' : 'full',
});

// Parse headers from payload.headers array
// Decode body from payload.parts (handle multipart)

return toCanonicalMessage(response.data);
```

#### Microsoft Implementation
```typescript
// API: GET /me/messages/{messageId}
const $select = options?.format === 'minimal'
  ? 'id,subject,from,receivedDateTime,isRead'
  : 'id,conversationId,subject,body,...';

const $expand = options?.includeAttachments ? 'attachments' : undefined;

const response = await client.get(`/me/messages/${messageId}`, {
  params: { $select, $expand }
});

return toCanonicalMessage(response.data);
```

#### IMAP Implementation
```typescript
// messageId format: "folder:uid" (e.g., "INBOX:12345")
const [folder, uid] = parseMessageId(messageId);

await client.mailboxOpen(folder);

const fetchOptions = {
  uid: true,
  envelope: true,
  bodyStructure: true,
  flags: true,
  source: options?.includeBody,
};

for await (const msg of client.fetch([uid], fetchOptions)) {
  return toCanonicalMessage(msg, folder);
}

return null;
```

---

### 2.5 sendMessage(message: ComposeMessage)

**Purpose**: Send new email

#### Gmail Implementation
```typescript
// API: gmail.users.messages.send

// Step 1: Build RFC 822 message
const rawMessage = buildRfc822Message(message);

// Step 2: Base64url encode
const encodedMessage = Buffer.from(rawMessage)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

// Step 3: Send
const response = await gmail.users.messages.send({
  userId: 'me',
  requestBody: {
    raw: encodedMessage,
    threadId: message.threadId,  // For replies
  }
});

return response.data.id;
```

#### Microsoft Implementation
```typescript
// API: Create draft then send (to get message ID)

// Step 1: Create draft
const graphMessage = composeToGraphMessage(message);
const draftResponse = await client.post('/me/messages', graphMessage);
const messageId = draftResponse.data.id;

// Step 2: Send the draft
await client.post(`/me/messages/${messageId}/send`);

return messageId;

// NOTE: Direct POST /me/sendMail returns 202 with no body!
```

#### IMAP Implementation
```typescript
// API: SMTP via nodemailer (not IMAP!)

// Step 1: Build message with nodemailer
const mailOptions = {
  from: message.fromEmail || credentials.username,
  to: message.to.map(formatAddress),
  cc: message.cc?.map(formatAddress),
  bcc: message.bcc?.map(formatAddress),
  subject: message.subject,
  html: message.bodyHtml,
  text: message.bodyText,
  attachments: message.attachments?.map(toNodemailerAttachment),
  inReplyTo: message.inReplyTo,
  references: message.references,
};

// Step 2: Send via SMTP
const result = await transporter.sendMail(mailOptions);

// Step 3: Append to Sent folder (IMAP)
await client.append('SENT', rawMessage, ['\\Seen']);

return result.messageId;
```

---

### 2.6 getChangesSince(syncToken: string): Promise<ChangesResult>

**Purpose**: Delta sync - get changes since last sync

#### Gmail Implementation
```typescript
// API: gmail.users.history.list
// syncToken = historyId (BigInt as string)

const response = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: syncToken,
  historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
});

// Parse history records
const changes: ProviderChange[] = [];
for (const record of response.data.history || []) {
  if (record.messagesAdded) {
    changes.push(...record.messagesAdded.map(m => ({
      type: 'added',
      messageId: m.message.id,
      timestamp: new Date(),
    })));
  }
  if (record.messagesDeleted) {
    changes.push(...record.messagesDeleted.map(m => ({
      type: 'deleted',
      messageId: m.message.id,
      timestamp: new Date(),
    })));
  }
  // labelsAdded/Removed → type: 'modified'
}

return {
  changes,
  newSyncToken: response.data.historyId,
  hasMore: !!response.data.nextPageToken,
};

// ERROR 404: historyId expired → return empty, caller must full sync
```

#### Microsoft Implementation
```typescript
// API: GET {deltaLink} (FULL URL, not path!)
// syncToken = full deltaLink URL

// VALIDATION: Must be full URL with graph.microsoft.com
if (!syncToken.includes('graph.microsoft.com') || !syncToken.includes('delta')) {
  // Invalid format - get new token
  const newToken = await getInitialSyncToken();
  return { changes: [], newSyncToken: newToken, hasMore: false };
}

// Use absolute URL
const response = await client.get(syncToken, { baseURL: '' });

const changes: ProviderChange[] = [];
for (const item of response.data.value || []) {
  if (item['@removed']) {
    changes.push({ type: 'deleted', messageId: item.id, timestamp: new Date() });
  } else {
    changes.push({ type: 'modified', messageId: item.id, timestamp: new Date() });
  }
}

return {
  changes,
  newSyncToken: response.data['@odata.deltaLink'] || response.data['@odata.nextLink'],
  hasMore: !!response.data['@odata.nextLink'],
};

// ERROR 410 or 400: Delta token expired → return empty, get new token
```

#### IMAP Implementation
```typescript
// API: CONDSTORE extension with MODSEQ
// syncToken format: "folder1:modseq1,folder2:modseq2,..."

const folderStates = parseSyncToken(syncToken);
const changes: ProviderChange[] = [];

for (const [folder, modseq] of folderStates) {
  await client.mailboxOpen(folder);

  // Check UIDVALIDITY - if changed, full sync required
  if (client.mailbox.uidValidity !== storedUidValidity) {
    throw new Error('UIDVALIDITY_CHANGED');
  }

  // Fetch messages modified since MODSEQ
  if (client.mailbox.highestModseq && modseq) {
    const changed = await client.search({ modseq: BigInt(modseq) + 1n }, { uid: true });
    changes.push(...changed.map(uid => ({
      type: 'modified',
      messageId: `${folder}:${uid}`,
      timestamp: new Date(),
    })));
  }
}

return {
  changes,
  newSyncToken: buildSyncToken(folderStates),
  hasMore: false,
};
```

---

### 2.7 Batch Operations

#### batchGetMessages (Gmail)
```typescript
// RECOMMENDED: Use actual Gmail batch API
// Current implementation uses Promise.all which is slower

// Correct implementation:
const boundary = 'batch_gmail_api';
const batchBody = messageIds.map((id, i) => `
--${boundary}
Content-Type: application/http
Content-ID: <${i}>

GET /gmail/v1/users/me/messages/${id}?format=full

`).join('') + `--${boundary}--`;

const response = await fetch('https://www.googleapis.com/batch/gmail/v1', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': `multipart/mixed; boundary=${boundary}`,
  },
  body: batchBody,
});

// Parse multipart response
// BATCH_SIZE = 50 (recommended), MAX = 100
```

#### batchGetMessages (Microsoft)
```typescript
// API: POST /$batch
const BATCH_SIZE = 20;  // HARD LIMIT - DO NOT EXCEED

for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
  const batch = messageIds.slice(i, i + BATCH_SIZE);

  const requests = batch.map((id, index) => ({
    id: String(index),
    method: 'GET',
    url: `/me/messages/${id}`,
  }));

  const response = await client.post('/$batch', { requests });

  for (const res of response.data.responses) {
    if (res.status === 200) {
      messages.push(toCanonicalMessage(res.body));
    }
  }
}
```

#### batchGetMessages (IMAP)
```typescript
// IMAP natively supports fetching multiple UIDs
const uids = messageIds.map(parseUid);

for await (const msg of client.fetch(uids, fetchOptions)) {
  messages.push(toCanonicalMessage(msg));
}

// No special batching needed - IMAP handles internally
```

---

## 3. Error Handling Matrix

### 3.1 Error Categories

| Category | Description | Action |
|----------|-------------|--------|
| **AUTH** | Token expired/invalid | Refresh token or re-authenticate |
| **RATE_LIMIT** | Too many requests | Retry with backoff |
| **NOT_FOUND** | Resource doesn't exist | Return null or empty |
| **PERMISSION** | Insufficient scope | Re-authenticate with correct scopes |
| **CONFLICT** | Concurrent modification | Retry with fresh data |
| **SERVER** | Provider 5xx error | Retry with backoff |
| **NETWORK** | Connection failed | Retry, then fail |

### 3.2 Gmail Error Codes

| HTTP | Error | Category | Action |
|------|-------|----------|--------|
| 400 | Invalid request | VALIDATION | Fix request, don't retry |
| 401 | Unauthorized | AUTH | Refresh token |
| 403 | Forbidden | PERMISSION | Re-authenticate |
| 404 | Not found | NOT_FOUND | Return null |
| 404 | historyId expired | SYNC_EXPIRED | Full sync required |
| 429 | Rate limited | RATE_LIMIT | Retry with Retry-After |
| 500 | Server error | SERVER | Retry 3x with backoff |
| 503 | Service unavailable | SERVER | Retry 3x with backoff |

### 3.3 Microsoft Error Codes

| HTTP | Error Code | Category | Action |
|------|------------|----------|--------|
| 400 | BadRequest | VALIDATION | Check request format |
| 400 | syncStateNotFound | SYNC_EXPIRED | Get new deltaLink |
| 401 | InvalidAuthenticationToken | AUTH | Refresh token |
| 403 | AccessDenied | PERMISSION | Check scopes |
| 404 | ResourceNotFound | NOT_FOUND | Return null |
| 410 | Gone (delta) | SYNC_EXPIRED | Get new deltaLink |
| 429 | TooManyRequests | RATE_LIMIT | Use Retry-After header |
| 500+ | ServerError | SERVER | Retry 3x with backoff |

### 3.4 IMAP Error Codes

| Error | Category | Action |
|-------|----------|--------|
| AUTHENTICATIONFAILED | AUTH | Re-authenticate |
| NONEXISTENT | NOT_FOUND | Return null |
| NOPERM | PERMISSION | Check account access |
| UIDVALIDITY mismatch | SYNC_EXPIRED | Full folder sync required |
| ECONNREFUSED | NETWORK | Retry connection |
| ETIMEDOUT | NETWORK | Retry with longer timeout |
| BYE (connection closed) | NETWORK | Reconnect from pool |

### 3.5 Error Detection Functions

```typescript
// common/utils/error-utils.ts

export function isAuthError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 401;
  }
  if (error instanceof Error) {
    return error.message.includes('AUTHENTICATIONFAILED') ||
           error.message.includes('invalid_grant');
  }
  return false;
}

export function isRateLimitError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 429;
  }
  return false;
}

export function isNotFoundError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 404;
  }
  if (error instanceof Error) {
    return error.message.includes('NONEXISTENT');
  }
  return false;
}

export function isSyncExpiredError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    return status === 410 ||
           code === 'syncStateNotFound' ||
           (status === 404 && /* Gmail history expired */);
  }
  return false;
}

export function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    return error.message.includes('ETIMEDOUT') ||
           error.message.includes('ECONNRESET');
  }
  return false;
}
```

---

## 4. Database Field Mapping

### 4.1 CanonicalMessage → Email (Prisma)

```typescript
// Mapping function: mapToEmailCreate(msg: CanonicalMessage, providerId: string)

{
  // Required fields
  tenantId: tenantId,              // From context
  providerId: providerId,           // Provider reference
  externalId: msg.externalId,       // Provider's message ID

  // Threading
  threadId: msg.threadId || null,
  messageId: msg.messageId || null, // RFC 2822 Message-ID header
  inReplyTo: msg.inReplyTo || null,
  references: msg.references || null,

  // Addresses (serialize EmailAddress to string)
  from: serializeAddress(msg.from), // "Name <email@example.com>"
  to: msg.to.map(serializeAddress),
  cc: msg.cc?.map(serializeAddress) || [],
  bcc: msg.bcc?.map(serializeAddress) || [],
  replyTo: msg.replyTo ? serializeAddress(msg.replyTo) : null,

  // Content
  subject: msg.subject,
  bodyText: msg.bodyText || null,
  bodyHtml: msg.bodyHtml || null,
  snippet: msg.snippet || msg.bodyText?.substring(0, 200) || '',

  // Folder
  folder: msg.folder,               // Canonical type: 'INBOX', 'SENT', etc.

  // Flags
  isRead: msg.isRead,
  isStarred: msg.isStarred,
  isFlagged: msg.isFlagged,
  isDraft: msg.isDraft,
  isDeleted: msg.isDeleted,
  isArchived: msg.folder === 'ARCHIVE',

  // Labels
  labels: msg.labels || [],

  // Timestamps
  sentAt: msg.sentAt || msg.receivedAt,
  receivedAt: msg.receivedAt,

  // Metadata
  metadata: msg.providerMetadata || null,
}
```

### 4.2 CanonicalFolder → Folder (Prisma)

```typescript
// Mapping function: mapToFolderCreate(folder: CanonicalFolder, providerId: string)

{
  tenantId: tenantId,
  providerId: providerId,
  externalId: folder.externalId || folder.id,

  name: folder.name,                // Display name
  path: folder.path,                // Full path for hierarchy
  specialUse: folder.type,          // 'INBOX', 'SENT', etc.

  // Hierarchy
  parentId: folder.parentId ? lookupParentId(folder.parentId) : null,
  level: folder.path.split('/').length - 1,
  delimiter: '/',

  // Counts
  totalCount: folder.totalCount,
  unreadCount: folder.unreadCount,

  // Flags
  isSelectable: folder.attributes.selectable,
  isSystem: isSystemFolder(folder.type), // Use CORE_SYSTEM_FOLDERS
  attributes: buildAttributes(folder),
}
```

### 4.3 Attachment Mapping

```typescript
// CanonicalMessage.attachments → EmailAttachment

for (const att of msg.attachments) {
  {
    emailId: emailId,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    contentId: att.contentId || null,
    isInline: att.isInline,
    // Storage handled separately
    storageType: 'local',
    storagePath: null,
  }
}
```

---

## 5. Retry Strategy

### 5.1 Retry Configuration

```typescript
// common/services/retry.service.ts

interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
};
```

### 5.2 Per-Operation Retry Rules

| Operation | Max Retries | Initial Delay | Notes |
|-----------|-------------|---------------|-------|
| **connect** | 3 | 1000ms | Network only |
| **listFolders** | 3 | 100ms | Standard |
| **listMessages** | 3 | 100ms | Standard |
| **getMessage** | 3 | 100ms | Standard |
| **sendMessage** | 1 | 0 | **NO RETRY** - risk of duplicates |
| **saveDraft** | 3 | 100ms | Idempotent |
| **moveMessage** | 2 | 100ms | Idempotent (Microsoft: ID changes) |
| **deleteMessage** | 2 | 100ms | Idempotent |
| **setReadStatus** | 3 | 100ms | Idempotent |
| **getChangesSince** | 3 | 100ms | Standard |
| **batchGetMessages** | 2 | 200ms | Per-batch |

### 5.3 Rate Limit Handling

```typescript
// Use Retry-After header when available
if (error.response?.status === 429) {
  const retryAfter = error.response.headers['retry-after'];
  const delayMs = retryAfter
    ? parseInt(retryAfter) * 1000
    : calculateExponentialBackoff(attempt);

  await sleep(delayMs);
  return retry();
}
```

### 5.4 Prisma Retry (P2002/P2034)

```typescript
// common/services/prisma-retry.service.ts

const PRISMA_RETRY_CONFIG = {
  maxAttempts: 3,
  retryableCodes: ['P2002', 'P2034'], // Unique constraint + Deadlock
  initialDelayMs: 50,
  maxDelayMs: 2000,
};

async function withPrismaRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= PRISMA_RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (PRISMA_RETRY_CONFIG.retryableCodes.includes(error.code)) {
          if (attempt < PRISMA_RETRY_CONFIG.maxAttempts) {
            const delay = Math.min(
              PRISMA_RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
              PRISMA_RETRY_CONFIG.maxDelayMs
            );
            await sleep(delay);
            continue;
          }
        }
      }
      throw error;
    }
  }
}
```

---

## 6. Test Scenarios

### 6.1 Per-Method Test Checklist

#### connect()
- [ ] Valid OAuth token connects successfully
- [ ] Expired token throws AuthError
- [ ] Invalid token throws AuthError
- [ ] Network timeout throws ConnectionError
- [ ] Sets isConnected() = true on success

#### listFolders()
- [ ] Returns all folders including nested
- [ ] System folders have correct specialUse
- [ ] Folder counts are populated (if supported)
- [ ] Empty account returns at least INBOX

#### listMessages()
- [ ] Returns messages with all required fields
- [ ] Pagination works (pageToken)
- [ ] onlyUnread filter works
- [ ] since/before date filters work
- [ ] Empty folder returns { messages: [], hasMore: false }

#### getMessage()
- [ ] Returns full message with body
- [ ] format='minimal' returns only headers
- [ ] Non-existent ID returns null
- [ ] Attachments included when requested

#### sendMessage()
- [ ] Sends and returns message ID
- [ ] Attachments are delivered
- [ ] Reply threading works (inReplyTo/references)
- [ ] HTML body is preserved

#### getChangesSince()
- [ ] Returns changes since syncToken
- [ ] Expired token returns empty + new token
- [ ] Handles pagination (hasMore)

#### batchGetMessages()
- [ ] Respects batch size limit (Gmail: 50, Microsoft: 20)
- [ ] Handles partial failures gracefully
- [ ] Returns all messages in order

### 6.2 Error Scenario Tests

- [ ] 401 triggers token refresh
- [ ] 429 retries with backoff
- [ ] 404 returns null (not throws)
- [ ] 500 retries 3x then throws
- [ ] Network timeout retries then throws
- [ ] Delta token expired returns empty + new token

### 6.3 Prisma Integration Tests

- [ ] P2002 (unique constraint) retries and succeeds
- [ ] P2034 (deadlock) retries and succeeds
- [ ] Concurrent folder sync doesn't duplicate
- [ ] Concurrent message upsert doesn't fail

### 6.4 Provider-Specific Tests

#### Gmail
- [ ] Labels mapped to folders correctly
- [ ] CATEGORY_PERSONAL → INBOX (not separate folder)
- [ ] historyId parsed as BigInt
- [ ] Batch API used for multiple messages

#### Microsoft
- [ ] ImmutableId header included (CHECK REQUEST HEADERS!)
- [ ] deltaLink stored as full URL
- [ ] Nested folders fetched recursively
- [ ] wellKnownName mapped correctly

#### IMAP
- [ ] CONDSTORE/MODSEQ used when available
- [ ] UIDVALIDITY change detected
- [ ] Connection pool reused
- [ ] IDLE mode works for real-time

---

## Appendix A: Canonical Type Mappings

See `canonical.types.ts` for complete mappings:
- `GMAIL_TO_CANONICAL`
- `MICROSOFT_WELLKNOWN_TO_CANONICAL`
- `IMAP_SPECIAL_USE_TO_CANONICAL`
- `IMAP_NAME_HEURISTICS`

## Appendix B: Quick Reference

### Gmail Batch Size
- **Recommended**: 50
- **Maximum**: 100

### Microsoft Batch Size
- **Maximum**: 20 (HARD LIMIT)

### IMAP Connection Pool
- **Recommended**: 3 connections
- **IDLE timeout**: 29 minutes

### Sync Token Formats
- **Gmail**: historyId (BigInt string), e.g., `"12345678901234"`
- **Microsoft**: Full deltaLink URL, e.g., `"https://graph.microsoft.com/v1.0/me/..."`
- **IMAP**: Multi-folder format, e.g., `"INBOX:12345,SENT:67890"`
