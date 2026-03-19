# Phase 86: AI Chat Bug Fix -- Migrate to Official Patterns - Research

**Researched:** 2026-03-19
**Domain:** assistant-ui 0.12.x + AI SDK v6 frontend chat migration
**Confidence:** HIGH

## Summary

This phase migrates the PMSync chat frontend from deprecated `makeAssistantToolUI` + `<AllToolUIs />` barrel pattern to the official `MessagePrimitive.Content components.tools.by_name` pattern in assistant-ui 0.12.x. It also adds thread persistence via `ThreadHistoryAdapter` and fixes HITL approval to use AI SDK v6 native `addToolApprovalResponse`.

The current codebase has 17 tool UIs all using `makeAssistantToolUI()` which creates self-registering components that must be mounted inside `<AssistantRuntimeProvider>`. The new pattern passes tool renderers as a static config object to `MessagePrimitive.Content`, eliminating the need for mount-based registration and the `<AllToolUIs />` wrapper. Thread persistence is missing -- the `PmSyncThreadListAdapter` handles listing/deleting but has no `ThreadHistoryAdapter` to load message history when switching threads. The `HitlApprovalCard` currently uses `addResult()` but should use `addToolApprovalResponse()` from AI SDK v6.

**Primary recommendation:** Convert all tool UIs to plain function components, wire them via `components.tools.by_name` on `MessagePrimitive.Content`, add `ThreadHistoryAdapter` via `unstable_Provider` on the adapter, and switch HITL to `addToolApprovalResponse`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace ALL `makeAssistantToolUI()` calls with `MessagePrimitive.Content components={{ tools: { by_name: {...}, Fallback } }}` pattern
- Delete `<AllToolUIs />` barrel component -- tool renderers are static config, not mounted components
- Each tool UI becomes a plain React function component receiving `ToolCallMessagePartProps`
- `Fallback` component handles all unregistered tools + HITL approval cards
- Use `useRemoteThreadListRuntime` with custom `PmSyncThreadListAdapter` (already created)
- Add `unstable_Provider` on the adapter that injects `ThreadHistoryAdapter` via `RuntimeAdapterProvider`
- `ThreadHistoryAdapter.load()` calls `GET /ai/chat/conversations/:id` to load messages
- `ThreadHistoryAdapter.append()` is a no-op -- backend persists messages during SSE streaming
- Backend auto-generates titles -- `generateTitle()` throws to skip client-side generation
- Backend tools use `needsApproval: true` on HIGH-risk tools (already in place)
- Frontend uses `sendAutomaticallyWhen` from AI SDK for auto-continue after approval
- Tool part states: `approval-requested` -> render approve/deny UI -> `addToolApprovalResponse()`
- Delete old `addResult()` pattern from FallbackToolUI
- Keep `useChatRuntime` but pass custom adapter via `useRemoteThreadListRuntime`
- Delete `makeAssistantToolUI` imports from all 17 tool UI files

### Claude's Discretion
- Exact tool UI component signatures (as long as they match `ToolCallMessagePartProps`)
- Whether to keep `ChainOfThought` auto-expand on pending approval (nice UX, keep if compatible)
- CSS class naming in tool UI components
- Error boundary strategy for individual tool renderers

### Deferred Ideas (OUT OF SCOPE)
- Full shadcn ToolFallback installation (use custom MUI-based fallback instead)
- `withFormat` stub on ThreadHistoryAdapter (only needed if silent load failures observed)
- Thread rename endpoint on backend (backend auto-generates titles)
- Thread archive/unarchive endpoints (currently maps to delete)
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @assistant-ui/react | ^0.12.17 | Chat primitives, message rendering | Already installed, provides MessagePrimitive.Content |
| @assistant-ui/core | 0.1.5 | Core runtime, ThreadHistoryAdapter types | Transitive dep, provides RuntimeAdapterProvider |
| @assistant-ui/react-ai-sdk | ^1.3.13 | AI SDK <-> assistant-ui bridge | Already installed, provides useAISDKRuntime |
| @ai-sdk/react | ^3.0.118 | useChat hook | Already installed |
| ai | ^6.0.116 | AI SDK core, HITL helpers | Provides lastAssistantMessageIsCompleteWithApprovalResponses |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @assistant-ui/store | (bundled) | useAui, useAuiState hooks | Already in use for ChainOfThought state |
| @assistant-ui/react-markdown | ^0.12.5 | Markdown rendering in messages | Already in use for MarkdownTextPrimitive |

