# Phase 135: Sidebar Reduction & Route Preservation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Collapse the current 17-item sidebar (4 main + 10 CRM + 3 AI) down to 5 pillars (Home, Mail, Calendar, Contacts, Tasks) + Settings as an icon-only rail. All existing routes remain functional via URL. No page files are deleted. No content changes to existing pages.

</domain>

<decisions>
## Implementation Decisions

### Pillar Mapping
- **D-01:** Sidebar shows 5 pillars: Home, Mail, Calendar, Contacts, Tasks — plus Settings at the bottom
- **D-02:** Home pillar stays as the first item, links to existing `/dashboard` page with current widgets unchanged
- **D-03:** Tasks pillar links to `/dashboard/tasks` — a placeholder "Coming soon" page until Phase 138 builds the real Tasks page
- **D-04:** Tasks icon: `CheckSquare` from lucide-react
- **D-05:** Pillar order: Home > Mail > Calendar > Contacts > Tasks (Home first)
- **D-06:** No section headers — flat list of pillar icons, no "Navigation"/"CRM"/"AI" labels
- **D-07:** Home dashboard page content left completely untouched (Phase 145 will redesign it)

### Hidden Route Discovery
- **D-08:** All 13 removed routes (10 CRM + 3 AI) remain accessible by direct URL only — no sidebar entry, no hints, no transitional UI
- **D-09:** All existing `pages/*.tsx` files stay. No pages deleted, no redirects, no feature flags. Routes render normally when visited by URL.
- **D-10:** Command Palette (Phase 136) will restore discoverability — this phase accepts the brief gap

### Sidebar Density & Layout
- **D-11:** Desktop sidebar becomes icon-rail-only (always 64px collapsed). Remove the expanded text mode (220px) and the expand/collapse toggle entirely.
- **D-12:** Mobile navigation changes from temporary Drawer overlay to a fixed bottom tab bar showing 5 pillar icons + Settings. Native app feel, always visible.
- **D-13:** DnD reordering preserved — users can drag to reorder their 5 pillar icons in the rail
- **D-14:** PMSync logo (32px icon) stays at top of the rail

### Migration Cleanup
- **D-15:** On first load after deploy, detect and remove stale localStorage keys: `pmsync:sidebar-order-crm`, `pmsync:sidebar-order-ai`. The `pmsync:sidebar-order-main` key is auto-invalidated by the existing validation logic in `useSidebarOrder` (mismatched href sets → reset to defaults).
- **D-16:** Refactor `useSidebarOrder` hook from multi-section to single-section. Remove the `section` parameter concept — just manages one `pillars` list.

### Claude's Discretion
- Visual polish of icon rail spacing, active indicator style, and tooltip behavior
- Bottom tab bar specific styling and animation on mobile
- Placeholder page design for `/dashboard/tasks`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Navigation & Layout
- `frontend/components/layout/Sidebar.tsx` — Current 17-item sidebar with 3 sortable sections, DnD, collapsed/expanded modes (580 lines — will be significantly rewritten)
- `frontend/components/layout/Layout.tsx` — Parent layout wrapping sidebar + content area
- `frontend/hooks/use-sidebar-order.ts` — localStorage-backed sidebar ordering hook (to be simplified)

### Routes
- `frontend/pages/dashboard/` — All existing dashboard routes (must be preserved, not deleted)
- `frontend/pages/dashboard/tasks.tsx` — Existing tasks page file (placeholder target)

### Translations
- `frontend/locales/en.ts` — `nav.*` keys for sidebar labels
- `frontend/locales/it.ts` — Italian translations

### Theme
- `frontend/theme/appTheme.ts` — MUI theme with primary teal, brand gradients used in sidebar active states

### Requirements
- `.planning/REQUIREMENTS.md` — NAV-01 (4 pillars in sidebar), NAV-06 (deep links still work)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sidebar.tsx` active state styling (brand gradient, glow, active pill) — reuse for icon rail active state
- `useSidebarOrder` hook — refactor for single section, keep localStorage persistence and validation logic
- `@dnd-kit/core` + `@dnd-kit/sortable` — already installed, keep for rail DnD
- Lucide icon set — all pillar icons available (`Home`, `Mail`, `Calendar`, `Users`, `CheckSquare`, `Settings`)

### Established Patterns
- MUI `Drawer` component for sidebar with `variant="permanent"` (desktop) and `variant="temporary"` (mobile)
- `useMediaQuery(theme.breakpoints.down('md'))` for mobile detection
- `useTranslations()` for all user-facing strings
- `useRouter()` for active route detection (`router.pathname === href`)

### Integration Points
- `Layout.tsx` — controls sidebar width and content offset; must update for fixed 64px rail
- Mobile hamburger menu trigger — must be replaced with bottom tab bar rendering
- `PmSyncSidebarProps` interface — `collapsed` and `onToggleCollapse` props become unnecessary

</code_context>

<specifics>
## Specific Ideas

- Superhuman-style icon rail — clean, minimal, icon-only with tooltips on hover
- Bottom tab bar on mobile follows native iOS/Android patterns — always visible, one-tap navigation
- DnD on icon rail is unconventional but user wants it — implement vertical drag of small icon items

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 0135-sidebar-reduction*
*Context gathered: 2026-04-01*
