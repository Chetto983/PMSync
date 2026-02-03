# Phase 06: Advanced Features - Research

**Researched:** 2026-02-03
**Domain:** Email UI Enhancement (Kanban View, Search Filters, Dark Mode)
**Confidence:** HIGH

## Summary

This research covers three advanced features for the MailAgent email client: Kanban toggle view (FE-05), search with filters (FE-08), and dark mode (FE-09). The excellent news is that the existing codebase already has most of the infrastructure in place.

**Dark mode** is 90% complete - the project already uses `next-themes` integrated with MUI's `ThemeProvider`, complete light/dark themes in `frontend/theme/`, and a working `useThemePersistence` hook that syncs preferences to the database. Only minor enhancements needed for system preference detection UX.

**Kanban view** has a solid foundation - `@dnd-kit` is already installed and used for folder drag-drop, and there's a complete working Kanban board in `components/productivity/KanbanBoard/` that can be adapted. The email-ui-store needs `viewMode` extended from `'list' | 'thread'` to include `'kanban'`.

**Search filters** requires the most new work - the basic `EmailSearchBar` exists with debounce, and the backend already supports filter queries, but the frontend needs filter predicate parsing (from:, to:, subject:, date:, has:attachment).

**Primary recommendation:** Leverage existing patterns heavily - adapt the productivity KanbanBoard for emails, extend email-ui-store filters, and enhance the theme toggle UX.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | ^6.3.1 | Drag and drop foundation | Modern replacement for deprecated react-beautiful-dnd |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable lists/grids | Multi-container support for Kanban columns |
| `@dnd-kit/utilities` | ^3.2.2 | DnD helpers | CSS transforms, sensors |
| `next-themes` | ^0.4.6 | Theme management | SSR-safe, system preference, localStorage |
| `@mui/material` | ^7.3.7 | UI components | Complete theming system, dark mode support |
| `zustand` | ^5.0.10 | State management | Email UI state, view preferences |
| `use-debounce` | ^10.1.0 | Input debouncing | Search input optimization |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | ^5.90.20 | Data fetching | Email list queries with caching |
| `framer-motion` | ^12.29.0 | Animations | Theme transition animations |
| `lucide-react` | ^0.563.0 | Icons | Search, filter, theme toggle icons |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | react-beautiful-dnd | react-beautiful-dnd is deprecated, no longer maintained |
| next-themes | Manual localStorage | next-themes handles SSR hydration, system preference |
| Zustand | Redux | Zustand is lighter, already used throughout project |

**Installation:**
```bash
# All required packages already installed - no new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure

```
frontend/
├── components/
│   └── email/
│       ├── kanban/
│       │   ├── EmailKanbanBoard.tsx      # Main Kanban container
│       │   ├── EmailKanbanColumn.tsx     # Individual column
│       │   ├── EmailKanbanCard.tsx       # Draggable email card
│       │   └── index.ts                  # Exports
│       ├── list/
│       │   ├── EmailSearchBar.tsx        # Enhanced with filters
│       │   └── SearchFilterChips.tsx     # Active filter display
│       └── layout/
│           └── EmailLayout.tsx           # View toggle integration
├── stores/
│   └── email-ui-store.ts                 # Extended viewMode + filters
└── hooks/
    └── use-theme-persistence.ts          # Already complete
```

### Pattern 1: View Mode Toggle with Zustand

**What:** Store view preference in Zustand, persist to localStorage
**When to use:** User toggles between list/kanban views

**Example:**
```typescript
// Source: Existing email-ui-store.ts pattern
export type EmailViewMode = 'list' | 'thread' | 'kanban';

interface EmailUIState {
  viewMode: EmailViewMode;
  setViewMode: (mode: EmailViewMode) => void;
}

