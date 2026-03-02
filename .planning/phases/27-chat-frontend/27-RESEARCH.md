# Phase 27: Chat Frontend - Research

**Researched:** 2026-03-02
**Domain:** assistant-ui primitives, AI SDK v6 frontend integration, tool UI composition, HITL inline approval
**Confidence:** HIGH

## Summary

Phase 27 replaces the entire custom MUI chat frontend (26 files in `AiDashboard/`, plus `useVoltAgentChat` hook and custom tool renderers) with assistant-ui primitives. The backend already speaks AI SDK v6 protocol via `pipeUIMessageStreamToResponse` on `POST /ai/chat`, so the transport layer is a direct connection -- no adapter needed.

The critical discovery is that `@assistant-ui/react-ai-sdk` is NOT installed. This package provides `useChatRuntime` and `AssistantChatTransport` -- the primary wiring between assistant-ui and the backend. Version **1.3.8** is the latest compatible with our current `ai@6.0.77` and `@ai-sdk/react@3.0.79`. Installing `@assistant-ui/react-ai-sdk@1.3.8` is the first step. Additionally, `@assistant-ui/react` should be bumped from `0.12.9` to `0.12.14` to match peer dependency requirements.

**Primary recommendation:** Install `@assistant-ui/react-ai-sdk@1.3.8`, bump `@assistant-ui/react` to `^0.12.14`, then build the new chat UI as a parallel component tree under `frontend/src/components/chat/` using assistant-ui primitives. Do NOT delete old components in this phase -- Phase 28 handles cleanup.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Replace entirely** -- delete `useVoltAgentChat` hook and `useChatController`. Wire assistant-ui's `useChatRuntime` directly to existing `POST /ai/chat` endpoint
- Backend already speaks AI SDK v6 protocol (`pipeUIMessageStreamToResponse`), so assistant-ui connects natively -- no adapter layer
- **Conversation persistence** -- keep multi-conversation support using assistant-ui's `ThreadListPrimitive`. Backend already has `GET /ai/chat/conversations` and `DELETE /ai/chat/conversations/:id`
- **Styling** -- Tailwind only for all assistant-ui primitives. No MUI wrappers. Consistent with existing `src/components/ai-elements/` pattern
- Inject JWT + CSRF headers into assistant-ui transport. Use existing `getAuthToken()` and `getCsrfToken()` helpers
- **Suggested questions** -- keep, using assistant-ui's `SuggestionPrimitive`. Backend already sends `suggestedQuestions` in message metadata
- **Message branching** -- enable edit + regenerate via `BranchPickerPrimitive` and `ActionBarPrimitive`
- **Auto-scroll** -- use assistant-ui's `ThreadPrimitive.Viewport` with built-in `useThreadViewportAutoScroll`. Delete custom `useChatScroll.ts`
- **Markdown** -- use `@assistant-ui/react-markdown` (already installed at ^0.12.3). Replace react-markdown + streamdown usage in chat
- **Chain of thought** -- show reasoning steps using `ChainOfThoughtPrimitive` (collapsible)
- **No attachments** -- file attachment support deferred
- **Full rewrite** of all 14 tool renderers using `makeAssistantToolUI({ toolName, render })`. Not wrapping existing renderers
- **Fresh visual design** -- new card design following assistant-ui composition patterns
- **Renderer-owned loading** -- each renderer handles its own loading/running state via the `status` prop
- **JSON fallback** -- register a catch-all renderer for unregistered tools with collapsible raw JSON
- **HITL inline card** in thread -- approval renders directly in message stream, not a modal. Uses assistant-ui's native `requires_action` status
- Same destructive action set -- email send, email delete, calendar create/delete, contact delete
- **Full-screen chat** at 375px -- thread fills viewport, composer sticks to bottom. Conversation list accessible via back button/hamburger
- Standard touch interactions only -- no swipe gestures
- Verify at 375px (mobile), 768px (tablet), 1440px (desktop) breakpoints

### Claude's Discretion
- Auth injection approach for transport -- pick whatever is cleanest