**No new packages needed.** All required libraries are already installed.

## Architecture Patterns

### Current Component Tree (BEFORE)
```
ChatPage
  ChatRuntimeProvider (useRemoteThreadListRuntime + useThreadRuntime)
    AssistantRuntimeProvider
      AllToolUIs (17 mounted components self-registering via makeAssistantToolUI)
      ChatThemeBridge
        ChatDesktopLayout / ChatMobileLayout
          ChatThreadList (ThreadListPrimitive)
          ChatThread (ThreadPrimitive)
            AssistantMessage
              MessagePrimitive.Content (Text + ChainOfThought only -- NO tools config)
```

### Target Component Tree (AFTER)
```
ChatPage
  ChatRuntimeProvider (useRemoteThreadListRuntime + useThreadRuntime + unstable_Provider)
    AssistantRuntimeProvider
      ChatThemeBridge
        ChatDesktopLayout / ChatMobileLayout
          ChatThreadList (ThreadListPrimitive)
          ChatThread (ThreadPrimitive)
            AssistantMessage
              MessagePrimitive.Content (Text + ChainOfThought + tools.by_name + tools.Fallback)
```

### Pattern 1: Tool Renderer Map on MessagePrimitive.Content
**What:** Pass all tool renderers as a static object to `MessagePrimitive.Content`
**When to use:** Always -- this replaces the mounted AllToolUIs pattern
**Example:**
```typescript
// Source: node_modules/@assistant-ui/react/dist/primitives/message/MessagePartsGrouped.js line 86
// The runtime resolves: tools.by_name?.[part.toolName] ?? tools.Fallback
<MessagePrimitive.Content
  components={{
    Text: MarkdownWithStreaming,
    ChainOfThought: ChatChainOfThought,
    tools: {
      by_name: {
        search_emails: EmailSearchRenderer,
        list_emails: ListEmailsRenderer,
        semantic_search_emails: SemanticSearchRenderer,
        // ... all tool names
      },
      Fallback: FallbackToolRenderer,
    },
  }}
/>
```

### Pattern 2: ToolCallMessagePartProps Component Signature
**What:** Each tool renderer is a plain FC receiving `ToolCallMessagePartProps<TArgs, TResult>`
**Type source:** `@assistant-ui/core/dist/react/types/MessagePartComponentTypes.d.ts`
```typescript
// Verified from installed packages:
type ToolCallMessagePartProps<TArgs = any, TResult = unknown> = MessagePartState & ToolCallMessagePart<TArgs, TResult> & {
  addResult: (result: TResult | ToolResponse<TResult>) => void;
  resume: (payload: unknown) => void;
};

// Where MessagePartState adds:
//   status: ToolCallMessagePartStatus (running | complete | incomplete | requires-action)
// And ToolCallMessagePart adds:
//   type: "tool-call", toolCallId, toolName, args, result, isError, argsText, artifact, interrupt
```

### Pattern 3: ThreadHistoryAdapter via unstable_Provider
**What:** Inject `ThreadHistoryAdapter` into each thread instance using `RuntimeAdapterProvider`
**Where:** On the `PmSyncThreadListAdapter`, add `unstable_Provider` property
```typescript
// Source: @assistant-ui/core/dist/runtimes/remote-thread-list/types.d.ts
// RemoteThreadListAdapter has: unstable_Provider?: ((...args: any[]) => unknown) | undefined

// ThreadHistoryAdapter.load() returns ExportedMessageRepository:
type ExportedMessageRepository = {
  headId?: string | null;
  messages: Array<{
    message: ThreadMessage;
    parentId: string | null;
    runConfig?: RunConfig;
  }>;
};

// CRITICAL: ExportedMessageRepository has a static helper:
ExportedMessageRepository.fromArray(messages: readonly ThreadMessageLike[])
// This converts flat ThreadMessageLike[] to the parent-id linked format.
```

