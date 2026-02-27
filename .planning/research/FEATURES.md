# Feature Landscape: v3.2 AI Rebuild & Cleanup

**Domain:** AI layer rebuild for professional email client (chat UI, tool consolidation, backend simplification)
**Researched:** 2026-02-27
**Overall confidence:** HIGH (core patterns verified via official docs and production examples)

## Executive Summary

The v3.2 rebuild targets four domains: (1) replacing the custom chat UI with assistant-ui, a production-grade React library built on Radix/shadcn primitives; (2) migrating from VoltAgent to raw AI SDK v6 with the new ToolLoopAgent abstraction; (3) consolidating 28 tools down to ~15 using domain-action merging and replacing agent loops with `generateText` + `Output.object()` for non-chat features; (4) killing dead frontend components and reducing the 67-file ai-elements directory to what assistant-ui does not already provide.

The critical insight: assistant-ui already handles streaming, auto-scroll, tool rendering, message branching, accessibility, and composability. Building this from scratch was the original mistake. The rebuild should be about *adopting* not *rebuilding*.

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

### Chat UI: Core Experience

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Token-by-token streaming** | Users perceive streaming responses as 40-60% faster than equivalent non-streaming (verified by UX research). Any "waiting for response" spinner is unacceptable in 2026. | Low | assistant-ui handles this natively. AI SDK v6 `streamText` provides the backend. SSE transport is standard. |
| **Auto-scroll with scroll-to-bottom anchor** | Every chat product (ChatGPT, Claude, Cursor) does this. Users expect content to follow as it streams, with a "jump to bottom" button when they scroll up. | Low | assistant-ui `ThreadPrimitive.Viewport` provides this out of the box. Current custom `useChatScroll` hook can be deleted. |
| **Message editing and regeneration** | ChatGPT established this pattern. Users expect to edit a previous message and get a new response, or click "regenerate" on an AI response. | Low | assistant-ui supports message editing natively via Composer-inside-Message pattern. Message branching (exploring different paths) included. |
| **Tool call visualization** | When AI searches emails, lists calendars, etc., users need to see what is happening. A spinning icon with "Searching emails..." is the minimum. Progress states (running/complete/error) are expected. | Medium | assistant-ui `makeAssistantToolUI` provides `status.type` ("running", "complete", "incomplete", "requires_action") with full args/result access. Maps directly to existing SmartToolOutput pattern but with better API. |
| **Keyboard-driven input** | Enter to send, Shift+Enter for newline, Cmd+K for command palette. Superhuman's entire UX is built on keyboard shortcuts (100+ shortcuts, users 2x faster). | Low | assistant-ui `ComposerPrimitive` handles basic input. Command palette remains custom (keep existing `CommandPalette` component). |
| **Mobile-responsive chat** | 40%+ of email usage is mobile. Chat must work on small screens. Shortwave's mobile experience is a key differentiator. | Medium | assistant-ui components are responsive by default (Tailwind-based). Replace existing MUI MobileChatDialog/MobileLayout with assistant-ui primitives. |
| **Typing/thinking indicator** | Psychological cue that AI is working. Every chat product shows this. | Low | assistant-ui handles streaming state natively. Can add shimmer effect during tool execution. |
| **Conversation history** | Users expect to resume previous conversations. ChatGPT sidebar with conversation list is the established pattern. | Medium | assistant-ui supports thread management via `AssistantRuntime`. Backend already has conversation management service. |

### Chat UI: Tool Rendering

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Rich tool result cards** | Users expect structured data (email lists, calendar events, contacts) rendered as cards, not raw JSON. Shortwave and ChatGPT both render structured results inline. | Medium | Migrate existing 10 custom renderers (EmailSearchRenderer, BriefingRenderer, etc.) to `makeAssistantToolUI` pattern. The API is cleaner: `render: ({ args, result, status }) => <Component />`. |
| **Error state handling** | When a tool fails, show a clear error with retry option, not a cryptic message. | Low | `makeAssistantToolUI` provides `isError` flag and `status.type === "incomplete"` with `reason` property. |
| **Human-in-the-loop approval** | For destructive actions (send email, delete, move), users expect a confirmation step. Superhuman requires explicit send confirmation. | Medium | AI SDK v6 has `needsApproval: true` on tools with conditional approval. assistant-ui provides `status.type === "requires_action"` with `addResult` callback for inline approval. Current HITL service maps directly. |
| **Chain-of-thought display** | Users want to see the AI's reasoning process. Claude and ChatGPT both show "thinking" sections. | Low | Keep existing ChainOfThought component, render inside assistant-ui message. The existing pattern works well. |

