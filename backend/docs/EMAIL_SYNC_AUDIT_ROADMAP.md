# Email Sync Module Audit Roadmap

**Audit Date**: 2025-01-05
**Modules Audited**: 5
**Total Issues Found**: 164
**Estimated Total Effort**: 80-112 hours

---

## Executive Summary

| Module | Score | Critical | High | Medium | Low | Effort |
|--------|-------|----------|------|--------|-----|--------|
| google.driver.ts | 6.5/10 | 5 | 8 | 12 | 7 | 16-20h |
| microsoft.driver.ts | 6.5/10 | 5 | 7 | 8 | 5 | 16-20h |
| base-email-sync.service.ts | 5.5/10 | 5 | 6 | 10 | 10 | 24-32h |
| folder-sync.service.ts | 5/10 | 7 | 8 | 7 | 5 | 16h |
| imap.driver.ts | 6/10 | 5 | 8 | 12 | 6 | 24-32h |

---

## Phase 1: CRITICAL FIXES (Week 1)

### 1.1 Missing Retry Wrappers - ALL DRIVERS

**Impact**: API calls fail permanently on 429/5xx errors

| Driver | Method | Line | Status |
|--------|--------|------|--------|
| Google | moveMessage (final modify) | 363-370 | TODO |
| Google | deleteMessage | 398-407 | TODO |
| Google | setReadStatus | 414-424 | TODO |
| Google | setStarredStatus | 427-437 | TODO |
| Google | setFlaggedStatus | 440-450 | TODO |
| Google | addLabels | 460-466 | TODO |
| Google | removeLabels | 469-478 | TODO |
| Google | batchSetReadStatus | 675-697 | TODO |
| Google | batchMoveMessages | 705-712 | TODO |
| Google | batchDeleteMessages | 715-732 | TODO |
| Google | getAttachment (both calls) | 498-528 | TODO |
| Google | getUserInfo | 537-543 | TODO |
| Google | getEmailAliases | 550-563 | TODO |
| Microsoft | moveMessage | 430-432 | TODO |
| Microsoft | copyMessage | 440-442 | TODO |
| Microsoft | deleteMessage | 451-457 | TODO |
| Microsoft | setReadStatus | 468 | TODO |
| Microsoft | setStarredStatus | 474-478 | TODO |
| Microsoft | setFlaggedStatus | 484-486 | TODO |
| Microsoft | addLabels | 498-506 | TODO |
| Microsoft | removeLabels | 514-522 | TODO |

**Fix Pattern**:
```typescript
await this.executeWithRetry(
  () => this.api.operation(...),
  'operationName',
);
```

**Effort**: 4 hours

---

### 1.2 Unbounded Memory Growth

| Module | Issue | Line | Fix |
|--------|-------|------|-----|
| Google | getChangesSince - changes array unbounded | 767-843 | Add MAX_CHANGES=10000 limit |
| Microsoft | fetchAllPages - items array unbounded | 968-1001 | Add MAX_ITEMS=1000 limit |
| base-email-sync | processedExternalIds Set unbounded | 356, 465 | Use LRU cache with 100k limit |
| IMAP | batchGetMessages - messages array unbounded | 1070-1108 | Limit to 100 messages |

**Effort**: 3 hours

---

### 1.3 Connection/Token Failures Return Expired State

| Module | Issue | Line | Fix |
|--------|-------|------|-----|
| Google | connect() swallows profile fetch failure | 56-61 | Throw on 401/403 |
| base-email-sync | refreshDriverIfNeeded returns expired driver | 286-292 | Throw instead of return |
| Microsoft | 30s hardcoded timeout causes cascade failures | 52 | Make configurable per operation |

**Effort**: 2 hours

---

### 1.4 Redis Lock Failures Proceed Without Lock

| Module | Issue | Line | Fix |
|--------|-------|------|-----|
| base-email-sync | Lock failure falls back to no lock | 947-957 | Throw error, require lock |
| base-email-sync | redisLock can be null | 38, 939-945 | Make required in constructor |

**Effort**: 2 hours

---

### 1.5 P2034/P2002 Prisma Retry Missing

