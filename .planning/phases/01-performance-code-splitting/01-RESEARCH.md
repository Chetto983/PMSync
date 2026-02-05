# Phase 01: Performance Code Splitting - Research

**Researched:** 2026-02-05
**Domain:** Next.js Performance Optimization, Code Splitting, Core Web Vitals
**Confidence:** HIGH

## Summary

This phase focuses on achieving Core Web Vitals performance budgets (LCP <= 2.5s, TTI <= 3.5s) through strategic code splitting in the MailAgent Next.js application. The current LCP of 4.12s indicates the initial bundle is too large.

**Good news:** The codebase already implements several best practices:
- `@next/bundle-analyzer` is installed and configured
- Dashboard widgets are already lazy loaded with `React.lazy()`
- Landing page components use `next/dynamic()`
- Lighthouse CI configuration exists with correct thresholds
- Skeleton components exist for thread lists and kanban boards
- `optimizePackageImports` is configured for MUI and MUI Icons

**Primary recommendation:** Focus on route-level dynamic imports for heavy pages (compose, kanban, calendar, AI dashboard) and ensure consistent skeleton fallbacks. The widgets are already split; the issue is likely page-level imports and heavy third-party libraries being loaded eagerly.

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next/dynamic` | Next.js 16.1.4 | Dynamic imports with SSR control | Official Next.js solution, composite of React.lazy + Suspense |
| `@next/bundle-analyzer` | 16.1.6 | Bundle visualization | Official Next.js tool, generates treemap reports |
| `@lhci/cli` | 0.15.1 | Lighthouse CI | Google's official CI tool for performance budgets |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mui/material Skeleton` | 7.3.7 | Loading placeholders | All lazy-loaded components need fallbacks |
| `@vercel/speed-insights` | 1.3.1 | Real User Monitoring | Already integrated in _app.tsx |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `React.lazy()` | `next/dynamic` | **Use dynamic** - provides SSR control and loading options natively |
| Manual prefetch | Link prefetch | **Use Link prefetch** - automatic by default in Next.js |
| Custom skeleton | MUI Skeleton | **Use MUI Skeleton** - consistent with design system |

**Installation:** None required - all dependencies already present.

## Architecture Patterns

### Current File Organization (Correct)

```
frontend/
├── components/
│   ├── dashboard/
│   │   ├── DashboardContainer.tsx  # ✅ Already lazy loads widgets
│   │   └── widgets/                # ✅ Each widget is separate chunk
│   ├── email/
│   │   ├── compose/                # ❌ Heavy TipTap - needs lazy loading
│   │   ├── list/
│   │   │   └── ThreadListSkeleton.tsx  # ✅ Good skeleton exists
│   │   └── layout/                 # Contains @dnd-kit, allotment
│   ├── productivity/
│   │   └── KanbanBoard/           # ❌ Heavy @dnd-kit - needs lazy loading
│   │       └── KanbanSkeleton.tsx # ✅ Good skeleton exists
│   └── ai/
│       └── AiDashboard/           # ✅ Already lazy loads subcomponents
├── pages/
│   └── dashboard/
│       ├── email.tsx              # ✅ Main entry - keep critical path
│       ├── email/
│       │   └── compose.tsx        # ❌ Should use dynamic import
│       └── ai/
│           └── follow-ups.tsx     # ❌ Loads heavy Kanban eagerly
└── src/
    └── components/
        └── ai-elements/           # ❌ Heavy @xyflow, motion - isolate
```

### Pattern 1: Route-Level Dynamic Import (next/dynamic)

**What:** Use `next/dynamic` for page-level components that include heavy libraries
**When to use:** Pages that load >=100KB of JavaScript for non-critical features
**Example:**
```typescript
// Source: https://nextjs.org/docs/pages/guides/lazy-loading
import dynamic from 'next/dynamic';
import { KanbanSkeleton } from '@/components/productivity/KanbanBoard/KanbanSkeleton';

// Heavy component with SSR disabled (uses browser APIs)
const FollowupsKanbanBoard = dynamic(
  () => import('@/components/productivity/KanbanBoard').then(mod => mod.FollowupsKanbanBoard),
  {
    loading: () => <KanbanSkeleton />,
    ssr: false, // @dnd-kit uses window
  }
);
```

