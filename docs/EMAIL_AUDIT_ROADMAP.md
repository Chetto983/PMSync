# Email System Audit Roadmap

**Generated:** December 9, 2025
**Status:** Active Development
**Total Issues Found:** 76 issues across 4 major components

---

## Executive Summary

A comprehensive audit of the email functionality identified critical bugs affecting:
- Bulk operations breaking filters
- Infinite scroll resetting position
- Smart filters showing wrong results
- Memory leaks and race conditions
- Missing API endpoints
- Backend transaction safety

**Already Fixed (31 issues):**

**Phase 0 (Pre-audit):**
- [x] Menu Fragment warning in Header.tsx
- [x] Nested button in EmailSidebar.tsx
- [x] bulkDelete doesn't clean up threads Map
- [x] Selection state clearing order race condition
- [x] Smart filter counts never update after mutations
- [x] Thread expansion state corrupted after delete
- [x] Unread filter showing read emails (queryOverrides ignored)
- [x] Infinite scroll jumping to top (virtualizer key instability)

**Phase 1 (P0 Critical) - COMPLETED:**
- [x] **Issue 1.1.1:** `deleteEmail` missing threads/selectedIds cleanup
- [x] **Issue 1.1.2:** Inconsistent ID handling (id vs threadId) in all bulk operations
- [x] **Issue 1.1.3:** `updateEmail` race condition missing unread count update
- [x] **Issue 1.2.1:** `handleEmailClick` missing rollback on API failure
- [x] **Issue 1.2.2:** Stale closures in all useCallback hooks (callbacks in deps)
- [x] **Issue 1.2.3:** `handleMarkAsRead` ignores isRead parameter
- [x] **Issue 1.3.1:** Backend `deleteEmail` missing transaction + WebSocket events
- [x] **Issue 1.3.2:** Backend `bulkDelete` missing transaction wrapper
- [x] **Issue 1.3.3:** `getConversations` memory bomb (added MAX_EMAILS_FOR_GROUPING limit)

**Phase 2 (P1 Important) - COMPLETED:**
- [x] **Issue 2.1.1:** Unbounded memory growth in email store (added MAX_EMAILS = 2000)
- [x] **Issue 2.1.2:** `markAsRead` missing selectedEmail update (fixed during 1.1.2)
- [x] **Issue 2.2.2:** Missing API error handling (added getApiErrorMessage helper)
- [x] **Issue 2.2.3:** Missing timeout configuration (added 30s default timeout)
- [x] **Issue 2.3.2:** `getEmailById` returns deleted emails (added isDeleted filter)
- [x] **Issue 2.3.3:** Missing input validation (added page/limit validation)

**Phase 3 (P2 Medium) - COMPLETED:**
- [x] **Issue 3.1.1:** Missing AI endpoints (already existed in ai.ts - analyzeSentiment, calculatePriority, analyzeEmail, composeEmail)
- [x] **Issue 3.1.2:** Missing Calendar Invite endpoints (added sendCalendarInvite, cancelCalendarInvite to email.ts)
- [x] **Issue 3.1.3:** Missing Folders API client (already existed with full CRUD in folders.ts)
- [x] **Issue 3.1.4:** Missing Sync Management endpoints (added getSyncHealth, getQueues, syncAllProviders, pauseQueue, resumeQueue, clearQueue, createAllWebhooks, renewWebhooks, getWebhookHealth)
- [x] **Issue 3.2.1:** N+1 query in `bulkAddLabels` (parallelized with Promise.all)
- [x] **Issue 3.2.2:** Duplicate query in `updateEmail` (use include in update)
- [x] **Issue 3.3.1:** Single-email API in handleToggleStar/Important (now use bulk API)

---

## Phase 1: Critical Fixes (P0) - IMMEDIATE

### 1.1 Frontend Email Store (`frontend/stores/email-store.ts`)

#### Issue 1.1.1: `deleteEmail` Missing Cleanup
**Priority:** P0 - Critical
**Lines:** 255-271
**Problem:** Unlike `bulkDelete`, the single `deleteEmail` method doesn't clean up threads Map or selectedIds Set.

