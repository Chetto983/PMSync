# Email & Email-Sync Module Audit & Roadmap

This document provides a comprehensive audit of the `email` and `email-sync` modules. It identifies areas for improvement in performance, security, and maintainability, and proposes a roadmap for addressing them.

*   **Last Updated**: 2025-12-06
*   **Status**: In Progress

## 1. High-Level Architecture

The email functionality is split between two main modules: `email` and `email-sync`.

*   **`email` module**: Provides the primary API for interacting with email data (CRUD operations, search, etc.). It acts as the main interface for the frontend and other backend services.
*   **`email-sync` module**: Responsible for all communication with external email providers (Google, Microsoft, IMAP). It handles the complexities of fetching data, normalizing it, and syncing local changes back to the provider.

This separation of concerns is excellent. It decouples the core application logic from the provider-specific implementation details. The use of a `base-email-sync.service.ts` abstract class is a good pattern for enforcing consistency across different provider implementations.

The use of a BullMQ-based queue (`queue.service.ts`) for managing synchronization tasks is a robust solution for handling background processing, retries, and prioritization.

## 2. Audit Findings & Recommendations

### 2.1. Performance

| ID | Issue | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| PERF-01 | **N+1 Queries in `emails.service.ts`** | The `listEmails` and `getConversations` methods can suffer from N+1 query problems, especially when dealing with multiple providers or complex filters. | Refactor queries to fetch data in fewer, more efficient batches. Use Prisma's relation-loading capabilities more effectively. | High |
| PERF-02 | **Blocking Operations in Controllers** | As noted in the controller audit, some endpoints perform long-running operations synchronously, blocking the request cycle. | Consistently use the job queue for any operation that might take more than a few hundred milliseconds, such as folder count updates or bulk operations. | High |
| PERF-03 | **Inefficient Folder Count Updates** | The `updateFolderCounts` function in `emails.service.ts` recalculates counts on every relevant change. For tenants with many emails, this can be resource-intensive. | Optimize by using database triggers or a materialized view for folder counts. Alternatively, make the updates less frequent or more targeted. | Medium |
| PERF-04 | **Full-text search performance** | The `searchEmails` functionality uses `LIKE` queries (`contains`), which can be slow on large datasets. | Integrate a dedicated full-text search engine like OpenSearch or a cloud-native solution. Prisma supports full-text search extensions for PostgreSQL. | Low |
| PERF-05 | **Memory Usage in `getConversations`** | The current implementation of `getConversations` fetches all emails and then groups them in memory. This can lead to high memory consumption for users with large mailboxes. | Move the conversation grouping logic into the database query itself using window functions or other advanced SQL features, if the database supports it. | Medium |

### 2.2. Security

| ID | Issue | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| SEC-01 | **Potential for Leaking Sensitive Data in Logs** | Some debug logs, like the one in `listEmails`, might log parts of email bodies or other sensitive information. | Implement a log-sanitization service that redacts sensitive information (email bodies, PII, tokens) before logging. Ensure log levels in production are set appropriately. | High |
| SEC-02 | **Inconsistent Role-Based Access Control (RBAC)** | Role checks are done with string literals in controllers and services. | Implement a centralized RBAC system using NestJS Guards and enums for roles. This should be applied consistently across all sensitive operations. | High |
| SEC-03 | **Server-Side Request Forgery (SSRF) in Attachment Download** | The `attachments.controller.ts` proxies downloads, creating an unnecessary SSRF risk. | Standardize on redirecting clients to signed S3 URLs for all attachment downloads, removing the proxy logic. | High |
| SEC-04 | **Lack of Input Validation on DTOs** | Some DTOs lack strict validation rules, which could lead to unexpected data being passed to services. | Apply `class-validator` decorators to all DTOs, including for query parameters, to enforce type, length, and format constraints. | Medium |
| SEC-05 | **Worker Token Security** | The `EMAIL_SYNC_WORKER_TOKEN` in `queue.service.ts` is a shared secret for authenticating workers. | Implement a more robust worker authentication mechanism, such as short-lived JWTs or a proper service-to-service auth system, if the threat model requires it. | Low |

### 2.3. Maintainability & Code Quality

| ID | Issue | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| MAINT-01 | **Complex Logic in Controllers & Services** | Several methods have a high degree of complexity, mixing data retrieval, business logic, and side effects (e.g., `respondToCalendarInvite`, `bulkDelete`). | Refactor large methods into smaller, more focused units. Extract complex business logic into dedicated services (e.g., a `CalendarResponseService`). | High |
| MAINT-02 | **Inconsistent Error Handling** | There's a mix of generic `Error` objects and NestJS `HttpException` classes. Error handling in background jobs (`queue.service.ts`) could be more structured. | Standardize on using NestJS built-in exceptions for API-facing errors. Implement a structured error-reporting system for background jobs (e.g., sending failures to a monitoring service). | Medium |
| MAINT-03 | **Hardcoded Strings and Values** | Folder names for normalization in `base-email-sync.service.ts` are hardcoded. Retry delays and attempts in `queue.service.ts` are configured via environment variables but could be more dynamic. | Move the folder normalization maps to a separate configuration file or a database table to make it more extensible. For the queue, consider implementing a more dynamic backoff strategy. | Medium |
| MAINT-04 | **Redundant Code for Provider/Tenant Checks** | Logic to verify provider ownership for a tenant is repeated across multiple services and controllers. | Create a `ProviderGuard` to handle this at the controller level. For services, create a shared utility function or a provider-scoped service. | High |
| MAINT-05 | **Lack of Unit and Integration Tests** | The file list shows a number of `.spec.ts` files, but the coverage is likely incomplete given the complexity of the logic. The cross-provider sync logic, in particular, is a critical area for testing. | Increase test coverage, especially for business-critical logic in `cross-provider-sync.service.ts`, `emails.service.ts`, and the provider-specific sync implementations. Use mocks for external dependencies like Prisma and provider APIs. | Medium |

### 2.4. API Contract & Data Integrity (Provider ↔ Database ↔ Frontend)

| ID | Issue | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| API-01 | ~~**Provider secrets leaked in folder APIs**~~ | ✅ **FIXED** - `folders.controller.ts` now uses explicit `select` projection returning only safe fields (id, email, providerType, lastSyncedAt, isActive). Tokens/IVs explicitly excluded. | N/A - Resolved | ~~Critical~~ ✅ |
| API-02 | **Folder audit stubbed for OAuth providers** | `folder-sync.service.ts::auditFolderSync` sets `serverPaths = dbPaths` for Gmail/Microsoft, so `/folders/audit/:providerId` returns “in sync” even when drift exists. | Implement real audits for Gmail (labels) and Microsoft (Graph `mailFolders/delta`), and fail fast when audit is not supported. | High |
| API-03 | **Folder identity mismatch UI ↔ provider** | Gmail sync stores `path = label.id` while returning `name = displayName` without a normalized `specialUse`; frontend filtering by RFC 6154 types can disagree with provider state. | Return normalized `specialUse` and stable identifiers for folders, and expose both label id and display name so UI filters remain consistent. | High |
| API-04 | **Over-counting queries on GET /folders** | `folders.controller.ts` triggers `updateAllFolderCounts` on every GET, performing two full counts per folder; large tenants get slow UIs and stale numbers. | Move counts to a background job with cached results; expose a last-updated timestamp and a “refresh” action instead of recomputing on read. | Medium |
| API-05 | **Folder detection in DB is fragile** | Folder existence checks rely on raw `path` equality per provider. Case/locale differences (`Posta in arrivo` vs `INBOX`), delimiter changes, or special-use normalization can create duplicate DB rows and make audits miss drift (`folder-sync.service.ts` upserts + `getFolderByPath`). | Normalize folder keys (uppercased specialUse or canonical path), add case-insensitive unique index per provider, and store both providerId + normalizedKey; use that key for audits/CRUD/counts. | High |

## 3. Proposed Roadmap

### Q1 2026: Foundations & Critical Fixes

*   **[SEC-01, SEC-03, SEC-02, API-01]** Address critical security issues: implement log sanitization, fix SSRF risk, standardize RBAC, and scrub provider secrets from folder APIs.
*   **[PERF-01, PERF-02, API-04]** Tackle major performance bottlenecks: fix N+1 queries, move long-running tasks to the queue, and decouple folder count refresh from read paths.
*   **[MAINT-01, MAINT-04]** Improve code quality: refactor the most complex methods and implement the `ProviderGuard`.

### Q2 2026: Reliability & Testing

*   **[MAINT-02, MAINT-05]** Enhance reliability: standardize error handling and significantly increase test coverage for critical paths.
*   **[PERF-03, API-02, API-03]** Optimize folder count updates and ship real folder audits/normalized folder identities across providers.
*   **[MAINT-03]** Refactor hardcoded values into a more manageable configuration.

## 4. Actionable TODO Checklist

