---
phase: 06
plan: 02
subsystem: frontend/email-chat
tags: [chat-overlay, fab, slide-panel, thread-context, useVoltAgentChat]
dependency-graph:
  requires:
    - "06-01: ViewContext, conversation isolation"
  provides:
    - "EmailChatFab: FAB component for chat toggle"
    - "EmailChatPanel: Slide-in chat panel with thread context"
    - "Thread page integration: AI chat overlay on email threads"
  affects:
    - "06-03: Will use same patterns for mobile chat"
    - "Future: Could extend to folder-level chat"
tech-stack:
  added: []
  patterns:
    - "MUI Slide transition for panel animation"
    - "Fixed position overlay (does not push content)"
    - "iOS safe area insets for mobile"
    - "Lazy-loaded ChatMessages via React.lazy"
key-files:
  created:
    - frontend/components/email/thread/EmailChatFab.tsx
    - frontend/components/email/thread/EmailChatPanel.tsx
  modified:
    - frontend/components/email/thread/index.ts
    - frontend/pages/dashboard/email/thread/[threadId].tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
decisions:
  - key: panel-width
    choice: "380px desktop, 100vw mobile"
    rationale: "Consistent with typical chat sidebars (Slack, Discord), full width on mobile for touch usability"
  - key: panel-position
    choice: "Fixed overlay, slides from right"
    rationale: "Does not disturb email reading flow, can be dismissed easily"
  - key: context-display
    choice: "Header shows subject + sender in context banner"
    rationale: "User always knows which email the AI is discussing"
metrics:
  tasks: 4/4
  duration: "7 minutes"
  completed: 2026-02-07
---

# Phase 06 Plan 02: Email Thread Chat Overlay Summary

Slide-in AI chat panel with FAB toggle for email thread views.

## What Was Built

### EmailChatFab (`frontend/components/email/thread/EmailChatFab.tsx`)
- Floating action button positioned in bottom-right corner
- Toggles between Sparkles (closed) and X (open) icons
- Zoom transition for smooth appearance
- Optional pulse animation for agent activity indicator
- iOS safe area insets for mobile devices

### EmailChatPanel (`frontend/components/email/thread/EmailChatPanel.tsx`)
- Slide transition from right (MUI Slide direction="left")
- 380px width on desktop, full width on mobile
- Header with AI icon, panel title, email subject preview
- Context banner showing sender information
- Lazy-loaded ChatMessages from AiDashboard
- Quick action buttons for empty state (Summarize, Draft reply, Key points)
- Error banner with retry for failed messages
- Input field with send button and stop control during streaming
- iOS safe area insets for header and input area

### Translations (`frontend/locales/en.ts`, `frontend/locales/it.ts`)
Added `ai.emailChat` namespace with:
- `panelTitle`: "AI Assistant" / "Assistente AI"
- `contextLabel`: "Regarding:" / "Riguardo a:"
- `inputPlaceholder`: "Ask about this email..." / "Chiedi informazioni su questa email..."
- `close`: "Close assistant" / "Chiudi assistente"
- `noMessages`: "Ask me anything about this email" / "Chiedimi qualsiasi cosa su questa email"
- `draftReply`: "Draft reply" / "Scrivi risposta"
- `keyPoints`: "Key points" / "Punti chiave"

### Thread Page Integration (`frontend/pages/dashboard/email/thread/[threadId].tsx`)
- Imported EmailChatFab and EmailChatPanel from thread index
- Added `chatOpen` state for panel toggle
- Extracted `senderEmail` for AI context
- FAB disabled while thread is loading
- Panel receives threadId, emailId, subject, and sender for context

## Technical Details

### ViewContext Usage
The panel uses `useVoltAgentChat` with thread-specific ViewContext:
```typescript
const viewContext: ViewContext = {
  currentView: 'thread',
  selectedEmailId: emailId,
  selectedFolderId: undefined,
  selectedContactId: undefined,
};
```

This enables the AI to understand the email context and provide relevant responses.

### Component Hierarchy
```
[threadId].tsx
  |-- EmailChatFab (fixed position, bottom-right)
  |-- EmailChatPanel (fixed position, right edge)
        |-- Header (title + close)
        |-- Context Banner (sender info)
        |-- ChatMessages (lazy loaded)
        |-- Quick Actions (when empty)
        |-- Error Banner (when failed)
        |-- Input Area (send/stop)
```

## Commits

| Hash | Description |
|------|-------------|
| eb2b0037 | feat(06-02): create EmailChatFab component |
| e42e75c7 | feat(06-02): create EmailChatPanel component |
| cf0793e0 | feat(06-02): add email chat panel translations |
| ac0cf0d4 | feat(06-02): integrate chat overlay in thread page |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Met

- [x] EmailChatFab component renders with proper positioning
- [x] EmailChatPanel slides in from right with email context
- [x] Chat uses useVoltAgentChat with thread ViewContext
- [x] Panel works on mobile (full width)
- [x] TypeScript and lint pass
- [x] No regressions in thread view functionality

## Next Phase Readiness

Ready for 06-03 (Mobile Chat Dialog). The patterns established here (ViewContext, panel structure, translations) will be reused for the mobile-optimized version.
