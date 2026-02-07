# Phase 07: Chat Improvement - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire up existing unused ai-elements components, modernize message bubble design, split the 954-line AiDashboard monolith, and fix scroll/UX issues identified in the chat-ui-audit-assistant-ui-vs-mailagent.md audit. The components already exist — they need to be plugged in and styled correctly.

Reference: `docs/audits/chat-ui-audit-assistant-ui-vs-mailagent.md`

</domain>

<decisions>
## Implementation Decisions

### Message Bubble Design

**User messages:**
- Borderless right-aligned (Claude/modern style)
- No solid primary color fill
- Show user avatar on the right side
- Remove speech bubble corner effect (equal rounded corners)
- Constrained width (~80%)

**Assistant messages:**
- Very subtle container (nearly invisible background, just enough to define boundaries)
- Full-width (content determines width)
- AI icon on left side
- Remove speech bubble corner effect

**General styling:**
- More generous vertical spacing (16-24px between messages)
- Timestamps on hover only (clean look)
- Glassmorphism: keep blur only on composer input area, remove elsewhere
- Header height: research 2026 best practices
- QuickActions: theme palette only, no hardcoded hex colors

### Unused Components Wiring

**Must wire in Phase 07:**
1. **Reasoning + Shimmer** — AI thinking state with elegant shimmer animation
   - Dynamic action text when available ("Searching emails...", "Reading thread...")
   - Fallback to "Thinking..." when no specific action
2. **MessageActions** — hover action bar with Copy + Regenerate + Feedback (thumbs up/down)
3. **Artifact panel** — for any structured output (drafts, code, tables, documents)
4. **ChainOfThought** — multi-step tool sequences as visual flow
5. **Sources** — RAG citations when AI uses emails/contacts
6. **MessageBranching** — alternative AI responses with prev/next navigation
7. **FileTree** — file structure display in code artifacts
8. **WebPreview** — link previews in chat
9. **Canvas** — drawing/whiteboard area

**Add assistant-ui shadcn registry** to components.json for future components.

### AiDashboard Split Strategy

- Combine audit suggestion with feature-based organization
- Research best practices (don't reinvent the wheel)
- Separate files for DesktopLayout.tsx and MobileLayout.tsx
- Target: under 500 lines per file (meet the rule, fewer files)

**Audit-suggested structure:**
- `index.tsx` (~200 lines) — layout shell only
- `useChatController.ts` (~200 lines) — state/handlers as custom hook
- `ChatArea.tsx` (~150 lines) — messages + input container
- `DesktopLayout.tsx` (~100 lines) — grid layout
- `MobileLayout.tsx` (~100 lines) — FAB + dialog

### Scroll Behavior & UX

- **Fix force-scroll:** Only auto-scroll if user is at bottom (don't disrupt reading)
- **Scroll-to-bottom button:** Claude's discretion (floating button when scrolled up)
- **Typing indicator:** Use Shimmer component instead of bouncing dots
- **Suggestion chips:** Larger, more prominent with subtle gradient borders

### Claude's Discretion

- Exact header height after researching 2026 best practices
- Scroll-to-bottom button implementation details
- Spacing values within "generous" guidelines
- Artifact panel trigger detection logic
- ChainOfThought grouping logic for multi-tool sequences

</decisions>

<specifics>
## Specific Ideas

- "We must use more artifacts — best 2026 practice"
- Reference: assistant-ui library (https://github.com/assistant-ui) for modern patterns
- All decisions should follow 2026 best practices without reinventing the wheel
- Audit document is the source of truth for what's broken

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-chat-improvement*
*Context gathered: 2026-02-07*
