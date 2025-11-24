# WebSocket Emissions Analysis - Email Service vs Realtime Service

## Executive Summary

**Date**: 2025-11-24
**Analysis**: Detailed check between `emails.service.ts` and `realtime-events.service.ts`

### Key Findings

1. **5 out of 7 bulk operations are missing WebSocket emissions** ❌
2. **Only bulkAddLabels and bulkRemoveLabels emit events** (recently added) ✅
3. **No duplicate emissions found** ✅
4. **Potential race condition** with async folder count updates ⚠️

---

## Available WebSocket Methods (realtime-events.service.ts)

### Email Events
| Method | Type | Buffered | Purpose |
|--------|------|----------|---------|
| `emitEmailNew()` | email:new | Yes | New email received |
| `emitEmailUpdate()` | email:update | Yes | Email updated (read, starred, labels, etc.) |
| `emitEmailDelete()` | email:delete | Yes | Email deleted |
| `emitUnreadCountUpdate()` | email:unread_count_update | No | Unread count changed |
| `emitFolderCountsUpdate()` | email:folder_counts_update | Yes | Folder counts changed |
| `emitThreadUpdate()` | email:thread_update | No | Thread updated |
| `emitEmailBatchProcessed()` | email:batch_processed | No | Batch import completed |

### Buffering System
- **Email events** are buffered for 200ms or until 500 events
- **Folder count events** are buffered for 250ms or until 200 events
- **Deduplication** by key: `${tenantId}:${event}:${emailId}`
- **Skip inactive tenants** to save resources

### Helper Method
- `notifyMailboxChange()` - Centralized method for sync services that routes based on reason:
  - `'message-processed'` → emitEmailNew()
  - `'labels-updated'` → emitEmailUpdate()
  - `'message-deleted'` → emitEmailDelete()
  - `'sync-complete'` → emitSyncStatus()

---

## Current WebSocket Emissions in emails.service.ts

### Existing Emissions

| Line | Method | Event | Notes |
|------|--------|-------|-------|
| 50 | `hasTenantConnections()` | - | Check if tenant has active connections |
| 95 | `emitFolderCountsUpdate()` | email:folder_counts_update | Folder count updates |
| 332 | `emitEmailUpdate()` | email:update | Single email update |
| 1189 | `emitEmailUpdate()` | email:update | bulkAddLabels (recently added) ✅ |
| 1221 | `emitEmailUpdate()` | email:update | bulkRemoveLabels (recently added) ✅ |

---

## Bulk Operations Audit

### ✅ Operations WITH WebSocket Emissions

#### 1. bulkAddLabels (line 1151)
```typescript
// ✅ CORRECT - Emits WebSocket events
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'labels-updated',
  });
}
```

#### 2. bulkRemoveLabels (line 1204)
```typescript
// ✅ CORRECT - Emits WebSocket events
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'labels-updated',
  });
}
```

---

### ❌ Operations MISSING WebSocket Emissions

#### 1. bulkUpdateRead (line 616)
```typescript
// ❌ MISSING - No WebSocket emission
async bulkUpdateRead(emailIds: string[], tenantId: string, isRead: boolean) {
  // Updates isRead status in DB
  await this.prisma.email.updateMany({ ... });

  // Updates folder counts (for unread count)
  this.updateFolderCounts(...); // ✅ This emits folder counts

  // Returns updated emails
  const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);
  return { updated: result.count, emails: updatedEmails };

  // ❌ MISSING: Should emit email:update for each email
}
```

**Impact**: UI doesn't update read/unread status in real-time
**Recommended Fix**: Add emission loop similar to bulkAddLabels

#### 2. bulkDelete (line 918)
```typescript
// ❌ MISSING - No WebSocket emission
async bulkDelete(emailIds: string[], tenantId: string) {
  // Soft delete: sets isDeleted=true, moves to TRASH
  await this.prisma.email.updateMany({
    data: { isDeleted: true, folder: 'TRASH' }
  });

  // Updates folder counts
  this.updateFolderCounts(...); // ✅ This emits folder counts

  // Does NOT return updated emails
  return { deleted: result.count };

  // ❌ MISSING: Should emit email:delete for each email
}
```

**Impact**: UI doesn't remove deleted emails in real-time
**Recommended Fix**: Fetch updated emails and emit email:delete events

#### 3. bulkUpdateStarred (line 982)
```typescript
// ❌ MISSING - No WebSocket emission
async bulkUpdateStarred(emailIds: string[], tenantId: string, isStarred: boolean) {
  // Updates isStarred status in DB
  await this.prisma.email.updateMany({ data: { isStarred } });

  // Returns updated emails
  const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);
  return { updated: result.count, emails: updatedEmails };

  // ❌ MISSING: Should emit email:update for each email
}
```

**Impact**: UI doesn't update star status in real-time
**Recommended Fix**: Add emission loop similar to bulkAddLabels

#### 4. bulkUpdateFlagged (line 1031)
```typescript
// ❌ MISSING - No WebSocket emission
async bulkUpdateFlagged(emailIds: string[], tenantId: string, isFlagged: boolean) {
  // Updates isFlagged status in DB
  await this.prisma.email.updateMany({ data: { isFlagged } });

  // Returns updated emails
  const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);
  return { updated: result.count, emails: updatedEmails };

  // ❌ MISSING: Should emit email:update for each email
}
```

