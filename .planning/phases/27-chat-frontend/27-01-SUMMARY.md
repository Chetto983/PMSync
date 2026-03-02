---
phase: 27-chat-frontend
plan: 01
subsystem: ui
tags: [assistant-ui, react, ai-sdk, chat, streaming, tailwind, primitives]

# Dependency graph
requires:
  - phase: 24-chat-backend
    provides: POST /api/v1/ai/chat streaming endpoint, conversation CRUD APIs
provides:
  - ChatRuntimeProvider wiring assistant-ui to backend via AssistantChatTransport
  - ChatThread with viewport, auto-scroll, messages, composer
  - AssistantMessage with streaming markdown via MarkdownTextPrimitive
  - UserMessage with edit capability
  - ChatActionBar (copy, regenerate), ChatBranchPicker (message branching)
  - ChatChainOfThought (collapsible reasoning via ChainOfThoughtPrimitive)
  - ChatSuggestions (pill buttons via ThreadPrimitive.Suggestions)
  - ChatEmptyState (welcome screen)
  - ChatThreadList (conversation sidebar via ThreadListPrimitive)
  - ConversationSummary type and tool output type re-exports
  - Chat i18n strings (en + it)
affects: [27-02, 27-03, 27-04, 28-cleanup]

# Tech tracking
tech-stack:
  added: ["@assistant-ui/react@0.12.14", "@assistant-ui/react-ai-sdk@1.3.8"]
  patterns: [assistant-ui primitive composition, Tailwind-only chat UI, module-scoped CSRF cache, prepareSendMessagesRequest body transform]

key-files:
  created:
    - frontend/src/components/chat/ChatRuntimeProvider.tsx
    - frontend/src/components/chat/ChatThread.tsx
    - frontend/src/components/chat/ChatComposer.tsx
    - frontend/src/components/chat/AssistantMessage.tsx
    - frontend/src/components/chat/UserMessage.tsx
    - frontend/src/components/chat/ChatActionBar.tsx
    - frontend/src/components/chat/ChatBranchPicker.tsx
    - frontend/src/components/chat/ChatChainOfThought.tsx
    - frontend/src/components/chat/ChatSuggestions.tsx
    - frontend/src/components/chat/ChatEmptyState.tsx
    - frontend/src/components/chat/ChatThreadList.tsx
    - frontend/src/components/chat/types.ts
  modified:
    - frontend/package.json
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Module-scoped CSRF cache instead of useRef (avoids React Compiler ref-in-render lint error)"
  - "prepareSendMessagesRequest transforms AI SDK messages array to { message, conversationId } for backend ChatRequestDto"
  - "MarkdownTextPrimitive cast to any for Text slot (runtime-compatible but type signature mismatch)"
  - "ChainOfThought component slot replaces separate Reasoning+tools components"
  - "ThreadListPrimitive with runtime-managed thread list (backend conversation hydration deferred)"

patterns-established:
  - "Primitive composition: assistant-ui primitives with Tailwind classes, no MUI wrappers"
  - "Auth transport: module-scoped CSRF + getAuthToken() in headers callback"
  - "i18n: all user-facing strings via useTranslations().chat.*"

requirements-completed: [CHAT-01, CHAT-02]

# Metrics
duration: 24min
completed: 2026-03-02
---

# Phase 27 Plan 01: Chat Runtime + UI Components Summary

**assistant-ui runtime provider wired to backend with AssistantChatTransport, 10 Tailwind-only chat components using ThreadPrimitive, ComposerPrimitive, MessagePrimitive, and ChainOfThoughtPrimitive composition**

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-02T19:24:41Z
- **Completed:** 2026-03-02T19:49:19Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Installed @assistant-ui/react@0.12.14 and @assistant-ui/react-ai-sdk@1.3.8 with correct version pinning
- Built ChatRuntimeProvider with auth headers and body format transform for backend compatibility
- Created 10 composable chat components using assistant-ui primitives with Tailwind styling
- Added chat i18n strings in English and Italian with TypeScript type definitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages and create runtime provider + types** - `1449088a` (feat)
2. **Task 2: Build Thread, Composer, Messages, and conversation list** - `18690aea` (feat)