export const useEmailUIStore = create<EmailUIState>()(
  persist(
    (set) => ({
      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    { name: 'email-ui-storage' }
  )
);
```

### Pattern 2: Multi-Container Kanban with @dnd-kit

**What:** Drag emails between status columns (Inbox, To Reply, Following Up, Done)
**When to use:** Kanban view mode active

**Example:**
```typescript
// Source: Existing KanbanBoard/index.tsx pattern
import { DndContext, closestCorners, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

const KANBAN_COLUMNS = [
  { id: 'inbox', title: 'Inbox', color: 'primary' },
  { id: 'to-reply', title: 'To Reply', color: 'warning' },
  { id: 'following-up', title: 'Following Up', color: 'info' },
  { id: 'done', title: 'Done', color: 'success' },
] as const;

function EmailKanbanBoard() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {KANBAN_COLUMNS.map((column) => (
        <SortableContext
          key={column.id}
          items={getColumnItems(column.id)}
          strategy={verticalListSortingStrategy}
        >
          <EmailKanbanColumn column={column} />
        </SortableContext>
      ))}
      <DragOverlay>
        {activeEmail && <EmailKanbanCard email={activeEmail} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
```

### Pattern 3: Search Filter Predicate Parsing

**What:** Parse filter syntax like `from:john subject:meeting has:attachment`
**When to use:** User types in search box with filter prefixes

**Example:**
```typescript
// Source: Standard email client pattern
interface ParsedFilters {
  query: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  startDate?: string;
  endDate?: string;
}

function parseSearchQuery(input: string): ParsedFilters {
  const filters: ParsedFilters = { query: '' };
  const parts = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const remainingParts: string[] = [];

  for (const part of parts) {
    const [prefix, ...valueParts] = part.split(':');
    const value = valueParts.join(':').replace(/^"|"$/g, '');

    switch (prefix.toLowerCase()) {
      case 'from':
        filters.from = value;
        break;
      case 'to':
        filters.to = value;
        break;
      case 'subject':
        filters.subject = value;
        break;
      case 'has':
        if (value === 'attachment') filters.hasAttachment = true;
        break;
      case 'after':
        filters.startDate = value;
        break;
      case 'before':
        filters.endDate = value;
        break;
      default:
        remainingParts.push(part);
    }
  }

  filters.query = remainingParts.join(' ');
  return filters;
}
```

### Pattern 4: Theme Integration with MUI + next-themes

**What:** Use existing theme infrastructure with smooth transitions
**When to use:** Theme toggle, system preference changes

**Example:**
```typescript
// Source: Existing use-theme-persistence.ts + Layout.tsx
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { darkTheme, lightTheme } from '@/theme/appTheme';

function Layout({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, toggleTheme, isDarkMode } = useThemePersistence();
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Smooth transition CSS */}
      <style jsx global>{`
        * {
          transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }
      `}</style>
      {children}
    </ThemeProvider>
  );
}
```

### Anti-Patterns to Avoid

- **Custom CSS colors for dark mode:** Always use `theme.palette.*` - never hardcode hex colors
- **Manual localStorage for themes:** Use next-themes which handles SSR hydration
- **Single DndContext for both folder and kanban:** Keep separate contexts to avoid conflicts
- **Synchronous search:** Always debounce with 300ms minimum
- **Inline filter state:** Keep filter state in Zustand store, not component state

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme switching | Custom context + localStorage | `next-themes` + `useThemePersistence` | SSR hydration, system pref, already works |
| Drag and drop | Custom mouse events | `@dnd-kit` | Accessibility, touch support, keyboard nav |
| Search debouncing | setTimeout/useEffect | `useDebouncedCallback` from use-debounce | Proper cleanup, leading/trailing options |
| Theme colors | Hardcoded hex values | `theme.palette.*` from MUI | Consistency, dark mode support |
| View persistence | localStorage directly | Zustand persist middleware | Type safety, rehydration handling |
| Kanban board | Build from scratch | Adapt `KanbanBoard/index.tsx` | Tested patterns, keyboard support |

**Key insight:** The codebase already has working examples of every pattern needed. Adaptation is faster and safer than reimplementation.

## Common Pitfalls

### Pitfall 1: Theme Hydration Mismatch

**What goes wrong:** Flash of wrong theme on page load, React hydration errors
**Why it happens:** Server renders one theme, client localStorage has different preference
**How to avoid:**
- Use next-themes `suppressHydrationWarning` on html element
- Wrap theme-dependent UI in mounted check
- Use `resolvedTheme` not `theme` for actual rendering
**Warning signs:** Console errors about hydration, brief flash of light/dark on load

### Pitfall 2: DnD Context Conflicts

**What goes wrong:** Drag operations interfere between folder tree and Kanban
**Why it happens:** Single DndContext tries to handle both drag types
**How to avoid:**
- Use separate DndContext for Kanban view
- Different sensor configurations per context
- Clear drag type identification
**Warning signs:** Dropping email on folder tree while in Kanban view

### Pitfall 3: Search Filter Parsing Edge Cases

**What goes wrong:** Filters don't parse correctly with quotes, special characters
**Why it happens:** Simple split on spaces breaks quoted strings
**How to avoid:**
- Use regex that handles quoted strings: `/(?:[^\s"]+|"[^"]*")+/g`
- Trim quotes after splitting
- Handle empty values gracefully
**Warning signs:** `from:"John Doe"` parsed as two separate items

### Pitfall 4: Kanban State vs Server State

**What goes wrong:** Optimistic UI shows moved email, then reverts on error
**Why it happens:** Server mutation fails but UI already updated
**How to avoid:**
- Use TanStack Query's `onMutate` for optimistic updates
- Store previous state for rollback in `onError`
- Show toast on mutation failure
**Warning signs:** Emails jumping back to original column

### Pitfall 5: Missing Keyboard Navigation in Kanban

**What goes wrong:** Users can't navigate Kanban without mouse
**Why it happens:** Only implementing drag-drop, forgetting keyboard
**How to avoid:**
- Copy keyboard handling from existing `KanbanBoard/index.tsx`
- h/j/k/l for navigation
- Enter to select, Escape to cancel
**Warning signs:** Tab doesn't move between cards, no visual focus indicator

## Code Examples

Verified patterns from official sources and existing codebase:

### View Mode Toggle Button

```typescript
// Source: Adapt from existing patterns
import { List, ViewColumn } from 'lucide-react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useEmailUIStore } from '@/stores/email-ui-store';

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useEmailUIStore();

  return (
    <ToggleButtonGroup
      value={viewMode}
      exclusive
      onChange={(_, value) => value && setViewMode(value)}
      size="small"
    >
      <ToggleButton value="list" aria-label="List view">
        <List size={18} />
      </ToggleButton>
      <ToggleButton value="kanban" aria-label="Kanban view">
        <ViewColumn size={18} />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
```

### Enhanced Search Bar with Filters

```typescript
// Source: Extend existing EmailSearchBar.tsx
import { useState, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { TextField, Chip, Box, InputAdornment } from '@mui/material';
import { Search, X } from 'lucide-react';

interface SearchFilters {
  query: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
}

export function EmailSearchBar({ onSearch }: { onSearch: (filters: SearchFilters) => void }) {
  const [input, setInput] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({ query: '' });

  const debouncedSearch = useDebouncedCallback((value: string) => {
    const filters = parseSearchQuery(value);
    setActiveFilters(filters);
    onSearch(filters);
  }, 300);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const removeFilter = (key: keyof SearchFilters) => {
    // Reconstruct input without that filter
    const newFilters = { ...activeFilters, [key]: undefined };
    setActiveFilters(newFilters);
    onSearch(newFilters);
  };

  return (
    <Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Search... (try from:john has:attachment)"
        value={input}
        onChange={handleChange}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={18} />
            </InputAdornment>
          ),
        }}
      />
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {activeFilters.from && (
          <Chip
            size="small"
            label={`from: ${activeFilters.from}`}
            onDelete={() => removeFilter('from')}
          />
        )}
        {activeFilters.hasAttachment && (
          <Chip
            size="small"
            label="has: attachment"
            onDelete={() => removeFilter('hasAttachment')}
          />
        )}
      </Box>
    </Box>
  );
}
```

### Theme Toggle with System Preference

```typescript
// Source: Enhance existing theme-toggle.tsx
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { IconButton, Tooltip, Menu, MenuItem } from '@mui/material';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useThemePersistence();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const icon = resolvedTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />;

  return (
    <>
      <Tooltip title="Theme">
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
          {icon}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setTheme('light'); setAnchorEl(null); }}>
          <Sun size={16} style={{ marginRight: 8 }} /> Light
        </MenuItem>
        <MenuItem onClick={() => { setTheme('dark'); setAnchorEl(null); }}>
          <Moon size={16} style={{ marginRight: 8 }} /> Dark
        </MenuItem>
        <MenuItem onClick={() => { setTheme('system'); setAnchorEl(null); }}>
          <Monitor size={16} style={{ marginRight: 8 }} /> System
        </MenuItem>
      </Menu>
    </>
  );
}
```

### Kanban Column Component

```typescript
// Source: Adapt from existing KanbanBoard/index.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Typography, Badge, Collapse, IconButton } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface KanbanColumn {
  id: string;
  title: string;
  color: 'primary' | 'warning' | 'info' | 'success';
}