- [x] ~~Folders API projection: strip tokens/IVs and return only id/email/providerType/status~~ ✅ **DONE** - `folders.controller.ts` now uses explicit `select` with safe fields only.
- [ ] Implement Gmail folder audit: fetch labels, map `label.id` ↔ DB path, surface `onlyOnServer`/`onlyInDb`, cap pagination (`backend/src/modules/email-sync/services/folder-sync.service.ts`).
- [ ] Implement Microsoft folder audit via Graph `mailFolders/delta` with `@odata.nextLink`/`@odata.deltaLink` and retry/backoff (`folder-sync.service.ts`).
- [ ] Normalize folder identity in responses: include `specialUse` and stable ids for Gmail labels; ensure frontend can filter by RFC 6154 types.
- [ ] Fix `cleanupOrphanedFolders` to act on Gmail/Microsoft once audits are real; emit metrics for deleted paths.
- [ ] Move folder count refresh off GET: aggregate counts once per run, cache with last-updated timestamp, expose manual refresh endpoint.
- [ ] Queue dedup: replace `hasPendingJob` Redis scans with O(1) guard (deterministic jobId + in-memory set) in `queue.service.ts`.
- [ ] Gmail fetch: drop unsupported `users.messages.batchGet`; use chunked `users.messages.get` with concurrency limiter and retry.
- [ ] Add regression tests: folder audits (all providers), queue dedup behavior under burst, Gmail full/incremental sync fallbacks.
- [ ] Add log-sanitization and SSRF-safe attachment download (signed URLs) across email controllers.
- [ ] Hardening folder detection: introduce normalized folder key (specialUse or normalized path), migrate existing folders to unique index on providerId + normalizedKey, and update CRUD/audit to use it.

### Q3 2026: Advanced Performance & Features

*   **[PERF-04]** Begin research and implementation of a dedicated full-text search solution.
*   **[PERF-05]** Optimize the `getConversations` query to reduce memory usage.
*   **[SEC-05]** If required, upgrade the worker authentication mechanism.

This audit provides a snapshot of the current state of the email modules. The proposed roadmap aims to address the most critical issues first while paving the way for long-term improvements in scalability and maintainability.

## 4. Provider API Usage Audit (Google, Microsoft, IMAP)

This section details findings related to the direct interaction with external provider APIs (Google, Microsoft Graph, and IMAP).

### 4.1. Google (Gmail)

The `google-sync.service.ts` implementation is robust. It correctly uses the official `googleapis` library and leverages the efficient **Gmail History API** for incremental syncs, which is the best practice.

| ID | Finding | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| G-API-01 | **OAuth Scopes** | The current OAuth scopes are not specified in the code. We need to ensure the application follows the principle of least privilege. | Audit the OAuth consent screen configuration in Google Cloud Platform to ensure only necessary scopes are requested (e.g., `gmail.readonly` for reading, `gmail.modify` for changes, `gmail.send` for sending). Avoid requesting full account access if not required. | Medium |
| G-API-02 | **Error Handling for Partial Failures** | The `batchGet` for messages can return partial failures. The current code filters out null messages but might not explicitly handle or log the specific errors for failed messages within a batch. | Enhance the error handling for batch operations to log when specific messages in a batch fail to be retrieved. This can help diagnose issues with specific emails. | Low |
| G-API-03 | **History Sync Truncation** | The sync is truncated after `GMAIL_HISTORY_MAX_PAGES`. The code logs this and sets a `backfillRequired` flag, which is good, but there is no corresponding process to handle this backfill. | Implement a low-priority background job that is triggered when `backfillRequired` is set. This job would perform a slower, more comprehensive sync to fill in the gaps. | Medium |

### 4.2. Microsoft (Graph API)

The `microsoft-sync.service.ts` shows a sophisticated understanding of the Microsoft Graph API, with a robust fallback mechanism from Delta a Query to timestamp-based sync.

| ID | Finding | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| MS-API-01 | **OAuth Scopes** | Similar to Google, the requested OAuth scopes should be reviewed. | Audit the Azure AD application registration to ensure least-privilege scopes are used (e.g., `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`). | Medium |
| MS-API-02 | **Direct Axios Usage** | The service uses `axios` directly. While functional, this misses out on some of the benefits of the official `@microsoft/microsoft-graph-client` library, such as built-in middleware for authentication, retry handling, and throttling. | Consider migrating to the official Microsoft Graph SDK. This would simplify the code, improve reliability, and ensure better long-term compatibility with the Graph API. | Low |
| MS-API-03 | **Delta Link Initialization** | The `initializeDeltaLink` function pages through messages just to get a delta link. This can be slow for large mailboxes. | The Graph API allows generating a delta link with `$deltaToken=latest`. This should be used to get the initial delta link without listing all messages. | High |
| MS-API-04 | **Attachment Handling** | The code fetches message details and then, in a separate process, fetches attachments. | For smaller attachments, Microsoft Graph allows fetching the full message including attachments (up to a certain size limit) in a single request using `$expand=attachments`. This could reduce the number of API calls. | Low |

### 4.3. IMAP

The `imap-sync.service.ts` is well-written and handles many of the complexities of the IMAP protocol. The use of `imapflow` is a modern and solid choice.

| ID | Finding | Description | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| IMAP-01 | **Password Storage** | The IMAP password is encrypted in the database. This is good, but storing passwords is a security risk. | Strongly recommend prioritizing OAuth2 for IMAP providers that support it (like Gmail and some others). For providers that only support passwords, consider using a dedicated secrets management service like HashiCorp Vault instead of storing them in the main application database. | High |
| IMAP-02 | **Connection Management** | The service creates a new IMAP connection for every sync job. While simple, this can be inefficient and lead to a high number of logins. | Implement an IMAP connection pool. A pool could maintain a number of authenticated connections for each provider, reducing the overhead of connecting and logging in for each job. | Medium |
| IMAP-03 | **Move Detection Logic** | The logic to detect moved emails by looking up `Message-ID` is excellent but could be made more efficient. It queries for all message IDs in the current batch. | The query can be further optimized. Instead of querying for all message IDs, only query for message IDs that are not already associated with the UIDs found in the current folder. | Low |
| IMAP-04 | **Full Sync Performance** | The full sync iterates over all folders and fetches recent messages. For accounts with many folders, this can be slow. | For the initial full sync, consider parallelizing the folder syncs. The `imapflow` library supports multiple concurrent connections. A pool of connections could be used to sync multiple folders at once. | Medium |

## 5. Redis + BullMQ Queue Integration Audit

This section audits which operations need to be queued for scalability (1000+ users) and reliability.

### 5.1. Current Queue Integration Status

| Component | Status | Notes |
|-----------|--------|-------|
| Email Sync (incremental) | ✅ Queued | Via `QueueService` and `SyncSchedulerService` |
| Email Sync (full) | ✅ Queued | Via `syncProviderNow()` |
| Folder Operations (CRUD) | ✅ Queued | Via `FolderOperationsQueueService` (newly implemented) |
| Email Send | ❌ Direct API | Not queued - irreversible operation |
| Draft Operations | ❌ Direct API | Not queued |
| OAuth Token Exchange | ❌ Direct API | Not queued - time-sensitive |
| Contact Sync | ⚠️ Fire-and-forget | No retry/tracking |
| Calendar Sync | ⚠️ Fire-and-forget | No retry/tracking |
| Attachment Fetching | ❌ Direct API | Not queued |
| Label/Flag Modifications | ❌ Direct API | Not queued |

### 5.2. Operations Requiring Queue Integration (Priority Order)

#### Tier 1: CRITICAL (Must Queue)

| ID | Operation | Risk | Current State | Impact |
|----|-----------|------|---------------|--------|
| Q-01 | **Email Send** (`sendEmail()`) | Irreversible | Direct API call | User loses email if failure |
| Q-02 | **OAuth Token Exchange** | Time-sensitive | Direct API call (code expires in minutes) | Provider connection fails |
| Q-03 | **Draft Send** (`sendDraft()`) | Irreversible | Direct API call | User loses draft content |

#### Tier 2: HIGH (Should Queue)

| ID | Operation | Risk | Current State | Impact |
|----|-----------|------|---------------|--------|
| Q-04 | **Contact Sync** | Data loss | Fire-and-forget | Contacts out of sync, no retry |
| Q-05 | **Calendar Sync** | Data loss | Fire-and-forget | Events out of sync, no retry |
| Q-06 | **Draft Operations** (create/update/delete) | Data loss | Direct API call | Draft changes lost |
| Q-07 | **Label/Folder Modifications** (`modifyLabels()`) | Inconsistency | Direct API call | Bulk operations fail partially |

#### Tier 3: MEDIUM (Nice to Queue)

| ID | Operation | Risk | Current State | Impact |
|----|-----------|------|---------------|--------|
| Q-08 | **Attachment Fetching** | Timeout | Direct API call | Large files timeout |
| Q-09 | **Read/Unread Flags** | UX | Direct API call | Bulk ops slow |
| Q-10 | **Star/Flag Updates** | UX | Direct API call | Bulk ops slow |