**Current Code:**
```typescript
deleteEmail: (id) =>
  set((state) => {
    const email = state.emails.find((e) => e.id === id);
    if (!email) return state;

    return {
      emails: state.emails.filter((e) => e.id !== id),
      unreadCount: !email.isRead ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      selectedEmail: state.selectedEmail?.id === id ? null : state.selectedEmail,
      // MISSING: threads cleanup
      // MISSING: selectedIds cleanup
    };
  }),
```

**Fix Required:**
```typescript
deleteEmail: (id) =>
  set((state) => {
    const email = state.emails.find((e) => e.id === id);
    if (!email) return state;

    // Clean up threads Map
    const newThreads = new Map(state.threads);
    if (email.threadId) {
      const threadEmails = newThreads.get(email.threadId);
      if (threadEmails) {
        const remaining = threadEmails.filter(eid => eid !== id);
        if (remaining.length === 0) {
          newThreads.delete(email.threadId);
        } else {
          newThreads.set(email.threadId, remaining);
        }
      }
    }

    // Clean up selectedIds
    const newSelectedIds = new Set(state.selectedIds);
    newSelectedIds.delete(id);
    if (email.threadId) {
      newSelectedIds.delete(email.threadId);
    }

    return {
      emails: state.emails.filter((e) => e.id !== id),
      unreadCount: !email.isRead ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      selectedEmail: state.selectedEmail?.id === id ? null : state.selectedEmail,
      threads: newThreads,
      selectedIds: newSelectedIds,
    };
  }),
```

---

#### Issue 1.1.2: Inconsistent ID Handling (id vs threadId)
**Priority:** P0 - Critical
**Lines:** 309-313 (selectAll), 320-333 (markAsRead), all bulk operations
**Problem:** `selectAll` uses `threadId || id` but other operations use `id`. This causes bulk operations to fail when selecting all.

**Current selectAll:**
```typescript
selectAll: () =>
  set((state) => ({
    selectedIds: new Set(state.emails.map((e) => e.threadId || e.id)),
  })),
```

**Current markAsRead:**
```typescript
markAsRead: (ids) =>
  set((state) => {
    const updatedEmails = state.emails.map((email) =>
      ids.includes(email.id) ? { ...email, isRead: true } : email  // Uses email.id
    );
```

**Fix Required:** Standardize on using `id` for all store operations:
```typescript
selectAll: () =>
  set((state) => ({
    selectedIds: new Set(state.emails.map((e) => e.id)),  // Use id, not threadId
  })),
```

OR update all operations to check both:
```typescript
markAsRead: (ids) =>
  set((state) => {
    const idSet = new Set(ids);
    const updatedEmails = state.emails.map((email) =>
      idSet.has(email.id) || idSet.has(email.threadId || '')
        ? { ...email, isRead: true }
        : email
    );
```

---

#### Issue 1.1.3: Race Condition in `updateEmail` Unread Count
**Priority:** P0 - Critical
**Lines:** 225-238
**Problem:** The race condition retry path doesn't update unread count.

**Fix Required:** Add unread count calculation in the retry block (lines 228-238).

---

### 1.2 Frontend Email Actions Hook (`frontend/hooks/use-email-actions.ts`)

#### Issue 1.2.1: Missing Rollback in `handleEmailClick`
**Priority:** P0 - Critical
**Lines:** 308-324
**Problem:** Optimistically marks email as read but doesn't rollback on API failure.

**Fix Required:**
```typescript
if (!email.isRead) {
  try {
    updateEmail(email.id, { isRead: true });
    await emailApi.updateEmail(email.id, { isRead: true });
  } catch (error) {
    logger.error('[EmailActions] Failed to mark email as read on click', { emailId: email.id, error });
    // ADD ROLLBACK
    updateEmail(email.id, { isRead: false });
    callbacks?.onError?.('Failed to mark email as read.');
  }
}
```

---

#### Issue 1.2.2: Stale Closures in All Callbacks
**Priority:** P0 - Critical
**Lines:** 42-338 (all useCallback hooks)
**Problem:** `callbacks` in dependency array causes all handlers to recreate on every render.

