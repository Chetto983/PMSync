# Phase 96: UI/UX Polish - Research

**Researched:** 2026-03-21
**Domain:** Frontend UI/UX polish -- empty states, skeletons, error handling, mobile, dark mode, keyboard nav, i18n
**Confidence:** HIGH

## Summary

This phase is a pure frontend polish pass across all protected pages. The codebase already has many of the right patterns in place -- MUI Skeleton, PageErrorBoundary, useTranslations, responsive breakpoints via useMediaQuery -- but they are inconsistently applied. Some pages have proper skeletons (contacts, analytics, AI chat), while others show nothing during load. Empty states exist for email and chat but are missing from many other pages. Error handling is mostly delegated to PageErrorBoundary (render-crash recovery) but TanStack Query fetch errors are not consistently surfaced with retry buttons.

The project uses Next.js 16 Pages Router, React 19, MUI 7.3, TanStack Query 5, next-themes for dark/light mode, and a custom i18n system with typed translation objects (en.ts + it.ts). All styling goes through MUI `sx` props. The translation files are ~4000 lines each with 23-line difference suggesting near-parity, but a systematic key comparison is needed.

**Primary recommendation:** Create a reusable `EmptyState` component and a `QueryErrorAlert` component as shared primitives, then systematically audit each protected page for all 7 requirements.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Empty states: MUI icon + short message + action CTA button per page. Domain-specific icons with semantic theme colors. No custom SVG illustrations.
- Error feedback: Inline MUI Alert replacing content area. Stays visible until resolved. Every error includes Retry button. TanStack Query retry:1 handles first auto-retry; user sees errors only after that fails.
- Loading skeletons: MUI `<Skeleton>` with wave animation. Layout-matching fidelity. Progressive per-widget loading. No full-page blocking skeleton.
- Mobile: Audit all protected pages at 375px. Fix overflow/hidden content/unreadable text. Extend chat's responsive patterns.
- Dark mode: Visual audit per page. Fix unthemed elements. All styling through MUI palette.mode='dark'. ChatThemeBridge stays (removed in Phase 97).
- Keyboard navigation: Tab + Enter on all interactive elements. No custom shortcuts. MUI default :focus-visible styling.
- Italian translation: Script-based en.ts vs it.ts key comparison. Grep .tsx for hardcoded English strings. New strings get en + it immediately.

### Claude's Discretion
- Exact skeleton shapes per page (as long as they match content layout)
- Specific MUI Alert variant/severity per error type
- Exact responsive breakpoint implementation approach per page
- Focus order within complex layouts
- Script implementation for i18n key comparison

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UIPOL-01 | Every page has proper empty state | Reusable EmptyState component + per-page audit of 16 protected pages |
| UIPOL-02 | Every async operation shows loading skeleton | MUI Skeleton wave pattern + per-page audit for missing skeletons |
| UIPOL-03 | Every error shows user-friendly message with retry | QueryErrorAlert component wrapping MUI Alert + TanStack Query refetch |
| UIPOL-04 | Mobile responsiveness on all pages (375px+) | MUI useMediaQuery + breakpoints.down('sm') pattern already in 12 components |
| UIPOL-05 | Dark mode correct on all pages | next-themes + MUI ThemeProvider already wired; per-page audit for hardcoded colors |
| UIPOL-06 | Keyboard navigation on all interactive elements | MUI components have built-in keyboard support; audit for custom non-MUI elements |
| UIPOL-07 | Italian translation complete | Script-based key diff between en.ts and it.ts + grep for hardcoded strings |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @mui/material | 7.3.7 | All UI components (Skeleton, Alert, Box, Typography) | Primary UI framework |
| @tanstack/react-query | 5.90.20 | Data fetching with loading/error states | Already provides isLoading, error, refetch |
| next-themes | 0.4.6 | Dark/light mode toggle | Synced with MUI via MaterialThemeWrapper in _app.tsx |
| lucide-react | (installed) | Icons for empty states | Already used across codebase |
| Custom i18n | N/A | useTranslations() hook with typed en.ts/it.ts | ~4066/4043 lines respectively |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| @mui/icons-material | 7.3.9 | Alternative MUI icons if lucide-react doesn't have a specific one | Already installed |
| framer-motion | (installed) | MotionConfig already in _app.tsx with reducedMotion="user" | Don't add new animations |

### No New Dependencies Needed
This phase requires zero new npm packages. Everything is already in place.

## Architecture Patterns

### Protected Pages Inventory (16 pages to audit)

