---
phase: 27-chat-frontend
verified: 2026-03-03T00:00:00Z
status: gaps_found
score: 4/5 requirements verified
re_verification: false
gaps:
  - truth: "Conversation list sidebar uses ThreadListPrimitive with custom adapter calling GET /api/v1/ai/conversations and switches threads"
    status: partial
    reason: "ThreadListPrimitive is mounted and renders a thread list, but no custom adapter wires it to the backend REST endpoints (GET /api/v1/ai/conversations, DELETE /api/v1/ai/conversations/:id). The implementation uses the runtime's in-memory thread state only. Previously saved conversations do NOT load on page reload. Explicitly acknowledged as a deferral in 27-01-SUMMARY.md."
    artifacts:
      - path: "frontend/src/components/chat/ChatThreadList.tsx"
        issue: "Uses ThreadListPrimitive.Items with no backend adapter. No voltAgentApi.listConversations() call. No conversation hydration on mount."
      - path: "frontend/src/components/chat/ChatRuntimeProvider.tsx"
        issue: "useChatRuntime has no cloud or adapters config that would enable thread persistence or history loading."
    missing:
      - "A ThreadHistoryAdapter (or equivalent) that calls voltAgentApi.listConversations() on mount and populates ThreadListPrimitive"
      - "Wire voltAgentApi.deleteConversation() to ThreadListItemPrimitive.Delete action"
      - "Either configure useChatRuntime with AssistantCloud or implement a custom thread list adapter"
human_verification:
  - test: "Streaming token-by-token rendering"
    expected: "User sends a message, response tokens appear progressively in the chat bubble as they stream from the backend"
    why_human: "Cannot verify streaming behavior without running the backend + frontend stack"
  - test: "HITL approval card appears for destructive actions"
    expected: "Sending a message like 'send an email to test@test.com' triggers a pending HITL action that renders an inline approve/reject card in the assistant message"
    why_human: "Poll-based HITL requires the backend to create a PendingAction record -- cannot verify without a live backend"
  - test: "Mobile layout at 375px"
    expected: "Full-screen thread visible, hamburger button in top-left, tapping hamburger slides in the conversation list from the left"
    why_human: "CSS-based responsive behavior requires a real browser at that viewport size"
  - test: "Message branching (edit + regenerate)"
    expected: "Editing a previous user message creates a new branch, and BranchPicker shows X/Y navigation"
    why_human: "Requires live runtime interaction to verify branch state"
---

# Phase 27: Chat Frontend Verification Report

