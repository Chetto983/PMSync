# Phase 144: AI Assistant Overlay - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/stores/ai-overlay-store.ts` | store | event-driven | `frontend/stores/email-ui-store.ts` | exact |
| `frontend/hooks/use-page-context.ts` | hook | request-response | `frontend/hooks/queries/use-crm-context.ts` | role-match |
| `frontend/components/ai-overlay/AiOverlayDrawer.tsx` | component | event-driven | `frontend/components/calendar/ai/SchedulingDrawer.tsx` | exact |
| `frontend/components/ai-overlay/AiOverlayHeader.tsx` | component | request-response | `frontend/components/calendar/ai/SchedulingDrawer.tsx` (header section) | role-match |
| `frontend/components/ai-overlay/ContextIndicator.tsx` | component | request-response | `frontend/components/calendar/ai/SchedulingDrawer.tsx` (Chip pattern) | role-match |
| `frontend/components/ai-overlay/ResizeHandle.tsx` | component | event-driven | (no direct analog -- pointer capture pattern from RESEARCH.md) | no-analog |
| `frontend/components/ai-overlay/index.ts` | config | N/A | `frontend/hooks/queries/index.ts` | exact |
| `frontend/components/layout/Layout.tsx` (MODIFY) | component | event-driven | self (existing Cmd+K handler, lines 82-92) | exact |
| `frontend/components/layout/Header.tsx` (MODIFY) | component | event-driven | self (existing AI IconButton, lines 123-138) | exact |
| `frontend/components/ai/CommandPalette/commands.ts` (MODIFY) | config | event-driven | self (existing ai-compose entry, lines 319-329) | exact |

### Translation Files (MODIFY)
| File | Role | Analog |
|------|------|--------|
| `frontend/locales/en.ts` | config | self (`ai:` section at line 2723) |
| `frontend/locales/it.ts` | config | self (`ai:` section) |
| `frontend/locales/index.ts` | config | self (`ai:` type at line 2823) |

### Chat Files (MODIFY -- provider lifting)
| File | Role | Analog |
|------|------|--------|
| `frontend/src/components/chat/ChatPage.tsx` (MODIFY) | component | self (remove ChatRuntimeProvider wrapper) |
| `frontend/pages/dashboard/ai.tsx` (MODIFY) | component | self (adjust for lifted provider) |

---

## Pattern Assignments

### `frontend/stores/ai-overlay-store.ts` (store, event-driven)

**Analog:** `frontend/stores/email-ui-store.ts`

**Imports pattern** (lines 16-17):
```typescript
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
```

**Zustand persist pattern** (lines 45-101):
```typescript
export const useEmailUIStore = create<EmailUIState>()(
  devtools(
    persist(
      (set, get) => ({
        // ... state and actions ...
      }),
      {
        name: 'email-ui-storage',
        storage: createJSONStorage(() => localStorage),
        // Only persist viewMode and kanbanAssignments
        partialize: (state) => ({
          viewMode: state.viewMode,
          kanbanAssignments: state.kanbanAssignments,
        }),
      }
    ),
    { name: 'email-ui-store' }
  )
);
```

**Key adaptation:** The ai-overlay store is much simpler (isOpen + width). Use `persist` middleware with `partialize` to persist ONLY `width` (not `isOpen`). localStorage key: `pmsync:ai-overlay-width`. Wrap in `devtools` for consistency. `isOpen` defaults to `false` on each session (D-12).

---

### `frontend/hooks/use-page-context.ts` (hook, request-response)

**Analog:** `frontend/hooks/queries/use-crm-context.ts`

**Imports pattern** (lines 1-4):
```typescript
import axios from 'axios';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { crmContextApi, type CrmContactContext } from '@/lib/api/crm-context';
import { crmContextKeys } from './crm-context-keys';
```

**Query options pattern** (lines 14-22):
```typescript
export function crmContextByContactOptions(contactId: string) {
  return queryOptions({
    queryKey: crmContextKeys.byContact(contactId),
    queryFn: () => crmContextApi.getByContactId(contactId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!contactId,
  });
}
```

