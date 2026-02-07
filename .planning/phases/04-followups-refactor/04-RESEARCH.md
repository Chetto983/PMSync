# Phase 04: Follow-Ups Refactor - Research Findings

**Research Date**: 2026-02-07
**Phase Goal**: Complete redesign of follow-ups UI with smart features
**Requirements**: FOLLOW-01 (UI refactor with Waiting For / To Do types), FOLLOW-02 (Smart timing + NLP deadline detection)

---

## 1. Executive Summary

Phase 04 builds on **substantial existing infrastructure** - this is an enhancement, not a greenfield build. The key gap is introducing **two follow-up types** (Waiting For vs To Do) which requires schema changes and UI reorganization. Smart timing and NLP deadline detection can leverage the **already-installed chrono-node library**.

### Key Findings

| Area | Status | Gap |
|------|--------|-----|
| Prisma Schema | ✅ Complete | Need `followUpType` enum (WAITING_FOR, TODO) |
| Backend Services | ✅ Extraction + Scanner done | Need auto-deadline from NLP |
| TanStack Query Hooks | ✅ Complete | None |
| Kanban UI | ✅ @dnd-kit working | Reorganize columns by type, not just status |
| NLP Library | ✅ chrono-node installed | Not yet used for auto-deadline |
| Smart Timing | ❌ Not started | Need analytics + recommendation engine |

---

## 2. Existing Codebase Analysis

### 2.1 Prisma Schema: EmailFollowUp Model

**Location**: `backend/prisma/schema.prisma` (lines 1035-1062)

```prisma
model EmailFollowUp {
  id             String         @id @default(cuid())
  tenantId       String
  userId         String
  emailId        String
  status         FollowUpStatus @default(PENDING)  // PENDING | REMINDED | RESOLVED | EXPIRED
  reason         String?
  dueDate        DateTime
  remindCount    Int            @default(0)
  commitments    Json?          // Array of ExtractedCommitment
  waitingFor     Json?          // Array of ExtractedWaitingFor
  actionItems    Json?          // Array of ExtractedActionItem
  emailType      String?        // receipt|notification|request|conversation|newsletter|alert
  confidence     Float?         // LLM confidence score (0.0-1.0)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  // Relations
  tenant         Tenant         @relation(fields: [tenantId], references: [id])
  user           User           @relation(fields: [userId], references: [id])
  email          Email          @relation(fields: [emailId], references: [id])

  @@index([tenantId, userId, status])
  @@index([tenantId, userId, dueDate])
  @@index([emailId])
}

enum FollowUpStatus {
  PENDING
  REMINDED
  RESOLVED
  EXPIRED
}
```

**Gap Identified**: No `followUpType` field to distinguish Waiting For vs To Do. The extraction already captures `waitingFor` and `actionItems` as JSON arrays, but the top-level type is missing.

### 2.2 Backend Services

#### FollowUpExtractionService
**Location**: `backend/src/modules/ai/voltagent/services/follow-up-extraction.service.ts`

Already extracts:
- `commitments`: Promises made by sender (dates, deliverables)
- `waitingFor`: Things sender expects from recipient
- `actionItems`: Tasks sender must complete

Uses Mistral with JSON mode, temperature 0.1 for deterministic extraction.

**Smart urgency detection** already implemented:
```typescript
// Only ASAP/today/tomorrow = urgent, "this week"/"next week" = NOT urgent
private isUrgentKeyword(deadline: string): boolean {
  const urgentPattern = /\b(asap|immediately|urgent|today|tomorrow|by (end of )?today)\b/i;
  return urgentPattern.test(deadline);
}
```

#### FollowUpScannerService
**Location**: `backend/src/modules/ai/voltagent/services/follow-up-scanner.service.ts`

Features:
- RAG-based semantic search for follow-up candidates
- Confidence thresholds: >0.8 high, 0.6-0.8 medium (verify with LLM)
- Stalled thread detection (7+ days without reply)
- VIP contact boost for confidence scoring

