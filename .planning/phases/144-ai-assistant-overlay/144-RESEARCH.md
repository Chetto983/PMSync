# Phase 144: AI Assistant Overlay - Research

**Researched:** 2026-04-16
**Domain:** Frontend UI — MUI Drawer overlay, keyboard shortcuts, page-context detection, assistant-ui runtime lifting
**Confidence:** HIGH

## Summary

This phase wraps the existing AI chat experience (ChatPage / ChatDesktopLayout / ChatThread / ChatThreadList) inside an MUI Drawer mounted at the Layout level, triggered by Cmd+J / Ctrl+J, a header icon button, or a Command Palette entry. The overlay detects the current page context (email, contact, deal, calendar) and injects it into the AI conversation.

The codebase already has every building block: MUI Drawer pattern (`SchedulingDrawer.tsx`), global keyboard handler pattern (`Layout.tsx` Cmd+K), Zustand stores for entity selection, CRM context enrichment hooks, and `assistant-ui` runtime with conversation history. The work is assembling these pieces into a new Drawer component, lifting `ChatRuntimeProvider` from the ChatPage into the Layout (so the runtime persists across route changes), adding a `usePageContext` hook for route-based entity detection, and wiring three trigger points.

**Primary recommendation:** Lift ChatRuntimeProvider to Layout level (wrap around children + drawer), create AiOverlayDrawer as a temporary MUI Drawer with resize handle, and implement usePageContext as a pure hook reading router + Zustand stores.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cmd+J (Ctrl+J on Windows) toggles the AI overlay open/closed. Added as a second keyboard handler in Layout.tsx alongside the existing Cmd+K handler.
- **D-02:** A persistent AI icon button in the top-right header bar provides a visual trigger. Always visible on all screens.
- **D-03:** The command palette should also include an "Open AI Assistant" command for discoverability.
- **D-04:** The overlay contains the full chat experience -- thread list + messages + tool UIs. Reuses ChatPage.tsx (or its inner components: ChatDesktopLayout, ChatThreadList, ChatThread, ChatRuntimeProvider) inside a MUI Drawer.
- **D-05:** The overlay loads the user's existing conversation history (all threads) on open. Closing is just hiding -- reopening shows the same thread list state with full history.
- **D-06:** When the overlay opens, automatically detect the current page context (email thread, contact detail, deal detail, calendar event) and inject it into the AI's system message. The user sees a context indicator at the top of the panel.
- **D-07:** Context updates automatically when the user navigates to a different page while the overlay is open. The AI always knows the current page.
- **D-08:** Rich context is passed for each page type (email: subject/sender/body snippet/linked IDs; contact: name/company/email/activity; deal: name/stage/amount/contact; calendar: title/date/attendees; other: no context).
- **D-09:** Page context is assembled using existing infrastructure: useRouter() for route detection, Zustand stores for selected entities, CRM context API (useCrmContext) for enrichment.
- **D-10:** Panel width is resizable by the user via a drag handle on the left edge. Default width ~420px. Minimum ~320px, maximum ~600px.
- **D-11:** Resized width persists to localStorage (key: `pmsync:ai-overlay-width`) across sessions.
- **D-12:** Dismissal via Cmd+J toggle (same shortcut), explicit X close button, and Esc key.
- **D-13:** The overlay loads the user's full conversation history (thread list) from the backend on open. All existing threads are accessible.

### Claude's Discretion
- Whether to keep the /dashboard/ai page as a standalone route or redirect it to open the overlay. Recommendation from UI-SPEC: keep route, render same ChatPage components. Both share ChatRuntimeProvider at Layout level.
- MUI Drawer variant: `variant="temporary"` (float on top with backdrop). Decided in UI-SPEC.
- Animation/transition style: Standard MUI Drawer slide-in from right. Decided in UI-SPEC.
- Whether to add a subtle backdrop overlay or just a shadow: Semi-transparent backdrop with blur. Decided in UI-SPEC.

