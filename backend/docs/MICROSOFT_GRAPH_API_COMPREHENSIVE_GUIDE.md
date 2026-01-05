# Microsoft Graph API - Comprehensive Reference Guide

> **Purpose**: Complete reference for implementing Microsoft Graph Mail API in MailAgent.
> **Date**: 2025-01-04
> **Status**: Production Reference - DO NOT modify without consensus

---

## Table of Contents

1. [Authentication & OAuth 2.0](#1-authentication--oauth-20)
2. [Delta Sync (Incremental Changes)](#2-delta-sync-incremental-changes)
3. [Folder Operations](#3-folder-operations)
4. [Message Operations](#4-message-operations)
5. [Batch Requests](#5-batch-requests)
6. [Attachments](#6-attachments)
7. [Rate Limits & Throttling](#7-rate-limits--throttling)
8. [Error Handling](#8-error-handling)
9. [Best Practices](#9-best-practices)
10. [Known Quirks & Gotchas](#10-known-quirks--gotchas)

---

## 1. Authentication & OAuth 2.0

### 1.1 OAuth Flow

Microsoft uses **Azure AD (Entra ID)** for authentication with MSAL library.

```
Authorization URL: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
Token URL: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
```

### 1.2 Required Scopes

| Scope | Purpose |
|-------|---------|

| `Mail.Read` | Read user mail |
| `Mail.ReadWrite` | Read and write user mail |
| `Mail.Send` | Send mail as user |
| `MailboxSettings.Read` | Read mailbox settings |
| `offline_access` | **CRITICAL**: Required for refresh tokens |
| `User.Read` | Read user profile |

### 1.3 Tenant Types

| Tenant | Value | Use Case |
|--------|-------|----------|

| Common | `common` | Personal + Work accounts |
| Organizations | `organizations` | Work/School only |
| Consumers | `consumers` | Personal only |
| Specific | `{tenant-id}` | Single organization |

### 1.4 Token Refresh

```typescript
// CRITICAL: Microsoft tokens expire in 1 hour (3600 seconds)
// Always check expiry before API calls

interface TokenResponse {
  access_token: string;
  refresh_token: string;  // Only with offline_access scope
  expires_in: number;     // Usually 3600 (1 hour)
  token_type: 'Bearer';
}

// Refresh endpoint
POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id={client_id}
&refresh_token={refresh_token}
&scope=Mail.ReadWrite Mail.Send offline_access
```

### 1.5 PKCE Support (Recommended for Public Clients)

```typescript
// Generate code_verifier (43-128 chars)
const codeVerifier = crypto.randomBytes(32).toString('base64url');

// Generate code_challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Authorization request includes:
// code_challenge={codeChallenge}
// code_challenge_method=S256
```

---

## 2. Delta Sync (Incremental Changes)

### 2.1 Delta Query Concept

**CRITICAL**: Microsoft uses **deltaLink URLs**, NOT timestamps or tokens.

```
Initial Request → @odata.nextLink (pagination) → @odata.deltaLink (sync token)
```

### 2.2 Initial Delta Request

```http
GET https://graph.microsoft.com/v1.0/me/mailFolders/{folder-id}/messages/delta
Prefer: odata.maxpagesize=50
Prefer: IdType="ImmutableId"
```

### 2.3 Response Structure

```json
{
  "value": [
    {
      "id": "AAMkAGI2...",
      "subject": "Hello",
      "receivedDateTime": "2025-01-04T10:00:00Z",
      "@removed": { "reason": "deleted" }  // Only for deletions
    }
  ],
  "@odata.nextLink": "...&$skiptoken=...",  // More pages exist
  "@odata.deltaLink": "...&$deltatoken=..."  // Sync complete, save this!
}
```

### 2.4 Subsequent Delta Requests

```http
GET {saved_deltaLink}
Prefer: odata.maxpagesize=50
Prefer: IdType="ImmutableId"
```

### 2.5 Delta Token Expiration (Official Behavior)

**From Microsoft Docs:** Token validity varies by resource type:

| Resource Type | Validity Period |
|---------------|-----------------|
| Directory Objects | 7 days |
| **Outlook Entities (mail, events, contacts)** | **No fixed limit** - depends on internal cache |

**Outlook mail tokens** are invalidated when the internal delta token cache is full (oldest tokens deleted first), NOT after a fixed time period.

### Error Detection

| Error | Meaning | Resolution |
|-------|---------|------------|
| **410 Gone** | Token expired or tenant migrated | Full resync |
| **40X + `syncStateNotFound`** | Token no longer valid | Full resync |
| **404 Not Found** | Resource deleted | Remove from DB |

**From Microsoft Docs:** "When a token expires, the service responds with a 40X-series error with error codes such as `syncStateNotFound`."

### 2.6 Detecting Deletions

Deletions are indicated by `@removed` property:

```json
{
  "id": "AAMkAGI2...",
  "@removed": {
    "reason": "deleted"  // or "changed" for soft-delete
  }
}
```

### 2.7 Folder-Level Delta

Each folder requires its own delta tracking:

```typescript
interface FolderSyncState {
  folderId: string;
  deltaLink: string | null;  // The full URL, NOT just a token
  lastSyncedAt: Date;
}

// WRONG: Storing just the token
const syncToken = 'abc123';  // DON'T DO THIS

// CORRECT: Store the full deltaLink URL
const deltaLink = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc123';
```

---

## 3. Folder Operations

### 3.1 Well-Known Folder Names

Microsoft provides well-known folder names that work **regardless of user locale**:

| Well-Known Name | Description |
|-----------------|-------------|
| `inbox` | Inbox folder |
| `drafts` | Unsent messages |
| `sentitems` | Sent items folder |
| `deleteditems` | Deleted Items (Trash) |
| `junkemail` | Junk Email (Spam) |
| `archive` | Archive folder (One-Click Archive, not Archive Mailbox) |
| `outbox` | Outbox folder |
| `clutter` | Low-priority messages (Clutter feature) |
| `scheduled` | Messages scheduled to reappear |
| `conversationhistory` | Skype IM conversations |
| `msgfolderroot` | Top of Information Store (parent for mail folders) |
| `searchfolders` | Parent folder for search folders |
| `recoverableitemsdeletions` | Soft-deleted items (not visible in UI) |
| `syncissues` | Synchronization logs |
| `conflicts` | Conflicting items |
| `localfailures` | Items that couldn't upload to server |
| `serverfailures` | Items that couldn't sync to client |

```http
GET https://graph.microsoft.com/v1.0/me/mailFolders/inbox
GET https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages
```

### 3.2 List All Folders

```http
GET https://graph.microsoft.com/v1.0/me/mailFolders
  ?$top=100
  &$select=id,displayName,parentFolderId,childFolderCount,totalItemCount,unreadItemCount
```

### 3.3 Nested Folders

```http
GET https://graph.microsoft.com/v1.0/me/mailFolders/{parent-id}/childFolders
```

### 3.4 Create Folder

```http
POST https://graph.microsoft.com/v1.0/me/mailFolders
Content-Type: application/json

{
  "displayName": "My Custom Folder"
}
```

### 3.5 Create Nested Folder

```http
POST https://graph.microsoft.com/v1.0/me/mailFolders/{parent-id}/childFolders
Content-Type: application/json

{
  "displayName": "Nested Folder"
}
```

### 3.6 Folder Properties

```typescript
interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  totalItemCount: number;
  unreadItemCount: number;
  isHidden?: boolean;
}
```

---

## 4. Message Operations

### 4.1 List Messages

```http
GET https://graph.microsoft.com/v1.0/me/mailFolders/{folder-id}/messages
  ?$top=50
  &$select=id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview
  &$orderby=receivedDateTime desc
Prefer: IdType="ImmutableId"
```

### 4.2 Get Single Message

```http
GET https://graph.microsoft.com/v1.0/me/messages/{message-id}
  ?$select=id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,isRead,hasAttachments
Prefer: outlook.body-content-type="html"
Prefer: IdType="ImmutableId"
```

### 4.3 Prefer Headers

| Header | Purpose |
|--------|---------|
| `Prefer: IdType="ImmutableId"` | **CRITICAL**: Returns stable IDs that don't change |
| `Prefer: outlook.body-content-type="html"` | Return HTML body |
| `Prefer: outlook.body-content-type="text"` | Return plain text body |
| `Prefer: odata.maxpagesize=50` | Limit page size |

### 4.4 Search Messages

```http
GET https://graph.microsoft.com/v1.0/me/messages
  ?$search="subject:invoice"
  &$top=25
```

**Searchable Fields**: subject, body, from, to, cc, bcc, participants, attachments

### 4.5 Filter Messages

```http
GET https://graph.microsoft.com/v1.0/me/messages
  ?$filter=isRead eq false
  &$filter=receivedDateTime ge 2025-01-01T00:00:00Z
```

### 4.6 Move Message

```http
POST https://graph.microsoft.com/v1.0/me/messages/{message-id}/move
Content-Type: application/json

{
  "destinationId": "{folder-id}"
}
```

**Response**: Returns the moved message with new ID (may change!)

### 4.7 Copy Message

```http
POST https://graph.microsoft.com/v1.0/me/messages/{message-id}/copy
Content-Type: application/json

{
  "destinationId": "{folder-id}"
}
```

### 4.8 Delete Message

```http
# Soft delete (move to Deleted Items)
DELETE https://graph.microsoft.com/v1.0/me/messages/{message-id}

# Permanent delete (from Deleted Items)
DELETE https://graph.microsoft.com/v1.0/me/messages/{message-id}
```

### 4.9 Update Message (Mark Read/Unread, Flag)

```http
PATCH https://graph.microsoft.com/v1.0/me/messages/{message-id}
Content-Type: application/json

{
  "isRead": true,
  "flag": {
    "flagStatus": "flagged"
  }
}
```

**Flag Status Values**: `notFlagged`, `flagged`, `complete`

---

## 5. Batch Requests

### 5.1 Batch Endpoint

```http
POST https://graph.microsoft.com/v1.0/$batch
Content-Type: application/json
```

### 5.2 Batch Request Format

```json
{
  "requests": [
    {
      "id": "1",
      "method": "GET",
      "url": "/me/messages/AAMkAGI1..."
    },
    {
      "id": "2",
      "method": "PATCH",
      "url": "/me/messages/AAMkAGI2...",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "isRead": true
      }
    },
    {
      "id": "3",
      "method": "DELETE",
      "url": "/me/messages/AAMkAGI3..."
    }
  ]
}
```

### 5.3 Batch Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Max requests per batch** | **20** | Hard limit |
| Max request URL length | 2048 chars | Per individual request |
| Max batch size | 4 MB | Total request body |
| Bulk operation timeout | 1 hour | Operations fail if not completed |

### 5.4 Batch Response

```json
{
  "responses": [
    {
      "id": "1",
      "status": 200,
      "body": { "id": "AAMkAGI1...", "subject": "Hello" }
    },
    {
      "id": "2",
      "status": 200,
      "body": {}
    },
    {
      "id": "3",
      "status": 204,
      "body": null
    }
  ]
}
```

### 5.5 Batch Error Handling

```typescript
interface BatchResponse {
  responses: Array<{
    id: string;
    status: number;
    headers?: Record<string, string>;
    body?: any;
  }>;
}

function processBatchResponse(batch: BatchResponse) {
  for (const response of batch.responses) {
    if (response.status >= 400) {
      // Individual request failed
      const error = response.body?.error;
      console.error(`Request ${response.id} failed:`, error?.code, error?.message);
    }
  }
}
```

### 5.6 Dependent Requests

For sequential operations, use `dependsOn`:

```json
{
  "requests": [
    {
      "id": "1",
      "method": "POST",
      "url": "/me/mailFolders",
      "body": { "displayName": "New Folder" }
    },
    {
      "id": "2",
      "method": "POST",
      "url": "/me/messages/AAMkAGI.../move",
      "dependsOn": ["1"],
      "body": { "destinationId": "$1.id" }
    }
  ]
}
```

---

## 6. Attachments

### 6.1 List Attachments

```http
GET https://graph.microsoft.com/v1.0/me/messages/{message-id}/attachments
  ?$select=id,name,contentType,size,isInline
```

### 6.2 Get Attachment Content

```http
GET https://graph.microsoft.com/v1.0/me/messages/{message-id}/attachments/{attachment-id}
```

### 6.3 Attachment Types

| Type | contentType | Description |
|------|-------------|-------------|
| `#microsoft.graph.fileAttachment` | Any | Regular file |
| `#microsoft.graph.itemAttachment` | message/rfc822 | Attached email |
| `#microsoft.graph.referenceAttachment` | - | Cloud file link |

### 6.4 Large Attachments (> 3MB)

Use upload sessions for attachments larger than 3MB:

```http
POST https://graph.microsoft.com/v1.0/me/messages/{message-id}/attachments/createUploadSession
Content-Type: application/json

{
  "AttachmentItem": {
    "@odata.type": "#microsoft.graph.fileAttachment",
    "name": "largefile.pdf",
    "size": 15000000,
    "contentType": "application/pdf"
  }
}
```

---

## 7. Rate Limits & Throttling

### 7.1 Rate Limit Tiers

| Scope | Limit | Window |
|-------|-------|--------|
| Per user | 10,000 requests | 10 minutes |
| Per app (delegated) | 10,000 requests | 10 minutes |
| Per tenant | Varies | - |

### 7.2 Throttling Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 120

{
  "error": {
    "code": "TooManyRequests",
    "message": "Too many requests",
    "innerError": {
      "code": "throttledRequest"
    }
  }
}
```

### 7.3 Throttling Best Practices

```typescript
async function makeRequestWithRetry(request: () => Promise<Response>) {
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await request();

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      await sleep(retryAfter * 1000);
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

### 7.4 Service Limits

| Operation | Limit |
|-----------|-------|
| Mailbox size | Varies by license (50GB-100GB) |
| Message size (send) | 35 MB |
| Attachment size (per message) | 150 MB (with upload session) |
| Recipients per message | 500 |

---

## 8. Error Handling

### 8.1 Error Response Format

```json
{
  "error": {
    "code": "ErrorCode",
    "message": "Human readable message",
    "innerError": {
      "code": "InnerErrorCode",
      "request-id": "guid",
      "date": "2025-01-04T10:00:00"
    }
  }
}
```

### 8.2 Common Error Codes

| HTTP Status | Code | Meaning | Action |
|-------------|------|---------|--------|
| 400 | `BadRequest` | Malformed request | Fix request |
| 400 | `InvalidDeltaToken` | Delta token expired | **Full resync** |
| 401 | `Unauthorized` | Token expired/invalid | Refresh token |
| 403 | `Forbidden` | Insufficient permissions | Check scopes |
| 404 | `ResourceNotFound` | Item doesn't exist | Remove from DB |
| 409 | `Conflict` | Resource conflict | Retry with backoff |
| 410 | `Gone` | Delta token expired | **Full resync** |
| 429 | `TooManyRequests` | Rate limited | Respect Retry-After |
| 500 | `InternalServerError` | Microsoft error | Retry with backoff |
| 503 | `ServiceUnavailable` | Temporary outage | Retry with backoff |

### 8.3 Delta-Specific Errors

```typescript
function isDeltaExpired(error: GraphError): boolean {
  // Delta token expiration can manifest as 400 or 410
  if (error.statusCode === 410) return true;
  if (error.statusCode === 400 &&
      (error.code === 'InvalidDeltaToken' ||
       error.code === 'SyncStateNotFound' ||
       error.message?.includes('delta'))) {
    return true;
  }
  return false;
}
```

### 8.4 Retry Strategy

```typescript
const RETRYABLE_ERRORS = [429, 500, 502, 503, 504];
const RETRYABLE_CODES = ['TooManyRequests', 'ServiceUnavailable', 'GatewayTimeout'];

function shouldRetry(error: GraphError): boolean {
  return RETRYABLE_ERRORS.includes(error.statusCode) ||
         RETRYABLE_CODES.includes(error.code);
}
```

---

## 9. Best Practices

### 9.1 Use Immutable IDs

**CRITICAL**: Always request immutable IDs to prevent ID changes after move/copy:

```http
Prefer: IdType="ImmutableId"
```

Without this header, message IDs **will change** when messages are moved between folders.

### 9.2 Select Only Needed Fields

```http
?$select=id,subject,from,receivedDateTime,isRead
```

Don't request `body` unless needed - it significantly increases response size.

### 9.3 Efficient Pagination

```typescript
async function* paginateMessages(folderId: string) {
  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$top=50`;

  while (url) {
    const response = await graphClient.get(url);
    yield response.value;
    url = response['@odata.nextLink'];
  }
}
```

### 9.4 Send + Get Pattern

Microsoft's `sendMail` endpoint doesn't return the sent message ID:

```typescript
// WRONG: Expecting ID from sendMail
const { id } = await sendMail(message);  // Returns nothing useful!

// CORRECT: Save draft, then send
async function sendAndTrack(message: Message): Promise<string> {
  // 1. Create draft
  const draft = await graphClient.post('/me/messages', message);

  // 2. Send the draft
  await graphClient.post(`/me/messages/${draft.id}/send`);

  // 3. Return the ID (message moves to Sent Items with same ID)
  return draft.id;
}
```

### 9.5 Handle Folder Hierarchy

```typescript
async function getAllFolders(): Promise<MailFolder[]> {
  const folders: MailFolder[] = [];

  // Get root folders
  const rootFolders = await graphClient.get('/me/mailFolders?$top=100');
  folders.push(...rootFolders.value);

  // Recursively get child folders
  for (const folder of rootFolders.value) {
    if (folder.childFolderCount > 0) {
      const children = await getChildFolders(folder.id);
      folders.push(...children);
    }
  }

  return folders;
}
```

### 9.6 Batch Wisely

```typescript
// Group operations into batches of 20
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function batchMarkAsRead(messageIds: string[]) {
  const chunks = chunkArray(messageIds, 20);  // Microsoft max is 20

  for (const chunk of chunks) {
    const requests = chunk.map((id, index) => ({
      id: String(index),
      method: 'PATCH',
      url: `/me/messages/${id}`,
      body: { isRead: true }
    }));

    await graphClient.post('/$batch', { requests });
  }
}
```

---

## 10. Known Quirks & Gotchas

### 10.1 Message IDs Change on Move (Without ImmutableId)

If you don't use `Prefer: IdType="ImmutableId"`, message IDs will change when:
- Message is moved to another folder
- Message is copied to another folder

**Solution**: Always use `Prefer: IdType="ImmutableId"` header.

### 10.2 Delta Token in URL, Not Separate Field

Unlike Gmail's historyId (a number), Microsoft's delta token is embedded in the URL:

```typescript
// WRONG
const deltaToken = 'abc123';
const url = `/me/mailFolders/inbox/messages/delta?$deltatoken=${deltaToken}`;

// CORRECT - Store and use the full deltaLink URL
const deltaLink = response['@odata.deltaLink'];
// Later: GET {deltaLink}
```

### 10.3 sendMail Returns No ID

```http
POST /me/sendMail
# Returns 202 Accepted with empty body - no message ID!
```

**Workaround**: Use save-then-send pattern (create draft, send draft).

### 10.4 Folder Counts May Be Delayed

`totalItemCount` and `unreadItemCount` are eventually consistent - may not reflect recent changes immediately.

### 10.5 Search vs Filter

- `$search`: Full-text search, uses Outlook's search index
- `$filter`: Property-based filtering, exact matches

```http
# Search - finds "invoice" anywhere in searchable fields
?$search="invoice"

# Filter - exact property match
?$filter=from/emailAddress/address eq 'sender@example.com'
```

### 10.6 Bulk Operations 1-Hour Timeout

Operations that don't complete within 1 hour will fail. Break large operations into smaller batches.

### 10.7 Personal vs Work Account Differences

| Feature | Personal (MSA) | Work (AAD) |
|---------|---------------|------------|
| Archive folder | May not exist | Always exists |
| Focused Inbox | Limited | Full support |
| Categories | Basic | Full support |
| Rules | Limited | Full support |

### 10.8 Body Content Encoding

Body content may be HTML or text based on `Prefer` header:

```http
# For HTML body
Prefer: outlook.body-content-type="html"

# For plain text body
Prefer: outlook.body-content-type="text"
```

Default is HTML if not specified.

---

## Quick Reference Card

### Essential Headers

```http
Authorization: Bearer {access_token}
Prefer: IdType="ImmutableId"
Prefer: odata.maxpagesize=50
Prefer: outlook.body-content-type="html"
Content-Type: application/json
```

### Essential Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List folders | GET | `/me/mailFolders` |
| Get folder | GET | `/me/mailFolders/{id}` |
| List messages | GET | `/me/mailFolders/{id}/messages` |
| Get message | GET | `/me/messages/{id}` |
| Move message | POST | `/me/messages/{id}/move` |
| Update message | PATCH | `/me/messages/{id}` |
| Delete message | DELETE | `/me/messages/{id}` |
| Delta sync | GET | `/me/mailFolders/{id}/messages/delta` |
| Batch | POST | `/$batch` |

### Delta Sync Flow

```
1. Initial: GET /mailFolders/{id}/messages/delta
2. Paginate: Follow @odata.nextLink until gone
3. Save: Store @odata.deltaLink
4. Later: GET {deltaLink}
5. If 410/400: Full resync from step 1
```

### Error Recovery

| Error | Recovery |
|-------|----------|
| 401 | Refresh access token |
| 404 | Remove item from local DB |
| 410/400 (delta) | Full resync |
| 429 | Wait Retry-After seconds |
| 5xx | Exponential backoff retry |

---

## References

- [Microsoft Graph Mail API](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)
- [Delta Query](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Batch Requests](https://learn.microsoft.com/en-us/graph/json-batching)
- [Throttling Guidance](https://learn.microsoft.com/en-us/graph/throttling)
- [Bulk Operations Limits](https://learn.microsoft.com/en-us/entra/fundamentals/bulk-operations-service-limitations)
