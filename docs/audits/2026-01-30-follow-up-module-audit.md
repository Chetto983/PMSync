# Follow-Up Module Audit Report
**Date:** 2026-01-30
**Scope:** `backend/src/modules/ai/voltagent/services/follow-up*.ts`, `nlp-intent-classifier.service.ts`, `follow-up.controller.ts`
**Phase 2 Plan:** `docs/plans/2026-01-30-follow-up-phase2-automation.md`

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 2 | Tenant isolation violations |
| HIGH | 3 | Race conditions, missing pagination |
| MEDIUM | 4 | Duplication, dead code potential |
| LOW | 3 | Code style, missing features |

---

## CRITICAL: Tenant Isolation Violations

### BUG-1: `follow-up-queue.service.ts:223-230` - Update without tenant scope

**Location:** [follow-up-queue.service.ts:223](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L223)

```typescript
// CURRENT (BROKEN) - Lines 222-230
await this.prisma.emailFollowUp.update({
  where: { id: followUpId },  // <-- MISSING tenantId, userId
  data: {
    status: 'REMINDED',
    remindCount: { increment: 1 },
    lastRemindedAt: new Date(),
  },
});
```

**Problem:** A malicious actor could manipulate `followUpId` to update another tenant's follow-up since only `id` is in the where clause.

**Fix:**
```typescript
await this.prisma.emailFollowUp.updateMany({
  where: { id: followUpId, tenantId, userId },
  data: {
    status: 'REMINDED',
    remindCount: { increment: 1 },
    lastRemindedAt: new Date(),
  },
});
```

### BUG-2: `follow-up-queue.service.ts:239-242` - Same issue for EXPIRED status

**Location:** [follow-up-queue.service.ts:239](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L239)

```typescript
// CURRENT (BROKEN) - Lines 238-242
await this.prisma.emailFollowUp.update({
  where: { id: followUpId },  // <-- MISSING tenantId, userId
  data: { status: 'EXPIRED' },
});
```

**Fix:** Same as BUG-1 - use `updateMany` with tenant scope.

---

## HIGH: Race Conditions

### RC-1: `checkDueFollowUps()` - No distributed locking

**Location:** [follow-up-queue.service.ts:251-311](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L251)

**Problem:** The scheduled job runs every 6 hours and processes follow-ups in parallel batches. If:
1. Job takes longer than expected
2. Multiple workers are running
3. Manual trigger occurs

The same follow-up can be processed multiple times, causing duplicate reminders or incorrect state.

**Fix:** Add Redis distributed lock:
```typescript
private async checkDueFollowUps(): Promise<void> {
  const lockKey = 'follow-up:due-check:lock';
  const acquired = await this.redis.set(lockKey, '1', 'EX', 300, 'NX');
  if (!acquired) {
    this.logger.debug('Due follow-ups check already running, skipping');
    return;
  }
  try {
    // ... existing logic
  } finally {
    await this.redis.del(lockKey);
  }
}
```

### RC-2: `processReminderJob()` - Find-then-update race

**Location:** [follow-up-queue.service.ts:213-244](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L213)

**Problem:** Between `findFirst()` and `update()`, another process could modify the record. The `remindCount` check on line 233 uses stale data.

**Pattern:**
```typescript
const followUp = await findFirst(...)  // Time T1: remindCount = 2
// Another process updates remindCount to 3
await update(...)  // Time T2: increments to 4, not 3
if (followUp.remindCount + 1 < maxReminders)  // Uses stale value 2
```

**Fix:** Use Prisma transaction with serializable isolation:
```typescript
await this.prisma.$transaction(async (tx) => {
  const followUp = await tx.emailFollowUp.findFirst({
    where: { id: followUpId, tenantId, userId, status: 'PENDING' },
  });
  if (!followUp) return;

  const newCount = (followUp.remindCount ?? 0) + 1;
  await tx.emailFollowUp.update({
    where: { id: followUpId },
    data: {
      status: newCount >= this.maxReminders ? 'EXPIRED' : 'REMINDED',
      remindCount: newCount,
      lastRemindedAt: new Date(),
    },
  });
}, { isolationLevel: 'Serializable' });
```