### Backend: AI Pipeline

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Structured output for non-chat features** | Briefing, follow-up detection, email analysis should return typed JSON, not free text. This is faster, cheaper, more reliable than agent loops. | Medium | AI SDK v6 `generateText` + `Output.object({ schema })` replaces `generateObject` (deprecated). Zod schemas for validation. `Output.array({ element })` for lists. |
| **Reusable agent definition** | The same AI configuration (model, instructions, tools) should work across chat UI, API endpoints, and background jobs. | Medium | AI SDK v6 `ToolLoopAgent` encapsulates model + instructions + tools. Define once, use via `.generate()`, `.stream()`, or `createAgentUIStreamResponse()`. Type-safe with `InferAgentUIMessage`. |
| **Tool timeout and error handling** | Tools must not hang indefinitely. Existing `withToolTimeout` pattern is correct but needs migration to AI SDK v6 tool format. | Low | AI SDK v6 `ToolLoopAgent` supports `timeout` parameter (totalMs/stepMs/chunkMs) natively. Keep existing timeout logic inside tool execute functions. |
| **Rate limiting and circuit breaker** | LLM APIs fail. Must degrade gracefully. | Low | Existing `rate-limiter.service.ts` and circuit breaker pattern stay. Wrap AI SDK v6 model calls with existing infrastructure. |

---

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Artifact panel (side-by-side)** | Claude's artifact pattern: AI generates structured content (email draft, analysis, briefing) displayed in a side panel. Users can edit, export, or iterate. This is the #1 UX differentiator in AI chat interfaces in 2026. | High | assistant-ui does not provide this natively. Keep and improve existing `ArtifactPanel` component. Render tool results that are "viewable" (drafts, analyses, briefings) in the side panel. |
| **Contextual AI in email view** | Instead of requiring users to switch to chat, surface AI actions inline: "Summarize this thread", "Draft reply", "Add follow-up". Shortwave's inline AI actions and Superhuman's Auto Drafts are the gold standard. | High | This is beyond assistant-ui scope. Build as custom components that call `generateText` + `Output.object()` directly (no chat loop needed). |
| **Smart tool routing** | Instead of giving the LLM 28 tools and hoping it picks right, pre-filter tools based on query intent. Research shows tool selection accuracy drops significantly past ~10 tools. | Medium | Use existing `nlp-intent-classifier.service.ts` to detect intent, then pass only relevant tools to `ToolLoopAgent` via `activeTools` parameter. AI SDK v6 supports `prepareStep` to dynamically adjust available tools per step. |
| **Streaming structured data** | For array outputs (email lists, follow-ups), stream each element as it completes rather than waiting for the full array. | Medium | AI SDK v6 `streamText` with `Output.array({ element })` provides `elementStream` -- each element arrives complete and validated as it generates. Enables progressive rendering. |
| **Suggested prompts with context** | After tool results, suggest follow-up questions based on what was found. "Found 3 emails from John -- ask: 'What are the action items from John's emails?'" | Low | Existing `suggested-prompts.service.ts` stays. Wire into assistant-ui via custom message parts. |
| **Writing style learning** | Ghostwriter pattern (Shortwave): learn user's writing style from sent emails, generate drafts that sound like the user. | Already built | Existing `learning.service.ts` and draft generation. Keep as-is, just migrate the LLM call to `generateText` + `Output.object()`. |

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom streaming infrastructure** | assistant-ui + AI SDK v6 handle streaming, auto-scroll, partial rendering, interruption, and retry. Building custom versions is the mistake we made in v3.0. | Use assistant-ui `ThreadPrimitive` + AI SDK v6 `streamText`. Delete custom `useChatScroll`, `StreamingMessage`, `TypingIndicator`. |
| **Custom message state management** | Current `useChatController` + `useVoltagentChat` hooks manage complex message state manually. This is what assistant-ui's runtime was built to replace. | Use assistant-ui `AssistantRuntimeProvider` with AI SDK runtime adapter. Single source of truth for all chat state. |
| **Agent pool / multi-agent orchestration** | VoltAgent's `AgentPoolService` and supervisor agent add complexity without proportional value. The LLM does not need an "agent supervisor" for an email client. | Single `ToolLoopAgent` with domain tools. For complex multi-step tasks, use `prepareStep` to adjust tools between steps. |
| **65+ AI elements library** | Current `ai-elements/` has 67 files. Many are generic chat primitives (loader, shimmer, message, tool, conversation) that duplicate what assistant-ui provides. | Keep only domain-specific renderers (10 tool renderers + artifact panel). Delete everything assistant-ui replaces: message, tool, conversation, loader, shimmer, controls, prompt-input, suggestion. |
| **Separate read-only and write tool files** | Current split between `email.tools.ts` (read) and `email-write.tools.ts` (write) creates duplicate tool names (`manage_email`, `bulk_email_actions`). | Merge into single `email.tools.ts` with all email operations. Use `needsApproval: true` for write operations. |
| **Agent metrics and observability hooks** | VoltAgent's observability layer (hooks.ts, metrics.ts, agent-metrics.service.ts) adds overhead for metrics nobody checks. | Use AI SDK v6's built-in `onStepFinish` / `onFinish` callbacks for essential logging. Delete custom observability layer. |
| **Task complexity classifier** | `task-complexity-classifier.service.ts` classifies prompts as simple/medium/complex to route to different agent configs. Unnecessary with a single well-configured ToolLoopAgent. | Delete. Single agent handles all complexity levels. Use `stopWhen: stepCountIs(20)` default, which is sufficient. |