### Pattern 2: Component-Level React.lazy (Already Implemented)

**What:** Use `React.lazy` for non-route components within a page
**When to use:** Dashboard widgets, modals, drawers
**Example:**
```typescript
// Source: DashboardContainer.tsx (existing pattern)
import React, { Suspense, lazy } from 'react';
import { WidgetSkeleton } from './WidgetSkeleton';

const BriefingWidget = lazy(() =>
  import('./widgets/BriefingWidget').then((m) => ({ default: m.BriefingWidget }))
);

// In render:
<Suspense fallback={<WidgetSkeleton />}>
  <BriefingWidget />
</Suspense>
```

### Pattern 3: Third-Party Library Isolation

**What:** Isolate heavy third-party libraries behind dynamic imports
**When to use:** Libraries >50KB gzipped (TipTap, FullCalendar, @xyflow)
**Example:**
```typescript
// Source: Calendar.tsx (existing pattern)
const FullCalendar = lazy(() => import('@fullcalendar/react'));

// Load plugins only when calendar is rendered
// Note: Plugins must still be imported at module level for FullCalendar
```

### Anti-Patterns to Avoid

- **Eagerly importing ComposeDialog in email.tsx:** The TipTap editor adds ~200KB. Import dynamically when compose button clicked.
- **Static imports of @dnd-kit in layout files:** DnD is not needed for initial render. Defer until user interaction.
- **Over-splitting small components:** Don't lazy load components <20KB - HTTP overhead exceeds benefit.
- **Missing Suspense boundaries:** Every lazy component needs a fallback or users see blank content.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading skeletons | Custom CSS animations | MUI Skeleton | Consistent theming, wave/pulse variants built-in |
| Bundle analysis | Manual inspection | @next/bundle-analyzer | Accurate, visual, catches hidden imports |
| Performance monitoring | console.time() | Lighthouse CI + Vercel Speed Insights | Real user metrics, CI integration |
| Import optimization | Manual path imports | optimizePackageImports | Automatic, maintained by Next.js team |
| Route prefetch | Custom prefetch logic | Next.js Link | Automatic viewport-based prefetching |

**Key insight:** Next.js 16 handles route-based code splitting automatically. Focus efforts on component-level splitting for heavy third-party libraries, not on reinventing route chunking.

## Common Pitfalls

### Pitfall 1: SSR Mismatch with Browser-Only Libraries

**What goes wrong:** Hydration errors when lazy-loaded component uses `window`, `document`, or browser-only APIs
**Why it happens:** Next.js SSR renders on server where browser APIs don't exist
**How to avoid:** Use `ssr: false` in dynamic import options
**Warning signs:** "Hydration failed because the initial UI does not match" errors

```typescript
// WRONG - will cause hydration errors
const KanbanBoard = dynamic(() => import('./KanbanBoard'));

// CORRECT - disable SSR for browser-only components
const KanbanBoard = dynamic(() => import('./KanbanBoard'), { ssr: false });
```

### Pitfall 2: Flash of Loading Content (FOLC)

**What goes wrong:** User sees jarring skeleton → content transitions
**Why it happens:** Skeleton appears for split second before cached JS loads
**How to avoid:** Use `loading` option with minimal skeleton, consider prefetch on hover
**Warning signs:** CLS (Cumulative Layout Shift) spikes in Lighthouse

```typescript
// Minimize skeleton height to match final content
const EmailCompose = dynamic(() => import('./ComposeDialog'), {
  loading: () => <ComposeDialogSkeleton />, // Must match final height
});
```

### Pitfall 3: Bundle Analyzer False Positives

**What goes wrong:** Bundle analyzer shows large modules that are actually lazy-loaded
**Why it happens:** Analyzer shows all possible code, not just initial bundle
**How to avoid:** Focus on `client.html` report, check Network tab for actual initial load
**Warning signs:** Analyzer shows huge total but LCP is fine