### RC-3: `resolveFollowUp()` / `updateStatus()` - No optimistic locking

**Location:** [follow-up.service.ts:701-738](backend/src/modules/ai/voltagent/services/follow-up.service.ts#L701)

**Problem:** Concurrent Kanban drag operations could cause lost updates. No version/updatedAt check.

**Recommendation:** Add `@Version()` or use `updatedAt` for optimistic locking.

---

## HIGH: Scalability Issues

### SCALE-1: `checkDueFollowUps()` - No pagination

**Location:** [follow-up-queue.service.ts:259-270](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L259)

```typescript
const dueFollowUps = await this.prisma.emailFollowUp.findMany({
  where: { status: 'PENDING', dueDate: { lte: now } },
  take: BATCH_SIZE,  // Only 100, never paginates
});
```

**Problem:** If >100 follow-ups are due, only 100 are processed. The rest wait until next 6-hour cycle.

**Fix:** Add cursor-based pagination loop:
```typescript
let cursor: string | undefined;
do {
  const dueFollowUps = await this.prisma.emailFollowUp.findMany({
    where: { status: 'PENDING', dueDate: { lte: now } },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: 'asc' },
  });
  // process batch...
  cursor = dueFollowUps.length === BATCH_SIZE ? dueFollowUps[BATCH_SIZE - 1].id : undefined;
} while (cursor);
```

### SCALE-2: `detectStalledThreads()` - Same pagination issue

**Location:** [follow-up-scanner.service.ts:346](backend/src/modules/ai/voltagent/services/follow-up-scanner.service.ts#L346)

```typescript
take: 100, // Process in batches - but never continues to next batch
```

---

## MEDIUM: Code Duplication

### DUP-1: Reminder processing logic duplicated

**Locations:**
- [follow-up.service.ts:901-931](backend/src/modules/ai/voltagent/services/follow-up.service.ts#L901) - `processReminder()` callback
- [follow-up-queue.service.ts:213-244](backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts#L213) - fallback logic

**Problem:** Queue service has a fallback implementation that duplicates the main service logic. If `reminderProcessor` callback isn't set, it uses its own DB update code.

**Recommendation:** Remove fallback, require callback to be set, or extract shared logic to a private method.

### DUP-2: Intent classifiers - Two services exist

**Locations:**
- `nlp-intent-classifier.service.ts` - NLP.js neural network
- `../nlp/intent-classifier.service.ts` - FastText-based

**Wiring in module:**
```typescript
NlpIntentClassifierService, // Neural network intent classifier (2026-01-29)
IntentClassifierService, // FastText bilingual intent classifier (2026-01-30)
```

**Problem:** Two intent classifiers registered. Unclear which is used where.

**Recommendation:** Consolidate or document clear separation of concerns.

---

## MEDIUM: Potential Dead Code

### DEAD-1: VIP contact boost - Check usage

**Location:** [follow-up.service.ts:124-154](backend/src/modules/ai/voltagent/services/follow-up.service.ts#L124)

```typescript
const VIP_CONTACT_PATTERNS = [...];
function isVipContact(email: string): boolean { ... }
function getRelationshipBoost(fromEmail: string, toEmails: string[]): number { ... }
```

**Status:** Used in `analyzeAndCreateFollowUp()` on line 499-501.

**Concern:** The VIP patterns are hardcoded executive titles. Should be configurable per tenant or use CRM relationship data.

### DEAD-2: `FollowUpStats` interface - Missing `stalled` field

**Location:** [follow-up.service.ts:187-195](backend/src/modules/ai/voltagent/services/follow-up.service.ts#L187)

```typescript
export interface FollowUpStats {
  total: number;
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  dueToday: number;
  overdue: number;
  // MISSING: stalled - required by Phase 2 plan
}
```

**Note:** Phase 2 plan requires `threadStatus` field with `stalled` count.

---

## MEDIUM: Common Module Usage Issues

### COMMON-1: Error handling inconsistent

**Good:**
```typescript
import { getErrorMessage } from '../../../../common/utils';
// Used in all 4 follow-up services
```

**Missing:** Should use `isRetryableError` from common utils for Prisma P2002/P2034 retry logic.

### COMMON-2: NLP model path not configurable

**Location:** [nlp-intent-classifier.service.ts:80](backend/src/modules/ai/voltagent/services/nlp-intent-classifier.service.ts#L80)

```typescript
private readonly MODEL_PATH = path.join(process.cwd(), 'data', 'nlp-intent-model.json');
```

**Problem:** Hardcoded to `process.cwd()/data/`. Should use ConfigService for path.

**Fix:**
```typescript
private readonly MODEL_PATH = this.configService.get<string>(
  'NLP_MODEL_PATH',
  path.join(process.cwd(), 'data', 'nlp-intent-model.json'),
);
```

---

## LOW: Missing Features from Phase 2 Plan

### MISSING-1: `threadStatus` field not in schema

Phase 2 Task 2 requires adding `threadStatus` to `EmailFollowUp` model:
```prisma
threadStatus   String?  // resolved|ongoing|stalled|escalated
```

**Status:** Not implemented yet.

### MISSING-2: Auto-resolve not wired to email sync

Phase 2 Task 1 requires:
```typescript
// In base-email-sync.service.ts
if (!isSentByUser && result.inReplyTo) {
  this.checkAndResolveFollowUp(...)
}
```

**Status:** `checkForReplyByEmailId()` exists but not called during sync.

### MISSING-3: Daily/weekly notification jobs

Phase 2 Tasks 7-8 require:
- Daily 9 AM due-today check
- Weekly Monday stalled thread detection

**Status:** Only 6-hour generic check exists.

---

## Summary of Required Fixes

### Priority 1 - CRITICAL (Fix immediately)

| ID | File | Line | Fix |
|----|------|------|-----|
| BUG-1 | follow-up-queue.service.ts | 223 | Add tenantId, userId to where clause |
| BUG-2 | follow-up-queue.service.ts | 239 | Add tenantId, userId to where clause |

### Priority 2 - HIGH (Fix before next release)

| ID | File | Line | Fix |
|----|------|------|-----|
| RC-1 | follow-up-queue.service.ts | 251 | Add Redis distributed lock |
| RC-2 | follow-up-queue.service.ts | 213 | Use Prisma transaction |
| SCALE-1 | follow-up-queue.service.ts | 259 | Add cursor pagination |
| SCALE-2 | follow-up-scanner.service.ts | 346 | Add cursor pagination |

### Priority 3 - MEDIUM (Technical debt)

| ID | Description |
|----|-------------|
| DUP-1 | Remove duplicated reminder processing logic |
| DUP-2 | Consolidate intent classifiers |
| COMMON-2 | Make NLP model path configurable |

---

## Test Commands

```bash
# Type check after fixes
cd /d/MailAgent/backend && npm run type-check

# Run existing follow-up tests
npm run test -- --testPathPattern=follow-up

# Manual verification of tenant isolation
npx tsx scripts/test-follow-up-tenant-isolation.ts
```

---

## Appendix: Files Audited

| File | Lines | Status |
|------|-------|--------|
| follow-up.service.ts | 981 | 2 issues |
| follow-up-queue.service.ts | 363 | 4 issues (CRITICAL) |
| follow-up-scanner.service.ts | 402 | 1 issue |
| follow-up-extraction.service.ts | 249 | Clean |
| follow-up.controller.ts | 287 | Clean |
| nlp-intent-classifier.service.ts | 380 | 1 issue |