**Fix Required:** Use refs for stable callback references:
```typescript
const callbacksRef = useRef<EmailActionsCallbacks>();
callbacksRef.current = callbacks;

// Then in each callback, remove callbacks from deps:
}, [deleteEmail]);  // Instead of [deleteEmail, callbacks]

// And use ref inside:
callbacksRef.current?.onSuccess?.('Email deleted successfully');
```

---

#### Issue 1.2.3: `handleMarkAsRead` Ignores `isRead` Parameter
**Priority:** P0 - Critical
**Lines:** 101-129
**Problem:** Function accepts `isRead` parameter but store's `markAsRead` always sets to `true`.

**Fix Required:** Either remove the parameter or update the store method to accept it.

---

### 1.3 Backend Email Service (`backend/src/modules/email/services/emails.service.ts`)

#### Issue 1.3.1: Missing Transaction in `deleteEmail`
**Priority:** P0 - Critical
**Lines:** 514-575
**Problem:** Hard delete performs knowledge base deletion then database deletion without transaction.

**Fix Required:**
```typescript
if (email.isDeleted) {
  await this.prisma.$transaction(async (tx) => {
    await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
    await tx.email.delete({ where: { id } });
  });
}
```

---

#### Issue 1.3.2: Missing Transaction in `bulkDelete`
**Priority:** P0 - Critical
**Lines:** 1082-1095
**Problem:** Soft deletes and hard deletes happen in separate operations without transaction.

**Fix Required:** Wrap in `$transaction`.

---

#### Issue 1.3.3: `getConversations` Memory Bomb
**Priority:** P0 - Critical
**Lines:** 859-973
**Problem:** Loads ALL emails into memory before pagination. Will crash on large mailboxes.

**Fix Required:** Add limit or paginate at database level:
```typescript
const MAX_EMAILS_FOR_GROUPING = 10000;
const emailCount = await this.prisma.email.count({ where });
if (emailCount > MAX_EMAILS_FOR_GROUPING) {
  throw new BadRequestException(
    'Too many emails to group. Please use folder filters.'
  );
}
```

---

## Phase 2: Important Fixes (P1) - THIS WEEK

### 2.1 Frontend Email Store

#### Issue 2.1.1: Unbounded Memory Growth
**Priority:** P1 - Important
**Lines:** 164-167 (appendEmails), 169-184 (addEmail)
**Problem:** No maximum limit on emails array. WebSocket events can grow it indefinitely.

**Fix Required:** Implement LRU eviction or max limit:
```typescript
const MAX_EMAILS = 2000;

appendEmails: (newEmails) =>
  set((state) => {
    const combined = [...state.emails, ...newEmails];
    // Keep only most recent MAX_EMAILS
    const trimmed = combined.slice(-MAX_EMAILS);
    return { emails: trimmed };
  }),
```

---

#### Issue 2.1.2: `markAsRead` Missing selectedEmail Update
**Priority:** P1 - Important
**Lines:** 320-333
**Problem:** Unlike `markAsStarred` and `markAsImportant`, doesn't update `selectedEmail`.

**Fix Required:**
```typescript
const updatedSelectedEmail = state.selectedEmail && ids.includes(state.selectedEmail.id)
  ? { ...state.selectedEmail, isRead: true }
  : state.selectedEmail;

return {
  emails: updatedEmails,
  unreadCount,
  selectedEmail: updatedSelectedEmail,
};
```

---

### 2.2 Frontend Email API (`frontend/lib/api/email.ts`)

#### Issue 2.2.1: Incorrect Attachment Download Path
**Priority:** P1 - Important
**Lines:** 572-576
**Problem:** Path is `/email/attachments/:attachmentId/download` but backend expects `/emails/:emailId/attachments/:attachmentId/download`.

**Fix Required:**
```typescript
downloadAttachment(emailId: string, attachmentId: string) {
  return apiClient.get<Blob>(
    `/emails/${emailId}/attachments/${attachmentId}/download`,
    { responseType: 'blob' }
  );
},
```