### Deferred Ideas (OUT OF SCOPE)
- File attachments in chat composer (AttachmentPrimitive) -- future phase
- Old ai-elements and VoltAgent code deletion -- Phase 28
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | assistant-ui runtime wired with `useChatRuntime` + `AssistantChatTransport` pointing at new streaming endpoint | Install `@assistant-ui/react-ai-sdk@1.3.8`, create `AssistantChatTransport` with custom `api`, `headers`, `credentials` options pointing at `POST /ai/chat` |
| CHAT-02 | Thread, Composer, and Messages use assistant-ui primitives -- no custom MUI chat components | Use `ThreadPrimitive.Root/Viewport/Messages/ScrollToBottom/Empty/Suggestion`, `ComposerPrimitive.Root/Input/Send`, `MessagePrimitive.Root/Content`, `BranchPickerPrimitive`, `ActionBarPrimitive`, `ChainOfThoughtPrimitive` |
| CHAT-03 | Domain tool renderers built with `makeAssistantToolUI` with running/complete/error states | `makeAssistantToolUI<TArgs, TResult>({ toolName, render })` -- render receives `args`, `result`, `status` (type: running/complete/incomplete/requires-action), `addResult`, `toolCallId` |
| CHAT-04 | HITL approval rendered inline via assistant-ui `requires_action` status | Backend emits `data-needs-approval` chunk type. Tool status has `type: "requires-action"` with `reason: "interrupt"`. Use `addResult()` to complete approval flow |
| CHAT-05 | Mobile-responsive chat layout using assistant-ui responsive primitives | Full-screen thread at 375px, sticky composer, conditional ThreadList sidebar. CSS only (no MUI breakpoints) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@assistant-ui/react` | ^0.12.14 | Primitives, `makeAssistantToolUI`, `AssistantRuntimeProvider` | Core UI framework -- all chat primitives live here |
| `@assistant-ui/react-ai-sdk` | 1.3.8 | `useChatRuntime`, `AssistantChatTransport` | Bridges assistant-ui to AI SDK v6 backend. Version 1.3.8 is latest compatible with our `ai@6.0.77` |
| `@assistant-ui/react-markdown` | ^0.12.3 | `MarkdownTextPrimitive` for streaming markdown | Already installed, handles code blocks and streaming natively |
| `ai` | 6.0.77 | AI SDK transport types, `DefaultChatTransport` | Already installed, provides the chat protocol |
| `@ai-sdk/react` | 3.0.79 | `useChat` underlying hook (used by react-ai-sdk) | Already installed, provides React bindings |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | (installed) | Icons for tool renderers, action bars | Already used across the project |
| `class-variance-authority` | (installed) | Tailwind variant management | Already used by shadcn components |
| `@radix-ui/*` | (installed) | Accordion, Collapsible, etc for tool UI | Already available, assistant-ui builds on Radix |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@assistant-ui/react-ai-sdk` | Raw `DefaultChatTransport` from `ai` package + manual wiring | Loses frontend tools forwarding and system messages; more code to maintain. CONTEXT.md locks us to `useChatRuntime` |
| `@assistant-ui/react-ai-sdk@1.3.10` | Latest but requires `ai@^6.0.98` | Would need AI SDK upgrade across frontend+backend -- not worth the risk for this phase |

**Installation:**
```bash
cd frontend
npm install @assistant-ui/react@^0.12.14 @assistant-ui/react-ai-sdk@1.3.8
```

Note: `@assistant-ui/react-markdown@^0.12.3` is already installed. No other new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/components/chat/
├── ChatRuntimeProvider.tsx    # AssistantRuntimeProvider + useChatRuntime wiring
├── ChatThread.tsx             # ThreadPrimitive composition (messages, viewport, scroll)
├── ChatComposer.tsx           # ComposerPrimitive composition (input, send, stop)
├── ChatMessage.tsx            # MessagePrimitive + content parts dispatch
├── AssistantMessage.tsx       # Assistant message with markdown, reasoning, actions
├── UserMessage.tsx            # User message display
├── ChatSuggestions.tsx        # SuggestionPrimitive for suggested questions
├── ChatBranchPicker.tsx       # BranchPickerPrimitive for message branches
├── ChatActionBar.tsx          # ActionBarPrimitive (copy, reload, edit)
├── ChatChainOfThought.tsx     # ChainOfThoughtPrimitive (collapsible reasoning)
├── ChatThreadList.tsx         # ThreadListPrimitive for conversation sidebar
├── ChatEmptyState.tsx         # ThreadPrimitive.Empty -- welcome screen
├── ChatMobileLayout.tsx       # Mobile-specific full-screen layout
├── HitlApprovalCard.tsx       # Inline HITL card using tool status
├── tool-uis/                  # makeAssistantToolUI renderers
│   ├── index.ts               # All tool UI registrations
│   ├── EmailSearchToolUI.tsx  # search_emails, list_emails, semantic_search_emails
│   ├── EmailListToolUI.tsx    # list_email_index
│   ├── EmailContentToolUI.tsx # get_email_content
│   ├── FollowUpToolUI.tsx     # list_follow_ups
│   ├── ContactToolUI.tsx      # search_contacts
│   ├── EventToolUI.tsx        # get_events
│   ├── CountToolUI.tsx        # count_emails
│   ├── FolderToolUI.tsx       # list_folders
│   ├── AnalysisToolUI.tsx     # analyze_email
│   ├── MemoryToolUI.tsx       # search_memory, memory_search
│   ├── BriefingToolUI.tsx     # get_daily_briefing
│   ├── CrmToolUI.tsx          # get_relationship_stats
│   ├── TriageToolUI.tsx       # bulk_email_actions
│   └── FallbackToolUI.tsx     # catch-all for unregistered tools
└── types.ts                   # Shared types (reuse from existing tool-renderers/types.ts)
```

### Pattern 1: Runtime Provider Wiring
**What:** Create a top-level provider that wires assistant-ui to the backend.
**When to use:** At the chat page level, wrapping all chat components.
**Example:**
```typescript
// Source: @assistant-ui/react-ai-sdk docs + installed type definitions
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { getAuthToken } from "@/lib/utils/auth-token";
import { getCsrfToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE}/api/v1/ai/chat`,
      credentials: "include",
      headers: async () => ({
        Authorization: `Bearer ${getAuthToken()}`,
        "X-CSRF-Token": await getCsrfToken(),
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

### Pattern 2: Thread Composition
**What:** Compose ThreadPrimitive sub-components for the chat area.
**When to use:** The main chat panel.
**Example:**
```typescript
// Source: assistant-ui primitives API (verified from node_modules type defs)
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";

export function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <ChatEmptyState />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
            EditComposer,
          }}
        />
      </ThreadPrimitive.Viewport>
      <ThreadPrimitive.ViewportFooter className="sticky bottom-0">
        <ThreadPrimitive.ScrollToBottom />
        <ChatComposer />
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Root>
  );
}
```

### Pattern 3: makeAssistantToolUI for Domain Renderers
**What:** Register tool-specific UI components that receive status, args, result.
**When to use:** Every domain tool that needs a custom render.
**Example:**
```typescript
// Source: makeAssistantToolUI type definition from node_modules
import { makeAssistantToolUI } from "@assistant-ui/react";
import type { EmailSearchResult } from "./types";

export const EmailSearchToolUI = makeAssistantToolUI<
  { query: string; folder?: string },
  EmailSearchResult
>({
  toolName: "search_emails",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <EmailSearchSkeleton query={args.query} />;
    }
    if (status.type === "incomplete") {
      return <ToolError reason={status.reason} />;
    }
    // status.type === "complete"
    return <EmailSearchResults data={result} />;
  },
});
```

### Pattern 4: HITL via Tool Status
**What:** Use `requires-action` status and `addResult()` for inline approval.
**When to use:** Tools flagged with `needsApproval` on the backend.
**Critical caveat:** The backend currently emits HITL as a `data-needs-approval` custom chunk, NOT as a standard tool call with `requires-action` status. The planner must decide whether to:
  - (A) Adapt the frontend to poll for pending actions (current approach) and render inline, OR
  - (B) Refactor backend to use AI SDK's native `needsApproval` tool mechanism that sends `requires-action` status through the stream

Option A is lower risk since it preserves the working backend HITL flow. The current `InlineActionCard` approach (poll for PendingAction, show approve/reject) can be rebuilt with assistant-ui styling but the same data flow.

**Example (Option A -- poll-based, matches current backend):**
```typescript
// HITL rendered as a separate component at the end of assistant messages
// Uses TanStack Query to poll PendingActions for this conversation
export function HitlApprovalCard({ action }: { action: PendingAction }) {
  const approveMutation = useApproveAction(action.id);
  const rejectMutation = useRejectAction(action.id);

  return (
    <div className="border-2 border-warning/50 rounded-lg p-3 mt-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="font-semibold text-sm">{action.actionType}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">{action.summary}</p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => approveMutation.mutate()} className="...">
          Approve
        </button>
        <button onClick={() => rejectMutation.mutate()} className="...">
          Reject
        </button>
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Wrapping assistant-ui primitives in MUI components:** CONTEXT.md explicitly says Tailwind only. Don't use `<Box>`, `<Typography>`, etc in the chat components. Use Tailwind classes directly.
- **Mixing old and new hooks:** Don't import from `useVoltAgentChat` in new components. The old hook uses `DefaultChatTransport` + `useChat` directly. New code uses `useChatRuntime` which internally manages `useChat`.
- **Custom scroll management:** Don't write `useChatScroll` equivalents. `ThreadPrimitive.Viewport` + `ThreadPrimitive.ScrollToBottom` handle this natively.
- **Global tool renderer registry:** Don't build a manual registry like the old `getToolRenderer()`. Each `makeAssistantToolUI` self-registers when mounted inside `AssistantRuntimeProvider`.
- **Creating files >500 lines:** CLAUDE.md rule. Each tool UI should be its own file, not a mega registry file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auto-scroll to latest message | Custom `useChatScroll` with IntersectionObserver | `ThreadPrimitive.Viewport` + `useThreadViewportAutoScroll` | Handles edge cases (user scrolled up, new messages, streaming) |
| Message branch navigation | Custom state for tracking branches | `BranchPickerPrimitive.Next/Previous/Count/Number` | Comes free with assistant-ui, already wired to runtime |
| Copy message to clipboard | Custom clipboard hook | `ActionBarPrimitive.Copy` | Handles formatting, focus management |
| Message regeneration | Custom retry logic | `ActionBarPrimitive.Reload` | Wired to runtime, handles streaming cancellation |
| Edit previous messages | Custom edit state management | `ActionBarPrimitive.Edit` + EditComposer | Full branching support built-in |
| Streaming markdown render | Custom streamdown parser | `MarkdownTextPrimitive` from `@assistant-ui/react-markdown` | Handles streaming chunks, code highlighting |
| Suggested questions UI | Custom chip list | `ThreadPrimitive.Suggestion` / `SuggestionPrimitive` | Wired to backend metadata |
| Chain of thought display | Custom collapsible reasoning | `ChainOfThoughtPrimitive.Root/AccordionTrigger/Parts` | Native streaming support |
| Tool result component registration | Manual registry + dispatch | `makeAssistantToolUI` self-registration | Declarative, type-safe, handles status lifecycle |

**Key insight:** assistant-ui is designed as a composition framework. The primitives handle all the hard state management (streaming, branching, scroll, focus). Your job is to compose them with Tailwind styles. Fighting this pattern (e.g., using MUI, managing scroll manually) creates more bugs than it solves.

## Common Pitfalls

### Pitfall 1: Missing `@assistant-ui/react-ai-sdk` Package
**What goes wrong:** `useChatRuntime` and `AssistantChatTransport` are NOT in `@assistant-ui/react`. They're in the separate `@assistant-ui/react-ai-sdk` package which is currently NOT installed.
**Why it happens:** The CONTEXT.md mentions these APIs but doesn't note the package dependency.
**How to avoid:** Install `@assistant-ui/react-ai-sdk@1.3.8` before any implementation. This is a hard blocker.
**Warning signs:** Import errors on `useChatRuntime` or `AssistantChatTransport`.

### Pitfall 2: Version Incompatibility Between AI SDK and react-ai-sdk
**What goes wrong:** `@assistant-ui/react-ai-sdk@1.3.9+` requires `ai@^6.0.98` and `@ai-sdk/react@^3.0.100`, but our project has `ai@6.0.77` and `@ai-sdk/react@3.0.79`.
**Why it happens:** The assistant-ui team pins to recent AI SDK versions. Upgrading AI SDK could break backend parity.
**How to avoid:** Pin to `@assistant-ui/react-ai-sdk@1.3.8` which requires `ai@^6.0.73` and `@ai-sdk/react@^3.0.75` -- both satisfied by our current versions.
**Warning signs:** npm peer dependency warnings, runtime errors about missing functions.

### Pitfall 3: HITL Stream Protocol Mismatch
**What goes wrong:** assistant-ui's `requires-action` tool status expects the backend to use AI SDK's native tool suspension mechanism. Our backend uses a custom `data-needs-approval` chunk type + a separate ActionQueue polling mechanism.
**Why it happens:** The backend HITL was built in Phase 24 before assistant-ui integration was planned. It uses `writer.write({ type: 'data-needs-approval', data: {...} })` which is a custom stream chunk type.
**How to avoid:** Don't try to wire assistant-ui's `addResult()` to the backend HITL. Instead, keep the existing poll-based approach: query `PendingAction` records via TanStack Query, render inline approval cards. Restyle with Tailwind but keep the same data flow.
**Warning signs:** Tool UI render function receives `status.type === "requires-action"` but has no mechanism to resolve it via the backend.

### Pitfall 4: Transport Body Format Mismatch
**What goes wrong:** `AssistantChatTransport` sends the full AI SDK message array by default. The backend `POST /ai/chat` expects `{ message: string, conversationId: string }` in the body, NOT the AI SDK messages array.
**Why it happens:** assistant-ui transports send the AI SDK protocol format. The backend's `ChatRequestDto` expects simplified fields.
**How to avoid:** Check if `AssistantChatTransport` supports `prepareSendMessagesRequest` like `DefaultChatTransport` does. If not, use `DefaultChatTransport` from `ai` package instead, with custom body formatting (the old `useVoltAgentChat` already does this). Alternatively, modify the backend to accept the standard AI SDK message format.
**Warning signs:** 400 errors from backend, `message` field undefined in `ChatRequestDto`.

### Pitfall 5: Dual Chat Systems During Transition
**What goes wrong:** Both old (`AiDashboard`) and new (`ChatRuntimeProvider`) systems exist simultaneously. If the AI page route switches to the new system prematurely, features that haven't been migrated yet (like command palette, ask-user modal, email store bridge) will break.
**Why it happens:** Phase 27 builds new, Phase 28 deletes old. During Phase 27, both systems must coexist.
**How to avoid:** Build the new chat as a parallel route or feature-flagged component. Don't modify `pages/dashboard/ai.tsx` to use the new system until ALL chat features are working. The E2E gate at the end of this phase will validate completeness.
**Warning signs:** Missing features after switching routes, broken email-to-AI bridges.

### Pitfall 6: ThreadListPrimitive Conversation Persistence
**What goes wrong:** assistant-ui's `ThreadListPrimitive` expects a thread list adapter/runtime that manages conversation persistence. The backend has REST endpoints (`GET /ai/chat/conversations`, `DELETE /ai/chat/conversations/:id`) but no built-in assistant-ui thread list adapter.
**Why it happens:** assistant-ui provides `InMemoryThreadList` for ephemeral threads and `ExternalThread` for custom backends. Wiring to our custom conversation API requires implementing the thread list adapter interface.
**How to avoid:** Use `InMemoryThreadList` initially and wire it to the backend conversation API via TanStack Query. Or implement a custom thread list adapter that calls the backend endpoints.
**Warning signs:** Thread list doesn't persist across page reloads, conversation switching doesn't load history.

## Code Examples

### Runtime Provider with Auth (Verified Pattern)
```typescript
// Source: installed @assistant-ui/react type definitions + react-ai-sdk npm docs
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useMemo, useRef, useEffect } from "react";
import { getAuthToken } from "@/lib/utils/auth-token";
import { getCsrfToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  // CSRF token needs async init, store in ref
  const csrfRef = useRef("");
  useEffect(() => {
    getCsrfToken().then(t => { csrfRef.current = t; });
  }, []);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE}/api/v1/ai/chat`,
      credentials: "include",
      headers: () => ({
        Authorization: `Bearer ${getAuthToken()}`,
        "X-CSRF-Token": csrfRef.current,
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

### Tool UI Registration (Verified from Type Defs)
```typescript
// Source: node_modules/@assistant-ui/react/dist/model-context/makeAssistantToolUI.d.ts
// ToolCallMessagePartProps includes: args, result, status, addResult, toolCallId, toolName
import { makeAssistantToolUI } from "@assistant-ui/react";

// Render props: { args: TArgs, result: TResult | undefined, status: MessagePartStatus }
// status.type: "running" | "complete" | "incomplete" | "requires-action"
// For "incomplete": status.reason: "cancelled" | "length" | "content-filter" | "other" | "error"

export const CountEmailsToolUI = makeAssistantToolUI<
  { folder?: string; unreadOnly?: boolean },
  { success: boolean; data: { total: number; unread: number; read: number } }
>({
  toolName: "count_emails",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Counting emails{args.folder ? ` in ${args.folder}` : ""}...
          </span>
        </div>
      );
    }
    if (status.type === "incomplete") {
      return (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <span className="text-sm text-destructive">
            Failed to count emails: {status.reason}
          </span>
        </div>
      );
    }
    if (!result?.data) return null;
    return (
      <div className="p-3 rounded-lg border bg-card">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold">{result.data.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">{result.data.unread}</div>
            <div className="text-xs text-muted-foreground">Unread</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{result.data.read}</div>
            <div className="text-xs text-muted-foreground">Read</div>
          </div>
        </div>
      </div>
    );
  },
});
```

### Tool UI Self-Registration Pattern
```typescript
// Source: assistant-ui docs -- tool UIs self-register when mounted inside AssistantRuntimeProvider
// In tool-uis/index.ts -- export all tool UIs as a single component
import { EmailSearchToolUI } from "./EmailSearchToolUI";
import { EmailListToolUI } from "./EmailListToolUI";
import { EmailContentToolUI } from "./EmailContentToolUI";
// ... etc

export function AllToolUIs() {
  return (
    <>
      <EmailSearchToolUI />
      <EmailListToolUI />
      <EmailContentToolUI />
      {/* ... all 14+ tool UIs */}
      <FallbackToolUI />
    </>
  );
}