### Pattern 4: HITL Approval via AI SDK v6
**What:** Use `addToolApprovalResponse` instead of `addResult` for approval flow
**Current status:** `sendAutomaticallyWhen` is already implemented in ChatRuntimeProvider
```typescript
// From ai package (verified in node_modules/ai/dist/index.d.ts):
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

// In useChat config:
sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses

// NOTE: The current sendAutomaticallyWhen in ChatRuntimeProvider already implements
// equivalent logic manually. Can replace with the SDK helper for clarity.
```

### Anti-Patterns to Avoid
- **Mounting tool UIs as components:** The old `<ToolUI />` mount pattern causes tools to silently not render if mounted outside the correct scope. Use static config instead.
- **Using addResult for HITL:** The `addResult` function adds a tool result, not an approval response. Use `addToolApprovalResponse` which is the AI SDK v6 HITL-specific method.
- **Building ThreadMessageLike manually:** Use `ExportedMessageRepository.fromArray()` which handles parent-id linking automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool-to-component lookup | Custom registry with Map/switch | `components.tools.by_name` on MessagePrimitive.Content | Built into assistant-ui, handles fallback automatically |
| HITL auto-continue | Manual `sendAutomaticallyWhen` logic | `lastAssistantMessageIsCompleteWithApprovalResponses` from `ai` | Handles edge cases (multiple tool calls, partial approvals) |
| Message format conversion | Custom DB-to-ThreadMessage mapper | `ExportedMessageRepository.fromArray()` with `ThreadMessageLike` | Handles parent-id linking, deduplication |
| Thread history injection | Custom context/hooks | `unstable_Provider` + `RuntimeAdapterProvider` | Correct lifecycle management per thread instance |

## Common Pitfalls

### Pitfall 1: Tool Status Type Mismatch
**What goes wrong:** The HitlApprovalCard checks `status.type === 'requires-action'` but the actual type in assistant-ui 0.12.x `ToolCallMessagePartStatus` uses `requires-action` with reason `interrupt`.
**Why it happens:** AI SDK uses `approval-requested` in `UIToolInvocation.state`, but assistant-ui maps this to `requires-action` with `reason: 'interrupt'` in `ToolCallMessagePartStatus`.
**How to avoid:** The current FallbackToolUI checks `status.type === 'requires-action'` -- this is correct for assistant-ui's mapping. Keep this check unchanged.
**Warning signs:** HITL cards not appearing, or appearing with wrong state.

### Pitfall 2: addResult vs addToolApprovalResponse
**What goes wrong:** Using `addResult({ approved: true })` sends a tool result, not an approval response. The backend may not process it correctly as an approval.
**Why it happens:** The old pattern predates AI SDK v6's explicit approval flow.
**How to avoid:** In the `HitlApprovalCard`, the `addResult` prop from `ToolCallMessagePartProps` is the correct assistant-ui mechanism. The assistant-ui runtime internally maps this to the appropriate AI SDK call. The `addToolApprovalResponse` is on the `useChat` return, not on the tool part props. The current `addResult` approach through assistant-ui may actually be correct for the runtime bridge.
**Resolution:** Verify whether `addResult` in assistant-ui 0.12.x correctly delegates to `addToolApprovalResponse` on the AI SDK side. If not, the HitlApprovalCard needs to access the chat instance directly.

### Pitfall 3: DB Message Format vs ThreadMessageLike
**What goes wrong:** The backend stores messages with `content: Json` in AiMessage. User messages store `{ type: 'text', text: '...' }`, assistant messages store text or complex content. Loading these and passing to `ExportedMessageRepository.fromArray()` requires conversion to `ThreadMessageLike`.
**Why it happens:** Backend uses AI SDK `ModelMessage` format for storage, but assistant-ui expects `ThreadMessageLike` format.
**How to avoid:** Write a `convertDbMessagesToThreadMessageLike()` function that maps:
- User messages: `{ role: 'user', content: text }` (string content)
- Assistant messages: `{ role: 'assistant', content: text }` (string content)
- Tool messages: `{ role: 'tool', toolCallId, toolName, result }` (separate tool format)

