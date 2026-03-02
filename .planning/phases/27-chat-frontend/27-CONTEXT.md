# Phase 27: Chat Frontend - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

AI chat UI rebuilt with assistant-ui primitives replacing all custom MUI chat components. assistant-ui runtime connects to existing AI SDK v6 streaming backend. Tool renderers rewritten with `makeAssistantToolUI`, HITL inline approval, and mobile-responsive layout. Old custom chat components (`AiDashboard/`, `useVoltAgentChat`, `useChatController`) are deleted after replacement.

Phase 28 handles deletion of old ai-elements and VoltAgent code. This phase focuses on building the new chat UI, not cleanup.

</domain>

<decisions>
## Implementation Decisions

### Runtime & Transport Wiring
- **Replace entirely** — delete `useVoltAgentChat` hook and `useChatController`. Wire assistant-ui's `useChatRuntime` directly to existing `POST /ai/chat` endpoint
- Backend already speaks AI SDK v6 protocol (`pipeUIMessageStreamToResponse`), so assistant-ui connects natively — no adapter layer
- **Conversation persistence** — keep multi-conversation support using assistant-ui's `ThreadListPrimitive`. Backend already has `GET /ai/chat/conversations` and `DELETE /ai/chat/conversations/:id`
- **Styling** — Tailwind only for all assistant-ui primitives. No MUI wrappers. Consistent with existing `src/components/ai-elements/` pattern

### Claude's Discretion: Auth
- Inject JWT + CSRF headers into assistant-ui transport. Use existing `getAuthToken()` and `getCsrfToken()` helpers. Pick whatever transport config approach is cleanest

### Thread & Composer UX
- **Suggested questions** — keep, using assistant-ui's `SuggestionPrimitive`. Backend already sends `suggestedQuestions` in message metadata
- **Message branching** — enable edit + regenerate via `BranchPickerPrimitive` and `ActionBarPrimitive`. New capability that comes free with assistant-ui
- **Auto-scroll** — use assistant-ui's `ThreadPrimitive.Viewport` with built-in `useThreadViewportAutoScroll`. Delete custom `useChatScroll.ts`
- **Markdown** — use `@assistant-ui/react-markdown` (already installed at ^0.12.3). Handles streaming markdown natively. Replace react-markdown + streamdown usage in chat
- **Chain of thought** — show reasoning steps using `ChainOfThoughtPrimitive` (collapsible). Makes AI transparent
- **No attachments** — file attachment support deferred. Keep scope focused on replacing existing chat

### Tool Renderers
- **Full rewrite** — all 14 renderers rebuilt from scratch using `makeAssistantToolUI({ toolName, render })`. Not wrapping existing renderers
- **Fresh visual design** — new card design following assistant-ui composition patterns. Don't preserve existing visual treatment
- **Renderer-owned loading** — each renderer handles its own loading/running state via the `status` prop from makeAssistantToolUI. No unified skeleton
- **JSON fallback** — register a catch-all renderer for unregistered tools that shows collapsible raw JSON. Useful for debugging
- **Tools to rewrite**: search_emails, list_emails, semantic_search_emails, get_email_content, list_follow_ups, search_contacts, get_events, count_emails, list_folders, analyze_email, search_memory/memory_search, get_daily_briefing, get_relationship_stats, bulk_email_actions, list_email_index

### HITL Inline Approval
- **Inline card in thread** — approval renders directly in message stream, not a modal. Shows action summary with approve/reject buttons. Uses assistant-ui's native `requires_action` status
- **Same destructive action set** — email send, email delete, calendar create/delete, contact delete. Read-only actions don't need approval
- Delete old `AskUserModal`, `InlineActionCard`, `HitlPayloadEditor` after replacement

### Mobile Layout
- **Full-screen chat** at 375px — thread fills viewport, composer sticks to bottom. Conversation list accessible via back button/hamburger
- Standard touch interactions only — tap to select, scroll to navigate. No swipe gestures
- Verify at 375px (mobile), 768px (tablet), 1440px (desktop) breakpoints

</decisions>

<specifics>
## Specific Ideas

- "Look at https://github.com/assistant-ui/assistant-ui — don't reinvent the wheel." Use assistant-ui as designed, follow their patterns and composition model
- assistant-ui version installed: `@assistant-ui/react@^0.12.9`, `@assistant-ui/react-markdown@^0.12.3`
- Key assistant-ui primitives to use: `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`, `ActionBarPrimitive`, `BranchPickerPrimitive`, `SuggestionPrimitive`, `ChainOfThoughtPrimitive`, `ThreadListPrimitive`, `AttachmentPrimitive` (skip for now), `ErrorPrimitive`
- `makeAssistantToolUI` signature: `makeAssistantToolUI<TArgs, TResult>({ toolName: string, render: ToolCallMessagePartComponent<TArgs, TResult> })`
- Mobile pattern: WhatsApp/iMessage-style full-screen chat

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `POST /ai/chat` backend endpoint (ai-chat.controller.ts) — streams via `pipeUIMessageStreamToResponse`, already AI SDK v6 compatible
- `GET /ai/chat/conversations` + `DELETE /ai/chat/conversations/:id` — conversation CRUD already exists
- `getAuthToken()` (frontend/lib/utils/auth-token.ts) + `getCsrfToken()` (frontend/lib/api-client.ts) — auth helpers for transport
- `@assistant-ui/react@0.12.9` + `@assistant-ui/react-markdown@0.12.3` — already installed in package.json
- `ConversationService` (backend) — handles conversation persistence
- Backend message metadata includes `suggestedQuestions`, `askUser`, `totalTokens`
- 14 existing tool renderers in `src/components/ai-elements/tool-renderers/renderers/` — reference for tool names and data shapes, even though visuals will be rewritten

### Established Patterns
- ai-elements components use Tailwind (not MUI) — `src/components/ai-elements/` directory
- TanStack Query for data fetching with queryOptions pattern
- Zustand for UI state (`email-ui-store.ts`, `dashboard-store.ts`)
- i18n translations in `locales/{en,it}.ts` — new strings must go here
- Component files under 500 lines (CLAUDE.md rule)

### Integration Points
- Chat page: `frontend/pages/dashboard/ai.tsx` — currently renders `AiDashboard` component
- Email thread chat: `frontend/components/email/thread/EmailChatPanel.tsx` — uses `useVoltAgentChat`
- Chat hooks barrel: `frontend/hooks/use-voltagent-chat.ts` — exports types used across components
- Backend HITL: approval actions sent via message metadata, resolved via backend API

### Files to Replace (Phase 27 builds new, Phase 28 deletes old)
- `frontend/components/ai/AiDashboard/` (26 files) — ChatArea, ChatMessages, ChatInput, useChatController, useChatScroll, InlineActionCard, HitlPayloadEditor, AskUserModal, MobileChatDialog, MobileLayout, DesktopLayout, etc.
- `frontend/hooks/use-voltagent-chat.ts` — replaced by assistant-ui runtime
- `frontend/src/components/ai-elements/tool-renderers/` — replaced by makeAssistantToolUI renderers

</code_context>

<deferred>
## Deferred Ideas

- File attachments in chat composer (AttachmentPrimitive) — future phase
- Old ai-elements and VoltAgent code deletion — Phase 28

</deferred>

---

*Phase: 27-chat-frontend*
*Context gathered: 2026-03-02*