// Then in the provider:
<AssistantRuntimeProvider runtime={runtime}>
  <AllToolUIs />
  <ChatThread />
</AssistantRuntimeProvider>
```

### Fallback Tool UI (JSON Viewer)
```typescript
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export const FallbackToolUI = makeAssistantToolUI({
  toolName: "*", // catch-all
  render: ({ args, result, status, toolName }) => {
    const [expanded, setExpanded] = useState(false);

    return (
      <div className="rounded-lg border bg-card p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium w-full"
        >
          <span className="text-muted-foreground">{toolName}</span>
          {status.type === "running" && (
            <span className="text-xs text-blue-500 animate-pulse">Running...</span>
          )}
          {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {expanded && (
          <pre className="mt-2 text-xs overflow-auto max-h-60 bg-muted/50 p-2 rounded">
            {JSON.stringify(result ?? args, null, 2)}
          </pre>
        )}
      </div>
    );
  },
});
```

### Thread Composition with Suggestions
```typescript
// Source: ThreadPrimitive + SuggestionPrimitive type exports from node_modules
import {
  ThreadPrimitive,
  SuggestionPrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-3 py-4">
      <div className="w-8 h-8 rounded-full bg-ai/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-ai" />
      </div>
      <div className="flex-1 min-w-0">
        <MessagePrimitive.Content
          components={{
            Text: MarkdownTextPrimitive,
            Reasoning: ChatChainOfThought,
          }}
        />
        <ChatActionBar />
      </div>
    </MessagePrimitive.Root>
  );
}