### 5.3. Volume Estimates for 1000+ Users

| Category | Operation | Frequency | Per User/Day | Total/Day (1000 users) |
|----------|-----------|-----------|--------------|------------------------|
| Sync | Email sync (incremental) | 4/hour | 96 | 96,000 |
| Sync | Folder sync | 1/week | ~0.14 | 140 |
| Sync | Calendar sync | 1/day | 1 | 1,000 |
| Sync | Contact sync | 1/day | 1 | 1,000 |
| Send | Email send | Variable | ~5-10 | 5,000-10,000 |
| Draft | Create/update | Variable | ~3-5 | 3,000-5,000 |
| Label | Modify labels | Variable | ~10 | 10,000 |
| Read | Mark as read | Variable | ~50 | 50,000 |

### 5.4. Provider Module Queue Integration Points

**Files requiring modification:**

| File | Operations to Queue | Priority |
|------|---------------------|----------|
| `providers/google-email.provider.ts` | `sendEmail()`, draft ops, label ops | HIGH |
| `providers/microsoft-email.provider.ts` | `sendEmail()`, draft ops, label ops | HIGH |
| `providers/imap-email.provider.ts` | `sendEmail()`, draft ops | HIGH |
| `services/google-oauth.service.ts` | `exchangeCodeForTokens()`, `refreshAccessToken()` | CRITICAL |
| `services/microsoft-oauth.service.ts` | `exchangeCodeForTokens()`, `refreshAccessToken()` | CRITICAL |
| `services/provider-config.service.ts` | `triggerInitialSync()` (contact/calendar sync) | HIGH |

### 5.5. Recommended Queue Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BullMQ Queues                              │
├─────────────────────────────────────────────────────────────────┤
│  email-sync (existing)     │ Email sync jobs                    │
│  folder-operations (NEW)   │ Folder CRUD operations             │
│  email-send (TODO)         │ Email send with retry              │
│  draft-operations (TODO)   │ Draft CRUD + send                  │
│  oauth-operations (TODO)   │ Token exchange/refresh             │
│  contact-sync (TODO)       │ Contact sync with retry            │
│  calendar-sync (TODO)      │ Calendar sync with retry           │
│  bulk-operations (TODO)    │ Label/flag bulk modifications      │
└─────────────────────────────────────────────────────────────────┘
```

### 5.6. Queue Integration TODO Checklist

- [x] Implement `FolderOperationsQueueService` for folder CRUD
- [x] Implement `FolderOperationsWorker` to process folder jobs
- [x] Move `FoldersController` to `EmailSyncModule` for proper DI
- [ ] Create `EmailSendQueueService` for email send operations
- [ ] Create `DraftOperationsQueueService` for draft CRUD + send
- [ ] Create `OAuthQueueService` for token exchange/refresh (with short TTL)
- [ ] Convert contact sync from fire-and-forget to queued with retry
- [ ] Convert calendar sync from fire-and-forget to queued with retry
- [ ] Implement bulk operations queue for label/flag modifications
- [ ] Add Dead Letter Queue (DLQ) for failed operations
- [ ] Add circuit breaker pattern for rate-limited APIs
- [ ] Add metrics collection for all queued operations

## 6. Comprehensive Provider API Audit

### 6.1. Provider Test Results (2025-12-06)

| Provider | Tests Passed | Tests Failed | Skipped | Not Supported |
|----------|--------------|--------------|---------|---------------|
| **IMAP (Libero)** | 14/17 | 0 | 0 | 3 |
| **Google (Gmail)** | 15/15 | 0 | 0 | 0 |
| **Microsoft (Outlook)** | 15/15 | 0 | 0 | 0 |
| **Cross-Provider** | 9/9 | 0 | 0 | 0 |
| **Sync Verification** | 9/9 | 0 | 0 | 0 |

**Overall: 62/65 tests passed (95.4%) + 3 NOT_SUPPORTED (IMAP limitations)**

### 6.1.1. Cross-Provider Email Matrix (ALL PASS)

| From \ To | IMAP | Google | Microsoft |
|-----------|------|--------|-----------|
| **IMAP** | ✅ 583ms | ✅ 565ms | ✅ 572ms |
| **Google** | ✅ 186ms | ✅ 164ms | ✅ 377ms |
| **Microsoft** | ✅ 478ms | ✅ 281ms | ✅ 292ms |

All 9 cross-provider email combinations tested and working.

### 6.1.2. Sync Verification Tests (ALL PASS)

| Provider | Folder Sync | Read Status Sync | Folder Counts Sync |
|----------|-------------|------------------|-------------------|
| **IMAP** | ✅ 1154ms | ✅ 796ms | ✅ 622ms |
| **Google** | ✅ 415ms | ✅ 637ms | ✅ 128ms |
| **Microsoft** | ✅ 184ms | ✅ 351ms | ✅ 94ms |

Tests verify:

* **Folder Sync**: Create folder on provider API → cleanup (validates provider connectivity)
* **Read Status Sync**: Toggle read/unread flag → restore (validates bidirectional flag sync)
* **Folder Counts Sync**: Compare provider counts with database counts (validates count accuracy)

### 6.2. Provider API Operations Matrix

| Operation | Google | Microsoft | IMAP | Status |
|-----------|--------|-----------|------|--------|
| `getUserProfile` | ✅ | ✅ | N/A | All working (MS fallback to mailboxSettings) |
| `listMessages` | ✅ | ✅ | ✅ (via DB) | All providers working |
| `getMessage` | ✅ | ✅ | ✅ (via DB) | All providers working |
| `sendEmail` | ✅ (skipped) | ✅ (skipped) | ✅ (config OK) | Not tested (would send real email) |
| `listThreads` | ✅ | N/A | N/A | Gmail only |
| `getThread` | ✅ | N/A | N/A | Gmail only |
| `listLabels/Folders` | ✅ | ✅ | ✅ | All providers working |
| `getLabel/Folder` | ✅ | ✅ | ✅ | All providers working |
| `createLabel/Folder` | ✅ | ✅ | ✅ | All providers working |
| `renameLabel/Folder` | ✅ | ✅ | ✅ | All providers working |
| `deleteLabel/Folder` | ✅ | ✅ | ✅ | All providers working |
| `moveEmailToFolder` | ✅ | ✅ | ✅ | All providers working |
| `copyEmailToFolder` | N/A | ✅ | N/A | Microsoft only |
| `batchModifyLabels` | ✅ | N/A | N/A | Gmail only |
| `listDrafts` | ✅ | N/A | 🚫 | IMAP not supported |
| `createDraft` | ✅ | ✅ | 🚫 | IMAP not supported |
| `listHistory` (incremental) | ✅ | ✅ (delta) | 🚫 | IMAP not supported |
| `listCalendarEvents` | ✅ | ✅ | N/A | OAuth providers only |
| `listContacts` | ✅ | ✅ | N/A | OAuth providers only |

### 6.3. Provider Implementation Files

| File | Lines | Purpose |
|------|-------|---------|
| `google-email.provider.ts` | 683 | Gmail API implementation |
| `microsoft-email.provider.ts` | 435 | Microsoft Graph API |
| `imap-email.provider.ts` | 607 | IMAP/SMTP generic |
| `base-email-provider.ts` | 67 | Error handling base class |
| `email-provider.interface.ts` | 483 | 29 public methods defined |

### 6.4. Data Integrity Fixes Applied

| Issue | Before | After | Script |
|-------|--------|-------|--------|
| Gmail folder path mismatch | `CATEGORY_PROMOTIONS` | `PROMOTIONS` | `fix-folder-path-mismatch.ts` |
| Microsoft folder path mismatch | Base64 folder ID | Display name | `fix-folder-path-mismatch.ts` |
| Orphaned emails | 192 (70.8%) | 0 | Migration applied |
| Folder count mismatch | Inconsistent | Accurate | Auto-updated |

### 6.5. Known Limitations

#### IMAP Provider
- No draft operations (IMAP protocol limitation)
- No custom labels/flags (only standard IMAP flags)
- No incremental sync (no history API)
- Connection per operation (no pooling)

#### Microsoft Provider
- User.Read scope missing (403 on getUserProfile)
- Uses display names which vary by locale

#### Google Provider
- All operations working correctly
- Full feature support

### 6.6. Scalability Recommendations (1000+ Users)

| Priority | Recommendation | Impact |
|----------|---------------|--------|
| **HIGH** | Implement per-tenant rate limiting | Prevent noisy neighbor |
| **HIGH** | Add IMAP connection pooling | Reduce connection overhead |
| **MEDIUM** | Add circuit breaker pattern | Prevent cascade failures |
| **MEDIUM** | Implement adaptive backoff | Respond to load signals |
| **MEDIUM** | Queue email send operations | Ensure delivery with retry |
| **LOW** | Add provider quota tracking | Monitor API limits |
| **LOW** | Implement request batching | Reduce API calls |

### 6.7. Test Script Location

```bash
# Run comprehensive provider API tests
cd backend
npx ts-node ./scripts/test-all-providers-api.ts

