---
phase: 94
slug: infrastructure-remaining-pages
status: draft
shadcn_initialized: false
preset: none
created: 2026-03-20
---

# Phase 94 — UI Design Contract

> Visual and interaction contract for the Tasks page rebuild. Phase 94 is primarily verification/testing of existing infrastructure and pages. The only new UI work is replacing the Tasks page placeholder with a real follow-up data list.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (MUI-only project) |
| Preset | not applicable |
| Component library | MUI v6 (@mui/material) |
| Icon library | lucide-react |
| Font | Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif |

Source: `frontend/theme/tokens.ts`, `frontend/theme/appTheme.ts`, CLAUDE.md

---

## Spacing Scale

Declared values from existing `frontend/theme/tokens.ts` spacing scale (8px base):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| 1 | 4px | Chip gaps, inline icon padding |
| 2 | 8px | List item internal padding, compact gaps, between task item elements |
| 4 | 16px | Card padding, section padding |
| 6 | 24px | Sidebar section spacing |
| 8 | 32px | Page-level content padding |

Exceptions: none. All spacing uses MUI `sx` prop with theme spacing multipliers (e.g., `p: 2` = 16px since MUI default factor is 8).

---

## Typography

Existing MUI theme typography from `frontend/theme/typography.ts`. Tasks page uses these roles:

| Role | Size | Weight | Line Height | MUI Variant | Usage |
|------|------|--------|-------------|-------------|-------|
| Body | 14px (0.875rem) | 400 | 1.625 | body1 | Follow-up reason text, action items |
| Label | 13px (0.8125rem) | 400 | 1.625 | body2 | Email subject, sender, due date, meta |
| Section heading | 14px (0.875rem) | 600 | 1.5 | subtitle2 | Sidebar section titles ("Workspace") |
| Page heading | 16px (1rem) | 600 | 1.5 | h6 | "Tasks" page title (if rendered) |
| Caption | 12px (0.75rem) | 400 | 1.5 | caption | Overdue badge text, count indicators |

Two weights only: 400 (regular) for all body/label/caption roles, 600 (semibold) for all heading roles (section heading and page heading).

Source: `frontend/theme/tokens.ts` fontSize + `frontend/theme/typography.ts`

---

## Color

Existing theme tokens apply. No new colors introduced.

| Role | Value (dark / light) | Usage |
|------|---------------------|-------|
| Dominant (60%) | `#0c1017` / `#f8fafc` | Page background (theme `background.default`) |
| Secondary (30%) | `#131a24` / `#ffffff` | Sidebar Paper, task list cards (theme `background.paper`) |
| Accent (10%) | `#55cae5` / `#00aced` | Selected sidebar item highlight, active filter indicator only |
| Destructive | `#ef4444` / `#dc2626` | Overdue date chip background (subtle: `error.subtle`) |
| Tasks semantic | `#22c55e` | Tasks module icon color (from `pmSyncColors.semantic.tasks`) |

Accent reserved for: selected sidebar filter item background, active state ring on "All Tasks" / "Today" / "Upcoming" buttons. NOT used on task list items, chips, or text.

**Focal point:** The follow-up list in the main content area is the primary visual anchor. The sidebar filters are secondary navigation; the eye should land on the first follow-up item row on page load.

Status chips on follow-up items:
- PENDING: `warning.main` (`#f59e0b` / `#d97706`)
- WAITING_FOR: `info.main` (`#55cae5` / `#00aced`)
- TODO: `secondary.main` (`#7650ce`)
- Overdue: `error.main` (`#ef4444` / `#dc2626`)

Priority chips on action items:
- High: `error.subtle` background + `error.main` text
- Medium: `warning.subtle` background + `warning.main` text
- Low: default outlined chip (no color override)

---

## Copywriting Contract

All copy uses i18n keys under `t.tasks.*`. Existing keys in `frontend/locales/en.ts` lines 1739-1760 plus new keys needed.

