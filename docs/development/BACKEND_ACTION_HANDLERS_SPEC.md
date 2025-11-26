# Backend Action Handlers Specification

Phase 2 Backend AI Integration - Handler Specifications

## Overview

This document specifies the action handlers implemented in Phase 2 to complete the multi-agent action executor service.

**File:** `backend/src/modules/ai/multi-agent/services/action-executor.service.ts`

---

## 1. GET_CONTACT Handler

### Purpose
Retrieves a specific contact by ID, email address, or name search.

### Payload

```typescript
interface GetContactPayload {
  contactId?: string;  // Direct lookup by ID
  email?: string;      // Lookup by email address
  name?: string;       // Partial name match
}
```

### Logic

1. **By ID:** Direct Prisma lookup with tenant filter
2. **By Email:**
   - First tries `array_contains` on JSON emails field
   - Falls back to in-memory search if needed
3. **By Name:** Partial case-insensitive match on displayName, firstName, or lastName

### Response

```typescript
{
  success: boolean;
  data: { contact: Contact } | undefined;
  error?: string;
}
```

---

## 2. GET_UNREAD Handler

### Purpose
Fetches unread emails with optional filtering by provider and folder.

### Payload

```typescript
interface GetUnreadPayload {
  limit?: number;      // Default: 10
  providerId?: string; // Filter by provider
  folder?: string;     // Filter by folder
}
```

### Logic

1. Builds WHERE clause with tenant filter, `isRead: false`, `isDeleted: false`
2. Optionally filters by providerId and folder
3. Orders by `receivedAt DESC`
4. Selects essential fields only (id, subject, from, to, receivedAt, snippet, isStarred, labels, folder)

### Response

```typescript
{
  success: true;
  data: {
    count: number;
    emails: Email[];
  };
}
```

---

## 3. CATEGORIZE_EMAIL Handler

### Purpose
Applies AI-suggested categories/labels to an email.

### Payload

```typescript
interface CategorizeEmailPayload {
  emailId: string;
  categories?: string[];  // Array of categories
  labels?: string[];      // Array of labels (alternative)
  category?: string;      // Single category
}
```

### Logic

1. Retrieves the email by ID with tenant filter
2. Accepts either `labels`, `categories` array, or single `category`
3. Merges new labels with existing (deduplicates with Set)
4. Updates email's labels field

### Response

```typescript
{
  success: true;
  data: {
    emailId: string;
    categorized: true;
    appliedCategories: string[];
    allLabels: string[];
  };
}
```

---

## 4. RESCHEDULE_EVENT Handler

### Purpose
Reschedules a calendar event to a new time, preserving duration if only start time is provided.

### Payload

```typescript
interface RescheduleEventPayload {
  eventId: string;
  newStartTime: string;   // ISO 8601
  newEndTime?: string;    // ISO 8601, optional
  reason?: string;        // Reason for reschedule
}
```

### Logic

1. Retrieves event by ID with tenant filter and provider relation
2. If `newEndTime` not provided, calculates it by preserving original duration
3. Appends reschedule reason to description (if provided)
4. Updates via CalendarService for proper provider sync

### Response

```typescript
{
  success: true;
  data: {
    eventId: string;
    rescheduled: true;
    newStartTime: string;
    newEndTime: string;
    reason?: string;
    event: CalendarEvent;
  };
}
```

---

## 5. Switch Statement Updates

Added cases in `execute()` method:

```typescript
case AgentActionType.GET_CONTACT:
  result = await this.executeGetContact(action, context);
  break;
case AgentActionType.GET_UNREAD:
  result = await this.executeGetUnread(action, context);
  break;
case AgentActionType.CATEGORIZE_EMAIL:
  result = await this.executeCategorizeEmail(action, context);
  break;
case AgentActionType.RESCHEDULE_EVENT:
  result = await this.executeRescheduleEvent(action, context);
  break;
```

---

## 6. Action Types Enum Reference

The following action types are now fully implemented:

| Action Type | Handler | Status |
|-------------|---------|--------|
| SEND_EMAIL | executeSendEmail | Implemented |
| REPLY_EMAIL | executeReplyEmail | Implemented |
| FORWARD_EMAIL | executeForwardEmail | Implemented |
| DELETE_EMAIL | executeDeleteEmail | Implemented |
| ARCHIVE_EMAIL | executeArchiveEmail | Implemented |
| MARK_READ/UNREAD | executeMarkEmail | Implemented |
| STAR_EMAIL/UNSTAR | executeStarEmail | Implemented |
| SEARCH_EMAILS | executeSearchEmails | Implemented |
| LABEL_EMAIL | executeLabelEmail | Implemented |
| GET_UNREAD | executeGetUnread | **NEW** |
| CATEGORIZE_EMAIL | executeCategorizeEmail | **NEW** |
| CREATE_EVENT | executeCreateEvent | Implemented |
| UPDATE_EVENT | executeUpdateEvent | Implemented |
| DELETE_EVENT | executeDeleteEvent | Implemented |
| GET_EVENTS | executeGetEvents | Implemented |
| CHECK_AVAILABILITY | executeCheckAvailability | Implemented |
| RESCHEDULE_EVENT | executeRescheduleEvent | **NEW** |
| CREATE_CONTACT | executeCreateContact | Implemented |
| UPDATE_CONTACT | executeUpdateContact | Implemented |
| DELETE_CONTACT | executeDeleteContact | Implemented |
| SEARCH_CONTACTS | executeSearchContacts | Implemented |
| MERGE_CONTACTS | executeMergeContacts | Implemented |
| GET_CONTACT | executeGetContact | **NEW** |

---

## 7. Build Verification

**Status:** PASSED

- ESLint: No errors (warnings only in pre-existing code)
- TypeScript: Compiles successfully
- Backend: Ready for integration testing

---

## 8. Still Not Implemented

The following action types are defined but not yet implemented:

| Action Type | Priority | Notes |
|-------------|----------|-------|
| ENRICH_CONTACT | LOW | Requires external enrichment API |
| INVITE_ATTENDEES | MEDIUM | Can use UPDATE_EVENT |
| SCHEDULE_MEETING | MEDIUM | Can use CREATE_EVENT |
| SEARCH_KNOWLEDGE | LOW | Requires RAG integration |
| ADD_TO_KNOWLEDGE | LOW | Requires RAG integration |
| NOTIFY_USER | LOW | Requires notification service |

These will be addressed in future phases.

---

*Document Version: 1.0*
*Last Updated: Phase 2 Implementation*
