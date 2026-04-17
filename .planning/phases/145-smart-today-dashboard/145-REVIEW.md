---
phase: 145-smart-today-dashboard
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - backend/src/modules/dashboard/dto/today-feed.dto.ts
  - backend/src/modules/dashboard/dto/get-today-query.dto.ts
  - backend/src/modules/dashboard/services/today-scorer.service.ts
  - backend/src/modules/dashboard/services/dashboard-today.service.ts
  - backend/src/modules/dashboard/controllers/dashboard.controller.ts
  - backend/src/modules/dashboard/dashboard.module.ts
  - backend/src/modules/dashboard/services/__tests__/today-scorer.service.spec.ts
  - backend/src/modules/dashboard/services/__tests__/dashboard-today.service.spec.ts
  - backend/src/modules/dashboard/controllers/__tests__/dashboard.controller.spec.ts
  - backend/src/modules/dashboard/dto/__tests__/get-today-query.dto.spec.ts
  - backend/src/app.module.ts
  - frontend/lib/api/dashboard.ts
  - frontend/hooks/queries/today-keys.ts
  - frontend/hooks/queries/use-today.ts
  - frontend/hooks/queries/__tests__/use-today.test.ts
  - frontend/stores/today-feed-store.ts
  - frontend/components/dashboard/today/index.ts
  - frontend/components/dashboard/today/TodayLoadingSkeleton.tsx
  - frontend/components/dashboard/today/TodayEmptyState.tsx
  - frontend/components/dashboard/today/TodayGreeting.tsx
  - frontend/components/dashboard/today/TodayTierSection.tsx
  - frontend/components/dashboard/today/SnoozeMenu.tsx
  - frontend/components/dashboard/today/TodayQuickActions.tsx
  - frontend/components/dashboard/today/TodayFeedItem.tsx
  - frontend/components/dashboard/today/TodayFeedList.tsx
  - frontend/components/dashboard/today/TodayDashboard.tsx
  - frontend/components/dashboard/today/__tests__/TodayFeedItem.test.tsx
  - frontend/components/dashboard/today/__tests__/TodayEmptyState.test.tsx
  - frontend/components/dashboard/today/__tests__/TodayDashboard.test.tsx
  - frontend/locales/en.ts
  - frontend/locales/it.ts
  - frontend/locales/index.ts
  - frontend/pages/dashboard/index.tsx
  - frontend/hooks/queries/use-dashboard.ts
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 145: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 145 introduces the Smart Today Dashboard — a new `/dashboard/today` backend endpoint plus a Superhuman-style frontend surface that replaces the legacy widget grid. The implementation is generally solid:

- Tenant scoping is correctly enforced on every Prisma `where` clause and the controller propagates `req.user.tenantId` cleanly.
- Per-source `.catch()` wrapping gives graceful degradation as documented in RESEARCH.
- DTO has explicit Swagger metadata, deterministic scoring is fully unit-tested, and the IANA tz allowlist correctly rejects injection-shaped values.
- TanStack Query hooks honour the project's 5min/30min/retry=1 cache tier.
- Translations are present in both `en.ts` and `it.ts` with matching shape via `TodayTranslations` interface.

That said, there are several real issues worth fixing before this hardens. Two of them affect correctness (a dead branch in the scorer, and an a11y `list`/`listitem` nesting break that strips screen-reader semantics), and one will silently mis-classify items at midnight in non-UTC locales because the scorer does local-clock comparisons on UTC `Date` values that come pre-converted from the aggregator's tz-window code path. There are no critical security findings — the only thing close was a worry about logging tenant IDs into the warn lines, but those are fine (tenant-only, no secrets). No raw `apiClient.get()` calls in components, no hardcoded English strings, no Tailwind utilities, no file over 500 lines.

The biggest single concrete risk is **WR-01** (silently dead `isHardDeadline` branch — events that are not "today" never reach the urgent/today path because `isHardDeadline` is checked AFTER the same condition; if the gating intent was different, the rule is now a no-op and events scheduled for tomorrow but tagged hard-deadline collapse into FYI). Rest are warnings or polish.