**Impact**: UI doesn't update flag status in real-time
**Recommended Fix**: Add emission loop similar to bulkAddLabels

#### 5. bulkMoveToFolder (line 1080)
```typescript
// ❌ MISSING - No WebSocket emission
async bulkMoveToFolder(emailIds: string[], tenantId: string, folder: string) {
  // Updates folder field in DB
  await this.prisma.email.updateMany({ data: { folder } });

  // Updates folder counts (both source and destination)
  this.updateFolderCounts(...); // ✅ This emits folder counts

  // Returns updated emails
  const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);
  return { updated: result.count, emails: updatedEmails };

  // ❌ MISSING: Should emit email:update for each email
}
```

**Impact**: UI doesn't update email folder in real-time
**Recommended Fix**: Add emission loop similar to bulkAddLabels

---

## Race Conditions Analysis

### Potential Race Condition: Folder Count Updates

**Issue**: Folder counts are updated asynchronously (fire-and-forget) while the main operation returns immediately.

```typescript
// Example from bulkUpdateRead
const result = await this.prisma.email.updateMany(...);

// Async folder count update (doesn't wait)
this.updateFolderCounts(tenantId, providerId, folders).catch(...);

// Returns immediately
const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);
return { updated: result.count, emails: updatedEmails };
```

**Timeline**:
1. DB update completes
2. Method returns immediately with updated emails
3. Folder count update happens later (async)
4. Folder count WebSocket event emitted
5. Email update WebSocket event (if added) might be sent before or after step 4

**Risk Level**: LOW - The buffering system in realtime-events.service.ts handles this gracefully:
- Email events are buffered for 200ms
- Folder count events are buffered for 250ms
- Frontend receives both updates and handles them independently

**Recommendation**: Keep current async pattern for performance. The buffering ensures reasonable ordering.

---

## Duplicate Emissions Check

### Result: ✅ NO DUPLICATES FOUND

**Checked Scenarios**:

1. **bulkAddLabels + bulkRemoveLabels**: Only emit once per email with full email object
2. **updateFolderCounts**: Emits folder_counts_update, not email updates (different event type)
3. **updateEmail (single)**: Emits email:update once at line 332
4. **Buffering deduplication**: Uses key `${tenantId}:${event}:${emailId}` to prevent duplicates

**Conclusion**: No duplicate emissions. Each operation emits exactly once per email.

---

## Recommendations

### Priority 1: Add Missing WebSocket Emissions

All bulk operations should emit WebSocket events for real-time UI updates:

#### 1. bulkUpdateRead
```typescript
// After fetching updated emails:
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'read-status-updated',
  });
}
```

#### 2. bulkDelete
```typescript
// Before returning, fetch emails to emit events:
const emailsToDelete = await this.getEmailsByIds(emailIds, tenantId);

for (const email of emailsToDelete) {
  this.realtimeEvents.emitEmailDelete(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'message-deleted',
  });
}
```

#### 3. bulkUpdateStarred
```typescript
// After fetching updated emails:
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'starred-updated',
  });
}
```

#### 4. bulkUpdateFlagged
```typescript
// After fetching updated emails:
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'flagged-updated',
  });
}
```

#### 5. bulkMoveToFolder
```typescript
// After fetching updated emails:
for (const email of updatedEmails) {
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    email: email,
    reason: 'folder-updated',
  });
}
```

### Priority 2: Frontend Updates

Update frontend WebSocket handlers to handle new event reasons:
- `read-status-updated`
- `starred-updated`
- `flagged-updated`
- `folder-updated`
- `message-deleted`

Current frontend already handles `labels-updated` correctly.

### Priority 3: Testing

Test each bulk operation to verify:
1. WebSocket events are emitted
2. Frontend receives events and updates UI
3. No performance degradation with buffering
4. Folder counts update correctly

---

## Summary Matrix

| Operation | Line | Emits Events | Folder Counts | Returns Emails | Status |
|-----------|------|--------------|---------------|----------------|--------|
| bulkUpdateRead | 616 | ❌ | ✅ | ✅ | NEEDS FIX |
| bulkDelete | 918 | ❌ | ✅ | ❌ | NEEDS FIX |
| bulkUpdateStarred | 982 | ❌ | ❌ | ✅ | NEEDS FIX |
| bulkUpdateFlagged | 1031 | ❌ | ❌ | ✅ | NEEDS FIX |
| bulkMoveToFolder | 1080 | ❌ | ✅ | ✅ | NEEDS FIX |
| bulkAddLabels | 1151 | ✅ | ❌ | ✅ | ✅ CORRECT |
| bulkRemoveLabels | 1204 | ✅ | ❌ | ✅ | ✅ CORRECT |

---

## Conclusion

**Duplications**: ✅ None found
**Conflicts**: ✅ None found
**Race Conditions**: ⚠️ Low-risk async folder count updates (acceptable)
**Missing Emissions**: ❌ 5 operations need WebSocket events added

**Overall Assessment**: The realtime architecture is well-designed with buffering and deduplication. However, most bulk operations are missing WebSocket emissions, creating an inconsistent user experience where only label operations update in real-time.

**Next Steps**: Add WebSocket emissions to all 5 missing bulk operations following the pattern used in bulkAddLabels/bulkRemoveLabels.
