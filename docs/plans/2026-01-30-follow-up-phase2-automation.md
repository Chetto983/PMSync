# Follow-Up Phase 2: Automation & Thread Intelligence

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement auto-resolution when recipient replies, thread status detection (resolved/ongoing/stalled/escalated), dashboard widget integration with stats, and notification system for due/overdue follow-ups.

**Architecture:** Event-driven approach using email sync hooks. When incoming email is synced, check if it's a reply to a tracked follow-up thread and auto-resolve. Add thread status field to track conversation state. Integrate with existing BullMQ queue for notifications.

**Tech Stack:** NestJS, Prisma, BullMQ, TanStack Query, MUI

**Languages:** English + Italian ONLY

---

## Current State Analysis

### Existing Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| FollowUpService | `backend/src/modules/ai/voltagent/services/follow-up.service.ts` | Has `resolveFollowUp()` and `checkForReplyByEmailId()` |
| FollowUpQueueService | `backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts` | BullMQ scheduler for reminders |
| BaseEmailSyncService | `backend/src/modules/email-sync/services/base-email-sync.service.ts` | Calls `analyzeAndCreateFollowUp()` on new emails |
| FollowUpWidget | `frontend/components/dashboard/widgets/FollowUpWidget.tsx` | Basic list with snooze |
| Prisma Schema | `EmailFollowUp` model | Has `threadId` on Email, `resolvedBy` field |

### Gap Analysis

1. **Auto-resolve on reply**: `checkForReplyByEmailId()` exists but NOT called during email sync
2. **Thread status**: No field in schema - only `FollowUpStatus` (PENDING/REMINDED/RESOLVED/EXPIRED)
3. **Dashboard stats**: Widget exists but no stats (pending/due-today/overdue counts)
4. **Notifications**: Queue exists but no user-facing notification system

---

## Task 1: Wire Auto-Resolve to Email Sync

**Files:**
- Modify: `backend/src/modules/email-sync/services/base-email-sync.service.ts:935-950`

**Step 1: Add reply detection in processIncomingEmail**

After the existing `analyzeAndCreateFollowUp` call for SENT emails, add check for INBOX emails:

```typescript
// In base-email-sync.service.ts, around line 950, add after the SENT folder check:

// Check for reply to existing follow-up (auto-resolve)
if (!isSentByUser && result.inReplyTo) {
  // Fire and forget - don't block sync
  this.checkAndResolveFollowUp(tenantId, userId, result.inReplyTo, result.threadId)
    .catch((err) => this.logger.warn(`Auto-resolve check failed: ${err.message}`));
}
```

**Step 2: Add helper method to base class**

Add this method to `BaseEmailSyncService`:

```typescript
/**
 * Check if incoming email is a reply to a tracked follow-up
 * Auto-resolves the follow-up if found
 */
protected async checkAndResolveFollowUp(
  tenantId: string,
  userId: string,
  inReplyTo: string,
  threadId?: string | null,
): Promise<void> {
  // Find follow-up by inReplyTo message ID or thread ID
  const followUp = await this.prisma.emailFollowUp.findFirst({
    where: {
      tenantId,
      userId,
      status: { in: ['PENDING', 'REMINDED'] },
      email: {
        OR: [
          { messageId: inReplyTo },
          ...(threadId ? [{ threadId }] : []),
        ],
      },
    },
    include: { email: true },
  });

  if (followUp) {
    await this.followUpService.resolveFollowUp(
      tenantId,
      userId,
      followUp.id,
      'REPLY_RECEIVED',
    );
    this.logger.log(`Auto-resolved follow-up ${followUp.id} - reply received`);
  }
}
```

**Step 3: Run type-check**

```bash
cd /d/MailAgent/backend && npm run type-check
```

**Step 4: Commit**

```bash
git add backend/src/modules/email-sync/services/base-email-sync.service.ts
git commit -m "feat(follow-up): auto-resolve when reply received during sync"
```

---

## Task 2: Add Thread Status to Schema

**Files:**
- Modify: `backend/prisma/schema.prisma:1034-1061`
- Create migration