## Warnings

### WR-01: Dead branch in `TodayScorerService.scoreItem` — `isHardDeadline` rule is unreachable

**File:** `backend/src/modules/dashboard/services/today-scorer.service.ts:39-44`

**Issue:** The two `if` conditions are evaluated in order:

```ts
if (input.dueAt && this.isToday(input.dueAt, now)) {
  return { tier: 'today', score: this.scoreToday(input, now) };
}
if (input.isHardDeadline && input.dueAt && this.isToday(input.dueAt, now)) {
  return { tier: 'today', score: this.scoreToday(input, now) };
}
```

The second branch is a strict subset of the first — any input that satisfies it already returned on the previous line. Per the RESEARCH spec, hard deadlines (calendar events, ticket SLAs) are supposed to escalate items even when `dueAt` is not "today" (e.g., a SLA that fires tomorrow). As written, `isHardDeadline` has zero effect on classification. Result: any future-dated event/SLA falls through to `fyi` even when it is genuinely a hard deadline.

This is masked in tests because the only event covered (`scoreItem(... isHardDeadline: true, dueAt: today)`) hits the first branch, not the second. The aggregator only ever passes calendar events from the same-day window (`startOfDay..endOfDay`), so the bug is latent today, but anyone wiring SLAs / ticket-deadlines into the feed will get silently wrong tiering.

**Fix:** Decide which behaviour is correct, then fix the predicate. Two plausible options:

```ts
// Option A — hard deadlines should escalate to URGENT regardless of "today"
if (input.isHardDeadline && input.dueAt) {
  return { tier: 'urgent', score: this.scoreUrgent(input, now) };
}
if (input.dueAt && this.isToday(input.dueAt, now)) {
  return { tier: 'today', score: this.scoreToday(input, now) };
}

// Option B — hard deadlines should be visible in 'today' even if dueAt is tomorrow
if (input.dueAt && this.isToday(input.dueAt, now)) {
  return { tier: 'today', score: this.scoreToday(input, now) };
}
if (input.isHardDeadline && input.dueAt /* && within next N hours */) {
  return { tier: 'today', score: this.scoreToday(input, now) };
}
```

Add a unit test that pins the chosen semantics so this can't regress.

### WR-02: `TodayScorerService.isToday` uses local server clock — wrong day at midnight in user's timezone

**File:** `backend/src/modules/dashboard/services/today-scorer.service.ts:73-79`

**Issue:** `isToday` compares `getFullYear()/getMonth()/getDate()`, which read the *server's* local timezone (Railway runs UTC). The aggregator computes `startOfDay`/`endOfDay` in the user's timezone (`computeWindows`), but then passes raw `Date` instances to the scorer where this method runs. For a user in `America/Los_Angeles` at 23:30 local (07:30 UTC next day), an event `dueAt = today 22:00 PT (06:00 UTC next day)` becomes "today" in user time but "yesterday" or "tomorrow" depending on the comparison anchor → the event is classified `fyi` instead of `today`.

The `now` passed in is also `new Date()` (UTC on Railway), so the bug is symmetric.

**Fix:** Either pass the user's `tz` into the scorer and use `Intl.DateTimeFormat(..., { timeZone: tz }).formatToParts(...)` for the comparison, or compare against `startOfDay`/`endOfDay` ranges that the aggregator already computes:

```ts
isToday(d: Date, now: Date, tz: string = 'UTC'): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d) === fmt.format(now);
}
```

Add a unit test pinning `now = '2026-04-17T07:00:00Z'`, `dueAt = '2026-04-17T05:00:00Z'`, `tz='America/Los_Angeles'` and assert tier is `today`.

### WR-03: A11y — `role="list"` and `role="listitem"` are not parent/child (semantics stripped)

**File:** `frontend/components/dashboard/today/TodayFeedList.tsx:36-61`, `frontend/components/dashboard/today/TodayFeedItem.tsx:145`

