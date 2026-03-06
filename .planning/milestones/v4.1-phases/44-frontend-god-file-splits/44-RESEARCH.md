# Phase 44: Frontend God-File Splits - Research

**Researched:** 2026-03-06
**Domain:** React component decomposition, Zustand store splitting, Playwright visual regression
**Confidence:** HIGH

## Summary

Phase 44 decomposes 7 frontend god-files (5,607 lines total) into focused sub-400-line components with pixel-identical rendering. The project already completed an analogous backend split in Phase 43 using a facade pattern -- the frontend equivalent is extracting sub-components/hooks while keeping the parent component as a thin orchestrator that wires them together.

Critical finding: several of the QUAL-07 through QUAL-12 split targets named in the requirements are ALREADY extracted as separate components. For example, Calendar.tsx already delegates to CalendarSidebar, CalendarHeader, CalendarEventDialog, and CalendarEventDetail. The actual bulk remaining in these god-files is orchestration logic: state declarations, data-loading hooks, WebSocket subscriptions, event handlers, and copy-building useMemos. The real split strategy for React components is extracting custom hooks (useCalendarData, useCalendarHandlers, etc.) and pulling inline sub-components into their own files.

The email-ui-store.ts (QUAL-13) is a Zustand store split, not a component split. Zustand supports store slicing natively -- the store can be split into domain-focused slices that compose into the same store interface. The key constraint is preserving the public API so all 10+ consumers import identically.

**Primary recommendation:** Extract custom hooks for orchestration logic (data loading, event handlers, WebSocket subscriptions) from page-level components. Extract inline sub-components (WidgetCard, CustomizeDrawer, InteractionList, ProviderIcon) into their own files. Split email-ui-store into slice files that re-export through the same barrel. Take Playwright screenshots BEFORE each split, compare AFTER.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-07 | Calendar.tsx (1180 lines) split into CalendarGrid, CalendarSidebar, CalendarEventModal, CalendarToolbar | CalendarSidebar/Header/EventDialog/EventDetail already extracted; remaining bulk is handlers+data loading -> extract useCalendarData + useCalendarHandlers hooks + CalendarGrid wrapper |
| QUAL-08 | Contacts.tsx (1021 lines) split into ContactList, ContactListItem, ContactFilters | ContactList/ContactSidebar/ContactDetail already extracted as components; remaining bulk is orchestration -> extract useContactsData + useContactsHandlers hooks |
| QUAL-09 | Header.tsx (799 lines) split into SearchBar, UserMenu, NotificationBell, NavTabs | All 4 sub-components are inline in Header.tsx; extract UserMenu, NotificationBell, AiActionsBell, LanguageMenu as separate files |
| QUAL-10 | ContactDetail.tsx (720 lines) split into ContactDetailTabs, ContactActivityFeed, ContactInfoPanel | Contains inline ProviderIcon, InteractionList, TabPanel + main component; extract ContactInfoPanel (details tab), ContactActivityFeed (InteractionList), ContactNotesTab |
| QUAL-11 | DashboardContainer.tsx (674 lines) split into DashboardGrid, DashboardWidgetWrapper | Contains inline WidgetCard, WidgetSkeleton, CustomizeDrawer, EmptyState, AiQuickAccess; extract each into own file |
| QUAL-12 | Settings.tsx (661 lines) split into per-section SettingsSection components | Section components already extracted; remaining bulk is state+handlers+copy useMemos -> extract useSettingsState hook and SettingsSidebar component |
| QUAL-13 | email-ui-store.ts (552 lines) split into email-selection-store, email-filter-store | Zustand slice pattern: split actions/state into domain slice files, compose in main store file, re-export all selector hooks |
| QUAL-14 | All resulting frontend files < 400 lines | Verified achievable: each god-file has clear separation points yielding 150-350 line sub-files |
| TEST-07 | Frontend god-file split visual regression -- Playwright screenshot comparison before/after each split | Playwright already configured with e2e/ directory; create screenshot comparison tests per page |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | (installed) | Component framework | Project standard |
| MUI | (installed) | UI components | Project standard |
| Zustand | (installed) | State management | Project standard for email-ui-store |
| @playwright/test | ^1.58.2 | Visual regression testing | Already configured in project |
| TanStack Query | (installed) | Data fetching | Already used in all god-files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand/middleware | (installed) | persist, devtools | Already used in email-ui-store |
| pixelmatch | latest | Screenshot pixel diff | For visual regression comparison in Playwright |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pixelmatch in Playwright | Playwright built-in toHaveScreenshot | Playwright has built-in screenshot comparison with configurable threshold -- prefer this, no extra dependency |
| Custom hook extraction | React context | Hooks are simpler and already the project pattern; context adds provider nesting |