| Module | Issue | Line | Fix | Status |
|--------|-------|------|-----|--------|
| folder-sync | IMAP folder upserts no P2034 | 355 | Added P2034 to retry | ✅ DONE |
| folder-sync | Parent folder updates no retry | 387-410 | Full retry wrapper | ✅ DONE |
| folder-sync | Gmail label upserts no retry | 491-530 | Full retry wrapper | ✅ DONE |
| folder-sync | Microsoft folder upserts no retry | 591-640 | Full retry wrapper | ✅ DONE |
| folder-sync | Unbounded transaction array | 836-843 | Chunk into batches of 50 | TODO |

**Effort**: 3 hours (4/5 done)

---

### 1.6 IMAP Critical Issues

| Issue | Line | Fix |
|-------|------|-----|
| Connection pool corruption - semaphore desync | 515-523 | Fix cleanup timing |
| Memory leak - event listeners never removed | 1498-1574 | Add removeAllListeners in cleanup |
| Race condition - handlers after mailboxOpen | 252-257 | Setup handlers before connect |
| Silent error swallowing in folder delete | 747-776 | Add error logging |

**Effort**: 4 hours

---

## Phase 2: HIGH PRIORITY FIXES (Week 2)

### 2.1 Batch Response Validation Missing

| Module | Method | Issue |
|--------|--------|-------|
| Microsoft | batchSetReadStatus | No response validation - partial failures silent |
| Microsoft | batchMoveMessages | Same |
| Microsoft | batchDeleteMessages | Same |
| Google | batchGetMessages | Returns partial success without caller notification |

**Fix**: Validate `response.data.responses[].status`, track failures, throw if >20% fail

**Effort**: 4 hours

---

### 2.2 Cache Invalidation Issues

| Module | Issue | Line |
|--------|-------|------|
| Microsoft | getFolder returns null on 404, doesn't clean cache | 196-222 |
| Microsoft | Folder cache race condition on mutations | 238-241, 253-256 |
| IMAP | Folder cache never invalidated on rename | 847 |

**Effort**: 3 hours

---

### 2.3 Input Validation Missing

| Module | Method | Issue |
|--------|--------|-------|
| Google | createFolder | No name validation - injection risk |
| Google | renameFolder | Same |
| Google | composeToRaw | No 35MB size validation |
| Google | parseEmailAddress | Weak email validation |
| Microsoft | listMessages | pageSize not capped |
| Microsoft | composeToGraphMessage | No email address validation |
| folder-sync | createImapFolder | No parentPath validation |

**Effort**: 4 hours

---

### 2.4 Operation Timeouts Missing

| Module | Issue | Line |
|--------|-------|------|
| base-email-sync | driver.listMessages has no timeout | 367-413 |
| base-email-sync | Attachment processing blocks transaction | 1178-1188 |
| IMAP | Stream consumption has no size limit | 1510-1574 |

**Effort**: 3 hours

---

### 2.5 Silent Error Swallowing

| Module | Method | Line | Issue |
|--------|--------|------|-------|
| Microsoft | listChildFolders | 189-191 | Returns partial data |
| IMAP | search fallback | 872-878 | No error logging |
| IMAP | saveSentMessage | 2108-2118 | User unaware of failure |
| folder-sync | updateFolderCounts | 688-693 | Returns null, caller doesn't check |

**Effort**: 3 hours

---

### 2.6 Race Conditions

| Module | Issue | Line |
|--------|-------|------|
| base-email-sync | wasNew detection unreliable | 1063-1076 |
| folder-sync | CRUD uses different lock key than sync | Various |
| folder-sync | auditFolderSync has no lock | 905-1012 |

**Effort**: 4 hours

---

## Phase 3: MEDIUM PRIORITY (Week 3-4)

### 3.1 Hardcoded Values to Externalize

| Module | Value | Line | Suggested Config |
|--------|-------|------|------------------|
| Google | CONCURRENT_LIMIT = 5 | 593 | `GOOGLE_BATCH_CONCURRENCY` |
| Google | MAX_PAGES = 25 | 770 | `GOOGLE_MAX_DELTA_PAGES` |
| Microsoft | MAX_PAGES = 50 | 647, 975 | `MS_GRAPH_MAX_PAGES` |
| Microsoft | timeout = 30000 | 52 | `MS_GRAPH_TIMEOUT_MS` |
| Microsoft | BATCH_SIZE = 10 | 791 | `MS_BATCH_SIZE` |
| base-email-sync | 5 minute user mod window | 763-765 | `USER_MOD_WINDOW_MS` |
| base-email-sync | TOKEN_CHECK_INTERVAL = 50 | 495 | Config |
| folder-sync | PARALLEL_FOLDER_BATCH_SIZE = 10 | 40 | Config |
| IMAP | 29 minutes IDLE timeout | 246 | Constant with RFC comment |

