# Email API Comparison Matrix

> **Purpose**: Side-by-side comparison of Gmail API, Microsoft Graph, and IMAP for MailAgent implementation decisions.
> **Date**: 2025-01-04
> **Status**: Production Reference

---

## Quick Comparison Overview

| Feature | Gmail API | Microsoft Graph | IMAP |
|---------|-----------|-----------------|------|
| **Best For** | Google Workspace | Microsoft 365 | Universal support |
| **Protocol** | REST + HTTP/2 | REST + OData | TCP socket |
| **Auth** | OAuth 2.0 | OAuth 2.0 (MSAL) | Various |
| **Real-time** | Pub/Sub (complex) | Webhooks | IDLE command |
| **Batch** | 50 req/batch | 20 req/batch | Native bulk |
| **Delta Sync** | historyId (number) | deltaLink (URL) | CONDSTORE/MODSEQ |

---

## 1. Authentication

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Primary Method** | OAuth 2.0 | OAuth 2.0 (MSAL) | OAuth/Password |
| **Token Lifetime** | 1 hour | 1 hour | Session-based |
| **Refresh Token** | `prompt=consent` required | `offline_access` scope | N/A |
| **App Password** | Supported | Limited | Universal |
| **PKCE** | Supported | Supported | N/A |
| **Scopes Model** | Granular | Granular | N/A |

### Key OAuth Scopes

| Purpose | Gmail | Microsoft |
|---------|-------|-----------|
| Read mail | `gmail.readonly` | `Mail.Read` |
| Read/Write | `gmail.modify` | `Mail.ReadWrite` |
| Send | `gmail.send` | `Mail.Send` |
| Full access | `mail.google.com` | `Mail.ReadWrite` |
| Offline | (automatic) | `offline_access` |

---

## 2. Delta Sync / Incremental Changes

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Mechanism** | `historyId` (BigInt) | `deltaLink` (URL) | CONDSTORE/MODSEQ |
| **Storage** | Store number | Store full URL | Store MODSEQ + UIDVALIDITY |
| **Expiration** | "At least 1 week" (varies) | Cache-based (no fixed limit) | Never (with UIDVALIDITY) |
| **Expired Detection** | HTTP 404 | HTTP 410 or `syncStateNotFound` | UIDVALIDITY mismatch |
| **Recovery** | Full sync | Full sync | Full sync |
| **Granularity** | Per-account | Per-folder | Per-folder |

### Delta Sync Code Patterns

```typescript
// Gmail: historyId as BigInt
const historyId = BigInt(response.historyId);
if (historyId > lastHistoryId) { /* changes */ }

// Microsoft: Full URL storage
const deltaLink = response['@odata.deltaLink'];
// Later: GET {deltaLink}

// IMAP: MODSEQ with UIDVALIDITY check
if (mailbox.uidValidity !== savedUidValidity) {
  // FULL RESYNC - all UIDs invalid!
}
const changes = await fetch('1:*', opts, { changedSince: modseq });
```

---

## 3. Folder Operations

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Concept** | Labels (multi-assign) | Folders (single) | Mailboxes (single) |
| **System Folders** | INBOX, SENT, etc. | Well-known IDs | Special-use attrs |
| **Hierarchy** | Flat with nesting | True hierarchy | Hierarchy with delimiter |
| **Create** | `labels.create` | POST mailFolders | CREATE |
| **Delete** | `labels.delete` | DELETE | DELETE |
| **Rename** | `labels.patch` | PATCH | RENAME |
| **Counts** | Yes | Yes (eventual) | Yes (immediate) |

### System Folder Mapping

| Canonical | Gmail Label | Microsoft Well-Known | IMAP Special-Use |
|-----------|-------------|---------------------|------------------|
| Inbox | `INBOX` | `inbox` | `\Inbox` |
| Sent | `SENT` | `sentitems` | `\Sent` |
| Drafts | `DRAFT` | `drafts` | `\Drafts` |
| Trash | `TRASH` | `deleteditems` | `\Trash` |
| Spam | `SPAM` | `junkemail` | `\Junk` |
| Archive | `CATEGORY_*` | `archive` | `\Archive` |
| All Mail | `All Mail` | N/A | N/A |