**Installation:**
```bash
# No new packages needed for component splits
# Playwright already installed for visual regression
npx playwright install  # Ensure browsers installed
```

## Architecture Patterns

### Pattern 1: Custom Hook Extraction (for page-level orchestration files)

**What:** Extract state declarations, data loading, and event handlers from god-file components into custom hooks.
**When to use:** Calendar.tsx, Contacts.tsx, Settings.tsx -- where the bulk is orchestration logic, not JSX.

```typescript
// BEFORE: Calendar.tsx (1180 lines)
export function Calendar() {
  // 50+ lines of useState/useRef
  // 100+ lines of useCallback handlers
  // 200+ lines of useEffect data loading
  // 250 lines of JSX
}

// AFTER: Calendar.tsx (~250 lines - JSX + hook consumption)
export function Calendar() {
  const calendarData = useCalendarData();        // ~200 lines
  const handlers = useCalendarHandlers(calendarData); // ~250 lines
  // 250 lines of JSX using calendarData + handlers
}
```

**File structure after split:**
```
components/dashboard/
├── Calendar.tsx              # ~250 lines (JSX orchestrator)
├── calendar/
│   ├── useCalendarData.ts    # ~200 lines (state, queries, WebSocket)
│   └── useCalendarHandlers.ts # ~250 lines (event handlers, mutations)
```

### Pattern 2: Inline Sub-Component Extraction (for files with multiple components)

**What:** Move inline component definitions to their own files.
**When to use:** DashboardContainer.tsx, ContactDetail.tsx, Header.tsx -- where multiple components live in one file.

```typescript
// BEFORE: DashboardContainer.tsx (674 lines)
function WidgetSkeleton() { ... }     // 15 lines
function WidgetCard() { ... }         // 33 lines
function CustomizeDrawer() { ... }    // 160 lines
function EmptyState() { ... }         // 55 lines
function AiQuickAccess() { ... }      // 57 lines
export default function DashboardContainer() { ... } // 155 lines

// AFTER: Each in own file
// DashboardContainer.tsx (~155 lines)
// dashboard/WidgetCard.tsx (~50 lines)
// dashboard/CustomizeDrawer.tsx (~170 lines)
// dashboard/DashboardEmptyState.tsx (~60 lines)
// dashboard/AiQuickAccess.tsx (~60 lines)
// dashboard/WidgetSkeleton.tsx (~20 lines)
```

### Pattern 3: Zustand Store Slicing (for email-ui-store.ts)

**What:** Split Zustand store into domain-focused slice creator functions that compose into the same store.
**When to use:** email-ui-store.ts (QUAL-13).