### Deferred Ideas (OUT OF SCOPE)
- Auto-opening the panel based on email content or AI suggestions
- Voice input for the AI overlay
- Multi-panel layout (AI + CRM context sidebar simultaneously)
- Mobile-specific overlay behavior (bottom sheet vs drawer)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-06 | User can open AI Assistant as overlay panel from any screen via keyboard shortcut | Layout.tsx Cmd+J handler pattern (mirrors existing Cmd+K), Header.tsx icon button conversion, CommandPalette command entry. Three trigger points documented. |
| AI-07 | AI Assistant overlay is context-aware (knows current email/contact/deal being viewed) | usePageContext hook using router.pathname + Zustand stores (email-ui-store.activeThreadId, contact-store.selectedContact, calendar-store.selectedEvent) + CRM context enrichment hooks. Route pattern matching documented. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Overlay trigger (Cmd+J, icon, palette) | Browser / Client | -- | Pure frontend keyboard/click handlers in Layout/Header |
| Panel rendering (Drawer + chat UI) | Browser / Client | -- | MUI Drawer + existing chat components, no SSR needed |
| Page context detection | Browser / Client | -- | Router pathname + Zustand store reads, no backend call |
| Context enrichment (entity metadata) | Browser / Client | API / Backend | TanStack Query cache for entity data; falls back to API if cache miss |
| Conversation history | API / Backend | Browser / Client | Backend stores threads; frontend loads via existing adapter |
| Chat streaming | API / Backend | Browser / Client | SSE stream to backend /ai/chat endpoint; client renders incrementally |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mui/material` | 7.3.7 | Drawer, Box, IconButton, Chip, Typography, Tooltip | Project's sole component library [VERIFIED: package.json] |
| `@assistant-ui/react` | 0.12.19 | AssistantRuntimeProvider, ThreadPrimitive, ThreadListPrimitive | Existing chat runtime [VERIFIED: npm ls] |
| `@assistant-ui/react-ai-sdk` | 1.3.14 | useAISDKRuntime, AssistantChatTransport | Existing AI SDK bridge [VERIFIED: npm ls] |
| `@assistant-ui/core` | 0.1.7 | useRemoteThreadListRuntime, RuntimeAdapterProvider | Thread list management [VERIFIED: npm ls] |
| `zustand` | 5.0.11 | useAiOverlay store (open/width state) | Project standard for UI state [VERIFIED: package.json] |
| `next` | 16.1.6 | useRouter for route detection | Project framework [VERIFIED: package.json] |
| `lucide-react` | (installed) | Sparkles, X, GripVertical, Mail, User, Building2, Calendar icons | Project icon library [VERIFIED: Header.tsx imports] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | (installed) | TanStack Query cache reads for entity enrichment | When context detection needs entity metadata from cache |
| `@ai-sdk/react` | 3.0.118 | useChat hook inside ChatRuntimeProvider | Already used; no new integration [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand store for overlay state | React useState in Layout | Zustand allows CommandPalette and Header to toggle without prop drilling |
| MUI Drawer temporary | MUI Drawer persistent | Persistent pushes content, requiring Layout refactoring; temporary floats on top |
| CSS resize via onPointerMove | CSS `resize` property | CSS resize lacks min/max constraints and localStorage persistence |

**Installation:** No new packages required. All dependencies already installed. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```
User Input (Cmd+J / Icon / Palette)
        |
        v
[useAiOverlay store] --toggleOpen()--> [AiOverlayDrawer]
        |                                      |
        |                              +-------+--------+
        |                              |                |
        v                              v                v
[usePageContext hook]          [ChatRuntimeProvider]  [ResizeHandle]
   |       |                  (lifted to Layout)     (drag -> localStorage)
   |       |                         |
   v       v                         v
[router]  [Zustand stores]    [ChatDesktopLayout]
   |       |                   |              |
   |       v                   v              v
   |  email-ui-store      ChatThreadList  ChatThread
   |  contact-store             |              |
   |  calendar-store            v              v
   |       |            Thread history    AI streaming
   v       v            (backend API)     (SSE /ai/chat)