**Step 1: Add threadStatus field to EmailFollowUp**

```prisma
// In EmailFollowUp model, after 'confidence' field:
threadStatus   String?        // resolved|ongoing|stalled|escalated
```

**Step 2: Add enum comment for documentation**

```prisma
/// threadStatus values:
/// - resolved: Recipient replied or action completed
/// - ongoing: Active conversation continues
/// - stalled: 7+ days with no reply
/// - escalated: Multiple unresolved follow-ups on same thread
```

**Step 3: Generate and run migration**

```bash
cd /d/MailAgent/backend
npx prisma migrate dev --name add_thread_status_to_follow_up
```

**Step 4: Run type-check**

```bash
npm run type-check
```

**Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(follow-up): add threadStatus field to schema"
```

---

## Task 3: Update Service to Set Thread Status

**Files:**
- Modify: `backend/src/modules/ai/voltagent/services/follow-up.service.ts`

**Step 1: Add thread status constants**

After `VIP_CONTACT_PATTERNS` (around line 137), add:

```typescript
/**
 * Thread status values for conversation tracking
 */
export type ThreadStatus = 'resolved' | 'ongoing' | 'stalled' | 'escalated';
```

**Step 2: Update resolveFollowUp to set threadStatus**

In `resolveFollowUp()` method, update the Prisma update call:

```typescript
// Around line 720, add threadStatus to update data:
data: {
  status: 'RESOLVED',
  resolvedAt: now,
  resolvedBy: resolvedBy,
  threadStatus: 'resolved', // Add this line
},
```

**Step 3: Update createFollowUp to set initial threadStatus**

In `createFollowUp()` method, set initial status:

```typescript
// In the prisma.emailFollowUp.create data, add:
threadStatus: 'ongoing',
```

**Step 4: Add method to detect and update stalled threads**

Add new method:

```typescript
/**
 * Update threadStatus for stalled follow-ups
 * Called by scheduler job
 */
async updateStalledThreadStatuses(staleDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - staleDays);

  const result = await this.prisma.emailFollowUp.updateMany({
    where: {
      status: { in: ['PENDING', 'REMINDED'] },
      threadStatus: { not: 'stalled' },
      dueDate: { lt: cutoffDate },
    },
    data: {
      threadStatus: 'stalled',
    },
  });

  if (result.count > 0) {
    this.logger.log(`Marked ${result.count} follow-ups as stalled`);
  }

  return result.count;
}
```

**Step 5: Run type-check**

```bash
cd /d/MailAgent/backend && npm run type-check
```

**Step 6: Commit**

```bash
git add backend/src/modules/ai/voltagent/services/follow-up.service.ts
git commit -m "feat(follow-up): implement threadStatus tracking in service"
```

---

## Task 4: Add Stats Endpoint to Controller

**Files:**
- Modify: `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts`
- Modify: `backend/src/modules/ai/voltagent/services/follow-up.service.ts`

**Step 1: Enhance getStats in service**

Update the `getStats()` method to include more details:

```typescript
/**
 * Get comprehensive follow-up statistics
 */