**Effort**: 3 hours

---

### 3.2 Missing Deduplication

| Module | Issue | Line |
|--------|-------|------|
| Google | getChangesSince - weak dedup check | 817-825 |
| Microsoft | getChangesSince - no dedup | 676-769 |

**Effort**: 2 hours

---

### 3.3 Missing Circuit Breakers

| Module | Service | Issue |
|--------|---------|-------|
| base-email-sync | followUpService | No circuit breaker |
| base-email-sync | writingStyleService | No circuit breaker |
| base-email-sync | embeddingQueue | No circuit breaker |
| Microsoft | Circuit breaker state not persisted | In-memory only |

**Effort**: 4 hours

---

### 3.4 Performance Optimizations

| Module | Issue | Fix |
|--------|-------|-----|
| Google | No quota tracking | Add proactive throttling |
| Google | No exponential backoff in batching | Add backoff on rate limit |
| IMAP | listMessages searches all then paginates | Use UID ranges |
| IMAP | resolveFolder is linear search | Cache folder type map |
| folder-sync | getFolderKeys inefficient string ops | Single pass optimization |

**Effort**: 6 hours

---

### 3.5 Missing Cleanup on Delete

| Module | Issue | Line |
|--------|-------|------|
| base-email-sync | Email delete doesn't clean attachments/embeddings | 680-686 |
| folder-sync | Folder delete assumes TRASH exists | 1214 |

**Effort**: 2 hours

---

### 3.6 Missing Telemetry/Metrics

All modules lack:
- Operation duration tracking
- Error rate metrics
- Quota usage tracking
- P50/P95/P99 latency

**Effort**: 8 hours

---

## Phase 4: LOW PRIORITY / TECH DEBT (Ongoing)

### 4.1 Type Safety Issues

| Module | Issue | Line |
|--------|-------|------|
| Microsoft | `(this.prisma as any)` casts | Multiple |
| folder-sync | Same dangerous casts | 426, 449, 469, etc |
| IMAP | `as any` bypassing TypeScript | 342, 485, 510 |

### 4.2 Inconsistent Logging

- Mix of `warn`, `error`, `debug` for similar issues
- Missing context (tenantId, providerId) in error logs
- Some debug logs may leak sensitive info

### 4.3 Code Organization

- **base-email-sync.service.ts**: 1258 lines - GOD CLASS
- **folder-sync.service.ts**: 1547 lines - OVER 500 LINE LIMIT
- **imap.driver.ts**: Large file with multiple responsibilities

**Refactoring needed**:
- Extract `AIServiceCoordinator` from base-email-sync
- Extract `EmailBatchProcessor` from base-email-sync
- Split folder-sync into `FolderSyncService` + `FolderCrudService` + `FolderAuditService`
- Split IMAP into connection pool manager + operations

### 4.4 Dead Code / Stale Comments

- base-email-sync lines 1198-1206: "DELETED" comments
- Various TODO comments without tracking

---

## Security Issues

| Priority | Module | Issue | Fix |
|----------|--------|-------|-----|
| HIGH | IMAP | No rate limiting on connection creation | Add global limit |
| MED | IMAP | No TLS version enforcement | Add `minVersion: 'TLSv1.2'` |
| MED | IMAP | Password may leak in debug logs | Never log auth state |
| MED | Microsoft | Delta token validation weak | Parse and validate URL components |
| LOW | Google | No User-Agent header | Add for tracking |

---

## Completed Fixes (This Session)