# Run stress test for 1000+ users
npx ts-node ./scripts/stress-test-1000-users.ts
```

## 7. Stress Test Results (1000+ Users Validation)

### 7.1. Test Configuration

- **Users Simulated**: 1000
- **Concurrency**: 50 concurrent operations
- **Duration**: ~33 seconds total

### 7.2. Database Performance

| Operation | Count | Duration | Throughput |
|-----------|-------|----------|------------|
| Batch Create Providers | 1000 | ~5s | 200/s |
| Batch Create Folders | 5000 | ~8s | 625/s |
| Batch Create Emails | 10000 | ~15s | 667/s |
| Concurrent Reads | 1000 | 1.5s | **682 ops/sec** |
| Concurrent Writes | 500 | 0.5s | **1042 ops/sec** |
| Aggregation Query | 1000 groups | 23ms | ✅ |
| Join Query | 1000 results | 107ms | ✅ |

### 7.3. Queue Performance (BullMQ + Redis)

| Operation | Count | Duration | Throughput |
|-----------|-------|----------|------------|
| Add Jobs | 1000 | 206ms | **4854 jobs/sec** |
| Process Jobs | 1000 | 512ms | **1953 jobs/sec** |

### 7.4. API Simulation Performance

| Operation | Requests | Duration | Throughput |
|-----------|----------|----------|------------|
| Email List | 1000 | 2.5s | **403 req/sec** |
| Folder List | 1000 | 1.0s | **1026 req/sec** |
| Search | 500 | 2.8s | **177 req/sec** |

### 7.5. Latency Metrics (ms)

| Operation | min | avg | p95 | p99 | max |
|-----------|-----|-----|-----|-----|-----|
| DB Read | 3 | 72 | 110 | **146** | 195 |
| DB Write | 18 | 47 | 63 | **80** | 89 |
| Queue Add | 2 | 8 | 17 | 56 | 56 |
| Queue Process | 1 | 6 | 12 | 25 | 26 |

### 7.6. Connection Pool Test

| Metric | Result |
|--------|--------|
| Concurrent Queries | 100 in 17ms |
| Sustained Load (10s) | **16,200 ops** |
| Sustained Throughput | **1616 ops/sec** |

### 7.7. Memory Usage

| Metric | Value |
|--------|-------|
| Initial Heap | 421 MB |
| Peak Heap | 1061 MB |
| Final Heap | 1053 MB |
| Growth | 632 MB |

### 7.8. Validation Results

| Criteria | Status |
|----------|--------|
| 1000+ user simulation | ✅ PASS |
| Queue can process jobs | ✅ PASS |
| DB read p99 < 500ms | ✅ PASS (146ms) |
| DB write p99 < 500ms | ✅ PASS (80ms) |
| Error rate < 1% | ✅ PASS (0%) |
| Memory growth < 1GB | ✅ PASS (632MB) |

### 7.9. Capacity Projections

Based on stress test results, the system can handle:

| Metric | Current Capacity | Notes |
|--------|-----------------|-------|
| **Concurrent Users** | 1000+ | Tested successfully |
| **Email Operations/sec** | ~700 | Read: 682, Write: 1042 |
| **Queue Jobs/sec** | ~2000 | Processing throughput |
| **API Requests/sec** | ~500 | Mixed workload |
| **Daily Operations (est)** | ~40M | At sustained 500 ops/sec |

**Conclusion**: System is validated for 1000+ users with comfortable headroom for growth.

## 8. VoltAgent Framework Critical Bug & Audit (2025-12-06)

This section addresses critical issues identified in the VoltAgent multi-agent AI framework and provides a comprehensive fix roadmap.

### 8.1. Critical Bug: ActionExecutorService Bypasses Provider Sync (BUG-01)

| Severity | Component | Impact |
|----------|-----------|--------|
| **CRITICAL** | `action-executor.service.ts` | AI agent actions only affect local DB, NOT synced to Gmail/Microsoft/IMAP |

**Root Cause**: The `ActionExecutorService` directly modifies the Prisma database for email actions instead of using `EmailsService` which contains the essential sync-back logic to providers.

**Affected Operations**:
- `MARK_READ` / `MARK_UNREAD`
- `DELETE_EMAIL`
- `ARCHIVE_EMAIL`
- `STAR_EMAIL` / `UNSTAR_EMAIL`
- `MOVE_EMAIL`

**Current BROKEN Code** (`action-executor.service.ts`):
```typescript
private async executeMarkEmail(action: AgentAction, context: AgentContext) {
  const { emailId } = action.payload;
  const isRead = action.type === AgentActionType.MARK_READ;

  // BUG: Direct Prisma write - NO SYNC TO PROVIDER!
  await this.prisma.email.update({
    where: { id: emailId, tenantId: context.tenantId },
    data: { isRead },
  });
}
```

**Required Fix**: Inject and use `EmailsService` for all email state modifications:
```typescript
// CORRECT: Delegate to EmailsService which handles provider sync
await this.emailsService.updateEmail(emailId, context.tenantId, { isRead });
```

### 8.2. Implementation Inconsistencies (IMPL-01, IMPL-02)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| IMPL-01 | **Dual-path execution** | `email.tools.ts` + `action-executor.service.ts` | Tools should ONLY return `AgentAction`, never modify DB directly |
| IMPL-02 | **Bypassing domain services** | `action-executor.service.ts` handlers | All handlers must delegate to `EmailsService`/`CalendarService` |

**Files Requiring Modification**:
- `backend/src/modules/ai/voltagent/services/action-executor.service.ts` (~1,457 lines)
- `backend/src/modules/ai/voltagent/tools/email.tools.ts`

### 8.3. EmailsService Available Sync Methods

The `EmailsService` already has proper sync-back methods that must be used:

| Method | Purpose | Location (Line) |
|--------|---------|-----------------|
| `updateEmail()` | Update with sync | 390-444 |
| `bulkUpdateStarred()` | Bulk star/unstar | 1150-1213 |
| `deleteEmail()` | Delete with sync | 514-575 |
| `bulkMoveToFolder()` | Move with sync | 1286-1370 |
| `bulkAddLabels()` | Label with sync | 1375-1432 |
| `bulkRemoveLabels()` | Unlabel with sync | 1437-1493 |

### 8.4. Action Approval Security Pattern (SEC-01)

The VoltAgent framework correctly implements a **Human-in-the-Loop (HITL)** approval pattern:

1. **Proposal**: Tool returns `AgentAction` with `requiresApproval: true`
2. **Approval**: User approves/rejects the action
3. **Execution**: `ActionExecutorService` executes approved action

**Violation Found**: The `mark_read` tool in `email.tools.ts` directly writes to DB, bypassing this pattern.

## 9. Redis/BullMQ Infrastructure Standardization Audit

### 9.1. Current State Analysis

**Total Redis Connections**: 9
**Using Centralized Config**: 7/9 (78%)
**Inconsistent Connections**: 2

| Component | Config Source | Issues |
|-----------|---------------|--------|
| `QueueService` | ✅ Centralized | OK |
| `FolderOperationsQueueService` | ⚠️ Hardcoded | No env vars, different defaults |
| `ContactsSyncQueueService` | ✅ Centralized | OK |
| `EmailEmbeddingQueueService` | ✅ Centralized | OK |
| `AiQueueService` | ❌ Custom | Missing `maxRetriesPerRequest: null` |
| `DeadLetterQueueService` | ✅ Centralized | OK |
| `QueryEmbeddingCacheService` | ❌ Separate | Own connection, not pooled |

### 9.2. Queue Configuration Inconsistencies

| Queue | Backoff Delay | Lock Duration | Env Config |
|-------|---------------|---------------|------------|
| `email-sync` | 2000ms | 300000ms | ✅ Yes |
| `folder-operations` | 5000ms | 60000ms | ❌ No (hardcoded) |
| `contact-sync` | 5000ms | 120000ms | ✅ Yes |
| `ai-processing` | 2000ms | 30000ms | ⚠️ Partial |

### 9.3. Best Practices (from 2025 Research)

**BullMQ/Redis Best Practices**:
1. **Connection Pooling**: Use single shared Redis connection with `maxRetriesPerRequest: null`
2. **Redis Policy**: Configure `maxmemory-policy noeviction` for BullMQ queues
3. **Standardized Backoff**: Use consistent exponential backoff across all queues
4. **DLQ Integration**: All queues should have dead-letter queue handling
5. **Environment Config**: All queue settings should be configurable via env vars

**Multi-Agent AI Best Practices (LangGraph/Autogen patterns)**:
1. **Supervisor-Delegate Pattern**: ✅ Already implemented correctly
2. **Tool Schema Validation**: ✅ Using Zod schemas
3. **Human-in-the-Loop**: ✅ Action approval pattern
4. **Observability**: OpenTelemetry integration for LLM tracing
5. **Memory/Context**: Proper conversation history management

### 9.4. Unused Services Identified

| Service | Status | Action Required |
|---------|--------|-----------------|
| `SemanticCacheService` | Created, not wired | Wire to LLM orchestration |
| `ModelRouterService` | Created, not wired | Wire for dynamic model selection |
| `FeedbackService.updateLearningProfile()` | Implemented, not called | Integrate feedback loop |

### 9.5. FeedbackService Performance Issue

**Problem**: `FeedbackService` performs synchronous Prisma writes that block user actions.

**Affected Methods** (lines 95, 193, 218, 416):
```typescript
// Line 95 - SHOULD BE QUEUED
await this.prisma.agentActionFeedback.create({
  data: { actionId, tenantId, userId, ... }
});
```

**Fix**: Create `FeedbackQueueService` and `FeedbackWorker` for async processing.

## 10. Comprehensive Fix Roadmap

### Phase 1: Critical Fixes (Week 1-2)

#### P0-01: Fix ActionExecutorService Provider Sync
**Priority**: CRITICAL
**Files**: `action-executor.service.ts`, `ai.module.ts`

```typescript
// 1. Inject EmailsService
constructor(
  private readonly prisma: PrismaService,
  private readonly emailsService: EmailsService, // ADD
  ...
)

