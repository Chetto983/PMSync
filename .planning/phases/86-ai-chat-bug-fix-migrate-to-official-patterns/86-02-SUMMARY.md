---
phase: 86-ai-chat-bug-fix-migrate-to-official-patterns
plan: 02
subsystem: ui
tags: [assistant-ui, thread-history, ai-sdk, chat, thread-persistence]

# Dependency graph
requires:
  - phase: 86-01
    provides: deprecation cleanup and base chat adapter
provides:
  - ThreadHistoryAdapter via unstable_Provider for per-thread message history loading
  - SDK-native sendAutomaticallyWhen using lastAssistantMessageIsCompleteWithApprovalResponses
affects: [86-03, ai-chat]

# Tech tracking
tech-stack:
  added: []
  patterns: [factory-function-adapter, unstable_Provider-history-injection, closure-based-method-extraction]

key-files:
  created:
    - frontend/src/components/chat/chat-thread-list-adapter.tsx
  modified:
    - frontend/src/components/chat/ChatRuntimeProvider.tsx

key-decisions:
  - "Factory function over class for thread list adapter -- enables unstable_Provider and avoids this-binding issues"
  - "Closure-based deleteThread extraction instead of this.delete() to avoid plain-object method destructuring bugs"

patterns-established:
  - "Factory adapter with unstable_Provider: return plain object with Provider component for per-thread context injection"
  - "SDK helper functions: prefer AI SDK built-in helpers over manual reimplementations"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-19
---

# Phase 86 Plan 02: Thread Persistence & SDK sendAutomaticallyWhen Summary

**ThreadHistoryAdapter loads conversation messages on thread switch via unstable_Provider; sendAutomaticallyWhen replaced with SDK-native lastAssistantMessageIsCompleteWithApprovalResponses helper**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-19T13:16:01Z
- **Completed:** 2026-03-19T13:22:10Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified, 1 deleted)

## Accomplishments
- Thread switching now loads message history from GET /ai/chat/conversations/:id
- Converted class-based adapter to factory function with unstable_Provider for per-thread history injection
- Replaced 12-line manual sendAutomaticallyWhen with single SDK helper call
- Eliminated unsafe this-binding in archive/delete via closure extraction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ThreadHistoryAdapter via unstable_Provider** - `e894c426` (feat)
2. **Task 2: Update ChatRuntimeProvider with factory + SDK helper** - `0b94e676` (feat)

## Files Created/Modified
- `frontend/src/components/chat/chat-thread-list-adapter.tsx` - Factory function with ThreadHistoryProvider, converts DB messages to ThreadMessageLike
- `frontend/src/components/chat/ChatRuntimeProvider.tsx` - Uses factory adapter and SDK sendAutomaticallyWhen helper
- `frontend/src/components/chat/chat-thread-list-adapter.ts` - Deleted (replaced by .tsx)

## Decisions Made
- Factory function over class: enables unstable_Provider injection pattern and avoids this-binding issues when methods are destructured by the framework
- Closure-based deleteThread: both archive() and delete() call same extracted function, no unsafe this reference
- DB message conversion filters to user+assistant only (tool messages are internal plumbing)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in frontend/src/components/chat/tool-uis/ (unrelated to this plan, out of scope)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Thread history loading is functional, ready for plan 03 (tool rendering via components.tools)
- Pre-existing tool-ui type errors may need addressing in plan 03

## Self-Check: PASSED

- chat-thread-list-adapter.tsx: FOUND
- ChatRuntimeProvider.tsx: FOUND
- chat-thread-list-adapter.ts: CONFIRMED DELETED
- Commit e894c426: FOUND
- Commit 0b94e676: FOUND

---
*Phase: 86-ai-chat-bug-fix-migrate-to-official-patterns*
*Completed: 2026-03-19*