The backend's `getRecentMessages` returns raw `AiMessage[]` with `content: Json`. The frontend must parse this JSON and build `ThreadMessageLike[]`.

### Pitfall 4: ConversationToolUI Uses useThreadRuntime
**What goes wrong:** `ConversationToolUI.tsx` imports `useThreadRuntime` from `@assistant-ui/react` and uses it in the `AskUserCard` component to call `runtime.append()`. When migrating to plain function components, this hook usage must be preserved.
**Why it happens:** The `ask_user` tool renderer needs to send messages on behalf of the user when they click an option button.
**How to avoid:** Keep `useThreadRuntime` in the `AskUserRenderer` component. Plain function components can still use hooks.

### Pitfall 5: Thread History Adapter Scope
**What goes wrong:** The `unstable_Provider` wraps each thread instance. The `ThreadHistoryAdapter.load()` needs access to the current thread's `remoteId` to fetch messages from the backend.
**Why it happens:** The adapter runs inside the thread scope where `useAuiState((s) => s.threadListItem)` is available.
**How to avoid:** Use `useAuiState` inside the `unstable_Provider` component to get the current thread's `remoteId`, then construct the history adapter with that ID.

### Pitfall 6: ChainOfThought Already Uses tools.Fallback
**What goes wrong:** `ChatChainOfThought.tsx` already uses `ChainOfThoughtPrimitive.Parts components.tools.Fallback`. If the Fallback component signature changes, it breaks both places.
**Why it happens:** ChainOfThought renders tool calls that happen during reasoning and uses the same fallback pattern.
**How to avoid:** Ensure the `FallbackToolRenderer` (renamed from `FallbackToolUIRender`) keeps the same props signature (`ToolCallMessagePartProps<unknown, unknown>`) and is used in both `AssistantMessage` and `ChatChainOfThought`.

## Code Examples

### Converting a makeAssistantToolUI to a plain component

**BEFORE:**
```typescript
// EmailSearchToolUI.tsx
import { makeAssistantToolUI } from '@assistant-ui/react';
import type { EmailSearchResult } from '../types';

export const EmailSearchToolUI = makeAssistantToolUI<
  { query: string; folder?: string; maxResults?: number },
  EmailSearchResult
>({
  toolName: 'search_emails',
  render: ({ args, result, status }) => {
    if (status.type === 'running') return <RunningState label={`Searching "${args.query}"...`} />;
    if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
    if (!result) return null;
    return <ResultCard result={result} label="Email Search" />;
  },
});
```

**AFTER:**
```typescript
// EmailSearchToolUI.tsx
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import type { EmailSearchResult } from '../types';

type Args = { query: string; folder?: string; maxResults?: number };

export function EmailSearchRenderer({ args, result, status }: ToolCallMessagePartProps<Args, EmailSearchResult>) {
  if (status.type === 'running') return <RunningState label={`Searching "${args.query}"...`} />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
  if (!result) return null;
  return <ResultCard result={result} label="Email Search" />;
}
```

### Tool Renderer Map (AssistantMessage.tsx)