### Pitfall 4: Over-Splitting Degrading Performance

**What goes wrong:** Too many small chunks increase HTTP requests, slow down loading
**Why it happens:** Splitting every component regardless of size
**How to avoid:** Only split components >50KB, batch related imports
**Warning signs:** Many parallel requests for <10KB chunks

### Pitfall 5: Losing Named Exports with Dynamic Import

**What goes wrong:** `dynamic(() => import('./Foo'))` fails when Foo is named export
**Why it happens:** Dynamic import returns module object, not the export
**How to avoid:** Use `.then(mod => mod.NamedExport)` pattern
**Warning signs:** "Module has no exported member" at runtime

## Code Examples

### Example 1: Route-Level Dynamic Import with Skeleton

```typescript
// Source: Best practice for pages with heavy dependencies
// File: pages/dashboard/ai/follow-ups.tsx

import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { KanbanSkeleton } from '@/components/productivity/KanbanBoard/KanbanSkeleton';

// Dynamic import with proper loading state and SSR disabled
const FollowupsKanbanBoard = dynamic(
  () => import('@/components/productivity/KanbanBoard').then(mod => mod.FollowupsKanbanBoard),
  {
    loading: () => <KanbanSkeleton columns={4} cardsPerColumn={3} />,
    ssr: false, // @dnd-kit requires browser APIs
  }
);

export default function FollowUpsPage() {
  return (
    <Layout>
      <Head>
        <title>Follow-ups | PMSync</title>
      </Head>
      <PageErrorBoundary pageName="Follow-up Tracker">
        <FollowupsKanbanBoard />
      </PageErrorBoundary>
    </Layout>
  );
}
```

### Example 2: Prefetch on Hover for Compose Dialog

```typescript
// Source: Next.js prefetch pattern
// File: components/email/list/EmailToolbar.tsx

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

// Prefetch function for eager loading on hover
const prefetchCompose = () => import('@/components/email/compose/ComposeDialog');

const ComposeDialog = dynamic(
  () => import('@/components/email/compose/ComposeDialog').then(mod => mod.ComposeDialog),
  { ssr: false }
);

export function EmailToolbar() {
  const [isComposeOpen, setComposeOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setComposeOpen(true)}
        onMouseEnter={() => prefetchCompose()} // Start loading on hover
      >
        Compose
      </Button>
      {isComposeOpen && (
        <ComposeDialog open={isComposeOpen} onClose={() => setComposeOpen(false)} />
      )}
    </>
  );
}
```

### Example 3: Widget Skeleton Pattern (Existing)