```typescript
// BEFORE: email-ui-store.ts (552 lines) - monolithic store

// AFTER: Slice files + composer
// stores/email-ui/selection-slice.ts (~80 lines)
export const createSelectionSlice = (set, get) => ({
  selectedIds: new Set<string>(),
  lastSelectedId: null,
  selectEmail: (id) => set({ selectedIds: new Set([id]), lastSelectedId: id, activeEmailId: id }),
  toggleSelection: (id) => set((state) => { /* ... */ }),
  selectRange: (fromId, toId, allIds) => set((state) => { /* ... */ }),
  selectAll: (ids) => set({ /* ... */ }),
  clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),
});

// stores/email-ui/filter-slice.ts (~60 lines)
export const createFilterSlice = (set, get) => ({
  filters: initialFilters,
  setFilters: (filters) => set((state) => ({ /* ... */ })),
  setFolder: (folder) => set({ /* ... */ }),
  setSearch: (search) => set((state) => ({ /* ... */ })),
  clearFilters: () => set({ /* ... */ }),
});

// stores/email-ui-store.ts (~80 lines) - composer + re-exports
import { createSelectionSlice } from './email-ui/selection-slice';
import { createFilterSlice } from './email-ui/filter-slice';
// ... more slices
export const useEmailUIStore = create<EmailUIState>()(
  devtools(persist((set, get) => ({
    ...createSelectionSlice(set, get),
    ...createFilterSlice(set, get),
    ...createViewSlice(set, get),
    ...createComposeSlice(set, get),
    ...createKanbanSlice(set, get),
    ...createSidebarSlice(set, get),
    reset: () => set({ /* all initial states */ }),
  }), persistConfig), devtoolsConfig)
);

// Re-export ALL selector hooks and types from the same path
export { useEmailSelection, useEmailFilters, useEmailCompose, useEmailView, useEmailSidebar, useEmailKanban };
export type { EmailFilters, SpecialFolder, EmailViewMode, ... };
```

**Critical constraint:** All 10+ consumer files import from `@/stores/email-ui-store`. The main store file MUST re-export everything so zero import paths change.

### Pattern 4: Visual Regression Testing with Playwright

**What:** Screenshot comparison before/after splits using Playwright built-in `toHaveScreenshot()`.
**When to use:** TEST-07 -- every page that gets split.

```typescript
// e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression - God File Splits', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API endpoints (same pattern as screenshot-settings.spec.ts)
    await page.route('**/localhost:3000/auth/me', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', email: 'user@test.com', role: 'admin', tenantId: 'tenant-1' }) });
    });
    await page.route('**/localhost:3000/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('calendar page renders identically', async ({ page }) => {
    await page.goto('/dashboard/calendar');
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('calendar.png', { maxDiffPixelRatio: 0.005 });
  });

  test('contacts page renders identically', async ({ page }) => {
    await page.goto('/dashboard/contacts');
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('contacts.png', { maxDiffPixelRatio: 0.005 });
  });

  // ... similar for settings, dashboard
});
```

**Playwright `toHaveScreenshot()` key options:**
- `maxDiffPixelRatio: 0.005` -- matches the <0.5% requirement
- First run generates golden screenshots, subsequent runs compare
- `--update-snapshots` flag to update baselines

### Anti-Patterns to Avoid

- **Breaking barrel exports:** Never change the import path that consumers use. If ContactDetail is imported from `@/components/contacts`, the barrel index.ts must still export it.
- **Prop drilling explosion:** When extracting hooks, pass the hook return object to sub-components, don't destructure into 20+ individual props.
- **Splitting too granularly:** A 150-line utility function does not need its own file. Target the 200-400 line sweet spot per file.
- **Changing component behavior during split:** This is a PURE refactor. No logic changes, no new features, no bug fixes. If you find a bug, log it and move on.
- **Splitting the Zustand store into separate stores:** The requirement says split into files, NOT separate stores. Keep ONE store instance for atomicity of cross-slice operations (e.g., clearSelection when filters change).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screenshot comparison | Custom pixel-diff script | Playwright `toHaveScreenshot()` | Built-in, handles threshold, generates reports, CI-compatible |
| Store slicing | Custom middleware | Zustand slice pattern | Documented pattern in Zustand docs, zero overhead |
| Re-export management | Manual re-exports | Barrel index.ts files | Already used throughout project |

## Common Pitfalls

### Pitfall 1: Stale Closures in Extracted Hooks
**What goes wrong:** Callbacks reference stale state when extracted to a custom hook with different dependency arrays.
**Why it happens:** The original component had closures over local state; extracted hooks need explicit dependencies.
**How to avoid:** Use `useCallback` with correct deps. Use refs for values accessed in event handlers that should not trigger re-renders (pattern already used in Calendar.tsx with `providersRef`).
**Warning signs:** Actions using outdated data, infinite re-render loops.

