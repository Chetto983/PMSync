# Email AI Components Specification

Phase 1 Email AI Integration - Component Specifications

## Overview

This document specifies the behavior and requirements for the Email AI components implemented in Phase 1 of the AI Integration Roadmap.

---

## 1. SmartReplySuggestions Component

**Location:** `frontend/components/email/ai/SmartReplySuggestions.tsx`

### Purpose
Provides AI-generated reply suggestions for emails that users can select and insert into their reply composition.

### Props Interface

```typescript
interface SmartReplySuggestionsProps {
  emailId: string;           // Required: ID of the email to generate replies for
  onSelectReply: (reply: string) => void; // Callback when user selects a reply
  onDismiss?: () => void;    // Optional callback when panel is dismissed
  defaultExpanded?: boolean; // Initial expanded state (default: true)
  showToneSelector?: boolean; // Show tone options (default: true)
}

type ReplyTone = 'formal' | 'casual' | 'technical';
```

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| SR-1 | Display collapsible panel with AI-generated reply suggestions | High |
| SR-2 | Support three tone options: formal, casual, technical | High |
| SR-3 | Show loading state while generating suggestions | High |
| SR-4 | Allow regeneration of suggestions | Medium |
| SR-5 | Support clicking a suggestion to insert it | High |
| SR-6 | Display empty state when no suggestions available | Medium |
| SR-7 | Support i18n for all labels (EN, IT) | High |

### State Management

- **isExpanded:** Controls panel collapse/expand state
- **isLoading:** Indicates generation in progress
- **selectedTone:** Current tone selection
- **replies:** Array of generated reply strings

### API Integration

```typescript
// Expected endpoint (to be implemented in Phase 2)
POST /ai/email/smart-replies
{
  emailId: string,
  tone: 'formal' | 'casual' | 'technical'
}
Response: { replies: string[] }
```

### Accessibility Requirements

- Collapsible panel follows ARIA accordion pattern
- Tone selector uses proper radio button semantics
- Loading states announced to screen readers
- Keyboard navigation for suggestion selection

---

## 2. EmailSummaryPanel Component

**Location:** `frontend/components/email/ai/EmailSummaryPanel.tsx`

### Purpose
Displays AI-generated summary of an email including key points and extracted action items.

### Props Interface

```typescript
interface EmailSummaryPanelProps {
  emailId: string;            // Required: ID of email to summarize
  defaultExpanded?: boolean;  // Initial expanded state (default: true)
  showExtractedItems?: boolean; // Show dates/tasks (default: true)
  onAddToCalendar?: (item: ExtractedItem) => void; // Calendar action callback
  onAddTask?: (item: ExtractedItem) => void; // Task creation callback
  autoLoad?: boolean;         // Auto-generate on mount (default: false)
}

interface ExtractedItem {
  type: 'date' | 'task' | 'contact';
  value: string;
  context?: string;
}
```

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| ES-1 | Display collapsible panel with email summary | High |
| ES-2 | Parse and display key points as bullet list | High |
| ES-3 | Extract and display action items (dates, tasks) | High |
| ES-4 | Support "Add to Calendar" action for date items | Medium |
| ES-5 | Support "Add as Task" action for task items | Medium |
| ES-6 | Allow copy summary to clipboard | Medium |
| ES-7 | Support regeneration of summary | Medium |
| ES-8 | Support i18n for all labels (EN, IT) | High |
| ES-9 | Show loading state during generation | High |

### State Management

- **isExpanded:** Controls panel collapse/expand state
- **isLoading:** Indicates generation in progress
- **summary:** Generated summary text
- **keyPoints:** Array of parsed bullet points
- **extractedItems:** Array of detected dates/tasks
- **copied:** Temporary state for copy confirmation

### API Integration

```typescript
// Expected endpoint (to be implemented in Phase 2)
POST /ai/email/summarize
{
  emailId: string
}
Response: {
  summary: string,
  keyPoints: string[],
  extractedItems: ExtractedItem[]
}
```

### Key Points Parsing