```typescript
// Source: DashboardContainer.tsx (already implemented correctly)
// This pattern is good - just needs consistent application

function WidgetSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: 2.5 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={24} />
          <Skeleton width="60%" height={16} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
    </Box>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `modularizeImports` config | `optimizePackageImports` | Next.js 13.5 (Oct 2023) | Automatic tree-shaking for barrel exports |
| Manual MUI path imports | Auto-optimized by Next.js | Next.js 13.5+ | No need for `@mui/material/Button` imports |
| React.lazy everywhere | next/dynamic preferred | Always for Next.js | SSR control, loading options built-in |
| CSS-in-JS bundle bloat | MUI v7 with Pigment CSS | MUI 7 (2025) | Smaller CSS output, better extraction |

**Deprecated/outdated:**
- `modularizeImports`: Replaced by `optimizePackageImports` which works automatically
- Manual barrel export optimization: Now automatic in Next.js 13.5+
- `transpilePackages` for MUI: No longer needed with optimizePackageImports

## Identified Heavy Components for Lazy Loading

Based on codebase analysis, these are the candidates for lazy loading:

### High Priority (Directly impacts LCP/TTI)

| Component | Location | Libraries | Est. Size | Action |
|-----------|----------|-----------|-----------|--------|
| ComposeDialog | email/compose/ | TipTap (~200KB) | ~250KB | Dynamic import on compose action |
| FollowupsKanbanBoard | productivity/KanbanBoard/ | @dnd-kit (~50KB) | ~100KB | Dynamic import with ssr: false |
| Calendar | dashboard/Calendar.tsx | FullCalendar (~300KB) | ~350KB | Already lazy loads main component |
| AiDashboard | ai/AiDashboard/ | Multiple chat components | ~150KB | Already lazy loads subcomponents |

### Medium Priority (Secondary pages)

| Component | Location | Libraries | Est. Size | Action |
|-----------|----------|-----------|-----------|--------|
| ai-elements/* | src/components/ai-elements/ | @xyflow, motion | ~200KB | Isolate behind dynamic import |
| Settings | dashboard/Settings.tsx | Complex forms | ~80KB | Consider lazy if not on critical path |
| Contacts | dashboard/Contacts.tsx | Complex table | ~70KB | Already separate route chunk |

### Low Priority (Already Optimized)

| Component | Status | Notes |
|-----------|--------|-------|
| Dashboard widgets | ✅ Lazy loaded | All 8 widgets use React.lazy |
| Landing page sections | ✅ Dynamic import | Hero, Features, etc. use next/dynamic |
| ThreadListSkeleton | ✅ Good skeleton | Proper 3-line layout matching |

## Open Questions

1. **Bundle Analyzer Verification Needed**
   - What we know: @next/bundle-analyzer is configured
   - What's unclear: Actual bundle sizes and chunk composition
   - Recommendation: Run `ANALYZE=true npm run build` to get actual numbers before implementation

2. **TipTap Extension Tree-Shaking**
   - What we know: 30+ TipTap extensions are imported in useExtensions.ts
   - What's unclear: Whether all extensions are actually used or if some can be removed
   - Recommendation: Audit useExtensions.ts during implementation

3. **Allotment SSR Compatibility**
   - What we know: Allotment is used in EmailLayout for resizable panels
   - What's unclear: Whether it needs ssr: false or if it handles SSR gracefully
   - Recommendation: Test during implementation, add ssr: false if hydration errors occur

## Lighthouse CI Integration

### Existing Configuration (lighthouserc.js)

The project already has a well-configured Lighthouse CI setup:

```javascript
// Performance assertions already configured:
'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],  // 2.5s target
'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
'interactive': ['warn', { maxNumericValue: 3500 }],  // 3.5s target
```

### GitHub Actions Integration Needed

The current `frontend-ci.yml` workflow runs build but not Lighthouse CI. Integration steps:

1. Add LHCI step after build:
```yaml
- name: Run Lighthouse CI
  run: npx @lhci/cli autorun
```

2. Consider adding Lighthouse CI GitHub App for PR comments
3. Add performance budgets to prevent regressions

## Sources

### Primary (HIGH confidence)
- [Next.js Official: Lazy Loading Guide](https://nextjs.org/docs/pages/guides/lazy-loading) - Core patterns and API reference
- [Next.js Official: optimizePackageImports](https://nextjs.org/docs/pages/api-reference/config/next-config-js/optimizePackageImports) - Package import optimization
- [Vercel Blog: How we optimized package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) - MUI optimization details

### Secondary (MEDIUM confidence)
- [Blazity: Code Splitting in Next.js](https://blazity.com/blog/code-splitting-next-js) - Best practices overview
- [DEV.to: Next.js 14+ Performance Optimization](https://dev.to/hijazi313/nextjs-14-performance-optimization-modern-approaches-for-production-applications-3n65) - Modern approaches
- [LogRocket: How to analyze Next.js bundles](https://blog.logrocket.com/how-to-analyze-next-js-app-bundles/) - Bundle analysis guide

### Tertiary (LOW confidence - needs validation)
- Performance targets (4.12s LCP) from prior audit - needs re-verification with current codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and configured
- Architecture: HIGH - Codebase analysis confirms patterns and heavy components
- Pitfalls: HIGH - Documented from official sources and codebase-specific issues

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable Next.js ecosystem)