```
pages/dashboard/
  index.tsx          -> DashboardContainer (widgets grid)
  email.tsx          -> EmailLayout + ThreadList (complex, already responsive)
  email/compose.tsx  -> ComposeDialog
  email/thread/[threadId].tsx -> Thread detail view
  calendar.tsx       -> Calendar (FullCalendar)
  contacts.tsx       -> Contacts (dynamic import with skeleton)
  tasks.tsx          -> Tasks
  reminders.tsx      -> RemindersBoard (Kanban)
  ai.tsx             -> ChatPage (already has skeleton + mobile layout)
  ai/follow-ups.tsx  -> Follow-ups list
  analytics.tsx      -> AnalyticsChart (dynamic import with skeleton)
  settings.tsx       -> Settings (tabs)
  profile.tsx        -> ProfileSettings
  admin/users.tsx    -> UserListTable
  admin/organizations.tsx -> Org management
  invitations/accept.tsx -> Invitation acceptance
```

### Pattern 1: Reusable EmptyState Component
**What:** Shared component for consistent empty states across all pages
**When to use:** Every page/section that can have zero data
**Example:**
```typescript
// components/common/EmptyState.tsx
import { Box, Typography, Button, alpha, useTheme } from '@mui/material';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;         // Lucide icon element
  color: string;           // Semantic color key from theme
  title: string;           // e.g. t.contacts.emptyTitle
  description: string;     // e.g. t.contacts.emptyDescription
  actionLabel?: string;    // CTA button text
  onAction?: () => void;   // CTA click handler
}

export function EmptyState({ icon, color, title, description, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, px: 3, textAlign: 'center' }}>
      <Box sx={{ mb: 2, p: 2, borderRadius: '50%', bgcolor: alpha(color, 0.12), color, display: 'flex' }}>
        {icon}
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 360 }}>{description}</Typography>
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction}>{actionLabel}</Button>
      )}
    </Box>
  );
}
```

### Pattern 2: QueryErrorAlert Component
**What:** Inline error alert with retry button for TanStack Query errors
**When to use:** Replace content area when a query fails after auto-retry
**Example:**
```typescript
// components/common/QueryErrorAlert.tsx
import { Alert, AlertTitle, Button } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface QueryErrorAlertProps {
  error: Error | null;
  onRetry: () => void;
  title?: string;
}

export function QueryErrorAlert({ error, onRetry, title }: QueryErrorAlertProps) {
  const t = useTranslations();
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" startIcon={<RefreshCw size={14} />} onClick={onRetry}>
          {t.common?.retry ?? 'Retry'}
        </Button>
      }
      sx={{ mx: 2, my: 2 }}
    >
      <AlertTitle>{title ?? t.errors?.genericError ?? 'Something went wrong'}</AlertTitle>
      {error?.message}
    </Alert>
  );
}
```