[route pattern match]
   |
   v
[ContextIndicator UI]
```

### Recommended Project Structure
```
frontend/
  components/
    ai-overlay/
      AiOverlayDrawer.tsx      # Root drawer component (~150 lines)
      AiOverlayHeader.tsx      # Header with title + context + close (~80 lines)
      ContextIndicator.tsx     # Context type chip/bar (~100 lines)
      ResizeHandle.tsx         # Left-edge drag handle (~80 lines)
      index.ts                 # Re-exports
  hooks/
    use-page-context.ts        # Route + store -> PageContext (~120 lines)
  stores/
    ai-overlay-store.ts        # open/width/toggle Zustand store (~40 lines)
```

### Pattern 1: Zustand Store for Overlay State
**What:** Tiny Zustand store managing `isOpen` and `width` with localStorage persistence for width.
**When to use:** When multiple disconnected components (Layout, Header, CommandPalette) need to toggle the same state.
**Example:**
```typescript
// Source: Existing pattern in email-ui-store.ts (persist middleware)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AiOverlayState {
  isOpen: boolean;
  width: number;
  toggleOpen: () => void;
  open: () => void;
  close: () => void;
  setWidth: (w: number) => void;
}

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;

export const useAiOverlay = create<AiOverlayState>()(
  persist(
    (set) => ({
      isOpen: false,
      width: DEFAULT_WIDTH,
      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setWidth: (w: number) =>
        set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
    }),
    {
      name: 'pmsync:ai-overlay-width',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ width: state.width }),
      // isOpen is NOT persisted - always starts closed (D-12)
    }
  )
);
```
[VERIFIED: Pattern matches email-ui-store.ts persist usage]

### Pattern 2: Keyboard Shortcut in Layout
**What:** Global keydown listener for Cmd+J / Ctrl+J alongside existing Cmd+K.
**When to use:** In Layout.tsx useEffect.
**Example:**
```typescript
// Source: Layout.tsx existing Cmd+K pattern (line 83-91)
useEffect(() => {
  const down = (event: KeyboardEvent) => {
    // Existing Cmd+K handler
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
    }
    // New Cmd+J handler (D-01)
    if (event.key.toLowerCase() === 'j' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      toggleAiOverlay();  // from useAiOverlay store
    }
  };
  document.addEventListener('keydown', down);
  return () => document.removeEventListener('keydown', down);
}, []);
```
[VERIFIED: Layout.tsx lines 83-91 show exact Cmd+K pattern]

### Pattern 3: Page Context Detection Hook
**What:** Hook that reads router.pathname + Zustand stores to produce a typed PageContext.
**When to use:** Inside AiOverlayHeader for the ContextIndicator.
**Example:**
```typescript
// Source: Derived from existing route patterns + Zustand store shapes
import { useRouter } from 'next/router';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useContactStore } from '@/stores/contact-store';
import { useCalendarStore } from '@/stores/calendar-store';

export type PageContextType = 'email' | 'contact' | 'deal' | 'calendar' | 'general';

export interface PageContext {
  type: PageContextType;
  entityId: string | null;
  label: string;
  metadata: Record<string, unknown>;
}

