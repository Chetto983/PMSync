# Phase 86: AI Chat Bug Fix — Migrate to Official Patterns - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning
**Source:** Research session (AI SDK v6 + assistant-ui 0.12.x best practices audit)

<domain>
## Phase Boundary

Migrate the entire chat frontend from deprecated assistant-ui patterns to official 0.12.x best practices. Fix thread persistence (missing chat history), fix tool rendering (invisible tools), clean up legacy HITL code. Delete dead code paths.

**What this phase delivers:**
- Working chat history across page reloads (thread persistence via backend API)
- All tool UIs rendering correctly via `MessagePrimitive.Content components.tools`
- HITL approval using AI SDK v6 native `needsApproval` + `sendAutomaticallyWhen`
- Zero deprecated API usage (`makeAssistantToolUI`, `AllToolUIs` pattern removed)
- Legacy HITL code deleted (AiActionsBell, PendingAction types, old ai.ts methods)

</domain>

<decisions>
## Implementation Decisions

### Tool UI Architecture
- Replace ALL `makeAssistantToolUI()` calls (deprecated in 0.12.x) with `MessagePrimitive.Content components={{ tools: { by_name: {...}, Fallback } }}` pattern
- Delete `<AllToolUIs />` barrel component — tool renderers are static config, not mounted components
- Each tool UI becomes a plain React function component receiving `ToolCallMessagePartProps`
- `Fallback` component handles all unregistered tools + HITL approval cards

### Thread Persistence
- Use `useRemoteThreadListRuntime` with custom `PmSyncThreadListAdapter` (already created)
- Add `unstable_Provider` on the adapter that injects `ThreadHistoryAdapter` via `RuntimeAdapterProvider`
- `ThreadHistoryAdapter.load()` calls `GET /ai/chat/conversations/:id` (already created) to load messages
- `ThreadHistoryAdapter.append()` is a no-op — backend persists messages during SSE streaming
- Backend auto-generates titles — `generateTitle()` throws to skip client-side generation

### HITL Approval Flow
- Backend tools use `needsApproval: true` on HIGH-risk tools (already in place)
- Frontend uses `sendAutomaticallyWhen` from AI SDK for auto-continue after approval
- Tool part states: `approval-requested` → render approve/deny UI → `addToolApprovalResponse()`
- Delete old `addResult()` pattern from FallbackToolUI

### Runtime Configuration
- Keep `useChatRuntime` but pass custom adapter via `useRemoteThreadListRuntime`
- `AssistantChatTransport` with `credentials: 'include'` + CSRF header (existing pattern is correct)
- `prepareSendMessagesRequest` extracts last user text + conversationId (existing pattern is correct)

### Legacy Code Deletion
- Delete `frontend/components/layout/header/AiActionsBell.tsx` (already deleted in commit c35fd72e)
- Delete `PendingAction` type and HITL API methods from `frontend/lib/api/ai.ts` (already partially cleaned)
- Remove any remaining `ActionType`, `mapToolToActionType` references
- Delete `makeAssistantToolUI` imports from all 17 tool UI files

### Claude's Discretion
- Exact tool UI component signatures (as long as they match `ToolCallMessagePartProps`)
- Whether to keep `ChainOfThought` auto-expand on pending approval (nice UX, keep if compatible)
- CSS class naming in tool UI components
- Error boundary strategy for individual tool renderers

</decisions>

<specifics>
## Specific Ideas

### Tool Renderer Map Structure
```typescript
// In AssistantMessage.tsx
<MessagePrimitive.Content
  components={{
    Text: MarkdownWithStreaming,
    ChainOfThought: ChatChainOfThought,
    tools: {
      by_name: {
        search_emails: EmailSearchRenderer,
        list_emails: ListEmailsRenderer,
        // ... all 17+ tools
      },
      Fallback: ToolFallback,
    },
  }}
/>
```

### ThreadHistoryAdapter Pattern
```typescript
unstable_Provider: ({ children }) => {
  const history = useMemo<ThreadHistoryAdapter>(() => ({
    async load() {
      const remoteId = aui.threadListItem().remoteId;
      if (!remoteId) return { messages: [] };
      const res = await apiClient.get(`/ai/chat/conversations/${remoteId}`);
      return { messages: convertDbMessagesToThreadMessages(res.data.conversation.messages) };
    },
    async append() { /* no-op — backend persists during streaming */ },
  }), [aui]);
  return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>;
}
```

### HITL with AI SDK v6
```typescript
// Import from ai package
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

// In useChat config
sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
```

</specifics>

<deferred>
## Deferred Ideas

- Full shadcn ToolFallback installation (can use custom MUI-based fallback instead)
- `withFormat` stub on ThreadHistoryAdapter (only needed if silent load failures observed)
- Thread rename endpoint on backend (backend auto-generates titles)
- Thread archive/unarchive endpoints (currently maps to delete)

</deferred>

---

*Phase: 86-ai-chat-bug-fix-migrate-to-official-patterns*
*Context gathered: 2026-03-19 via research session*