function ChatComposer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 p-3 border-t bg-background">
      <ComposerPrimitive.Input
        placeholder="Ask anything about your emails..."
        className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <ComposerPrimitive.Send className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
        <Send className="h-4 w-4" />
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useChat` from `@ai-sdk/react` directly | `useChatRuntime` from `@assistant-ui/react-ai-sdk` | assistant-ui 0.12+ | Runtime manages chat state, thread list, branching. No manual state management |
| Manual tool renderer registry (`getToolRenderer()`) | `makeAssistantToolUI` self-registration | assistant-ui 0.10+ | Declarative, type-safe, status lifecycle for free |
| Custom `useChatScroll` with IntersectionObserver | `ThreadPrimitive.Viewport` + `useThreadViewportAutoScroll` | assistant-ui 0.8+ | No custom scroll code needed |
| Custom streaming markdown parser (streamdown) | `MarkdownTextPrimitive` from `@assistant-ui/react-markdown` | assistant-ui 0.10+ | Handles streaming chunks natively |
| `useAssistantState`/`useAssistantApi` (v0.12) | `useAui`/`useAuiState` (v0.12.14) | 0.12.14 | Renamed hooks -- the v0.12 naming is deprecated in 0.13 |

**Deprecated/outdated:**
- Individual context hooks (`useThread`, `useComposer`, `useMessage`) -- replaced by unified `useAuiState` in 0.12+
- `useAssistantState` / `useAssistantApi` -- deprecated in 0.12.14 (renamed to `useAuiState` / `useAui`), will be removed in 0.13
- `@assistant-ui/react-ai-sdk@1.1.x` -- requires `ai@^5.x` (incompatible with our `ai@6.x`)

## Open Questions

1. **Transport Body Format Compatibility**
   - What we know: `AssistantChatTransport` sends the AI SDK message format. The backend `ChatRequestDto` expects `{ message: string, conversationId: string }`.
   - What's unclear: Does `AssistantChatTransport` support `prepareSendMessagesRequest` override like `DefaultChatTransport`? If not, the body format won't match.
   - Recommendation: During implementation, test `AssistantChatTransport` first. If body format mismatches, either (a) use `DefaultChatTransport` with manual body formatting (proven pattern from `useVoltAgentChat`), or (b) update the backend `ChatRequestDto` to accept the AI SDK message array. Option (a) is lower risk.

2. **Thread List Adapter for Backend Conversations**
   - What we know: assistant-ui provides `InMemoryThreadList` and `ExternalThread`. Backend has REST endpoints for conversations.
   - What's unclear: The exact adapter interface for wiring `ThreadListPrimitive` to a REST backend. The docs mention "external thread" but specifics need implementation-time investigation.
   - Recommendation: Start with a simpler approach -- build a custom conversation sidebar component using TanStack Query, not `ThreadListPrimitive`. Wire thread switching via the runtime API. Only use `ThreadListPrimitive` if the adapter wiring is straightforward.

3. **Catch-all Tool UI (`toolName: "*"`)**
   - What we know: CONTEXT.md requests a "JSON fallback for unregistered tools". The `makeAssistantToolUI` takes a `toolName: string`.
   - What's unclear: Whether `"*"` is supported as a wildcard. The type definition shows `toolName: string` with no documented wildcard.
   - Recommendation: If `"*"` doesn't work, use `useAssistantToolUI` hook with a custom dispatch function, or render the fallback as the default `ToolFallback` component in `MessagePrimitive.Content`.

4. **Zod 4 Dependency**
   - What we know: `@assistant-ui/react-ai-sdk@1.3.x` lists `zod@^4.3.5` as a dependency. Our project likely uses Zod 3.x.
   - What's unclear: Whether this causes conflicts or if Zod 4 is a non-peer dependency that gets isolated in `node_modules`.
   - Recommendation: Check for Zod version conflicts during installation. If `npm install` produces errors, use `--legacy-peer-deps`.

## Sources

### Primary (HIGH confidence)
- `@assistant-ui/react@0.12.9` type definitions -- `node_modules/@assistant-ui/react/dist/` (verified locally)
- `@assistant-ui/react-ai-sdk` npm page -- version compatibility matrix, peer/regular dependencies
- Existing codebase: `useVoltAgentChat`, `AiDashboard/`, `tool-renderers/`, `ai-chat.controller.ts` -- current implementation patterns
- `ai@6.0.77` and `@ai-sdk/react@3.0.79` -- installed versions verified

### Secondary (MEDIUM confidence)
- [assistant-ui official docs](https://www.assistant-ui.com/docs) -- API reference, getting started
- [makeAssistantToolUI docs](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui) -- render props, status types
- [@assistant-ui/react-ai-sdk docs](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk) -- useChatRuntime, AssistantChatTransport
- [Migration to v0.12](https://www.assistant-ui.com/docs/migrations/v0-12) -- API changes in current version

### Tertiary (LOW confidence)
- [GitHub Issue #2374](https://github.com/assistant-ui/assistant-ui/issues/2374) -- addResult() continuation issue (Mastra-specific, may not apply)
- [GitHub Issue #1899](https://github.com/assistant-ui/assistant-ui/issues/1899) -- HITL interrupt flow issues with LangGraph
- [with-ai-sdk-v6 example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-ai-sdk-v6) -- example structure (not deeply verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- versions verified locally via node_modules, dependency chains validated
- Architecture: HIGH -- primitives API verified from installed type definitions, composition patterns from official docs
- Pitfalls: HIGH -- version incompatibility discovered and verified, HITL protocol mismatch identified from codebase tracing
- Tool UI API: HIGH -- `makeAssistantToolUI` signature and `ToolCallMessagePartProps` verified from local type defs
- Transport body format: MEDIUM -- need implementation-time verification of `AssistantChatTransport` body format
- Thread list adapter: MEDIUM -- exact wiring approach needs implementation-time investigation

**Research date:** 2026-03-02
**Valid until:** 2026-03-16 (14 days -- assistant-ui moves fast, check for 0.13 release)