export function EmailKanbanColumn({
  column,
  emails,
  collapsed,
  onToggleCollapse,
}: {
  column: KanbanColumn;
  emails: Email[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: 300,
        bgcolor: isOver ? 'action.hover' : 'background.paper',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        transition: 'background-color 0.2s',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </IconButton>
          <Typography variant="subtitle2">{column.title}</Typography>
          <Badge badgeContent={emails.length} color={column.color} />
        </Box>
      </Box>
      <Collapse in={!collapsed}>
        <SortableContext items={emails.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <Box sx={{ p: 1, minHeight: 200 }}>
            {emails.map((email) => (
              <EmailKanbanCard key={email.id} email={email} />
            ))}
          </Box>
        </SortableContext>
      </Collapse>
    </Box>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | 2023 | rbd deprecated, dnd-kit is maintained |
| Manual dark mode | next-themes + MUI | 2024 | Handles SSR, system pref automatically |
| Redux for UI state | Zustand | 2023 | Simpler, less boilerplate |
| Custom search parsing | Standard predicate syntax | Always | Gmail/Outlook users expect from:, to: |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Unmaintained since 2022, use @dnd-kit
- Custom theme contexts: next-themes handles all edge cases
- Manual localStorage theme: Causes hydration issues

## Open Questions

Things that couldn't be fully resolved:

1. **Kanban column status field**
   - What we know: Need a status field on emails for Kanban columns
   - What's unclear: Whether to add `kanbanStatus` field to Email model or use labels/folders
   - Recommendation: Check with user - could use existing labels or add dedicated field

2. **Search results highlighting**
   - What we know: Backend returns matching emails
   - What's unclear: How to highlight matching terms in subject/snippet
   - Recommendation: Use `mark.js` or simple regex replacement with `<mark>` tags

3. **Kanban column persistence**
   - What we know: Users will assign emails to columns
   - What's unclear: Whether this should be local-only or synced to server
   - Recommendation: Server sync recommended for cross-device consistency

## Sources

### Primary (HIGH confidence)

- **Existing codebase** - `KanbanBoard/index.tsx`, `use-theme-persistence.ts`, `email-ui-store.ts`
- **@dnd-kit documentation** - Multi-container sortable patterns
- **next-themes documentation** - SSR-safe theme switching
- **MUI v7 documentation** - Theme system, colorSchemes API

### Secondary (MEDIUM confidence)

- **Web search 2025** - React Kanban best practices, dnd-kit patterns
- **GitHub examples** - Inbox Zero, similar email clients

### Tertiary (LOW confidence)

- None - all patterns verified against official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working
- Architecture: HIGH - Patterns from existing codebase (KanbanBoard, theme hooks)
- Pitfalls: HIGH - Derived from existing implementations and official docs

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - stable, mature libraries)
