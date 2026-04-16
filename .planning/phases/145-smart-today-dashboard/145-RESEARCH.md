# Phase 145: Smart Today Dashboard - Research

**Researched:** 2026-04-16
**Domain:** Full-stack feature aggregation (NestJS backend + Next.js frontend, MUI v6, TanStack Query v5)
**Confidence:** HIGH

## Summary

Phase 145 replaces the existing 9-widget dashboard with a single AI-curated "Today" feed at `/dashboard`. All four data sources (unified tasks, emails needing reply, deal alerts, calendar events) already exist as services or queries in the backend — there is **no new data layer or schema migration required**. The phase is primarily an aggregation + UI rewrite.

The biggest planning trap is the "emails needing reply" source: there is **no `aiNeedsReply` field on the Email model**. The existing concept lives in two places — `EmailFollowUp` records (with `followUpType: WAITING_FOR | TODO`) and the email's `aiActionability` field — and the planner must pick one (recommended: reuse `EmailFollowUp` since it already feeds `TasksAggregationService` as `follow_up`, which would otherwise double-count).

**Primary recommendation:** Build a new `dashboard` NestJS module with one endpoint `GET /dashboard/today` that calls `TasksAggregationService.listTasks()` (filtered to `dueBefore=tomorrow`), `CalendarService.listEvents()` (today only), `DealService.list()` (filtered to closing/stuck), and aggregates into a `TodayFeedItemDto`. Use deterministic scoring (no LLM call) with optional `BriefingService.getBriefing()` for the greeting only. Frontend swaps `DashboardContainer` for `TodayDashboard` in `pages/dashboard/index.tsx` and uses framer-motion (already installed at v12.33.0) for the slide-out animations spec'd in UI-SPEC D-10.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dashboard Redesign Scope:**
- **D-01:** Full replacement of DashboardContainer and all 9 existing widgets (briefing, events, emails, deadlines, followups, trends, contacts, triage, crmSuggestions). The Today view IS the home page at `/dashboard`.
- **D-02:** Widget customization (CustomizeDrawer, widget-registry, dashboard-store) is removed along with the widgets. No toggle/reorder UI needed.

**AI Curation Approach:**
- **D-03:** New backend endpoint `GET /dashboard/today` that queries all data sources in parallel, scores/ranks items, and returns a single prioritized list with greeting and summary counts.
- **D-04:** Four data sources aggregated: (1) Unified tasks via TasksAggregationService (follow-ups, reminders, NBA actions, tickets, manual tasks — filter to due today + overdue), (2) Emails needing reply (pending reply detection), (3) Deal alerts (stuck deals, upcoming close dates), (4) Today's calendar events.

**Unified Feed Layout:**
- **D-05:** Single priority list grouped by urgency tier: Urgent → Today → FYI. Mixed item types interleave naturally within each tier, sorted by the backend's priority score.
- **D-06:** Compact row format per item: type icon + title + subtitle line + time badge. ~48px height. Hover or click reveals more detail.
- **D-07:** Celebratory empty state when all items are cleared or no items exist — "You're all caught up" with positive reinforcement and preview of next upcoming item.

**Navigation & Actions:**
- **D-08:** Clicking a feed item navigates to the entity's page: email → `/dashboard/email/thread/[id]`, task → `/dashboard/tasks`, deal → `/dashboard/crm/deals/[id]`, event → `/dashboard/calendar`.
- **D-09:** Inline quick actions on each feed item: checkmark button to complete (tasks only), dismiss/X to hide from today's feed (all items), snooze menu (1h, tomorrow, next week) for all items.
- **D-10:** Dismissed/completed items animate out immediately (optimistic update). Brief undo toast appears ("Dismissed — Undo").

### Claude's Discretion

**Dashboard Scope:**
- Whether to keep a brief AI summary/greeting at the top of the Today view (reusing BriefingService prose) or let the priority feed speak for itself. A 2-3 line contextual greeting with urgency counts (e.g., "3 urgent, 5 today, 2 FYI") is acceptable if it adds value without adding noise.
- Whether to include any type-based filter toggles — acceptable if it improves usability, but not required.

**AI Scoring:**
- Whether to use deterministic priority rules (overdue = urgent, due today = today, upcoming = FYI) or involve the LLM for scoring. Deterministic rules are recommended for speed and predictability — AI involvement should be limited to the optional greeting/summary text via existing BriefingService.

### Deferred Ideas (OUT OF SCOPE)

