# Phase 135: Sidebar Reduction & Route Preservation - Research

**Researched:** 2026-04-01
**Domain:** Frontend navigation UI (React, MUI, @dnd-kit)
**Confidence:** HIGH

## Summary

This phase rewrites `Sidebar.tsx` (629 lines) from a multi-section, 17-item, collapsible sidebar into a fixed-width 64px icon rail showing 5+1 pillar icons with DnD reorder. On mobile, the temporary Drawer overlay is replaced with a fixed bottom tab bar. All 17 routes remain functional via direct URL; only sidebar visibility changes.

The work is entirely frontend, constrained to ~6 files. No backend changes, no route deletions, no API calls. The main complexity is: (1) collapsing the multi-section DnD architecture into a single-section icon rail, (2) replacing mobile Drawer with a bottom tab bar, (3) cleaning up Layout.tsx props that no longer apply, and (4) localStorage migration for stale keys.

**Primary recommendation:** Rewrite Sidebar.tsx from scratch (it becomes ~150-200 lines), simplify useSidebarOrder to remove the section parameter, update Layout.tsx to remove collapsed/toggle state, and add a new MobileTabBar component using MUI BottomNavigation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Sidebar shows 5 pillars: Home, Mail, Calendar, Contacts, Tasks -- plus Settings at the bottom
- D-02: Home pillar stays as the first item, links to existing `/dashboard` page with current widgets unchanged
- D-03: Tasks pillar links to `/dashboard/tasks` -- a placeholder "Coming soon" page until Phase 138 builds the real Tasks page
- D-04: Tasks icon: `CheckSquare` from lucide-react
- D-05: Pillar order: Home > Mail > Calendar > Contacts > Tasks (Home first)
- D-06: No section headers -- flat list of pillar icons, no "Navigation"/"CRM"/"AI" labels
- D-07: Home dashboard page content left completely untouched (Phase 145 will redesign it)
- D-08: All 13 removed routes (10 CRM + 3 AI) remain accessible by direct URL only -- no sidebar entry, no hints, no transitional UI
- D-09: All existing `pages/*.tsx` files stay. No pages deleted, no redirects, no feature flags. Routes render normally when visited by URL.
- D-10: Command Palette (Phase 136) will restore discoverability -- this phase accepts the brief gap
- D-11: Desktop sidebar becomes icon-rail-only (always 64px collapsed). Remove the expanded text mode (220px) and the expand/collapse toggle entirely.
- D-12: Mobile navigation changes from temporary Drawer overlay to a fixed bottom tab bar showing 5 pillar icons + Settings. Native app feel, always visible.
- D-13: DnD reordering preserved -- users can drag to reorder their 5 pillar icons in the rail
- D-14: PMSync logo (32px icon) stays at top of the rail
- D-15: On first load after deploy, detect and remove stale localStorage keys: `pmsync:sidebar-order-crm`, `pmsync:sidebar-order-ai`. The `pmsync:sidebar-order-main` key is auto-invalidated by the existing validation logic in `useSidebarOrder` (mismatched href sets -> reset to defaults).
- D-16: Refactor `useSidebarOrder` hook from multi-section to single-section. Remove the `section` parameter concept -- just manages one `pillars` list.

### Claude's Discretion
- Visual polish of icon rail spacing, active indicator style, and tooltip behavior
- Bottom tab bar specific styling and animation on mobile
- Placeholder page design for `/dashboard/tasks`

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | User sees only 4 pillars in sidebar: Mail, Calendar, Contacts, Tasks + Settings | Sidebar.tsx rewrite removes 13 CRM/AI items, shows 5 pillar icons (Home, Mail, Calendar, Contacts, Tasks) + Settings. Note: CONTEXT.md D-01 adds Home as 5th pillar beyond the 4 in the requirement. |
| NAV-06 | User can still deep-link to any CRM page directly (URLs remain functional) | All page files in `pages/dashboard/crm/` and `pages/dashboard/ai/` stay untouched. Next.js file-based routing means routes work as long as files exist. No deletions needed. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mui/material | 7.3.7 | UI components (BottomNavigation, Drawer, Tooltip) | Project standard |
| @dnd-kit/core | 6.3.1 | Drag-and-drop context | Already used in Sidebar.tsx |
| @dnd-kit/sortable | 10.0.0 | Sortable list for pillar reorder | Already used in Sidebar.tsx |
| lucide-react | (installed) | Icons: Home, Mail, Calendar, Users, CheckSquare, Settings | Already used |
| next/router | (Next.js 16) | Route detection for active state | Already used |