---

## Feature Dependencies

```
assistant-ui adoption ──> Tool renderer migration (makeAssistantToolUI)
                     ──> Chat state migration (delete custom hooks)
                     ──> Delete duplicate ai-elements components

AI SDK v6 migration  ──> Tool definition rewrite (createTool -> tool())
                     ──> ToolLoopAgent definition
                     ──> generateText + Output.object() for non-chat features
                     ──> Delete VoltAgent dependency

Tool consolidation   ──> Merge email read/write tools
                     ──> Merge search_emails + semantic_search_emails
                     ──> Merge list_emails + list_email_index
                     ──> Smart tool routing (activeTools)

Non-chat AI migration ──> Briefing: generateText + Output.object()
                      ──> Follow-up detection: generateText + Output.array()
                      ──> Email analysis: generateText + Output.object()
                      ──> Writing style: generateText + Output.object()
```

---

## Tool Consolidation Plan

### Current State: 28 tools

```
Email Domain (9):     list_emails, manage_email (x2), search_emails,
                      count_emails, bulk_email_actions (x2), list_email_index,
                      get_email_content
Insights (3):         compose_reply, analyze_email, semantic_search_emails
Calendar (2):         get_events, manage_event
Contacts (2):         search_contacts, manage_contact
Folders (2):          list_folders, manage_folder
Briefing (1):         get_daily_briefing
CRM (1):              get_relationship_stats
Attachments (2):      list_email_attachments, get_attachment_content
Memory (2):           search_memory, store_memory
Documents (1):        manage_document_library
Analytics (1):        analyze_data
Web Search (1):       web_search
Follow-ups (1):       list_follow_ups
Utility (1):          ask_user_clarification
```

### Target State: ~15 tools

| New Tool | Merges | Rationale |
|----------|--------|-----------|
| `email_search` | search_emails + semantic_search_emails + list_email_index | Three tools that find emails. LLM should not choose between "keyword search" and "semantic search" -- the backend should decide (hybrid RRF already does this). |
| `email_read` | list_emails + get_email_content + count_emails | Reading operations. Action parameter: list/get/count. Reduces 3 tools to 1. |
| `email_write` | manage_email (write) + compose_reply + bulk_email_actions | Writing operations. Action: send/reply/forward/archive/trash/label/bulk. `needsApproval: true`. |
| `calendar` | get_events + manage_event | Already consolidated pattern (action parameter). Keep as-is. |
| `contacts` | search_contacts + manage_contact | Already consolidated pattern. Keep as-is. |
| `folders` | list_folders + manage_folder | Already consolidated pattern. Keep as-is. |
| `attachments` | list_email_attachments + get_attachment_content | Merge to single tool with action: list/get. |
| `memory` | search_memory + store_memory | Merge to single tool with action: search/store. |
| `web_search` | web_search | Keep as-is. |
| `documents` | manage_document_library | Keep as-is. |
| `analytics` | analyze_data | Keep as-is. |
| `ask_user` | ask_user_clarification | Keep as-is. Human-in-the-loop is critical. |
| `relationship_stats` | get_relationship_stats | Keep as-is. |