```typescript
import { EmailSearchRenderer, ListEmailsRenderer, SemanticSearchRenderer } from './tool-uis/EmailSearchToolUI';
import { EmailListRenderer } from './tool-uis/EmailListToolUI';
import { EmailContentRenderer } from './tool-uis/EmailContentToolUI';
import { FollowUpRenderer } from './tool-uis/FollowUpToolUI';
import { ContactRenderer } from './tool-uis/ContactToolUI';
import { EventRenderer } from './tool-uis/EventToolUI';
import { CountRenderer } from './tool-uis/CountToolUI';
import { FolderRenderer } from './tool-uis/FolderToolUI';
import { AnalysisRenderer } from './tool-uis/AnalysisToolUI';
import { MemoryRenderer, MemorySearchRenderer } from './tool-uis/MemoryToolUI';
import { BriefingRenderer } from './tool-uis/BriefingToolUI';
import { CrmRenderer } from './tool-uis/CrmToolUI';
import { TriageRenderer } from './tool-uis/TriageToolUI';
import { AskUserRenderer, SaveMemoryRenderer } from './tool-uis/ConversationToolUI';
import { CreateReminderRenderer, ListRemindersRenderer } from './tool-uis/ReminderToolUI';
import { FallbackToolRenderer } from './tool-uis/FallbackToolUI';

const TOOL_RENDERERS = {
  search_emails: EmailSearchRenderer,
  list_emails: ListEmailsRenderer,
  semantic_search_emails: SemanticSearchRenderer,
  list_email_index: EmailListRenderer,
  get_email_content: EmailContentRenderer,
  list_follow_ups: FollowUpRenderer,
  search_contacts: ContactRenderer,
  get_events: EventRenderer,
  count_emails: CountRenderer,
  list_folders: FolderRenderer,
  analyze_email: AnalysisRenderer,
  search_memory: MemoryRenderer,
  memory_search: MemorySearchRenderer,
  get_daily_briefing: BriefingRenderer,
  get_relationship_stats: CrmRenderer,
  bulk_email_actions: TriageRenderer,
  ask_user: AskUserRenderer,
  save_memory: SaveMemoryRenderer,
  create_reminder: CreateReminderRenderer,
  list_reminders: ListRemindersRenderer,
} as const;

// In the JSX:
<MessagePrimitive.Content
  components={{
    Text: MarkdownWithStreaming,
    ChainOfThought: ChatChainOfThought,
    tools: {
      by_name: TOOL_RENDERERS,
      Fallback: FallbackToolRenderer,
    },
  }}
/>
```

### ThreadHistoryAdapter Implementation

```typescript
// In PmSyncThreadListAdapter, add unstable_Provider:
import { RuntimeAdapterProvider } from '@assistant-ui/core/react';
import type { ThreadHistoryAdapter } from '@assistant-ui/core';
import { ExportedMessageRepository } from '@assistant-ui/core';
import type { ThreadMessageLike } from '@assistant-ui/core';
import { useAuiState } from '@assistant-ui/store';

// unstable_Provider component:
function ThreadHistoryProvider({ children }: { children: ReactNode }) {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);

  const history = useMemo<ThreadHistoryAdapter>(() => ({
    async load() {
      if (!remoteId) return { messages: [] };
      try {
        const { data } = await apiClient.get(`/ai/chat/conversations/${remoteId}`);
        const dbMessages = data?.conversation?.messages ?? [];
        const threadMessages = convertDbMessagesToThreadMessageLike(dbMessages);
        return ExportedMessageRepository.fromArray(threadMessages);
      } catch {
        return { messages: [] };
      }
    },
    async append() { /* no-op -- backend persists during SSE streaming */ },
  }), [remoteId]);

  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  );
}
```

### DB Message Conversion Function

```typescript
// AiMessage from Prisma has: { id, conversationId, role, content: Json, toolCallId?, stepIndex?, tokenCount?, createdAt }
// content is stored as JSON: { type: 'text', text: '...' } for user, or text/complex for assistant

function convertDbMessagesToThreadMessageLike(
  messages: Array<{
    id: string;
    role: string;
    content: unknown;
    toolCallId?: string | null;
    createdAt: string;
  }>
): ThreadMessageLike[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const content = m.content as Record<string, unknown>;
      const text = typeof content === 'string'
        ? content
        : (content as { text?: string })?.text ?? '';
      return {
        role: m.role as 'user' | 'assistant',
        content: text,
        id: m.id,
        createdAt: new Date(m.createdAt),
      };
    });
}
```

## Complete Tool UI Inventory

All 17 tool UI files using `makeAssistantToolUI` that must be converted:

| File | Exported Component(s) | Tool Name(s) | Has HITL? | Uses Hooks? |
|------|----------------------|---------------|-----------|-------------|
| EmailSearchToolUI.tsx | EmailSearchToolUI, ListEmailsToolUI, SemanticSearchToolUI | search_emails, list_emails, semantic_search_emails | No | No |
| EmailListToolUI.tsx | EmailListToolUI | list_email_index | No | No |
| EmailContentToolUI.tsx | EmailContentToolUI | get_email_content | No | No |
| FollowUpToolUI.tsx | FollowUpToolUI | list_follow_ups | No | No |
| ContactToolUI.tsx | ContactToolUI | search_contacts | No | No |
| EventToolUI.tsx | EventToolUI | get_events | No | No |
| CountToolUI.tsx | CountToolUI | count_emails | No | No |
| FolderToolUI.tsx | FolderToolUI | list_folders | No | No |
| AnalysisToolUI.tsx | AnalysisToolUI | analyze_email | No | No |
| MemoryToolUI.tsx | MemoryToolUI, MemorySearchToolUI | search_memory, memory_search | No | No |
| BriefingToolUI.tsx | BriefingToolUI | get_daily_briefing | No | No |
| CrmToolUI.tsx | CrmToolUI | get_relationship_stats | No | No |
| TriageToolUI.tsx | TriageToolUI | bulk_email_actions | Yes (HitlApprovalWrapper) | No |
| ConversationToolUI.tsx | AskUserToolUI, SaveMemoryToolUI | ask_user, save_memory | No | Yes (useThreadRuntime, useTranslations) |
| ReminderToolUI.tsx | CreateReminderToolUI, ListRemindersToolUI | create_reminder, list_reminders | No | No |
| FallbackToolUI.tsx | FallbackToolUI, FallbackToolUIRender | * (wildcard) | Yes (HitlApprovalWrapper) | No |
| index.tsx | AllToolUIs | (barrel export) | N/A | N/A |

**Total makeAssistantToolUI calls:** 21 across 15 files (plus 1 barrel in index.tsx)
**Total unique tool names:** 20 + wildcard fallback

## Legacy Code Deletion Inventory

| File/Code | Status | Safe to Delete? | Reason |
|-----------|--------|-----------------|--------|
| `AllToolUIs` component in `tool-uis/index.tsx` | Active, used in ChatPage | Yes -- replaced by `components.tools.by_name` |
| `<AllToolUIs />` usage in ChatPage.tsx | Active | Yes -- remove from render tree |
| `makeAssistantToolUI` imports in all tool UI files | Active | Yes -- convert to plain function exports |
| `AiActionsBell.tsx` | Already deleted (commit c35fd72e) | Already gone |
| `PendingAction` type in `types/entities.ts` | Active (`AgentPendingAction`) | Not yet -- still used by websocket types, api types, email-ui-store |
| HITL API methods in ai.ts | Already cleaned (no `getPendingActions` method) | Already gone |
| `multiAgentApi` shim in ai.ts | Active (legacy alias) | Not in scope -- used elsewhere |
| `mapToolToActionType` in types/constants.ts | Active | Separate concern -- used by compose menu |
| `pendingActions` in email-ui-store | Active | Not in scope -- separate from chat HITL |

**Key finding:** The `AgentPendingAction` type and `pendingActions` in email-ui-store are used for non-chat features (email compose, websocket notifications). These are NOT the "old HITL" the CONTEXT.md refers to. The old HITL that was already cleaned up was the `getPendingActions`/`approveAction` API methods in ai.ts.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `makeAssistantToolUI` + mount | `components.tools.by_name` on MessagePrimitive.Content | assistant-ui 0.12.x | Tool renderers are static config, not mounted components |
| `toolName: '*'` wildcard | `tools.Fallback` component | assistant-ui 0.12.x | Explicit fallback instead of magic wildcard |
| `addResult()` for HITL | `addToolApprovalResponse()` in AI SDK, `addResult()` in assistant-ui runtime | AI SDK v6 | assistant-ui's `addResult` may delegate correctly -- needs verification |
| No thread history loading | `ThreadHistoryAdapter.load()` | assistant-ui 0.12.x | Messages persist across page reloads |

## Open Questions

1. **Does assistant-ui's `addResult` correctly delegate to AI SDK's `addToolApprovalResponse`?**
   - What we know: The `ToolCallMessagePartProps` provides `addResult` and `resume`. The AI SDK's `useChat` returns `addToolApprovalResponse`. The assistant-ui bridge (`useAISDKRuntime`) may handle the mapping.
   - What's unclear: Whether calling `addResult({ approved: true })` from assistant-ui actually triggers `addToolApprovalResponse` on the AI SDK side, or if it sends a generic tool result.
   - Recommendation: Test empirically during implementation. If `addResult` doesn't work for approvals, use `resume` (which maps to interrupt-resume) or access the chat instance directly.

