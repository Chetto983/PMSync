# Phase 145: Smart Today Dashboard - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the current generic widget-based home page (`/dashboard`) with an AI-curated "Today" dashboard. The new view aggregates due tasks, pending email replies, deal alerts, and upcoming meetings into a single prioritized feed — sorted by urgency tier (Urgent / Today / FYI). A new backend endpoint (`GET /dashboard/today`) queries all data sources in parallel and returns a scored, unified item list. The frontend renders a compact, actionable feed with inline quick actions (complete, dismiss, snooze) and click-through navigation to entity pages.

This phase does NOT add new data sources, new AI capabilities, or new entity types. It repackages existing backend data (TasksAggregationService, BriefingService, calendar API, email API, CRM deals) into a single curated view.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Redesign Scope
- **D-01:** Full replacement of DashboardContainer and all 9 existing widgets (briefing, events, emails, deadlines, followups, trends, contacts, triage, crmSuggestions). The Today view IS the home page at `/dashboard`.
- **D-02:** Widget customization (CustomizeDrawer, widget-registry, dashboard-store) is removed along with the widgets. No toggle/reorder UI needed.

### Claude's Discretion (Dashboard Scope)
- Whether to keep a brief AI summary/greeting at the top of the Today view (reusing BriefingService prose) or let the priority feed speak for itself. A 2-3 line contextual greeting with urgency counts (e.g., "3 urgent, 5 today, 2 FYI") is acceptable if it adds value without adding noise.
- Whether to include any type-based filter toggles — acceptable if it improves usability, but not required.

### AI Curation Approach
- **D-03:** New backend endpoint `GET /dashboard/today` that queries all data sources in parallel, scores/ranks items, and returns a single prioritized list with greeting and summary counts.
- **D-04:** Four data sources aggregated: (1) Unified tasks via TasksAggregationService (follow-ups, reminders, NBA actions, tickets, manual tasks — filter to due today + overdue), (2) Emails needing reply (pending reply detection), (3) Deal alerts (stuck deals, upcoming close dates), (4) Today's calendar events.

### Claude's Discretion (AI Scoring)
- Whether to use deterministic priority rules (overdue = urgent, due today = today, upcoming = FYI) or involve the LLM for scoring. Deterministic rules are recommended for speed and predictability — AI involvement should be limited to the optional greeting/summary text via existing BriefingService.

### Unified Feed Layout
- **D-05:** Single priority list grouped by urgency tier: Urgent → Today → FYI. Mixed item types interleave naturally within each tier, sorted by the backend's priority score.
- **D-06:** Compact row format per item: type icon + title + subtitle line + time badge. ~48px height. Hover or click reveals more detail.
- **D-07:** Celebratory empty state when all items are cleared or no items exist — "You're all caught up" with positive reinforcement and preview of next upcoming item.

### Navigation & Actions
- **D-08:** Clicking a feed item navigates to the entity's page: email → `/dashboard/email/thread/[id]`, task → `/dashboard/tasks`, deal → `/dashboard/crm/deals/[id]`, event → `/dashboard/calendar`.
- **D-09:** Inline quick actions on each feed item: checkmark button to complete (tasks only), dismiss/X to hide from today's feed (all items), snooze menu (1h, tomorrow, next week) for all items.
- **D-10:** Dismissed/completed items animate out immediately (optimistic update). Brief undo toast appears ("Dismissed — Undo").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Dashboard (to be replaced)
- `frontend/components/dashboard/DashboardContainer.tsx` — Current widget grid container (will be replaced)
- `frontend/components/dashboard/dashboard/widget-registry.ts` — 9-widget registry with lazy loading (will be removed)
- `frontend/components/dashboard/dashboard/CustomizeDrawer.tsx` — Widget customization drawer (will be removed)
- `frontend/components/dashboard/dashboard/WidgetCard.tsx` — Widget card wrapper (will be removed)
- `frontend/components/dashboard/dashboard/WidgetSkeleton.tsx` — Widget skeleton (may reuse pattern)
- `frontend/components/dashboard/dashboard/DashboardEmptyState.tsx` — Current empty state (will be replaced)
- `frontend/components/dashboard/dashboard/AiQuickAccess.tsx` — AI quick access component (will be removed)
- `frontend/stores/dashboard-store.ts` — Dashboard UI Zustand store (will be simplified/replaced)
- `frontend/pages/dashboard/index.tsx` — Dashboard page entry point (keep, swap DashboardContainer for TodayDashboard)