### No New Dependencies
This phase requires zero new npm packages. Everything needed is already installed.

## Architecture Patterns

### Current File Structure (will change)
```
frontend/
  components/layout/
    Sidebar.tsx          # 629 lines -> rewrite to ~150 lines (icon rail only)
    Layout.tsx           # 195 lines -> simplify props (~-20 lines)
    Header.tsx           # Mobile hamburger -> remove for mobile
  hooks/
    use-sidebar-order.ts # 66 lines -> simplify to single-section (~50 lines)
  pages/dashboard/
    tasks.tsx            # Existing page -> update to "coming soon" placeholder
  locales/
    en.ts, it.ts         # Keep nav.* keys, no removals needed
```

### New File
```
frontend/
  components/layout/
    MobileTabBar.tsx     # NEW: ~80-100 lines, bottom tab bar for mobile
```

### Pattern 1: Icon Rail (Desktop)
**What:** Fixed 64px permanent Drawer with vertical icon list, tooltips on hover, DnD reorder.
**When:** `useMediaQuery(theme.breakpoints.up('md'))` (desktop/tablet)

The current Sidebar already has a `RAIL_WIDTH = 64` constant and a collapsed mode that renders icon-only with tooltips. The rewrite essentially makes this the ONLY mode -- remove the expanded (220px) branch, the `collapsed` prop, and the toggle button.

Key reusable pieces from current Sidebar.tsx:
- `activeBg`, `activeGlow`, `activeBorder` gradient computations (lines 145-153)
- Active pill left-border indicator (lines 243-255)
- Icon color transition on active state (lines 257-269)
- Tooltip wrapping for collapsed items (lines 292-298)

### Pattern 2: Bottom Tab Bar (Mobile)
**What:** Fixed position bar at bottom with 6 icons (5 pillars + Settings). Replaces temporary Drawer.
**When:** `useMediaQuery(theme.breakpoints.down('md'))` (mobile)

MUI provides `BottomNavigation` and `BottomNavigationAction` components -- confirmed available in MUI 7.3.7. These handle:
- Fixed bottom positioning
- Active state highlighting
- Icon + optional label rendering
- `onChange` with value tracking

However, MUI's BottomNavigation does NOT support DnD natively. Per D-13, DnD reordering is for "pillar icons in the rail" -- the desktop rail. Mobile bottom tab bars do not conventionally support DnD reorder, and the decision text says "5 pillar icons in the rail" specifically. DnD on mobile bottom bar would be unusual and likely undesirable. The planner should implement DnD for desktop rail only, and render a static order bottom tab bar on mobile.

### Pattern 3: localStorage Migration
**What:** One-time cleanup of stale sidebar ordering keys.
**When:** On hook initialization (useSidebarOrder or a dedicated migration effect).

Current localStorage keys:
- `pmsync:sidebar-order-main` -- will auto-invalidate (href set changes from 4 items to 5)
- `pmsync:sidebar-order-crm` -- must be explicitly removed
- `pmsync:sidebar-order-ai` -- must be explicitly removed
- `pmsync:sidebar-order-sections` -- must be explicitly removed (sections concept removed)

The existing validation logic in useSidebarOrder (lines 22-31) already handles mismatched href sets by resetting to defaults. So `sidebar-order-main` will self-heal when the default order changes from `['/dashboard', '/dashboard/email', '/dashboard/calendar', '/dashboard/contacts']` to `['/dashboard', '/dashboard/email', '/dashboard/calendar', '/dashboard/contacts', '/dashboard/tasks']`.

For the stale keys, add a cleanup in the hook init or a separate `useEffect` in Layout.