export function usePageContext(): PageContext {
  const router = useRouter();
  const pathname = router.pathname;
  const query = router.query;

  // Email: /dashboard/email/[threadId] or active thread
  if (pathname.startsWith('/dashboard/email')) {
    const threadId = query.threadId as string | undefined;
    // Also check Zustand for activeThreadId
    const activeThreadId = useEmailUIStore.getState().activeThreadId;
    const id = threadId || activeThreadId;
    // ... return email context with enrichment from TanStack cache
  }

  // Contact: /dashboard/contacts/[contactId]
  if (pathname.startsWith('/dashboard/contacts') && query.contactId) {
    // ... read from contactStore.selectedContact
  }

  // Deal: /dashboard/crm/deals/[dealId]
  if (pathname.startsWith('/dashboard/crm/deals') && query.dealId) {
    // ... read from TanStack query cache
  }

  // Calendar: selected event from calendarStore
  if (pathname.startsWith('/dashboard/calendar')) {
    const selectedEvent = useCalendarStore.getState().selectedEvent;
    // ...
  }

  return { type: 'general', entityId: null, label: '', metadata: {} };
}
```
[VERIFIED: Route paths from pages/dashboard/ai.tsx, store shapes from Zustand files]

### Pattern 4: Lifting ChatRuntimeProvider to Layout
**What:** Move ChatRuntimeProvider from ChatPage into Layout.tsx so the runtime persists across route changes.
**When to use:** Required so the drawer's chat state survives navigation.
**Critical detail:** ChatRuntimeProvider creates a singleton `transport` and `adapter` at module scope. Lifting it to Layout means it initializes once and stays alive. The existing `/dashboard/ai` page can then render ChatDesktopLayout directly without its own provider.
**Example:**
```typescript
// In Layout.tsx, wrap children + drawer with ChatRuntimeProvider
<ChatRuntimeProvider>
  {/* existing layout content */}
  <Box component="main" ...>
    {children}
  </Box>
  <AiOverlayDrawer />
</ChatRuntimeProvider>
```
**WARNING:** ChatRuntimeProvider uses `useEffect` with `resetManualNewThreadRequested()` on mount. When lifted to Layout, this runs once at app boot, not on every /dashboard/ai visit. The thread-restore-guard logic should still work since it's ref-based, but test carefully.
[VERIFIED: ChatRuntimeProvider.tsx lines 108-171]

### Pattern 5: MUI Drawer with Resize Handle
**What:** Temporary MUI Drawer with a custom resize handle on the left edge.
**When to use:** AiOverlayDrawer component.
**Example:**
```typescript
// Source: SchedulingDrawer.tsx pattern (anchor="right", temporary)
<Drawer
  anchor="right"
  open={isOpen}
  onClose={close}
  variant="temporary"
  aria-label={t.ai.overlay.title}
  PaperProps={{
    sx: {
      width: width,
      maxWidth: '100vw',
      display: 'flex',
      flexDirection: 'row',  // resize handle + content side by side
    },
  }}
>
  <ResizeHandle onResize={setWidth} currentWidth={width} />
  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
    <AiOverlayHeader />
    <ChatThemeBridge>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Conditionally render desktop or mobile layout based on width */}
        {width >= 480 ? <ChatDesktopLayout /> : <ChatThread />}
      </Box>
    </ChatThemeBridge>
  </Box>