**Phase Goal:** AI chat UI rebuilt with assistant-ui primitives replacing all custom MUI chat components, with tool rendering, HITL inline, and mobile support
**Verified:** 2026-03-03
**Status:** gaps_found (4/5 requirements verified; 1 gap + 4 human verifications needed)
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | assistant-ui runtime connects to POST /api/v1/ai/chat with JWT+CSRF auth headers | VERIFIED | `ChatRuntimeProvider.tsx` L54-69: `useChatRuntime` + `AssistantChatTransport` with `api: \`${API_BASE}/api/v1/ai/chat\``, `credentials: "include"`, `headers: getHeaders` returning `Authorization: Bearer ...` and `X-CSRF-Token`. Custom `prepareSendMessagesRequest` maps to backend's `{ message, conversationId }` shape. |
| 2 | Chat thread renders messages with streaming markdown, auto-scroll, and scroll-to-bottom | VERIFIED | `ChatThread.tsx`: `ThreadPrimitive.Root` > `ThreadPrimitive.Viewport` > `ThreadPrimitive.Messages` + `ThreadPrimitive.ViewportFooter` with `ThreadPrimitive.ScrollToBottom`. `AssistantMessage.tsx`: `MessagePrimitive.Content` with `Text: MarkdownWithStreaming` (MarkdownTextPrimitive). |
| 3 | Composer accepts input, sends on Enter/button, and cancels streaming via Stop | VERIFIED | `ChatComposer.tsx`: `ComposerPrimitive.Root` + `ComposerPrimitive.Input` + `ComposerPrimitive.Send` + `ComposerPrimitive.Cancel`. All i18n strings wired via `useTranslations()`. |
| 4 | User can edit a previous message and regenerate (branching) | VERIFIED | `UserMessage.tsx`: `ActionBarPrimitive.Edit`. `ChatBranchPicker.tsx`: `BranchPickerPrimitive.Root` with `hideWhenSingleBranch` + Previous/Next/Number/Count. `AssistantMessage.tsx` renders `ChatBranchPicker` in action row. |
| 5 | Chain of thought reasoning renders in ChainOfThoughtPrimitive | VERIFIED | `ChatChainOfThought.tsx`: `ChainOfThoughtPrimitive.Root` + `ChainOfThoughtPrimitive.AccordionTrigger` + `ChainOfThoughtPrimitive.Parts`. Wired in `AssistantMessage.tsx` as `ChainOfThought: ChatChainOfThought` in `MessagePrimitive.Content`. |
| 6 | Suggested questions render from backend metadata and insert into composer on click | VERIFIED | `ChatSuggestions.tsx`: `ThreadPrimitive.Suggestions` with `SuggestionPrimitive.Trigger` + `SuggestionPrimitive.Title`. Rendered in `ChatThread.tsx` footer above composer. |
| 7 | Conversation list sidebar uses ThreadListPrimitive with custom adapter calling GET /api/v1/ai/conversations | PARTIAL-FAIL | `ChatThreadList.tsx` uses `ThreadListPrimitive.Root` + `ThreadListItemPrimitive` (new, delete, title) -- UI is correct. **BUT**: no `voltAgentApi.listConversations()` call, no backend adapter, no conversation history on reload. In-memory only. Explicitly deferred in 27-01-SUMMARY.md. |
| 8 | Each email/data tool renders a rich card with running/complete/error states | VERIFIED | 10 tool UIs in `tool-uis/`: EmailSearchToolUI (search_emails, list_emails, semantic_search_emails), EmailListToolUI (list_email_index), EmailContentToolUI, FollowUpToolUI, ContactToolUI, EventToolUI, CountToolUI, FolderToolUI. All use `makeAssistantToolUI`, all handle running/complete/incomplete states. |
| 9 | Each analysis/AI tool renders a rich card with running/complete/error states | VERIFIED | 6 tool UIs: AnalysisToolUI (analyze_email), MemoryToolUI + MemorySearchToolUI (search_memory, memory_search), BriefingToolUI (get_daily_briefing), CrmToolUI (get_relationship_stats), TriageToolUI (bulk_email_actions). All use `makeAssistantToolUI`. |
| 10 | Unregistered tools show a collapsible JSON fallback | VERIFIED | `FallbackToolUI.tsx`: `makeAssistantToolUI` with `toolName: '*'`, renders tool name + running/complete status + `<details>` JSON viewer for args and result. |
| 11 | HITL approval card renders inline -- poll-based functional, native requires_action code present | VERIFIED | `HitlApprovalCard.tsx`: both `HitlApprovalCard` (poll-based, functional) and `HitlApprovalCardFromStatus` (native path, gated). `AssistantMessage.tsx`: `HitlPendingActions()` calls `useAiActions()`, filters `status === 'PENDING'`, renders `HitlApprovalCard` per action. `TriageToolUI.tsx`: handles `status.type === 'requires-action'` with `HitlApprovalCardFromStatus`. |
| 12 | Mobile layout (375px) shows full-screen thread with hamburger/back sidebar toggle | VERIFIED | `ChatMobileLayout.tsx`: `showSidebar` state, hamburger (`MessagesSquare`) opens sidebar, back (`ArrowLeft`) closes. CSS in `chat-layout.css`: `.chat-mobile-layout { display: flex }` below 768px, `.chat-desktop-layout { display: none }` below 768px. Slide transition via `translateX(-100%)` / `[data-visible='true'] translateX(0)`. |
| 13 | Desktop layout (1440px) shows conversation sidebar + thread side-by-side | VERIFIED | `ChatDesktopLayout.tsx`: `aside.chat-desktop-sidebar (300px)` + `section.chat-desktop-thread (flex-1)`. CSS: `.chat-desktop-layout { display: flex }` at `min-width: 768px`. |
| 14 | Chat page renders the new assistant-ui chat at /dashboard/ai | VERIFIED | `pages/dashboard/ai.tsx` imports `ChatPage` from `@/src/components/chat/ChatPage`, no `AiDashboard` import. `ChatPage.tsx` wraps `ChatRuntimeProvider > AllToolUIs > ChatDesktopLayout + ChatMobileLayout`. |