---

## 4. Message Operations

### 4.1 Listing Messages

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Endpoint** | `messages.list` | GET messages | FETCH |
| **Page Size** | 100 max (50 rec.) | 1000 max (50 rec.) | No limit |
| **Pagination** | `pageToken` | `@odata.nextLink` | UID ranges |
| **Sorting** | By date (default) | `$orderby` | No (manual) |
| **Filtering** | `q` parameter | `$filter` / `$search` | SEARCH command |

### 4.2 Getting Single Message

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Format Options** | minimal/metadata/full/raw | $select fields | BODY parts |
| **Include Body** | format=full | Prefer: body-content-type | BODY.PEEK[] |
| **Attachments** | Separate call | Inline or separate | BODY parts |

### 4.3 Message IDs

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **ID Type** | Immutable string | Changes on move! | UID (per-folder) |
| **ID Stability** | Always stable | Needs `ImmutableId` header | Stable within UIDVALIDITY |
| **Cross-Folder** | Same ID | Different ID | Different UID |
| **Thread ID** | `threadId` | `conversationId` | X-GM-THRID (Gmail) |

**CRITICAL**: Microsoft Graph IDs change on move unless using `Prefer: IdType="ImmutableId"` header!

---

## 5. Message Mutations

### 5.1 Move/Copy

| Operation | Gmail API | Microsoft Graph | IMAP |
|-----------|-----------|-----------------|------|
| **Move** | Add/remove labels | POST .../move | MOVE or COPY+DELETE |
| **Copy** | N/A (labels) | POST .../copy | COPY |
| **ID Changes** | No | Yes (without ImmutableId) | Yes (new UID) |
| **Atomic** | Yes | Yes | MOVE yes, else no |

### 5.2 Delete

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Soft Delete** | Add TRASH label | DELETE (→ Deleted Items) | Add \Deleted flag |
| **Hard Delete** | `messages.delete` | DELETE from Deleted | EXPUNGE |
| **Recoverable** | From Trash | From Deleted Items | Until EXPUNGE |

### 5.3 Flag/Status Updates

| Flag | Gmail API | Microsoft Graph | IMAP |
|------|-----------|-----------------|------|
| **Read** | Remove UNREAD label | PATCH isRead | \Seen flag |
| **Starred** | Add STARRED label | PATCH flag.flagStatus | \Flagged flag |
| **Important** | IMPORTANT label | N/A | N/A |
| **Categories** | Labels | categories[] | N/A |

---

## 6. Batch Operations

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Max Per Batch** | 100 (50 recommended) | **20** (hard limit) | No limit |
| **Batch Modify** | 1000 IDs per call | N/A | UID ranges |
| **Endpoint** | Multipart POST | POST /$batch | Native commands |
| **Dependencies** | No | Yes (dependsOn) | Sequential |
| **Partial Failure** | Per-request status | Per-request status | Command fails |

### Batch Size Recommendations

| Provider | Recommended | Maximum | Notes |
|----------|-------------|---------|-------|
| Gmail API | 50 | 100 | batchModify: 1000 IDs |
| Microsoft Graph | 20 | 20 | Hard limit |
| Gmail IMAP | 100 | 1000 | May timeout |
| Outlook IMAP | 100 | 500 | Conservative |
| Yahoo IMAP | 50 | 200 | Strict limits |

---

## 7. Rate Limits

| Provider | Limit | Window | Retry Header |
|----------|-------|--------|--------------|
| Gmail API | 250 quota units/sec/user | Per second | Retry-After |
| Microsoft Graph | 10,000 req/10min/app | 10 minutes | Retry-After |
| IMAP | Provider-specific | - | N/A |

### Gmail Quota Units

| Operation | Cost |
|-----------|------|
| messages.list | 5 |
| messages.get | 5 |
| messages.modify | 5 |
| messages.send | 100 |
| messages.insert | 25 |