**Key adaptation:** `usePageContext` is a pure client-side hook that reads `useRouter().pathname` + `useRouter().query` + Zustand store selectors (`useEmailUIStore`, `useContactStore`, `useCalendarStore`). It does NOT make API calls -- it reads existing cached data from Zustand stores and TanStack Query cache. Returns a typed `PageContext` object. The hook should be reactive (subscribe to router + store changes), not imperative.

**Store read patterns from analogs:**

From `frontend/stores/email-ui-store.ts` (line 80-81):
```typescript
activeEmailId: null,
activeThreadId: null,
```

From `frontend/stores/contact-store.ts` (line 149):
```typescript
setSelectedContact: (contact) => set({ selectedContact: contact }),
```

From `frontend/stores/calendar-store.ts` (line 167):
```typescript
setSelectedEvent: (event) => set({ selectedEvent: event }),
```

---

### `frontend/components/ai-overlay/AiOverlayDrawer.tsx` (component, event-driven)

**Analog:** `frontend/components/calendar/ai/SchedulingDrawer.tsx`

**Imports pattern** (lines 1-12):
```typescript
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  // ... other MUI imports
} from '@mui/material';
import { X, Calendar, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
```

**MUI Drawer pattern** (lines 347-357):
```typescript
<Drawer
  anchor="right"
  open={open}
  onClose={onClose}
  PaperProps={{
    sx: {
      width: { xs: '100%', sm: 420 },
      p: 0,
    },
  }}
>
```

**Header section pattern** (lines 359-378):
```typescript
{/* Header */}
<Box
  sx={{
    p: 2,
    borderBottom: 1,
    borderColor: 'divider',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
  }}
>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Calendar size={20} />
    <Typography variant="h6">{labels.title}</Typography>
  </Box>
  <IconButton onClick={onClose} size="small" sx={{ color: 'inherit' }}>
    <X size={20} />
  </IconButton>
</Box>
```

**Content area with flex pattern** (line 381):
```typescript
<Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
```

**Key adaptation:** Replace fixed `width` with dynamic `width` from `useAiOverlay` store. Use `variant="temporary"` (MUI default). PaperProps `sx` should use `flexDirection: 'row'` to place ResizeHandle + content side-by-side. Content renders ChatThemeBridge wrapping ChatDesktopLayout or ChatThread based on width threshold (480px per UI-SPEC). The SchedulingDrawer uses props (`open`, `onClose`) -- the overlay instead reads from the Zustand store (`useAiOverlay`).

**ChatThemeBridge wrapper pattern** from `frontend/src/components/chat/ChatThemeBridge.tsx` (line 109):
```typescript
<div style={{ ...cssVars, height: '100%' }}>
  {children}
</div>
```

**ChatDesktopLayout pattern** from `frontend/src/components/chat/ChatDesktopLayout.tsx` (lines 10-23):
```typescript
export function ChatDesktopLayout() {
  return (
    <div className="chat-desktop-layout h-full">
      <aside className="chat-desktop-sidebar">
        <ChatThreadList />
      </aside>
      <section className="chat-desktop-thread">
        <ChatThread />
      </section>
    </div>
  );
}
```

**ChatMobileLayout toggle pattern** from `frontend/src/components/chat/ChatMobileLayout.tsx` (lines 15-26):
```typescript
const [showSidebar, setShowSidebar] = useState(false);
const openSidebar = useCallback(() => setShowSidebar(true), []);
const closeSidebar = useCallback(() => setShowSidebar(false), []);
```

---

### `frontend/components/ai-overlay/AiOverlayHeader.tsx` (component, request-response)

**Analog:** `frontend/components/calendar/ai/SchedulingDrawer.tsx` (header section, lines 359-378)

See AiOverlayDrawer header pattern above. The overlay header adds:
- Context indicator (ContextIndicator component)
- Shortcut hint chip
- Close button (X icon)

**Chip pattern** from SchedulingDrawer (lines 493-498):
```typescript
<Chip
  size="small"
  icon={<CheckCircle size={14} />}
  label={labels.youAreFree}
  color="success"
  variant="outlined"
/>
```