#### FollowUpController
**Location**: `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts`

Complete REST API:
- `GET /follow-ups` - List with filters (status, limit, search)
- `GET /follow-ups/pending` - Pending items
- `GET /follow-ups/overdue` - Overdue items
- `GET /follow-ups/stats` - Dashboard statistics
- `POST /follow-ups` - Create new
- `POST /follow-ups/:id/resolve` - Mark resolved
- `POST /follow-ups/:id/snooze` - Snooze with new dueDate
- `PATCH /follow-ups/:id/status` - Update status
- `DELETE /follow-ups/:id` - Delete

### 2.3 Frontend Components

#### Kanban Board
**Location**: `frontend/components/productivity/KanbanBoard/index.tsx`

Full implementation with:
- **@dnd-kit**: DndContext, DragOverlay, closestCorners collision detection
- **Keyboard shortcuts**: j/k (up/down), h/l (prev/next column), r (resolve), s (snooze), Escape (deselect)
- **Virtual OVERDUE column**: Date-based grouping (not a real status)
- **Search filtering**: By subject or contact name
- **Snooze dialog**: Presets (1h, 4h, tomorrow, next week) + custom date

**Current Column Structure** (status-based):
```typescript
const columns: KanbanColumnId[] = ['PENDING', 'OVERDUE', 'RESOLVED', 'EXPIRED'];
```

**Gap**: Columns are organized by status, not by type. Requirement asks for "Waiting For" and "To Do" separation.

#### KanbanCard
**Location**: `frontend/components/productivity/KanbanBoard/KanbanCard.tsx`

Displays:
- Subject, contact name, relative due date
- Extraction chips: commitments, waitingFor, actionItems counts
- Priority indicators
- Hover actions: resolve, snooze, view email, delete

#### TanStack Query Hooks
**Location**: `frontend/hooks/queries/use-follow-ups.ts`

Complete implementation:
```typescript
// Queries
export function useFollowUpsList(options?: FollowUpQueryOptions)
export function useFollowUpStats()
export function usePendingFollowUps(limit?: number)
export function useOverdueFollowUps(limit?: number)

// Mutations
export function useCreateFollowUp()
export function useResolveFollowUp()
export function useSnoozeFollowUp()
export function useUpdateFollowUpStatus()
export function useDeleteFollowUp()
```

Types already defined:
```typescript
interface EmailFollowUp {
  id: string;
  emailId: string;
  status: 'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED';
  reason?: string;
  dueDate: string;
  remindCount: number;
  commitments?: ExtractedCommitment[];
  waitingFor?: ExtractedWaitingFor[];
  actionItems?: ExtractedActionItem[];
  emailType?: string;
  confidence?: number;
  subject: string;
  contactName: string;
  createdAt: string;
  updatedAt: string;
}
```

### 2.4 Existing Enhancement Plans

#### Phase 1 (COMPLETE)
**Location**: `docs/plans/2026-01-30-follow-up-enhancement.md`

Implemented:
- Confidence scoring (0.0-1.0)
- Extraction service for commitments/waitingFor/actionItems
- Stalled thread detection
- VIP contact boost

#### Phase 2 (PLANNED)
**Location**: `docs/plans/2026-01-30-follow-up-phase2-automation.md`

Planned features:
- Auto-resolve on reply detection
- `threadStatus` field (resolved/ongoing/stalled/escalated)
- Push notifications for overdue items

### 2.5 NLP Libraries Available

**Already in `backend/package.json`**:
```json
{
  "chrono-node": "^2.9.0",  // Date/time parsing
  "node-nlp": "^5.0.0-alpha.5"  // General NLP
}
```

**chrono-node** is ideal for deadline extraction:
```typescript
import * as chrono from 'chrono-node';

const results = chrono.parse('Please send by next Friday');
// results[0].start.date() → Date object for next Friday

const refDate = new Date('2026-02-07');
const deadline = chrono.parseDate('in 3 business days', refDate);
```

---

## 3. Competitive Analysis & UI Patterns