</Drawer>
```
[VERIFIED: SchedulingDrawer.tsx anchor="right" pattern; UI-SPEC layout spec]

### Anti-Patterns to Avoid
- **Mounting ChatRuntimeProvider inside the Drawer:** The runtime would be destroyed on drawer close, losing all conversation state. MUST be at Layout level. [VERIFIED: D-05 requires state preservation on close/reopen]
- **Creating a new adapter/transport per drawer open:** The `createPmSyncThreadListAdapter()` and `AssistantChatTransport` are module-scoped singletons. Creating duplicates causes thread ID conflicts. [VERIFIED: chat-thread-list-adapter.tsx line 341 cache]
- **Using `React.lazy` for drawer content:** The drawer should feel instant. Dynamic import would cause a loading flash on first open. Import statically. [ASSUMED]
- **Hardcoding context strings:** All display strings must go through i18n (`t.ai.overlay.*`). [VERIFIED: CLAUDE.md anti-pattern rule]
- **Reading Zustand state with hooks inside callbacks:** Use `store.getState()` for one-time reads in event handlers, not hooks (which cause re-renders). For the `usePageContext` hook itself, use standard hook subscriptions since it needs reactivity. [VERIFIED: Zustand docs pattern]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drawer slide animation | Custom CSS transitions | MUI Drawer built-in (225ms/195ms) | Handles backdrop, z-index, focus trap, reduced-motion |
| Focus trap when overlay open | Manual focus management | MUI Drawer temporary variant | Built-in focus trap, aria-modal, backdrop click-away |
| Thread list management | Custom conversation API wrapper | `useRemoteThreadListRuntime` + existing adapter | Already handles list/create/delete/rename/history |
| Chat streaming | Custom SSE client | `useChat` + `AssistantChatTransport` | Already handles CSRF, credentials, auto-resubmit |
| Keyboard shortcut conflict detection | Manual key tracking | Single `keydown` listener in Layout with event.key checks | Simple, matches existing pattern |
| Resize persistence | Custom localStorage wrapper | Zustand `persist` middleware | Already used for email-ui-store, proven pattern |

**Key insight:** This phase is an assembly task, not a creation task. Every building block exists. The risk is in how they're wired together, not in building new things.

## Common Pitfalls

### Pitfall 1: ChatRuntimeProvider Double Mount
**What goes wrong:** If ChatRuntimeProvider is both at Layout level AND still inside the /dashboard/ai page, two runtimes fight over the same backend conversations.
**Why it happens:** The ai.tsx page currently wraps ChatPage which includes ChatRuntimeProvider.
**How to avoid:** When lifting ChatRuntimeProvider to Layout, refactor ChatPage to NOT include its own provider. The ai.tsx page should render ChatDesktopLayout directly (wrapped in ChatThemeBridge), relying on the Layout-level provider.
**Warning signs:** Duplicate conversation creation, thread switching flickers, "thread not found" errors.

### Pitfall 2: Cmd+J Conflicts with Existing Shortcut
**What goes wrong:** The command palette currently shows `Cmd+J` as the shortcut for "AI Compose with Context" (`ai-compose` command in commands.ts, line 322).
**Why it happens:** The `ai-compose` command dispatches `window.dispatchEvent(new CustomEvent('command:ai-compose'))` on the `Cmd+J` shortcut display. However, there is NO actual global Cmd+J listener -- it's only a display hint in the command palette.
**How to avoid:** When adding the real Cmd+J listener in Layout.tsx, update the `ai-compose` command entry to either: (a) remove its `Cmd+J` shortcut display and let it call `useAiOverlay.open()` instead, or (b) change the AI compose action to open the overlay with a pre-filled context message.
**Warning signs:** Cmd+J does two things, or the command palette shows a stale shortcut.
[VERIFIED: commands.ts line 322 shows shortcut: 'Cmd+J' on ai-compose]

### Pitfall 3: Drawer Width vs Thread List Visibility
**What goes wrong:** At the default 420px width, the ChatDesktopLayout renders a 300px thread list sidebar + thread area. That leaves only 120px for the chat thread -- unusable.
**Why it happens:** ChatDesktopLayout.tsx hardcodes `.chat-desktop-sidebar { width: 300px; }` in CSS.
**How to avoid:** Per the UI-SPEC, when drawer width < 480px, hide the thread list and show ChatThread only (single-panel mode). Use a width threshold check in AiOverlayDrawer to conditionally render ChatDesktopLayout vs ChatThread alone. At < 480px, provide a toggle button (like ChatMobileLayout's hamburger) to switch to the thread list view.
**Warning signs:** Thread list and thread area overlap or are too narrow to read.
[VERIFIED: chat-layout.css line 67 `.chat-desktop-sidebar { width: 300px; }`, UI-SPEC layout spec]

### Pitfall 4: Context Detection Timing
**What goes wrong:** When the overlay opens, the context hook reads stale store state because the entity hasn't loaded yet (e.g., user clicks Cmd+J while a contact page is still loading).
**Why it happens:** Zustand stores are updated asynchronously as data loads from the API.
**How to avoid:** The `usePageContext` hook should re-evaluate on store changes (subscribe to relevant selectors). Show "Loading context..." or "General assistant" as fallback until entity data is available. Context should gracefully degrade -- never block the overlay from opening.
**Warning signs:** Context indicator shows "General assistant" on pages that should have context, then flashes to the correct context.

### Pitfall 5: Module-Scoped CSRF Cache in ChatRuntimeProvider
**What goes wrong:** The CSRF token cache (`csrfCache`) is populated in ChatRuntimeProvider's useEffect on mount. If the Layout-level provider mounts before the user's session is fully established, the token might be empty.
**Why it happens:** ChatRuntimeProvider.tsx line 118 calls `getCsrfToken()` in useEffect.
**How to avoid:** The existing code already handles this -- `getHeaders()` returns whatever `csrfCache` currently holds, and the transport retries. No change needed, but verify the provider mounts after auth is confirmed (it's inside Layout, which is only rendered for authenticated routes).
**Warning signs:** First chat message fails with 403 CSRF error.
[VERIFIED: ChatRuntimeProvider.tsx lines 117-120]

### Pitfall 6: Drawer vs Chat CSS Height Conflicts
**What goes wrong:** Chat components use `height: 100%` extensively (ChatPage, chat-surface, desktop-layout). Inside a Drawer, "100%" means the drawer's paper height, not the viewport.
**Why it happens:** The existing CSS assumes chat fills the entire page.
**How to avoid:** The Drawer paper already fills viewport height by default (MUI Drawer behavior). Ensure the internal layout chain maintains `height: 100%` / `flex: 1` from the drawer paper through to ChatThread. The `.chat-page` wrapper is not needed inside the drawer -- render ChatDesktopLayout/ChatThread directly inside a ChatThemeBridge that has `height: 100%`.
**Warning signs:** Chat thread doesn't scroll, composer is pushed off-screen, or thread area has zero height.
[VERIFIED: chat-layout.css lines 28-41, ChatThemeBridge.tsx line 109 `style={{ height: '100%' }}`]

## Code Examples

### Example 1: Header Icon Button Conversion
```typescript
// Source: Header.tsx lines 123-138 (current Link, needs to become onClick toggle)
// BEFORE:
<Tooltip title={t.ai?.title || 'AI Assistant'}>
  <IconButton
    component={Link}
    href="/dashboard/ai"
    sx={{ ... }}
  >
    <Sparkles size={20} />
  </IconButton>