---

### `frontend/components/ai-overlay/ContextIndicator.tsx` (component, request-response)

**Analog:** `frontend/components/calendar/ai/SchedulingDrawer.tsx` (Chip pattern)

**MUI Chip pattern** (lines 493-519):
```typescript
<Chip
  size="small"
  icon={<Sparkles size={14} />}
  label={slot.recommendation}
  color="primary"
  variant="outlined"
/>
```

**Key adaptation:** Render a Chip showing the current page context type (email/contact/deal/calendar/general) with appropriate icon (Mail, User, Building2, Calendar, Sparkles) and entity label. Uses `usePageContext()` hook output. Graceful degradation: shows "General assistant" when no context.

---

### `frontend/components/ai-overlay/ResizeHandle.tsx` (component, event-driven)

**No direct codebase analog.** Use the pointer capture resize pattern from RESEARCH.md (Example 3).

**MUI Box pattern** from SchedulingDrawer for styling:
```typescript
<Box
  sx={{
    width: 8,
    cursor: 'col-resize',
    flexShrink: 0,
    '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) },
  }}
/>
```

**Accessibility pattern from ChatMobileLayout** (lines 77-86):
```typescript
<button
  type="button"
  aria-label={openThreadListLabel}
  aria-expanded={showSidebar ? 'true' : 'false'}
>
```

Apply `role="separator"`, `aria-orientation="vertical"`, `tabIndex={0}`, and arrow key handlers for keyboard resize.

---

### `frontend/components/layout/Layout.tsx` (MODIFY -- keyboard shortcut + drawer mount)

**Analog:** Self -- existing Cmd+K handler (lines 82-92)

**Keyboard shortcut pattern** (lines 82-92):
```typescript
useEffect(() => {
  const down = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
    }
  };

  document.addEventListener('keydown', down);
  return () => document.removeEventListener('keydown', down);
}, []);
```

**Modification:** Add a second `if` block inside the same `down` handler for `event.key.toLowerCase() === 'j'` that calls `useAiOverlay.getState().toggleOpen()`.

**Component mounting pattern** -- add `<AiOverlayDrawer />` next to `<CommandPalette>` (line 239-242):
```typescript
<CommandPalette
  open={commandPaletteOpen}
  onClose={() => setCommandPaletteOpen(false)}
/>
```

**ChatRuntimeProvider lifting** -- wrap the Layout content with ChatRuntimeProvider. Mount location: wrap the outer `<Box>` or wrap `{children}` + `<AiOverlayDrawer />` together so the runtime is shared between the main page content and the drawer.

---

### `frontend/components/layout/Header.tsx` (MODIFY -- icon button)

**Analog:** Self -- existing AI IconButton (lines 123-138)

**Current pattern** (lines 123-138):
```typescript
<Tooltip title={t.ai?.title || 'AI Assistant'}>
  <IconButton
    component={Link}
    href="/dashboard/ai"
    sx={{
      position: 'relative',
      color: 'inherit',
      '&:hover': {
        background: (theme) => alpha(theme.palette.primary.main, 0.1),
      },
    }}
  >
    <Sparkles size={20} />
  </IconButton>
</Tooltip>
```

**Modification:** Replace `component={Link} href="/dashboard/ai"` with `onClick={() => useAiOverlay.getState().toggleOpen()}`. Remove the `Link` import if no longer used. Update tooltip to include shortcut hint.

---

### `frontend/components/ai/CommandPalette/commands.ts` (MODIFY -- command entry)

**Analog:** Self -- existing ai-compose entry (lines 319-329)

**Current pattern** (lines 319-329):
```typescript
{
  id: 'ai-compose',
  name: t.commandPalette.commands.aiComposeContext,
  shortcut: 'Cmd+J',
  icon: Wand2,
  action: () => {
    window.dispatchEvent(new CustomEvent('command:ai-compose'));
  },
  group: 'ai',
  keywords: ['compose', 'write', 'ai', 'context'],
},
```

