# Kanban Email Dashboard Feature Plan

## Overview

**Origin**: WhatsApp discussion 2026-01-27 (video reference: `docs/WhatsApp Video 2026-01-27 at 14.15.56.mp4`)

**Inspiration**: [Kanmail.io](https://kanmail.io/) - Email as Kanban columns

**Concept**: Design emails and follow-ups as a kanban board view, using existing npm packages rather than building from scratch. Include sticky note functionality for quick annotations.

**Last Updated**: 2026-01-30 (audit + 2026 best practices integration)

---

## Reference: Kanmail.io Features

| Feature | Description | MailAgent Implementation |
|---------|-------------|-------------------------|
| **Folders as Columns** | Email folders displayed as kanban columns | Map Gmail labels/folders to columns |
| **Drag-Drop Workflow** | Move emails between columns | Move between folders/labels |
| **Saved Views** | Different column combinations for projects | Custom board layouts per user |
| **Threading** | Auto-merge similar emails | Use existing thread grouping |
| **Keyboard Shortcuts** | Navigate/act without mouse | Add vim-like shortcuts |
| **Multi-Account** | Unified view across accounts | Already supported |
| **Sticky Notes** | Annotations on emails | NEW: Add to emails/follow-ups |

---

## Feature Requirements

### Mode 1: Email Kanban Board

Transform inbox into kanban workflow:

| Column | Source | Actions |
|--------|--------|---------|
| **Inbox** | `folder: INBOX, isRead: false` | New unread emails |
| **To Read** | Custom label or starred | Emails to process |
| **Waiting** | Custom label | Waiting for reply |
| **Action Required** | AI-detected action items | Needs response |
| **Done** | `folder: ARCHIVE` | Processed emails |

### Mode 2: Follow-ups Kanban Board

Dedicated follow-up tracking aligned with Prisma `EmailFollowUpStatus` enum:

| Column | Description | Follow-up Status | Color |
|--------|-------------|------------------|-------|
| **Pending** | Awaiting follow-up action | `PENDING` | Warning (amber) |
| **Reminded** | User has been reminded | `REMINDED` | Info (blue) |
| **Resolved** | Successfully completed | `RESOLVED` | Success (green) |
| **Expired** | Past due, no action taken | `EXPIRED` | Error (red) |

> **Note**: Status values must match Prisma schema exactly: `PENDING | REMINDED | RESOLVED | EXPIRED`

### Kanban Card Content

Each card represents a follow-up and displays:

**Core Fields:**
- **Title**: Email subject or custom title
- **Contact**: Person to follow up with (from `email.to` or `email.from`)
- **Due Date**: When follow-up is due
- **Reason**: AI-generated or user-provided reason
- **Status Badge**: Color-coded chip (warning/info/success/error)

**Extraction Data (2026-01-30 enhancement):**
- **Waiting For**: Items user is waiting on (from `waitingFor` Json field)
- **Commitments**: What user committed to do (from `commitments` Json field)
- **Action Items**: Tasks extracted from email (from `actionItems` Json field)
- **Confidence**: LLM confidence score (0-100%)
- **Email Type**: Classification (receipt/notification/request/conversation/newsletter/alert)

**Meta:**
- **Sticky Notes**: Quick annotations attached to the card
- **Reminder Count**: Number of reminders sent
- **Overdue Warning**: Visual indicator if past due date

### Sticky Notes Feature

- Attach multiple notes to any follow-up card
- Color-coded notes (yellow, pink, blue, green)
- Markdown support for formatting
- Timestamps for when notes were added
- Collapsible/expandable view

### Keyboard Shortcuts (Kanmail-inspired)

| Key | Action | Context |
|-----|--------|---------|
| `j/k` | Move down/up in list | Email list |
| `h/l` | Move left/right column | Kanban board |
| `Enter` | Open email/card | Any |
| `e` | Archive | Email selected |
| `#` | Delete/Trash | Email selected |
| `s` | Star/Unstar | Email selected |
| `r` | Reply | Email open |
| `a` | Reply all | Email open |
| `n` | Add sticky note | Card selected |
| `m` | Move to column... | Card selected |
| `?` | Show shortcuts help | Global |

### Saved Board Views

Users can save custom board configurations:

```typescript
interface BoardView {
  id: string;
  name: string;           // "Sales Pipeline", "Support Queue"
  columns: ColumnConfig[];
  filters?: FilterConfig;
  isDefault?: boolean;
}

interface ColumnConfig {
  id: string;
  title: string;
  source: 'folder' | 'label' | 'followup_status' | 'ai_category';
  sourceValue: string;    // e.g., "INBOX", "Action Required"
  wipLimit?: number;      // Optional WIP limit
  color?: string;
}
```

---

## Recommended NPM Packages

### Option 1: @dnd-kit (RECOMMENDED - 2026)

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

| Aspect | Rating | Notes |
|--------|--------|-------|
| TypeScript | ⭐⭐⭐⭐⭐ | First-class TS support, fully typed |
| Performance | ⭐⭐⭐⭐⭐ | Virtualization-ready, handles 1000+ items |
| Accessibility | ⭐⭐⭐⭐⭐ | ARIA, keyboard, screen reader support |
| Modularity | ⭐⭐⭐⭐⭐ | Tree-shakable, use only what you need |
| Touch/Mobile | ⭐⭐⭐⭐⭐ | PointerSensor for unified touch/mouse |
| Maintenance | ⭐⭐⭐⭐⭐ | Active development (2026) |

**Required packages:**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

### Option 2: @hello-pangea/dnd (Alternative)

```bash
npm install @hello-pangea/dnd
```

| Aspect | Rating | Notes |
|--------|--------|-------|
| TypeScript | ⭐⭐⭐⭐ | Good, but not first-class |
| Performance | ⭐⭐⭐ | Struggles with large lists |
| Accessibility | ⭐⭐⭐⭐⭐ | Excellent built-in |
| Modularity | ⭐⭐⭐ | Monolithic bundle |
| Touch/Mobile | ⭐⭐⭐⭐ | Works but requires config |
| Maintenance | ⭐⭐⭐⭐ | Active fork of react-beautiful-dnd |

**Use when:** Simpler Kanban with minimal configuration needed.

### Option 3: react-beautiful-dnd (DEPRECATED)

```bash
# ❌ DO NOT USE - No longer maintained by Atlassian
npm install react-beautiful-dnd @types/react-beautiful-dnd
```

### ✅ Final Recommendation: @dnd-kit

**Why @dnd-kit for MailAgent:**

1. **TypeScript-first** - Matches our codebase standards
2. **Sensor system** - PointerSensor, KeyboardSensor, TouchSensor for all inputs
3. **Collision detection** - closestCenter, closestCorners, rectIntersection algorithms
4. **Modifiers** - restrictToVerticalAxis, restrictToParentElement for column constraints
5. **Virtualization** - Works with @tanstack/react-virtual for large lists
6. **MUI integration** - Clean integration with Material UI components

---

## Data Model

### Prisma Schema Extension

```prisma
// EmailFollowUp model already exists with these fields (2026-01-30):
model EmailFollowUp {
  id            String               @id @default(uuid())
  tenantId      String
  userId        String
  emailId       String
  reason        String?
  status        EmailFollowUpStatus  @default(PENDING)  // PENDING | REMINDED | RESOLVED | EXPIRED
  dueDate       DateTime?
  reminderCount Int                  @default(0)
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  resolvedAt    DateTime?

  // Extraction data (already added 2026-01-30)
  commitments   Json?    // Array of { commitment, deadline, recipient }
  waitingFor    Json?    // Array of { waitingFor, fromWhom, deadline }
  actionItems   Json?    // Array of { action, deadline, priority, category }
  emailType     String?  // receipt | notification | request | conversation | newsletter | alert
  confidence    Float?   // 0.0 - 1.0 LLM confidence score

  // Kanban-specific fields (TO ADD)
  kanbanOrder   Int      @default(0)  // Position within column (status = column)

  // Relations
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  user          User     @relation(fields: [userId], references: [id])
  email         Email    @relation(fields: [emailId], references: [id], onDelete: Cascade)
  stickyNotes   StickyNote[]

  @@unique([tenantId, emailId])
  @@index([tenantId, userId, status])
  @@index([dueDate])
}

// NEW: StickyNote model for annotations
model StickyNote {
  id          String   @id @default(uuid())
  content     String   @db.Text
  color       String   @default("yellow")  // yellow | pink | blue | green
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  followUpId  String
  followUp    EmailFollowUp @relation(fields: [followUpId], references: [id], onDelete: Cascade)

  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  userId      String   // Owner of the note
  user        User     @relation(fields: [userId], references: [id])

  @@index([followUpId])
  @@index([tenantId, userId])
}
```

> **Note**: EmailFollowUp uses `status` field as the Kanban column. No separate `kanbanColumn` field needed.

---

## API Endpoints

### Kanban Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/followups/kanban` | Get all follow-ups grouped by column |
| `PATCH` | `/api/v1/followups/:id/move` | Move follow-up to different column |
| `PATCH` | `/api/v1/followups/:id/reorder` | Reorder within column |

### Sticky Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/followups/:id/notes` | List sticky notes for follow-up |
| `POST` | `/api/v1/followups/:id/notes` | Add sticky note |
| `PATCH` | `/api/v1/followups/:followupId/notes/:noteId` | Update sticky note |
| `DELETE` | `/api/v1/followups/:followupId/notes/:noteId` | Delete sticky note |

---

## Frontend Components

### Component Structure

```
components/
└── productivity/
    └── KanbanBoard/
        ├── index.tsx              # Main board component
        ├── KanbanColumn.tsx       # Column container
        ├── KanbanCard.tsx         # Follow-up card
        ├── StickyNote.tsx         # Sticky note component
        ├── StickyNoteForm.tsx     # Add/edit sticky note
        └── use-kanban-dnd.ts      # DnD hook logic
```

### EmailKanbanBoard Component (Kanmail-style)

```tsx
import { DndContext, closestCorners, DragEndEvent } from '@dnd-kit/core';
import { useEmailKanban, useMoveEmailToFolder } from '@/hooks/queries';
import { useHotkeys } from 'react-hotkeys-hook';

export function EmailKanbanBoard() {
  const { data: boardData } = useEmailKanban();
  const moveEmail = useMoveEmailToFolder();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Keyboard shortcuts (Kanmail-inspired)
  useHotkeys('j', () => moveSelection('down'));
  useHotkeys('k', () => moveSelection('up'));
  useHotkeys('h', () => moveSelection('left'));
  useHotkeys('l', () => moveSelection('right'));
  useHotkeys('e', () => archiveSelected());
  useHotkeys('s', () => starSelected());
  useHotkeys('n', () => openStickyNoteModal());

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const emailId = active.id as string;
    const targetFolder = over.id as string;

    moveEmail.mutate({ emailId, folder: targetFolder });
  };

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', p: 2, height: '100%' }}>
        {boardData?.columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            selectedCard={selectedCard}
            onSelectCard={setSelectedCard}
          />
        ))}
      </Box>
    </DndContext>
  );
}
```

### FollowupsKanbanBoard Component

```tsx
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useFollowUps, useUpdateFollowUpStatus } from '@/hooks/queries';
import type { EmailFollowUp, EmailFollowUpStatus } from '@/hooks/queries';

// Column configuration matching Prisma enum
const COLUMNS: { id: EmailFollowUpStatus; title: string; color: string }[] = [
  { id: 'PENDING', title: 'Pending', color: 'warning.main' },
  { id: 'REMINDED', title: 'Reminded', color: 'info.main' },
  { id: 'RESOLVED', title: 'Resolved', color: 'success.main' },
  { id: 'EXPIRED', title: 'Expired', color: 'error.main' },
];

export function FollowupsKanbanBoard() {
  const { data: followups, isLoading } = useFollowUps({ limit: 100 });
  const updateStatus = useUpdateFollowUpStatus();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors for pointer (mouse/touch) and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Group by status (which IS the column)
  const columns = useMemo(() => {
    const grouped: Record<EmailFollowUpStatus, EmailFollowUp[]> = {
      PENDING: [],
      REMINDED: [],
      RESOLVED: [],
      EXPIRED: [],
    };
    followups?.forEach((f) => {
      grouped[f.status]?.push(f);
    });
    // Sort by kanbanOrder within each column
    Object.values(grouped).forEach((col) =>
      col.sort((a, b) => (a.kanbanOrder ?? 0) - (b.kanbanOrder ?? 0))
    );
    return grouped;
  }, [followups]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const followUpId = active.id as string;
    const targetStatus = over.id as EmailFollowUpStatus;

    // Find current item to check if status changed
    const item = followups?.find((f) => f.id === followUpId);
    if (item && item.status !== targetStatus) {
      updateStatus.mutate({ id: followUpId, status: targetStatus });
    }
  };

  if (isLoading) return <KanbanSkeleton />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', p: 2, minHeight: 500 }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            color={col.color}
            items={columns[col.id]}
          />
        ))}
      </Box>

      {/* Drag overlay for smooth animation */}
      <DragOverlay>
        {activeId ? (
          <KanbanCard
            followUp={followups?.find((f) => f.id === activeId)!}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

---

## UI/UX Design

### Kanban Card Design

```
┌─────────────────────────────────┐
│ 🔴 High Priority          📎 2  │
├─────────────────────────────────┤
│ Follow up with John about       │
│ Q1 proposal                     │
├─────────────────────────────────┤
│ 👤 John Smith                   │
│ 📅 Due: Jan 30, 2026            │
├─────────────────────────────────┤
│ 🏷️ #sales #urgent               │
├─────────────────────────────────┤
│ 📝 Notes (2)                [+] │
│ ┌─────────────────────────────┐ │
│ │ Call scheduled for 3pm     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Sticky Note Colors

| Color | Hex | Use Case |
|-------|-----|----------|
| Yellow | `#FFF59D` | General notes |
| Pink | `#F8BBD9` | Important/urgent |
| Blue | `#90CAF9` | Questions/clarifications |
| Green | `#A5D6A7` | Completed actions |

---

## Implementation Phases

### Phase 1: Backend Foundation ✅ PARTIALLY COMPLETE

- [x] EmailFollowUp model exists with status enum
- [x] Extraction data fields added (commitments, waitingFor, actionItems, confidence, emailType)
- [x] FollowUpExtractionService implemented
- [ ] Add `kanbanOrder` field to EmailFollowUp
- [ ] Add Prisma schema for StickyNote model
- [ ] Create database migration for new fields
- [ ] Implement sticky notes API endpoints (`/api/v1/followups/:id/notes`)
- [ ] Implement reorder API endpoint (`PATCH /api/v1/followups/:id/reorder`)

### Phase 2: Follow-ups Kanban View (PRIORITY)

- [ ] Install @dnd-kit packages:
  ```bash
  cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
  ```
- [ ] Create component structure:
  ```
  frontend/components/productivity/KanbanBoard/
  ├── index.tsx                  # Main board with DndContext
  ├── KanbanColumn.tsx           # Droppable column
  ├── KanbanCard.tsx             # Draggable card (reuse FollowUpCard logic)
  ├── KanbanSkeleton.tsx         # Loading state
  └── use-kanban-dnd.ts          # DnD hook logic
  ```
- [ ] Create TanStack Query hooks in `hooks/queries/use-kanban.ts`
- [ ] Wire up status mutation on drag end
- [ ] Display extraction data in cards (waitingFor, commitments, actionItems)

### Phase 3: Email Kanban View

- [ ] Create EmailKanbanBoard component
- [ ] Map Gmail folders/labels to columns
- [ ] Implement drag-drop to move emails between folders
- [ ] Add folder color customization

### Phase 4: Sticky Notes

- [ ] Create StickyNote component with color picker
- [ ] Add note CRUD operations
- [ ] Markdown support with `react-markdown`
- [ ] Collapsible note list on cards

### Phase 5: Keyboard Shortcuts & Accessibility

- [ ] Install `react-hotkeys-hook`:
  ```bash
  cd frontend && npm install react-hotkeys-hook
  ```
- [ ] Implement keyboard navigation (j/k/h/l)
- [ ] Implement action shortcuts (Enter, e, s, n, m)
- [ ] Shortcuts help modal (`?` key)
- [ ] ARIA labels for screen readers
- [ ] Focus management for keyboard users

### Phase 6: Saved Views (Optional)

- [ ] BoardView model in Prisma
- [ ] Save/load board configurations per user
- [ ] Custom column ordering

### Phase 7: Polish & i18n

- [x] EN translations in `locales/en.ts`
- [x] IT translations in `locales/it.ts`
- [ ] Add Kanban-specific translations:
  ```typescript
  kanban: {
    columns: { pending: '...', reminded: '...', resolved: '...', expired: '...' },
    actions: { moveToColumn: '...', addNote: '...', reorder: '...' },
    empty: { noFollowUps: '...' },
  }
  ```
- [ ] Responsive design (mobile: vertical scroll, swipe gestures)
- [ ] Empty state handling per column
- [ ] Loading skeletons
- [ ] WIP limit indicators (optional)

---

## Related Files

### Backend

| File | Purpose |
|------|---------|
| `backend/src/modules/ai/voltagent/services/follow-up.service.ts` | Main follow-up orchestrator |
| `backend/src/modules/ai/voltagent/services/follow-up-extraction.service.ts` | LLM extraction (commitments, waitingFor, actionItems) |
| `backend/src/modules/ai/voltagent/services/follow-up-scanner.service.ts` | RAG batch scanning |
| `backend/src/modules/ai/voltagent/services/follow-up-scheduler.service.ts` | BullMQ job scheduling |
| `backend/prisma/schema.prisma` | EmailFollowUp model with extraction fields |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/components/ai/FollowUpTracker/FollowUpCard.tsx` | Card component (displays extraction data) |
| `frontend/components/ai/FollowUpTracker/FollowUpTracker.tsx` | List view |
| `frontend/hooks/queries/use-follow-ups.ts` | TanStack Query hooks + types |
| `frontend/lib/api/ai.ts` | voltAgentApi.listFollowUps |
| `frontend/locales/en.ts` | English translations |
| `frontend/locales/it.ts` | Italian translations |

### To Create (Kanban)

| File | Purpose |
|------|---------|
| `frontend/components/productivity/KanbanBoard/index.tsx` | Main Kanban board |
| `frontend/components/productivity/KanbanBoard/KanbanColumn.tsx` | Droppable column |
| `frontend/components/productivity/KanbanBoard/KanbanCard.tsx` | Draggable card |
| `frontend/hooks/queries/use-kanban.ts` | Kanban-specific hooks |

---

## References

- Original discussion: WhatsApp Video 2026-01-27 at 14.15.56.mp4
- **Kanmail.io**: [kanmail.io](https://kanmail.io/) - Primary inspiration (email as kanban)
- **Jira Kanban**: [Atlassian Jira](https://www.atlassian.com/software/jira) - Enterprise kanban patterns
- dnd-kit docs: [dndkit.com](https://dndkit.com/)
- react-hotkeys-hook: [GitHub](https://github.com/JohannesKlawornn/react-hotkeys-hook)
- React Kanban examples: [GitHub Topics](https://github.com/topics/react-kanban)

---

---

## 2026 Best Practices (Research Findings)

### Performance Optimization

| Technique | Library | Benefit |
|-----------|---------|---------|
| Virtualization | `@tanstack/react-virtual` | Render only visible cards (1000+ items) |
| Optimistic updates | TanStack Query | Instant UI feedback |
| Debounced reorder | `lodash.debounce` | Batch position updates |
| Memoization | `React.memo` | Prevent unnecessary re-renders |

### Accessibility Requirements (WCAG 2.1 AA)

```typescript
// @dnd-kit provides built-in accessibility
const announcements = {
  onDragStart: ({ active }) => `Picked up ${active.data.current?.title}`,
  onDragOver: ({ active, over }) => over
    ? `Moving ${active.data.current?.title} over ${over.id} column`
    : `${active.data.current?.title} is no longer over a droppable area`,
  onDragEnd: ({ active, over }) => over
    ? `Dropped ${active.data.current?.title} into ${over.id}`
    : `Cancelled moving ${active.data.current?.title}`,
};
```

### Mobile Touch Support

```typescript
import { PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  }),
);
```

### Collision Detection Algorithms

| Algorithm | Use Case |
|-----------|----------|
| `closestCenter` | Standard Kanban (recommended) |
| `closestCorners` | Multiple drop targets |
| `rectIntersection` | Large cards |
| `pointerWithin` | Precision placement |

---

## Summary

This feature transforms MailAgent into a **Kanmail-style** productivity tool:

1. **Follow-ups Kanban** (Priority): Track follow-ups through PENDING → REMINDED → RESOLVED → EXPIRED
2. **Email Kanban**: View inbox as columns (Inbox → To Read → Waiting → Done)
3. **AI Extraction Display**: Show commitments, waiting-for items, action items on cards
4. **Sticky Notes**: Annotate emails/follow-ups with color-coded notes
5. **Keyboard-first**: vim-style navigation (j/k/h/l) + action shortcuts
6. **Saved Views**: Custom board layouts for different workflows

**Key differentiators vs Kanmail:**

- ✅ AI-powered extraction (commitments, waiting-for, action items)
- ✅ Confidence scoring for follow-up importance
- ✅ Email type classification
- ✅ Multi-tenant support
- ✅ Integration with VoltAgent AI assistant
