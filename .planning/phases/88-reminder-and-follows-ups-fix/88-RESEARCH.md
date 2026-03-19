# Phase 88: Reminder and Follow-Ups Fix - Research

**Researched:** 2026-03-19
**Domain:** Frontend dashboard widgets, follow-up system, reminder dialogs
**Confidence:** HIGH

## Summary

Phase 88 addresses 7 bugs across the dashboard and reminders system. All bugs are frontend-only -- the backend endpoints exist and work correctly. The fixes are straightforward wiring issues, dead code, and UI polish problems. No new backend work, no schema changes, no new dependencies required.

The bugs break down into three categories: (1) wiring gaps where working hooks/APIs exist but are not connected to components (BUG 1, BUG 2), (2) dead code and missing widgets (BUG 3, BUG 5), and (3) UI polish issues (BUG 4, BUG 6, BUG 7).

**Primary recommendation:** Fix in priority order -- BUG 1 and BUG 2 first (high severity, simple wiring), then BUG 3-5 (medium, cleanup + new widget), then BUG 6-7 (low, polish).

## Standard Stack

### Core (Already in Project)
| Library | Purpose | Relevant Files |
|---------|---------|----------------|
| `@tanstack/react-query` | Server state hooks | `use-follow-ups.ts`, `use-dashboard.ts` |
| `@mui/material` | UI components | All widget files |
| `next/navigation` | Client-side routing | `useRouter`, `Link` |
| `zustand` | Client UI state | `dashboard-store.ts` |
| `date-fns` | Date formatting | `FollowUpWidget.tsx` |
| `lucide-react` | Icons | All widget files |

### No New Dependencies Needed

All fixes use existing libraries already installed. No `npm install` required.

## Architecture Patterns

### Existing Widget Pattern
Every dashboard widget follows this structure:
1. Lazy-loaded in `dashboard/widget-registry.ts` via `React.lazy()`
2. Registered in `WIDGETS` array with `WidgetId` type
3. Uses `BaseWidget` wrapper for consistent chrome (header, loading, error, refresh)
4. Data fetched via TanStack Query hooks from `hooks/queries/use-dashboard.ts`
5. Rendered inside `WidgetCard` > `Suspense` in `DashboardContainer.tsx`

### Dashboard Preferences Pattern
The intended (but unwired) pattern:
1. `useDashboardPreferences()` fetches `GET /users/me/dashboard-preferences` -- returns `DashboardLayout` with widget list
2. `useSaveDashboardLayout()` persists via `PUT /users/me/dashboard-preferences`
3. The `DashboardContainer` should init `visibleWidgets` from preferences data, not hardcoded `ALL_WIDGETS`
4. The `CustomizeDrawer` `onClose` or `onToggleWidget` should trigger save mutation

**Note:** The preferences API stores `WidgetLayout[]` (react-grid-layout format with `widgetId` field), but `DashboardContainer` currently uses simple `WidgetId[]` for visibility. The fix must bridge this gap -- either:
- (A) Extract `widgetId` values from the stored layout to derive visibility, or
- (B) Store visibility as a separate field alongside layout

Option (A) is simpler and consistent with existing code.