### Existing Widgets (data patterns to reuse)
- `frontend/components/dashboard/widgets/BriefingWidget.tsx` — AI briefing with triage lanes (data fetching pattern)
- `frontend/components/dashboard/widgets/TodayEventsWidget.tsx` — Calendar events (data fetching pattern)
- `frontend/components/dashboard/widgets/DeadlinesWidget.tsx` — Deadline items (data fetching pattern)
- `frontend/components/dashboard/widgets/FollowUpWidget.tsx` — Follow-ups with snooze (snooze pattern to reuse)
- `frontend/components/dashboard/widgets/BaseWidget.tsx` — Base widget with loading/error/empty states

### Backend Data Sources
- `backend/src/modules/tasks/services/tasks-aggregation.service.ts` — Unified task aggregation (5 sources)
- `backend/src/modules/tasks/dto/unified-task.dto.ts` — UnifiedTaskDto type definitions
- `backend/src/modules/tasks/controllers/tasks.controller.ts` — Tasks API endpoints
- `backend/src/modules/ai/services/briefing.service.ts` — AI briefing generation
- `backend/src/modules/ai/controllers/ai.controller.ts` — AI endpoints including `GET /ai/briefing`
- `backend/src/modules/calendar/controllers/calendar.controller.ts` — Calendar event endpoints

### Frontend Hooks (data fetching)
- `frontend/hooks/queries/use-dashboard.ts` — useBriefing, useTodayEvents, useDeadlines, useRecentUnreadEmails, useTriagedEmails hooks
- `frontend/hooks/queries/use-follow-ups.ts` — usePendingFollowUps, useSnoozeFollowUp hooks

### Layout & Common Components
- `frontend/components/common/PageContainer.tsx` — Standard page container with title/subtitle/actions
- `frontend/components/common/QueryErrorAlert.tsx` — Error state component
- `frontend/lib/hooks/use-translations.ts` — i18n translations hook
- `frontend/locales/en.ts` — English translations (dashboard section to update)
- `frontend/locales/it.ts` — Italian translations (dashboard section to update)

### Requirements
- `.planning/REQUIREMENTS.md` — NAV-05: "User sees AI-curated 'Today' dashboard as home: due tasks, pending replies, deal alerts, upcoming meetings"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TasksAggregationService` — Already aggregates 5 task sources with priority sorting. Core of the Today endpoint's task data.
- `BriefingService` — AI briefing generation. Can be called for optional greeting/summary text.
- `FollowUpWidget` snooze pattern — `useSnoozeFollowUp` hook with snooze duration options. Reuse for Today feed snooze action.
- `BaseWidget` loading/error/empty state pattern — Adapt for the Today feed container.
- `PageContainer` — Standard page wrapper, reuse for Today page header.
- `useGlobalToast` — Toast notification system for undo functionality.

### Established Patterns
- TanStack Query for all data fetching with `queryOptions()` pattern
- Zustand for client UI state (optimistic updates for dismiss/complete)
- MUI `sx` prop styling, no Tailwind utilities
- Lazy loading with `React.lazy` + `Suspense` for code splitting
- i18n: all strings via `useTranslations()`, never hardcoded

### Integration Points
- `pages/dashboard/index.tsx` — Swap `DashboardContainer` import for new `TodayDashboard` component
- New backend module/controller for `GET /dashboard/today` endpoint
- New frontend TanStack Query hook `useTodayFeed()` wrapping the new endpoint
- New translations in `en.ts` / `it.ts` under `dashboard.today.*` namespace
- `useRouter()` for click-through navigation to entity pages

</code_context>

<specifics>
## Specific Ideas

- Layout resembles Superhuman's "Important" view — a single prioritized feed, not a widget grid
- Urgency tiers (Urgent / Today / FYI) serve as visual section headers with item counts
- Compact rows maximize visible items — each item ~48px with type icon, title, subtitle, time badge
- Quick actions appear on hover (desktop) or as swipe gestures (mobile consideration for future)
- Undo toast after dismiss/complete for immediate reversibility
- Empty state is celebratory — "You're all caught up" — positive reinforcement

</specifics>

<deferred>
## Deferred Ideas

- Real-time updates via WebSocket/SSE (items appearing/disappearing as they change server-side)
- Mobile-specific interactions (swipe to dismiss/snooze)
- Drag-to-reorder items manually within a tier
- User-defined priority overrides ("always show this contact's emails as urgent")

None — discussion stayed within phase scope

</deferred>

---

*Phase: 145-smart-today-dashboard*
*Context gathered: 2026-04-16*