| Issue | Module | Status |
|-------|--------|--------|
| CRIT-1 | google.driver.ts | DONE - Batch error accumulation |
| CRIT-2 | microsoft.driver.ts | DONE - Batch error accumulation |
| CRIT-3 | base-email-sync | DONE - Follow-up error logging upgraded |
| CRIT-4 | folder-sync | DONE - Lock TTL 60s -> 300s |
| CRIT-5 | folder-sync | DONE - Deleted folder emails -> TRASH |
| HIGH-4 | google.driver.ts | DONE - moveMessage/copyMessage retry |
| HIGH-5 | microsoft.driver.ts | DONE - sendDraft retry |
| Follow-up storm | base-email-sync | DONE - Recency check (7 days) |
| **Phase 1.1** | google.driver.ts | DONE - ALL 20 retry wrappers added |
| **Phase 1.1** | microsoft.driver.ts | DONE - ALL 15 retry wrappers added |
| **Phase 1.2** | google.driver.ts | DONE - MAX_CHANGES=10000 limit |
| **Phase 1.2** | microsoft.driver.ts | DONE - MAX_ITEMS=5000 limit |
| **Phase 1.5** | folder-sync.service.ts | DONE - P2034 retry on IMAP upserts (line 355) |
| **Phase 1.5** | folder-sync.service.ts | DONE - P2034 retry on parent updates (lines 387-410) |
| **Phase 1.5** | folder-sync.service.ts | DONE - P2034 retry on Gmail upserts (lines 491-530) |
| **Phase 1.5** | folder-sync.service.ts | DONE - P2034 retry on Microsoft upserts (lines 591-640) |
| **Phase 1.5** | folder-sync.service.ts | DONE - Transaction chunking (BATCH_SIZE=50) |
| **Phase 1.3** | google.driver.ts | DONE - Connect throws on 401/403 auth errors |
| **Phase 1.3** | base-email-sync.service.ts | DONE - refreshDriverIfNeeded throws on failure |
| **Phase 1.4** | base-email-sync.service.ts | DONE - Redis lock required, throws on failure |
| **Phase 1.6** | imap.driver.ts | DONE - Silent error swallowing → debug logging |
| **Phase 2.1** | microsoft.driver.ts | DONE - batchSetReadStatus response validation |
| **Phase 2.1** | microsoft.driver.ts | DONE - batchMoveMessages response validation |
| **Phase 2.1** | microsoft.driver.ts | DONE - batchDeleteMessages response validation |
| **Phase 2.2** | microsoft.driver.ts | DONE - Cache already properly invalidated |
| **Phase 2.2** | imap.driver.ts | DONE - Folder cache cleared on rename |
| **Phase 2.3** | google.driver.ts | DONE - createFolder/renameFolder name validation |
| **Phase 2.3** | google.driver.ts | DONE - listMessages pageSize capped (500) |
| **Phase 2.3** | microsoft.driver.ts | DONE - listMessages pageSize capped (500) |
| **Phase 2.4** | imap.driver.ts | VERIFIED - Stream timeout (60s) already exists |
| **Phase 2.4** | microsoft.driver.ts | VERIFIED - Axios timeout (30s) already exists |
| **Phase 2.5** | imap.driver.ts | DONE - Search fallback now logs error before fallback |
| **Phase 2.5** | imap.driver.ts | VERIFIED - saveSentMessage already has proper warn logging |
| **Phase 2.5** | folder-sync.service.ts | VERIFIED - No silent errors found in updateFolderCounts |
| **Phase 2.6** | folder-sync.service.ts | VERIFIED - RC-A1 has Redis lock (syncProviderFolders line 61) |
| **Phase 2.6** | folder-sync.service.ts | VERIFIED - RC-A8 has Redis locks (CRUD lines 1118, 1173, 1235) |

---

## Effort Summary

| Phase | Issues | Hours | Priority |
|-------|--------|-------|----------|
| Phase 1 | 25 | 18-20h | CRITICAL - Week 1 |
| Phase 2 | 22 | 21-24h | HIGH - Week 2 |
| Phase 3 | 18 | 25-28h | MEDIUM - Week 3-4 |
| Phase 4 | 15 | 16-20h | LOW - Ongoing |
| **Total** | **80** | **80-92h** | |

---

## Next Actions

1. **Immediate**: Fix all retry wrapper missing issues (Phase 1.1)
2. **This week**: Complete all Phase 1 critical fixes
3. **Next week**: Phase 2 high priority fixes
4. **Sprint 2**: Phase 3 medium priority + start refactoring
5. **Ongoing**: Phase 4 tech debt reduction

---

## References

- [EMAIL_CONSOLIDATION_ENTRY.md](./EMAIL_CONSOLIDATION_ENTRY.md) - Phase timeline
- [EMAIL_CONSOLIDATION_ROADMAP.md](./EMAIL_CONSOLIDATION_ROADMAP.md) - Detailed implementation
- [EMAIL_MODULES_CONSOLIDATION_MASTER.md](./EMAIL_MODULES_CONSOLIDATION_MASTER.md) - Audit + Prisma 7.2