**Score:** 13/14 truths verified (1 partial-fail on conversation history persistence)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/components/chat/ChatRuntimeProvider.tsx` | Runtime provider with auth transport | VERIFIED | `useChatRuntime` + `AssistantChatTransport` + auth headers + body transform |
| `frontend/src/components/chat/ChatThread.tsx` | ThreadPrimitive composition | VERIFIED | All ThreadPrimitive sub-components wired correctly |
| `frontend/src/components/chat/ChatComposer.tsx` | ComposerPrimitive | VERIFIED | Input + Send + Cancel with i18n |
| `frontend/src/components/chat/AssistantMessage.tsx` | Markdown + HITL slot + actions | VERIFIED | MarkdownTextPrimitive + HitlPendingActions + ChatActionBar + ChatBranchPicker |
| `frontend/src/components/chat/UserMessage.tsx` | User message with edit | VERIFIED | MessagePrimitive + ActionBarPrimitive.Edit + ChatBranchPicker |
| `frontend/src/components/chat/ChatThreadList.tsx` | Conversation sidebar | PARTIAL | ThreadListPrimitive renders UI correctly; no backend persistence adapter |
| `frontend/src/components/chat/HitlApprovalCard.tsx` | HITL approve/reject card | VERIFIED | Both poll-based and native code paths implemented |
| `frontend/src/components/chat/ChatMobileLayout.tsx` | Mobile layout with slide sidebar | VERIFIED | showSidebar state + hamburger/back + CSS slide transition |
| `frontend/src/components/chat/ChatDesktopLayout.tsx` | Desktop sidebar+thread layout | VERIFIED | 300px aside + flex-1 section |
| `frontend/src/components/chat/ChatPage.tsx` | Top-level page wrapper | VERIFIED | RuntimeProvider > AllToolUIs > layouts; mounted guard for hydration |
| `frontend/src/components/chat/tool-uis/index.tsx` | AllToolUIs barrel | VERIFIED | All 16 tool UIs registered (note: file is `.tsx`, plan expected `.ts` -- benign) |
| `frontend/src/components/chat/tool-uis/EmailSearchToolUI.tsx` | Email search tool | VERIFIED | 3 tools: search_emails, list_emails, semantic_search_emails |
| `frontend/src/components/chat/tool-uis/BriefingToolUI.tsx` | Briefing tool | VERIFIED | get_daily_briefing with stats/summary/deadlines/actions/calendar |
| `frontend/src/components/chat/tool-uis/TriageToolUI.tsx` | Triage + native HITL | VERIFIED | requires-action handler + HitlApprovalCardFromStatus |
| `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` | Catch-all JSON viewer | VERIFIED | toolName: '*' wildcard |
| `frontend/pages/dashboard/ai.tsx` | Route entry point | VERIFIED | Renders ChatPage, no AiDashboard, getServerSideProps preserved |
| `frontend/src/components/chat/chat-layout.css` | Layout CSS | VERIFIED | Page shell, desktop/mobile switching, mobile slide, skeleton, empty state |
| `frontend/src/components/chat/chat-thread.css` | Thread CSS | VERIFIED | Viewport, composer, messages, tool cards, scrollbar |
| `frontend/src/components/chat/chat-sidebar.css` | Sidebar CSS | VERIFIED | Thread items, header, scroll, empty state |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ChatRuntimeProvider.tsx | POST /api/v1/ai/chat | AssistantChatTransport with auth headers | WIRED | L54-69: `api: \`${API_BASE}/api/v1/ai/chat\``, auth headers, `prepareSendMessagesRequest` maps to backend DTO |
| ChatThread.tsx | ChatRuntimeProvider.tsx | ThreadPrimitive renders inside AssistantRuntimeProvider | WIRED | ThreadPrimitive consumes AssistantRuntimeProvider context from parent |
| ChatThreadList.tsx | GET /api/v1/ai/conversations | ThreadListPrimitive with custom adapter | NOT_WIRED | No backend API call in ChatThreadList. In-memory only. Deferred to follow-up. |
| AllToolUIs | ChatPage.tsx | Mounted inside ChatRuntimeProvider | WIRED | `ChatPage.tsx` L50: `<AllToolUIs />` inside `<ChatRuntimeProvider>` |
| HitlApprovalCard | AssistantMessage.tsx | HitlPendingActions slot after MessagePrimitive.Content | WIRED | `AssistantMessage.tsx` L59: `<HitlPendingActions />` rendered unconditionally |
| TriageToolUI | HitlApprovalCardFromStatus | requires-action handler | WIRED | `TriageToolUI.tsx` L24: `if (status.type === 'requires-action') return <HitlApprovalCardFromStatus ...>` |
| pages/dashboard/ai.tsx | ChatPage.tsx | Import and render in Layout | WIRED | L3: `import { ChatPage } from '@/src/components/chat/ChatPage'` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CHAT-01 | 27-01 | assistant-ui runtime connects to streaming endpoint | SATISFIED | ChatRuntimeProvider.tsx: useChatRuntime + AssistantChatTransport wired to POST /api/v1/ai/chat with JWT+CSRF |
| CHAT-02 | 27-01 | Thread/Composer/Messages use assistant-ui primitives; no custom MUI chat | SATISFIED | All chat components use ThreadPrimitive/ComposerPrimitive/MessagePrimitive/ActionBarPrimitive/BranchPickerPrimitive from @assistant-ui/react. Zero MUI imports in any chat/*.tsx file. |
| CHAT-03 | 27-02, 27-03 | Domain tool renderers via makeAssistantToolUI, rich cards | SATISFIED | 15 named tool UIs + 1 wildcard fallback. All use makeAssistantToolUI. All handle running/complete/error states with Tailwind cards. |
| CHAT-04 | 27-03 | HITL inline in chat stream -- poll-based functional, native code path present | SATISFIED | HitlApprovalCard (poll-based via useAiActions) rendered in every AssistantMessage. HitlApprovalCardFromStatus (native requires_action) code present in TriageToolUI, gated on backend update. Scope correctly delivered. |
| CHAT-05 | 27-04 | Mobile-responsive at 375px/768px/1440px | SATISFIED (human needed) | CSS media query at 768px switches between `.chat-desktop-layout` and `.chat-mobile-layout`. Mobile slide transition implemented. Needs human visual verification at actual viewports. |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/locales/en.ts` | Old `chat:` namespace at line 2397 still exists alongside new one at line 3512. Two `chat:` keys in the same object is a TypeScript error. | WARNING | If TypeScript allows it (duplicate key -- JS silently uses last value), the old namespace is shadowed by the new one. Functionally OK but messy. |
| `ChatThreadList.tsx` | No voltAgentApi calls -- conversation history does not persist across page reloads | BLOCKER for CHAT-01 truth 7 | Users cannot see their previous conversations on reload. This is a real UX gap. |
| `ChatRuntimeProvider.tsx` | CSRF token is cached in a module-scope variable (`let csrfCache = ''`) -- initial message before `useEffect` completes sends empty CSRF token | WARNING | Race condition: if user sends a message before the `useEffect` CSRF fetch completes, the request goes out with `X-CSRF-Token: ''`. The `getCsrfToken()` comment says it returns cached value after first fetch, but the eagerly-warmed cache is async. |
| `tool-uis/index.tsx` | Plan specified `index.ts` but file is `index.tsx` (JSX in barrel) | INFO | No functional issue; import works correctly. |
| `BriefingToolUI.tsx` | Hardcoded string `'Daily Briefing'` instead of i18n key | INFO | Minor i18n violation per CLAUDE.md. |

---

## Human Verification Required

### 1. Token-by-token streaming

**Test:** Start both servers, navigate to `/dashboard/ai`, send "What are my unread emails?" -- watch the response appear
**Expected:** Text appears progressively as tokens stream in, not all at once after a delay
**Why human:** Cannot verify streaming behavior without a live backend + real SSE connection

### 2. HITL approval card appears for write actions

**Test:** Send "Send an email to test@example.com saying hello" or another destructive action
**Expected:** The `HitlApprovalCard` appears inline in the assistant message with Approve (green) and Reject (red) buttons. Clicking Approve calls `approveAction()` and the action executes.
**Why human:** Requires the backend to create a `PendingAction` record and `useAiActions()` to poll and return it

### 3. Mobile layout at 375px viewport

**Test:** Open DevTools responsive mode at 375px, navigate to `/dashboard/ai`
**Expected:** Full-screen thread visible, no sidebar on left, hamburger icon (MessagesSquare) in top-left corner. Tapping hamburger slides conversation list in from the left. Tapping back closes it. Composer sticks to bottom.
**Why human:** CSS media query + slide transition behavior requires real browser rendering

### 4. Message branching with BranchPicker

**Test:** Send a message, receive a response. Click the edit (pencil) icon on your message, modify the text, submit. The BranchPicker should appear showing `1 / 2`.
**Expected:** Branch navigation works, clicking Previous/Next switches between conversation branches
**Why human:** Requires live runtime branch state which is managed by assistant-ui internally

### 5. Conversation persistence gap (requires investigation)

**Test:** Start a conversation, send several messages, reload the page
**Expected (as designed):** Conversation list resets to empty. This is the KNOWN GAP. Verify this matches user expectations or escalate.
**Why human:** Need to confirm whether the team accepts in-memory-only thread state for Phase 27 scope or requires the backend adapter

---

## Gaps Summary

One gap blocks a stated success criterion: **conversation history does not persist across page reloads**. The `ChatThreadList.tsx` uses `ThreadListPrimitive` with its built-in runtime state only. There is no adapter calling `voltAgentApi.listConversations()` on mount, and no `voltAgentApi.deleteConversation()` wired to the delete button. The plan (27-01-PLAN.md) specified a custom adapter; the SUMMARY documents this as a deliberate deferral ("backend conversation hydration deferred -- follow-up concern").

This gap affects CHAT-01's derived truth #7 ("Conversation list sidebar uses ThreadListPrimitive with custom adapter calling GET /api/v1/ai/conversations"). The other 4 requirements (CHAT-01 partial, CHAT-02 full, CHAT-03 full, CHAT-04 full, CHAT-05 conditional on human) are verified by code evidence.

All four requirements in ROADMAP.md success criteria are met at the code level. The conversation persistence gap is a UX concern (conversations lost on reload) that may warrant a follow-up plan item or inclusion in Phase 28 cleanup.

---

_Verified: 2026-03-03_
_Verifier: Claude (gsd-verifier)_
