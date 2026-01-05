# Email-Sync Module - Master Documentation Index

**Last Updated**: 2025-01-04 (with 2025 best practices)
**Purpose**: Single source of truth for all email-sync knowledge

---

## Quick Navigation

| Document | Purpose | Priority |
|----------|---------|----------|
| [**START HERE**](./EMAIL_CONSOLIDATION_ENTRY.md) | Entry point + Phase timeline | 🔴 CRITICAL |
| [CONSOLIDATION_ROADMAP](./EMAIL_CONSOLIDATION_ROADMAP.md) | Detailed implementation + tests | 🔴 HIGH |
| [CONSOLIDATION_MASTER](./EMAIL_MODULES_CONSOLIDATION_MASTER.md) | Audit + Prisma 7.2 | 🔴 HIGH |
| [REFACTOR_PLAN](./EMAIL_SYNC_REFACTOR_PLAN.md) | Driver split (AFTER consolidation) | 🟡 MEDIUM |

## 2025 Best Practices (NEW)

**Design Patterns to Use:**
- **Adapter Pattern**: EmailDriverInterface as port, provider adapters implement it
- **Strategy Pattern**: Separate operations classes for messages/folders/sync
- **Base Class**: `BaseOperations` with `withErrorHandler` and `sanitizeContext`

**Prisma Robustness:**
- Retry on P2002 (unique constraint) and P2034 (deadlock)
- Exponential backoff: `100ms * 2^attempt`, max 2000ms
- `PrismaRetryService` for centralized retry logic