## Files Created/Modified
- `frontend/src/components/chat/ChatRuntimeProvider.tsx` - AssistantRuntimeProvider wrapping useChatRuntime with auth transport
- `frontend/src/components/chat/ChatThread.tsx` - ThreadPrimitive composition with viewport, messages, scroll-to-bottom
- `frontend/src/components/chat/ChatComposer.tsx` - ComposerPrimitive with input, send, and cancel buttons
- `frontend/src/components/chat/AssistantMessage.tsx` - Bot message with markdown, ChainOfThought, action bar, branch picker
- `frontend/src/components/chat/UserMessage.tsx` - Right-aligned user message with edit capability
- `frontend/src/components/chat/ChatActionBar.tsx` - Copy and regenerate buttons (visible on hover)
- `frontend/src/components/chat/ChatBranchPicker.tsx` - Branch navigation (previous/next with count)
- `frontend/src/components/chat/ChatChainOfThought.tsx` - Collapsible reasoning accordion
- `frontend/src/components/chat/ChatSuggestions.tsx` - Suggested questions as pill buttons
- `frontend/src/components/chat/ChatEmptyState.tsx` - Welcome screen with bot icon
- `frontend/src/components/chat/ChatThreadList.tsx` - Conversation sidebar with ThreadListPrimitive
- `frontend/src/components/chat/types.ts` - ConversationSummary type + tool output type re-exports
- `frontend/locales/en.ts` - Chat i18n strings (English)
- `frontend/locales/it.ts` - Chat i18n strings (Italian)
- `frontend/locales/index.ts` - Chat TypeScript type definitions
- `frontend/package.json` - New assistant-ui packages

## Decisions Made
- **Module-scoped CSRF cache:** Used module-level variable instead of useRef to avoid React Compiler's "cannot access refs during render" lint error. getCsrfToken() already caches internally; the module variable is warmed on mount via useEffect and read in the headers callback at request time.
- **Body format transform:** Backend ChatRequestDto expects `{ message: string, conversationId?: string }` but AssistantChatTransport sends the full AI SDK messages array. Used `prepareSendMessagesRequest` to extract the last user message text and format the body correctly.
- **MarkdownTextPrimitive type cast:** The `Text` slot in MessagePrimitive.Content expects `TextMessagePartComponent` props but `MarkdownTextPrimitive` has its own props type (it reads content from context internally). Cast to `any` with documentation comment.
- **ChainOfThought component slot:** Used the `ChainOfThought` component variant in MessagePrimitive.Content instead of separate `Reasoning` + `tools` components, since ChainOfThoughtPrimitive provides the collapsible accordion behavior natively.
- **ThreadListPrimitive with runtime-managed state:** The thread list is managed by the assistant-ui runtime's built-in state. Backend conversation hydration (loading previously saved conversations on init) is deferred -- the runtime creates threads as messages are sent, and the backend persists them. Full conversation list loading requires a ThreadHistoryAdapter which is a follow-up concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MarkdownTextPrimitive type mismatch with TextMessagePartComponent**
- **Found during:** Task 2 (AssistantMessage component)
- **Issue:** `MarkdownTextPrimitive` from `@assistant-ui/react-markdown` has `MarkdownTextPrimitiveProps` which is incompatible with `TextMessagePartComponent` type signature. TypeScript error TS2322.
- **Fix:** Cast `MarkdownTextPrimitive as any` with documentation comment explaining runtime compatibility.
- **Files modified:** `frontend/src/components/chat/AssistantMessage.tsx`
- **Verification:** `npx tsc --noEmit` passes with only pre-existing errors
- **Committed in:** 18690aea (Task 2 commit)

**2. [Rule 1 - Bug] ChainOfThoughtPrimitive.Parts does not accept className**
- **Found during:** Task 2 (ChatChainOfThought component)
- **Issue:** `ChainOfThoughtPrimitive.Parts` is a functional component that takes `components` prop, not DOM props like `className`.
- **Fix:** Used `components.Layout` wrapper component with className styling instead.
- **Files modified:** `frontend/src/components/chat/ChatChainOfThought.tsx`
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 18690aea (Task 2 commit)

**3. [Rule 1 - Bug] React Compiler lint error for ref access in render**
- **Found during:** Task 2 (ChatRuntimeProvider lint check)
- **Issue:** ESLint react-hooks/set-state-in-effect and react-compiler ref rules flagged CSRF ref access inside the AssistantChatTransport constructor during render.
- **Fix:** Replaced useRef with module-scoped variable and removed loading gate state.
- **Files modified:** `frontend/src/components/chat/ChatRuntimeProvider.tsx`
- **Verification:** `npx eslint` passes with zero errors
- **Committed in:** 18690aea (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for type safety and lint compliance. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 12 chat component files created and type-checked
- Runtime provider connects to backend with auth headers and correct body format
- Ready for Plan 02 (tool renderers with makeAssistantToolUI)
- ThreadListPrimitive conversation hydration from backend needs a thread history adapter (follow-up plan concern)

## Self-Check: PASSED

All 12 files verified present. Both commit hashes (1449088a, 18690aea) verified in git log.

---
*Phase: 27-chat-frontend*
*Completed: 2026-03-02*