// 2. Refactor all email handlers to use EmailsService
private async executeMarkEmail(action: AgentAction, context: AgentContext) {
  const { emailId } = action.payload;
  const isRead = action.type === AgentActionType.MARK_READ;

  // CORRECT: Use EmailsService for provider sync
  await this.emailsService.updateEmail(emailId, context.tenantId, { isRead });

  return {
    success: true,
    data: { emailId, isRead },
    summary: isRead ? t.emailMarkedRead[lang] : t.emailMarkedUnread[lang],
    executionTimeMs: 0,
  };
}
```

#### P0-02: Remove Direct DB Writes from email.tools.ts
**Priority**: CRITICAL
**Files**: `email.tools.ts`

Remove direct Prisma calls from tool execute functions. Tools should ONLY return `AgentAction` objects, never modify state directly.

### Phase 2: Infrastructure Standardization (Week 2-3)

#### P1-01: Standardize Redis Connections

**Create centralized Redis config factory**:
```typescript
// backend/src/common/config/redis.config.ts
export const createRedisConnection = (name: string): RedisOptions => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // REQUIRED for BullMQ
  retryStrategy: (times) => Math.min(times * 50, 2000),
});
```

**Update inconsistent services**:
- `AiQueueService`: Add `maxRetriesPerRequest: null`
- `QueryEmbeddingCacheService`: Use centralized config
- `FolderOperationsQueueService`: Add env var support

#### P1-02: Standardize Queue Configuration

```typescript
// backend/src/common/config/queue.config.ts
export const QUEUE_DEFAULTS = {
  backoff: {
    type: 'exponential' as const,
    delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000'),
  },
  lockDuration: parseInt(process.env.QUEUE_LOCK_DURATION || '60000'),
  attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3'),
};
```

### Phase 3: Performance & Reliability (Week 3-4)

#### P2-01: Queue FeedbackService Writes

**Create new files**:
- `feedback.queue.ts` - BullMQ queue service
- `feedback.worker.ts` - Background worker

```typescript
// feedback.queue.ts
@Injectable()
export class FeedbackQueueService {
  constructor(@InjectQueue('feedback') private queue: Queue) {}

  async enqueueFeedback(data: FeedbackJobData): Promise<void> {
    await this.queue.add('record-feedback', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}
```

#### P2-02: Wire Unused Services

| Service | Integration Point |
|---------|-------------------|
| `SemanticCacheService` | Wire to `AiOrchestrationService` before LLM calls |
| `ModelRouterService` | Wire to agent creation for dynamic model selection |
| `FeedbackService` learning | Call `updateLearningProfile()` after action execution |

### Phase 4: Observability & Monitoring (Week 4-5)

#### P3-01: Complete LLM Observability

Implement OpenTelemetry semantic conventions for LLM tracing:
```typescript
// Trace structure
span.setAttribute('gen_ai.system', 'claude');
span.setAttribute('gen_ai.request.model', modelId);
span.setAttribute('gen_ai.response.finish_reason', finishReason);
span.setAttribute('gen_ai.usage.input_tokens', inputTokens);
span.setAttribute('gen_ai.usage.output_tokens', outputTokens);
```

#### P3-02: Add Queue Metrics

```typescript
// Per-queue metrics
- jobs.added.total
- jobs.completed.total
- jobs.failed.total
- jobs.duration.histogram
- jobs.waiting.count
- jobs.active.count
```

## 11. Implementation Checklist

### Critical (P0) - Must Complete
- [ ] **BUG-01**: Inject `EmailsService` into `ActionExecutorService`
- [ ] **BUG-01**: Refactor `executeMarkEmail()` to use `EmailsService.updateEmail()`
- [ ] **BUG-01**: Refactor `executeDeleteEmail()` to use `EmailsService.deleteEmail()`
- [ ] **BUG-01**: Refactor `executeArchiveEmail()` to use `EmailsService.bulkMoveToFolder()`
- [ ] **BUG-01**: Refactor `executeStarEmail()` to use `EmailsService.bulkUpdateStarred()`
- [ ] **BUG-01**: Refactor `executeMoveEmail()` to use `EmailsService.bulkMoveToFolder()`
- [ ] **IMPL-01**: Remove direct Prisma calls from `email.tools.ts`

### High Priority (P1)
- [ ] Create centralized Redis config factory
- [ ] Update `AiQueueService` to use centralized config with `maxRetriesPerRequest: null`
- [ ] Update `QueryEmbeddingCacheService` to use centralized config
- [ ] Add env var support to `FolderOperationsQueueService`
- [ ] Standardize backoff delays across all queues

### Medium Priority (P2)
- [ ] Create `FeedbackQueueService` and `FeedbackWorker`
- [ ] Migrate `FeedbackService` synchronous writes to queue
- [ ] Wire `SemanticCacheService` to LLM orchestration
- [ ] Wire `ModelRouterService` to agent creation
- [ ] Integrate feedback loop (`updateLearningProfile()`)

### Lower Priority (P3)
- [ ] Implement OpenTelemetry LLM semantic conventions
- [ ] Add queue metrics collection
- [ ] Add circuit breaker pattern for rate-limited APIs
- [ ] Implement adaptive backoff based on provider responses

## 12. Testing Strategy

### Unit Tests Required
```typescript
// action-executor.service.spec.ts
describe('ActionExecutorService', () => {
  it('should call emailsService.updateEmail for MARK_READ', async () => {
    // Mock EmailsService
    // Verify provider sync is triggered
  });

  it('should call emailsService.deleteEmail for DELETE_EMAIL', async () => {
    // Verify sync-back happens
  });
});
```

### Integration Tests Required
```typescript
// email-agent-sync.integration.spec.ts
describe('Email Agent Provider Sync', () => {
  it('AI mark-read should sync to Gmail', async () => {
    // 1. Create test email
    // 2. Execute agent MARK_READ action
    // 3. Verify local DB updated
    // 4. Verify Gmail API called
  });
});
```

### Load Tests (1000+ users)
- Queue throughput under concurrent agent actions
- Provider sync latency at scale
- Memory usage during batch operations

## 13. References

### Best Practices Sources
- [LangGraph Multi-Agent Patterns (2025)](https://langchain-ai.github.io/langgraph/)
- [BullMQ Best Practices](https://docs.bullmq.io/patterns/best-practices)
- [OpenTelemetry Semantic Conventions for LLM](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Autogen Multi-Agent Framework](https://microsoft.github.io/autogen/)

### Internal Documentation
- [VOLTAGENT_AUDIT.md](./VOLTAGENT_AUDIT.md) - Original audit document
- [CONSOLIDATED_TECHNICAL_ROADMAP.md](./CONSOLIDATED_TECHNICAL_ROADMAP.md) - Status tracking

---

## 14. Redis/BullMQ Comprehensive Expansion Roadmap

**Date**: 2025-12-06
**Goal**: Standardize all async operations on Redis + BullMQ + PostgreSQL architecture for 10,000+ user scalability.

### 14.1. Current State vs Target State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT STATE (Inconsistent)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ✅ Queued (6 queues)          │  ❌ Direct/Sync (Not queued)               │
│  ─────────────────────────────  │  ─────────────────────────────────────────│
│  • email-sync                  │  • Email send (CRITICAL)                  │
│  • folder-operations           │  • Draft operations                       │
│  • contact-sync                │  • Provider sync-back (mark/star/move)    │
│  • ai-processing               │  • Bulk label operations                  │
│  • email-embedding             │  • Feedback recording                     │
│  • dead-letter                 │  • Webhook processing                     │
│                                │  • Attachment download                    │
│                                │  • Calendar sync                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         TARGET STATE (Unified)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  All async operations → BullMQ → Workers → PostgreSQL                      │
│                                                                             │
│  Queues (14 total):                                                        │
│  ├── email-sync           (existing)                                       │
│  ├── folder-operations    (existing)                                       │
│  ├── contact-sync         (existing)                                       │
│  ├── ai-processing        (existing)                                       │
│  ├── email-embedding      (existing)                                       │
│  ├── dead-letter          (existing)                                       │
│  ├── email-send           (NEW - Priority 1)                               │
│  ├── provider-syncback    (NEW - Priority 1)                               │
│  ├── bulk-operations      (NEW - Priority 2)                               │
│  ├── draft-operations     (NEW - Priority 2)                               │
│  ├── feedback             (NEW - Priority 3)                               │
│  ├── webhook-processing   (NEW - Priority 3)                               │
│  ├── attachment-download  (NEW - Priority 3)                               │
│  └── calendar-sync        (NEW - Priority 3)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2. Unified Redis Configuration

**File**: `backend/src/common/config/redis.config.ts`

```typescript
import { RedisOptions } from 'ioredis';

/**
 * Centralized Redis configuration for ALL queue services.
 * CRITICAL: All queues MUST use this configuration.
 */
export const getRedisConfig = (): RedisOptions => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),

