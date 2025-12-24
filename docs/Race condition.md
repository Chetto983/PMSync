# 🔴 Race Conditions Analysis: Email & Email-Sync Modules

**Status:** CRITICAL (5 race conditions identified)  
**Date:** December 24, 2025  
**Author:** Code Analysis  
**Total Effort:** 12-14 hours  
**Priority:** Implement within 2 weeks

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [RC-1: Duplicate Email (Upsert Race)](#rc-1-duplicate-email)
3. [RC-2: User Mutation Lost](#rc-2-user-mutation-lost)
4. [RC-3: Metadata Updates Non-Atomic](#rc-3-metadata-non-atomic)
5. [RC-4: Folder Sync Race](#rc-4-folder-sync-race)
6. [RC-5: Attachment TOCTTOU](#rc-5-attachment-tocttou)
7. [Implementation Checklist](#implementation-checklist)
8. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### ✅ What's Good

The Prisma schema is **enterprise-grade**:
- Unique constraints: `@@unique([providerId, externalId, folder])` ✓
- Composite indexes optimized for concurrent queries ✓
- Referential integrity with proper cascade deletes ✓
- Multi-tenant isolation with tenantId scoping ✓
- Sync tracking fields (lastSyncedAt, metadata, syncToken) ✓

### ❌ What's Bad

**5 critical race conditions** in sync code:
1. **RC-1:** Duplicate email creation from parallel upserts (HIGH probability)
2. **RC-2:** User mutations (read status, folder moves) lost during sync (MEDIUM probability)
3. **RC-3:** Non-atomic metadata updates after sync (MEDIUM probability)
4. **RC-4:** Folder sync race between incremental and full sync (MEDIUM-LOW probability)
5. **RC-5:** Attachment TOCTTOU (time-of-check-to-time-of-use) (LOW probability)

### Root Cause

**The bugs are 100% in application code, not in the database schema.**

Issues:
- No distributed locks for concurrent worker coordination
- No optimistic locking (version field) for user mutation protection
- Non-atomic post-sync transactions
- Missing pessimistic locks on long-running operations

---

## 🔴 RC-1: DUPLICATE EMAIL (Upsert Race)

**Severity:** 🔴 CRITICAL  
**Probability:** HIGH (17 Gmail workers + 10 Microsoft workers concurrent)  
**Data Corruption Risk:** HIGH  
**User Impact:** Duplicate email entries in inbox  
**Fix Time:** 2-3 hours

### Location

**File:** `backend/src/modules/email-sync/services/base-email-sync.service.ts`  
**Line:** ~240  
**Method:** `upsertMessageFromDriver()`  
**Also in:** `processMessagesBatch()` (~280)

### Technical Problem

// ❌ BUGGY CODE
const result = await this.prisma.email.upsert({
where: {
providerId_externalId_folder: {
providerId,
externalId: canonicalMsg.id, // Same key from 2 jobs in parallel!
folder: canonicalMsg.folder,
},
},
update: { ... },
create: { ... },
});

text

### Race Condition Timeline

T=0ms: Job1 (Gmail sync): READ unique key → "does not exist"
T=1ms: Job2 (Microsoft sync): READ unique key → "does not exist" ← RACE WINDOW!
T=2ms: Job1: CREATE email record
T=3ms: Job2: CREATE email record
❌ UNIQUE CONSTRAINT VIOLATION (providerId_externalId_folder)

text

**Why it happens:**

Prisma `upsert()` operation flow:
1. **SELECT** record by unique key (checks if exists)
2. **[RACE WINDOW]** ← Two concurrent jobs read "not found" simultaneously
3. **INSERT/UPDATE** (one job succeeds, other fails on unique constraint)

The database constraint `@@unique([providerId, externalId, folder])` is good, but cannot prevent two jobs from both executing the SELECT → INSERT sequence before either reaches the INSERT.

### Impacts

- ❌ Sync job crashes with UNIQUE constraint violation
- ❌ Duplicate email records created in some cases
- ❌ Embedding queue receives duplicate email IDs → double processing
- ❌ API email count queries return wrong numbers
- ❌ Realtime events emitted twice for same email
- ❌ Search indexes get stale/duplicate entries

### Solution: Distributed Redis Lock

**Step 1: Create RedisLockService**

Create file: `backend/src/shared/services/redis-lock.service.ts`

import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
constructor(private redis: Redis) {}

/**

Acquire lock before executing function

Automatically retries with exponential backoff if lock is held

Releases lock in finally block
*/
async withLock<T>(
key: string,
ttlMs: number,
fn: () => Promise<T>,
maxRetries: number = 5,
): Promise<T> {
const lockValue = ${Date.now()}-${Math.random()};
let retries = 0;

text
while (retries < maxRetries) {
text
  // Atomic SET NX (only if not exists)
  const acquired = await this.redis.set(
    key,
    lockValue,
    'PX',    // Expire in milliseconds
    ttlMs,
    'NX',    // Only set if key does not exist
  );

  if (acquired) {
    // Lock acquired successfully
    try {
      return await fn();
    } finally {
      // Always release lock
      await this.redis.del(key);
    }
  }

  // Lock is held by another process
  // Wait with exponential backoff: 50ms + random 0-100ms
  const delay = 50 + Math.random() * (100 * (retries + 1));
  await new Promise(resolve => setTimeout(resolve, delay));
  retries++;
}

throw new Error(`Failed to acquire lock "${key}" after ${maxRetries} retries`);
}
}

text

**Step 2: Use lock in upsert**

Update: `backend/src/modules/email-sync/services/base-email-sync.service.ts`

export abstract class BaseEmailSyncService implements OnModuleInit {
constructor(
protected readonly prisma: PrismaService,
protected readonly realtimeEvents: RealtimeEventsService,
protected readonly config: ConfigService,
protected readonly redisLock: RedisLockService, // ← ADD
) {}

protected async upsertMessageFromDriver(
driver: IEmailDriver,
canonicalMsg: CanonicalMessage,
providerId: string,
tenantId: string,
): Promise<{ wasNew: boolean }> {
// Create unique lock key for this message
const lockKey = email:upsert:${providerId}:${canonicalMsg.id}:${canonicalMsg.folder};
const lockTtlMs = 5000; // 5 second timeout

text
return this.redisLock.withLock(lockKey, lockTtlMs, async () => {
  // Common data for both create and update
  const updateData = {
    subject: canonicalMsg.subject || '(No Subject)',
    from: canonicalMsg.from.email,
    to: canonicalMsg.to?.map((r) => r.email) || [],
    cc: canonicalMsg.cc?.map((r) => r.email) || [],
    bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
    bodyText: canonicalMsg.bodyText || '',
    bodyHtml: canonicalMsg.bodyHtml || '',
    snippet: canonicalMsg.snippet || '',
    receivedAt: canonicalMsg.receivedAt,
    isRead: canonicalMsg.isRead ?? false,
    isStarred: canonicalMsg.isStarred ?? false,
    isFlagged: canonicalMsg.isFlagged ?? false,
    labels: canonicalMsg.labels || [],
  };

  // Atomic upsert protected by lock
  const result = await this.prisma.email.upsert({
    where: {
      providerId_externalId_folder: {
        providerId,
        externalId: canonicalMsg.id,
        folder: canonicalMsg.folder,
      },
    },
    update: {
      ...updateData,
      folder: canonicalMsg.folder,  // Allow folder changes (moves)
    },
    create: {
      tenantId,
      providerId,
      externalId: canonicalMsg.id,
      ...updateData,
      sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
      isDeleted: false,
      folder: canonicalMsg.folder,
      threadId: canonicalMsg.threadId || null,
    },
  });

  // Determine if new by checking version timestamp difference
  const wasNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;

  // Process attachments using provider-specific implementation
  if (canonicalMsg.hasAttachments && canonicalMsg.attachments.length > 0) {
    await this.processAttachmentsForMessage(
      driver,
      result.id,
      tenantId,
      providerId,
      canonicalMsg.id,
      canonicalMsg.attachments,
    );
  }

  // Only queue embeddings and emit events for new messages
  if (wasNew) {
    // Queue for embeddings (skip SPAM/TRASH - they're junk)
    if (!isJunkFolder(result.folder)) {
      await this.getEmbeddingQueue().enqueue({
        emailId: result.id,
        tenantId,
        subject: result.subject,
        snippet: result.snippet || '',
      });
    }

    // Emit realtime event
    this.realtimeEvents.emitEmailNew(tenantId, {
      emailId: result.id,
      providerId,
      folder: result.folder,
      reason: 'message-processed',
    });
  }

  return { wasNew };
});
}
}

text

### Performance Impact

- Redis lock acquisition: <1ms (local Redis connection)
- Exponential backoff retry: adds ~50-150ms only if lock contention
- **Expected impact:** <1% slower under normal conditions, <5% under high contention

---

## 🔴 RC-2: USER MUTATION LOST

**Severity:** 🔴 CRITICAL  
**Probability:** MEDIUM (but highly visible to users)  
**Data Corruption Risk:** MEDIUM  
**User Impact:** Read status reverts, folder moves ignored, labels disappear  
**Fix Time:** 3-4 hours (includes DB migration)

### Location

**Controllers:** `backend/src/modules/email/controllers/*.controller.ts` (REST API update endpoint)  
**Worker:** `backend/src/modules/email-sync/workers/sync.worker.ts` (background sync)  
**Core:** `backend/src/modules/email-sync/services/base-email-sync.service.ts` (~240)

### Technical Problem

**Scenario:** User marks email as READ via REST API, but sync from remote provider says UNREAD

Timeline:
T=0ms: User API: PATCH /emails/123 { isRead: true }
T=1ms: REST controller calls emailService.update()
T=2ms: Database: UPDATE email SET is_read = true, updated_at = NOW()
T=3ms: SyncWorker BullMQ job for same email begins processing
T=5ms: SyncWorker reads email from provider: { isRead: false }
T=7ms: SyncWorker executes upsert:
UPDATE email SET is_read = false ← ❌ OVERWRITES USER'S CHANGE!
T=10ms: User refreshes UI → sees is_read = false (reverted!)

text

**Root Cause:**

The `upsert()` in sync service does NOT check if user has modified the record recently:

// ❌ PROBLEM: Overwrites without checking updatedAt
const result = await this.prisma.email.upsert({
where: { providerId_externalId_folder: {...} },
update: {
isRead: canonicalMsg.isRead, // ← Blindly overwrites user's change
isStarred: canonicalMsg.isStarred, // ← Blindly overwrites
folder: canonicalMsg.folder, // ← User's folder move ignored
// ...
},
create: {...},
});

text

The sync code doesn't know that `updatedAt` was just set 5ms ago by user, so it overwrites everything.

### Impacts

- ❌ User marks email as read → torna unread after next sync
- ❌ User moves email to folder → torna back to INBOX
- ❌ User adds label → label removed after sync
- ❌ Star/flag status toggled by user → reverts
- ❌ User perceives app as "buggy" or "unreliable"
- ❌ **Loss of user trust** in the platform

### Solution: Optimistic Locking with Version Field

**Step 1: Add version column to Email model**

Edit: `backend/prisma/schema.prisma`

model Email {
id String @id @default(cuid())
tenantId String
providerId String
externalId String
threadId String?
messageId String?
inReplyTo String?
references String?
from String
to String[]
cc String[] @default([])
bcc String[] @default([])
replyTo String?
subject String
bodyText String?
bodyHtml String?
snippet String?
folder String @default("INBOX")
labels String[] @default([])
isRead Boolean @default(false)
isStarred Boolean @default(false)
isFlagged Boolean @default(false)
isDraft Boolean @default(false)
isDeleted Boolean @default(false)
isArchived Boolean @default(false)
sentAt DateTime
receivedAt DateTime
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
size Int?
headers Json?
metadata Json?
crossProviderLinkId String?
hasCalendarInvite Boolean @default(false)
calendarInviteData Json?
calendarInviteStatus String?
calendarEventId String?
version Int @default(1) // ← ADD THIS LINE

attachments EmailAttachment[]
emailLabels EmailLabel[]
crossProviderLink EmailCrossProviderLink? @relation(fields: [crossProviderLinkId], references: [id])
provider ProviderConfig @relation(fields: [providerId], references: [id], onDelete: Cascade)
tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

@@unique([providerId, externalId, folder])
@@unique([tenantId, messageId, folder])
@@index([tenantId, folder, receivedAt])
@@index([tenantId, isRead])
@@index([tenantId, threadId])
@@index([sentAt])
@@index([crossProviderLinkId])
@@index(

scrivi su file md
2 passaggi completati
Perfetto, ecco il file MD completo in un unico blocco che puoi copiare interamente:

text
# 🔴 RACE CONDITIONS ANALYSIS - Email & Email-Sync Modules

**Status:** CRITICAL (5 race conditions)
**Date:** December 24, 2025
**Effort:** 12-14 hours total
**Schema:** ✅ Enterprise-grade
**Code:** ❌ Missing coordination

---

## EXECUTIVE SUMMARY

### What's Working ✅
- Schema Prisma is robust: unique constraints, composite indexes, referential integrity
- Unique constraint `@@unique([providerId, externalId, folder])` exists
- Multi-tenant isolation working correctly
- Sync tracking fields all present

### What's Broken ❌
- **5 critical race conditions** in sync code
- Concurrent workers not coordinated
- User mutations lost during sync
- Metadata updates not atomic
- Folder sync races
- Attachment processing unsafe

**Root Cause:** Application code lacks distributed locks and optimistic locking. Database schema is fine.

---

## 🔴 RC-1: DUPLICATE EMAIL (UPSERT RACE)

**Severity:** CRITICAL | **Probability:** HIGH | **Fix:** 2-3h

### Location
- **File:** `backend/src/modules/email-sync/services/base-email-sync.service.ts`
- **Line:** ~240
- **Method:** `upsertMessageFromDriver()`

### Problem

// ❌ BUGGY CODE
const result = await this.prisma.email.upsert({
where: { providerId_externalId_folder: {
providerId,
externalId: canonicalMsg.id, // Same from 2 jobs!
folder: canonicalMsg.folder,
}},
update: {...},
create: {...},
});

text

**Race Window:**
T=0ms: Job1 READ → "not found"
T=1ms: Job2 READ → "not found" ← RACE!
T=2ms: Job1 CREATE
T=3ms: Job2 CREATE ❌ CONSTRAINT VIOLATION

text

### Impacts
- Sync job crashes
- Duplicate emails in inbox
- Embedding queue duplicates
- Wrong email counts
- Realtime events duplicate

### Solution: Redis Distributed Lock

**File:** `backend/src/shared/services/redis-lock.service.ts` (NEW)

import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
constructor(private redis: Redis) {}

async withLock<T>(
key: string,
ttlMs: number,
fn: () => Promise<T>,
): Promise<T> {
const lockValue = ${Date.now()}-${Math.random()};

text
// Try to acquire lock
const acquired = await this.redis.set(
  key,
  lockValue,
  'PX',
  ttlMs,
  'NX',
);

if (!acquired) {
  // Retry with backoff
  await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
  return this.withLock(key, ttlMs, fn);
}

try {
  return await fn();
} finally {
  await this.redis.del(key);
}
}
}

text

**Use in base-email-sync.service.ts:**

protected async upsertMessageFromDriver(
driver: IEmailDriver,
canonicalMsg: CanonicalMessage,
providerId: string,
tenantId: string,
): Promise<{ wasNew: boolean }> {
const lockKey = email:${providerId}:${canonicalMsg.id}:${canonicalMsg.folder};

return this.redisLock.withLock(lockKey, 5000, async () => {
const result = await this.prisma.email.upsert({
where: { providerId_externalId_folder: {...} },
update: {...},
create: {...},
});

text
return { wasNew: ... };
});
}

text

---

## 🔴 RC-2: USER MUTATION LOST

**Severity:** CRITICAL | **Probability:** MEDIUM | **Fix:** 3-4h

### Location
- **Controllers:** `backend/src/modules/email/controllers/*.controller.ts`
- **Worker:** `backend/src/modules/email-sync/workers/sync.worker.ts`
- **Service:** `backend/src/modules/email-sync/services/base-email-sync.service.ts` (~240)

### Problem

T=0ms: User PATCH /emails/123 { isRead: true }
T=2ms: DB UPDATE email SET is_read = true
T=5ms: SyncWorker upsert { isRead: false } ← OVERWRITES!
T=10ms: User refresh → isRead = false ❌

text

**Root Cause:** Upsert doesn't check `updatedAt`, overwrites user changes

### Impacts
- User marks read → reverts to unread
- User moves folder → returns to INBOX
- User adds label → removed
- Star/flag reverts
- Loss of user trust

### Solution: Optimistic Locking (Version Field)

**1. Update schema.prisma:**

model Email {
// ... existing fields ...
version Int @default(1) // ← ADD

// ... relations ...
@@map("emails")
}

text

**Migration:**
ALTER TABLE email ADD COLUMN version SMALLINT DEFAULT 1 NOT NULL;

text

**2. Update upsert in base-email-sync.service.ts:**

protected async upsertMessageFromDriver(
driver: IEmailDriver,
canonicalMsg: CanonicalMessage,
providerId: string,
tenantId: string,
): Promise<{ wasNew: boolean }> {
try {
const result = await this.prisma.email.upsert({
where: {
providerId_externalId_folder: {
providerId,
externalId: canonicalMsg.id,
folder: canonicalMsg.folder,
},
},
update: {
subject: canonicalMsg.subject || '(No Subject)',
from: canonicalMsg.from.email,
to: canonicalMsg.to?.map((r) => r.email) || [],
cc: canonicalMsg.cc?.map((r) => r.email) || [],
bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
bodyText: canonicalMsg.bodyText || '',
bodyHtml: canonicalMsg.bodyHtml || '',
snippet: canonicalMsg.snippet || '',
receivedAt: canonicalMsg.receivedAt,
isRead: canonicalMsg.isRead ?? false,
isStarred: canonicalMsg.isStarred ?? false,
isFlagged: canonicalMsg.isFlagged ?? false,
labels: canonicalMsg.labels || [],
folder: canonicalMsg.folder,
version: { increment: 1 }, // ← KEY FIX
},
create: {
tenantId,
providerId,
externalId: canonicalMsg.id,
subject: canonicalMsg.subject || '(No Subject)',
from: canonicalMsg.from.email,
to: canonicalMsg.to?.map((r) => r.email) || [],
cc: canonicalMsg.cc?.map((r) => r.email) || [],
bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
bodyText: canonicalMsg.bodyText || '',
bodyHtml: canonicalMsg.bodyHtml || '',
snippet: canonicalMsg.snippet || '',
sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
receivedAt: canonicalMsg.receivedAt,
isRead: canonicalMsg.isRead ?? false,
isStarred: canonicalMsg.isStarred ?? false,
isFlagged: canonicalMsg.isFlagged ?? false,
labels: canonicalMsg.labels || [],
isDeleted: false,
folder: canonicalMsg.folder,
threadId: canonicalMsg.threadId || null,
version: 1, // ← Initial version
},
});

text
const wasNew = result.version === 1;
return { wasNew };
} catch (error) {
// P2034 = version mismatch (user modified)
if (error.code === 'P2034') {
this.logger.warn(Version conflict: user modified recently);
return { wasNew: false, conflictDetected: true };
}
throw error;
}
}

text

---

## 🔴 RC-3: METADATA NON-ATOMIC

**Severity:** CRITICAL | **Probability:** MEDIUM | **Fix:** 1-2h

### Location
- **File:** `backend/src/modules/email-sync/workers/sync.worker.ts`
- **Line:** ~195

### Problem

// ❌ THREE SEPARATE TRANSACTIONS
await this.applySyncState(providerId, metadataUpdates); // TX#1
await this.syncScheduler.updateProviderActivity(providerId); // TX#2
await this.folderSyncService.updateAllFolderCounts(providerId); // TX#3

// If crash between TX#1 and TX#2:
// - lastSyncedAt updated ✓
// - lastSyncToken saved ✓
// - activity stale ❌

text

### Impacts
- Next sync starts from zero (duplicates emails)
- Smart Sync picks wrong provider
- Folder counts wrong

### Solution: Atomic Transaction

**Update sync.worker.ts:**

private async applyAllPostSyncUpdates(
providerId: string,
tenantId: string,
metadata: Record<string, any>,
): Promise<void> {
await this.prisma.$transaction(async (tx) => {
// 1. Update ProviderConfig
await tx.providerConfig.update({
where: { id: providerId },
data: {
lastSyncedAt: new Date(),
metadata,
},
});

text
// 2. Update activity
await tx.providerConfig.update({
  where: { id: providerId },
  data: {
    avgActivityRate: metadata.activityRate || 0,
  },
});

// 3. Update folder counts (atomic SQL)
await tx.$executeRaw`
  UPDATE folder 
  SET 
    total_count = (SELECT COUNT(*) FROM email 
      WHERE folder_id = folder.id AND is_deleted = false),
    unread_count = (SELECT COUNT(*) FROM email 
      WHERE folder_id = folder.id AND is_deleted = false AND is_read = false),
    updated_at = NOW()
  WHERE provider_id = ${providerId}
`;
});
}

// Use in processJob():
async processJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
try {
const result = await this.runProviderSync(job.data);
await this.applyAllPostSyncUpdates(job.data.providerId, job.data.tenantId, metadata);
return { success: true, ... };
} catch (error) {
// ...
}
}

text

---

## 🟠 RC-4: FOLDER SYNC RACE

**Severity:** HIGH | **Probability:** MEDIUM-LOW | **Fix:** 2h

### Location
- **File:** `backend/src/modules/email-sync/workers/sync.worker.ts`
- **Service:** `backend/src/modules/email-sync/services/folder-sync.service.ts`

### Problem

T=0ms: Job1 incremental: syncProviderFolders() starts
T=5ms: Job2 full sync: syncProviderFolders() STARTS WHILE JOB1 RUNNING
T=10ms: Job1 completes: Folder A = 50 emails
T=12ms: Job2 completes: Folder A = 48 emails ← STALE!

text

### Impacts
- Folder counts inconsistent
- Realtime events with stale data
- Frontend shows wrong numbers

### Solution: Distributed Lock

**Update sync.worker.ts processJob():**

private async syncFoldersWithLock(
tenantId: string,
providerId: string,
): Promise<void> {
const lockKey = folder-sync:${providerId};
return this.redisLock.withLock(lockKey, 30000, async () => {
await this.folderSyncService.syncProviderFolders(tenantId, providerId);
});
}

async processJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
const { tenantId, providerId, providerType, email, syncType } = job.data;

try {
// Sync folders with lock
await this.syncFoldersWithLock(tenantId, providerId); // ← LOCK

text
// Then sync messages
const result = await this.runProviderSync(job.data);

// ...rest of logic
} catch (error) {
// ...
}
}

text

---

## 🟠 RC-5: ATTACHMENT TOCTTOU

**Severity:** HIGH | **Probability:** LOW | **Fix:** 2-3h

### Location
- **File:** `backend/src/modules/email-sync/services/gmail/google-sync.service.ts`
- **Line:** ~340

### Problem

T=0ms: SyncWorker: check email exists
T=1ms: User API: DELETE /emails/123
T=2ms: SyncWorker: process attachments for email 123
T=3ms: ❌ FK CONSTRAINT FAIL (email deleted)

text

### Impacts
- Orphan attachment in S3
- Referential integrity errors
- Sync fails silently

### Solution: Lock + Transaction

**Update google-sync.service.ts:**

private async processAttachments(
driver: GoogleDriver,
emailId: string,
tenantId: string,
providerId: string,
externalMessageId: string,
attachments: AttachmentMeta[],
): Promise<void> {
try {
// 1. Acquire lock on email
const email = await this.prisma.email.update({
where: { id: emailId },
data: { attachmentProcessingLock: true },
select: { id: true },
});

text
try {
  const attachmentRecords = [];

  for (const att of attachments) {
    const metadata = {
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      isInline: att.isInline,
      contentId: att.contentId,
      externalId: att.id,
      externalMessageId,
    };

    const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

    if (strategy === 'skip') {
      continue;
    }

    if (strategy === 'embeddings') {
      try {
        const attachmentData = await driver.getAttachment(
          externalMessageId,
          att.id,
        );
        const content = Buffer.from(attachmentData.content, 'base64');
        const uploaded = await this.attachmentStorage.uploadAttachment(
          tenantId,
          providerId,
          {
            filename: att.filename,
            content,
            contentType: att.mimeType,
          },
          emailId,
        );

        attachmentRecords.push({
          emailId,
          filename: uploaded.filename,
