# Phase 06: Chat UI and Agent Tool on Mail - Research

**Researched:** 2026-02-07
**Domain:** AI Chat UI + Agent Tool Integration for Email Actions
**Confidence:** HIGH

## Summary

This phase extends the chat infrastructure from Phase 02 to add actionable email tools directly in the chat interface. The goal is "agent tool on mail" - allowing users to perform email actions (reply, forward, archive, delete, label) through the chat while viewing specific emails.

The research covers three core areas:
1. **Chat UI improvements** - Fixing tool part rendering, enhancing visual feedback
2. **Context-aware agent tools** - Surfacing email-specific tools when viewing emails
3. **"Agent on Mail" pattern** - Chat overlay/panel when viewing an email thread

**Primary recommendation:** Implement a context-aware chat panel that adapts available actions based on `ViewContext`, showing email-specific quick actions when `currentView === 'thread'`, and rendering tool results inline with proper AI SDK v6 part type handling.

## Standard Stack

The project already has the required libraries. No new dependencies needed.

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | v4.x | Chat streaming, tool parts, useChat | Official VoltAgent integration |
| `@ai-sdk/react` | v4.x | useChat hook, UIMessage types | React hooks for AI SDK |
| `@voltagent/core` | Latest | Agent framework, tools | Project's agent infrastructure |
| `streamdown` | Latest | Markdown rendering in chat | Already integrated in ai-elements |
| `@tanstack/react-query` | v5.x | Data fetching, cache | Project's data layer |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MUI (Material-UI) | v5.x | UI components | All UI elements |
| lucide-react | Latest | Icons | All icons |
| tailwindcss | v3.x | Utility CSS for ai-elements | AI elements styling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline chat panel | Floating chat bubble | Less contextual but more familiar pattern |
| ai-elements (streamdown) | Plain MUI + react-markdown | ai-elements is already integrated, has tool support |
| VoltAgent tools | Direct API calls | Tools enable HITL pattern already in place |

**Installation:**
None required - all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

Phase 06 builds on existing files:
```
frontend/
├── components/ai/AiDashboard/
│   ├── ChatMessages.tsx          # MODIFY - Fix tool part rendering
│   ├── InlineActionCard.tsx      # EXISTS - HITL approval UI
│   ├── QuickActions.tsx          # MODIFY - Context-aware actions
│   └── EmailContextPanel.tsx     # NEW - Email-specific chat panel
├── hooks/
│   ├── use-voltagent-chat.ts     # MODIFY - Add emailContext support
│   └── use-email-chat-actions.ts # NEW - Email-specific quick actions
└── src/components/ai-elements/
    ├── message.tsx               # EXISTS - Streamdown rendering
    └── tool.tsx                  # EXISTS - Tool part rendering
```

### Pattern 1: Context-Aware Tool Surfacing

**What:** Show different quick actions based on ViewContext
**When to use:** Chat panel needs to adapt to where user is in the app
**Example:**
```typescript
// Source: Phase 02 ViewContext pattern (use-voltagent-chat.ts)
interface ViewContext {
  currentView: 'inbox' | 'thread' | 'calendar' | 'contacts' | 'compose' | 'dashboard' | 'ai';
  selectedEmailId?: string;  // When viewing a specific email
  selectedFolderId?: string;
  selectedContactId?: string;
}

// Quick actions adapt based on context
const emailActions = viewContext.currentView === 'thread' ? [
  { label: 'Reply', prompt: `Draft a reply to email ${viewContext.selectedEmailId}` },
  { label: 'Summarize', prompt: `Summarize this email thread` },
  { label: 'Archive', prompt: `Archive this email` },
  { label: 'Add label', prompt: `Add a label to this email` },
] : [
  { label: 'Unread summary', prompt: 'Summarize my unread emails' },
  { label: 'Today schedule', prompt: "What's on my agenda today?" },
];
```

### Pattern 2: AI SDK v6 Tool Part Rendering