### Pitfall 2: Zustand Persist Breaking After Store Split
**What goes wrong:** The `partialize` config in persist middleware references state keys that moved to slice files.
**Why it happens:** Persist config is defined at the top level; slices define the state shape.
**How to avoid:** Keep the `partialize` config in the main store file (it already only persists `viewMode` and `kanbanAssignments`). Verify localStorage key `email-ui-storage` still works after split.
**Warning signs:** Console errors on page load, lost view preferences.

### Pitfall 3: Missing Type Re-exports from email-ui-store
**What goes wrong:** Consumer files import types like `SpecialFolder`, `EmailViewMode` from `@/stores/email-ui-store` but the types moved to a slice file.
**Why it happens:** Types defined alongside store actions get moved to slice files.
**How to avoid:** Keep ALL type exports in the main `email-ui-store.ts` file, or define types in a separate `email-ui-types.ts` that both slices and consumers import from.
**Warning signs:** TypeScript compilation errors in 10+ files.

### Pitfall 4: Circular Imports Between Extracted Components
**What goes wrong:** Extracted sub-component imports a type from the parent component, parent imports the sub-component.
**Why it happens:** Types were co-located with the parent component.
**How to avoid:** Move shared types to a separate types file or the barrel index. Never import from parent in child.
**Warning signs:** Webpack circular dependency warnings.

### Pitfall 5: Screenshot Baseline Flakiness
**What goes wrong:** Screenshots differ due to animation timing, font rendering, or async data loading.
**Why it happens:** Playwright captures at different moments; CSS transitions not complete.
**How to avoid:** Mock all API endpoints to return deterministic data. Use `waitForTimeout` or `waitForLoadState('networkidle')`. Disable animations in test CSS if needed. Use the `maxDiffPixelRatio` threshold.
**Warning signs:** Intermittent test failures with tiny pixel differences.

## Code Examples

### Custom Hook Extraction Pattern (Calendar.tsx)

```typescript
// hooks/useCalendarData.ts
// Source: extracted from Calendar.tsx lines 92-170 (state declarations + query hooks)
import { useState, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCalendars, useCreateCalendarEvent, /* ... */ } from '@/hooks/queries/use-calendar';
import { useCalendarStore } from '@/stores/calendar-store';

export function useCalendarData() {
  const calendarRef = useRef<any>(null);
  const [currentMonth, setCurrentMonth] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [viewType, setViewType] = useState<CalendarViewType>('month');
  // ... all state declarations

  const { data: calendarsData, refetch: refetchCalendars } = useCalendars();
  const createEventMutation = useCreateCalendarEvent();
  // ... all query hooks

  const {
    events: storeEvents,
    setEvents: setStoreEvents,
    // ...
  } = useCalendarStore();

  return {
    calendarRef, currentMonth, setCurrentMonth, currentYear, setCurrentYear,
    viewType, setViewType, storeEvents, calendarsData,
    createEventMutation, /* ... all needed values */
  };
}
```

### Zustand Slice Pattern (email-ui-store)

```typescript
// stores/email-ui/types.ts
// All shared types live here -- both slices and consumers import from here
export type KanbanColumnId = 'inbox' | 'to-reply' | 'following-up' | 'done';
export type EmailViewMode = 'list' | 'thread' | 'kanban';
export type EmailDensity = 'compact' | 'comfortable' | 'spacious';
export type SpecialFolder = /* ... */;
export interface EmailFilters { /* ... */ }
export interface SidebarConfig { /* ... */ }
export interface ComposeState { /* ... */ }

// stores/email-ui/selection-slice.ts
import type { EmailUIState } from './types';
type SetState = (fn: (state: EmailUIState) => Partial<EmailUIState> | Partial<EmailUIState>) => void;

export const createSelectionSlice = (set: SetState) => ({
  selectedIds: new Set<string>(),
  lastSelectedId: null as string | null,
  selectEmail: (id: string) => set({ selectedIds: new Set([id]), lastSelectedId: id, activeEmailId: id }),
  // ... rest of selection actions
});
```

### Playwright Visual Regression