**Issue:** ARIA requires `role="listitem"` to be a direct child of the element with `role="list"`. The current tree:

```
<Box role="list">              // TodayFeedList
  <TodayTierSection>           // Box (no role)
    <Box>                      // tier inner wrapper
      <AnimatePresence>
        <motion.div>           // wrapper
          <Box role="listitem"> // TodayFeedItem
```

There are 4 non-list elements between them. Both NVDA and JAWS will discard the listitem semantics in this configuration; VoiceOver will under-report the list count. The PR comment in `TodayFeedList.tsx:8` claims the role survives "framer-motion structural changes" — that is not true when `motion.div` and tier sections sit between them.

**Fix:** Either drop the `role="list"`/`role="listitem"` pair entirely (let MUI render semantic neutrals — the visual structure is enough), or restructure so each tier section uses `role="group"` with `aria-labelledby` and only the inner row container uses `role="list"`:

```tsx
// TodayTierSection
<Box role="group" aria-labelledby={`tier-${tier}-heading`}>
  <Typography id={`tier-${tier}-heading`} ...>{label} ({count})</Typography>
  <Box role="list">{children}</Box>
</Box>
```

And ensure `motion.div` has `role="listitem"` (or apply it to the wrapping `motion.div` directly via `motion.li` and drop the inner Box role).

### WR-04: `TodayDashboard` recomputes `liveCounts` but passes stale `data.items` to `TodayFeedList`

**File:** `frontend/components/dashboard/today/TodayDashboard.tsx:31-68`

**Issue:** Line 31 builds `visibleItems` by filtering out dismissed IDs, then line 34 derives `liveCounts` from `visibleItems`. Good. But line 68 passes `items={data.items}` (NOT `visibleItems`) to `<TodayFeedList />`. The list then re-applies the same dismiss filter inside itself (line 30 of TodayFeedList) and recomputes `byTier`. The `counts` prop is also passed but `TodayFeedList` doesn't use it (the prop is in the type but the implementation only renders `tierItems.length`).

Net effect: filter runs twice on every render, and the `liveCounts` computed in the parent are only consumed by `TodayGreeting`. That works, but it duplicates work and creates a footgun where the source of truth for "what is visible" lives in two places.

**Fix:** Either (a) pass `visibleItems` to `TodayFeedList` and remove the dismiss-filter from inside it, or (b) drop the parent's `visibleItems`/`liveCounts` and let `TodayFeedList` push the filtered counts back via a callback or context. Option (a) is simpler:

```tsx
<TodayFeedList items={visibleItems} counts={liveCounts} />
```

…and inside `TodayFeedList.tsx`, drop the duplicate `useTodayFeedStore` subscription + filter.

### WR-05: Snooze undo toast is a no-op — comment admits it but ships a button anyway

**File:** `frontend/components/dashboard/today/TodayFeedItem.tsx:124-134`

**Issue:** The snooze toast renders an "Undo" action button, but the `onAction` callback is empty:

```ts
onAction: () => {
  // Snooze undo not implemented in MVP — restore is client-side dismiss revert.
  // The next refetch invalidation will surface the row again.
},
```

Clicking Undo does nothing (the comment about "next refetch invalidation will surface the row again" is wrong — the snooze mutation has already invalidated the query in `useSnoozeFeedItem.onSuccess`, but the row will not come back because the underlying follow-up `dueDate` was patched server-side). Users will rage-click and assume it's broken.

**Fix:** Either remove the Undo button entirely from snooze toasts (drop `actionLabel` and `onAction`) or actually implement undo by capturing the previous `dueDate` from the item before mutation and PATCHing it back on Undo:

```ts
const prevDue = item.dueAt;
await snoozeMutation.mutateAsync({ item, until });
toast.info(t.dashboard.today.toasts.snoozed.replace('{time}', timeLabel), {
  // No actionLabel/onAction in MVP — drop them entirely.
  duration: 4000,
});
```