### Mutation Hook Pattern (Follow-ups)
```typescript
// Already exists in use-follow-ups.ts:142
export function useSnoozeFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string }) => {
      const res = await aiChatApi.snoozeFollowUp(id, dueDate);
      if (!res.data?.success) throw new Error(res.data?.error || 'Failed to snooze');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Follow-up snooze | Custom fetch/state | `useSnoozeFollowUp()` from `use-follow-ups.ts` | Already built, tested, invalidates cache |
| Dashboard persistence | localStorage hack | `useDashboardPreferences()` + `useSaveDashboardLayout()` | Backend API exists, hooks exist |
| Spin animation | Tailwind utility | MUI `sx` keyframes or inline `@keyframes` | Tailwind utilities banned in tsx per CLAUDE.md |
| Client-side nav | `<a href>` | Next.js `<Link>` or `useRouter().push()` | Prevents full page reload |

## Common Pitfalls

### Pitfall 1: Widget ID Mismatch
**What goes wrong:** The `WidgetId` type in `dashboard-store.ts` and `widget-registry.ts` uses IDs like `'followups'`, `'emails'`, `'events'`. But the `WidgetLayout` default layout in `use-dashboard.ts` uses different IDs like `'follow-up-tracker'`, `'unread-emails'`, `'today-events'`. These are from TWO DIFFERENT registries (`frontend/components/dashboard/dashboard/widget-registry.ts` vs `frontend/lib/dashboard/widget-registry.ts`).
**How to avoid:** When wiring preferences, map between `widgetId` from the stored layout and the `WidgetId` used by `DashboardContainer`. Or just persist the simple `WidgetId[]` visibility array directly rather than the full `WidgetLayout[]`.

### Pitfall 2: Preferences Race Condition
**What goes wrong:** If `useDashboardPreferences()` is loading, the component might flash all widgets then switch to saved set.
**How to avoid:** Initialize `visibleWidgets` from query data, show skeleton while loading. Use query `data` as source of truth, not `useState` + sync.

### Pitfall 3: Dead Code Removal Scope Creep
**What goes wrong:** `DashboardGrid.tsx` imports from `@/lib/dashboard/layout-engine` which also has `widget-registry.ts`. These files form a coherent but unused system. Removing just `DashboardGrid.tsx` but leaving the rest creates orphaned code.
**How to avoid:** Check imports -- if `layout-engine.ts` and `lib/dashboard/widget-registry.ts` are only imported by `DashboardGrid.tsx`, remove them too. But verify first with grep.

### Pitfall 4: MUI sx keyframes syntax
**What goes wrong:** Writing `@keyframes` wrong in MUI `sx` prop.
**How to avoid:** Use the correct MUI pattern:
```typescript
<RefreshCw
  size={16}
  style={loading ? {
    animation: 'spin 1s linear infinite',
  } : undefined}
