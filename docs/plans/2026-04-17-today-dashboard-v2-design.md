---
title: Today Dashboard v2 — Design Doc
date: 2026-04-17
status: approved
supersedes: .planning/phases/145-smart-today-dashboard/145-UI-SPEC.md
next_phase: 145.1
author: davide marchetto + Claude (brainstorming)
---

# Today Dashboard v2 — Design Doc

## Why this exists

Phase 145 shipped a Superhuman-style single-column "Today" feed with three deterministic
tiers (urgent / today / fyi). The user reviewed the working implementation and rejected
the UI/UX as "terrible". Backend (`GET /dashboard/today`) and the 27 legacy widget
deletions stay; the `<TodayDashboard />` surface gets re-spec'd from scratch.

This document captures the approved design that phase 145.1 will implement.

## Research that grounds the design

Web research on professional dashboard patterns (April 2026) surfaced six findings that
shaped every decision below.

1. Eye-tracking shows users scan dashboards in an F-pattern. The largest, darkest item
   in the top-left wins the first 5 seconds. The previous design centered a 720px column
   with no top-left KPI emphasis.
2. Working memory caps at 5–9 elements. Dashboards exceeding 12 KPIs lose 40% engagement.
3. Hover-only interactivity adds 35% time-to-insight on frequently-viewed dashboards.
   The previous design hid quick actions on hover.
4. Superhuman and Hey use **batched categorical streams**, not a mixed feed. Each stream
   has a sticky header and a clear name.
5. The "command center" framing implies multiple surfaces visible without scroll. The
   previous single 720px column hid counts behind scroll.
6. Notion's March 2026 "dashboard views" feature confirmed the trend: glanceable
   overviews atop data, not customizable widget grids.

Sources are listed at the end of this document.

## Approved decisions

The user approved each section in sequence during a brainstorming session.

### D-01 Architecture: Smart Streams (single-column batched feed)

A single ≤880px centered column with named, batched streams. Each stream has a sticky
header showing its count. Top of page is a greeting plus a clickable KPI chip strip.

Rejected: a multi-pane Bloomberg-style command center (too dense for solo SaaS use), and
a two-pane feed + context-rail hybrid (split attention).

### D-02 Stream taxonomy: action-driven

Four streams, in vertical order:

| Order | Stream | Membership rule (deterministic) |
|---|---|---|
| 1 | REPLIES NEEDED | Email follow-ups awaiting your reply, calendar invites needing RSVP, deals where the counterparty messaged last, tasks where you are the assignee with `awaiting_user` status. |
| 2 | DUE TODAY | Calendar events today, tasks with due-date today or overdue, deals with close-date today. Items already in REPLIES NEEDED are excluded (mutual exclusion). |
| 3 | WAITING ON OTHERS | Emails you sent without reply for >48h, tasks you delegated, deals where you contacted last >48h ago. |
| 4 | FYI | Newsletters, digests, low-priority emails, stale-but-not-at-risk deals. Capped at 25 items. |

Streams 1 and 2 expand by default; 3 and 4 collapse by default. State persists in a
session Zustand store. A stream with zero items is hidden completely.