**What:** Render tool invocations with proper type handling
**When to use:** Displaying assistant messages with tool calls
**Example:**
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling
// AI SDK v6 uses typed parts: 'dynamic-tool' or 'tool-{name}'
{message.parts.map((part, idx) => {
  if (part.type === 'text') {
    return <MessageResponse key={idx}>{part.text}</MessageResponse>;
  }

  // Dynamic tools (from MCP or VoltAgent)
  if (part.type === 'dynamic-tool') {
    return (
      <Tool key={part.toolCallId} defaultOpen={false}>
        <ToolHeader type="dynamic-tool" state={part.state} toolName={part.toolName} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={part.output} errorText={part.errorText} />
        </ToolContent>
      </Tool>
    );
  }

  // Static tools (type: 'tool-list_emails', 'tool-manage_email', etc.)
  if (part.type.startsWith('tool-')) {
    return (
      <Tool key={part.toolCallId} defaultOpen={false}>
        <ToolHeader type={part.type} state={part.state} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={part.output} />
        </ToolContent>
      </Tool>
    );
  }

  return null;
})}
```

### Pattern 3: Email Chat Overlay

**What:** Floating chat panel when viewing an email
**When to use:** User is in email thread view
**Example:**
```typescript
// Superhuman/Shortwave-inspired pattern
// Chat slides in from right side when viewing email
function EmailThreadView({ email }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* Email content - takes most space */}
      <Box sx={{ flex: 1 }}>
        <EmailContent email={email} />
      </Box>

      {/* Chat panel - slides in from right */}
      <Slide direction="left" in={chatOpen}>
        <Box sx={{ width: 380, borderLeft: '1px solid', height: '100%' }}>
          <EmailContextChat
            emailId={email.id}
            emailSubject={email.subject}
            emailFrom={email.from}
          />
        </Box>
      </Slide>

      {/* FAB to toggle chat */}
      <Fab onClick={() => setChatOpen(!chatOpen)}>
        <Sparkles />
      </Fab>
    </Box>
  );
}
```

### Anti-Patterns to Avoid

- **Separate email agent from chat**: Don't create a separate "email agent" - reuse the existing VoltAgent with email tools
- **Full page reload for tool actions**: Use HITL inline approval, not navigation to approval page
- **Modal dialogs for every action**: Use inline cards (InlineActionCard already exists)
- **Hiding tool execution from user**: Show tool progress and results transparently

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom parser | `streamdown` + ai-elements | Handles streaming, code blocks, mermaid |
| Tool approval UI | Custom modals | `InlineActionCard` | Already built with HITL best practices |
| Email actions | Direct API calls | VoltAgent tools | Enables HITL, learning, memory |
| Chat state management | Manual useState | `useVoltAgentChat` hook | Handles streaming, error states, retry |
| Tool part types | Manual type guards | AI SDK type utilities | `isStaticToolUIPart()`, `getStaticToolName()` |

**Key insight:** The Phase 02 infrastructure (VoltAgent + AI SDK + HITL) already handles the hard parts. Phase 06 is about surfacing these capabilities contextually, not rebuilding them.

## Common Pitfalls

### Pitfall 1: Tool Parts Not Rendering

**What goes wrong:** Tools execute on backend but don't appear in chat UI
**Why it happens:**
- VoltAgent's `toUIMessageStream()` format differs slightly from raw AI SDK
- Frontend code checks wrong part type (e.g., `tool-invocation` instead of `dynamic-tool`)
**How to avoid:**
- Always check both `dynamic-tool` AND `tool-{name}` patterns
- Add console.log in ChatMessages to dump actual part structure
- Trust `message.parts` array, not parsing text content
**Warning signs:** Backend logs show tool execution, but UI shows only text response

### Pitfall 2: ViewContext Stale in Transport

**What goes wrong:** Chat uses old ViewContext (e.g., wrong emailId)
**Why it happens:**
- useChat transport is memoized, captures stale values
- ViewContext changes but transport doesn't see it
**How to avoid:**
- Use `useRef` for ViewContext (already done in use-voltagent-chat.ts)
- Access ref in `prepareSendMessagesRequest` callback
**Warning signs:** AI responds about wrong email after switching threads

### Pitfall 3: HITL Actions Not Appearing

**What goes wrong:** Tool returns `requiresApproval: true` but no inline card shows
**Why it happens:**
- WebSocket subscription not active
- Query key mismatch for pendingActions
- Action filtered out by wrong conversationId
**How to avoid:**
- Verify WebSocket events fire (`websocketClient.onAiActionCreated`)
- Check `sessionId` matches `conversationId`
- Invalidate queries on all action events
**Warning signs:** Tool output says "pending approval" but UI shows nothing

### Pitfall 4: Mobile Chat Dialog Regressions

**What goes wrong:** Close button doesn't work, viewport issues
**Why it happens:**
- Event propagation conflicts with MUI Dialog
- iOS viewport issues with 100vh
**How to avoid:**
- Use `env(safe-area-inset-*)` for iOS safe areas
- Explicit onClick handler with stopPropagation
- Test on actual iOS device/simulator
**Warning signs:** Works on desktop, fails on mobile

## Code Examples

### Example 1: Email-Context Quick Actions

```typescript
// Source: Existing QuickActions.tsx pattern + ViewContext
interface EmailContextActionsProps {
  viewContext: ViewContext;
  onSelectQuery: (query: string) => void;
}

