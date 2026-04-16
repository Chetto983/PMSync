# Phase 144: AI Assistant Overlay - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase moves the existing AI chat assistant from a dedicated page (`/dashboard/ai`) into a slide-over overlay panel accessible from any screen via keyboard shortcut (Cmd+J) or header icon button. The overlay is context-aware — it automatically detects what the user is currently viewing (email, contact, deal, calendar event) and injects that context into the AI conversation. The user's full conversation history is preserved and accessible from the overlay.

This phase does NOT add new AI capabilities, tools, or models. It repackages the existing ChatPage experience into a Drawer component mounted at the Layout level, adds a keyboard shortcut handler, and implements page context detection + injection.

</domain>

<decisions>
## Implementation Decisions

### Trigger & Shortcut
- **D-01:** Cmd+J (Ctrl+J on Windows) toggles the AI overlay open/closed. Added as a second keyboard handler in Layout.tsx alongside the existing Cmd+K handler.
- **D-02:** A persistent AI icon button in the top-right header bar provides a visual trigger. Always visible on all screens.
- **D-03:** The command palette should also include an "Open AI Assistant" command for discoverability.

### Panel Scope
- **D-04:** The overlay contains the full chat experience — thread list + messages + tool UIs. Reuses ChatPage.tsx (or its inner components: ChatDesktopLayout, ChatThreadList, ChatThread, ChatRuntimeProvider) inside a MUI Drawer.
- **D-05:** The overlay loads the user's existing conversation history (all threads) on open. Closing is just hiding — reopening shows the same thread list state with full history.

### Claude's Discretion (Panel Scope)
- Whether to keep the /dashboard/ai page as a standalone route or redirect it to open the overlay. Consider: if the ChatPage components are refactored to work inside the drawer, keeping both may be trivial (both render the same components). If removal simplifies the codebase, remove it. Preserve the route for backward compatibility either way.

### Context Injection
- **D-06:** When the overlay opens, automatically detect the current page context (email thread, contact detail, deal detail, calendar event) and inject it into the AI's system message. The user sees a context indicator at the top of the panel (e.g., "Viewing: Email from John Doe — Re: Q2 Proposal").
- **D-07:** Context updates automatically when the user navigates to a different page while the overlay is open. The AI always knows the current page.
- **D-08:** Rich context is passed for each page type:
  - **Email:** subject, sender, body snippet, linked contact/deal/ticket IDs
  - **Contact:** name, company, email, recent activity summary
  - **Deal:** name, stage, amount, associated contact
  - **Calendar:** event title, date/time, attendees
  - **Other pages:** No specific context (general assistant mode)
- **D-09:** Page context is assembled using existing infrastructure: `useRouter()` for route detection, Zustand stores for selected entities, CRM context API (`useCrmContext`) for enrichment.

### Panel Behavior
- **D-10:** Panel width is resizable by the user via a drag handle on the left edge. Default width ~420px. Minimum ~320px, maximum ~600px.
- **D-11:** Resized width persists to localStorage (key: `pmsync:ai-overlay-width`) across sessions.
- **D-12:** Dismissal via Cmd+J toggle (same shortcut), explicit X close button, and Esc key.
- **D-13:** The overlay loads the user's full conversation history (thread list) from the backend on open. All existing threads are accessible. Starting a new conversation from the overlay works the same as from the full page.

### Claude's Discretion (Panel Behavior)
- Whether to use MUI Drawer variant "temporary" (floats on top with backdrop) or "persistent" (pushes content). Recommendation: temporary variant is simpler and matches the "overlay" mental model. Push layout would require refactoring the main content area sizing.
- Animation/transition style for the slide-over.
- Whether to add a subtle backdrop overlay or just a shadow on the panel edge.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing AI Chat Components
- `frontend/src/components/chat/ChatPage.tsx` — Top-level chat page to be reused/wrapped in drawer
- `frontend/src/components/chat/ChatRuntimeProvider.tsx` — AI SDK runtime provider with useChat() + AssistantRuntimeProvider
- `frontend/src/components/chat/ChatThread.tsx` — Individual thread component
- `frontend/src/components/chat/ChatThreadList.tsx` — Thread list sidebar component
- `frontend/src/components/chat/ChatDesktopLayout.tsx` — Desktop layout (thread list + chat area)
- `frontend/src/components/chat/ChatMobileLayout.tsx` — Mobile layout
- `frontend/src/components/chat/ChatSuggestions.tsx` — Suggested replies
- `frontend/src/components/chat/AssistantMessage.tsx` — Message rendering
- `frontend/src/components/chat/HitlApprovalCard.tsx` — HITL approval workflow

