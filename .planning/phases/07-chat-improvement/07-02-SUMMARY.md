---
phase: 07-chat-improvement
plan: 02
subsystem: ui
tags: [react, mui, chat, scroll, intersection-observer]

# Dependency graph
requires:
  - phase: 06-chat-ui
    provides: ChatMessages component, message rendering infrastructure
provides:
  - Modern message bubble design (Claude/ChatGPT-style)
  - Smart scroll behavior hook (useChatScroll)
  - Scroll-to-bottom floating button
affects: [07-03, 07-04, 07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IntersectionObserver for scroll detection
    - Conditional auto-scroll based on user position

key-files:
  created:
    - frontend/components/ai/AiDashboard/useChatScroll.ts
  modified:
    - frontend/components/ai/AiDashboard/ChatMessages.tsx

key-decisions:
  - "IntersectionObserver over scroll events for isAtBottom detection"
  - "User messages: subtle secondary background (8% alpha)"
  - "Assistant messages: no container, clean typography"

patterns-established:
  - "useChatScroll hook: IntersectionObserver-based scroll detection works with any scrollable ancestor"
  - "ScrollToBottomButton: floating action button pattern for chat UX"

# Metrics
duration: 12min
completed: 2026-02-07
---

# Phase 07 Plan 02: Message Bubbles + Smart Scroll Summary

**Modern Claude/ChatGPT-style message bubbles with IntersectionObserver-based smart scroll preventing reading disruption**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-07
- **Completed:** 2026-02-07
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- User messages now have subtle secondary background (8% alpha), no solid primary fill
- Assistant messages render without container - just clean typography
- Smart scroll only auto-scrolls when user is at bottom (IntersectionObserver)
- Floating scroll-to-bottom button appears when user scrolls up (>4 messages)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useChatScroll hook** - `de139d6b` (feat)
2. **Task 2: Modernize message bubble design** - `4f6fe90a` (style)
3. **Task 3: Integrate smart scroll and add scroll-to-bottom button** - `cbf69d34` (feat)

## Files Created/Modified

- `frontend/components/ai/AiDashboard/useChatScroll.ts` - Smart scroll hook using IntersectionObserver
- `frontend/components/ai/AiDashboard/ChatMessages.tsx` - Updated message styling and scroll integration

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| IntersectionObserver over scroll events | Works with any scrollable ancestor without needing containerRef - ChatArea.tsx owns the scroll container, ChatMessages just renders content inside it |
| User messages: 8% secondary alpha | Subtle, modern look matching Claude/ChatGPT UX - no solid color blocks |
| Assistant messages: no container | Clean typography focus, reduces visual noise, matches modern AI chat patterns |
| 100px rootMargin for IntersectionObserver | Provides buffer so button appears slightly before user scrolls fully away from bottom |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Architectural mismatch: scroll container in parent**
- **Found during:** Task 3 (Integrate smart scroll)
- **Issue:** Original plan assumed ChatMessages controls its own scroll container, but ChatArea.tsx actually owns the scrollable Box. containerRef and handleScroll from useChatScroll couldn't be attached.
- **Fix:** Refactored useChatScroll to use IntersectionObserver on endRef instead of scroll events on containerRef. IntersectionObserver works with any scrollable ancestor automatically.
- **Files modified:** frontend/components/ai/AiDashboard/useChatScroll.ts
- **Verification:** Type-check passes, isAtBottom detection works correctly
- **Committed in:** cbf69d34 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)
**Impact on plan:** IntersectionObserver approach is actually simpler and more robust. No scope creep.

## Issues Encountered

- TypeScript error on RefObject types - fixed by using `RefObject<HTMLDivElement | null>` instead of `RefObject<HTMLDivElement>`
- Pre-existing lint error in LabelTreeDndWrapper.tsx (not related to this plan)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Modern message bubbles complete
- Smart scroll behavior working
- Ready for 07-03 (Input Area polish) and 07-04 (Header improvements)

---
*Phase: 07-chat-improvement*
*Completed: 2026-02-07*