```typescript
// e2e/visual-regression-splits.spec.ts
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

// Reusable mock setup
async function mockAllAPIs(page) {
  await page.route('**/localhost:3000/auth/me', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', email: 'test@test.com', firstName: 'Test', lastName: 'User', role: 'admin', tenantId: 't1' }) });
  });
  await page.route('**/localhost:3000/**', (route) => {
    if (!route.request().url().includes('auth/me')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });
}

test('settings page', async ({ page }) => {
  await mockAllAPIs(page);
  await page.goto('/dashboard/settings');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('settings.png', { maxDiffPixelRatio: 0.005 });
});
```

## File-by-File Split Analysis

### Calendar.tsx (1180 lines -> ~250 + hooks)

**Current state:** Already extracts CalendarSidebar, CalendarHeader, CalendarEventDialog, CalendarEventDetail. The 1180-line file is the orchestration component.

**Breakdown of remaining content:**
| Section | Lines | Extract To |
|---------|-------|------------|
| State declarations + query hooks | ~80 | `useCalendarData.ts` |
| WebSocket subscriptions + data loading | ~200 | `useCalendarData.ts` |
| Event handlers (CRUD, drag-drop, select) | ~250 | `useCalendarHandlers.ts` |
| Calendar preference management | ~100 | `useCalendarPreferences.ts` |
| Utility functions (convertToFullCalendarEvent) | ~30 | `useCalendarData.ts` |
| JSX layout (sidebar + grid + dialogs) | ~250 | remains in `Calendar.tsx` |
| Constants (CALENDAR_COLORS) | ~10 | `calendar-constants.ts` |

**Result:** Calendar.tsx ~250 lines, 3 hook files ~130-250 lines each.

### Contacts.tsx (1021 lines -> ~200 + hooks)

**Current state:** Already uses ContactList, ContactSidebar, ContactDetail, ContactBulkActionBar. The 1021-line file is the orchestration page.

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| State declarations + query hooks | ~80 | `useContactsPageData.ts` |
| WebSocket subscriptions + data loading | ~200 | `useContactsPageData.ts` |
| Dialog state + CRUD handlers | ~250 | `useContactsPageHandlers.ts` |
| Contact form state + validation | ~100 | `useContactForm.ts` |
| JSX layout + dialog rendering | ~200 | remains in `Contacts.tsx` |
| Utility functions (getPrimaryEmail, etc.) | ~20 | `contacts-utils.ts` |

**Result:** Contacts.tsx ~200 lines, 3 hook files ~100-250 lines each.

### Header.tsx (799 lines -> ~200 + sub-components)

**Current state:** All sub-features (user menu, notifications, AI actions, language selector) are inline in one component.

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| UserMenu (profile menu dropdown) | ~120 | `UserMenu.tsx` |
| NotificationBell (notification dropdown) | ~80 | `NotificationBell.tsx` |
| AiActionsBell (pending actions dropdown) | ~150 | `AiActionsBell.tsx` |
| LanguageMenu (locale switcher) | ~60 | `LanguageMenu.tsx` |
| Module-level throttle + helpers | ~30 | `header-utils.ts` |
| Main Header JSX (AppBar + Toolbar) | ~200 | remains in `Header.tsx` |
| Types + interfaces | ~15 | `header-types.ts` or inline |

**Result:** Header.tsx ~200 lines, 4 sub-component files ~60-150 lines each.

### ContactDetail.tsx (720 lines -> ~250 + sub-components)

**Current state:** Contains ProviderIcon, InteractionList, TabPanel, utility functions, and main ContactDetail.

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| ProviderIcon component | ~55 | `ProviderIcon.tsx` (shared, already used elsewhere conceptually) |
| InteractionList component | ~130 | `ContactActivityFeed.tsx` |
| TabPanel helper | ~8 | inline or shared util |
| Utility functions (formatDate, etc.) | ~35 | `contact-detail-utils.ts` |
| ContactDetail header (avatar, actions) | ~80 | remains in `ContactDetail.tsx` |
| Details tab (emails, phones, addresses, etc.) | ~270 | `ContactInfoPanel.tsx` |
| Activity tab | ~10 | remains (just renders ContactActivityFeed) |
| Notes tab | ~15 | `ContactNotesTab.tsx` |