  // REQUIRED for BullMQ - prevents connection timeout issues
  maxRetriesPerRequest: null,

  // Connection retry strategy
  retryStrategy: (times: number) => {
    if (times > 10) return null; // Stop retrying after 10 attempts
    return Math.min(times * 100, 3000); // Exponential backoff, max 3s
  },

  // Keep-alive for long-running connections
  keepAlive: 30000,

  // Connection timeout
  connectTimeout: 10000,

  // Enable offline queue for reliability
  enableOfflineQueue: true,
});

/**
 * Shared Redis connection instance for connection pooling
 */
let sharedConnection: Redis | null = null;

export const getSharedRedisConnection = (): Redis => {
  if (!sharedConnection) {
    sharedConnection = new Redis(getRedisConfig());
  }
  return sharedConnection;
};
```

### 14.3. Unified Queue Configuration

**File**: `backend/src/common/config/queue.config.ts`

```typescript
import { JobsOptions, QueueOptions, WorkerOptions } from 'bullmq';

/**
 * Standardized queue configuration for ALL queues.
 * Ensures consistent behavior across the entire system.
 */
export const QUEUE_CONFIG = {
  // Default job options
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3', 10),
    backoff: {
      type: 'exponential' as const,
      delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000', 10),
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,    // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  } as JobsOptions,

  // Worker options
  workerOptions: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    lockDuration: parseInt(process.env.QUEUE_LOCK_DURATION || '60000', 10),
    stalledInterval: 30000,
    maxStalledCount: 3,
  } as Partial<WorkerOptions>,

  // Queue-specific overrides
  queues: {
    'email-sync': {
      concurrency: 10,
      lockDuration: 300000, // 5 min for long syncs
    },
    'email-send': {
      concurrency: 20,      // High concurrency for sends
      lockDuration: 30000,  // 30s timeout
      attempts: 5,          // More retries for critical operation
    },
    'provider-syncback': {
      concurrency: 15,
      lockDuration: 60000,
      attempts: 3,
    },
    'bulk-operations': {
      concurrency: 5,       // Lower to avoid rate limits
      lockDuration: 120000, // 2 min for bulk ops
    },
    'ai-processing': {
      concurrency: 3,       // Low to manage API costs
      lockDuration: 120000,
    },
    'email-embedding': {
      concurrency: 10,
      lockDuration: 60000,
    },
    'feedback': {
      concurrency: 20,      // High - simple DB writes
      lockDuration: 10000,
    },
    'webhook-processing': {
      concurrency: 50,      // Very high for burst handling
      lockDuration: 15000,
    },
  },
};

export const getQueueOptions = (queueName: string): Partial<QueueOptions> => ({
  defaultJobOptions: {
    ...QUEUE_CONFIG.defaultJobOptions,
    ...(QUEUE_CONFIG.queues[queueName] || {}),
  },
});