async getStats(tenantId: string, userId: string): Promise<{
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  overdue: number;
  dueToday: number;
  stalled: number;
  total: number;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [statusCounts, overdue, dueToday, stalled] = await Promise.all([
    // Count by status
    this.prisma.emailFollowUp.groupBy({
      by: ['status'],
      where: { tenantId, userId },
      _count: true,
    }),
    // Overdue count
    this.prisma.emailFollowUp.count({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'REMINDED'] },
        dueDate: { lt: now },
      },
    }),
    // Due today count
    this.prisma.emailFollowUp.count({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'REMINDED'] },
        dueDate: { gte: todayStart, lt: todayEnd },
      },
    }),
    // Stalled count
    this.prisma.emailFollowUp.count({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'REMINDED'] },
        threadStatus: 'stalled',
      },
    }),
  ]);

  const stats = {
    pending: 0,
    reminded: 0,
    resolved: 0,
    expired: 0,
    overdue,
    dueToday,
    stalled,
    total: 0,
  };

  for (const row of statusCounts) {
    const status = row.status.toLowerCase() as keyof typeof stats;
    if (status in stats) {
      stats[status] = row._count;
    }
    stats.total += row._count;
  }

  return stats;
}
```

**Step 2: Stats endpoint already exists in controller**

Verify `GET /follow-ups/stats` exists (line 127-139). It does - no changes needed.

**Step 3: Run type-check**

```bash
cd /d/MailAgent/backend && npm run type-check
```

**Step 4: Commit**

```bash
git add backend/src/modules/ai/voltagent/services/follow-up.service.ts
git commit -m "feat(follow-up): enhance stats with dueToday, overdue, stalled counts"
```

---

## Task 5: Update Frontend Types

**Files:**
- Modify: `frontend/hooks/queries/use-follow-ups.ts`
- Modify: `frontend/hooks/queries/index.ts`

**Step 1: Update FollowUpStats interface**

```typescript
// In use-follow-ups.ts, update the stats type:
export interface FollowUpStats {
  pending: number;
  reminded: number;
  resolved: number;
  expired: number;
  overdue: number;
  dueToday: number;
  stalled: number;
  total: number;
}
```

**Step 2: Add threadStatus to EmailFollowUp type**

```typescript
// In the EmailFollowUp interface:
threadStatus?: 'resolved' | 'ongoing' | 'stalled' | 'escalated' | null;
```

**Step 3: Run type-check**

```bash
cd /d/MailAgent/frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/hooks/queries/use-follow-ups.ts frontend/hooks/queries/index.ts
git commit -m "feat(follow-up): update frontend types for threadStatus and enhanced stats"
```

---

## Task 6: Enhance Dashboard Widget with Stats

**Files:**
- Modify: `frontend/components/dashboard/widgets/FollowUpWidget.tsx`
- Modify: `frontend/locales/en.ts`
- Modify: `frontend/locales/it.ts`

**Step 1: Add stats display to widget**

```typescript
// Update FollowUpWidget to show stats bar
import { useFollowUpStats } from '@/hooks/queries';

// Inside component:
const { data: stats } = useFollowUpStats();

// Add stats bar before the list:
{stats && (
  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
    <Chip
      size="small"
      label={`${stats.dueToday} ${t.dashboard.widgets.followUps.dueToday}`}
      color="warning"
      variant="outlined"
    />
    {stats.overdue > 0 && (
      <Chip
        size="small"
        label={`${stats.overdue} ${t.dashboard.widgets.common.overdue}`}
        color="error"
      />
    )}
    {stats.stalled > 0 && (
      <Chip
        size="small"
        label={`${stats.stalled} ${t.dashboard.widgets.followUps.stalled}`}
        color="default"
        variant="outlined"
      />
    )}
  </Box>
)}
```

**Step 2: Add translations**

In `en.ts`:

```typescript
// In dashboard.widgets.followUps:
dueToday: 'due today',
stalled: 'stalled',
```

In `it.ts`:

```typescript
// In dashboard.widgets.followUps:
dueToday: 'in scadenza oggi',
stalled: 'in stallo',
```

**Step 3: Run type-check**

```bash
cd /d/MailAgent/frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/components/dashboard/widgets/FollowUpWidget.tsx
git add frontend/locales/en.ts frontend/locales/it.ts
git commit -m "feat(follow-up): add stats bar to dashboard widget"
```

---

## Task 7: Add Due Follow-Up Notification Job

**Files:**
- Modify: `backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts`

**Step 1: Add daily check job**

Add to `onModuleInit()` after worker initialization:

```typescript
// Schedule daily due-today notification check (9 AM every day)
await this.queue?.add(
  'daily-due-check',
  {},
  {
    repeat: {
      pattern: '0 9 * * *', // 9 AM daily
    },
    jobId: 'daily-due-check',
  },
);
this.logger.log('Scheduled daily due follow-up check at 9 AM');
```

**Step 2: Handle daily check in worker**

Add to worker processor:

```typescript
// In the worker processor, add case for daily check:
if (job.name === 'daily-due-check') {
  await this.processDailyDueCheck();
  return;
}
```

**Step 3: Add daily check processor method**

```typescript
/**
 * Process daily due check - find all due-today follow-ups
 * and emit notifications
 */