**Result:** ContactDetail.tsx ~200 lines, 3 sub-component files ~55-270 lines each.

### DashboardContainer.tsx (674 lines -> ~155 + sub-components)

**Current state:** Contains 5 inline sub-components + the main export.

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| Widget registry + config | ~75 | `dashboard/widget-registry.ts` |
| WidgetSkeleton | ~15 | `dashboard/WidgetSkeleton.tsx` |
| WidgetCard | ~35 | `dashboard/WidgetCard.tsx` |
| CustomizeDrawer | ~160 | `dashboard/CustomizeDrawer.tsx` |
| EmptyState | ~55 | `dashboard/DashboardEmptyState.tsx` |
| AiQuickAccess | ~55 | `dashboard/AiQuickAccess.tsx` |
| Main DashboardContainer | ~155 | remains in `DashboardContainer.tsx` |

**Result:** DashboardContainer.tsx ~155 lines, 5 sub-component files ~15-160 lines each.

### Settings.tsx (661 lines -> ~200 + hooks)

**Current state:** Most section components already extracted (GeneralSettings, AiSettings, AccountsSettings, AccountSettings, SignatureSettings, etc.). The remaining bulk is state management and copy-building useMemos.

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| State declarations + query hooks | ~65 | `useSettingsState.ts` |
| Copy-building useMemos (general, ai, accounts, etc.) | ~120 | `useSettingsCopy.ts` |
| Handler functions (save, sync, delete, avatar) | ~150 | `useSettingsHandlers.ts` |
| Sidebar navigation (sections list + rendering) | ~60 | `SettingsSidebar.tsx` |
| Section rendering JSX | ~90 | remains in `Settings.tsx` |
| Image resize utility | ~50 | `settings-utils.ts` |

**Result:** Settings.tsx ~200 lines, 3 hook files ~65-150 lines each, 1 component ~60 lines.

### email-ui-store.ts (552 lines -> ~80 + slices)

**Breakdown:**
| Section | Lines | Extract To |
|---------|-------|------------|
| Type definitions | ~65 | `email-ui/email-ui-types.ts` |
| Initial state constants | ~15 | `email-ui/email-ui-types.ts` |
| Selection actions | ~50 | `email-ui/selection-slice.ts` |
| View actions | ~20 | `email-ui/view-slice.ts` |
| Filter actions | ~30 | `email-ui/filter-slice.ts` |
| Compose actions | ~45 | `email-ui/compose-slice.ts` |
| Pending/AI actions | ~20 | `email-ui/pending-slice.ts` |
| Sidebar actions | ~35 | `email-ui/sidebar-slice.ts` |
| Kanban actions | ~40 | `email-ui/kanban-slice.ts` |
| Store composition + persist | ~40 | remains in `email-ui-store.ts` |
| Selector hooks | ~50 | remains in `email-ui-store.ts` (consumers import from here) |

**Result:** email-ui-store.ts ~80 lines (composer + selectors + re-exports), types file ~80 lines, 5-7 slice files ~20-50 lines each.