**Removed from chat tools (moved to generateText + Output.object):**
- `get_daily_briefing` -- becomes a direct API call, not a chat tool
- `list_follow_ups` -- becomes a direct API call, not a chat tool
- `analyze_email` -- available in chat but also used standalone via generateText

**Result: 13 chat tools + 3 non-chat generateText features = 16 total AI functions**

### Why ~15 is the Right Number

Research consensus (HIGH confidence, multiple sources):
- Tool selection accuracy degrades past ~10 tools given to an LLM at once
- With smart routing (pre-filtering by intent), sending 5-8 relevant tools per request is optimal
- 13 chat tools with intent-based routing means the LLM sees ~6-8 tools per request
- Fewer tools = faster inference (LLM reads less in system prompt), cheaper (fewer tokens), more accurate selection

---

## generateText vs ToolLoopAgent Decision Matrix

### Use generateText + Output.object() when:

| Scenario | Pattern | Example |
|----------|---------|---------|
| Pre-fetched data, structured output | `generateText({ output: Output.object({ schema }) })` | **Daily briefing**: fetch unread emails + calendar + follow-ups from DB, pass as prompt context, get structured briefing JSON back. No tools needed -- data is already available. |
| Array of typed items | `generateText({ output: Output.array({ element }) })` | **Follow-up detection**: pass email thread text, get array of `{ description, dueDate, priority }` items. Streaming via `elementStream` for progressive rendering. |
| Classification / extraction | `generateText({ output: Output.choice({ options }) })` | **Email intent**: classify as "needs_reply", "informational", "action_required", "spam". |
| Single-shot analysis | `generateText({ output: Output.object({ schema }) })` | **Email analysis**: summarize thread, extract action items, identify sentiment. Pre-fetch email content, pass as context. |

### Use ToolLoopAgent when:

| Scenario | Pattern | Example |
|----------|---------|---------|
| User asks open-ended question | `agent.stream({ prompt, messages })` | "What did John email me about last week?" -- agent calls `email_search`, reads results, may call `email_read` for details, then responds. |
| Multi-step task requiring real-time data | `agent.stream({ prompt })` | "Schedule a meeting with everyone in the Q3 review thread" -- agent searches emails, extracts attendees, checks calendar, creates event. |
| Interactive conversation with tool use | `createAgentUIStreamResponse()` | General chat with AI assistant where user iterates ("also check my calendar", "draft a reply"). |
| Actions requiring approval | Agent with `needsApproval` tools | "Send a reply to Maria saying I accept" -- agent drafts, user approves, agent sends. |

### Concrete Migration Examples

**Daily Briefing (currently: agent loop with get_daily_briefing tool)**
```typescript
// BEFORE: Agent calls get_daily_briefing tool, which calls service, which calls LLM
// Two LLM calls: one for tool selection, one for briefing generation

// AFTER: Direct generateText, one LLM call
const { output } = await generateText({
  model: mistral('mistral-large-latest'),
  output: Output.object({
    schema: z.object({
      summary: z.string(),
      urgentEmails: z.array(z.object({ id: z.string(), subject: z.string(), reason: z.string() })),
      todayEvents: z.array(z.object({ title: z.string(), time: z.string(), attendees: z.number() })),
      pendingFollowUps: z.array(z.object({ description: z.string(), dueDate: z.string() })),
      suggestedActions: z.array(z.string()),
    }),
  }),
  prompt: `Generate daily briefing from this data:\n${JSON.stringify(prefetchedData)}`,
});
```

**Follow-up Detection (currently: follow-up-extraction.service calls LLM via VoltAgent)**
```typescript
// AFTER: Direct generateText with array output
const { elementStream } = streamText({
  model: mistral('mistral-large-latest'),
  output: Output.array({
    element: z.object({
      description: z.string(),
      dueDate: z.string().nullable(),
      priority: z.enum(['high', 'medium', 'low']),
      sourceEmailId: z.string(),
    }),
  }),
  prompt: `Extract follow-up items from these emails:\n${emailTexts}`,
});

for await (const followUp of elementStream) {
  // Each follow-up arrives validated and complete
  await saveFollowUp(followUp);
}
```

