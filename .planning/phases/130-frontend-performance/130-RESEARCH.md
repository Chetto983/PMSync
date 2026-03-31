# Phase 130: Frontend Performance - Research

**Researched:** 2026-03-31
**Domain:** Next.js bundle optimization, HTTP caching headers, dynamic imports
**Confidence:** HIGH

## Summary

Phase 130 addresses two requirements: PERF-01 (bundle analysis + dynamic imports for heavy deps) and PERF-02 (Cache-Control headers on read-heavy GET endpoints). The frontend is Next.js 16 (Pages Router) with `@next/bundle-analyzer` already installed but not yet used for optimization beyond the landing page and a few dashboard routes.

The codebase already uses `next/dynamic` extensively across dashboard pages and has `optimizePackageImports` for MUI and lucide-react. However, several heavy dependencies are still statically imported: FullCalendar plugins in Calendar.tsx (even though the main component is lazy), recharts in several CRM sub-components that aren't dynamically imported from their page entry points, and TipTap extensions in compose components. `@xyflow/react` is listed in the phase description but is NOT in the dependency tree and NOT imported anywhere -- it only appears in a planning PRD document.

For PERF-02, zero Cache-Control headers currently exist on any API GET endpoints. NestJS's `@Header()` decorator is the standard, clean approach.