</Tooltip>

// AFTER:
<Tooltip title={`${t.ai?.title || 'AI Assistant'} (${t.ai.overlay.shortcutHint})`}>
  <IconButton
    onClick={() => useAiOverlay.getState().toggleOpen()}
    sx={{ ... }}
  >
    <Sparkles size={20} />
  </IconButton>
</Tooltip>
```
[VERIFIED: Header.tsx lines 123-138]

### Example 2: Command Palette Entry Update
```typescript
// Source: commands.ts -- update ai-compose command or add new entry
// The existing ai-compose command (id: 'ai-compose', shortcut: 'Cmd+J')
// should be replaced or redirected to open the overlay:
{
  id: 'ai-assistant',
  name: t.ai.overlay.commandLabel,  // "Open AI Assistant"
  shortcut: 'Cmd+J',
  icon: Sparkles,
  action: () => {
    useAiOverlay.getState().open();
  },
  group: 'ai',
  keywords: ['ai', 'assistant', 'chat', 'overlay', 'copilot'],
},
```
[VERIFIED: commands.ts line 320-329 existing ai-compose entry]

### Example 3: Resize Handle with Pointer Events
```typescript
// Source: Derived from standard drag-resize pattern
function ResizeHandle({ onResize, currentWidth }: {
  onResize: (width: number) => void;
  currentWidth: number;
}) {
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      // Drawer is right-anchored, so moving left increases width
      const delta = startX - ev.clientX;
      onResize(startWidth + delta);
    };

    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [currentWidth, onResize]);

  return (
    <Box
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={t.ai.overlay.resizeHandle}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onResize(currentWidth + 20);
        if (e.key === 'ArrowRight') onResize(currentWidth - 20);
      }}
      sx={{
        width: 8,
        cursor: 'col-resize',
        flexShrink: 0,
        '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) },
      }}
    />
  );
}
```
[ASSUMED: Standard pointer capture resize pattern]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dedicated /dashboard/ai page only | Overlay panel accessible from any page | Phase 144 | Users no longer navigate away from current work to use AI |
| `component={Link} href="/dashboard/ai"` header button | `onClick` toggle for overlay | Phase 144 | Header icon becomes overlay trigger |
| ChatRuntimeProvider scoped to ChatPage | ChatRuntimeProvider at Layout level | Phase 144 | Runtime survives route changes; overlay + page share state |

**Deprecated/outdated:**
- The `ai-compose` command palette entry (Cmd+J shortcut) currently dispatches a CustomEvent that nothing handles globally. This will be replaced by the overlay toggle.

## Project Constraints (from CLAUDE.md)

- **Frontend procedure:** Translations first (en.ts + it.ts), then query hooks, then components, then type-check validation.
- **Post-edit validation:** `cd frontend && npx tsc --noEmit` after every file edit. No exceptions.
- **No hardcoded strings:** All UI text through `t.ai.overlay.*` keys.
- **No hardcoded colors/CSS:** Use MUI theme `sx` props only. Exception: existing chat CSS files use custom properties which is acceptable.
- **Max 500 lines per file:** No exceptions. AiOverlayDrawer must be split into sub-components.
- **MUI only:** No Tailwind utility classes in .tsx/.ts files.
- **Performance:** Non-critical widgets use `React.lazy` + `Suspense`. However, the overlay content should load instantly (no lazy -- see anti-patterns).
- **TanStack Query settings:** `staleTime: 5min`, `gcTime: 30min`, `retry: 1` for any new query hooks.
- **Scope control:** Do exactly what was asked. No unrequested features.
- **Memory-first mandate:** Check for prior solutions before starting.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Static import (not React.lazy) is better for drawer content to avoid loading flash | Anti-Patterns | LOW -- could use lazy with suspense if bundle size is a concern, but drawer should feel instant |
| A2 | Pointer capture resize pattern works reliably on Windows/Mac/Linux | Code Examples (ResizeHandle) | LOW -- standard Web API, widely supported |
| A3 | Lifting ChatRuntimeProvider to Layout won't break the thread-restore-guard logic | Pattern 4 | MEDIUM -- the ref-based guard should still work, but needs testing |

## Open Questions

1. **Thread list visibility at default width**
   - What we know: Default drawer width is 420px. ChatDesktopLayout has a 300px sidebar. UI-SPEC says hide thread list below 480px.
   - What's unclear: At 420px default, users won't see the thread list. Should the default be 480px instead, or is single-thread mode the intended default experience?
   - Recommendation: Keep 420px default per D-10 decision. Users who want the thread list can widen to 480px+. Provide a menu button (like mobile layout) at narrow widths.

2. **Context injection mechanism**
   - What we know: D-06 says "inject into the AI's system message." The backend constructs system messages.
   - What's unclear: How does the frontend pass page context to the backend? Options: (a) add a `context` field to the chat request body, (b) use the existing `prepareSendMessagesRequest` hook in AssistantChatTransport to inject context metadata.
   - Recommendation: Use option (b) -- extend the `prepareSendMessagesRequest` in the transport to include a `pageContext` field. The backend can then include it in the system prompt. This requires a minor backend change to read the field.

3. **ai-compose command replacement**
   - What we know: The `ai-compose` command in commands.ts currently dispatches `command:ai-compose` CustomEvent with `Cmd+J` shortcut hint. Phase 144 takes over Cmd+J.
   - What's unclear: Should the old `ai-compose` command be removed, renamed, or redirected?
   - Recommendation: Replace it with "Open AI Assistant" that calls `useAiOverlay.getState().open()`. Keep the `ai-summarize` and `ai-reply` commands as-is since they serve different purposes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + @testing-library/react (jsdom) |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --testPathPattern="ai-overlay\|use-page-context\|ai-overlay-store" --no-coverage` |