### Pattern 3: Layout-Matching Skeleton
**What:** Skeleton that mirrors the actual content structure
**When to use:** Every page/widget during initial data load
**Example:**
```typescript
// Example: Contacts list skeleton
function ContactsListSkeleton() {
  return (
    <Box>
      {[1, 2, 3, 4, 5].map((i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="60%" height={14} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

### Pattern 4: Standard Page Data Flow
**What:** Consistent loading/error/empty/data flow in every page component
**When to use:** Every component that fetches data
**Example:**
```typescript
export function SomePage() {
  const t = useTranslations();
  const { data, isLoading, error, refetch } = useSomeQuery();

  if (isLoading) return <SomePageSkeleton />;
  if (error) return <QueryErrorAlert error={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={...} ... />;
  return <ActualContent data={data} />;
}
```

### Anti-Patterns to Avoid
- **CircularProgress spinners:** Replace with layout-matching Skeleton components. The email page currently uses `CircularProgress` -- replace with Skeleton.
- **`return null` during loading:** RemindersPage returns null during auth check. Show skeleton instead.
- **Hardcoded English fallbacks:** ProfilePage uses `|| 'Profile'` instead of relying on the type system. Remove fallbacks; ensure keys exist.
- **Missing error handling:** Most pages delegate only to PageErrorBoundary (render crashes). TanStack Query errors need explicit inline Alert with retry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode toggle | Custom CSS class toggling | next-themes + MUI ThemeProvider | Already wired in _app.tsx, just ensure MUI sx props |
| Responsive layout | Custom window.innerWidth listeners | MUI useMediaQuery + theme.breakpoints | Already used in 12 components, consistent API |
| Loading states | Custom CSS pulse animations | MUI Skeleton variant="wave" | Chat has custom CSS pulse; replace with MUI Skeleton |
| Error boundaries | Custom try/catch wrappers | PageErrorBoundary (exists) + QueryErrorAlert (new) | ErrorBoundary catches render crashes; QueryErrorAlert handles fetch errors |
| i18n key diff | Manual comparison | Script that walks en.ts and it.ts AST or key paths | ~4000 lines too large for manual comparison |
| Focus management | Custom focus trap | MUI Dialog/Drawer built-in focus trap | MUI already handles modal focus |

## Common Pitfalls

### Pitfall 1: Skeleton Flash
**What goes wrong:** Skeleton appears for 50ms then content loads, causing visual flicker
**Why it happens:** Data is already cached in TanStack Query but isLoading still true on mount
**How to avoid:** Use `isLoading` (not `isFetching`) for initial skeleton. TanStack Query `isLoading` is only true on first fetch. `isFetching` includes background refetches.
**Warning signs:** Skeleton flashes briefly on page navigation

### Pitfall 2: Dark Mode Hydration Mismatch
**What goes wrong:** White flash on page load in dark mode, or React hydration errors
**Why it happens:** Server renders light theme, client switches to dark
**How to avoid:** next-themes with `attribute="class"` + `suppressHydrationWarning` already configured in _document.tsx. Avoid conditional rendering based on theme during SSR. Use CSS-only dark mode transitions.
**Warning signs:** Console hydration warnings mentioning theme/color

### Pitfall 3: Overflow on Mobile
**What goes wrong:** Horizontal scroll appears on 375px screens
**Why it happens:** Fixed-width elements, long unbreakable strings, side-by-side layouts not stacking
**How to avoid:** Use `overflow: hidden` + `textOverflow: 'ellipsis'` for text. Use MUI responsive `sx` props: `{ display: { xs: 'none', md: 'block' } }`. Test at 375px width.
**Warning signs:** Content extends beyond viewport, horizontal scrollbar appears

### Pitfall 4: Translation Type Mismatches
**What goes wrong:** TypeScript errors when adding new keys, or runtime undefined access
**Why it happens:** en.ts, it.ts, and index.ts (AppTranslations type) must all be updated in sync
**How to avoid:** Always update all three files together. The type system catches missing keys at compile time.
**Warning signs:** `t.section.key` returns undefined, TypeScript error on new key access

### Pitfall 5: Empty State vs Loading State Confusion
**What goes wrong:** Empty state shown before data finishes loading
**Why it happens:** `data` is undefined during loading AND when empty
**How to avoid:** Always check `isLoading` before checking for empty data. The order must be: loading -> error -> empty -> data.
**Warning signs:** Empty state flashes before content appears

### Pitfall 6: MUI Skeleton Animation in Dark Mode
**What goes wrong:** Skeleton shimmer effect invisible or too bright in dark mode
**Why it happens:** Default Skeleton colors may not contrast well in custom dark themes
**How to avoid:** MUI Skeleton respects theme palette automatically. Use `variant="wave"` (the default animation). Test in both themes.
**Warning signs:** Skeleton invisible against dark background

## Code Examples

### Existing Pattern: Dynamic Import with Skeleton (Contacts Page)
```typescript
// Source: frontend/pages/dashboard/contacts.tsx
const Contacts = dynamic(
  () => import('@/components/dashboard/Contacts').then(m => ({ default: m.Contacts })),
  { ssr: false, loading: () => <Box sx={{ p: 3 }}><Skeleton variant="rounded" height={400} /></Box> },
);
```

### Existing Pattern: Page Structure
```typescript
// Source: All dashboard pages follow this pattern
export default function SomePage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="SomeName">
        <SomeComponent />
      </PageErrorBoundary>
    </Layout>
  );
}
```

### Existing Pattern: Theme Provider Chain
```typescript
// Source: frontend/pages/_app.tsx
// next-themes -> MaterialThemeWrapper -> MUI ThemeProvider -> CssBaseline
<NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <MaterialThemeWrapper>
    {children}
  </MaterialThemeWrapper>