### Anti-Patterns to Avoid
- **Deleting page files:** Routes must stay functional. Never remove files from `pages/dashboard/crm/` or `pages/dashboard/ai/`.
- **Conditional route rendering:** No feature flags or redirects on hidden routes. They just work.
- **Removing translation keys:** CRM/AI nav keys (`nav.crmAccounts`, etc.) may be used elsewhere (breadcrumbs, page titles). Keep all `nav.*` keys.
- **Custom bottom bar from scratch:** Use MUI BottomNavigation, don't hand-roll a custom fixed-position bar.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom tab bar | Custom fixed-position `Box` with manual touch handling | MUI `BottomNavigation` + `BottomNavigationAction` | Handles active state, accessibility, theming |
| Tooltip on icon rail | Custom hover div | MUI `Tooltip` with `placement="right"` | Already used in current collapsed mode |
| DnD reorder | Custom drag handlers | `@dnd-kit/core` + `@dnd-kit/sortable` | Already installed and proven in current sidebar |
| Active route detection | Manual pathname comparison | `useRouter().pathname === href` | Existing pattern in Sidebar.tsx |

## Common Pitfalls

### Pitfall 1: Layout.tsx content offset miscalculation
**What goes wrong:** After removing the collapsible width, the content area doesn't account for the fixed 64px rail, causing overlap or gap.
**Why it happens:** Layout.tsx currently uses `flexGrow: 1` which should auto-fill, but the Drawer's `width` prop affects flex layout. The permanent Drawer takes `drawerWidth` which was dynamic (64 or 220). Now it's always 64.
**How to avoid:** Verify the permanent Drawer's `width` is hardcoded to 64 in both the `sx` prop and the Drawer paper styles. The content area uses `flexGrow: 1` so it should auto-adjust, but test on multiple viewport widths.
**Warning signs:** Content visually shifts or clips at the left edge.

### Pitfall 2: Mobile bottom bar overlapping page content
**What goes wrong:** The bottom tab bar overlaps the bottom of page content because no bottom padding is added.
**Why it happens:** Bottom tab bars need the page content to have `paddingBottom` equal to the tab bar height (~56px).
**How to avoid:** Add `pb: { xs: '56px', md: 0 }` to the main content Box in Layout.tsx when on mobile. Or use a spacer Box.
**Warning signs:** Last item in any list page is cut off on mobile.

### Pitfall 3: Header hamburger menu still rendering on mobile
**What goes wrong:** The hamburger icon in Header.tsx still shows on mobile, opening nothing (since Drawer is removed).
**Why it happens:** Header.tsx line 104 renders `MenuIcon` when `isMobile` is true, calling `onMenuClick` which toggles `mobileOpen` state in Layout.tsx -- but nothing consumes that state anymore.
**How to avoid:** Remove the hamburger button from Header.tsx for mobile, and remove `mobileOpen`/`handleMobileDrawerToggle` state from Layout.tsx.
**Warning signs:** Orphan hamburger icon on mobile header with no function.

### Pitfall 4: DnD context nesting removed incorrectly
**What goes wrong:** Current Sidebar has nested DndContexts (one for sections, one per item group). Removing section-level DnD but keeping item-level DnD requires careful cleanup.
**Why it happens:** The `SortableSectionBlock` component has its own `DndContext` nested inside the outer sections DndContext. With sections gone, only one DndContext is needed.
**How to avoid:** Single `DndContext` wrapping a single `SortableContext` with the 5 pillar hrefs as items.
**Warning signs:** DnD doesn't activate, or items snap to wrong positions.

### Pitfall 5: `useSidebarOrder` section parameter removal breaks callers
**What goes wrong:** Other code may import `useSidebarOrder` with the section parameter.
**Why it happens:** If any other component calls `useSidebarOrder('main', ...)` the refactored hook (no section param) will break.
**How to avoid:** Search for all imports of `useSidebarOrder` before refactoring. Currently only `Sidebar.tsx` imports it (verified via grep).
**Warning signs:** TypeScript errors after refactoring the hook signature.