2. **ExportedMessageRepository.fromArray -- does it handle tool messages?**
   - What we know: `ThreadMessageLike` supports `role: 'user' | 'assistant' | 'system'` with tool-call content parts. The `useExternalMessageConverter` also supports `role: 'tool'` separately.
   - What's unclear: Whether `fromArray` correctly handles interleaved tool-result messages, or if they need to be embedded as content parts in assistant messages.
   - Recommendation: Start by converting only user and assistant messages (text only). Tool results from history are less critical since the AI already has them in context via backend's `getMessagesForContext`.

3. **Does the `unstable_Provider` on RemoteThreadListAdapter work with the current adapter class pattern?**
   - What we know: The adapter is a class instance (`PmSyncThreadListAdapter`). The `unstable_Provider` is typed as `((...args: any[]) => unknown) | undefined` on the adapter type.
   - What's unclear: Whether the class needs to be converted to a plain object, or if `unstable_Provider` can be added as a property on the class instance.
   - Recommendation: Convert `PmSyncThreadListAdapter` from a class to a factory function returning a plain object with `unstable_Provider` included.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) + vitest (unit) |
| Config file | `frontend/playwright.config.ts` + `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && npx tsc --noEmit` |
| Full suite command | `cd frontend && npm run type-check` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | Tool UIs render via components.tools.by_name | manual | Load chat, trigger tool, verify rendering | N/A |
| BUG-02 | Thread history loads on thread switch | manual | Switch threads, verify messages appear | N/A |
| BUG-03 | HITL approval card shows and works | manual | Trigger high-risk tool, approve | N/A |
| BUG-04 | No TypeScript errors after migration | unit | `cd frontend && npx tsc --noEmit` | N/A |
| BUG-05 | AllToolUIs barrel deleted, no dead imports | unit | `cd frontend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npx tsc --noEmit && npm run lint:win`
- **Phase gate:** Full type-check + lint green before verify

### Wave 0 Gaps
None -- existing TypeScript type-checking covers all structural requirements. Manual E2E testing required for runtime behavior but no new test infrastructure needed.

## Sources

### Primary (HIGH confidence)
- `node_modules/@assistant-ui/core/dist/react/types/MessagePartComponentTypes.d.ts` -- ToolCallMessagePartProps type definition
- `node_modules/@assistant-ui/core/dist/adapters/thread-history.d.ts` -- ThreadHistoryAdapter interface
- `node_modules/@assistant-ui/core/dist/react/runtimes/RuntimeAdapterProvider.d.ts` -- RuntimeAdapterProvider props
- `node_modules/@assistant-ui/core/dist/runtime/utils/message-repository.d.ts` -- ExportedMessageRepository.fromArray
- `node_modules/@assistant-ui/core/dist/runtimes/remote-thread-list/types.d.ts` -- unstable_Provider on adapter
- `node_modules/@assistant-ui/react/dist/primitives/message/MessagePartsGrouped.js` line 86 -- by_name resolution logic
- `node_modules/ai/dist/index.d.ts` -- lastAssistantMessageIsCompleteWithApprovalResponses export
- `backend/prisma/schema.prisma` lines 1194-1207 -- AiMessage model (content: Json)
- `backend/src/modules/ai-chat/services/conversation.service.ts` -- message persistence format

### Secondary (MEDIUM confidence)
- Codebase inspection of all 17 tool UI files -- confirmed all use makeAssistantToolUI
- ChatRuntimeProvider.tsx -- verified current runtime wiring pattern
- chat-thread-list-adapter.ts -- verified PmSyncThreadListAdapter has no unstable_Provider yet

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed and verified from node_modules
- Architecture: HIGH -- types verified from installed package .d.ts files, resolution logic verified from .js source
- Pitfalls: HIGH -- all identified from actual codebase inspection, not speculation
- Thread persistence: MEDIUM -- ExportedMessageRepository.fromArray usage and unstable_Provider wiring needs runtime verification

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- package versions locked in package-lock.json)