</NextThemeProvider>
```

### Existing Pattern: Responsive with useMediaQuery
```typescript
// Source: frontend/pages/dashboard/email.tsx
const theme = useTheme();
const isMobile = useMediaQuery(theme.breakpoints.down('sm'));  // < 600px
const isTablet = useMediaQuery(theme.breakpoints.down('md'));  // < 900px
```

### Semantic Colors for Empty State Icons
```typescript
// Source: frontend/theme/appTheme.ts
const semanticColors = {
  email: brand.cyanVibrant,    // '#00aced'
  calendar: '#FF9800',          // orange
  contacts: brand.purple,       // '#7650ce'
  tasks: '#22c55e',             // green
  important: '#f59e0b',         // amber
  ai: brand.cyan,               // '#55cae5' (teal)
};
```

### i18n Key Comparison Script Pattern
```typescript
// Script to diff en.ts vs it.ts key trees
// Walk the exported object recursively, collect all leaf key paths
// Compare sets: missing_in_it = en_keys - it_keys
// Also grep .tsx files for patterns like: >'[A-Z][a-z]+ or hardcoded strings
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| CircularProgress spinners | MUI Skeleton with wave animation | Layout-matching loading states |
| PageErrorBoundary only | PageErrorBoundary + inline QueryErrorAlert | Catches both render crashes and data fetch errors |
| CSS pulse animation (chat) | MUI Skeleton variant="wave" | Consistent animation across all pages |
| return null while loading | Skeleton placeholder | No blank flash |

**Note on MUI 7:** MUI 7.3 Skeleton component supports `animation="wave"` (default) and `animation="pulse"`. The wave animation is preferred per user decision.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (installed in frontend/e2e/) |
| Config file | frontend/playwright.config.ts |
| Quick run command | `cd frontend && npx playwright test --grep "UIPOL" -x` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UIPOL-01 | Empty states on all pages | manual + visual | Browser audit at each page with empty data | N/A - visual |
| UIPOL-02 | Loading skeletons on all pages | manual + visual | Throttle network, verify skeleton appears | N/A - visual |
| UIPOL-03 | Error alerts with retry | manual | Block API, verify Alert + Retry button | N/A - visual |
| UIPOL-04 | Mobile 375px responsiveness | manual | Browser devtools at 375px width | N/A - visual |
| UIPOL-05 | Dark mode correctness | manual | Toggle dark mode, audit each page | N/A - visual |
| UIPOL-06 | Keyboard navigation | manual | Tab through all interactive elements | N/A - manual |
| UIPOL-07 | Italian translation completeness | unit (script) | `node scripts/i18n-audit.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type-check validates translation types)
- **Per wave merge:** Type-check + manual visual audit of affected pages
- **Phase gate:** All pages audited in both themes at 375px + desktop

### Wave 0 Gaps
- [ ] `scripts/i18n-audit.ts` -- Script to diff en.ts vs it.ts keys and grep for hardcoded strings
- [ ] `frontend/components/common/EmptyState.tsx` -- Reusable empty state component
- [ ] `frontend/components/common/QueryErrorAlert.tsx` -- Reusable error alert with retry

## Open Questions

1. **Pages with no data fetching (invitations/accept, possibly tasks)**
   - What we know: Some pages may not have async data (e.g., static forms)
   - What's unclear: Whether they need empty/loading states at all
   - Recommendation: Audit each page individually; skip empty/loading for pages that don't fetch data

2. **Admin pages with restricted access**
   - What we know: Admin pages (users, organizations) are RBAC-restricted
   - What's unclear: Whether non-admin users see an error or redirect
   - Recommendation: Verify RBAC handling shows proper "access denied" state, not blank page

3. **Calendar empty state complexity**
   - What we know: FullCalendar is a third-party component with its own rendering
   - What's unclear: How to show empty state inside FullCalendar grid
   - Recommendation: Show empty state only when zero calendars connected, not when calendar has no events (an empty calendar grid is a valid state)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: frontend/pages/dashboard/*.tsx -- all 16 protected pages reviewed
- Codebase analysis: frontend/components/common/ErrorBoundary.tsx -- existing error boundary pattern
- Codebase analysis: frontend/components/common/PageContainer.tsx -- existing page wrapper
- Codebase analysis: frontend/theme/appTheme.ts + tokens.ts -- theme system and semantic colors
- Codebase analysis: frontend/pages/_app.tsx -- theme provider chain (next-themes -> MUI)
- Codebase analysis: frontend/locales/en.ts + it.ts -- translation files (~4066/4043 lines)

### Secondary (MEDIUM confidence)
- MUI 7 Skeleton API -- standard component, well-known behavior
- TanStack Query 5 error/loading states -- standard patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use
- Architecture: HIGH - patterns derived from existing codebase, not hypothetical
- Pitfalls: HIGH - common React/MUI patterns, verified against codebase state

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no fast-moving dependencies)