| Element | English Copy | i18n Key |
|---------|-------------|----------|
| Page title | Tasks | `tasks.title` (exists) |
| Sidebar: all filter | All Tasks | `tasks.allTasks` (exists) |
| Sidebar: today filter | Today | `tasks.today` (exists) |
| Sidebar: upcoming filter | Upcoming | `tasks.upcoming` (exists) |
| Sidebar: section label | Workspace | `tasks.workspace` (exists) |
| Empty state heading | No follow-ups to track | `tasks.emptyTitle` (UPDATE from "No tasks yet") |
| Empty state body | When emails need follow-up, they will appear here automatically. Use the AI assistant to analyze your inbox. | `tasks.emptyDescription` (UPDATE) |
| Error state | Failed to load follow-ups. Check your connection and try again. | `tasks.errorLoading` (NEW) |
| Retry action | Retry Loading | `common.retryLoading` (NEW) |
| Follow-up type: waiting | Waiting for reply | `tasks.waitingFor` (NEW) |
| Follow-up type: todo | To do | `tasks.todo` (NEW) |
| Overdue label | Overdue | `tasks.overdue` (NEW) |
| Due today label | Due today | `tasks.dueToday` (NEW) |
| No results for filter | No follow-ups for this filter | `tasks.noFilterResults` (NEW) |
| Commitment prefix | Committed: | `tasks.commitmentPrefix` (NEW) |
| Waiting-for prefix | Waiting on: | `tasks.waitingOnPrefix` (NEW) |
| Stats: pending count | {count} pending | `tasks.statsPending` (NEW) |
| Stats: overdue count | {count} overdue | `tasks.statsOverdue` (NEW) |

No destructive actions in this phase (tasks list is read-only per CONTEXT.md decision).

---

## Component Inventory

### Tasks Page (rebuild from placeholder)

**Layout:** Two-panel split identical to existing placeholder structure.
- Left sidebar: 240px `Paper` with filter list (All Tasks, Today, Upcoming). Hidden on xs/sm (`display: { xs: 'none', md: 'block' }`).
- Main content: flex-1, scrollable list of follow-up items.

**Sidebar filter items:** MUI `ListItemButton` with `selected` prop for active filter. Show count badge via `ListItemSecondaryAction` with `Chip size="small"`.

**Follow-up list item:** Each item is a `Paper` or `ListItemButton` row showing:
- Left: status icon (lucide `Clock` for WAITING_FOR, `CheckSquare` for TODO, `AlertCircle` for overdue)
- Center: email subject (body2, `text.primary`), reason/commitment text (body2, `text.secondary`), sender (caption, `text.tertiary`)
- Right: due date chip (caption), follow-up type chip (body2, outlined), priority chip if action items present

**States (mandatory, in render order):**
1. Loading: MUI `Skeleton` -- 5 rectangular skeletons (height 72px, width 100%) mimicking list items, plus sidebar skeletons
2. Error: MUI `Alert severity="error"` with `tasks.errorLoading` text and retry `Button`
3. Empty: existing empty state pattern (centered icon + heading + body), update copy per Copywriting Contract
4. Data: scrollable list of follow-up items

**Stats bar (optional, Claude's discretion from CONTEXT.md):** Horizontal bar above the list showing pending count + overdue count + due-today count. Uses `useFollowUpStats()` hook. `Box` with `display: flex`, `gap: 2`, each stat as `Chip variant="outlined"`.

### No other new components

All other pages (dashboard, analytics, landing, legal) are verification-only. No new UI components needed -- just Playwright tests confirming existing pages render correctly.

---

## Interaction Patterns

| Interaction | Behavior |
|-------------|----------|
| Sidebar filter click | Sets active filter state (local `useState`). Filters displayed follow-ups client-side by `dueDate` (Today = today, Upcoming = future, All = no filter). |
| List item click | No action in Phase 94 (read-only list). No navigation, no detail panel. |
| Retry on error | Re-fetches `usePendingFollowUps()` query via TanStack Query `refetch()`. |
| Page load | Fetch follow-ups via `usePendingFollowUps(50, false)`. Show skeleton during loading. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Not applicable | No shadcn | Not applicable |

This project uses MUI exclusively. No shadcn, no third-party component registries.

---

## Verification Pages (no UI changes, test-only)

These pages are tested via Playwright but receive no visual modifications in Phase 94:

| Page | What to verify | Existing component |
|------|---------------|-------------------|
| Dashboard | 10 widgets render, customization drawer opens/closes, layout persists | `DashboardContainer.tsx` |
| Analytics | Consent gate shows, chart renders after consent | `AnalyticsChart.tsx` |
| Landing | 6 sections render (hero, features, modules, testimonials, CTA, footer) | `pages/index.tsx` |
| Privacy | Content renders, back navigation works | `pages/privacy.tsx` |
| Terms | Content renders, back navigation works | `pages/terms.tsx` |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