---

#### Issue 2.2.2: Missing Error Handling
**Priority:** P1 - Important
**Lines:** All API methods
**Problem:** No API methods have error handling. Errors bubble up without transformation.

**Fix Required:** Add error handling wrapper:
```typescript
const handleApiError = (error: unknown): never => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message;
    throw new Error(message);
  }
  throw error;
};
```

---

#### Issue 2.2.3: Missing Timeout Configuration
**Priority:** P1 - Important
**Lines:** N/A - Global issue
**Problem:** No timeout configuration. Requests can hang indefinitely.

**Fix Required:** In `api-client.ts`:
```typescript
export const apiClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000, // 30 seconds default
  // ...
});
```

---

### 2.3 Backend Email Service

#### Issue 2.3.1: Missing WebSocket Event in Single Email Delete
**Priority:** P1 - Important
**Lines:** 514-575
**Problem:** `deleteEmail` doesn't emit WebSocket event, but `bulkDelete` does (lines 1128-1143).

**Fix Required:** Add after line 552:
```typescript
this.realtimeEvents.emitEmailDelete(tenantId, {
  emailId: email.id,
  providerId: email.providerId,
  folder: email.folder,
  reason: 'message-deleted',
});
```

---

#### Issue 2.3.2: `getEmailById` Returns Deleted Emails
**Priority:** P1 - Important
**Lines:** 311-342
**Problem:** Doesn't filter by `isDeleted`, inconsistent with other methods.

**Fix Required:**
```typescript
const email = await this.prisma.email.findFirst({
  where: {
    id,
    tenantId,
    isDeleted: false, // Add this
  },
```

---

#### Issue 2.3.3: Missing Input Validation
**Priority:** P1 - Important
**Lines:** 158-306 (listEmails), 611-695 (saveDraft)
**Problem:** No validation for page numbers, limit values, email format.

**Fix Required:**
```typescript
if (page < 1) {
  throw new BadRequestException('Page must be >= 1');
}
if (limit < 1 || limit > 100) {
  throw new BadRequestException('Limit must be between 1 and 100');
}
```

---

## Phase 3: Medium Priority (P2) - THIS SPRINT

### 3.1 Missing API Endpoints

#### Issue 3.1.1: Missing AI Endpoints
**Priority:** P2 - Medium
**Problem:** Backend has AI endpoints but frontend is missing:
- `analyzeSentiment(emailId, locale?)`
- `calculatePriority(emailId, locale?, senderImportance?)`
- `analyzeEmail(emailId, locale?)`
- `chat(message, conversationHistory?, conversationId?)`
- `composeEmail(prompt, tone?, context?, locale?)`

---

#### Issue 3.1.2: Missing Calendar Invite Endpoints
**Priority:** P2 - Medium
**Problem:** Backend has send/cancel calendar invite but frontend only has respond:
- `sendCalendarInvite(payload)`
- `cancelCalendarInvite(eventId, reason?)`

---

#### Issue 3.1.3: Missing Folder Management API
**Priority:** P2 - Medium
**Problem:** Entire `folders.ts` API client is missing. Backend has full CRUD.

---

#### Issue 3.1.4: Missing Email Sync Management
**Priority:** P2 - Medium
**Problem:** Frontend only has 2 sync methods, backend has 9+:
- `syncAllProviders()`
- `getSyncHealth()`
- `getQueues()`
- `pauseQueue(priority)`
- `resumeQueue(priority)`
- `clearQueue(priority)`
- `createAllWebhooks()`
- `renewWebhooks()`
- `getWebhookHealth()`

---

### 3.2 Performance Optimizations

#### Issue 3.2.1: N+1 Query in `bulkAddLabels`
**Priority:** P2 - Medium
**Lines:** 1382-1392
**Problem:** Fetches labels separately from email query.

**Fix:** Use `Promise.all` to parallelize.

---

#### Issue 3.2.2: Duplicate Query in `updateEmail`
**Priority:** P2 - Medium
**Lines:** 442-443
**Problem:** Re-queries after update instead of using `include` in update.