### Pitfall 6: Tasks page already exists but renders follow-ups
**What goes wrong:** The existing `tasks.tsx` page renders `<Tasks />` which is actually a follow-up tracker component, not a "coming soon" placeholder.
**Why it happens:** Per D-03, Tasks should be a placeholder. But there's already a real component at `components/dashboard/Tasks.tsx`.
**How to avoid:** Decision D-03 says "placeholder 'Coming soon' page until Phase 138." The planner needs to decide: replace the existing Tasks component with a placeholder, or leave it as-is since it already works. The context says "placeholder" explicitly, so the existing functional component should be kept as-is -- it's already a tasks-like experience. The "Coming soon" aspect was about Phase 138 building the REAL unified tasks page. The current page is good enough to not need a placeholder.
**Warning signs:** None -- existing page is functional.

## Code Examples

### Icon Rail Item (Desktop)
```tsx
// Derived from current Sidebar.tsx collapsed mode (lines 155-298)
// Simplified: no expanded mode, no section headers, no drag handle icon

const PILLAR_ITEMS = [
  { href: '/dashboard', icon: <Home size={24} strokeWidth={1.7} />, labelKey: 'home' },
  { href: '/dashboard/email', icon: <Mail size={24} strokeWidth={1.7} />, labelKey: 'mail' },
  { href: '/dashboard/calendar', icon: <Calendar size={24} strokeWidth={1.7} />, labelKey: 'calendar' },
  { href: '/dashboard/contacts', icon: <Users size={24} strokeWidth={1.7} />, labelKey: 'contacts' },
  { href: '/dashboard/tasks', icon: <CheckSquare size={24} strokeWidth={1.7} />, labelKey: 'tasks' },
];

// Each item: Tooltip wrapping a Link with icon, active state gradient
<Tooltip title={t.nav[item.labelKey]} placement="right" arrow>
  <Box component={Link} href={item.href} sx={{
    width: 44, height: 44, mx: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '12px',
    background: active ? activeBg : 'transparent',
    // ... active border, glow, hover styles from current code
  }}>
    {item.icon}
  </Box>
</Tooltip>
```

### MUI BottomNavigation (Mobile)
```tsx
// MUI 7 BottomNavigation -- confirmed available
import { BottomNavigation, BottomNavigationAction } from '@mui/material';

<BottomNavigation
  value={currentPath}
  onChange={(_, newValue) => router.push(newValue)}
  sx={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: theme.zIndex.appBar,
    borderTop: '1px solid',
    borderColor: alpha(theme.palette.divider, 0.1),
    height: 56,
  }}
>
  {pillars.map((item) => (
    <BottomNavigationAction
      key={item.href}
      value={item.href}
      icon={item.icon}
      label={t.nav[item.labelKey]}
      showLabel={false}
    />
  ))}
  <BottomNavigationAction
    value="/dashboard/settings"
    icon={<Settings size={24} />}
    label={t.nav.settings}
    showLabel={false}
  />
</BottomNavigation>
```

### Simplified useSidebarOrder
```tsx
// Remove section parameter, single localStorage key
const STORAGE_KEY = 'pmsync:sidebar-order-pillars';

export function useSidebarOrder(defaultOrder: string[]) {
  // Same validation logic as current (lines 15-36)
  // Same handleReorder with arrayMove (lines 38-54)
  // Add cleanup of stale keys on init
  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultOrder;
    // Cleanup stale keys (D-15)
    ['crm', 'ai', 'main', 'sections'].forEach((key) => {
      localStorage.removeItem(`pmsync:sidebar-order-${key}`);
    });
    // ... rest of init logic with new key
  });
}
```

### localStorage Migration (D-15)
```tsx
// One-time cleanup -- safe to run every load (removeItem on non-existent key is a no-op)
const STALE_KEYS = [
  'pmsync:sidebar-order-main',
  'pmsync:sidebar-order-crm',
  'pmsync:sidebar-order-ai',
  'pmsync:sidebar-order-sections',
];
STALE_KEYS.forEach((key) => localStorage.removeItem(key));
```

## Scope Inventory