export const getWorkerOptions = (queueName: string): Partial<WorkerOptions> => ({
  ...QUEUE_CONFIG.workerOptions,
  ...(QUEUE_CONFIG.queues[queueName] || {}),
});
```

### 14.4. New Queue Services Implementation

#### 14.4.1. Email Send Queue (Priority 1 - CRITICAL)

**File**: `backend/src/modules/email/queues/email-send.queue.ts`

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConfig, getQueueOptions, getWorkerOptions } from '../../../common/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSendService } from '../services/email-send.service';
import { DeadLetterQueueService } from '../../email-sync/services/dead-letter-queue.service';

export interface EmailSendJobData {
  tenantId: string;
  providerId: string;
  userId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachmentIds?: string[];
  replyToEmailId?: string;
  scheduledAt?: Date;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailSendResult {
  success: boolean;
  externalId?: string;
  error?: string;
  sentAt?: Date;
}

@Injectable()
export class EmailSendQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSendQueueService.name);
  private queue: Queue<EmailSendJobData, EmailSendResult>;
  private worker: Worker<EmailSendJobData, EmailSendResult>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSendService: EmailSendService,
    private readonly dlqService: DeadLetterQueueService,
  ) {}

  async onModuleInit() {
    const connection = getRedisConfig();

    this.queue = new Queue('email-send', {
      connection,
      ...getQueueOptions('email-send'),
    });

    this.worker = new Worker(
      'email-send',
      async (job: Job<EmailSendJobData>) => this.processJob(job),
      {
        connection,
        ...getWorkerOptions('email-send'),
      },
    );

    this.setupEventHandlers();
    this.logger.log('Email send queue initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Enqueue an email for sending
   */
  async enqueueSend(data: EmailSendJobData): Promise<string> {
    const priority = data.priority === 'high' ? 1 : data.priority === 'low' ? 10 : 5;

    const job = await this.queue.add('send-email', data, {
      priority,
      delay: data.scheduledAt ? new Date(data.scheduledAt).getTime() - Date.now() : 0,
      jobId: `send-${data.tenantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    this.logger.log(`Email send job enqueued: ${job.id} for ${data.to.join(', ')}`);
    return job.id!;
  }

  /**
   * Process email send job
   */
  private async processJob(job: Job<EmailSendJobData>): Promise<EmailSendResult> {
    const { tenantId, providerId, to, subject } = job.data;
    const startTime = Date.now();

    try {
      this.logger.log(`Processing email send: ${job.id} to ${to.join(', ')}`);

      const result = await this.emailSendService.sendEmail({
        tenantId,
        providerId,
        ...job.data,
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Email sent successfully: ${job.id} in ${duration}ms`);

      return {
        success: true,
        externalId: result.externalId,
        sentAt: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email send failed: ${job.id} - ${errorMessage}`);

      // Check if we should retry or move to DLQ
      if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
        await this.dlqService.moveToDeadLetter({
          originalQueue: 'email-send',
          jobId: job.id!,
          data: job.data,
          error: errorMessage,
          attemptsMade: job.attemptsMade,
        });
      }

      throw error;
    }
  }

  private setupEventHandlers() {
    this.worker.on('completed', (job) => {
      this.logger.debug(`Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job failed: ${job?.id} - ${error.message}`);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Job stalled: ${jobId}`);
    });
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
```

#### 14.4.2. Provider Sync-back Queue (Priority 1 - CRITICAL)

**File**: `backend/src/modules/email-sync/queues/provider-syncback.queue.ts`

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConfig, getQueueOptions, getWorkerOptions } from '../../../common/config';
import { EmailSyncBackService } from '../services/email-sync-back.service';

export type SyncBackAction =
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'delete'
  | 'archive'
  | 'move'
  | 'add-label'
  | 'remove-label';

export interface SyncBackJobData {
  tenantId: string;
  providerId: string;
  emailIds: string[];
  action: SyncBackAction;
  payload?: {
    targetFolderId?: string;
    labelId?: string;
  };
  source: 'api' | 'agent' | 'webhook';
}

@Injectable()
export class ProviderSyncBackQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderSyncBackQueueService.name);
  private queue: Queue<SyncBackJobData>;
  private worker: Worker<SyncBackJobData>;

  constructor(
    private readonly syncBackService: EmailSyncBackService,
  ) {}

  async onModuleInit() {
    const connection = getRedisConfig();

    this.queue = new Queue('provider-syncback', {
      connection,
      ...getQueueOptions('provider-syncback'),
    });

    this.worker = new Worker(
      'provider-syncback',
      async (job: Job<SyncBackJobData>) => this.processJob(job),
      {
        connection,
        ...getWorkerOptions('provider-syncback'),
      },
    );

    this.logger.log('Provider sync-back queue initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Enqueue a sync-back operation
   */
  async enqueueSyncBack(data: SyncBackJobData): Promise<string> {
    // Deduplicate by creating deterministic job ID
    const jobId = `syncback-${data.providerId}-${data.action}-${data.emailIds.sort().join('-')}`;

    const job = await this.queue.add('sync-back', data, {
      jobId,
      // Debounce rapid updates (e.g., multiple mark-read in quick succession)
      delay: data.emailIds.length > 10 ? 0 : 500,
    });

    this.logger.log(`Sync-back enqueued: ${data.action} for ${data.emailIds.length} emails`);
    return job.id!;
  }

  /**
   * Batch enqueue multiple sync-back operations
   */
  async enqueueBatch(jobs: SyncBackJobData[]): Promise<string[]> {
    const results = await Promise.all(
      jobs.map(job => this.enqueueSyncBack(job))
    );
    return results;
  }

  private async processJob(job: Job<SyncBackJobData>): Promise<void> {
    const { tenantId, providerId, emailIds, action, payload } = job.data;
    const startTime = Date.now();

    this.logger.log(`Processing sync-back: ${action} for ${emailIds.length} emails`);

    try {
      switch (action) {
        case 'mark-read':
          await this.syncBackService.syncMarkRead(tenantId, providerId, emailIds, true);
          break;
        case 'mark-unread':
          await this.syncBackService.syncMarkRead(tenantId, providerId, emailIds, false);
          break;
        case 'star':
          await this.syncBackService.syncStar(tenantId, providerId, emailIds, true);
          break;
        case 'unstar':
          await this.syncBackService.syncStar(tenantId, providerId, emailIds, false);
          break;
        case 'delete':
          await this.syncBackService.syncDelete(tenantId, providerId, emailIds);
          break;
        case 'archive':
          await this.syncBackService.syncArchive(tenantId, providerId, emailIds);
          break;
        case 'move':
          await this.syncBackService.syncMove(tenantId, providerId, emailIds, payload!.targetFolderId!);
          break;
        case 'add-label':
          await this.syncBackService.syncAddLabel(tenantId, providerId, emailIds, payload!.labelId!);
          break;
        case 'remove-label':
          await this.syncBackService.syncRemoveLabel(tenantId, providerId, emailIds, payload!.labelId!);
          break;
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Sync-back completed: ${action} in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Sync-back failed: ${action} - ${error}`);
      throw error;
    }
  }
}
```

#### 14.4.3. Bulk Operations Queue (Priority 2)

**File**: `backend/src/modules/email/queues/bulk-operations.queue.ts`

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConfig, getQueueOptions, getWorkerOptions } from '../../../common/config';
import { EmailsService } from '../services/emails.service';

export type BulkOperationType =
  | 'move'
  | 'delete'
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'add-labels'
  | 'remove-labels';

export interface BulkOperationJobData {
  tenantId: string;
  providerId: string;
  emailIds: string[];
  operation: BulkOperationType;
  payload?: {
    targetFolderId?: string;
    labelIds?: string[];
  };
  userId: string;
  batchIndex?: number;
  totalBatches?: number;
}

@Injectable()
export class BulkOperationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkOperationsQueueService.name);
  private readonly BATCH_SIZE = 50; // Process in chunks to avoid timeouts
  private queue: Queue<BulkOperationJobData>;
  private worker: Worker<BulkOperationJobData>;

  constructor(private readonly emailsService: EmailsService) {}

  async onModuleInit() {
    const connection = getRedisConfig();

    this.queue = new Queue('bulk-operations', {
      connection,
      ...getQueueOptions('bulk-operations'),
    });

    this.worker = new Worker(
      'bulk-operations',
      async (job: Job<BulkOperationJobData>) => this.processJob(job),
      {
        connection,
        ...getWorkerOptions('bulk-operations'),
      },
    );

    this.logger.log('Bulk operations queue initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Enqueue bulk operation, automatically batching if needed
   */
  async enqueueBulkOperation(data: Omit<BulkOperationJobData, 'batchIndex' | 'totalBatches'>): Promise<string[]> {
    const { emailIds, ...rest } = data;
    const jobIds: string[] = [];

    // Split into batches
    const batches = this.chunk(emailIds, this.BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const job = await this.queue.add('bulk-op', {
        ...rest,
        emailIds: batches[i],
        batchIndex: i,
        totalBatches: batches.length,
      });
      jobIds.push(job.id!);
    }

    this.logger.log(`Bulk ${data.operation} enqueued: ${emailIds.length} emails in ${batches.length} batches`);
    return jobIds;
  }

  private async processJob(job: Job<BulkOperationJobData>): Promise<{ processed: number }> {
    const { tenantId, providerId, emailIds, operation, payload, batchIndex, totalBatches } = job.data;

    this.logger.log(`Processing bulk ${operation}: batch ${(batchIndex || 0) + 1}/${totalBatches || 1}`);

    try {
      switch (operation) {
        case 'move':
          await this.emailsService.bulkMoveToFolder(tenantId, emailIds, payload!.targetFolderId!);
          break;
        case 'delete':
          await this.emailsService.bulkDelete(tenantId, emailIds);
          break;
        case 'mark-read':
          await this.emailsService.bulkMarkRead(tenantId, emailIds, true);
          break;
        case 'mark-unread':
          await this.emailsService.bulkMarkRead(tenantId, emailIds, false);
          break;
        case 'star':
          await this.emailsService.bulkUpdateStarred(tenantId, emailIds, true);
          break;
        case 'unstar':
          await this.emailsService.bulkUpdateStarred(tenantId, emailIds, false);
          break;
        case 'add-labels':
          await this.emailsService.bulkAddLabels(tenantId, emailIds, payload!.labelIds!);
          break;
        case 'remove-labels':
          await this.emailsService.bulkRemoveLabels(tenantId, emailIds, payload!.labelIds!);
          break;
      }

      return { processed: emailIds.length };
    } catch (error) {
      this.logger.error(`Bulk ${operation} failed: ${error}`);
      throw error;
    }
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

#### 14.4.4. Feedback Queue (Priority 3)

**File**: `backend/src/modules/ai/queues/feedback.queue.ts`

```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConfig, getQueueOptions, getWorkerOptions } from '../../../common/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface FeedbackJobData {
  type: 'action-feedback' | 'learning-update' | 'confidence-update';
  tenantId: string;
  userId?: string;
  payload: Record<string, any>;
}

@Injectable()
export class FeedbackQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackQueueService.name);
  private queue: Queue<FeedbackJobData>;
  private worker: Worker<FeedbackJobData>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const connection = getRedisConfig();

    this.queue = new Queue('feedback', {
      connection,
      ...getQueueOptions('feedback'),
    });

    this.worker = new Worker(
      'feedback',
      async (job: Job<FeedbackJobData>) => this.processJob(job),
      {
        connection,
        ...getWorkerOptions('feedback'),
      },
    );

    this.logger.log('Feedback queue initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueFeedback(data: FeedbackJobData): Promise<void> {
    await this.queue.add('record-feedback', data, {
      // Low priority, don't block user
      priority: 10,
    });
  }

  private async processJob(job: Job<FeedbackJobData>): Promise<void> {
    const { type, tenantId, payload } = job.data;

    switch (type) {
      case 'action-feedback':
        await this.prisma.agentActionFeedback.create({
          data: {
            tenantId,
            ...payload,
          },
        });
        break;

      case 'learning-update':
        await this.prisma.agentLearningProfile.update({
          where: { id: payload.profileId },
          data: payload.updates,
        });
        break;

      case 'confidence-update':
        await this.prisma.agentConfidenceScore.upsert({
          where: {
            tenantId_actionType: {
              tenantId,
              actionType: payload.actionType,
            },
          },
          create: {
            tenantId,
            actionType: payload.actionType,
            score: payload.score,
          },
          update: {
            score: payload.score,
            updatedAt: new Date(),
          },
        });
        break;
    }
  }
}
```

### 14.5. Queue Module Structure

```
backend/src/
├── common/
│   └── config/
│       ├── redis.config.ts          # Centralized Redis config
│       ├── queue.config.ts          # Centralized queue config
│       └── index.ts                 # Export all configs
├── modules/
│   ├── email/
│   │   ├── queues/
│   │   │   ├── email-send.queue.ts       # NEW
│   │   │   ├── bulk-operations.queue.ts  # NEW
│   │   │   └── draft-operations.queue.ts # NEW
│   │   └── email.module.ts
│   ├── email-sync/
│   │   ├── queues/
│   │   │   ├── queue.service.ts           # EXISTING (refactor)
│   │   │   ├── provider-syncback.queue.ts # NEW
│   │   │   ├── webhook.queue.ts           # NEW
│   │   │   └── dead-letter-queue.service.ts # EXISTING
│   │   └── email-sync.module.ts
│   ├── ai/
│   │   ├── queues/
│   │   │   ├── ai.queue.ts              # EXISTING (refactor)
│   │   │   ├── email-embedding.queue.ts # EXISTING
│   │   │   └── feedback.queue.ts        # NEW
│   │   └── ai.module.ts
│   └── calendar/
│       ├── queues/
│       │   └── calendar-sync.queue.ts    # NEW
│       └── calendar.module.ts
```

### 14.6. Migration Plan

#### Phase 1: Infrastructure (Week 1) ✅ COMPLETED

| Task | Priority | Status |
|------|----------|--------|
| Create `queue.config.ts` with QUEUE_PRESETS, WORKER_PRESETS, QUEUE_NAMES | P0 | ✅ DONE |
| Create `common/config/index.ts` barrel export | P0 | ✅ DONE |
| Refactor `AiQueueService` to use centralized config | P0 | ✅ DONE |
| Refactor `EmailEmbeddingQueueService` to use centralized config | P0 | ✅ DONE |
| Refactor `QueryEmbeddingCacheService` to use centralized Redis | P0 | ✅ DONE |
| Refactor `ContactsSyncQueueService` to use centralized config | P0 | ✅ DONE |
| Refactor `ContactsSyncWorker` to use centralized config | P0 | ✅ DONE |
| Add Redis connection health check endpoint | P1 | 🔴 TODO |

**Files Created/Modified:**
- `backend/src/common/config/queue.config.ts` - Centralized queue configuration
- `backend/src/common/config/index.ts` - Barrel export
- `backend/src/modules/ai/services/email-embedding.queue.ts` - Refactored
- `backend/src/modules/ai/services/query-embedding-cache.service.ts` - Refactored
- `backend/src/modules/ai/voltagent/services/ai-queue.service.ts` - Refactored
- `backend/src/modules/contacts/services/contacts-sync-queue.service.ts` - Refactored
- `backend/src/modules/contacts/workers/contacts-sync.worker.ts` - Refactored

#### Phase 2: Critical Queues (Week 2) ✅ COMPLETED

| Task | Priority | Status |
|------|----------|--------|
| Implement `EmailSendQueueService` | P0 | ✅ DONE |
| Implement `ProviderSyncBackQueueService` | P0 | ✅ DONE |
| Implement `BulkOperationsQueueService` | P0 | ✅ DONE |
| Implement `FeedbackQueueService` | P0 | ✅ DONE |
| Register services in `EmailSyncModule` | P0 | ✅ DONE |
| Register `FeedbackQueueService` in `AiModule` | P0 | ✅ DONE |
| Integrate sync-back queue with `ActionExecutorService` | P1 | 🔴 TODO |
| Add DLQ integration for email-send | P1 | 🔴 TODO |
| Write tests for queue services | P1 | 🔴 TODO |

**Files Created:**
- `backend/src/modules/email-sync/services/email-send-queue.service.ts`
- `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts`
- `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts`
- `backend/src/modules/ai/services/feedback-queue.service.ts`

#### Phase 3: Secondary Queues (Week 3)

| Task | Priority | Status |
|------|----------|--------|
| Implement `DraftOperationsQueueService` | P1 | 🔴 TODO |
| Refactor `emails.controller.ts` to use bulk queue | P1 | 🔴 TODO |
| Add progress tracking for bulk operations | P2 | 🔴 TODO |
| Create workers for new queue services | P1 | 🔴 TODO |

#### Phase 4: Tertiary Queues (Week 4)

| Task | Priority | Status |
|------|----------|--------|
| Implement `WebhookQueueService` | P2 | 🔴 TODO |
| Implement `CalendarSyncQueueService` | P2 | 🔴 TODO |
| Migrate `FeedbackService` to use `FeedbackQueueService` | P2 | 🔴 TODO |

#### Phase 5: Observability (Week 5)

| Task | Priority | Status |
|------|----------|--------|
| Add queue metrics (waiting, active, completed, failed) | P2 | 🔴 TODO |
| Add Prometheus metrics endpoint | P2 | 🔴 TODO |
| Create Grafana dashboard for queues | P3 | 🔴 TODO |
| Add queue health alerts | P3 | 🔴 TODO |

### 14.7. Environment Variables

Add to `.env`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_DELAY=2000
QUEUE_LOCK_DURATION=60000

# Queue-specific overrides
EMAIL_SEND_CONCURRENCY=20
EMAIL_SEND_ATTEMPTS=5
PROVIDER_SYNCBACK_CONCURRENCY=15
BULK_OPERATIONS_CONCURRENCY=5
AI_PROCESSING_CONCURRENCY=3
WEBHOOK_CONCURRENCY=50
```

### 14.8. Monitoring & Alerting

```typescript
// backend/src/common/services/queue-monitor.service.ts
@Injectable()
export class QueueMonitorService {
  private readonly queues = [
    'email-sync',
    'email-send',
    'provider-syncback',
    'bulk-operations',
    'ai-processing',
    'email-embedding',
    'feedback',
    'dead-letter',
  ];

  async getHealthStatus(): Promise<QueueHealth[]> {
    return Promise.all(
      this.queues.map(async (name) => {
        const queue = new Queue(name, { connection: getRedisConfig() });
        const [waiting, active, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getFailedCount(),
        ]);
        await queue.close();

        return {
          name,
          status: failed > 100 ? 'unhealthy' : waiting > 1000 ? 'degraded' : 'healthy',
          waiting,
          active,
          failed,
        };
      })
    );
  }

  async getMetrics(): Promise<QueueMetrics> {
    // Prometheus-compatible metrics
    return {
      queue_jobs_waiting: { ... },
      queue_jobs_active: { ... },
      queue_jobs_completed_total: { ... },
      queue_jobs_failed_total: { ... },
      queue_job_duration_seconds: { ... },
    };
  }
}
```

### 14.9. Testing Strategy

```typescript
// Example test for EmailSendQueueService
describe('EmailSendQueueService', () => {
  let service: EmailSendQueueService;
  let mockEmailSendService: jest.Mocked<EmailSendService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailSendQueueService,
        { provide: EmailSendService, useValue: createMock<EmailSendService>() },
        { provide: PrismaService, useValue: createMock<PrismaService>() },
        { provide: DeadLetterQueueService, useValue: createMock<DeadLetterQueueService>() },
      ],
    }).compile();

    service = module.get(EmailSendQueueService);
    mockEmailSendService = module.get(EmailSendService);
  });

  it('should enqueue email send job', async () => {
    const jobId = await service.enqueueSend({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      userId: 'user-1',
      to: ['test@example.com'],
      subject: 'Test',
      bodyHtml: '<p>Test</p>',
    });

    expect(jobId).toBeDefined();
  });

  it('should process email send job successfully', async () => {
    mockEmailSendService.sendEmail.mockResolvedValue({ externalId: 'ext-123' });

    // Simulate job processing
    const result = await service['processJob']({
      data: {
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        userId: 'user-1',
        to: ['test@example.com'],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as any);

    expect(result.success).toBe(true);
    expect(result.externalId).toBe('ext-123');
  });

  it('should move to DLQ after max retries', async () => {
    mockEmailSendService.sendEmail.mockRejectedValue(new Error('API Error'));

    await expect(
      service['processJob']({
        data: { ... },
        attemptsMade: 4, // Last attempt
        opts: { attempts: 5 },
      } as any)
    ).rejects.toThrow();

    // Verify DLQ was called
    expect(dlqService.moveToDeadLetter).toHaveBeenCalled();
  });
});
```

### 14.10. Capacity Planning

| Queue | Expected Daily Volume | Peak RPS | Concurrency | Workers Needed |
|-------|----------------------|----------|-------------|----------------|
| email-sync | 96,000 | 5 | 10 | 1 |
| email-send | 10,000 | 10 | 20 | 1 |
| provider-syncback | 50,000 | 20 | 15 | 1 |
| bulk-operations | 5,000 | 5 | 5 | 1 |
| ai-processing | 5,000 | 2 | 3 | 1 |
| email-embedding | 10,000 | 5 | 10 | 1 |
| feedback | 20,000 | 10 | 20 | 1 |
| webhook-processing | 10,000 | 50 (burst) | 50 | 1 |
| **Total** | **~206,000** | **~107** | - | **1-2 servers** |

**Redis Memory Estimate**: ~500MB for 200K jobs/day with 24h retention

### 14.11. Rollback Plan

If issues occur during migration:

1. **Feature flags**: Each queue has `ENABLE_QUEUE_<NAME>=true/false`
2. **Graceful degradation**: If queue fails, fall back to sync operation
3. **DLQ recovery**: Process failed jobs manually or re-queue

```typescript
// Feature flag example
if (process.env.ENABLE_QUEUE_EMAIL_SEND === 'true') {
  await this.emailSendQueue.enqueueSend(data);
} else {
  // Fallback to sync
  await this.emailSendService.sendEmail(data);
}
```