**Key constraint:** All consumer imports (`import { useEmailUIStore, useEmailFilters, type SpecialFolder } from '@/stores/email-ui-store'`) must continue to work. The main file re-exports everything.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts --project=chromium` |
| Full suite command | `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-07 | Calendar renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "calendar"` | Wave 0 |
| QUAL-08 | Contacts renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "contacts"` | Wave 0 |
| QUAL-09 | Header renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "header"` | Wave 0 |
| QUAL-10 | ContactDetail renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "contact detail"` | Wave 0 |
| QUAL-11 | Dashboard renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "dashboard"` | Wave 0 |
| QUAL-12 | Settings renders identically after split | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts -g "settings"` | Wave 0 |
| QUAL-13 | email-ui-store consumers unchanged | unit/type-check | `cd frontend && npx tsc --noEmit` | Existing |
| QUAL-14 | All files < 400 lines | script | `wc -l [all split files] | awk '{if ($1 > 400) print}'` | Wave 0 |
| TEST-07 | Playwright screenshot diff < 0.5% | visual-regression | `npx playwright test e2e/visual-regression-splits.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type check)
- **Per wave merge:** `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts --project=chromium`
- **Phase gate:** Full Playwright suite green + line count verification

### Wave 0 Gaps
- [ ] `frontend/e2e/visual-regression-splits.spec.ts` -- covers TEST-07, QUAL-07 through QUAL-12
- [ ] Golden screenshots baseline (generated on first Playwright run before any splits)
- [ ] Line count verification script (simple wc -l check)

## Execution Order Recommendation

The planner should order splits from lowest-risk to highest-risk:

1. **DashboardContainer.tsx** (674 lines) -- simplest: just move inline components to own files, no hook extraction needed
2. **ContactDetail.tsx** (720 lines) -- straightforward: extract 3 inline sub-components
3. **Header.tsx** (799 lines) -- medium: extract 4 inline sub-components with their state
4. **email-ui-store.ts** (552 lines) -- medium: Zustand slice pattern, must preserve API
5. **Settings.tsx** (661 lines) -- medium: extract hooks (state is complex but sections already extracted)
6. **Contacts.tsx** (1021 lines) -- harder: complex orchestration with WebSocket, data loading, dialogs
7. **Calendar.tsx** (1180 lines) -- hardest: most complex orchestration, FullCalendar integration, WebSocket

**Rationale:** Start with files where splits are mechanical (move inline components), build confidence, then tackle the complex hook extractions.

## Consumer Impact Analysis

| God-File | Consumers | Import Path | Risk |
|----------|-----------|-------------|------|
| Calendar.tsx | 1 (pages/dashboard/calendar.tsx) | `@/components/dashboard/Calendar` | LOW -- single consumer |
| Contacts.tsx | 1 (pages/dashboard/contacts.tsx) | `@/components/dashboard/Contacts` | LOW -- single consumer |
| Header.tsx | 1 (components/layout/Layout.tsx) | `./Header` | LOW -- single consumer |
| ContactDetail.tsx | 1 (components/contacts/index.ts barrel) | `@/components/contacts` | LOW -- barrel re-export |
| DashboardContainer.tsx | 1 (pages/dashboard/index.tsx) | `@/components/dashboard/DashboardContainer` | LOW -- single consumer |
| Settings.tsx | 1 (pages/dashboard/settings.tsx) | `@/components/dashboard/Settings` | LOW -- single consumer |
| email-ui-store.ts | 10+ files | `@/stores/email-ui-store` | **HIGH** -- must preserve all exports |

## Open Questions

1. **Playwright browser availability in CI/local**
   - What we know: Playwright is installed, e2e tests exist, config points to localhost:3001
   - What's unclear: Whether the full app can be started for screenshots in the split workflow (needs both backend and frontend running)
   - Recommendation: Use API route mocking (as in existing screenshot-settings.spec.ts) to avoid needing a running backend. Screenshots compare layout/styling, not data.

2. **ContactDetail barrel export**
   - What we know: ContactDetail is exported from `@/components/contacts/index.ts` barrel
   - What's unclear: Whether new sub-components (ContactInfoPanel, ContactActivityFeed) should also be exported from the barrel
   - Recommendation: Only export them from barrel if they have external consumers. Currently they are internal to ContactDetail, so no barrel export needed.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all 7 god-files (line counts, exports, consumers, structure)
- Phase 43 research and execution (backend god-file split patterns, facade pattern precedent)
- Existing Playwright config and e2e tests in the project

### Secondary (MEDIUM confidence)
- Zustand slice pattern (documented in Zustand GitHub docs)
- Playwright `toHaveScreenshot()` API (built-in since Playwright 1.22+)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used
- Architecture: HIGH -- patterns directly observed in codebase + Phase 43 precedent
- Pitfalls: HIGH -- derived from actual file analysis, not theoretical
- File split analysis: HIGH -- based on line-by-line reading of all 7 files

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- refactoring patterns don't change)