**Primary recommendation:** Run bundle analysis to identify actual chunk sizes, then dynamically import the Calendar page component (pulls in FullCalendar + all plugins), and add a lightweight `@Header('Cache-Control', ...)` decorator to the 3-4 read-heavy GET endpoints (labels list, folders list, pricing table).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | Bundle analysis run and heavy dependencies dynamically imported (TipTap, chart libs, FullCalendar, @xyflow/react) reducing initial JS payload | Bundle analyzer already installed; Calendar.tsx statically imports 4 FullCalendar plugins; TipTap compose already lazy via ComposeDialog; recharts components already lazy via widget-registry and page-level dynamic(); @xyflow/react not used in codebase |
| PERF-02 | Cache-Control headers added to read-heavy GET endpoints (folders, labels, pricing table) | No Cache-Control headers exist; NestJS @Header decorator is the standard approach; 4 target endpoints identified |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Post-edit validation mandatory: `cd frontend && npx tsc --noEmit` for frontend, `cd backend && npx tsc --noEmit` for backend
- SCOPE CONTROL: Do exactly what was asked -- no unrequested features
- FOLLOW EXISTING PATTERNS: Use `next/dynamic` with `{ ssr: false, loading: () => <Skeleton ... /> }` pattern already established
- Performance rule from CLAUDE.md: "Critical widgets load immediately. Non-critical use `React.lazy` + `Suspense` with skeleton fallback"
- TanStack Query defaults: `staleTime: 5min`, `gcTime: 30min` -- Cache-Control max-age should align with or be shorter than staleTime
- Max 500 lines per file
- MUI theme `sx` props only for any loading skeletons

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@next/bundle-analyzer` | 16.1.6 | Webpack bundle visualization | Installed as devDep, configured in next.config.js |
| `next/dynamic` | 16.1.6 | Code-splitting via dynamic imports | Already used in ~25+ pages |
| NestJS `@Header` decorator | 11.x | Declarative response header setting | Built into @nestjs/common |

### Heavy Dependencies to Target
| Library | Version | Approx Size (gzip) | Current Import Pattern | Action Needed |
|---------|---------|---------------------|------------------------|---------------|
| `@fullcalendar/*` (6 packages) | 6.1.20 | ~120-150KB | Calendar.tsx: component lazy, **plugins static** | Dynamic import entire Calendar page component |
| `recharts` | 3.8.0 | ~80-100KB | 9 component files import directly | Already lazy via page-level `dynamic()` -- verify no leaks |
| `@tiptap/*` (30+ extensions) | 3.19-3.20 | ~150-200KB | ComposeEditor statically imports all | Already lazy via ComposeDialog lazy import -- verify no leaks |
| `mui-tiptap` | 1.29.0 | ~30-40KB | EditorMenuControls imports | Pulled in via ComposeEditor chain -- already lazy |
| `allotment` | 1.20.5 | ~20KB | EmailLayout static import | Lower priority, only used on email page |
| `@xyflow/react` | N/A | N/A | **NOT INSTALLED, NOT USED** | No action needed |

**No new packages need to be installed.**

## Architecture Patterns

### Pattern 1: Page-Level Dynamic Import (Established Pattern)
**What:** Dashboard pages use `next/dynamic` to lazy-load their main component
**When to use:** Every dashboard page that imports heavy visualization/editor libraries
**Example (already in codebase):**
```typescript
// Source: frontend/pages/dashboard/analytics.tsx
import dynamic from 'next/dynamic';
import { Skeleton } from '@mui/material';

const AnalyticsChart = dynamic(
  () => import('@/components/dashboard/AnalyticsChart').then(m => ({ default: m.AnalyticsChart })),
  { ssr: false, loading: () => <Skeleton variant="rounded" height={400} /> },
);
```

### Pattern 2: Calendar Page Needs Dynamic Import
**What:** Calendar page currently statically imports `<Calendar />`, pulling in all FullCalendar plugins
**Current (problematic):**
```typescript
// frontend/pages/dashboard/calendar.tsx -- STATIC import
import { Calendar } from '@/components/dashboard/Calendar';
```
**Fix:** Convert to dynamic import like other dashboard pages.

### Pattern 3: FullCalendar Plugin Static Imports Inside Lazy Component
**What:** Even though `Calendar.tsx` lazily loads `@fullcalendar/react`, the 4 plugins are statically imported at module top level
**Current:**
```typescript
// frontend/components/dashboard/Calendar.tsx
const FullCalendar = lazy(() => import('@fullcalendar/react'));
import dayGridPlugin from '@fullcalendar/daygrid';      // STATIC
import timeGridPlugin from '@fullcalendar/timegrid';     // STATIC
import listPlugin from '@fullcalendar/list';              // STATIC
import interactionPlugin from '@fullcalendar/interaction'; // STATIC
```
**Impact:** These static imports only execute when Calendar.tsx module loads. If calendar.tsx page uses `next/dynamic` for Calendar, the plugins would be code-split with the Calendar chunk. The fix at the page level is sufficient -- no need to restructure the component internals.

### Pattern 4: NestJS @Header Decorator for Cache-Control
**What:** Declarative cache headers on controller methods
**Example:**
```typescript
import { Header } from '@nestjs/common';

@Get()
@Header('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
async listLabels(@Req() req: AuthenticatedRequest) {
  // ...
}
```

### Anti-Patterns to Avoid
- **Don't restructure component internals for code-splitting:** If the page entry uses `next/dynamic`, the entire component tree below it is already in a separate chunk. No need to lazy-load plugins inside an already-lazy component.
- **Don't add Cache-Control to mutation endpoints:** Only GET endpoints that return relatively stable data.
- **Don't set `public` Cache-Control on authenticated endpoints:** User-specific data must use `private` to prevent CDN/proxy caching of personal data.
- **Don't use very long max-age on folder/label endpoints:** These change when users create/delete labels. 60s is reasonable; TanStack Query staleTime (5min) handles client-side freshness.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundle visualization | Custom webpack stats parser | `ANALYZE=true npm run build` with @next/bundle-analyzer | Already configured, produces interactive treemap |
| Code splitting | Manual webpack chunk config | `next/dynamic` with `{ ssr: false }` | Next.js handles chunk naming, preloading, and loading states |
| HTTP caching | Custom interceptor/middleware | NestJS `@Header()` decorator | Declarative, visible at controller level, no extra wiring |
| Import optimization | Manual path rewriting | `optimizePackageImports` in next.config.js | Already configured for MUI/lucide; add recharts if needed |

## Common Pitfalls

### Pitfall 1: Forgetting SSR: false on Client-Only Libraries
**What goes wrong:** FullCalendar, recharts, and TipTap all access `window`/`document`. Without `ssr: false`, Next.js tries to render them server-side and crashes.
**How to avoid:** Every `next/dynamic` call for these libraries MUST include `{ ssr: false }`.
**Warning signs:** `ReferenceError: window is not defined` during build or SSR.

### Pitfall 2: Cache-Control on Authenticated User-Specific Data
**What goes wrong:** Using `public` instead of `private` allows shared caches (CDN, proxy) to serve one user's data to another.
**How to avoid:** Always use `Cache-Control: private, max-age=N` for endpoints behind auth (labels, folders). Only pricing_table (unauthenticated variant) can use `public`.
**Warning signs:** User sees another user's labels after CDN caching.

### Pitfall 3: Stale Cache After Mutation
**What goes wrong:** User creates a label, but GET /labels returns cached response without it.
**How to avoid:** Keep max-age short (30-60s). TanStack Query's `invalidateQueries` handles client-side cache busting on mutations already. The server cache header is belt-and-suspenders for repeat page loads.
**Warning signs:** UI shows stale data after create/update operations.

### Pitfall 4: Bundle Analyzer False Positives
**What goes wrong:** Bundle analyzer shows a library as "large" but it's already in a separate chunk and only loaded on demand.
**How to avoid:** Check which chunk the library lands in. If it's in a page-specific chunk (not `_app` or `commons`), it's already code-split. Focus on libraries appearing in shared/common chunks.
**Warning signs:** Optimizing something that was already optimized, adding complexity for no gain.

### Pitfall 5: Breaking Named Exports with Dynamic Import
**What goes wrong:** `dynamic(() => import('./Foo'))` fails if `Foo` is a named export, not default.
**How to avoid:** Use `.then(m => ({ default: m.NamedExport }))` pattern (already established in codebase).
**Warning signs:** Component renders as `undefined` or blank.

## Code Examples

### Dynamic Import for Calendar Page
```typescript
// frontend/pages/dashboard/calendar.tsx
import dynamic from 'next/dynamic';
import { Skeleton } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const Calendar = dynamic(
  () => import('@/components/dashboard/Calendar').then(m => ({ default: m.Calendar })),
  { ssr: false, loading: () => <Skeleton variant="rounded" height={600} /> },
);

export default function CalendarPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Calendar">
        <Calendar />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
```

### Cache-Control on Labels Controller
```typescript
// backend/src/modules/labels/controllers/labels.controller.ts
@Get()
@Header('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
@ApiOperation({ summary: 'List all labels' })
async listLabels(@Req() req: AuthenticatedRequest) {
  // existing implementation
}
```

### Cache-Control on Pricing Table (Public)
```typescript
// backend/src/modules/subscription/controllers/autumn.controller.ts
@Get('components/pricing_table')
@Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
@ApiOperation({ summary: 'Get pricing table' })
async getPricingTable(): Promise<PricingTableDto> {
  return this.autumnService.getPricingTable();
}
```

### Running Bundle Analysis
```bash
# Windows CMD
set ANALYZE=true && cd frontend && npm run build

# Windows PowerShell
$env:ANALYZE="true"; cd frontend; npm run build
```

## Detailed Audit: What's Already Lazy vs. Needs Work

### Already Lazy (No Action Needed)
| Component | Import Pattern | Heavy Dep |
|-----------|---------------|-----------|
| AnalyticsChart | `dynamic()` in analytics.tsx | recharts |
| ChatPage | `dynamic()` in ai.tsx | ai-sdk, assistant-ui |
| ComposeEditor | `lazy()` in ComposeDialog.tsx | TipTap (all 30+ extensions) |
| TrendChartsWidget | `lazy()` in widget-registry.ts | recharts |
| WritingStyleSettings | `dynamic()` in Settings.tsx | TipTap |
| SignatureSettings | `dynamic()` in Settings.tsx | TipTap |
| TemplateSettings | `dynamic()` in Settings.tsx | TipTap |
| All CRM pages | `dynamic()` in each page file | recharts (via sub-components) |
| Landing page sections | `dynamic()` in index.tsx | various |

### Needs Dynamic Import
| Component | Current Pattern | Heavy Dep | Fix |
|-----------|----------------|-----------|-----|
| Calendar (page) | Static import in calendar.tsx | FullCalendar + 4 plugins (~150KB) | Convert to `dynamic()` |

### Verify (May Already Be Fine)
| Component | Current Pattern | Check |
|-----------|----------------|-------|
| EmailLayout (allotment) | Static import | Verify it lands in email page chunk, not commons |

## Cache-Control Target Endpoints

| Endpoint | Controller | Auth | Recommended Header | Rationale |
|----------|-----------|------|-------------------|-----------|
| `GET /labels` | LabelsController | Yes | `private, max-age=60, s-w-r=120` | Labels change infrequently; 60s safe |
| `GET /folders` | FoldersController | Yes | `private, max-age=30, s-w-r=60` | Folders include unread counts (refresh counts on each call already); shorter TTL |
| `GET /subscription/components/pricing_table` | AutumnController | No | `public, max-age=300, s-w-r=600` | Pricing rarely changes; 5min cache safe |
| `GET /subscription/components/pricing_table/authenticated` | AutumnController | Yes | `private, max-age=120, s-w-r=300` | User-specific pricing; moderate cache |

**Note on folders endpoint:** The `GET /folders` handler calls `updateAllFolderCounts()` on every request (line 321-325 in folders.controller.ts). Cache-Control won't prevent this server-side work -- it only prevents the browser from making the request at all within max-age. This is actually the ideal behavior: when the cache expires, the next request gets fresh counts.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2 + Playwright 1.58 |
| Config file | `frontend/jest.config.js`, `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx jest --passWithNoTests` |
| Full suite command | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | Bundle analysis identifies heavy deps | manual | `cd frontend && set ANALYZE=true && npm run build` | N/A (manual analysis) |
| PERF-01 | Dynamic imports render with loading fallback | smoke | Lighthouse or manual browser check | N/A (visual) |
| PERF-01 | No functionality regression | type-check | `cd frontend && npx tsc --noEmit` | Existing |
| PERF-02 | Cache-Control headers present on target endpoints | unit/integration | `cd backend && npx jest --testPathPattern=labels\|folders\|autumn` | Partial |
| PERF-02 | Headers have correct values | curl/manual | `curl -I https://api.pmsync.app/labels` | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` + `cd backend && npx tsc --noEmit`
- **Per wave merge:** Full type-check both packages
- **Phase gate:** Type-check green + bundle analysis run + manual Lighthouse check

### Wave 0 Gaps
- None -- existing type-check infrastructure covers all phase requirements. Bundle analysis is manual by nature.

## Open Questions

1. **Folders endpoint server-side cost**
   - What we know: `GET /folders` runs `updateAllFolderCounts()` on every call, hitting the DB
   - What's unclear: Whether this is intentional as a "refresh on view" pattern or wasteful
   - Recommendation: Add Cache-Control header anyway (prevents redundant browser requests), but flag for future optimization of the count refresh logic

2. **allotment in email page**
   - What we know: EmailLayout statically imports allotment (~20KB), used only on email page
   - What's unclear: Whether webpack already splits it into the email page chunk
   - Recommendation: Run bundle analysis first; if allotment appears in commons chunk, add dynamic import. Low priority.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `frontend/next.config.js`, `frontend/package.json`, all dashboard page files, Calendar.tsx, ComposeDialog.tsx, widget-registry.ts
- [Next.js optimizePackageImports docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
- [NestJS Controllers - @Header decorator](https://docs.nestjs.com/controllers)

### Secondary (MEDIUM confidence)
- [Vercel blog: How we optimized package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [Next.js Pages Router optimizePackageImports](https://nextjs.org/docs/pages/api-reference/config/next-config-js/optimizePackageImports)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already installed, patterns established in codebase
- Architecture: HIGH - examined every import path for the 4 target libraries
- Pitfalls: HIGH - based on established Next.js/NestJS patterns and codebase inspection

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable dependencies, no fast-moving targets)