Rejected: source-driven taxonomy (Inbox / Calendar / Deals / Tasks — loses the "what
needs me?" signal), and time-driven taxonomy (Right Now / Later — loses topic grouping).

### D-03 Row anatomy: 40px compact, always-visible actions

```
✉  ACME RFP — needs price by EOD       J.Smith · 2h    ✓  ⏰  ✕
```

- Type icon 16px (lucide), semantic color, 16px gutter.
- Title is a real `<a href={item.routeUrl}>`. Cmd/Ctrl/middle-click opens in a new tab
  with no JS. This fixes WR-06 from the phase 145 code review.
- Meta block is right-aligned, single line, smart time format (`2h`, `OD2h`, `14:00`,
  `Apr 19`).
- Three quick actions visible at all times: ✓ complete · ⏰ snooze · ✕ dismiss. Idle
  opacity 0.5; row hover or focus brings them to 1.0. Snooze hides (collapses) when
  `canSnooze=false`.
- Row height exactly 40px. About 12 rows visible per stream before scroll.

Rejected: 64px two-line "comfortable" rows (too much chrome for a triage surface) and
88px Notion-style cards (density drops to 5/stream).

### D-04 Top of page: greeting + KPI chip strip

Greeting (24px / 600 / gray-900) and date (14px / 400 / gray-500) on the left. Below
them, four clickable KPI chips:

```
[✉ 47]  [📅 6]  [💰 12 · €420k]  [✅ 9]
```

Each chip is a link to the corresponding section's full view. The chips give the
5-second F-pattern moment the previous design was missing.

Rejected: minimal greeting only (loses the big-picture moment), AI briefing card +
KPI strip (deferred — the briefing already exists in the backend; show it in 145.2 if
the chips alone feel sparse).

### D-05 Visual system: grayscale-first, color as garnish

5 type roles, spacing scale 4/8/16/24/48 only, 3 elevation levels (none / subtle / float),
and color used only for: (a) focus rings, (b) deal value formatting, (c) KPI chip hover,
(d) "OVERDUE" badge text, (e) success toast. The dashboard reads identically in
monochrome — hierarchy comes from size, weight, and position, not color.

### D-06 Interactions

- Click model: row title is the navigable surface. Quick-action buttons stop propagation.
- Quick actions: complete (real undo), snooze (1h / Tonight / Tomorrow / Next week +
  custom; new `PATCH /tasks/{id}/snooze` for tasks), dismiss (session-local with undo).
- Keyboard: Tab, Enter, j/k for v1; e/s/# and chord shortcuts deferred to 145.2.
- Animation budget: 150ms row removal, 200ms stream collapse, 250ms toast, 300ms KPI
  count tween. Nothing else.
- TanStack: `staleTime: 5min`, `gcTime: 30min`, `retry: 1`, refetch-on-focus.

### D-07 Backend contract delta

The current `GET /dashboard/today` returns a 3-tier `tier` field. v2 needs:

- Rename `tier` → `stream` with values `replies-needed | due-today | waiting-on-others | fyi`.
- Add `routeUrl: string` to each item (backend computes; frontend stops reconstructing
  routes from item type).
- Add `rationale?: string` to each item (1-line explanation, deterministic for now;
  LLM-polished in a future phase).
- Extend `counts` with a `kpi` block: `{ inbox, calendar, deals, tasks }` for the chip
  strip. Same endpoint, no extra round-trip.

Stream membership is deterministic with explicit precedence (replies > due > waiting
> fyi). The dead `isHardDeadline` branch from WR-01 is removed. The `isToday` server-
local-time bug from WR-02 is fixed by passing the request `tz` down to the scorer.

No schema changes. No new external dependencies. No new Prisma queries.

### D-08 Out of scope for 145.1

Deferred to a later sub-phase if wanted:
- LLM-polished `rationale` strings.
- Server-persisted dismiss (currently session-only, intentional).
- Keyboard shortcuts beyond j/k/Enter.
- Mobile-specific layout refinements (the 880px column collapses to 100% on small
  screens; usable but not optimized).
- Weather widget.

## Implementation impact summary

| Layer | Change | Files |
|---|---|---|
| Backend DTOs | Rename `tier`, add `stream` + `routeUrl` + `rationale`; extend `counts` with `kpi`. | `backend/src/modules/dashboard/dto/today-feed.dto.ts` |
| Backend scorer | Replace 3-tier logic with 4-stream precedence chain. Remove dead branch. Pass tz down. | `backend/src/modules/dashboard/services/today-scorer.service.ts` |
| Backend service | Compute `routeUrl` per item; derive `kpi` counts from existing aggregator outputs. | `backend/src/modules/dashboard/services/dashboard-today.service.ts` |
| Backend tests | Rewrite scorer tests for 4-stream precedence + tz-aware due-today. | `backend/src/modules/dashboard/services/__tests__/today-scorer.service.spec.ts` |
| Backend new endpoint | `PATCH /tasks/{id}/snooze` so tasks can be snoozed alongside follow-ups. | `backend/src/modules/tasks/...` |
| Frontend i18n | Replace `dashboard.today.tier.*` keys with `dashboard.today.stream.*` (4 keys), add KPI chip labels. | `frontend/locales/en.ts`, `frontend/locales/it.ts`, `frontend/locales/index.ts` |
| Frontend API | Update `dashboardApi.getTodayFeed` types for new contract. | `frontend/lib/api/dashboard.ts` |
| Frontend hooks | Add `useSnoozeTask` mutation alongside existing `useSnoozeFollowUp`. | `frontend/hooks/queries/use-today.ts` |
| Frontend components | Replace all 9 components in `frontend/components/dashboard/today/*`. New components: `TodayHeader` (greeting + KPI strip), `TodayKpiChip`, `TodayStream` (sticky header + collapse), `TodayRow` (40px compact). Drop: `TodayTierSection`, `TodayQuickActions`, `TodayGreeting` (folded into header), `TodayLoadingSkeleton` (folded into stream). | `frontend/components/dashboard/today/*` |
| Frontend page | No change — already swapped in 145-03 to render `<TodayDashboard />`. | `frontend/pages/dashboard/index.tsx` |
| Frontend tests | New RTL specs for header, kpi chip, stream collapse, row interactions, keyboard, snooze popover. | `frontend/components/dashboard/today/__tests__/*` |

## Code review fixes carried into 145.1

The phase 145 code review (`145-REVIEW.md`) flagged 6 warnings. The 145.1 design
addresses all of them by construction:

| Finding | Resolution in v2 |
|---|---|
| WR-01 `isHardDeadline` dead branch | Replaced by explicit 4-stream precedence chain. |
| WR-02 `isToday` uses server local time | Scorer receives request tz; uses tz-aware day window. |
| WR-03 broken `role="list"` nesting | New `<TodayStream>` puts `role="list"` on a sibling of the framer-motion `<AnimatePresence>` so list semantics survive. |
| WR-04 double-filter | Parent computes filtered list once; child receives final list. |
| WR-05 snooze undo no-op | Real undo via inverse mutation. |
| WR-06 row-click breaks Cmd+click | Title is a real `<a href>`. Row body click navigates via `event.currentTarget.querySelector('a').click()` for affordance, but Cmd+click on the title is native. |

## Sources

- [9 Dashboard Design Principles (2026) | DesignRush](https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles)
- [Dashboard Design Guide 2026: Principles & Best Practices](https://createbytes.com/insights/ultimate-guide-dashboard-design-best-practices)
- [Effective Dashboard Design Principles for 2025 | UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [Enterprise UX Design Guide 2026](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/)
- [Notion Dashboard Views — March 2026](https://www.notion.com/releases/2026-03-10)
- [Superhuman Mail vs. Notion Mail](https://blog.superhuman.com/notion-mail/)
- [CRM Dashboards in 2026 | Breakcold](https://www.breakcold.com/blog/crm-dashboard)
- [AI Dashboard Design: A Guide for SaaS Teams](https://www.eleken.co/blog-posts/ai-dashboard-design)
- Refactoring UI by Adam Wathan & Steve Schoger — applied via project skill `.claude/skills/refactoring-ui`.

## Skills used during this design

The brainstorming session loaded these project skills (registered with GSD agent types
in `.planning/config.json` so future plan/execute waves auto-inject them):

- `refactoring-ui` — grayscale-first, constrained scales, F-pattern hierarchy.
- `ui-engineer` — MUI sx-prop styling rules, theme-token discipline.
- `mui` — MUI v7 component patterns and the `Box`/`Stack`/`Typography` primitives used.
- `ux-antipatterns` — informed the rejection of hover-only actions and source-driven
  taxonomies.
- `accessibility-a11y` — drove the keyboard model, focus visibility, and the
  `role="list"` / `<a href>` fixes.

## Next step

Phase 145.1 — "today-dashboard-v2" (decimal sub-phase). Suggested entry:

```
/gsd-insert-phase 145.1
/gsd-discuss-phase 145.1   # optional — most decisions already locked above
/gsd-plan-phase 145.1      # plan creation reads this design doc + new UI-SPEC
/gsd-execute-phase 145.1   # backend + frontend rewrite waves
```

The new UI-SPEC.md will live at `.planning/phases/145.1-today-dashboard-v2/145.1-UI-SPEC.md`
and supersede `.planning/phases/145-smart-today-dashboard/145-UI-SPEC.md`.