### 3.1 Industry Best Practices (from FEATURES.md research)

| Product | Follow-Up Approach |
|---------|-------------------|
| Superhuman | Split view: Waiting For (responses) vs To Do (tasks) |
| Shortwave | AI-prioritized with "due date" detection |
| Inbox Zero | Auto-archive with follow-up reminders |

**Key Insight**: Two Follow-Up Types are standard:
1. **Waiting For**: Emails where I'm waiting for someone else to respond
2. **To Do**: Emails where I need to take action

### 3.2 Smart Timing Research

From FEATURES.md competitive analysis:
- Single follow-up **doubles** response rate (16% → 27%)
- **Sweet spot**: 2-3 days after initial email
- After 3 follow-ups, returns diminish sharply
- Timing matters: Tuesday-Thursday 9-11am optimal

### 3.3 UI Pattern Recommendations

#### Tab-Based Organization (Recommended)
```
┌─────────────────────────────────────────────────┐
│ Today (5) │ This Week (12) │ Overdue (3) │ All │
├─────────────────────────────────────────────────┤
│ [Type: Waiting For ▼]                           │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ 📧 Project proposal - waiting for feedback  │ │
│ │    From: John | Due: Tomorrow               │ │
│ └─────────────────────────────────────────────┘ │
```

#### Kanban View (Current)
Keep for power users who prefer visual workflow:
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   PENDING    │   OVERDUE    │   RESOLVED   │   EXPIRED    │
│      (8)     │     (3)      │     (15)     │     (2)      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ [Card]       │ [Card]       │ [Card]       │ [Card]       │
│ [Card]       │ [Card]       │ [Card]       │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

#### Type Filter (NEW)
Add toggle or filter for:
```
[ ] Waiting For (5)    [ ] To Do (8)
```

---

## 4. Gap Analysis

### 4.1 Schema Changes Needed

```prisma
// Add to schema.prisma

enum FollowUpType {
  WAITING_FOR  // I'm waiting for someone's response
  TODO         // I need to take action
}

model EmailFollowUp {
  // ... existing fields ...

  followUpType   FollowUpType   @default(TODO)  // NEW
  detectedDeadline DateTime?    // NEW - NLP-extracted deadline
  deadlineSource   String?      // NEW - "nlp" | "manual" | "extraction"
}
```

### 4.2 Service Changes Needed

#### FollowUpExtractionService Enhancement
```typescript
// Add automatic type detection
private detectFollowUpType(email: Email, extraction: ExtractionResult): FollowUpType {
  // If email is in SENT folder and has waitingFor items → WAITING_FOR
  // If email is in INBOX and has actionItems → TODO
  if (email.folderId === 'SENT' && extraction.waitingFor.length > 0) {
    return 'WAITING_FOR';
  }
  return 'TODO';
}

// Add chrono-node deadline extraction
private extractDeadline(text: string): Date | null {
  const results = chrono.parse(text, new Date());
  if (results.length > 0) {
    return results[0].start.date();
  }
  return null;
}
```

### 4.3 UI Changes Needed

1. **Type Toggle/Filter**: Add to Kanban header
2. **Tab View**: New alternative to Kanban (list-based)
3. **Type Indicator**: Show "Waiting For" or "To Do" badge on cards
4. **Deadline Confidence**: Show if deadline was auto-detected vs manual

---

## 5. Technical Recommendations

### 5.1 NLP Approach: chrono-node (Already Installed)

**DO NOT add new libraries.** Use chrono-node which is already in dependencies.

```typescript
import * as chrono from 'chrono-node';

// Basic extraction
const deadline = chrono.parseDate('Please reply by Friday', new Date());

// With reference date for "next week" etc.
const refDate = new Date('2026-02-07');
const results = chrono.parse('Send the report by end of next week', refDate);

// Get structured result
results[0].start.get('day');    // Day of month
results[0].start.get('month');  // Month (1-12)
results[0].start.date();        // Full Date object
```

**Advantages**:
- Zero additional dependencies
- Handles relative dates ("next Friday", "in 3 days")
- Supports business days
- Locale-aware

