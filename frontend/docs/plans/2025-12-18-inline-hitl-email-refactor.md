# Email Module Complete Refactor + Inline HITL - 2025 Best Practices

## Overview

**Two-Part Refactoring:**
1. **Part A:** Clean up the email module - split large files, follow patterns from dashboard/AI modules
2. **Part B:** Add rich inline HITL approval with action-specific forms

Inspired by Superhuman's inline compose, ChatGPT Canvas, and 2025 AI assistant best practices.

---

## Market Research Insights (December 2025)

### Superhuman AI Features (Industry Leader)
- **Instant Reply**: Every email has a draft ready - user just edits and sends
- **Auto Drafts**: AI writes follow-ups automatically, matching your voice
- **Voice Matching**: AI learns your tone from previous emails
- **Keyboard-first**: Blazing fast interface, no mouse needed
- **Auto Summarize**: One-line summary above every conversation
- **Ask AI**: Natural language search across inbox, calendar, web

> "Users save 4+ hours per week, reply 12 hours faster" - [Superhuman AI](https://superhuman.com/ai)

### ChatGPT Canvas UX Patterns
- **Inline Editing**: Select text → targeted AI edits (Claude Artifacts lacks this)
- **Side-by-Side**: Content and chat work together
- **Minimal Rewrites**: Only changes what's necessary, preserves context
- **Direct Manipulation**: Edit content manually within the interface

> "Canvas truly offers a collaborative space where you and ChatGPT can work together" - [ChatGPT Canvas vs Claude Artifacts](https://allthings.how/chatgpt-canvas-vs-claude-artifacts-how-do-they-differ/)

### Human-in-the-Loop Best Practices
- **Clear Checkpoints**: Accept, reject, or modify AI suggestions
- **Training Loop**: Every approval/rejection becomes training data
- **Graceful Recovery**: Handle errors without losing context
- **Async Decisions**: Familiar tools (Slack, Email) for human input

> "HITL prevents irreversible errors and catches ethical issues AI might overlook" - [HITL Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices)

### React Form UX 2025
- **React Hook Form + MUI**: Minimize re-renders, proper validation
- **Modular Architecture**: Atoms → Molecules → Organisms
- **Persistent Labels**: Never disappearing placeholders
- **Framer Motion**: Subtle animations enhance UX

### Key Takeaways for Our Implementation
| Feature | Source | Our Implementation |
|---------|--------|-------------------|
| Draft-first approach | Superhuman | Pre-populate email forms with AI drafts |
| Inline editing | ChatGPT Canvas | Edit directly in InlineActionCard |
| Voice matching | Superhuman | Use user's previous emails for tone |
| Targeted edits | Canvas | Select text → AI refine (future) |
| Approval checkpoints | HITL | Clear approve/reject/edit buttons |
| Keyboard shortcuts | Superhuman | Tab, Enter, Escape navigation |

---

## PART A: EMAIL MODULE CLEANUP

### Current Problem: File Size Violations

| File | Current Lines | Max Allowed | Status |
|------|---------------|-------------|--------|
| `ComposeDialog.tsx` | **1274** | 500 | ❌ CRITICAL |
| `EmailSidebar.tsx` | **864** | 500 | ❌ CRITICAL |
| `AiChatPanel.tsx` | **694** | 500 | ❌ Over limit |
| `ThreadList.tsx` | **604** | 500 | ❌ Over limit |
| `AttachmentPreview.tsx` | 504 | 500 | ⚠️ Slightly over |

### Target Architecture

```
components/email/
├── index.tsx                      # Module exports
├── EmailLayout.tsx               # Main layout container (~100 lines)
├── ResizableEmailLayout.tsx      # Resize logic (keep)
│
├── Compose/
│   ├── index.tsx                 # ComposeDialog entry (~80 lines)
│   ├── ComposeForm.tsx           # Form fields (To/Cc/Subject) (~150 lines)
│   ├── ComposeEditor.tsx         # TipTap editor wrapper (~120 lines)
│   ├── ComposeToolbar.tsx        # EditorToolbar (already exists) (~100 lines)
│   ├── ComposeRecipients.tsx     # To/Cc/Bcc fields (~120 lines)
│   ├── ComposeAttachments.tsx    # Attachment handling (~100 lines)
│   ├── ComposeFooter.tsx         # Send/Draft buttons (~80 lines)
│   ├── hooks/
│   │   ├── useComposeState.ts    # Form state management
│   │   ├── useComposeSubmit.ts   # Send/draft logic
│   │   └── useComposeAI.ts       # AI compose integration
│   └── ai/
│       ├── AiComposeDialog.tsx   # AI prompt dialog (keep)
│       └── AiChatPanel/
│           ├── index.tsx         # Entry (~100 lines)
│           ├── ChatMessages.tsx  # Message list (~150 lines)
│           ├── ChatInput.tsx     # Input area (~100 lines)
│           └── PresetActions.tsx # Quick action buttons (~80 lines)
│
├── Sidebar/
│   ├── index.tsx                 # EmailSidebar entry (~100 lines)
│   ├── AccountSelector.tsx       # Provider dropdown (~80 lines)
│   ├── FolderList.tsx            # Folder navigation (~150 lines)
│   ├── FolderItem.tsx            # Single folder item (~80 lines)
│   ├── LabelList.tsx             # Label navigation (~100 lines)
│   ├── SidebarFooter.tsx         # Quick actions (~60 lines)
│   └── DroppableFolderItem.tsx   # DnD support (keep)
│
├── List/
│   ├── index.tsx                 # ThreadList entry (~100 lines)
│   ├── ThreadListHeader.tsx      # Search, filters (~100 lines)
│   ├── ThreadListBody.tsx        # Virtualized list (~150 lines)
│   ├── ThreadListItem.tsx        # Single item (keep, refactor)
│   ├── BulkActionBar/            # (keep existing)
│   └── hooks/
│       ├── useThreadList.ts      # List state
│       ├── useThreadSelection.ts # Selection logic
│       └── useVirtualList.ts     # Virtualization
│
├── Thread/
│   ├── index.tsx                 # Thread entry
│   ├── ThreadDisplay.tsx         # (keep, refactor)
│   ├── ThreadMessage.tsx         # (keep)
│   └── ThreadActions.tsx         # Reply/Forward buttons
│
├── AI/
│   ├── EmailSummaryPanel.tsx     # (keep)
│   ├── SmartReplySuggestions.tsx # (keep)
│   └── AISearchBar.tsx           # (keep)
│
└── shared/
    ├── index.tsx                 # Exports
    ├── EmailBody.tsx             # (keep)
    ├── InlineReplyComposer.tsx   # (keep)
    ├── ContactAutocomplete.tsx   # (move from root)
    └── AttachmentPreview/
        ├── index.tsx             # Entry (~100 lines)
        ├── ImagePreview.tsx      # Image handling (~80 lines)
        ├── PDFPreview.tsx        # PDF handling (~80 lines)
        └── GenericPreview.tsx    # Fallback (~60 lines)
```

### Refactoring Steps - Part A

#### Step A1: Split ComposeDialog (1274 → ~500 total across files)
- [ ] Extract `ComposeRecipients.tsx` - To/Cc/Bcc fields with ContactAutocomplete
- [ ] Extract `ComposeEditor.tsx` - TipTap editor wrapper
- [ ] Extract `ComposeAttachments.tsx` - File upload/display logic
- [ ] Extract `ComposeFooter.tsx` - Send/Draft/Discard buttons
- [ ] Extract `useComposeState.ts` - Form state hook
- [ ] Extract `useComposeSubmit.ts` - Submit logic hook
- [ ] Refactor `ComposeDialog/index.tsx` to use extracted components

#### Step A2: Split EmailSidebar (864 → ~500 total)
- [ ] Extract `AccountSelector.tsx` - Provider dropdown
- [ ] Extract `FolderList.tsx` - Folder navigation with drag-drop
- [ ] Extract `FolderItem.tsx` - Single folder with context menu
- [ ] Extract `LabelList.tsx` - Label section
- [ ] Refactor `EmailSidebar/index.tsx` as container

#### Step A3: Split AiChatPanel (694 → ~400 total)
- [ ] Extract `ChatMessages.tsx` - Message rendering
- [ ] Extract `ChatInput.tsx` - Input with presets
- [ ] Extract `PresetActions.tsx` - Quick action buttons
- [ ] Refactor `AiChatPanel/index.tsx` as container

#### Step A4: Split ThreadList (604 → ~400 total)
- [ ] Extract `ThreadListHeader.tsx` - Search/filters
- [ ] Extract `ThreadListBody.tsx` - Virtualized list
- [ ] Extract `useThreadList.ts` - List state hook
- [ ] Extract `useThreadSelection.ts` - Selection logic

#### Step A5: Split AttachmentPreview (504 → ~300 total)
- [ ] Extract `ImagePreview.tsx` - Image handling
- [ ] Extract `PDFPreview.tsx` - PDF handling
- [ ] Extract `GenericPreview.tsx` - Fallback

---

## Research Sources

- [Superhuman AI Email Draft](https://blog.superhuman.com/ai-email-draft/) - Inline compose with AI
- [ChatGPT Canvas](https://openai.com/index/introducing-canvas/) - Side-by-side editing
- [Zapier Best AI Email Assistants 2025](https://zapier.com/blog/best-ai-email-assistant/)
- [HITL Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices)

---

## Current State Analysis

### Existing Components (Reusable)

| Component | File | Purpose | Reusable For HITL |
|-----------|------|---------|-------------------|
| `ComposeDialog` | `email/ComposeDialog/ComposeDialog.tsx` | Full email composer | Email drafts |
| `InlineReplyComposer` | `email/shared/InlineReplyComposer.tsx` | Inline reply | Quick replies |
| `ContactAutocomplete` | `email/ContactAutocomplete.tsx` | @ mention contacts | All forms |
| `AiComposeDialog` | `email/ComposeDialog/AiComposeDialog.tsx` | AI prompt for compose | AI refinement |
| `EditorToolbar` | `email/ComposeDialog/EditorToolbar.tsx` | Rich text toolbar | Email body |
| `SmartReplySuggestions` | `email/ai/SmartReplySuggestions.tsx` | Quick reply chips | Suggestions |
| `CalendarInviteCard` | `email/CalendarInviteCard/` | Calendar event card | Event preview |
| `SchedulingDrawer` | `calendar/ai/SchedulingDrawer.tsx` | AI scheduling | Calendar forms |

### Current HITL Components

| Component | File | Status |
|-----------|------|--------|
| `InlineActionCard` | `ai/AiDashboard/InlineActionCard.tsx` | Basic - needs enhancement |
| `PendingActionsWidget` | `ai/AiDashboard/PendingActionsWidget.tsx` | Sidebar widget |
| `PendingActionsPanel` | `dashboard/ai/PendingActionsPanel.tsx` | Dashboard panel |

---

## Phase 1: Architecture Design

### 1.1 Component Hierarchy

```
InlineActionCard (container)
├── ActionHeader (icon, type, severity, status)
├── ActionPreview (expandable)
│   ├── EmailDraftPreview    → uses InlineReplyComposer
│   ├── CalendarEventPreview → uses CalendarInviteCard style
│   └── ContactUpdatePreview → uses ContactCard style
├── ActionEditor (when editing)
│   ├── EmailDraftEditor     → uses ComposeDialog fields
│   ├── CalendarEventEditor  → uses event form fields
│   └── ContactUpdateEditor  → uses contact form fields
└── ActionFooter (Approve/Reject buttons)
```

### 1.2 Action Type Registry

```typescript
// lib/ai/action-types.ts
export const ACTION_TYPE_CONFIG = {
  SEND_EMAIL: {
    icon: Mail,
    color: 'info',
    previewComponent: 'EmailDraftPreview',
    editorComponent: 'EmailDraftEditor',
    requiredFields: ['to', 'subject', 'body'],
    optionalFields: ['cc', 'bcc', 'attachments'],
  },
  REPLY_EMAIL: {
    icon: Reply,
    color: 'info',
    previewComponent: 'EmailDraftPreview',
    editorComponent: 'EmailDraftEditor',
    requiredFields: ['body'],
    optionalFields: ['cc', 'bcc'],
  },
  CREATE_EVENT: {
    icon: Calendar,
    color: 'success',
    previewComponent: 'CalendarEventPreview',
    editorComponent: 'CalendarEventEditor',
    requiredFields: ['title', 'startTime', 'endTime'],
    optionalFields: ['location', 'attendees', 'description'],
  },
  UPDATE_CONTACT: {
    icon: User,
    color: 'warning',
    previewComponent: 'ContactUpdatePreview',
    editorComponent: 'ContactUpdateEditor',
    requiredFields: ['contactId'],
    optionalFields: ['email', 'phone', 'company', 'notes'],
  },
  // ... more action types
};
```

---

## Phase 2: Email Draft Preview/Editor

### 2.1 EmailDraftPreview Component

Displays the AI-generated email draft inline with read-only preview.

```typescript
// components/ai/AiDashboard/actions/EmailDraftPreview.tsx
interface EmailDraftPreviewProps {
  payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    replyToMessageId?: string;
  };
  onEdit: () => void;
}

/**
 * Features:
 * - Shows recipients with avatars (like thread view)
 * - Subject line prominently displayed
 * - Body preview with HTML rendering (sanitized)
 * - "Edit" button to switch to editor mode
 * - Quoted text collapsed if replying
 */
```

### 2.2 EmailDraftEditor Component

Full editing capability using existing compose components.

```typescript
// components/ai/AiDashboard/actions/EmailDraftEditor.tsx
interface EmailDraftEditorProps {
  payload: EmailPayload;
  onChange: (payload: EmailPayload) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Reuses:
 * - ContactAutocomplete for To/Cc/Bcc fields
 * - EditorToolbar for rich text formatting
 * - TipTap editor for body (from ComposeDialog)
 *
 * Features:
 * - @ mentions to quickly add recipients
 * - AI refinement button (tone, length, etc.)
 * - Preview mode toggle
 */
```

### 2.3 @ Mention Integration

```typescript
// Extend ContactAutocomplete for inline use
interface InlineContactAutocompleteProps {
  value: string[];
  onChange: (contacts: string[]) => void;
  placeholder: string;
  // @ trigger character support
  triggerChar?: '@';
  // Compact mode for inline display
  variant?: 'standard' | 'compact';
}
```

---

## Phase 3: Calendar Event Preview/Editor

### 3.1 CalendarEventPreview Component

```typescript
// components/ai/AiDashboard/actions/CalendarEventPreview.tsx
interface CalendarEventPreviewProps {
  payload: {
    title: string;
    startTime: string;
    endTime: string;
    location?: string;
    attendees?: string[];
    description?: string;
    calendarId?: string;
  };
  onEdit: () => void;
}

/**
 * Design:
 * - Uses CalendarInviteCard styling
 * - Shows date/time in user's locale
 * - Attendee chips with availability status
 * - Location with map link if address
 */
```

### 3.2 CalendarEventEditor Component

```typescript
// components/ai/AiDashboard/actions/CalendarEventEditor.tsx
interface CalendarEventEditorProps {
  payload: CalendarEventPayload;
  onChange: (payload: CalendarEventPayload) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Reuses:
 * - Date/time pickers from SchedulingDrawer
 * - ContactAutocomplete for attendees
 * - Calendar selector dropdown
 *
 * Features:
 * - AI time suggestion chips
 * - Conflict detection indicator
 * - Duration quick-select buttons
 */
```

---

## Phase 4: Contact Update Preview/Editor

### 4.1 ContactUpdatePreview Component

```typescript
// components/ai/AiDashboard/actions/ContactUpdatePreview.tsx
interface ContactUpdatePreviewProps {
  payload: {
    contactId: string;
    contactName: string;
    updates: Partial<Contact>;
  };
  onEdit: () => void;
}

/**
 * Design:
 * - Shows contact avatar + name
 * - Diff view: before → after
 * - Highlights changed fields
 */
```

### 4.2 ContactUpdateEditor Component

```typescript
// components/ai/AiDashboard/actions/ContactUpdateEditor.tsx
interface ContactUpdateEditorProps {
  payload: ContactUpdatePayload;
  onChange: (payload: ContactUpdatePayload) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Reuses:
 * - Contact form fields from contacts/createDialog
 * - Validation from existing contact forms
 */
```

---

## Phase 5: Enhanced InlineActionCard

### 5.1 Refactored Structure

```typescript
// components/ai/AiDashboard/InlineActionCard.tsx (enhanced)

export function InlineActionCard({ action, onStatusChange }: Props) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [editedPayload, setEditedPayload] = useState(action.payload);

  const actionConfig = ACTION_TYPE_CONFIG[action.actionType];

  return (
    <ActionCardContainer severity={action.severity} status={action.status}>
      <ActionHeader
        icon={actionConfig.icon}
        title={getActionTypeLabel(action.actionType)}
        severity={action.severity}
        status={action.status}
        onExpand={() => setExpanded(!expanded)}
      />

      <Collapse in={expanded}>
        {/* AI Reasoning */}
        {action.reasoningSteps && (
          <AIReasoningSection reasoning={action.reasoningSteps} />
        )}

        {/* Dynamic Preview/Editor based on action type */}
        {mode === 'preview' ? (
          <ActionPreview
            actionType={action.actionType}
            payload={editedPayload}
            onEdit={() => setMode('edit')}
          />
        ) : (
          <ActionEditor
            actionType={action.actionType}
            payload={editedPayload}
            onChange={setEditedPayload}
            onSave={() => setMode('preview')}
            onCancel={() => {
              setEditedPayload(action.payload);
              setMode('preview');
            }}
          />
        )}
      </Collapse>

      {/* Approve/Reject Footer */}
      {action.status === 'PENDING' && (
        <ActionFooter
          onApprove={() => approveMutation.mutate(editedPayload)}
          onReject={() => rejectMutation.mutate()}
          isLoading={approveMutation.isPending || rejectMutation.isPending}
        />
      )}
    </ActionCardContainer>
  );
}
```

### 5.2 ActionPreview Dynamic Router

```typescript
// components/ai/AiDashboard/actions/ActionPreview.tsx
function ActionPreview({ actionType, payload, onEdit }: Props) {
  switch (actionType) {
    case 'SEND_EMAIL':
    case 'REPLY_EMAIL':
    case 'FORWARD_EMAIL':
      return <EmailDraftPreview payload={payload} onEdit={onEdit} />;

    case 'CREATE_EVENT':
    case 'UPDATE_EVENT':
      return <CalendarEventPreview payload={payload} onEdit={onEdit} />;

    case 'UPDATE_CONTACT':
    case 'CREATE_CONTACT':
      return <ContactUpdatePreview payload={payload} onEdit={onEdit} />;

    default:
      return <GenericActionPreview payload={payload} onEdit={onEdit} />;
  }
}
```

### 5.3 ActionEditor Dynamic Router

```typescript
// components/ai/AiDashboard/actions/ActionEditor.tsx
function ActionEditor({ actionType, payload, onChange, onSave, onCancel }: Props) {
  switch (actionType) {
    case 'SEND_EMAIL':
    case 'REPLY_EMAIL':
    case 'FORWARD_EMAIL':
      return (
        <EmailDraftEditor
          payload={payload}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

    case 'CREATE_EVENT':
    case 'UPDATE_EVENT':
      return (
        <CalendarEventEditor
          payload={payload}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

    case 'UPDATE_CONTACT':
    case 'CREATE_CONTACT':
      return (
        <ContactUpdateEditor
          payload={payload}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

    default:
      return (
        <GenericActionEditor
          payload={payload}
          onChange={onChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
  }
}
```

---

## Phase 6: Implementation Roadmap

### Step 1: Create Action Type Registry
- [ ] Create `lib/ai/action-types.ts` with type configurations
- [ ] Define icons, colors, required/optional fields
- [ ] Export TypeScript types for each action payload

### Step 2: Email Draft Components
- [ ] Create `EmailDraftPreview.tsx` - read-only preview
- [ ] Create `EmailDraftEditor.tsx` - full editor with ContactAutocomplete
- [ ] Integrate TipTap editor from ComposeDialog
- [ ] Add AI refinement button integration

### Step 3: Calendar Event Components
- [ ] Create `CalendarEventPreview.tsx` - event card preview
- [ ] Create `CalendarEventEditor.tsx` - event form
- [ ] Integrate date/time pickers
- [ ] Add conflict detection

### Step 4: Contact Update Components
- [ ] Create `ContactUpdatePreview.tsx` - diff preview
- [ ] Create `ContactUpdateEditor.tsx` - contact form
- [ ] Add field validation

### Step 5: Refactor InlineActionCard
- [ ] Add preview/edit mode switching
- [ ] Integrate ActionPreview router
- [ ] Integrate ActionEditor router
- [ ] Update approve mutation to use edited payload

### Step 6: Add @ Mention Support
- [ ] Extend ContactAutocomplete with @ trigger
- [ ] Add compact variant for inline use
- [ ] Test in email editor context

### Step 7: Localization
- [ ] Add all new strings to `en.ts`
- [ ] Add all new strings to `it.ts`
- [ ] Update TypeScript types in `locales/index.ts`

### Step 8: Testing & Polish
- [ ] Unit tests for each preview/editor component
- [ ] E2E test for full HITL flow
- [ ] Accessibility review
- [ ] Mobile responsiveness check

---

## File Structure

```
frontend/components/ai/AiDashboard/
├── index.tsx                    # Main dashboard
├── ChatMessages.tsx             # Chat display
├── InlineActionCard.tsx         # Enhanced card (refactored)
├── actions/
│   ├── index.tsx               # Exports
│   ├── ActionPreview.tsx       # Dynamic preview router
│   ├── ActionEditor.tsx        # Dynamic editor router
│   ├── ActionHeader.tsx        # Shared header component
│   ├── ActionFooter.tsx        # Approve/Reject buttons
│   ├── AIReasoningSection.tsx  # AI explanation display
│   ├── EmailDraftPreview.tsx   # Email preview
│   ├── EmailDraftEditor.tsx    # Email editor
│   ├── CalendarEventPreview.tsx # Calendar preview
│   ├── CalendarEventEditor.tsx  # Calendar editor
│   ├── ContactUpdatePreview.tsx # Contact preview
│   ├── ContactUpdateEditor.tsx  # Contact editor
│   └── GenericActionPreview.tsx # Fallback for unknown types
└── ...

frontend/lib/ai/
├── action-types.ts             # Action type registry
├── action-validators.ts        # Payload validation
└── action-utils.ts             # Helper functions
```

---

## Expected Outcomes

1. **Rich Draft Experience** - Email drafts shown with full formatting, editable inline
2. **@ Mention Contacts** - Quick contact selection anywhere in the form
3. **Action-Specific Forms** - Dedicated UX for each action type
4. **Seamless Editing** - Preview → Edit → Preview flow without page navigation
5. **AI Refinement** - One-click tone/length adjustments
6. **Consistency** - Reuses existing components, follows MUI theme

---

## Dependencies

- Existing `ContactAutocomplete` component
- Existing `ComposeDialog` editor components
- Existing `CalendarInviteCard` styling
- TipTap editor (already integrated)
- MUI theme tokens (from Phase 1 MUI redesign)

---

## Notes

- All components should use translations from `t.ai.inlineAction.*`
- Follow CLAUDE.md rules for file organization and translations
- Prefer theme colors over hardcoded values
- Maximum file size: 500 lines per component
