# Kanban Email Dashboard Feature Plan

## Overview

**Origin**: WhatsApp discussion 2026-01-27 (video reference: `docs/WhatsApp Video 2026-01-27 at 14.15.56.mp4`)

**Inspiration**: [Kanmail.io](https://kanmail.io/) - Email as Kanban columns

**Concept**: Design emails and follow-ups as a kanban board view, using existing npm packages rather than building from scratch. Include sticky note functionality for quick annotations.

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

Dedicated follow-up tracking:

| Column | Description | Follow-up Status |
|--------|-------------|------------------|
| **To Do** | Pending follow-ups not yet started | `pending` |
| **In Progress** | Follow-ups being actively worked on | `in_progress` |
| **Waiting** | Waiting for response/external action | `waiting` |
| **Done** | Completed follow-ups | `completed` |

### Kanban Card Content

Each card represents a follow-up and displays:
- **Title**: Email subject or custom title
- **Contact**: Person to follow up with
- **Due Date**: When follow-up is due
- **Priority**: High/Medium/Low indicator
- **Tags**: Custom labels
- **Sticky Notes**: Quick annotations attached to the card

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

### Option 1: react-beautiful-dnd (Atlassian)
```bash
npm install react-beautiful-dnd @types/react-beautiful-dnd
```
- **Pros**: Battle-tested, accessible, smooth animations
- **Cons**: No longer actively maintained (consider @hello-pangea/dnd fork)

### Option 2: @hello-pangea/dnd (Active Fork)
```bash
npm install @hello-pangea/dnd
```
- **Pros**: Active maintenance, drop-in replacement for react-beautiful-dnd
- **Cons**: Newer, smaller community

### Option 3: dnd-kit (Modern Choice)
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
- **Pros**: Modern, modular, great TypeScript support, active development
- **Cons**: More setup required, steeper learning curve

### Recommendation: **@dnd-kit** (Best 2025/2026 choice)
- Active development
- Excellent TypeScript support
- Modular architecture
- Better performance than older libraries

---

## Data Model

### Prisma Schema Extension

```prisma
// Add to existing FollowUp model
model FollowUp {
  id          String   @id @default(uuid())
  // ... existing fields ...

  // Kanban-specific fields
  kanbanColumn  String   @default("todo") // todo, in_progress, waiting, done
  kanbanOrder   Int      @default(0)       // Position within column

  stickyNotes   StickyNote[]
}

model StickyNote {
  id          String   @id @default(uuid())
  content     String
  color       String   @default("yellow") // yellow, pink, blue, green
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  followUpId  String
  followUp    FollowUp @relation(fields: [followUpId], references: [id], onDelete: Cascade)

  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@index([followUpId])
  @@index([tenantId])
}
```

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
export function FollowupsKanbanBoard() {
  const { data: followups } = useKanbanFollowups();
  const { moveFollowup } = useKanbanMutations();

  const columns = {
    todo: followups?.filter(f => f.kanbanColumn === 'todo') ?? [],
    in_progress: followups?.filter(f => f.kanbanColumn === 'in_progress') ?? [],
    waiting: followups?.filter(f => f.kanbanColumn === 'waiting') ?? [],
    done: followups?.filter(f => f.kanbanColumn === 'done') ?? [],
  };

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', p: 2 }}>
        {Object.entries(columns).map(([columnId, items]) => (
          <KanbanColumn key={columnId} id={columnId} items={items} />
        ))}
      </Box>
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

### Phase 1: Backend Foundation
- [ ] Add Prisma schema for StickyNote model
- [ ] Add Prisma schema for BoardView model
- [ ] Create database migration
- [ ] Add kanbanColumn and kanbanOrder to FollowUp
- [ ] Implement sticky notes API endpoints
- [ ] Implement board views API endpoints

### Phase 2: Email Kanban View
- [ ] Install @dnd-kit packages
- [ ] Create EmailKanbanBoard component
- [ ] Map folders/labels to columns
- [ ] Implement drag-drop to move emails between folders
- [ ] Create TanStack Query hooks for kanban data

### Phase 3: Follow-ups Kanban View
- [ ] Create FollowupsKanbanBoard component
- [ ] Implement status-based columns
- [ ] Wire up follow-up status mutations

### Phase 4: Sticky Notes
- [ ] Create StickyNote component
- [ ] Add note CRUD operations
- [ ] Color picker UI
- [ ] Attach notes to emails OR follow-ups

### Phase 5: Saved Views & Keyboard Shortcuts
- [ ] BoardView save/load UI
- [ ] Implement keyboard navigation (j/k/h/l)
- [ ] Implement action shortcuts (e/s/r/a)
- [ ] Shortcuts help modal (?)

### Phase 6: Polish
- [ ] Translations (EN/IT)
- [ ] Responsive design (mobile: vertical scroll)
- [ ] Empty state handling
- [ ] Loading skeletons
- [ ] WIP limit indicators

---

## Related Files

- Backend: `backend/src/modules/ai/voltagent/services/hitl.service.ts` (FollowUp handling)
- Frontend: `frontend/components/productivity/` (existing productivity widgets)
- API types: `frontend/lib/api/ai.ts` (voltAgentApi.listFollowUps)

---

## References

- Original discussion: WhatsApp Video 2026-01-27 at 14.15.56.mp4
- **Kanmail.io**: [kanmail.io](https://kanmail.io/) - Primary inspiration (email as kanban)
- **Jira Kanban**: [Atlassian Jira](https://www.atlassian.com/software/jira) - Enterprise kanban patterns
- dnd-kit docs: [dndkit.com](https://dndkit.com/)
- react-hotkeys-hook: [GitHub](https://github.com/JohannesKlawornn/react-hotkeys-hook)
- React Kanban examples: [GitHub Topics](https://github.com/topics/react-kanban)

---

## Summary

This feature transforms MailAgent into a **Kanmail-style** productivity tool:

1. **Email Kanban**: View inbox as columns (Inbox → To Read → Waiting → Done)
2. **Follow-ups Kanban**: Track follow-ups through workflow stages
3. **Sticky Notes**: Annotate emails/follow-ups with color-coded notes
4. **Keyboard-first**: vim-style navigation (j/k/h/l) + action shortcuts
5. **Saved Views**: Custom board layouts for different workflows

**Key differentiator**: AI-powered columns (Action Required, Priority, etc.) that Kanmail doesn't have.