---

## Frontend Component Deletion Plan

### Components assistant-ui Replaces (DELETE)

| Current Component | assistant-ui Replacement | Confidence |
|-------------------|-------------------------|------------|
| `StreamingMessage.tsx` | ThreadPrimitive.Messages + streaming | HIGH |
| `TypingIndicator.tsx` (both copies) | Built-in streaming state | HIGH |
| `useChatScroll.ts` | ThreadPrimitive.Viewport (auto-scroll) | HIGH |
| `useChatController.ts` | AssistantRuntime | HIGH |
| `ChatMessages.tsx` | ThreadPrimitive.Messages + MessagePrimitive | HIGH |
| `ChatInput.tsx` | ComposerPrimitive | HIGH |
| `MentionInput.tsx` | ComposerPrimitive with custom input | MEDIUM |
| `ChatArea.tsx` | ThreadPrimitive.Root | HIGH |
| `MobileChatDialog.tsx` | Responsive Thread component | HIGH |
| `DesktopLayout.tsx` / `MobileLayout.tsx` | Custom layout wrapping Thread | MEDIUM |
| `ai-elements/message.tsx` | MessagePrimitive | HIGH |
| `ai-elements/tool.tsx` | makeAssistantToolUI | HIGH |
| `ai-elements/conversation.tsx` | Thread primitives | HIGH |
| `ai-elements/loader.tsx` | Built-in streaming state | HIGH |
| `ai-elements/shimmer.tsx` | Custom (keep for loading states) | MEDIUM |
| `ai-elements/prompt-input.tsx` | ComposerPrimitive | HIGH |
| `ai-elements/suggestion.tsx` | Custom (assistant-ui has no equivalent) | -- |
| `ai-elements/controls.tsx` | ComposerPrimitive actions | HIGH |

### Components to KEEP (domain-specific, no assistant-ui equivalent)

| Component | Reason |
|-----------|--------|
| `ArtifactPanel.tsx` | Side-panel for structured results. assistant-ui has no artifact concept. |
| `tool-renderers/*.tsx` (10 renderers) | Domain-specific rendering (EmailSearchRenderer, BriefingRenderer, etc.). Migrate to `makeAssistantToolUI` format. |
| `ChainOfThought.tsx` | Reasoning display. Keep, render inside messages. |
| `Sources.tsx` | Citation display for RAG results. Keep. |
| `CommandPalette/` | Cmd+K palette. Independent of chat. |
| `DailyBriefing/` | Standalone briefing widget. Will use generateText directly. |
| `FollowUpTracker/` | Standalone follow-up widget. Independent of chat. |
| `MemoryBrowser/` | Memory management UI. Independent of chat. |
| `ai-elements/code-block.tsx` | Syntax highlighting for code. Keep. |
| `ai-elements/inline-citation.tsx` | RAG citation rendering. Keep. |

### Estimated Deletion: ~35 files from ai-elements + ~10 files from AiDashboard

---

## MVP Recommendation

Prioritize (in order):

1. **AI SDK v6 migration** (backend) -- Foundation for everything else. Define ToolLoopAgent, migrate tool definitions from `createTool` (VoltAgent) to `tool()` (AI SDK v6). Wire `streamText` endpoint. This unblocks the frontend.

2. **assistant-ui adoption** (frontend) -- Replace custom chat UI. Install `@assistant-ui/react`, set up `AssistantRuntimeProvider` with AI SDK runtime adapter. Port Thread/Composer/Message primitives. Delete custom hooks and state management.

3. **Tool consolidation** (backend) -- Merge 28 tools to ~15. Write smart tool router. This improves response quality immediately.

4. **generateText migration for non-chat features** -- Move briefing, follow-ups, email analysis to `generateText` + `Output.object()`. Cheaper, faster, more reliable.

5. **Frontend cleanup** -- Delete dead components, unused ai-elements, VoltAgent artifacts.

**Defer:**
- Artifact panel redesign: Works well enough. Improve incrementally.
- Contextual AI in email view: High value but high complexity. v3.3.
- Advanced streaming (elementStream for arrays): Nice-to-have, not blocking.