### Files to Modify
| File | Change | Lines Impact |
|------|--------|-------------|
| `frontend/components/layout/Sidebar.tsx` | Rewrite: icon rail only, single DndContext, 5 pillars + Settings | 629 -> ~180 |
| `frontend/hooks/use-sidebar-order.ts` | Simplify: remove section param, new storage key, stale cleanup | 66 -> ~55 |
| `frontend/components/layout/Layout.tsx` | Remove collapsed/toggle state, remove mobileOpen state, add mobile bottom padding | ~15 lines changed |
| `frontend/components/layout/Header.tsx` | Remove mobile hamburger menu button | ~5 lines removed |
| `frontend/locales/en.ts` | No changes needed (nav keys kept) | 0 |
| `frontend/locales/it.ts` | No changes needed (nav keys kept) | 0 |

### Files to Create
| File | Purpose | Lines |
|------|---------|-------|
| `frontend/components/layout/MobileTabBar.tsx` | Bottom tab bar for mobile | ~80-100 |

### Files NOT to Touch
- All `pages/dashboard/**/*.tsx` files -- routes stay as-is
- `frontend/theme/appTheme.ts` -- no theme changes needed
- All backend files -- purely frontend phase

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + @testing-library/react 16.3.2 |
| Config file | `frontend/jest.config.ts` (exists) |
| Quick run command | `cd frontend && npx jest --testPathPattern="sidebar\|layout\|tab-bar" --no-coverage` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Sidebar renders exactly 5 pillar icons + Settings | unit | `cd frontend && npx jest components/layout/Sidebar.test.tsx -x` | Wave 0 |
| NAV-01 | Mobile renders bottom tab bar with 5+1 items | unit | `cd frontend && npx jest components/layout/MobileTabBar.test.tsx -x` | Wave 0 |
| NAV-06 | CRM/AI routes still resolve (pages exist, no 404) | manual-only | Verify page files exist in `pages/dashboard/crm/` and `pages/dashboard/ai/` | N/A (file existence check) |
| NAV-01 | DnD reorder works on desktop icon rail | unit | `cd frontend && npx jest components/layout/Sidebar.test.tsx -t "reorder" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/components/layout/__tests__/Sidebar.test.tsx` -- covers NAV-01 (pillar count, icons, no section headers)
- [ ] `frontend/components/layout/__tests__/MobileTabBar.test.tsx` -- covers NAV-01 mobile variant
- [ ] `frontend/hooks/__tests__/use-sidebar-order.test.ts` -- covers D-16 (single section), D-15 (stale key cleanup)

## Sources

### Primary (HIGH confidence)
- `frontend/components/layout/Sidebar.tsx` -- read in full (629 lines), all patterns documented
- `frontend/components/layout/Layout.tsx` -- read in full (195 lines), integration points identified
- `frontend/components/layout/Header.tsx` -- read relevant sections (hamburger menu)
- `frontend/hooks/use-sidebar-order.ts` -- read in full (66 lines)
- `frontend/locales/en.ts`, `frontend/locales/index.ts` -- nav key structure verified
- MUI BottomNavigation -- confirmed available via require() test on installed @mui/material 7.3.7
- @dnd-kit packages -- versions confirmed from package.json (core 6.3.1, sortable 10.0.0)

### Secondary (MEDIUM confidence)
- MUI BottomNavigation API specifics (component exists, standard usage pattern assumed from MUI docs)

## Project Constraints (from CLAUDE.md)

- **Post-edit validation mandatory:** `cd frontend && npx tsc --noEmit` after every file edit
- **Translations first:** Add any new i18n keys before writing components. Use `t.section.key`, never hardcode strings.
- **MUI theme only:** No hardcoded colors/CSS. Use MUI theme `sx` props.
- **Max 500 lines per file:** Sidebar.tsx rewrite must stay under 500 (target: ~180).
- **No Tailwind utilities:** Pure MUI.
- **Follow existing patterns:** Reuse existing active state gradients, icon sizing, router matching.
- **Scope control:** Do exactly what was asked -- no unrequested features or improvements.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed, versions verified
- Architecture: HIGH -- current code fully read, rewrite path clear
- Pitfalls: HIGH -- derived from actual code analysis, not speculation

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable frontend, no external API dependencies)