- Real-time updates via WebSocket/SSE (items appearing/disappearing as they change server-side)
- Mobile-specific interactions (swipe to dismiss/snooze)
- Drag-to-reorder items manually within a tier
- User-defined priority overrides ("always show this contact's emails as urgent")
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-05 | User sees AI-curated "Today" dashboard as home: due tasks, pending replies, deal alerts, upcoming meetings | All four sources are reachable from existing services — `TasksAggregationService` (tasks), `prisma.emailFollowUp.findMany` (pending replies), `prisma.crmDeal.findMany` (deal alerts), `prisma.calendarEvent.findMany` (events). Frontend `pages/dashboard/index.tsx:1-26` is the swap point — replace `DashboardContainer` with `TodayDashboard`. Click-through routes per D-08 all already exist (`/dashboard/email/thread/[threadId].tsx`, `/dashboard/tasks.tsx`, `/dashboard/crm/deals/[id].tsx`, `/dashboard/calendar.tsx`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

The planner MUST honor every directive below; they have the same authority as locked decisions.

| Directive | Implication for Phase 145 |
|-----------|---------------------------|
| **NEVER `prisma db push`** | Phase 145 should add **zero schema changes** if at all possible. If the planner decides to add a `today_dismissals` or `today_snoozes` table, it MUST be via `npx prisma migrate dev --name <name>` and the migration SQL reviewed for DROPs. |
| **Multi-tenant: every Prisma query must include `tenantId`** | The new `DashboardTodayService` must pass `tenantId` to every `prisma.*.findMany()` call and every existing service method already requires it (verified). |
| **Max 500 lines per file** | The aggregation service will be the largest file. Split scoring, source queries, and DTO normalization into separate files (e.g., `today-scorer.ts`, `today-aggregator.ts`, `today-dto.ts`). |
| **Frontend procedure: translations FIRST, then query hooks, then component** | Plan order MUST be: (1) Add `dashboard.today.*` to `frontend/locales/en.ts`, `it.ts`, and types in `index.ts`. (2) Create `useTodayFeed` hook in `frontend/hooks/queries/use-today.ts`. (3) Build component. (4) Type-check + lint. |
| **No raw `apiClient.get()` in components** | Wrap the new `/dashboard/today` endpoint in a `frontend/lib/api/dashboard.ts` module + a TanStack Query hook. |
| **Hardcoded strings forbidden — use `t.dashboard.today.*`** | All UI strings (incl. "Snoozed until {time}", "All caught up") go through translations. UI-SPEC already specifies the full key list. |
| **MUI `sx` props only — no Tailwind** | Confirmed — Phase 145 will only touch `.tsx` files; existing chat CSS files are not in scope. |
| **TanStack Query: `staleTime: 5min`, `gcTime: 30min`, `retry: 1`** | UI-SPEC § State Management already specifies these for `useTodayFeed`. Confirm in plan. |
| **Discussion-First Default** | Skipped — explicit goal/scope already in CONTEXT.md and UI-SPEC. |
| **READ BEFORE EDIT** | All canonical files listed in CONTEXT must be read by the planner before drafting plan tasks. |
| **Post-edit validation: `npx tsc --noEmit` after every file edit** | Add to acceptance criteria of every plan. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Aggregate 4 data sources, rank, group by tier | API / Backend | — | All source data lives in Postgres; aggregation is read-heavy and tenant-scoped. Doing it client-side would require 4 separate API calls + client-side scoring (slower, leaks data). |
| Optional greeting text (executive summary) | API / Backend | — | Reuses `BriefingService.getBriefing()` which is cached per tenant/user/locale/time-slot in Redis (`CacheNamespace.AI_BRIEFING`). Latency is paid once per slot. |
| Deterministic urgency scoring (overdue/today/upcoming) | API / Backend | — | Tied to the aggregation step; no reason to push to client. |
| Optimistic UI removal + undo | Browser / Client | — | Visual-only; never persisted across reloads (per UI-SPEC: "Cleared on page reload"). |
| Snooze persistence | API / Backend | Browser/Client (optimistic) | Snooze must outlive the browser session. For follow-ups: existing `PATCH /ai/follow-ups/:id/snooze`. For NBA/manual tasks/reminders: see Open Questions Q1. |
| Dismiss persistence | API / Backend (only for follow-ups & NBA) + Client (session for others) | — | Existing `dismissTask()` in `TasksAggregationService` only supports `deal_action` and `reminder`. Other types (calendar events, emails-needing-reply that aren't follow-ups, deal alerts) need a server-side hide layer or accept that dismiss is session-only. See Open Questions Q2. |
| Click-through navigation | Browser / Client | — | `useRouter().push()` to existing entity routes. |
| Filter toggles (optional) | Browser / Client | — | UI-SPEC: "Filters client-side from the already-fetched feed data". |
| i18n strings | Browser / Client | — | Standard `useTranslations()` pattern; no backend i18n needed for feed payload (titles come from source records, not from i18n). |

## Standard Stack

### Core (already in repo — confirmed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common`, `@nestjs/swagger` | 11.x | Module/controller/DTO definition | Project convention for all backend modules. `[VERIFIED: backend/src/modules/tasks/tasks.controller.ts:14]` |
| `@prisma/client` | 7.x | DB queries (Email, EmailFollowUp, CrmDeal, CalendarEvent) | All source models are Prisma. `[VERIFIED: backend/prisma/schema.prisma]` |
| `class-validator`, `class-transformer` | latest | DTO validation | Project convention. `[VERIFIED: backend/src/modules/crm/deal/dto/deal.dto.ts:1-11]` |
| `@tanstack/react-query` | 5.x | `useTodayFeed` hook | Project convention; existing dashboard hooks use `queryOptions()` pattern. `[VERIFIED: frontend/hooks/queries/use-dashboard.ts:12]` |
| `@mui/material` | 6.x | All UI primitives (List, ListItem, Chip, IconButton, Menu, Snackbar, Skeleton) | Project rule — MUI v7 only, no Tailwind. UI-SPEC § Component Inventory. `[VERIFIED: frontend/package.json]` |
| `lucide-react` | latest | Icons (`Mail`, `CheckSquare`, `TrendingUp`, `Calendar`, `Check`, `X`, `Clock`, `Sun`, `CalendarDays`, `PartyPopper`) | Project icon convention. `[VERIFIED: frontend/components/dashboard/widgets/FollowUpWidget.tsx:31]` |
| `framer-motion` | 12.33.0 | Slide-out + fade animations (UI-SPEC D-10: 200ms cubic-bezier) | Already installed; use `<AnimatePresence>` + `motion.div` pattern. Avoid CSS-only since UI-SPEC requires height-collapse-after-fade-out which requires `layout` animations. `[VERIFIED: frontend/package.json:92]` |
| `date-fns` + locale | latest | Relative time formatting ("2h ago", "in 30m"), `addHours`, `startOfTomorrow`, `nextMonday` | Already used by FollowUpWidget for snooze date math. `[VERIFIED: frontend/components/dashboard/widgets/FollowUpWidget.tsx:28]` |
| `zustand` | latest | Optional client store for optimistic dismiss set | Pattern from `dashboard-store.ts` — but no persistence (per UI-SPEC). |

### Supporting (existing services to reuse — NOT to rebuild)

| Service | Path | What It Provides | Use For |
|---------|------|------------------|---------|
| `TasksAggregationService.listTasks(tenantId, userId, query)` | `backend/src/modules/tasks/services/tasks-aggregation.service.ts:51` | Returns `UnifiedTaskListResponseDto` aggregating 5 task sources. Supports `dueBefore`, `dueAfter`, `priority`, `sourceType` filters. | Feed source #1 — call with `dueBefore=tomorrow EOD` for today's tasks. |
| `TasksAggregationService.completeTask(tenantId, userId, sourceType, sourceId)` | `:137` | Switch on `sourceType` — handles `follow_up`, `reminder`, `deal_action`, `ticket`, `manual` | Quick action: complete |
| `TasksAggregationService.dismissTask(tenantId, sourceType, sourceId)` | `:201` | **Only** supports `deal_action` and `reminder`. Throws `BadRequestException` for others. | Quick action: dismiss (PARTIAL — see Open Q2) |
| `BriefingService.getBriefing(tenantId, userId, timezone, locale)` | `backend/src/modules/ai/services/briefing.service.ts:307` | Returns cached `AiServiceResult<BriefingOutput>`. Uses `mistralai/mistral-small-3.1-24b-instruct` (~$0.0001/call). 8h cache window per slot. Has deterministic fallback if LLM fails. | Greeting only — extract `briefing.executiveSummary` (2-3 sentences). |
| `CalendarService.listEvents(tenantId, filters)` | `backend/src/modules/calendar/services/calendar.service.ts` (via controller `@Get('events')`) | Returns events filtered by `startTime`/`endTime` window | Feed source #4 — today's calendar |
| `DealService.list(tenantId, query)` | `backend/src/modules/crm/deal/services/deal.service.ts:39` | Returns `{ data: CrmDeal[], total }` with pipeline/stage/account joins | Feed source #3 — filter by `expectedCloseDateFrom`/`expectedCloseDateTo`. Stuck-deal detection requires custom query (see below). |
| `prisma.emailFollowUp.findMany({ where: { tenantId, userId, status: PENDING }})` | `backend/src/modules/ai/controllers/ai.controller.ts:536-557` (existing `getPendingFollowUps`) | Returns follow-ups with linked email subject/from | Feed source #2 — emails needing reply |
| `CacheService` + `CacheNamespace.DEADLINE_UPCOMING` | `backend/src/common/services/cache.service.ts:42` | Existing namespace for tenant:userId-scoped caching | Optional caching of `/dashboard/today` results (recommended TTL: 60s — feed should feel "live") |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `dashboard` NestJS module | Add endpoint to existing `tasks` controller | Tasks controller is single-responsibility (tasks). Cross-cutting endpoint should not live there. **Decision: new module.** |
| Deterministic scoring | LLM-based scoring | LLM adds 200-2000ms latency, $0.0001+ per request, non-determinism. The LLM-based briefing exists for the optional 2-3 line summary; the feed itself doesn't need creativity. **Decision: deterministic per CONTEXT D-04 discretion.** |
| `framer-motion` | Pure CSS transitions | UI-SPEC requires height-collapse-after-opacity (a list reflow). `framer-motion`'s `<AnimatePresence>` + `layout` prop handles this with one component. Pure CSS requires manual `max-height` + `overflow:hidden` choreography. **Decision: framer-motion (already in deps).** |
| New `today_dismissals` table | Redis with TTL via `CacheService` | Per UI-SPEC, dismissals are session-only ("Cleared on page reload"). Redis TTL or even pure client-side state suffices. **Decision: client-side (Zustand) — zero backend persistence for dismiss.** Note this departs from "outlives session" — confirm with user in plan-checker. |

**Installation:** No new dependencies needed. All required libraries are in `frontend/package.json` and `backend/package.json`.

**Version verification:** Verified against repo state on 2026-04-16:
- `framer-motion@12.33.0` `[VERIFIED: frontend/package.json:92]`
- `@tanstack/react-query@5.x` `[VERIFIED: frontend/hooks/queries/use-dashboard.ts:12]`
- `date-fns` (with `addHours`, `startOfTomorrow`, `nextMonday`) `[VERIFIED: frontend/components/dashboard/widgets/FollowUpWidget.tsx:28]`

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                  │
│   GET /dashboard (Next.js page)                                          │
│      → <Layout><PageErrorBoundary><TodayDashboard /></...></Layout>     │
│                                                                          │
│   <TodayDashboard>                                                       │
│      useTodayFeed() ─────────────► fetch GET /api/v1/dashboard/today    │
│                                          (TanStack Query, 5min stale)    │
│      ├─ Greeting (optional)                                              │
│      ├─ <TodayFeedList>                                                  │
│      │     ├─ Tier "URGENT" (filtered by item.tier === 'urgent')        │
│      │     │     <TodayFeedItem />  ← framer-motion AnimatePresence     │
│      │     ├─ Tier "TODAY"                                              │
│      │     └─ Tier "FYI"                                                │
│      ├─ <EmptyState> (when feed empty)                                  │
│      └─ <Toast>      (undo for dismiss/complete/snooze)                 │
│                                                                          │
│   Quick action click:                                                    │
│      ├─ Optimistic remove (framer-motion exit)                          │
│      ├─ POST /tasks/:type/:id/complete  OR                              │
│      │  PATCH /ai/follow-ups/:id/snooze  OR                             │
│      │  (client-only dismiss)                                           │
│      └─ Show toast with undo callback (re-insert)                       │
│                                                                          │
│   Click row body:                                                        │
│      router.push('/dashboard/email/thread/[id]' | '/tasks' | …)         │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend  (NestJS, Express, single instance per tenant)                   │
│                                                                          │
│   Controller  DashboardController                                        │
│   ├─ @Get('today') @UseGuards(TenantGuard, RolesGuard)                  │
│   │     → DashboardTodayService.getTodayFeed(tenantId, userId, opts)    │
│                                                                          │
│   Service     DashboardTodayService                                      │
│   │  Promise.all([                                                       │
│   │    TasksAggregationService.listTasks(...,{dueBefore: tomorrow})     │
│   │    prisma.emailFollowUp.findMany({...,status:PENDING,emailId})      │
│   │       ─ filtered to those NOT already in tasks (avoid dup)           │
│   │    DealService.list(...,{expectedCloseDateTo: 7d})                   │
│   │       + stuck-deal raw query (updatedAt < 14d ago, not won/lost)     │
│   │    prisma.calendarEvent.findMany({...,startTime today window})      │
│   │    BriefingService.getBriefing(...) [optional, for greeting]        │
│   │  ])                                                                  │
│   │     → TodayFeedNormalizer.normalize() per source                     │
│   │     → TodayFeedScorer.score(item) → priority number                  │
│   │     → groupBy tier (URGENT/TODAY/FYI) + sort by score desc           │
│   │     → return { greeting?, counts, items[] }                          │
│                                                                          │
│   Reuses     • TasksAggregationService  (5 task sources)                 │
│              • BriefingService           (LLM greeting, cached 8h)       │
│              • DealService               (CRM deals)                     │
│              • CalendarService           (calendar events)               │
│              • PrismaService             (direct EmailFollowUp query)    │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Postgres (Railway)                                                        │
│   - emails, email_follow_ups, calendar_events, crm_deals,                │
│   - manual_tasks, reminders, nba_actions, tickets                         │
│   All multi-tenant by tenantId                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Redis (BullMQ + cache)                                                   │
│   AI_BRIEFING namespace — 8h slot cache for BriefingService              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

**Backend (new):**
```
backend/src/modules/dashboard/
├── dashboard.module.ts                       # Module wiring (imports TasksModule, AiModule, CrmModule, CalendarModule)
├── controllers/
│   └── dashboard.controller.ts               # @Get('today')
├── services/
│   ├── dashboard-today.service.ts            # Aggregator (200-300 lines)
│   ├── today-scorer.service.ts               # Pure scoring functions (testable)
│   └── today-normalizer.service.ts           # Source → TodayFeedItemDto mappers
└── dto/
    ├── today-feed.dto.ts                     # TodayFeedItemDto, TodayFeedResponseDto
    └── today-feed-query.dto.ts               # GetTodayQueryDto (locale, tz, includeGreeting)
```

**Frontend (new + modify):**
```
frontend/
├── components/dashboard/today/                # NEW
│   ├── TodayDashboard.tsx                     # Top-level component (replaces DashboardContainer use)
│   ├── TodayFeedList.tsx                      # Renders all tier sections
│   ├── TodayTierSection.tsx                   # Header + items for one tier
│   ├── TodayFeedItem.tsx                      # 48px row with quick actions + framer-motion exit
│   ├── TodayQuickActions.tsx                  # Complete/Dismiss/Snooze button cluster
│   ├── TodaySnoozeMenu.tsx                    # MUI Menu with 3 snooze options
│   ├── TodayGreeting.tsx                      # Optional greeting text + count chips
│   ├── TodayEmptyState.tsx                    # Celebratory "all caught up"
│   └── TodayLoadingSkeleton.tsx               # 5x 48px skeleton rows
├── hooks/queries/
│   └── use-today.ts                           # NEW: useTodayFeed, useCompleteFeedItem, useSnoozeFeedItem
├── lib/api/
│   └── dashboard.ts                           # NEW: dashboardApi.getTodayFeed()
├── stores/
│   └── today-feed-store.ts                    # NEW: Zustand for session dismiss set + optimistic removals
├── pages/dashboard/
│   └── index.tsx                              # MODIFY: swap DashboardContainer → TodayDashboard
└── locales/
    ├── en.ts                                  # MODIFY: add dashboard.today.* (~25 keys)
    ├── it.ts                                  # MODIFY: add dashboard.today.*
    └── index.ts                               # MODIFY: add dashboard.today type definitions
```

**Files to DELETE (after E2E validation passes):**
```
frontend/components/dashboard/DashboardContainer.tsx
frontend/components/dashboard/DashboardContainer.test.tsx
frontend/components/dashboard/dashboard/widget-registry.ts
frontend/components/dashboard/dashboard/CustomizeDrawer.tsx
frontend/components/dashboard/dashboard/WidgetCard.tsx
frontend/components/dashboard/dashboard/WidgetSkeleton.tsx
frontend/components/dashboard/dashboard/DashboardEmptyState.tsx
frontend/components/dashboard/dashboard/AiQuickAccess.tsx
frontend/components/dashboard/widgets/BriefingWidget.tsx (+ test)
frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx
frontend/components/dashboard/widgets/StaleContactsWidget.tsx (+ test)
frontend/components/dashboard/widgets/AiTriageWidget.tsx (+ test)
frontend/components/dashboard/widgets/FollowUpWidget.tsx
frontend/components/dashboard/widgets/TrendChartsWidget.tsx
frontend/components/dashboard/widgets/DeadlinesWidget.tsx
frontend/components/dashboard/widgets/TodayEventsWidget.tsx
frontend/components/dashboard/widgets/BaseWidget.tsx
frontend/stores/dashboard-store.ts
frontend/lib/dashboard/widget-registry.ts
frontend/lib/dashboard/layout-engine.ts (if no other importers)
```

**Files to KEEP (still imported elsewhere or useful):**
- `frontend/components/dashboard/CrmSuggestionsFeed.tsx` — verify importers (used by widget registry; if no other importer, also delete)
- `frontend/hooks/queries/use-dashboard.ts` — **partially keep**. The `briefingOptions`, `todayEventsOptions`, `followUpsOptions`, `staleContactsOptions`, etc. are used elsewhere. **Audit before deleting individual exports.** The `dashboardPreferencesOptions` + `useDashboardPreferences` + `useSaveDashboardLayout` can be safely removed (only used by `DashboardContainer`).

### Pattern 1: Backend Aggregation with Promise.all

```typescript
// Source: backend/src/modules/ai/services/briefing.service.ts:393-474 (proven pattern)
const [tasks, followUps, deals, events, briefing] = await Promise.all([
  this.tasksAggregation.listTasks(tenantId, userId, {
    sourceType: ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'],
    status: ['pending', 'in_progress'],
    dueBefore: tomorrowEod.toISOString(),
    sortBy: 'dueDate',
    sortOrder: 'asc',
    limit: 100,
  }),
  this.prisma.emailFollowUp.findMany({
    where: {
      tenantId,
      userId,
      status: { in: ['PENDING', 'REMINDED'] as FollowUpStatus[] },
      followUpType: { in: ['WAITING_FOR', 'TODO'] as FollowUpType[] },
    },
    include: { email: { select: { id: true, subject: true, from: true, threadId: true } } },
    orderBy: { dueDate: 'asc' },
    take: 30,
  }),
  this.dealService.list(tenantId, {
    expectedCloseDateFrom: today.toISOString(),
    expectedCloseDateTo: sevenDaysFromNow.toISOString(),
    limit: 20,
  }),
  this.prisma.calendarEvent.findMany({
    where: {
      tenantId,
      isDeleted: false,
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { startTime: 'asc' },
  }),
  includeGreeting
    ? this.briefingService.getBriefing(tenantId, userId, tz, locale).catch(() => null)
    : Promise.resolve(null),
]);
```

### Pattern 2: TanStack Query Hook (frontend)

```typescript
// Source: frontend/hooks/queries/use-dashboard.ts:96-118 (briefingOptions pattern)
export function todayFeedOptions(opts?: { locale?: string; includeGreeting?: boolean }) {
  return queryOptions({
    queryKey: ['dashboard', 'today', opts],
    queryFn: async (): Promise<TodayFeedResponse> => {
      const res = await dashboardApi.getTodayFeed(opts);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,    // per UI-SPEC § State Management
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useTodayFeed(opts?: { locale?: string; includeGreeting?: boolean }) {
  const { locale } = useLocale();
  return useQuery(todayFeedOptions({ locale, includeGreeting: true, ...opts }));
}
```

### Pattern 3: Optimistic Remove + Undo Toast

```typescript
// Source: lib/context/toast-context.tsx supports actionLabel/onAction
const toast = useGlobalToast();
const [hidden, setHidden] = useState<Set<string>>(new Set());

const handleDismiss = (item: TodayFeedItem) => {
  setHidden((s) => new Set(s).add(item.id));               // optimistic
  toast.info(t.dashboard.today.toasts.dismissed, {
    actionLabel: t.dashboard.today.toasts.undo,
    duration: 6000,
    onAction: () => setHidden((s) => { const n = new Set(s); n.delete(item.id); return n; }),
  });
};
```

### Pattern 4: framer-motion Exit Animation

```typescript
// Recommended for height-collapse-after-fade UI-SPEC requires
import { AnimatePresence, motion } from 'framer-motion';

<AnimatePresence initial={false}>
  {visibleItems.map((item) => (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <TodayFeedItem item={item} />
    </motion.div>
  ))}
</AnimatePresence>
```

### Pattern 5: Snooze Date Math (reuse from FollowUpWidget)

```typescript
// Source: frontend/components/dashboard/widgets/FollowUpWidget.tsx:61-83
import { addHours, startOfTomorrow, nextMonday } from 'date-fns';

function snoozeToDate(when: 'oneHour' | 'tomorrow' | 'nextWeek'): Date {
  if (when === 'oneHour') return addHours(new Date(), 1);
  if (when === 'tomorrow') {
    const d = startOfTomorrow();
    d.setHours(9, 0, 0, 0);  // 9 AM tomorrow
    return d;
  }
  const d = nextMonday(new Date());
  d.setHours(9, 0, 0, 0);
  return d;
}
```

### Anti-Patterns to Avoid

- **Calling LLM for every feed render.** `BriefingService.getBriefing()` is cached per slot — DO NOT call `generateBriefing()` directly. The 8h slot cache is critical for cost containment.
- **Ignoring tenant scoping.** Every Prisma query in `DashboardTodayService` MUST include `tenantId`. Failing this is a data leak across tenants. CLAUDE.md hard rule.
- **Adding a new "needsReply" Email column.** No such field exists; do not propose adding it. Reuse `EmailFollowUp` (already what `BriefingService.draftSuggestions` uses) or `aiActionability='todo'` (auto-set by triage; available on `Email`).
- **Server-side persistence for dismiss.** Per UI-SPEC, dismissals are session-only. Adding a DB table now would be deferred-work creep.
- **Calling `aggregationService.dismissTask()` for a follow-up or manual task.** It throws `BadRequestException` — only `deal_action` and `reminder` are supported (`tasks-aggregation.service.ts:201-232`). Frontend must check sourceType before calling, OR the planner must extend `dismissTask()`.
- **Server-side filter toggles.** UI-SPEC says client-side only — keep payload uniform.
- **Hand-rolling height-collapse animations with `setTimeout` choreography.** Use framer-motion's `layout` prop.
- **Inventing new endpoints when existing ones suffice.** Reuse `POST /tasks/:type/:id/complete`, `PATCH /ai/follow-ups/:id/snooze`. The new endpoint is ONLY `GET /dashboard/today` (D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aggregating 5 task sources | Custom multi-source query | `TasksAggregationService.listTasks()` | Already exists, handles status mapping, normalization, pagination, priority sorting. |
| Daily greeting / executive summary | Custom LLM call from new module | `BriefingService.getBriefing()` | Includes Redis slot cache (8h), deterministic fallback, locale-aware copy, cost tracking via `UsageTrackingService`. |
| Calendar events for today | Direct Prisma query duplicated | `CalendarService.listEvents()` (or its existing pattern) | Service handles provider config + soft-delete filter. |
| Snooze date math | New utility | Reuse `addHours`, `startOfTomorrow`, `nextMonday` from date-fns | Already in deps, used by FollowUpWidget. |
| Toast with undo action | New Snackbar wiring | `useGlobalToast()` from `lib/context/toast-context.tsx` | Already supports `actionLabel`, `onAction`, `duration`. Singleton ref pattern. |
| Slide+fade+collapse animation | CSS keyframes + manual height transitions | `framer-motion` `<AnimatePresence>` + `layout` prop | Already in deps; designed for list reflow. |
| Locale-aware date formatting | Manual Intl wrapper | `date-fns` + `formatDistanceToNow` with `it`/`en` locale | Pattern from FollowUpWidget. |

**Key insight:** Roughly 90% of Phase 145 is wiring existing primitives. The new code is one backend service (aggregator), one DTO, one controller endpoint, one frontend API module, one query hook, ~8 small components, and translation keys. Resist the temptation to refactor existing services.

## Runtime State Inventory

(This phase is a UI rewrite + aggregation endpoint; no rename/migration. Included for completeness.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — phase reads existing Prisma tables only. **Zero schema changes recommended.** | None |
| Live service config | None — no new BullMQ queues, no n8n workflows, no Datadog dashboards | None |
| OS-registered state | None — no new cron, no new pm2 process | None |
| Secrets/env vars | None — reuses existing `AI_MODEL_SIMPLE`, `BRIEFING_*` vars via BriefingService. | None |
| Build artifacts | After deletion of widget files, the lazy-loaded chunks for `BriefingWidget`, `FollowUpWidget`, etc. will no longer be generated. Next.js build will tree-shake; no manual cleanup needed. | Verify `next build` passes after widget deletion. |

**Migration concern (file deletion):** When deleting the widget files listed above, the planner MUST verify no external importers exist beyond `DashboardContainer.tsx` and `widget-registry.ts`. Grep audit confirmed (`Grep` for `from.*BriefingWidget|from.*FollowUpWidget|...`) that the widget files are imported ONLY from the widget registry — safe to delete after `DashboardContainer.tsx` removal. **One open question (Q3 below):** `CrmSuggestionsFeed.tsx` is referenced by widget-registry but may also be a stand-alone component used elsewhere — grep before deleting.

## Common Pitfalls

### Pitfall 1: Double-counting follow-ups as both "task" and "email needing reply"

**What goes wrong:** The "emails needing reply" source naively queries `prisma.emailFollowUp.findMany()`. But `TasksAggregationService.listTasks()` ALREADY includes follow-ups via `queryFollowUps()` and surfaces them as `sourceType='follow_up'` in the unified task list. If both are pulled, the same email follow-up appears twice in the feed (once as task, once as email).

**Why it happens:** The two sources overlap — `EmailFollowUp` is the canonical "reply needed" record for emails AND a task source.

**How to avoid:**
- **Option A (recommended):** Treat `follow_up`-type tasks from `TasksAggregationService` as the "email needing reply" tier. Display them with the email-type icon and route to `/dashboard/email/thread/[threadId]` (the `EmailFollowUp.email` relation has `id` which can be used to derive `threadId` via `email.threadId`). The "needs reply" semantics is fully captured.
- **Option B:** Exclude `sourceType='follow_up'` from the tasks query, then query EmailFollowUp separately. More complex; not recommended.

**Warning signs:** Developer testing sees the same email appear twice. Add an integration test for de-duplication.

### Pitfall 2: BriefingService cost spike under heavy usage

**What goes wrong:** If the new endpoint blindly calls `briefingService.getBriefing()` on every dashboard load, and the cache key is wrong, you'll get 1 LLM call per page-view per user.

**Why it happens:** `BriefingService.getBriefing()` IS cached (slot-based, 8h TTL, key `tenantId:userId:locale:date:slotN`) but only if `cacheService` is injected. Verify injection is wired.

**How to avoid:**
- Reuse `briefingService.getBriefing()` (which checks cache first), NOT `generateBriefing()` (which always hits LLM).
- Make `includeGreeting` a query param so polling/quick-refreshes can skip it.
- Add a backend log warn if cache miss rate > 50%.

**Warning signs:** OpenRouter cost ledger shows briefing calls > expected (1 per user per slot = max 3/day per user).

### Pitfall 3: Stuck-deal definition is ambiguous

**What goes wrong:** "Deal alerts (stuck deals)" — there's no `lastActivityAt` field on `CrmDeal`. The closest signal is `updatedAt`, which is touched by *any* update including stage changes.

**Why it happens:** "Stuck" is product-defined.

**How to avoid:** Define stuck as: `updatedAt < now - 14 days` AND `stage.isWon = false` AND `stage.isLost = false` AND `deletedAt IS null`. Document the heuristic in the DTO. Treat "upcoming close date" as: `expectedCloseDate BETWEEN now AND now + 7d`. Both lists may overlap; dedup by `dealId`.

**Warning signs:** Sales user complains "deal that I just emailed is showing as stuck" — `updatedAt` is too coarse. Acceptable for v1; revisit after user feedback.

### Pitfall 4: Calendar event "today" boundaries shift across timezones

**What goes wrong:** Backend computes `startOfDay`/`endOfDay` in UTC by default. User in EST sees an event at 11pm UTC (=6pm EST today) as "tomorrow".

**Why it happens:** Need to compute boundaries in user's TZ.

**How to avoid:** `BriefingService.generateBriefing()` already solves this (lines 376-388). Copy the `tz` resolution pattern into `DashboardTodayService`. The frontend should pass the user's timezone (or use `Intl.DateTimeFormat().resolvedOptions().timeZone` via `useUserTimezone` hook — already exists at `frontend/hooks/use-user-timezone.ts`).

**Warning signs:** UTC user sees correct events; EST user sees off-by-one events at the day boundary.

### Pitfall 5: Optimistic dismiss survives navigation but not reload

**What goes wrong:** UI-SPEC says "Cleared on page reload". If the planner naively persists dismissed IDs to localStorage, the spec is violated AND user confusion increases (item disappears forever from feed).

**Why it happens:** Easy to over-engineer.

**How to avoid:** Use Zustand store WITHOUT `persist` middleware. The state lives only in memory.

**Warning signs:** Reviewer asks "where do dismissals go?" — answer: nowhere. By design.

### Pitfall 6: framer-motion + MUI Lists can stutter

**What goes wrong:** Wrapping each `<ListItem>` in `<motion.div>` breaks MUI's keyboard nav and ARIA semantics.

**Why it happens:** `<List>` expects direct `<ListItem>` children for proper a11y.

**How to avoid:** Either use `<motion.li>` with `component="li"` on parent List (`<List component={motion.ul}>` is supported), or accept that the feed isn't using MUI List semantics and use plain `<motion.div>` as the row container. Given the row format is custom (not standard list-item-text), the second approach is fine. Add explicit ARIA: `role="list"` on container, `role="listitem"` on rows.

**Warning signs:** Lighthouse a11y score drops; screen readers don't announce list semantics.

### Pitfall 7: Removing `useDashboardPreferences` may break unrelated screens

**What goes wrong:** The `dashboardPreferencesOptions`, `useDashboardPreferences`, `useSaveDashboardLayout` hooks live in `use-dashboard.ts`. They're used only by `DashboardContainer.tsx`, but related types (`DashboardLayout`, `WidgetLayout`) come from `@/lib/dashboard/layout-engine`. Deleting layout-engine.ts before grep-auditing all importers can break compile.

**How to avoid:** Run `grep -r "from.*lib/dashboard/layout-engine" frontend/` before deletion. If any importer exists outside the dashboard directory, defer deletion.

**Warning signs:** `npx tsc --noEmit` fails after delete step.

## Code Examples

### Recommended TodayFeedItemDto (backend)

```typescript
// backend/src/modules/dashboard/dto/today-feed.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TODAY_ITEM_TYPES = ['email', 'task', 'deal', 'event'] as const;
export type TodayItemType = (typeof TODAY_ITEM_TYPES)[number];

export const TODAY_TIERS = ['urgent', 'today', 'fyi'] as const;
export type TodayTier = (typeof TODAY_TIERS)[number];

export class TodayFeedItemDto {
  @ApiProperty({ description: 'Composite ID: type_sourceType_sourceId' })
  id!: string;

  @ApiProperty({ enum: TODAY_ITEM_TYPES }) type!: TodayItemType;
  @ApiProperty({ enum: TODAY_TIERS }) tier!: TodayTier;
  @ApiProperty({ description: 'Numeric priority score (higher = more urgent)' }) score!: number;

  @ApiProperty() title!: string;
  @ApiPropertyOptional() subtitle!: string | null;
  @ApiPropertyOptional({ description: 'ISO datetime for time badge', nullable: true })
  dueAt!: string | null;
  @ApiPropertyOptional({ description: 'true = past due' })
  isOverdue!: boolean;

  // Source linkage — enables click-through navigation per D-08
  @ApiPropertyOptional() emailId!: string | null;
  @ApiPropertyOptional() threadId!: string | null;
  @ApiPropertyOptional() taskSourceType!: string | null;     // for task type, mirrors UnifiedTaskDto.sourceType
  @ApiPropertyOptional() taskSourceId!: string | null;
  @ApiPropertyOptional() dealId!: string | null;
  @ApiPropertyOptional() eventId!: string | null;

  // Quick-action capability flags — frontend renders buttons conditionally
  @ApiProperty() canComplete!: boolean;
  @ApiProperty() canDismiss!: boolean;
  @ApiProperty() canSnooze!: boolean;
}

export class TodayFeedCountsDto {
  @ApiProperty() urgent!: number;
  @ApiProperty() today!: number;
  @ApiProperty() fyi!: number;
  @ApiProperty() total!: number;
}

export class TodayFeedResponseDto {
  @ApiProperty({ type: [TodayFeedItemDto] }) items!: TodayFeedItemDto[];
  @ApiProperty({ type: TodayFeedCountsDto }) counts!: TodayFeedCountsDto;
  @ApiPropertyOptional({ description: '2-3 sentence greeting from BriefingService.executiveSummary', nullable: true })
  greeting!: string | null;
  @ApiProperty({ description: 'ISO timestamp of when the feed was generated' })
  generatedAt!: string;
}
```

### Recommended scoring algorithm (deterministic per CONTEXT D-04)

```typescript
// backend/src/modules/dashboard/services/today-scorer.service.ts
@Injectable()
export class TodayScorerService {
  /**
   * Returns { tier, score } for a feed item.
   * Higher score = appears earlier within tier.
   */
  scoreItem(input: {
    type: TodayItemType;
    dueAt: Date | null;
    sourcePriority?: 'low' | 'medium' | 'high' | 'urgent';
    isOverdue: boolean;
    isHardDeadline?: boolean;        // calendar events, ticket SLAs
    isStuck?: boolean;                // deals updatedAt > 14d
  }, now = new Date()): { tier: TodayTier; score: number } {

    // Tier rules (in evaluation order)
    if (input.isOverdue) return { tier: 'urgent', score: this.scoreUrgent(input, now) };
    if (input.sourcePriority === 'urgent') return { tier: 'urgent', score: this.scoreUrgent(input, now) };
    if (input.dueAt && this.isToday(input.dueAt, now)) return { tier: 'today', score: this.scoreToday(input, now) };
    if (input.isHardDeadline && this.isToday(input.dueAt!, now)) return { tier: 'today', score: this.scoreToday(input, now) };
    if (input.isStuck) return { tier: 'fyi', score: this.scoreFyi(input, now) };
    return { tier: 'fyi', score: this.scoreFyi(input, now) };
  }

  private scoreUrgent(i: { dueAt: Date | null }, now: Date): number {
    // More overdue = higher score. Cap at 1000.
    if (!i.dueAt) return 500;
    const overdueHours = Math.max(0, (now.getTime() - i.dueAt.getTime()) / 3_600_000);
    return Math.min(1000, 800 + overdueHours);
  }

  private scoreToday(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 400;
    const minsUntil = (i.dueAt.getTime() - now.getTime()) / 60_000;
    // Closer events score higher within Today tier
    return Math.max(100, 700 - minsUntil);
  }

  private scoreFyi(i: { dueAt: Date | null }, now: Date): number {
    if (!i.dueAt) return 50;
    const hoursUntil = (i.dueAt.getTime() - now.getTime()) / 3_600_000;
    return Math.max(10, 100 - hoursUntil);
  }

  private isToday(d: Date, now: Date): boolean {
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  }
}
```

**Tiebreaker rules within a tier:**
1. By `score` desc (rules above)
2. By `dueAt` asc (earlier first)
3. By `type` (deterministic order: `email > task > event > deal`) for stable sort
4. By `id` (cuid sort) — final tiebreaker for snapshot tests

### Frontend hook for completion + snooze

```typescript
// frontend/hooks/queries/use-today.ts (excerpt)
export function useCompleteFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TodayFeedItem) => {
      if (item.type !== 'task' || !item.taskSourceType || !item.taskSourceId) {
        throw new Error('Only task items can be completed');
      }
      // Reuses existing tasks endpoint
      await apiClient.post(`/tasks/${item.taskSourceType}/${item.taskSourceId}/complete`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
  });
}

export function useSnoozeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, until }: { item: TodayFeedItem; until: Date }) => {
      // Currently only follow-up snooze persists server-side
      if (item.type === 'email' && item.taskSourceType === 'follow_up' && item.taskSourceId) {
        await apiClient.patch(`/ai/follow-ups/${item.taskSourceId}/snooze`, { dueDate: until.toISOString() });
        return;
      }
      // Other types: client-only snooze (Open Question Q1)
      throw new Error('Snooze for this item type is not yet persisted');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'today'] }),
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 9-widget grid with `react-grid-layout` drag-drop and per-user `widgets[]` saved layout | Single curated feed (Superhuman "Important" pattern) | Phase 145 (this) | -1 user pref backend table (dashboard_preferences endpoint becomes unused; deprecation deferred) |
| `BriefingWidget` calls `/ai/briefing` on every dashboard mount | Same `BriefingService.getBriefing()` call, but now invoked server-side from `/dashboard/today` instead of client | Phase 145 | Reduces frontend network calls from N (one per widget) to 1. Briefing cache (8h slot) remains canonical. |
| Follow-ups, deadlines, events shown as separate isolated widgets | Interleaved by tier within single feed | Phase 145 | User cognitive load drops; comparable items compete for attention. |

**Deprecated/outdated:**
- `react-grid-layout` is still in `package.json` but no longer used after this phase. Defer removal to a cleanup phase.
- `dashboard_preferences` API endpoint (`PUT/GET /users/me/dashboard-preferences`) becomes unused. Defer deletion (could be repurposed later).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Stuck deal" definition: `updatedAt < now - 14d` AND not won/lost | Pitfall 3, Scoring | Incorrect heuristic could miss real stuck deals or surface false positives. **User should confirm.** Acceptable initial heuristic; tunable via constant. |
| A2 | Snooze persistence is acceptable as session-only for non-follow-up items | Architectural Map, Open Q1 | Without server-side snooze, a snoozed reminder/event reappears on page reload. Could be confusing. **Plan-checker should confirm with user.** |
| A3 | Dismiss is session-only per UI-SPEC interpretation ("Cleared on page reload") | Pitfall 5, Open Q2 | Same as A2 — items reappear after reload. Per UI-SPEC, this is intentional. |
| A4 | Filter toggles are client-side only (don't refetch backend on toggle) | UI-SPEC | Backend payload always uniform. Lower complexity; matches UI-SPEC. |
| A5 | Greeting greeting text source is `BriefingService.briefing.executiveSummary` (2-3 sentences) | Pattern 2 | If the user prefers a different copy ("Good morning, you have N items"), implement client-side from counts only and skip BriefingService entirely. **Discretion per CONTEXT.** |
| A6 | Calendar events without `dueDate` use `startTime` as the comparable date | Scoring | Calendar events are anchored at startTime; this is the natural comparable. |
| A7 | "Emails needing reply" = `EmailFollowUp` records (NOT `Email.aiActionability='todo'`) | Pitfall 1, Standard Stack | Picks the path that integrates with `TasksAggregationService`. Alternative: query `prisma.email.findMany({ where: { aiActionability: 'todo', ... } })` — would require de-dup against follow-ups. |
| A8 | The new endpoint accepts query params `locale`, `tz`, `includeGreeting` only — no `cursor`/`page` (single-shot list, max ~30 items) | DTO design | If list grows >100 items, client perf may degrade. UI-SPEC mentions "no virtualization needed (max ~30 items)" — assumption holds. |

## Open Questions

1. **Snooze persistence for non-follow-up items**
   - **What we know:** Follow-ups have `PATCH /ai/follow-ups/:id/snooze` (verified `backend/src/modules/ai/controllers/ai.controller.ts:728`). Reminders have a `status` field but no snooze endpoint. Calendar events, deals, NBA actions have no snooze concept at all.
   - **What's unclear:** When the user snoozes a calendar event for "1 hour", what happens server-side?
   - **Recommendation:** v1 — snooze persists ONLY for follow-up-derived items (the most common case). For other types, snooze is a client-side soft-hide that disappears on reload (consistent with dismiss). Document this honestly in the toast text. The plan-checker should flag this for user confirmation. If user requires durable snooze for all types, a `today_user_state` table is needed (small Prisma migration).

2. **Dismiss persistence for non-task items**
   - **What we know:** `TasksAggregationService.dismissTask()` only handles `deal_action` and `reminder` (`backend/src/modules/tasks/services/tasks-aggregation.service.ts:201-232`).
   - **What's unclear:** Dismiss for calendar event / unlinked email / manual task / ticket — does the user want this persistent?
   - **Recommendation:** Per UI-SPEC interpretation ("Cleared on page reload"), client-only via Zustand. **Plan-checker confirms with user.**

3. **`CrmSuggestionsFeed.tsx` deletion safety**
   - **What we know:** `CrmSuggestionsFeed` is in widget-registry but might be used standalone (e.g., by an AI suggestions page).
   - **Recommendation:** Run `grep -r "CrmSuggestionsFeed" frontend/ --exclude-dir=node_modules` in the first plan task. Only delete if zero non-widget-registry importers.

4. **Greeting freshness vs. cost**
   - **What we know:** BriefingService caches per 8h slot. If the user opens the dashboard at 7:59am and refreshes at 8:01am, the greeting changes (slot rolls over).
   - **What's unclear:** Is that acceptable, or do we want intra-slot stability?
   - **Recommendation:** Acceptable; current behavior. Document in Today endpoint docstring.

5. **De-duping a follow-up that is also a triage `aiActionability='todo'`**
   - **What we know:** Both can be true for the same email.
   - **Recommendation:** Prefer follow-up record when both present (richer metadata). Skip raw `aiActionability` query unless follow-ups are empty.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend + Frontend | ✓ (project standard) | per repo | — |
| PostgreSQL | Source data (4 sources) | ✓ (Railway production, local dev) | 15.x | — |
| Redis | BriefingService cache (greeting) | ✓ (Railway production, local dev) | 7.x | If unavailable, BriefingService falls back to direct generation (slower, costlier). Greeting can be omitted entirely via `includeGreeting=false`. |
| OpenRouter API key | BriefingService LLM call (greeting) | ✓ (env: `OPENROUTER_API_KEY`) | — | If LLM call fails, `BriefingService.generateBriefing` returns deterministic fallback (line 144-161 of briefing.service.ts) — `executiveSummary: "Unable to generate briefing at this time."`. Frontend should gracefully omit greeting when this string appears. |
| `AI_MODEL_SIMPLE` env var | BriefingService model selection | ✓ (defaults to `mistralai/mistral-small-3.1-24b-instruct`) | — | Falls back to default. |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None block execution.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend Framework | Jest + ts-jest (`backend/jest.config.js`) |
| Backend test pattern | `<rootDir>/src/**/*.spec.ts`, `<rootDir>/test/**/*.spec.ts` |
| Backend coverage gate | 50% branches/functions/lines/statements (project default) |
| Backend quick run command | `cd backend && npx jest --testPathPattern="dashboard" --no-coverage` |
| Backend full suite command | `cd backend && npm test` |
| Frontend Framework | Jest (`frontend/jest.config.js`) |
| Frontend test pattern | `*.test.tsx`, `*.test.ts` |
| Frontend quick run command | `cd frontend && npx jest --testPathPattern="today"` |
| Frontend full suite command | `cd frontend && npm test` |
| Type check | `cd backend && npx tsc --noEmit` and `cd frontend && npm run type-check` (CLAUDE.md mandates after every edit) |
| Lint | `cd backend && npm run lint:win` and `cd frontend && npm run lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-05 | Endpoint `GET /dashboard/today` returns items grouped by tier with counts | unit (service) | `cd backend && npx jest dashboard-today.service.spec.ts -t "groups items by tier"` | ❌ Wave 0 |
| NAV-05 | Aggregation calls all 4 sources in parallel and tolerates one source failing | unit | `cd backend && npx jest dashboard-today.service.spec.ts -t "tolerates source failure"` | ❌ Wave 0 |
| NAV-05 | Scoring: overdue → urgent, due today → today, upcoming ≤24h → fyi | unit (pure) | `cd backend && npx jest today-scorer.service.spec.ts` | ❌ Wave 0 |
| NAV-05 | Multi-tenancy: tenant A cannot see tenant B's items | integration | `cd backend && npx jest dashboard.controller.spec.ts -t "tenant isolation"` | ❌ Wave 0 |
| NAV-05 | Frontend `TodayDashboard` renders three tier sections with correct counts | RTL component | `cd frontend && npx jest TodayDashboard.test.tsx` | ❌ Wave 0 |
| NAV-05 | Quick action complete: optimistic remove + toast + undo restores | RTL component | `cd frontend && npx jest TodayFeedItem.test.tsx -t "complete with undo"` | ❌ Wave 0 |
| NAV-05 | Click row navigates to entity (`router.push('/dashboard/email/thread/[id]')` per type) | RTL component | `cd frontend && npx jest TodayFeedItem.test.tsx -t "navigation"` | ❌ Wave 0 |
| NAV-05 | Empty state renders when items array is empty | RTL | `cd frontend && npx jest TodayEmptyState.test.tsx` | ❌ Wave 0 |
| NAV-05 | Snooze for follow-up calls `PATCH /ai/follow-ups/:id/snooze` | RTL + msw | `cd frontend && npx jest use-today.test.ts -t "snooze follow-up"` | ❌ Wave 0 |
| Manual | Real Edge browser E2E on Railway/Vercel staging — load dashboard, dismiss item, undo | manual | Playwright via Edge CDP per memory `reference_playwright_debug.md` + `reference_railway_e2e.md` | manual |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npm run type-check` (mandatory per CLAUDE.md)
- **Per wave merge:** Backend Jest scope `--testPathPattern="dashboard"` + Frontend Jest scope `--testPathPattern="today"`
- **Phase gate:** Full backend + frontend Jest suite green; manual Edge CDP E2E sign-off (per memory `feedback_e2e_validation_mandatory.md`)

### Wave 0 Gaps
- [ ] `backend/src/modules/dashboard/services/__tests__/dashboard-today.service.spec.ts` — covers NAV-05 aggregation/grouping
- [ ] `backend/src/modules/dashboard/services/__tests__/today-scorer.service.spec.ts` — covers scoring rules (pure functions, easy to test)
- [ ] `backend/src/modules/dashboard/controllers/__tests__/dashboard.controller.spec.ts` — covers tenant isolation + endpoint contract
- [ ] `frontend/components/dashboard/today/TodayDashboard.test.tsx` — covers tier rendering + greeting + counts
- [ ] `frontend/components/dashboard/today/TodayFeedItem.test.tsx` — covers quick actions + navigation + animations (mock framer-motion)
- [ ] `frontend/components/dashboard/today/TodayEmptyState.test.tsx` — covers all-caught-up + nothing-on-plate variants
- [ ] `frontend/hooks/queries/use-today.test.ts` — covers `useTodayFeed`, `useCompleteFeedItem`, `useSnoozeFeedItem` mutations
- [ ] No new test framework install needed — Jest already in both backend + frontend

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuses `TenantGuard` + `RolesGuard` decorators on `DashboardController` (project standard) — better-auth session via cookie. |
| V3 Session Management | yes | Cookie-based session (`@ApiCookieAuth()`); same as TasksController. |
| V4 Access Control | yes | Per-tenant via `req.user.tenantId` in every Prisma query (CLAUDE.md hard rule). |
| V5 Input Validation | yes | `class-validator` on `GetTodayQueryDto` (locale, tz, includeGreeting). Validate `tz` against IANA list to prevent injection into `Intl.DateTimeFormat`. |
| V6 Cryptography | no | No new secrets; reuses existing field encryption for emails (transparent at Prisma level). |
| V7 Error Handling | yes | Use NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`). Don't leak internal LLM errors to client — wrap in `InternalServerErrorException` with generic message. |
| V8 Data Protection | yes | Greeting from BriefingService may include email subjects. Confirm executiveSummary is sanitized before returning (no raw HTML, no email body content). The current BriefingService output is plain text from LLM — safe. |
| V9 Communications | n/a | No new external endpoints called. |

### Known Threat Patterns for {NestJS + Next.js + Prisma}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak (forgetting `tenantId` filter) | Information disclosure | Mandatory `tenantId` in every `prisma.*.findMany()`. Code review checklist. CLAUDE.md hard rule. |
| LLM prompt injection via email subjects in greeting | Tampering | BriefingService already sandboxes LLM input via JSON-encoded context (`briefing.service.ts:494`). Output is JSON with strict zod schema validation — no execution path. |
| User snoozes/dismisses another user's item by guessing IDs | Tampering, Elevation | All snooze/complete endpoints already check `tenantId` AND `userId` (`tasks-aggregation.service.ts:144-152`). |
| Optimistic dismiss leaks across users (shared session/cache) | Information disclosure | Zustand store is per-window; no shared cache. Confirmed. |
| Rate limit abuse on `/dashboard/today` (cheap to hit, expensive backend) | DoS | Apply `@RateTierDecorator('safe-read')` (project pattern). Endpoint should be CPU-bound on aggregation (~5-20 Prisma queries) — guard with rate tier. |
| `tz` query param injection (e.g., `'; DROP TABLE…`) | Tampering | Validate against `Intl.supportedValuesOf('timeZone')` allowlist OR catch `RangeError` from `Intl.DateTimeFormat` constructor. |

## Sources

### Primary (HIGH confidence — direct codebase evidence)

- `backend/src/modules/tasks/services/tasks-aggregation.service.ts` (lines 51, 137, 201) — TasksAggregationService API
- `backend/src/modules/tasks/dto/unified-task.dto.ts` — UnifiedTaskDto shape
- `backend/src/modules/tasks/controllers/tasks.controller.ts` (lines 102, 170) — existing complete endpoint
- `backend/src/modules/ai/services/briefing.service.ts` (lines 33-86, 307, 370, 393-474) — BriefingService schema, slot caching, parallel data fetch pattern
- `backend/src/modules/ai/controllers/ai.controller.ts` (lines 476, 525, 728) — briefing + follow-ups + snooze endpoints
- `backend/src/modules/calendar/controllers/calendar.controller.ts` (lines 186-202) — listEvents endpoint signature
- `backend/src/modules/crm/deal/services/deal.service.ts` (lines 39-99) — DealService.list signature
- `backend/src/modules/crm/deal/dto/deal.dto.ts` (lines 123-180) — ListDealsQueryDto
- `backend/prisma/schema.prisma` — Email (lines 502-599), CalendarEvent (769-810), CrmDeal (1876-1914), EmailFollowUp (1308-1340)
- `backend/src/common/services/cache.service.ts` (lines 17-55) — CacheNamespace enum
- `frontend/hooks/queries/use-dashboard.ts` — TanStack Query patterns, briefingOptions, todayEventsOptions
- `frontend/hooks/queries/use-follow-ups.ts` — useSnoozeFollowUp hook signature
- `frontend/components/dashboard/DashboardContainer.tsx` — current swap target
- `frontend/components/dashboard/dashboard/widget-registry.ts` — widgets to remove
- `frontend/components/dashboard/widgets/FollowUpWidget.tsx` (lines 28-83) — snooze date math pattern
- `frontend/components/dashboard/widgets/BaseWidget.tsx` — loading/error/empty pattern (reference, not reused)
- `frontend/lib/context/toast-context.tsx` — useGlobalToast API surface
- `frontend/components/common/PageContainer.tsx` — page wrapper for header
- `frontend/pages/dashboard/index.tsx` — exact integration point (line 16)
- `frontend/locales/en.ts` (line 541) — existing dashboard translation namespace
- `frontend/locales/index.ts` (line 468) — DashboardTranslations type
- `frontend/package.json` (line 92) — framer-motion 12.33.0 confirmed
- `frontend/jest.config.js`, `backend/jest.config.js` — test framework config
- `.planning/STATE.md` — Phase 137 + 142 completion status
- `.planning/ROADMAP.md` (lines 168-256) — phase dependency confirmation
- `.planning/REQUIREMENTS.md` (line 16) — NAV-05 wording
- `CLAUDE.md` — project constraints (multi-tenant, MUI v7, max 500 lines/file, no `prisma db push`, post-edit type-check)
- Memory `feedback_e2e_validation_mandatory.md` — E2E browser validation required at end of phase
- Memory `reference_playwright_debug.md`, `reference_railway_e2e.md` — manual E2E approach

### Secondary (MEDIUM confidence)

- `.claude/skills/nestjs-best-practices/SKILL.md` — module/DI/security rules (CRITICAL priority items: `arch-feature-modules`, `arch-single-responsibility`, `security-validate-all-input`)

### Tertiary (LOW confidence — none used)

None. All claims in this research are from direct codebase reads or project documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against `package.json` or import statements; backend services verified by reading actual TypeScript signatures.
- Architecture: HIGH — diagram derived from existing patterns (BriefingService parallel fetch, TasksAggregationService aggregation). Module placement follows project convention.
- Pitfalls: HIGH — Pitfalls 1-3 caught from reading actual schema (no `aiNeedsReply`) and existing service code (dismissTask only supports 2 types). Pitfalls 4-7 are derived from project memory + CLAUDE.md rules.
- Open questions: HIGH — questions are about user preference/scope, not technical uncertainty.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days). Re-verify if Phase 144 introduces shared dashboard infrastructure or if Phase 146 (RAM Harden) changes Redis cache namespace assumptions.