function EmailContextActions({ viewContext, onSelectQuery }: EmailContextActionsProps) {
  // Only show email-specific actions when viewing a thread
  if (viewContext.currentView !== 'thread' || !viewContext.selectedEmailId) {
    return null;
  }

  const actions = [
    { icon: <Reply size={16} />, label: 'Draft reply',
      prompt: 'Draft a professional reply to this email' },
    { icon: <Forward size={16} />, label: 'Forward summary',
      prompt: 'Summarize this email for forwarding' },
    { icon: <Archive size={16} />, label: 'Archive',
      prompt: 'Archive this email' },
    { icon: <Tag size={16} />, label: 'Add label',
      prompt: 'What label should I add to this email?' },
  ];

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {actions.map((action) => (
        <Chip
          key={action.label}
          icon={action.icon}
          label={action.label}
          onClick={() => onSelectQuery(action.prompt)}
          variant="outlined"
        />
      ))}
    </Stack>
  );
}
```

### Example 2: Tool Part State Handling

```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling
// Handle tool part states for proper UI feedback
function renderToolPart(part: ToolPart) {
  switch (part.state) {
    case 'input-streaming':
      return <ToolLoading message="Preparing..." />;
    case 'input-available':
      return <ToolInput input={part.input} />;
    case 'output-available':
      return <ToolOutput output={part.output} />;
    case 'output-error':
      return <ToolError error={part.errorText} />;
    case 'approval-requested':
      return <ToolApproval onApprove={...} onReject={...} />;
    default:
      return null;
  }
}
```

### Example 3: Email Context in Chat

```typescript
// Pass email context to VoltAgent for smarter responses
const { sendMessage } = useVoltAgentChat({
  viewContext: {
    currentView: 'thread',
    selectedEmailId: email.id,
    // Backend uses this to pre-fetch email context
  },
});

// User says "reply to this" - agent knows which email
await sendMessage('Draft a reply accepting the meeting');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic `tool-invocation` parts | Typed `tool-{name}` or `dynamic-tool` | AI SDK v5 (2024) | Type-safe tool rendering |
| Parse text for tool calls | Use `message.parts` array | AI SDK v4+ | Reliable tool detection |
| Modal dialogs for approval | Inline cards in chat | HITL best practices 2025 | Faster approvals, less friction |
| Separate email AI page | Context-aware chat overlay | Superhuman/Shortwave 2025 | Actions where user already is |
| Chat-only interface | Proactive suggestions + chat | Agentic UX patterns 2025 | Less prompting needed |

**Deprecated/outdated:**
- `message.content` for tool calls: Use `message.parts` instead
- `toolInvocations` property: Replaced by typed parts in AI SDK v5+
- Full-page HITL approval: Use inline InlineActionCard pattern

## Open Questions

### 1. Email Context Passing Depth

**What we know:**
- ViewContext passes `selectedEmailId` to backend
- Backend can fetch email content for RAG context

**What's unclear:**
- How much email content to include in agent context?
- Include full thread or just current email?
- Performance impact of large email threads

**Recommendation:** Start with subject + first 1000 chars of body. Add thread summary if user asks about "the thread".

### 2. Chat Panel Placement

**What we know:**
- Superhuman uses right-side slide panel
- Shortwave uses sidebar assistant

**What's unclear:**
- Should it be persistent or toggle-able?
- Overlay or split view?
- Same component as AI Dashboard or separate?

**Recommendation:** Start with FAB + slide-in panel (less intrusive). Can upgrade to persistent split later.

### 3. Tool Result Rendering Customization

**What we know:**
- ai-elements Tool component renders JSON
- Some tools (like email search) could have richer UI

**What's unclear:**
- Should email search results show email cards?
- How to handle large result sets?

**Recommendation:** Use collapsible Tool component for now. Rich cards are v2 enhancement.

## Sources

### Primary (HIGH confidence)
- [AI SDK UI: Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling) - Tool parts rendering
- [AI SDK: Human-in-the-Loop](https://ai-sdk.dev/cookbook/next/human-in-the-loop) - HITL approval patterns
- [VoltAgent AI SDK Integration](https://voltagent.dev/docs/ui/ai-sdk-integration/) - VoltAgent + useChat

### Secondary (MEDIUM confidence)
- [Agentic Design Patterns](https://agentic-design.ai/patterns/ui-ux-patterns) - UI patterns for AI agents
- [Microsoft UX for Agents](https://microsoft.design/articles/ux-design-for-agents/) - Agent UX guidelines
- [Shortwave vs Superhuman](https://zapier.com/blog/shortwave-vs-superhuman/) - Email AI UX benchmarks

### Tertiary (LOW confidence)
- AI SDK v6 blog post - May have newer patterns (needs verification)
- Community patterns for email + chat integration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working
- Architecture: HIGH - Patterns verified against AI SDK docs and existing codebase
- Pitfalls: HIGH - Based on Phase 02-04 investigation findings + AI SDK docs

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable patterns)