The component extracts bullet points from the summary using the pattern:
```
- Point one
- Point two
```

If no bullet points found, the full summary is displayed.

### Accessibility Requirements

- Collapsible panel follows ARIA accordion pattern
- Copy button provides feedback via both visual and aria-live
- Action buttons have clear labels for screen readers
- Extracted items list uses proper list semantics

---

## 3. Index Exports

**Location:** `frontend/components/email/ai/index.ts`

### Exports

```typescript
// Components
export { SmartReplySuggestions } from './SmartReplySuggestions';
export { EmailSummaryPanel } from './EmailSummaryPanel';

// Types
export type { SmartReplySuggestionsProps, ReplyTone } from './SmartReplySuggestions';
export type { EmailSummaryPanelProps, ExtractedItem } from './EmailSummaryPanel';
```

---

## 4. Translations

**Locations:**
- `frontend/locales/en.ts`
- `frontend/locales/it.ts`
- `frontend/locales/index.ts` (type definitions)

### Translation Keys

```typescript
emailAi: {
  smartReplies: {
    title: string;
    generateMore: string;
    tone: string;
    formal: string;
    casual: string;
    technical: string;
    noReplies: string;
    clickToInsert: string;
    generating: string;
  };
  summary: {
    title: string;
    regenerate: string;
    copy: string;
    copied: string;
    keyPoints: string;
    extractedItems: string;
    addToCalendar: string;
    addTask: string;
    noSummary: string;
    generating: string;
    generate: string;
  };
  categorization: {
    title: string;
    suggested: string;
    apply: string;
    dismiss: string;
    confidence: string;
  };
}
```

---

## 5. Integration Points

### ThreadDisplay Integration (Future)

The components should be integrated into the email thread display:

```tsx
// Example integration in ThreadDisplay.tsx
import { SmartReplySuggestions, EmailSummaryPanel } from '@/components/email/ai';

// In the email view
<EmailSummaryPanel
  emailId={selectedEmail.id}
  onAddToCalendar={handleAddToCalendar}
  onAddTask={handleAddTask}
/>

// In the reply composer area
<SmartReplySuggestions
  emailId={selectedEmail.id}
  onSelectReply={handleInsertReply}
/>
```

### Backend API Requirements

For full functionality, these backend endpoints are needed:

1. `POST /ai/email/smart-replies` - Generate smart reply suggestions
2. `POST /ai/email/summarize` - Generate email summary with extraction
3. `POST /ai/email/categorize` - Suggest email labels/categories

---

## 6. Test Scenarios

### SmartReplySuggestions

| Scenario | Expected Behavior |
|----------|-------------------|
| Initial render with default props | Panel expanded, formal tone selected |
| Generate replies | Shows loading, then displays suggestions |
| Change tone | Regenerates with new tone |
| Select reply | Calls onSelectReply callback with reply text |
| No replies available | Shows empty state message |
| Collapse/expand panel | Toggles visibility with animation |

### EmailSummaryPanel

| Scenario | Expected Behavior |
|----------|-------------------|
| Initial render (autoLoad=false) | Shows "Generate Summary" button |
| Initial render (autoLoad=true) | Auto-loads summary on mount |
| Generate summary | Shows loading, then displays summary |
| Summary with key points | Parses and displays as bullet list |
| Click copy | Copies to clipboard, shows "Copied!" |
| Click "Add to Calendar" | Calls onAddToCalendar with item |
| Click "Add as Task" | Calls onAddTask with item |
| Regenerate | Clears and regenerates summary |

---

## 7. Build Verification

**Status:** PASSED

- Lint: No errors
- Build: Successful compilation
- Type checking: No TypeScript errors

---

## 8. Next Steps (Phase 2)

1. Implement backend endpoints for smart replies and summarization
2. Integrate components into ThreadDisplay
3. Connect to real AI service (multi-agent system)
4. Add unit tests when test framework is set up
5. Implement categorization component

---

*Document Version: 1.0*
*Last Updated: Phase 1 Implementation*