**Modification:** Replace this entry with an "Open AI Assistant" command that calls `useAiOverlay.getState().open()`. Keep `shortcut: 'Cmd+J'`, change `id` to `'ai-assistant'`, update `name`, `icon` (Sparkles), and `keywords`. The existing `ai-compose` id becomes `ai-assistant`. Import `useAiOverlay` from stores.

---

### `frontend/src/components/chat/ChatPage.tsx` (MODIFY -- remove provider wrapper)

**Analog:** Self (lines 1-27)

**Current pattern** (lines 13-26):
```typescript
export function ChatPage() {
  return (
    <ChatRuntimeProvider>
      <ChatThemeBridge>
        <div className="chat-page">
          <div className="chat-surface">
            <ChatDesktopLayout />
            <ChatMobileLayout />
          </div>
        </div>
      </ChatThemeBridge>
    </ChatRuntimeProvider>
  );
}
```

**Modification:** Remove the `<ChatRuntimeProvider>` wrapper. The provider is now at Layout level. ChatPage becomes:
```typescript
export function ChatPage() {
  return (
    <ChatThemeBridge>
      <div className="chat-page">
        <div className="chat-surface">
          <ChatDesktopLayout />
          <ChatMobileLayout />
        </div>
      </div>
    </ChatThemeBridge>
  );
}
```

---

## Shared Patterns

### Translations (i18n)
**Source:** `frontend/locales/en.ts` (line 2723, `ai:` section)
**Apply to:** All new components (AiOverlayDrawer, AiOverlayHeader, ContextIndicator, ResizeHandle)

```typescript
// Usage pattern from SchedulingDrawer.tsx (line 66-67, 117)
const t = useTranslations();
const labels = t.ai.calendarAi.scheduling;
```

New translation keys will be under `t.ai.overlay.*`:
- `t.ai.overlay.title` -- "AI Assistant"
- `t.ai.overlay.shortcutHint` -- "Ctrl+J"
- `t.ai.overlay.resizeHandle` -- "Resize panel"
- `t.ai.overlay.commandLabel` -- "Open AI Assistant"
- `t.ai.overlay.contextViewing` -- "Viewing: {label}"
- `t.ai.overlay.contextGeneral` -- "General assistant"
- `t.ai.overlay.contextEmail` -- "Email"
- `t.ai.overlay.contextContact` -- "Contact"
- `t.ai.overlay.contextDeal` -- "Deal"
- `t.ai.overlay.contextCalendar` -- "Calendar event"

### useTranslations Hook
**Source:** `frontend/lib/hooks/use-translations.ts`
**Apply to:** All new components

```typescript
import { useTranslations } from '@/lib/hooks/use-translations';
```

### MUI Theme Color Usage
**Source:** `frontend/components/calendar/ai/SchedulingDrawer.tsx` (line 367-369)
**Apply to:** All new components

```typescript
// Always use theme tokens, never hardcoded colors
sx={{
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderColor: 'divider',
  '&:hover': {
    background: (theme) => alpha(theme.palette.primary.main, 0.1),
  },
}}
```

### Lucide Icons
**Source:** `frontend/components/layout/Header.tsx` (lines 17-19)
**Apply to:** All overlay components

```typescript
import { Sparkles, X, Mail, User, Building2, Calendar, GripVertical } from 'lucide-react';
```

### 'use client' Directive
**Source:** All chat components (ChatRuntimeProvider line 1, SchedulingDrawer line 1)
**Apply to:** All new components

```typescript
'use client';
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/components/ai-overlay/ResizeHandle.tsx` | component | event-driven | No resizable panel exists in the codebase. Use pointer capture pattern from RESEARCH.md Example 3. Standard Web API (setPointerCapture). |

---

## Metadata

**Analog search scope:** `frontend/components/`, `frontend/stores/`, `frontend/hooks/`, `frontend/locales/`, `frontend/pages/`, `frontend/src/components/chat/`
**Files scanned:** 18 analog files read
**Pattern extraction date:** 2026-04-16