### WR-06: `TodayFeedItem` row click handler swallows middle-click and Cmd/Ctrl+click — kills "open in new tab"

**File:** `frontend/components/dashboard/today/TodayFeedItem.tsx:74-89, 142-148`

**Issue:** The whole row is a `<Box onClick={handleRowClick}>` that calls `router.push(...)`. There is no anchor (`<a>`) underneath. Power users who Cmd-click / Ctrl-click / middle-click expecting "open thread in new tab" will get the same in-place navigation as a regular click. This breaks Superhuman-style power-user expectation that the spec explicitly invokes (RESEARCH lines 530-585).

There is also no keyboard `Enter`/`Space` accessibility support for "open in new tab" — but since there is no anchor, screen-reader users also get no announcement that this row is a link.

**Fix:** Wrap the clickable region in a Next.js `<Link>` (or render the outer `Box` as `component={NextLink} href={...}`) and let the framework handle navigation:

```tsx
import Link from 'next/link';
const href = computeHref(item); // factor navigate() into a pure href computer
<Box component={Link} href={href} prefetch={false} ...>
```

That gets you middle-click, Cmd-click, focus-visible, and `aria-label` on the link element for free. Quick action buttons inside it still need `e.stopPropagation()` and `e.preventDefault()` (currently only `stopPropagation`).

## Info

### IN-01: Unused `theme` import / variable in `TodayFeedItem.tsx`

**File:** `frontend/components/dashboard/today/TodayFeedItem.tsx:21, 60`

**Issue:** `useTheme()` is imported and called, then only `theme.palette[color].main` and `theme.palette.primary.main` are used. That's fine, but the wider-than-necessary import surface (the destructured `useTheme` from MUI is fine but the call result `theme` is used in a sx callback on line 162 too). Just noting — no action needed unless lint flags it.

**Fix:** None — verifying just that `npx tsc --noEmit` passes is sufficient.

### IN-02: `as never` and `as never[]` casts in aggregator hide type drift

**File:** `backend/src/modules/dashboard/services/dashboard-today.service.ts:89, 102, 110, 134, 154`

**Issue:** Several places use `as never` / `as never[]` to shut up the compiler:
- `status: { in: ['PENDING', 'REMINDED'] as never[] }` — should be the actual `EmailFollowUpStatus` enum from Prisma client.
- `.list(tenantId, { ... } as never)` — bypasses `ListDealsQueryDto` validation entirely.
- `return [] as never[]` in `.catch()` — defeats the static type of `.findMany()` and propagates `never[]` into the normalizer, where it is then re-cast to the expected shape via another `as`.

This works today but means a Prisma column rename or DTO field rename will not surface as a compile error.

**Fix:** Replace each cast with the actual generated Prisma enum / DTO type:

```ts
import { EmailFollowUpStatus, Prisma } from '@prisma/client';
status: { in: [EmailFollowUpStatus.PENDING, EmailFollowUpStatus.REMINDED] }
```

For `.list(tenantId, ...)`, build a typed `Partial<ListDealsQueryDto>` instead of casting. For the empty fallbacks, use `[] as Awaited<ReturnType<typeof this.prisma.emailFollowUp.findMany>>`.

### IN-03: Greeting computed from pre-dismiss `data.items` first, then liveCounts based on post-dismiss

**File:** `frontend/components/dashboard/today/TodayDashboard.tsx:62-69`

**Issue:** The greeting is conditionally rendered when `data.greeting !== null || liveCounts.total > 0`, but the greeting body itself is generated server-side by `BriefingService.executiveSummary`, which uses *server-side* counts that pre-date any client dismissals. Users who dismiss everything except an FYI item will still see a greeting like "You have 3 urgent items today" because the server-side text is frozen. Note: the locale fallback on `TodayGreeting.tsx:27-31` correctly uses `liveCounts`, but only fires when `greeting === null`.