### 5.2 Smart Timing Implementation

#### Analytics Table
```prisma
model FollowUpAnalytics {
  id            String   @id @default(cuid())
  tenantId      String
  userId        String
  contactId     String?

  sentAt        DateTime
  repliedAt     DateTime?
  followUpCount Int      @default(0)
  wasSuccessful Boolean?

  dayOfWeek     Int      // 0-6
  hourOfDay     Int      // 0-23

  @@index([tenantId, userId, contactId])
}
```

#### Recommendation Engine
```typescript
interface TimingRecommendation {
  suggestedDate: Date;
  confidence: number;  // 0-1
  reason: string;      // "Based on 85% response rate on Tuesdays"
}

function recommendFollowUpTime(contactId: string): TimingRecommendation {
  // 1. Check contact-specific patterns
  // 2. Fall back to user's overall patterns
  // 3. Default to "2-3 days, Tuesday-Thursday 9-11am"
}
```

### 5.3 Internationalization

Translations already exist in `frontend/locales/en.ts`:
```typescript
ai: {
  followUpTracker: {
    title: 'Follow-Up Tracker',
    snooze: { title: 'Snooze', oneHour: '1 hour', ... },
    kanban: {
      columns: { pending: 'Pending', overdue: 'Overdue', ... },
      empty: { noPending: 'No pending follow-ups', ... }
    }
  }
}
```

**Need to add**:
```typescript
ai: {
  followUpTracker: {
    types: {
      waitingFor: 'Waiting For',
      todo: 'To Do'
    },
    deadlineDetected: 'Deadline detected',
    smartTiming: {
      recommended: 'Recommended time',
      basedOn: 'Based on your patterns'
    }
  }
}
```

---

## 6. Implementation Plan Structure

### FOLLOW-01: UI Refactor with Types

**Estimated Tasks**:
1. Schema migration: Add `followUpType` enum and field
2. Backend: Update extraction service to detect type
3. Frontend: Add type filter/toggle to Kanban
4. Frontend: Add type badge to KanbanCard
5. Frontend: Create Tab view as alternative
6. Translations: Add new strings

### FOLLOW-02: Smart Timing + NLP Deadline

**Estimated Tasks**:
1. Backend: Integrate chrono-node for deadline extraction
2. Schema: Add `detectedDeadline`, `deadlineSource` fields
3. Backend: Create analytics tracking for response patterns
4. Backend: Build recommendation engine
5. Frontend: Show detected deadline with confidence
6. Frontend: Smart timing suggestions in snooze dialog

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| chrono-node misparses dates | Medium | Add human-readable confirmation, allow override |
| Type detection wrong | Low | Allow manual type change |
| Analytics cold start | Low | Use industry defaults (2-3 days) until data builds |
| UI complexity | Medium | Keep Kanban as default, Tab view optional |

---

## 8. References

- **FEATURES.md**: `D:\MailAgent\.planning\research\FEATURES.md`
- **Phase 1 Plan**: `D:\MailAgent\docs\plans\2026-01-30-follow-up-enhancement.md`
- **Phase 2 Plan**: `D:\MailAgent\docs\plans\2026-01-30-follow-up-phase2-automation.md`
- **Kanban Board**: `D:\MailAgent\frontend\components\productivity\KanbanBoard\index.tsx`
- **chrono-node docs**: https://github.com/wanasit/chrono
- **Superhuman patterns**: Split Waiting For / To Do views
- **Shortwave patterns**: AI-prioritized with deadline detection

---

## 9. Conclusion

Phase 04 is an **enhancement phase** building on solid existing infrastructure. The main work is:

1. **Schema addition**: `followUpType` enum (WAITING_FOR, TODO)
2. **NLP integration**: Use already-installed chrono-node
3. **UI reorganization**: Type-based filtering, optional Tab view
4. **Analytics foundation**: Track patterns for smart timing

No major architectural changes needed. Estimated complexity: **Medium**.