private async processDailyDueCheck(): Promise<void> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const dueToday = await this.prisma.emailFollowUp.findMany({
    where: {
      status: { in: ['PENDING', 'REMINDED'] },
      dueDate: { gte: todayStart, lt: todayEnd },
    },
    include: {
      email: { select: { subject: true, from: true } },
    },
  });

  this.logger.log(`Found ${dueToday.length} follow-ups due today`);

  // Group by user for batched notifications
  const byUser = new Map<string, typeof dueToday>();
  for (const fu of dueToday) {
    const key = `${fu.tenantId}:${fu.userId}`;
    if (!byUser.has(key)) {
      byUser.set(key, []);
    }
    byUser.get(key)!.push(fu);
  }

  // TODO: Send notifications via WebSocket or email
  // For now, just log
  for (const [key, items] of byUser) {
    this.logger.log(`User ${key} has ${items.length} follow-ups due today`);
  }
}
```

**Step 4: Run type-check**

```bash
cd /d/MailAgent/backend && npm run type-check
```

**Step 5: Commit**

```bash
git add backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts
git commit -m "feat(follow-up): add daily due notification job"
```

---

## Task 8: Add Stalled Thread Detection Job

**Files:**
- Modify: `backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts`

**Step 1: Add weekly stalled check job**

Add to `onModuleInit()`:

```typescript
// Schedule weekly stalled thread detection (Monday 8 AM)
await this.queue?.add(
  'weekly-stalled-check',
  {},
  {
    repeat: {
      pattern: '0 8 * * 1', // Monday 8 AM
    },
    jobId: 'weekly-stalled-check',
  },
);
this.logger.log('Scheduled weekly stalled thread check on Mondays at 8 AM');
```

**Step 2: Handle stalled check in worker**

Add to worker processor:

```typescript
if (job.name === 'weekly-stalled-check') {
  await this.processWeeklyStalledCheck();
  return;
}
```

**Step 3: Add stalled check processor**

```typescript
/**
 * Process weekly stalled check - mark threads with no reply in 7+ days
 */
private async processWeeklyStalledCheck(): Promise<void> {
  // Note: We need FollowUpService injected for this
  // For now, update directly via Prisma
  const staleDays = 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - staleDays);

  const result = await this.prisma.emailFollowUp.updateMany({
    where: {
      status: { in: ['PENDING', 'REMINDED'] },
      threadStatus: { not: 'stalled' },
      dueDate: { lt: cutoffDate },
    },
    data: {
      threadStatus: 'stalled',
    },
  });

  this.logger.log(`Marked ${result.count} follow-ups as stalled (7+ days overdue)`);
}
```

**Step 4: Run type-check**

```bash
cd /d/MailAgent/backend && npm run type-check
```

**Step 5: Commit**

```bash
git add backend/src/modules/ai/voltagent/services/follow-up-queue.service.ts
git commit -m "feat(follow-up): add weekly stalled thread detection job"
```

---

## Task 9: Update Kanban to Show Thread Status

**Files:**
- Modify: `frontend/components/ai/FollowUpTracker/FollowUpCard.tsx`
- Modify: `frontend/locales/en.ts`
- Modify: `frontend/locales/it.ts`

**Step 1: Add thread status indicator to FollowUpCard**

```typescript
// Import icon
import { AlertCircle } from 'lucide-react';