**Fix:** Either accept this as MVP behaviour (briefing is cached for 8h anyway, so it's already going to be stale relative to current state) OR strip the count-numerals from the server-side greeting text and always render counts client-side from `liveCounts`. Add a comment in `TodayDashboard.tsx` documenting the MVP choice.

### IN-04: Empty-state preview shows `data.items[0]`, not the next non-dismissed item

**File:** `frontend/components/dashboard/today/TodayDashboard.tsx:66`

**Issue:** When the user has dismissed all visible items (so `visibleItems.length === 0` triggers `isEmpty`), the preview row inside `TodayEmptyState` is `data.items[0] ?? undefined` — i.e. it could show an item that the user *just dismissed*, defeating the celebratory "look at what's coming next" intent.

**Fix:** Use the first dismissed-aware lookahead, or fall back to nothing if all are dismissed:

```tsx
const nextItem = data.items.find((i) => !dismissedIds.has(i.id));
isEmpty ? <TodayEmptyState nextItem={nextItem} /> : ...
```

Note: this only matters in the all-dismissed edge case — in practice the server returns no items at all and `data.items[0]` is also undefined. So this is "defensive correctness" rather than a live bug.

### IN-05: Source-failure logs print `(err as Error)?.message` only — no stack, no traceId

**File:** `backend/src/modules/dashboard/services/dashboard-today.service.ts:77-167`

**Issue:** The six `.catch()` blocks log `{ err: message, source }` to a Pino logger. When one source dies in production, the operator only gets the message string and the source label — no stack trace, no requestId, no tenantId. PMSync uses `nestjs-pino` which automatically attaches `requestId` from the middleware, so requestId is fine. But the absence of stack means debugging "tasks source intermittently fails" requires reproducing locally.

Also `tenantId` is intentionally absent — that is correct (PII / tenancy in logs is gated by the audit module). Just flagging for awareness.

**Fix:** Pass the error object as the second arg so Pino captures stack:

```ts
.catch((err: unknown) => {
  this.logger.warn(err as Error, `today-feed source failed: tasks`);
  return emptyTasksRes();
})
```

Or, if the Pino API in this project is `(obj, msg)` ordering, use `{ err }` and let the Pino serializer handle it.

### IN-06: `dashboardApi.getTodayFeed` query passing `?` and primitives — verify axios serializer handles `undefined`

**File:** `frontend/lib/api/dashboard.ts:60-62`

**Issue:** `apiClient.get<TodayFeedResponse>('/dashboard/today', { params: query })` passes `query` even when it has `undefined` fields. Most axios setups skip undefined keys, but this hasn't been spot-checked here. If your axios config serializes `undefined` as the string `"undefined"`, the backend will receive `?locale=undefined` and the `IsIn(['en', 'it'])` validator will 400.

**Fix:** None if your axios `paramsSerializer` is the default (skips undefined). Worth a one-line manual test:

```bash
curl -i "http://localhost:3000/api/v1/dashboard/today?tz=Europe/Rome"
```

…to confirm 200 and not a 400 from the validator.

### IN-07: `use-dashboard.ts` retains a header comment claiming widget hooks were removed but `useFollowUps`/`useEmailTrends`/etc. still exist — minor doc drift

**File:** `frontend/hooks/queries/use-dashboard.ts:1-15`

**Issue:** The phase 145 cleanup comment (lines 4-9) reads "legacy widget-only hooks removed (briefing, deadlines, todayEvents, recentUnreadEmails, importantEmails, triagedEmails, dashboard preferences)" but `useFollowUps`, `useStaleContacts`, `useRecentContacts`, `useEmailTrends` are still exported and consumed elsewhere. The comment is accurate but reads as if the file is empty post-cleanup. Could mislead a future reader.

**Fix:** Tighten the comment to clarify that *some* hooks survive because non-widget consumers use them:

```ts
/**
 * Phase 145 Plan 03 cleanup: removed widget-only hooks (briefing, deadlines, ...)
 * Surviving exports: useFollowUps (todo widget on /tasks), useStaleContacts (contacts page),
 * useRecentContacts (contacts page), useEmailTrends (analytics page).
 */
```

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