| Full suite command | `cd frontend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-06 | Cmd+J toggles overlay open/closed | unit | `cd frontend && npx jest stores/ai-overlay-store.test.ts -x` | Wave 0 |
| AI-06 | Header icon click opens overlay | unit | `cd frontend && npx jest components/ai-overlay/AiOverlayDrawer.test.tsx -x` | Wave 0 |
| AI-06 | Command palette "Open AI Assistant" triggers overlay | unit | `cd frontend && npx jest components/ai/CommandPalette/commands.test.ts -x` | Wave 0 |
| AI-07 | usePageContext returns correct type for email route | unit | `cd frontend && npx jest hooks/use-page-context.test.ts -x` | Wave 0 |
| AI-07 | usePageContext returns correct type for contact route | unit | `cd frontend && npx jest hooks/use-page-context.test.ts -x` | Wave 0 |
| AI-07 | Context indicator displays entity label | unit | `cd frontend && npx jest components/ai-overlay/ContextIndicator.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (mandatory per CLAUDE.md)
- **Per wave merge:** `cd frontend && npx jest --no-coverage`
- **Phase gate:** Full suite green + manual E2E verification before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/stores/ai-overlay-store.test.ts` -- covers AI-06 store behavior
- [ ] `frontend/hooks/use-page-context.test.ts` -- covers AI-07 route detection
- [ ] `frontend/components/ai-overlay/AiOverlayDrawer.test.tsx` -- covers AI-06 render/toggle
- [ ] `frontend/components/ai-overlay/ContextIndicator.test.tsx` -- covers AI-07 display

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Overlay inherits Layout auth guard (only rendered for authenticated users) |
| V3 Session Management | no | Uses existing cookie-based auth (`credentials: 'include'`) |
| V4 Access Control | no | Chat API already enforces tenantId server-side |
| V5 Input Validation | yes | Chat messages sanitized by existing AI SDK transport; context metadata is read-only from stores |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Context data leakage (injecting sensitive entity data into AI prompt) | Information Disclosure | Context enrichment reads only from authenticated API responses already cached by TanStack Query; no new backend queries that bypass auth |
| XSS via context indicator label | Tampering | React auto-escapes JSX text content; no `dangerouslySetInnerHTML` used |
| CSRF on chat endpoint | Spoofing | Existing CSRF token in `X-CSRF-Token` header (ChatRuntimeProvider line 36) |

## Sources

### Primary (HIGH confidence)
- Codebase files: Layout.tsx, Header.tsx, ChatRuntimeProvider.tsx, ChatPage.tsx, ChatDesktopLayout.tsx, ChatThreadList.tsx, ChatThread.tsx, ChatMobileLayout.tsx, ChatThemeBridge.tsx, SchedulingDrawer.tsx, commands.ts, CommandPalette/index.tsx, email-ui-store.ts, contact-store.ts, calendar-store.ts, crm-context.ts, use-crm-context.ts, chat-layout.css, chat-thread-list-adapter.tsx, thread-restore-guard.ts, pages/dashboard/ai.tsx
- 144-CONTEXT.md -- All locked decisions (D-01 through D-13)
- 144-UI-SPEC.md -- Visual contract, layout spec, interaction contract, copywriting contract

### Secondary (MEDIUM confidence)
- npm ls output for installed package versions (assistant-ui, MUI, zustand, next, react)
- package.json scripts for test/build commands

### Tertiary (LOW confidence)
- None. All claims verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via npm ls, all patterns traced in codebase
- Architecture: HIGH -- every component, store, and hook referenced has been read and verified
- Pitfalls: HIGH -- each pitfall identified from actual code inspection (CSS widths, module-scoped caches, shortcut conflicts)

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable -- no external API dependencies, all code local)
