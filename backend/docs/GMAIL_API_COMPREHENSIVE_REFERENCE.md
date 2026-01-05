# Gmail API Comprehensive Reference for Production Email Client

**Version:** 2025-01-04
**Target:** Production-grade email synchronization with 1000+ users
**Based on:** Gmail API v1, OAuth 2.0, Google Cloud Pub/Sub

---

## Table of Contents

1. [Authentication & Scopes](#1-authentication--scopes)
2. [Core API Endpoints](#2-core-api-endpoints)
3. [Delta Sync (History API)](#3-delta-sync-history-api)
4. [Labels (Folders)](#4-labels-folders)
5. [Batch Requests](#5-batch-requests)
6. [Rate Limits & Quotas](#6-rate-limits--quotas)
7. [Error Codes](#7-error-codes)
8. [Best Practices 2025](#8-best-practices-2025)
9. [Production Patterns](#9-production-patterns)
10. [Common Pitfalls](#10-common-pitfalls)

---

## 1. Authentication & Scopes

### OAuth 2.0 Flow

Gmail uses OAuth 2.0 for authentication. The flow requires:

```typescript
// 1. Generate authorization URL
const scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',      // Required for refresh tokens
  scope: scopes,
  state: randomState,           // CSRF protection
  prompt: 'consent',            // Force consent to get refresh token
});

// 2. Exchange authorization code for tokens
const { tokens } = await oauth2Client.getToken(authorizationCode);
// tokens.access_token - Valid for 1 hour
// tokens.refresh_token - Valid until revoked (ONLY returned with prompt=consent)
// tokens.expiry_date - Unix timestamp in milliseconds
```

### Required Scopes

| Scope | Permission | Use Case |
|-------|-----------|----------|
| `https://mail.google.com/` | Full mailbox access | **Recommended** - covers all operations |
| `https://www.googleapis.com/auth/gmail.modify` | Read/modify emails | Alternative to full access |
| `https://www.googleapis.com/auth/gmail.readonly` | Read-only access | Limited use case |
| `https://www.googleapis.com/auth/gmail.send` | Send emails | Required for sending |
| `https://www.googleapis.com/auth/gmail.compose` | Create drafts | Subset of send |
| `https://www.googleapis.com/auth/gmail.labels` | Manage labels | Included in modify |
| `https://www.googleapis.com/auth/userinfo.email` | Get user email | Required for identification |

**Production Recommendation:** Use `https://mail.google.com/` for simplicity. It covers all operations.

### Refresh Token Handling

```typescript
// CRITICAL: Refresh tokens are ONLY returned when:
// 1. prompt=consent is set (forces re-consent)
// 2. User grants access for the first time
// 3. User has revoked access and re-authorizes

oauth2Client.setCredentials({ refresh_token: refreshToken });
const { credentials } = await oauth2Client.refreshAccessToken();
```

### Token Expiry Scenarios

| Scenario | Behavior | Solution |
|----------|----------|----------|
| Access token expires (1 hour) | API returns 401 | Refresh using refresh token |
| Refresh token revoked by user | Refresh fails with `invalid_grant` | Re-authenticate user |
| Insufficient permissions | API returns 403 | Re-request with correct scopes |
| Token quota exceeded | API returns 429 | Exponential backoff |

---

## 2. Core API Endpoints

### messages.list - List Messages

```typescript
const response = await gmail.users.messages.list({
  userId: 'me',
  labelIds: ['INBOX'],           // Filter by label (optional)
  q: 'is:unread after:2025/01/01', // Search query (optional)
  maxResults: 500,                // Max: 500 (default: 100)
  pageToken: nextPageToken,       // Pagination token
});

// Response
{
  messages: [{ id: '18c...', threadId: '18c...' }],
  nextPageToken: 'PAGETOK...',   // Present if more results
  resultSizeEstimate: 1234        // Approximate total count
}
```

**Pagination:**
- Returns up to `maxResults` messages per page
- Use `nextPageToken` to fetch next page
- Continue until `nextPageToken` is absent

### messages.get - Get Message Details

```typescript
const response = await gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: 'full',                  // full, metadata, minimal, raw
  metadataHeaders: ['From', 'To'], // If format=metadata
});

// Format options:
// - full: Complete message (headers, body, attachments metadata)
// - metadata: Headers only (faster)
// - minimal: Minimal data (id, threadId, labelIds)
// - raw: RFC 2822 format (base64url encoded)
```

### messages.send - Send Email

```typescript
// Compose RFC 2822 MIME message
const rawMessage = createRfc2822Message({...});

// Encode as base64url (NOT standard base64)
const raw = Buffer.from(rawMessage).toString('base64url');

const response = await gmail.users.messages.send({
  userId: 'me',
  requestBody: {
    raw,
    threadId: '18c...',  // Optional: reply to thread
  },
});
```

### messages.modify - Update Labels

```typescript
const response = await gmail.users.messages.modify({
  userId: 'me',
  id: messageId,
  requestBody: {
    addLabelIds: ['STARRED', 'IMPORTANT'],
    removeLabelIds: ['UNREAD', 'INBOX'],
  },
});

// Use for:
// - Mark as read: removeLabelIds: ['UNREAD']
// - Star: addLabelIds: ['STARRED']
// - Move to folder: addLabelIds: ['Label_123'], removeLabelIds: ['INBOX']
```

### messages.batchModify - Bulk Operations

```typescript
await gmail.users.messages.batchModify({
  userId: 'me',
  requestBody: {
    ids: ['18c...', '18d...', '18e...'],  // Up to 1000 IDs
    addLabelIds: ['STARRED'],
    removeLabelIds: ['UNREAD'],
  },
});
```

### messages.attachments.get - Download Attachment

```typescript
const response = await gmail.users.messages.attachments.get({
  userId: 'me',
  messageId: messageId,
  id: attachmentId,
});

// Decode attachment
const content = Buffer.from(response.data.data, 'base64url');
```

---

## 3. Delta Sync (History API)

**Purpose:** Efficiently sync only changes since last sync (incremental sync).

### Why Delta Sync?

| Sync Type  | API Calls | Data Transfer | Use Case     |
|------------|-----------|---------------|--------------|

| Full Sync  | 1000+ | 100+ MB | Initial sync, fallback |
| Delta Sync |  1-10 | <1 MB   | Regular updates        |

**Efficiency:** Delta sync reduces API calls by 99% and bandwidth by 99%.

### How It Works

1. **Initial Sync:** Get `historyId` from first message or profile
2. **Store historyId:** Save in database for next sync
3. **Delta Sync:** Use `history.list` to get changes since `historyId`
4. **Update historyId:** Store new `historyId` from response

### Getting Initial historyId

```typescript
// Option 1: From user profile (recommended)
const profile = await gmail.users.getProfile({ userId: 'me' });
const historyId = profile.data.historyId;

// Option 2: From first message
const message = await gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: 'minimal',
});
const historyId = message.data.historyId;
```

### history.list - Get Changes

```typescript
const response = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: lastHistoryId,
  historyTypes: [
    'messageAdded',
    'messageDeleted',
    'labelAdded',
    'labelRemoved',
  ],
  maxResults: 500,
  pageToken: nextPageToken,
});
```

### Handling History Gaps (Official Behavior)

**From Google Docs:** "History records are typically available for at least one week and often longer. However, the time period may be significantly less and records may sometimes be unavailable in rare cases."

**When 404 occurs:** "If the startHistoryId supplied is outside the available range of history records, the API returns an HTTP 404 error. In this case, your client must perform a full sync."

```typescript
try {
  const response = await gmail.users.history.list({...});
} catch (error) {
  if (error.code === 404) {
    // startHistoryId is outside available history range
    // REQUIRED: Perform full sync, get new historyId
    console.warn('History unavailable, performing full sync');
    await performFullSync();
  }
  throw error;
}
```

### Delta Sync Best Practices

1. **Always store latest historyId** - Update database after each sync
2. **Handle 404 gracefully** - Fallback to full sync
3. **Process in order** - History records are sequential
4. **Paginate properly** - Use `nextPageToken` for large changes
5. **Deduplicate changes** - Same message can appear in multiple history records

---

## 4. Labels (Folders)

Gmail uses **labels** instead of folders. A message can have multiple labels.

### System Labels

| Label ID | Manually Applicable | Purpose |
|----------|---------------------|---------|
| `INBOX` | Yes | Primary inbox |
| `SENT` | **No** (auto-applied on send) | Sent messages |
| `DRAFT` | **No** (auto-applied on draft create) | Draft messages |
| `TRASH` | Yes | Deleted messages (auto-delete 30 days) |
| `SPAM` | Yes | Spam messages |
| `STARRED` | Yes | Starred/flagged messages |
| `IMPORTANT` | Yes | Important/priority messages |
| `UNREAD` | Yes | Unread status (virtual label) |
| `CHAT` | No | Google Chat messages |

**CRITICAL**: `SENT` and `DRAFT` are automatically applied - you cannot manually add them.

### Category Labels (Virtual - Cannot Create/Delete)

| Label ID | Manually Applicable | Purpose |
|----------|---------------------|---------|
| `CATEGORY_PERSONAL` | Yes | Personal emails tab |
| `CATEGORY_SOCIAL` | Yes | Social networks tab |
| `CATEGORY_PROMOTIONS` | Yes | Marketing/promotions tab |
| `CATEGORY_UPDATES` | Yes | Transactional/updates tab |
| `CATEGORY_FORUMS` | Yes | Mailing lists/forums tab |

**Important:** Category labels are **virtual** - they cannot be created/deleted via API.

### Reserved Label Names

The list above is not exhaustive. Other reserved label names exist. Attempting to create a custom label with a conflicting reserved name generates an **HTTP 400 error**.

**Required scope for label management:** `https://www.googleapis.com/auth/gmail.labels`

### labels.list - List All Labels

```typescript
const response = await gmail.users.labels.list({ userId: 'me' });

// Response includes counts
{
  labels: [
    {
      id: 'INBOX',
      name: 'INBOX',
      type: 'system',
      messagesTotal: 1234,
      messagesUnread: 56,
    }
  ]
}
```

---

## 5. Batch Requests

### Batch Limits

| Operation | Max per Batch | Recommendation |
|-----------|---------------|----------------|
| `messages.get` | 100 | Use 50 for reliability |
| `messages.batchModify` | 1000 IDs | Use 500 for safety |
| `messages.batchDelete` | 1000 IDs | Use 500 for safety |

### Batch Implementation

```typescript
const messageIds = ['18c...', '18d...', '18e...'];
const BATCH_SIZE = 50;

for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
  const batch = messageIds.slice(i, i + BATCH_SIZE);

  const results = await Promise.allSettled(
    batch.map(id =>
      gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    )
  );

  // Handle partial failures
  for (const result of results) {
    if (result.status === 'fulfilled') {
      messages.push(result.value.data);
    } else {
      console.error('Failed:', result.reason);
    }
  }
}
```

---

## 6. Rate Limits & Quotas

### Quota Units System (Official)

Gmail uses **quota units**, not simple request counts:

| Scope | Limit | Error Code |
|-------|-------|------------|
| **Per User** | 15,000 units/minute | `userRateLimitExceeded` |
| **Per Project** | 1,200,000 units/minute | `rateLimitExceeded` |

### Quota Cost Per Operation

| Operation | Cost (units) |
|-----------|--------------|
| `messages.send` | **100** |
| `drafts.send` | **100** |
| `watch` (push notifications) | **100** |
| `messages.get` | 5 |
| `messages.list` | 5 |
| `messages.modify` | 5 |
| `history.list` | 5 |
| `labels.list` | 1 |
| `users.getProfile` | 1 |

**Example:** 15,000 units/min = 3,000 `messages.get` calls/min = 50/second

### Exponential Backoff Strategy

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const code = error.code || error.response?.status;

      // Retry on 429 (rate limit) and 5xx (server errors)
      if (code !== 429 && (code < 500 || code >= 600)) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
      const jitter = delay * 0.2 * (Math.random() - 0.5);

      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError;
}
```

---

## 7. Error Codes

### HTTP Status Codes

| Code | Error | Meaning | Action |
|------|-------|---------|--------|
| 400 | Bad Request | Invalid parameter | Fix request |
| 401 | Unauthorized | Invalid/expired token | Refresh token |
| 403 | Forbidden | Permission denied / quota | Check scopes |
| 404 | Not Found | Message/label doesn't exist | Handle gracefully |
| 429 | Too Many Requests | Rate limit exceeded | Backoff |
| 500 | Internal Server Error | Gmail server error | Retry |
| 503 | Service Unavailable | Gmail temporarily down | Retry |

### Error Handling Implementation

```typescript
async function handleGmailError(error: any): Promise<void> {
  const code = error.code || error.response?.status;
  const reason = error.errors?.[0]?.reason || '';

  switch (code) {
    case 401:
      await refreshAccessToken();
      throw new RetriableError('Token refreshed');

    case 403:
      if (reason === 'quotaExceeded' || reason === 'userRateLimitExceeded') {
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new RetriableError('Rate limit');
      } else if (reason === 'insufficientPermissions') {
        throw new PermanentError('Insufficient OAuth scopes');
      }
      break;

    case 404:
      console.log('Message not found, skipping');
      return;

    case 429:
      const retryAfter = error.response?.headers?.['retry-after'] || 30;
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      throw new RetriableError('Rate limit');

    case 500:
    case 502:
    case 503:
    case 504:
      throw new RetriableError('Server error');

    default:
      throw error;
  }
}
```

---

## 8. Best Practices 2025

### 1. Partial Responses (Field Filtering)

```typescript
// Without fields parameter - returns ALL data (~50 KB/message)
const response = await gmail.users.messages.get({...});

// With fields parameter - returns only specified fields (~5 KB)
const response = await gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: 'full',
  fields: 'id,threadId,labelIds,snippet,internalDate,payload/headers',
});

// Result: 90% bandwidth reduction
```

### 2. Efficient Sync Patterns

**Initial Sync:**
```typescript
// 1. Get initial historyId
const profile = await gmail.users.getProfile({ userId: 'me' });
const initialHistoryId = profile.data.historyId;

// 2. Fetch recent messages (last 7 days)
const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
const response = await gmail.users.messages.list({
  userId: 'me',
  q: `after:${sevenDaysAgo}`,
  maxResults: 500,
});

// 3. Batch fetch details
// 4. Store historyId for next sync
```

### 3. Push Notifications vs Polling

| Method | Latency | Cost | Complexity | Best For |
|--------|---------|------|------------|----------|
| Push (Pub/Sub) | <1 second | $0.40/million | High | Real-time |
| Polling (5 min) | 2.5 min avg | ~$0 | Low | Most apps |

**Recommendation:** Use polling for initial implementation, add push for power users.

### 4. Caching Strategy

```typescript
// Cache labels (1 hour TTL)
const labelsCacheKey = `gmail:labels:${userId}`;
await redis.setex(labelsCacheKey, 3600, JSON.stringify(labels));

// Cache user profile (24 hour TTL)
const profileCacheKey = `gmail:profile:${userId}`;
await redis.setex(profileCacheKey, 86400, JSON.stringify(profile));

// DON'T cache:
// - Message bodies (use database)
// - historyId (always fetch latest)
// - Attachment content (stream directly)
```

### 5. Connection Pooling

```typescript
class GmailClientPool {
  private clients = new Map<string, { client: gmail_v1.Gmail; lastUsed: number }>();
  private MAX_CLIENTS = 50;
  private IDLE_TIMEOUT = 10 * 60 * 1000;

  getClient(providerId: string, accessToken: string): gmail_v1.Gmail {
    const cached = this.clients.get(providerId);

    if (cached && Date.now() - cached.lastUsed < this.IDLE_TIMEOUT) {
      cached.lastUsed = Date.now();
      return cached.client;
    }

    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    const client = google.gmail({ version: 'v1', auth });

    if (this.clients.size >= this.MAX_CLIENTS) {
      this.evictOldest();
    }

    this.clients.set(providerId, { client, lastUsed: Date.now() });
    return client;
  }
}
```

---

## 9. Production Patterns

### Pattern 1: Multi-Tenant Sync Queue

```typescript
interface SyncJob {
  userId: string;
  providerId: string;
  syncType: 'full' | 'incremental';
  priority: 'high' | 'normal' | 'low';
}

const syncQueue = new Queue<SyncJob>('gmail-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

const worker = new Worker<SyncJob>('gmail-sync', async (job) => {
  const lock = await redisLock.acquire(`sync:${job.data.providerId}`, 300000);

  try {
    if (job.data.syncType === 'full') {
      await performFullSync(job.data.providerId);
    } else {
      await performDeltaSync(job.data.providerId);
    }
  } finally {
    await lock.release();
  }
}, {
  connection: redis,
  concurrency: 10,
});
```

### Pattern 2: Progressive Sync

```typescript
async function progressiveSync(providerId: string): Promise<void> {
  // Phase 1: Last 7 days (highest priority)
  await syncDateRange(providerId, 7);

  // Phase 2: Last 30 days
  await syncDateRange(providerId, 30);

  // Phase 3: Last 90 days
  await syncDateRange(providerId, 90);

  // Phase 4: All mail (background)
  await syncAll(providerId);
}
```

---

## 10. Common Pitfalls

### Pitfall 1: Not Refreshing Access Tokens

```typescript
// Always check expiry before API calls
if (tokenExpiresAt.getTime() <= Date.now() + 60000) {
  const refreshed = await refreshAccessToken(refreshToken);
  await updateTokens(providerId, refreshed);
}
```

### Pitfall 2: Ignoring historyId Expiration

```typescript
try {
  await performDeltaSync(lastHistoryId);
} catch (error) {
  if (error.code === 404) {
    console.warn('History expired, falling back to full sync');
    await performFullSync();
  } else {
    throw error;
  }
}
```

### Pitfall 3: Not Using BigInt for historyId

```typescript
// WRONG - Integer overflow for large historyIds
const lastHistoryId = parseInt(storedHistoryId);

// CORRECT - Use BigInt
const lastHistoryId = BigInt(storedHistoryId);
const incomingHistoryId = BigInt(newHistoryId);
if (incomingHistoryId < lastHistoryId) {
  // Handle case
}
```

### Pitfall 4: Category Labels are Virtual

```typescript
// WRONG - Cannot create category labels
await gmail.users.labels.create({ requestBody: { name: 'CATEGORY_CUSTOM' } });

// CORRECT - Skip category labels
const userLabels = labels.filter(l => !l.id.startsWith('CATEGORY_'));
```

### Pitfall 5: Not Handling Partial Batch Failures

```typescript
// WRONG - One failure breaks batch
const messages = await Promise.all(messageIds.map(id => getMessage(id)));

// CORRECT - Handle failures gracefully
const results = await Promise.allSettled(messageIds.map(id => getMessage(id)));
const messages = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);
```

### Pitfall 6: Race Conditions in Multi-Instance Setup

```typescript
// Use distributed lock (Redis)
const lock = await redisLock.acquire(`sync:${providerId}`, 300000);
try {
  await performSync(providerId);
} finally {
  await lock.release();
}
```

### Pitfall 7: Forgetting Watch Subscription Renewal

```typescript
// Cron job - renewals every 7 days
async function renewExpiringSubscriptions(): Promise<void> {
  const subscriptions = await db.webhookSubscription.findMany({
    where: {
      providerType: 'google',
      expiresAt: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    },
  });

  for (const sub of subscriptions) {
    await gmail.users.watch({ userId: 'me', requestBody: {...} });
  }
}
```

---

## Summary Checklist

**Before production:**

- [ ] OAuth 2.0 with `prompt=consent` to get refresh tokens
- [ ] Use `https://mail.google.com/` scope for full access
- [ ] Store refresh tokens encrypted in database
- [ ] Implement token refresh logic (60s buffer)
- [ ] Use delta sync (history API) for incremental updates
- [ ] Store historyId as BigInt or string (not Number)
- [ ] Handle historyId expiration (404 → full sync)
- [ ] Exponential backoff for 429 and 5xx errors
- [ ] Batch operations for multiple messages (50-100)
- [ ] Cache label lists and user profile
- [ ] Distributed locks for multi-instance sync (Redis)
- [ ] Skip category labels in folder sync
- [ ] Renew watch subscriptions every 7 days

---

## References

- **Gmail API Reference:** https://developers.google.com/gmail/api/reference/rest
- **OAuth 2.0 Guide:** https://developers.google.com/identity/protocols/oauth2
- **Quota & Limits:** https://developers.google.com/gmail/api/reference/quota
- **Push Notifications:** https://developers.google.com/gmail/api/guides/push
- **RFC 2822:** https://www.rfc-editor.org/rfc/rfc2822

---

**Last Updated:** 2025-01-04
**Maintained By:** MailAgent Backend Team