/>
// Plus a global CSS rule or use MUI's keyframes utility
```
Or simpler: use MUI's `CircularProgress` as the loading indicator instead of animating RefreshCw.

## Bug-by-Bug Fix Analysis

### BUG 1: FollowUpWidget snooze is a dead no-op (HIGH)
**File:** `frontend/components/dashboard/widgets/FollowUpWidget.tsx:32`
**Root cause:** `snoozeMutation` is a stub object `{ mutateAsync: async () => {} }` instead of calling the existing `useSnoozeFollowUp()` hook.
**Fix:** Replace line 32 with `const snoozeMutation = useSnoozeFollowUp();`. Import `useSnoozeFollowUp` from `@/hooks/queries/use-follow-ups`.
**Also invalidate:** The dashboard `followUps` query should also be invalidated on snooze success (the hook already invalidates `followUpKeys.all`, but dashboard uses `dashboardKeys.followUps` -- may need cross-invalidation or manual refetch).
**Confidence:** HIGH

### BUG 2: Dashboard widget visibility not persisted (HIGH)
**File:** `frontend/components/dashboard/DashboardContainer.tsx:41`
**Root cause:** `useState<WidgetId[]>(ALL_WIDGETS)` ignores backend preferences. Hooks `useDashboardPreferences()` and `useSaveDashboardLayout()` exist but are never called.
**Fix approach:**
1. Call `useDashboardPreferences()` to fetch saved layout on mount
2. Derive `visibleWidgets` from query data (extract `widgetId` values or store visibility separately)
3. On `handleToggleWidget`, call `useSaveDashboardLayout().mutate()` to persist
4. Handle loading state (show skeleton while fetching preferences)
**Complexity:** Medium -- the stored layout format (`WidgetLayout[]` with grid positions) differs from what `DashboardContainer` needs (simple `WidgetId[]`). Simplest approach: persist just the visibility array to a dedicated field, or derive visibility from the layout's widgetId list.
**Confidence:** HIGH

### BUG 3: DashboardGrid is dead code (MEDIUM)
**File:** `frontend/components/dashboard/DashboardGrid.tsx`
**Root cause:** Component exists but is never imported. The drag-and-drop grid system was built but never integrated.
**Fix:** Delete `DashboardGrid.tsx`. Check if `frontend/lib/dashboard/layout-engine.ts` and `frontend/lib/dashboard/widget-registry.ts` are also unused (they likely are only used by DashboardGrid + the preferences types). If `WidgetLayout` type is used by `use-dashboard.ts`, keep `layout-engine.ts` but note it as partially dead.
**Risk:** `WidgetLayout` type from `layout-engine.ts` IS used by `use-dashboard.ts` (dashboardPreferencesOptions). Keep that file. Only `DashboardGrid.tsx` and `lib/dashboard/widget-registry.ts` (the one with `WIDGET_REGISTRY` placeholder components) are candidates for deletion.
**Confidence:** HIGH

### BUG 4: BaseWidget refresh icon doesn't spin (MEDIUM)
**File:** `frontend/components/dashboard/widgets/BaseWidget.tsx:192`
**Root cause:** `className="animate-spin"` is a Tailwind utility. Project bans Tailwind utilities in tsx. No `@keyframes spin` exists in any CSS.
**Fix options:**
- (A) Add inline style with `animation: 'spin 1s linear infinite'` + define `@keyframes spin` in a global CSS file
- (B) Replace `RefreshCw` during loading with MUI `CircularProgress` (size 16) -- cleaner, follows MUI patterns
- (C) Use MUI `sx` on a wrapper Box: `sx={{ '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, animation: loading ? 'spin 1s linear infinite' : 'none' }}`
**Recommendation:** Option (B) is cleanest -- use `CircularProgress` during loading, consistent with how `ReminderCreateDialog` already does it. But `RefreshCw` is the expected icon for "refresh". Option (C) via MUI `sx` is the most correct per project rules.
**Confidence:** HIGH

### BUG 5: No stale contacts widget on dashboard (MEDIUM)
**Root cause:** Translation keys `dashboard.widgets.crm.*` exist, `useStaleContacts()` hook exists, but no `StaleContactsWidget` component is registered in widget-registry.
**Fix:** Create a new `StaleContactsWidget.tsx` in `frontend/components/dashboard/widgets/`, register it in `widget-registry.ts` with a new WidgetId (e.g., `'contacts'`), add to `ALL_WIDGETS` in `dashboard-store.ts`.
**Data source:** `useStaleContacts({ limit: 5 })` from `use-dashboard.ts` -- returns `{ contacts: StaleContact[], total: number, averageScore: number }`.
**UI pattern:** Follow existing widget patterns -- `BaseWidget` wrapper, list of contacts with last interaction time, "reconnect" action linking to contacts page.
**Confidence:** HIGH

### BUG 6: PredictiveInsightsWidget uses `<a>` instead of Next.js router (LOW)
**File:** `frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx:207`
**Root cause:** `component={insight.action ? 'a' : 'div'}` with `href={insight.action?.href}` triggers full page reload.
**Fix:** Replace with Next.js `Link` component or use `useRouter().push()` via `onClick`. Since the `Box` uses `component` prop, switch to wrapping with Next.js `Link` (which renders an `<a>` with client-side navigation). Or use `onClick={() => router.push(href)}` and remove `component='a'`.
**Note:** MUI `Box` with `component={Link}` from next/link is the standard pattern.
**Confidence:** HIGH

### BUG 7: ReminderCreateDialog shows no error feedback (LOW)
**File:** `frontend/components/reminders/ReminderCreateDialog.tsx`
**Root cause:** `createMutation.isError` and `createMutation.error` are available from TanStack Query but never rendered.
**Fix:** Add an MUI `Alert` component after the `TextField` that shows when `createMutation.isError`:
```tsx
{createMutation.isError && (
  <Alert severity="error" sx={{ mt: 1 }}>
    {createMutation.error?.message || t.common.genericError}
  </Alert>
)}
```
**Confidence:** HIGH

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), Jest (backend) |
| Config file | `frontend/vitest.config.ts`, `backend/jest.config.ts` |
| Quick run command | `cd frontend && npx vitest run --reporter=verbose` |
| Full suite command | `cd frontend && npx vitest run && cd ../backend && npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-1 | Snooze mutation wired to real hook | manual-only | N/A -- UI interaction test | N/A |
| BUG-2 | Widget visibility persists across reload | manual-only | N/A -- requires backend call | N/A |
| BUG-3 | Dead code removed, no import errors | unit | `cd frontend && npx tsc --noEmit` | N/A (type-check) |
| BUG-4 | Refresh icon spins during loading | manual-only | N/A -- visual CSS test | N/A |
| BUG-5 | StaleContactsWidget renders data | manual-only | N/A -- new component | N/A |
| BUG-6 | Insight links use client-side nav | manual-only | N/A -- navigation behavior | N/A |
| BUG-7 | Error alert shown on mutation failure | manual-only | N/A -- error state test | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type-check is the primary gate)
- **Per wave merge:** Full type-check + lint
- **Phase gate:** `cd frontend && npx tsc --noEmit && npm run lint:win`

### Wave 0 Gaps
None -- all bugs are fixable with existing infrastructure. Type-check is the validation gate.

## Code Examples

### BUG 1 Fix Pattern
```typescript
// Source: frontend/hooks/queries/use-follow-ups.ts:142
import { useSnoozeFollowUp } from '@/hooks/queries/use-follow-ups';

// In component:
const snoozeMutation = useSnoozeFollowUp();
// The rest of the snooze handler code already works with this shape
```

### BUG 2 Fix Pattern
```typescript
// Source: frontend/hooks/queries/use-dashboard.ts:544-567
import { useDashboardPreferences, useSaveDashboardLayout } from '@/hooks/queries/use-dashboard';

const { data: preferences, isLoading: prefsLoading } = useDashboardPreferences();
const saveMutation = useSaveDashboardLayout();

// Derive visible widgets from preferences
const visibleWidgets = useMemo(() => {
  if (!preferences?.widgets) return ALL_WIDGETS as WidgetId[];
  // Extract widgetId from stored WidgetLayout[], map to WidgetId
  return preferences.widgets.map(w => w.widgetId as WidgetId);
}, [preferences]);
```

### BUG 4 Fix Pattern (MUI sx keyframes)
```typescript
// MUI-compliant spin animation
<Box
  component="span"
  sx={loading ? {
    display: 'inline-flex',
    '@keyframes spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
    animation: 'spin 1s linear infinite',
  } : { display: 'inline-flex' }}
>
  <RefreshCw size={16} />
</Box>
```

### BUG 6 Fix Pattern (Next.js Link with MUI Box)
```typescript
import Link from 'next/link';

// Replace component='a' with Link
<Box
  key={insight.id}
  component={insight.action ? Link : 'div'}
  href={insight.action?.href || ''}
  // ... rest of sx props
>
```

## Open Questions

1. **Dashboard preferences format alignment**
   - What we know: Backend stores `WidgetLayout[]` (grid positions), but DashboardContainer only needs `WidgetId[]` (visibility)
   - What's unclear: Should we store visibility as a separate field, or derive from layout?
   - Recommendation: Derive from layout for now -- extract `widgetId` values. The grid layout data is unused since DashboardGrid is dead code, but keeping the API shape means less backend changes if drag-and-drop is ever re-enabled.

2. **Cross-invalidation between follow-up query keys**
   - What we know: `useSnoozeFollowUp()` invalidates `followUpKeys.all`, but FollowUpWidget uses `useFollowUps()` from `use-dashboard.ts` which uses `dashboardKeys.followUps`
   - What's unclear: Will snoozing correctly refresh the widget's data?
   - Recommendation: After snooze success, also invalidate `dashboardKeys.followUps` or call `refetch()` (which the component already does in the `handleSnooze` callback).

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 7 affected files
- Backend controller verified: `ai.controller.ts:633` confirms `PATCH /follow-ups/:id/snooze` exists
- Frontend hooks verified: `use-follow-ups.ts:142` (`useSnoozeFollowUp`), `use-dashboard.ts:544-567` (`useDashboardPreferences`, `useSaveDashboardLayout`)
- Widget registry verified: `dashboard/widget-registry.ts` -- 8 widgets registered, no stale-contacts widget

### Secondary (MEDIUM confidence)
- MUI `sx` keyframes syntax -- based on MUI v5/v6 documentation patterns

## Metadata

**Confidence breakdown:**
- Bug analysis: HIGH - all files read and root causes confirmed from source
- Fix approach: HIGH - all required hooks/APIs already exist in codebase
- Dead code scope: MEDIUM - need to verify import graph before deleting `lib/dashboard/widget-registry.ts`

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- all fixes are internal wiring)