---

## 8. Real-time Notifications

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Method** | Cloud Pub/Sub | Webhooks | IDLE command |
| **Setup Complexity** | High | Medium | Low |
| **Scope** | Per-user | Per-user | Per-folder |
| **Latency** | Seconds | Seconds | Immediate |
| **Requires** | GCP project | Public endpoint | Persistent connection |
| **Timeout** | 7 days (renew) | 3 days (renew) | 29 min (re-IDLE) |

### Implementation Effort

| Provider | Real-time Setup |
|----------|-----------------|
| Gmail | Complex: Pub/Sub topic, subscription, Cloud project, webhook endpoint |
| Microsoft | Medium: Webhook endpoint, subscription management |
| IMAP | Simple: Just call IDLE, handle events |

---

## 9. Attachments

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Get Metadata** | In message response | In message or separate | BODYSTRUCTURE |
| **Get Content** | `attachments.get` | GET .../attachments/{id} | BODY[part] |
| **Max Size** | 25 MB (send) | 35 MB / 150 MB upload | Provider-specific |
| **Upload Large** | Resumable upload | Upload session | Append |
| **Inline Images** | Base64 in body | contentId reference | CID references |

---

## 10. Search Capabilities

| Feature | Gmail API | Microsoft Graph | IMAP |
|---------|-----------|-----------------|------|
| **Full-text** | `q=` parameter | `$search` | BODY/TEXT (slow) |
| **From/To/Subject** | In q param | `$filter` or `$search` | FROM/TO/SUBJECT |
| **Date Range** | after:/before: | `$filter receivedDateTime` | SINCE/BEFORE |
| **Has Attachment** | has:attachment | hasAttachments eq true | Not standard |
| **Unread** | is:unread | isRead eq false | UNSEEN |
| **Labels/Folders** | label:name | In specific folder | SELECT mailbox |
| **Boolean** | AND, OR, NOT | and, or, not | OR, NOT |

### Search Query Examples

```typescript
// Gmail
q: 'from:alice@example.com after:2025/01/01 has:attachment'

// Microsoft Graph
$filter: "from/emailAddress/address eq 'alice@example.com' and receivedDateTime ge 2025-01-01"
$search: "hasAttachments:true"

// IMAP
SEARCH FROM "alice@example.com" SINCE 1-Jan-2025
```

---

## 11. Error Handling Comparison

### Authentication Errors

| Error | Gmail | Microsoft | IMAP |
|-------|-------|-----------|------|
| Token expired | 401 | 401 | AUTHENTICATIONFAILED |
| Invalid token | 401 | 401 | AUTHENTICATIONFAILED |
| Insufficient scope | 403 | 403 | N/A |

### Resource Errors

| Error | Gmail | Microsoft | IMAP |
|-------|-------|-----------|------|
| Not found | 404 | 404 | NONEXISTENT |
| Already exists | 409 | 409 | ALREADYEXISTS |
| Rate limited | 429 | 429 | (connection limit) |
| Server error | 500 | 500 | (disconnect) |

### Sync Token Errors

| Scenario | Gmail | Microsoft | IMAP |
|----------|-------|-----------|------|
| Token expired | 404 on history.list | 410 or 400 | UIDVALIDITY mismatch |
| Recovery | Full sync | Full sync | Full sync |

---

## 12. Connection Management

| Aspect | Gmail API | Microsoft Graph | IMAP |
|--------|-----------|-----------------|------|
| **Connection Type** | HTTP/2 | HTTP/1.1 | TCP socket |
| **Persistent** | Connection pooling | Connection pooling | Yes (required) |
| **Max Connections** | HTTP limits | HTTP limits | Provider-specific |
| **Keep-alive** | HTTP keep-alive | HTTP keep-alive | NOOP every ~5 min |

### IMAP Connection Limits

| Provider | Max Connections |
|----------|-----------------|
| Gmail | 15 |
| Outlook | 16 |
| Yahoo | 10 |
| iCloud | 10 |