---

### 3.3 Use Email Actions Hook Issues

#### Issue 3.3.1: Using Single-Update API Instead of Bulk
**Priority:** P2 - Medium
**Lines:** 165-168, 190-193
**Problem:** `handleToggleStar` and `handleToggleImportant` use single-email endpoints.

**Fix:** Use `emailApi.bulkStar([emailId], newStarred)` and `emailApi.bulkFlag([emailId], newImportant)`.

---

#### Issue 3.3.2: Inconsistent Store Method Usage
**Priority:** P2 - Medium
**Line:** 190
**Problem:** Uses generic `updateEmail` instead of `markAsImportant`.

---

## Phase 4: Low Priority (P3) - BACKLOG

### 4.1 Code Quality

- [ ] Add JSDoc comments to all exported functions
- [ ] Standardize error message format
- [ ] Add loading states to email actions hook
- [ ] Add request cancellation (AbortController) support
- [ ] Add response validation with Zod
- [ ] Implement pagination validation in store

### 4.2 Security Hardening

- [ ] Add input sanitization for case-insensitive queries
- [ ] Add cross-tenant validation in label operations
- [ ] Add user-level access control for provider emails

### 4.3 Monitoring & Observability

- [ ] Add success logging to all bulk operations
- [ ] Add performance metrics for slow queries
- [ ] Add memory usage monitoring for large lists

---

## Implementation Checklist

### Week 1: Critical Fixes (P0)
- [ ] Fix `deleteEmail` cleanup in email-store.ts
- [ ] Standardize ID handling (id vs threadId)
- [ ] Fix `updateEmail` race condition
- [ ] Add rollback to `handleEmailClick`
- [ ] Fix stale closures in use-email-actions.ts
- [ ] Fix `handleMarkAsRead` parameter
- [ ] Add transactions to backend delete operations
- [ ] Fix `getConversations` memory issue

### Week 2: Important Fixes (P1)
- [ ] Add memory limit to email store
- [ ] Fix `markAsRead` selectedEmail update
- [ ] Fix attachment download path
- [ ] Add API error handling wrapper
- [ ] Add timeout configuration
- [ ] Add WebSocket event to single delete
- [ ] Fix `getEmailById` soft delete filter
- [ ] Add input validation to backend

### Week 3-4: Medium Priority (P2)
- [ ] Create AI API endpoints
- [ ] Create calendar invite endpoints
- [ ] Create folders API client
- [ ] Create sync management endpoints
- [ ] Fix N+1 queries
- [ ] Optimize duplicate queries
- [ ] Use bulk API endpoints in hooks

### Backlog: Low Priority (P3)
- [ ] Documentation improvements
- [ ] Security hardening
- [ ] Monitoring setup

---

## Testing Requirements

After each fix, verify:
1. **Bulk delete** - Select all, delete, verify filters still work
2. **Infinite scroll** - Scroll down, load more, verify position maintained
3. **Smart filters** - Unread/starred/today show correct emails
4. **Thread expansion** - Expand thread, delete email, verify no errors
5. **Selection state** - Select emails, perform actions, verify cleared correctly
6. **Memory usage** - Load 1000+ emails, verify no memory growth

---

## Files to Modify

| File | Issues | Priority |
|------|--------|----------|
| `frontend/stores/email-store.ts` | 5 | P0-P1 |
| `frontend/hooks/use-email-actions.ts` | 5 | P0-P2 |
| `frontend/lib/api/email.ts` | 10 | P1-P2 |
| `frontend/lib/api/folders.ts` | CREATE | P2 |
| `frontend/lib/api-client.ts` | 2 | P1 |
| `backend/src/modules/email/services/emails.service.ts` | 12 | P0-P2 |

---

## References

- [TanStack Virtual Documentation](https://tanstack.com/virtual/latest)
- [Zustand Best Practices](https://docs.pmnd.rs/zustand/guides/practice-with-no-store-actions)
- [Prisma Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [React useCallback Pitfalls](https://react.dev/reference/react/useCallback)