// In the card, add status indicator:
{followUp.threadStatus === 'stalled' && (
  <Tooltip title={t.ai.followUpTracker.threadStatus.stalled}>
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        color: 'warning.main',
        fontSize: '0.75rem',
      }}
    >
      <AlertCircle size={12} />
      {t.ai.followUpTracker.threadStatus.stalledShort}
    </Box>
  </Tooltip>
)}
```

**Step 2: Add translations**

In `en.ts` under `ai.followUpTracker`:

```typescript
threadStatus: {
  resolved: 'Resolved - recipient replied',
  ongoing: 'Active conversation',
  stalled: 'Stalled - no reply for 7+ days',
  escalated: 'Escalated - needs attention',
  stalledShort: 'Stalled',
},
```

In `it.ts`:

```typescript
threadStatus: {
  resolved: 'Risolto - risposta ricevuta',
  ongoing: 'Conversazione attiva',
  stalled: 'In stallo - nessuna risposta da 7+ giorni',
  escalated: 'Escalation - richiede attenzione',
  stalledShort: 'In stallo',
},
```

**Step 3: Run type-check**

```bash
cd /d/MailAgent/frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/components/ai/FollowUpTracker/FollowUpCard.tsx
git add frontend/locales/en.ts frontend/locales/it.ts
git commit -m "feat(follow-up): show thread status indicator on Kanban cards"
```

---

## Task 10: Integration Test Script

**Files:**
- Create: `backend/scripts/test-follow-up-auto-resolve.ts`

**Step 1: Create test script**

```typescript
/**
 * Test Follow-Up Auto-Resolution
 *
 * Run: npx tsx backend/scripts/test-follow-up-auto-resolve.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAutoResolve() {
  console.log('=== Follow-Up Auto-Resolution Test ===\n');

  // Find a test follow-up
  const followUp = await prisma.emailFollowUp.findFirst({
    where: { status: 'PENDING' },
    include: { email: true },
  });

  if (!followUp) {
    console.log('No pending follow-ups found for testing');
    return;
  }

  console.log(`Found follow-up: ${followUp.id}`);
  console.log(`Email subject: ${followUp.email?.subject}`);
  console.log(`Message ID: ${followUp.email?.messageId}`);
  console.log(`Thread ID: ${followUp.email?.threadId}`);
  console.log(`Current status: ${followUp.status}`);
  console.log(`Thread status: ${followUp.threadStatus || 'not set'}`);

  console.log('\n=== Test Scenarios ===');
  console.log('1. Manual resolve: POST /api/v1/voltagent/follow-ups/:id/resolve');
  console.log('2. Auto-resolve: Incoming email with inReplyTo matching messageId');
  console.log('3. Kanban drag: PATCH /api/v1/voltagent/follow-ups/:id/status');

  console.log('\n=== Stats Check ===');
  const stats = await prisma.emailFollowUp.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('Status counts:', stats);

  const stalled = await prisma.emailFollowUp.count({
    where: { threadStatus: 'stalled' },
  });
  console.log(`Stalled follow-ups: ${stalled}`);
}

async function main() {
  try {
    await testAutoResolve();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
```

**Step 2: Run test**

```bash
cd /d/MailAgent/backend && npx tsx scripts/test-follow-up-auto-resolve.ts
```

**Step 3: Commit**

```bash
git add backend/scripts/test-follow-up-auto-resolve.ts
git commit -m "test(follow-up): add auto-resolution verification script"
```

---

## Verification Checklist

After all tasks complete:

1. **Backend type-check:**
   ```bash
   cd /d/MailAgent/backend && npm run type-check
   ```

2. **Frontend type-check:**
   ```bash
   cd /d/MailAgent/frontend && npm run type-check
   ```

3. **Run test script:**
   ```bash
   cd /d/MailAgent/backend && npx tsx scripts/test-follow-up-auto-resolve.ts
   ```

4. **Manual verification:**
   - Send a tracked email
   - Reply from another account
   - Verify follow-up auto-resolves
   - Check Kanban shows thread status
   - Check dashboard widget shows stats

---

## Summary of Changes

| Feature | Backend | Frontend |
|---------|---------|----------|
| Auto-resolve on reply | `base-email-sync.service.ts` | N/A |
| Thread status field | Prisma migration | Types in `use-follow-ups.ts` |
| Thread status tracking | `follow-up.service.ts` | `FollowUpCard.tsx` indicator |
| Enhanced stats | `follow-up.service.ts` | `FollowUpWidget.tsx` stats bar |
| Due notification job | `follow-up-queue.service.ts` | N/A |
| Stalled detection job | `follow-up-queue.service.ts` | N/A |
| Translations | N/A | `en.ts`, `it.ts` |