---

## 13. Send Message

| Aspect | Gmail API | Microsoft Graph | IMAP/SMTP |
|--------|-----------|-----------------|-----------|
| **Endpoint** | messages.send | sendMail or messages/{id}/send | SMTP |
| **Returns ID** | Yes | **No** (use draft→send) | No |
| **Format** | RFC 822 base64 | JSON object | RFC 822 |
| **Track Sent** | Yes | Manual (draft pattern) | Append to Sent |

### Send Pattern for ID Tracking

```typescript
// Gmail: ID returned directly
const { id } = await gmail.messages.send({ raw: base64Message });

// Microsoft: Must use draft→send pattern
const draft = await graph.post('/me/messages', message);
await graph.post(`/me/messages/${draft.id}/send`);
const sentId = draft.id;

// IMAP: Append to Sent folder manually
await client.append('Sent', rawMessage, { flags: ['\\Seen'] });
```

---

## 14. Implementation Recommendations

### Use Gmail API When:
- Google Workspace / Gmail users
- Need labels (multi-folder assignment)
- Need reliable delta sync (historyId)
- Don't need complex real-time (or can set up Pub/Sub)

### Use Microsoft Graph When:
- Microsoft 365 / Outlook users
- Need webhooks for real-time
- Need folder hierarchy
- Can handle deltaLink URL storage

### Use IMAP When:
- Supporting any email provider
- Need real-time with minimal setup (IDLE)
- Users have app passwords / OAuth2 XOAUTH2
- Need maximum compatibility

---

## 15. Driver Interface Mapping

### IEmailDriver Methods to API Calls

| Driver Method | Gmail API | Microsoft Graph | IMAP (ImapFlow) |
|---------------|-----------|-----------------|-----------------|
| `connect()` | OAuth init | OAuth init | `client.connect()` |
| `disconnect()` | - | - | `client.logout()` |
| `listFolders()` | labels.list | GET mailFolders | `client.list()` |
| `listMessages()` | messages.list | GET messages | `client.fetch()` |
| `getMessage()` | messages.get | GET messages/{id} | `client.fetchOne()` |
| `sendMessage()` | messages.send | sendMail | SMTP |
| `moveMessage()` | messages.modify | POST .../move | `client.messageMove()` |
| `deleteMessage()` | messages.trash/delete | DELETE | `client.messageDelete()` |
| `setReadStatus()` | messages.modify | PATCH isRead | `client.messageFlagsAdd/Remove()` |
| `getChangesSince()` | history.list | GET .../delta | CONDSTORE fetch |
| `getAttachment()` | attachments.get | GET .../attachments | `client.fetchOne()` bodyParts |

---

## Quick Reference: Critical Gotchas

| Issue | Gmail | Microsoft | IMAP |
|-------|-------|-----------|------|
| **ID Stability** | Always stable | Use ImmutableId header! | Check UIDVALIDITY |
| **Sync Token** | BigInt for historyId | Store full deltaLink URL | Store MODSEQ + UIDVALIDITY |
| **Token Expiry** | 404 on history.list | 410 or 400 on delta | N/A |
| **Batch Limit** | 50-100 | **20 max** | Provider-specific |
| **Real-time** | Complex Pub/Sub | Webhooks | Simple IDLE |
| **Send Returns ID** | Yes | **No** (use draft) | No |
| **Folder Model** | Labels (multi) | Folders (single) | Mailboxes (single) |

---

## References

- [GMAIL_API_COMPREHENSIVE_REFERENCE.md](./GMAIL_API_COMPREHENSIVE_REFERENCE.md)
- [MICROSOFT_GRAPH_API_COMPREHENSIVE_GUIDE.md](./MICROSOFT_GRAPH_API_COMPREHENSIVE_GUIDE.md)
- [IMAP_PROTOCOL_COMPREHENSIVE_GUIDE.md](./IMAP_PROTOCOL_COMPREHENSIVE_GUIDE.md)