**Sources:**
- [Adapter Pattern TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example)
- [NestJS Refactoring](https://medium.com/@febriandwikimhan/b-1ab8f2daeff4)
- [Prisma Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

---

## Current Status Summary

### Overall Health: 7.5/10

| Metric | Status |
|--------|--------|
| API Compliance | 10/10 ✅ |
| Race Conditions | 6 open / 5 fixed ⚠️ |
| Code Quality | 7/10 (god classes) |
| Test Coverage | Stress test passing |

### What's Working ✅

1. **DEDUP-FIX**: Cross-folder deduplication with `Set<string>`
2. **P2002 Retry**: Exponential backoff (100/200/300ms)
3. **Redis Locks**: Distributed locking for most services
4. **Delta Sync**: Gmail historyId, Microsoft deltaLink
5. **BullMQ Workers**: Background job processing
6. **Multi-tenant**: Full tenant isolation

### What Needs Fixing 🔴

| Issue | File | Priority |
|-------|------|----------|

| RC-A1: FolderSync parallel upserts | folder-sync.service.ts | HIGH |
| RC-A8: Folder CRUD no locking | folder-sync.service.ts | HIGH |
| God class: imap.driver.ts | 1968 lines → split | MEDIUM |
| God class: google.driver.ts | 1127 lines → split | MEDIUM |
| 12 empty catch blocks | Various | LOW |
| Italian typo | base-email-sync.service.ts:1218 | LOW |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EMAIL-SYNC MODULE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Drivers   │    │  Services   │    │   Workers   │     │
│  ├─────────────┤    ├─────────────┤    ├─────────────┤     │
│  │ google.ts   │    │ base-sync   │    │ sync.worker │     │
│  │ microsoft   │    │ folder-sync │    │ bulk-ops    │     │
│  │ imap.ts     │    │ queue.svc   │    │ folder-ops  │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            │                                │
│                    ┌───────▼───────┐                        │
│                    │    Redis      │                        │
│                    │  (BullMQ +    │                        │
│                    │   Locks)      │                        │
│                    └───────┬───────┘                        │
│                            │                                │
│                    ┌───────▼───────┐                        │
│                    │  PostgreSQL   │                        │
│                    │   (Prisma)    │                        │
│                    └───────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Memory Keys (ReasoningBank)

Query with: `npx claude-flow@alpha memory query "<search>" --namespace mailagent`

| Key | Content |
|-----|---------|
| `email-sync-audit-2025-01-04` | Full audit results |
| `email-sync-priority-fixes-2025-01-04` | Action items list |
| `common-module-integration-2025-01-04` | Common services analysis |
| `email-sync-refactor-plan-2025-01-04` | Refactor roadmap |
| `email-module-audit-2025-01-04` | Email module bugs/race conditions |
| `email-duplication-map-2025-01-04` | Cross-module duplication map |

---

## Key Files Reference

### Core Services

| File | Lines | Purpose |
|------|-------|---------|

| `base-email-sync.service.ts` | 1397 | Base sync logic, DEDUP-FIX, P2002 |
| `folder-sync.service.ts` | ~1200 | Folder operations (needs locks!) |
| `queue.service.ts` | ~400 | BullMQ job management |
| `provider-token.service.ts` | ~350 | OAuth token refresh |

### Drivers (Need Refactor)

| File | Lines | Target |
|------|-------|--------|

| `imap/imap.driver.ts` | 1968 | Split to 7 files (~200 each) |
| `google/google.driver.ts` | 1127 | Split to 6 files (~150 each) |
| `microsoft/microsoft.driver.ts` | 993 | Split to 6 files (~150 each) |

### Workers

| File | Purpose |
|------|---------|

| `sync.worker.ts` | Main sync jobs |
| `bulk-operations.worker.ts` | Batch operations |
| `folder-operations.worker.ts` | Folder CRUD |
| `sync-back.worker.ts` | Two-way sync |

---

## Implemented Fixes (DEDUP-FIX)

### Location: `base-email-sync.service.ts` lines 354-389

```typescript
// DEDUP-FIX: Track processed externalIds across ALL folders
const processedExternalIds = new Set<string>();
const dedupedMessages = result.messages.filter((msg) => {
  if (processedExternalIds.has(msg.id)) {
    return false; // Skip duplicate
  }
  processedExternalIds.add(msg.id);
  return true;
});
```

### P2002 Retry: lines 1036-1068

```typescript
const MAX_RETRIES = 3;
while (true) {
  try {
    results = await this.prisma.$transaction(upsertOps);
    break;
  } catch (error) {
    if (isP2002 && retryCount < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 100 * retryCount));
      continue;
    }
    throw error;
  }
}
```

---

## Zero-staging Comparison

| Aspect | Zero-staging | MailAgent |
|--------|--------------|-----------|
| Architecture | Thin API wrapper | Sync engine |
| Email storage | ❌ None (live fetch) | ✅ PostgreSQL |
| Offline | ❌ No | ✅ Yes |
| IMAP | ❌ No | ✅ Full |
| Scalability | Limited by API | Better |
| Complexity | Lower | Higher (but necessary) |

**Verdict**: MailAgent architecture is correct for production. Just needs cleanup.

---

## Email Module Audit (2025-01-04)

### Quality Scores

| Metric | Score | Notes |
|--------|-------|-------|
| Code Quality | 7.5/10 | 23 bugs found |
| Race Conditions | 7/7 fixed ✅ | All protected |
| Atomic Operations | 8.6/10 | Excellent FOR UPDATE usage |
| Duplication | 365 lines | 280 reducible |

### Race Conditions (ALL FIXED)

| RC# | Location | Fix |
|-----|----------|-----|
| RC-1 | scheduled-email.service.ts:145 | `FOR UPDATE SKIP LOCKED` |
| RC-2 | email-sync-back.service.ts:189 | Redis distributed lock |
| RC-3 | emails.service.ts:542 | `FOR UPDATE` transaction |
| RC-4 | email-cleanup.service.ts:137 | Sequential + idempotent |
| RC-5 | email-sync-back.service.ts:117 | Per-email Redis lock |
| RC-6 | emails.service.ts:933 | UUID instead of timestamp |
| RC-7 | emails.controller.ts:439 | `FOR UPDATE` in transaction |

### Cross-Module Duplication (TO CONSOLIDATE)

| Code | Files | Lines | Action |
|------|-------|-------|--------|
| `parseImapExternalId` | 3 copies | 110 | USE imap.utils.ts |
| `normalizeFolderName` | 2 copies | 68 | MOVE to common |
| `extractPlainText` | 1 (dead) | 32 | DELETE |
| Provider fetch logic | 2 copies | 148 | CONSOLIDATE |

### Dead Code to Delete

- `base-email-sync.service.ts:1314-1346` - extractPlainText (32 lines, never called)

---

## Refactor Timeline

| Phase | Hours | Deliverable |
|-------|-------|-------------|
| 1. IMAP Split | 12-15 | 7 new files, driver ~200 lines |
| 2. Google Split | 6-8 | 6 new files |
| 3. Microsoft Split | 5-7 | 6 new files |
| 4. Race Conditions | 3-4 | RC-A1, RC-A8 fixed |
| 5. Code Quality | 2-3 | Empty catches, typo |
| **Total** | **25-35** | Clean, testable module |

---

## Commands Cheatsheet

```bash
# Run stress test
npx ts-node backend/scripts/stress-test-atomic-sync.ts

# Check line counts
find backend/src/modules/email-sync/drivers -name "*.ts" -exec wc -l {} \; | sort -rn

# Query memory
npx claude-flow@alpha memory query "email-sync" --namespace mailagent

# Type check
npm run type-check

# Lint email-sync
npm run lint -- backend/src/modules/email-sync
```

---

## Related Documentation

### Backend Docs
- [EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md](./EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md)
- [EMAIL_BACKEND_DATA_FLOW.md](./EMAIL_BACKEND_DATA_FLOW.md)
- [EMAIL_BACKEND_QUICK_REFERENCE.md](./EMAIL_BACKEND_QUICK_REFERENCE.md)

### Gmail Specific
- [GMAIL_FOLDER_MAPPING_AUDIT.md](./GMAIL_FOLDER_MAPPING_AUDIT.md)
- [GMAIL_FIXES_FINAL_STATUS.md](./GMAIL_FIXES_FINAL_STATUS.md)
- [GMAIL_FOLDER_COUNT_FIX.md](./GMAIL_FOLDER_COUNT_FIX.md)

### Testing
- [BACKEND_VALIDATION_PLAN.md](./BACKEND_VALIDATION_PLAN.md)
- [TEST_DELETE_READD_ACCOUNT.md](./TEST_DELETE_READD_ACCOUNT.md)

---

## Contact Points

- **Stress Test**: `backend/scripts/stress-test-atomic-sync.ts`
- **Main Module**: `backend/src/modules/email-sync/`
- **Common Services**: `backend/src/common/services/`
- **Memory Namespace**: `mailagent`

---

*This document consolidates all email-sync knowledge. Update after each major change.*