### AI Chat API
- `frontend/lib/api/ai.ts` — aiChatApi module (submitChat, getConversationHistory, etc.)

### Layout & Keyboard Shortcuts
- `frontend/components/layout/Layout.tsx` — Main layout with Cmd+K handler pattern, mount point for overlay
- `frontend/components/layout/Header.tsx` — Header bar where AI icon button will be added
- `frontend/components/layout/Sidebar.tsx` — 64px sidebar rail

### Existing Drawer Pattern
- `frontend/components/calendar/ai/SchedulingDrawer.tsx` — MUI Drawer right-anchored pattern to follow

### Command Palette
- `frontend/components/ai/CommandPalette/index.tsx` — Existing command palette (add "Open AI Assistant" command)
- `frontend/components/ai/CommandPalette/commands.ts` — Command definitions to extend

### Context Sources (Zustand Stores)
- `frontend/stores/email-ui-store.ts` — Email selection state
- `frontend/stores/contact-store.ts` — Selected contact state
- `frontend/stores/calendar-store.ts` — Calendar selection state
- `frontend/stores/dashboard-store.ts` — Dashboard UI state

### CRM Context Enrichment
- `frontend/lib/api/crm-context.ts` — CrmContactContext API types
- `frontend/hooks/queries/use-crm-context.ts` — TanStack Query hooks for CRM context

### AI Chat Page Route
- `frontend/pages/dashboard/ai.tsx` — Existing AI page route (dynamic import of ChatPage)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatPage.tsx` / `ChatDesktopLayout.tsx` — Full chat UI can be rendered inside a Drawer
- `ChatRuntimeProvider` — AI SDK runtime, can be mounted at Layout level to share state
- `SchedulingDrawer.tsx` — Right-anchored MUI Drawer with state management (pattern to follow)
- `Layout.tsx` keyboard handler pattern — Add Cmd+J alongside existing Cmd+K
- `CommandPalette/commands.ts` — Extendable command registry for "Open AI Assistant"
- Zustand stores — Already track selected email/contact/deal/calendar entities

### Established Patterns
- MUI Drawer with `anchor="right"` for slide-over panels
- `useEffect` + `document.addEventListener('keydown')` in Layout.tsx for global shortcuts
- localStorage for persisting UI state (e.g., `pmsync:crm-sidebar-open`)
- Dynamic import with `{ ssr: false }` for heavy chat components

### Integration Points
- `Layout.tsx` — Mount the Drawer component + keyboard handler
- `Header.tsx` — Add AI icon button
- `CommandPalette/commands.ts` — Add "Open AI Assistant" command
- `useRouter()` — Route-based context detection
- `ChatRuntimeProvider` — May need to be lifted to Layout level if currently scoped to ChatPage

</code_context>

<specifics>
## Specific Ideas

- The panel should feel like Microsoft Copilot's sidebar in Outlook: always accessible, context-aware, but never auto-opening (user-initiated only)
- Context indicator at top of panel should show what entity is detected (e.g., "Viewing: Email from John Doe")
- Resizable width via drag handle, persisted to localStorage

</specifics>

<deferred>
## Deferred Ideas

- Auto-opening the panel based on email content or AI suggestions — explicitly avoided per 2026 best practice research (causes user backlash)
- Voice input for the AI overlay — separate effort
- Multi-panel layout (AI + CRM context sidebar simultaneously) — would require Layout refactoring
- Mobile-specific overlay behavior (bottom sheet vs drawer) — mobile UX iteration

</deferred>

---

*Phase: 144-ai-assistant-overlay*
*Context gathered: 2026-04-16*