---

## assistant-ui Integration Architecture

### Runtime Stack

```
AssistantRuntimeProvider (root)
  |
  +-- useAssistantRuntime() -- AI SDK runtime adapter
  |     connects to: POST /api/v1/ai/chat (streamText endpoint)
  |
  +-- ThreadPrimitive.Root
  |     +-- ThreadPrimitive.Viewport (auto-scroll)
  |     |     +-- ThreadPrimitive.Messages
  |     |           +-- MessagePrimitive.Root (per message)
  |     |                 +-- MessagePrimitive.Content (text + tool parts)
  |     |                       +-- [makeAssistantToolUI renderers]
  |     |
  |     +-- ComposerPrimitive.Root (input area)
  |           +-- ComposerPrimitive.Input
  |           +-- ComposerPrimitive.Send
  |
  +-- [Custom: ArtifactPanel] (side panel)
  +-- [Custom: ConversationList] (sidebar)
```

### makeAssistantToolUI Migration Pattern

```typescript
// Current pattern (SmartToolOutput.tsx):
function SmartToolOutput({ toolName, args, result }: Props) {
  const Renderer = TOOL_REGISTRY[toolName] ?? FallbackRenderer;
  return <Renderer args={args} result={result} />;
}

// New pattern (assistant-ui):
const EmailSearchToolUI = makeAssistantToolUI({
  toolName: 'email_search',
  render: ({ args, result, status }) => {
    if (status.type === 'running') return <SearchingSkeleton query={args.query} />;
    if (status.type === 'incomplete') return <ErrorState reason={status.reason} />;
    return <EmailSearchRenderer results={result} />;
  },
});

// Register all tool UIs inside AssistantRuntimeProvider:
<AssistantRuntimeProvider runtime={runtime}>
  <EmailSearchToolUI />
  <EmailReadToolUI />
  <CalendarToolUI />
  {/* ... */}
  <Thread />
</AssistantRuntimeProvider>
```

### Styling Approach

assistant-ui is built on shadcn/ui + Tailwind CSS with CSS variable theming (`--primary`, `--background`, `--foreground`). MailAgent already uses Tailwind in ai-elements. The integration path:

1. Map existing theme tokens to CSS variables
2. Use assistant-ui's default shadcn styling as base
3. Override with existing brand colors via CSS variables
4. No MUI in chat components (Tailwind only, matching existing ai-elements pattern)

---

## Sources

### HIGH Confidence (Official Documentation)
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6) -- ToolLoopAgent, Output.object, migration path
- [AI SDK Structured Data Generation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- Output.object, Output.array, streaming patterns
- [AI SDK Building Agents](https://ai-sdk.dev/docs/agents/building-agents) -- ToolLoopAgent usage, lifecycle callbacks
- [AI SDK ToolLoopAgent Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent) -- Full API documentation
- [AI SDK Migration Guide 5.x to 6.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) -- Breaking changes, codemod
- [assistant-ui Documentation](https://www.assistant-ui.com/docs) -- Architecture, runtime, primitives
- [assistant-ui makeAssistantToolUI](https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui) -- Tool rendering API

### MEDIUM Confidence (Verified by Multiple Sources)
- [SaaStr: assistant-ui Market Analysis](https://www.saastr.com/ai-app-of-the-week-assistant-ui-the-react-library-thats-eating-the-ai-chat-interface-market/) -- Adoption, market position
- [Shortwave AI Design Patterns](https://www.shortwave.com/) -- Ghostwriter, RAG search, inline AI
- [Superhuman UX Philosophy](https://help.superhuman.com/hc/en-us/articles/45191759067411-Speed-Up-With-Shortcuts) -- Keyboard-driven design, Cmd+K pattern
- [Tool Calling Optimization Research](https://www.useparagon.com/learn/rag-best-practices-optimizing-tool-calling/) -- Tool count impact on accuracy
- [Streaming UX Research](https://www.keyvalue.systems/blog/powering-ai-chatbots-with-real-time-streaming-a-developers-guide/) -- 40-60% perceived latency reduction

### LOW Confidence (Single Source, Needs Validation)
- Tool count threshold (~10 tools max per request) -- multiple informal sources agree but no rigorous benchmark found
- assistant-ui exact npm download numbers -- could not fetch from npmjs.com
