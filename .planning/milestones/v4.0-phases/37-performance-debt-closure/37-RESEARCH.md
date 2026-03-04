# Phase 37: Performance & Debt Closure - Research

**Researched:** 2026-03-04
**Domain:** Frontend performance optimization, Lighthouse CI enforcement, technical debt closure
**Confidence:** HIGH

## Summary

Phase 37 covers three distinct workstreams: (1) frontend bundle optimization to hit LCP <2.5s and TTI <3.5s targets (currently ~4.1s), (2) closing 7 deferred bugs from the v3.1 audit, and (3) enforcing Lighthouse CI budget gates in the CI pipeline plus memory profiling.

The project already has significant infrastructure in place: `@next/bundle-analyzer` is installed, `lighthouserc.js` is configured with correct thresholds, and a `frontend-ci.yml` workflow includes a Lighthouse step (currently `continue-on-error: true`). The email list page (`email.tsx`, 1017 lines) loads 25 imports eagerly with zero dynamic imports -- this is the primary LCP bottleneck. Heavy dependencies like TipTap (28+ extensions), FullCalendar (6 packages), Rive, and assistant-ui are likely bundled into chunks that load on every page.

Critically, the "7 deferred bugs" narrative from the ROADMAP requires clarification: RC-A1 and RC-A8 race conditions were already fixed in Phase 22 (v3.1 bug audit). The actual 7 DEFERRED bugs from the BUG-REPORT are: BUG-011 (LCP), BUG-012 (TTI), BUG-018 (i18n hardcoded strings), BUG-029 (file size violation), BUG-038 (WCAG keyboard), BUG-039 (WCAG contrast), BUG-044 (ESLint warnings). Most of these are code quality flags, not functional bugs.

**Primary recommendation:** Run `ANALYZE=true npm run build` to get actual bundle breakdown, then apply dynamic imports on email.tsx (ComposeDialog, LabelPickerDialog, FolderPickerDialog, KeyboardShortcutsDialog, ThreadView), add TipTap/FullCalendar/Rive to route-level code splitting, and flip Lighthouse CI from `continue-on-error: true` to blocking.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-01 | Lighthouse LCP <2.5s and TTI <3.5s on email list page (production build, 4G throttled) | Bundle analysis baseline, dynamic imports for heavy components, code splitting for TipTap/FullCalendar/Rive, `optimizePackageImports` expansion |
| PERF-02 | All 7 deferred v3.1 bugs resolved (RC-A1/A8 race conditions + BUG-REPORT items) | RC-A1/A8 already fixed (Phase 22). Remaining 7 deferred items are: BUG-011/012 (LCP/TTI -- covered by PERF-01), BUG-018/029/044 (code quality flags), BUG-038/039 (minor WCAG) |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@next/bundle-analyzer` | ^16.1.6 | Bundle size visualization | Already configured in next.config.js |
| `@lhci/cli` | latest | Lighthouse CI automation | Already in frontend-ci.yml workflow |
| Next.js | ^16.1.6 | Framework with built-in code splitting | Pages router, automatic route-based splitting |
| React | ^19.2.4 | UI framework with React Compiler | Stable compiler in Next.js 16 auto-optimizes renders |

### Supporting (May Need Installation)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@next/third-parties` | ^16.x | Deferred loading of third-party scripts | If analytics/tracking scripts found |
| `clinic` or `0x` | latest | Node.js memory profiling (backend) | Plan 37-03 memory profiling |
| `autocannon` | latest | HTTP load testing | Simulated load for memory profiling |

### Already Configured

| Tool | Location | Status |
|------|----------|--------|
| Bundle analyzer | `next.config.js` wraps with `withBundleAnalyzer` | Ready: `ANALYZE=true npm run build` |
| Lighthouse CI config | `frontend/lighthouserc.js` | Thresholds set: LCP 2500ms, TTI 3500ms, CLS 0.1 |
| Frontend CI workflow | `.github/workflows/frontend-ci.yml` | Lighthouse step exists but `continue-on-error: true` |
| `optimizePackageImports` | `next.config.js` experimental | Only covers `@mui/material`, `@mui/icons-material` |

## Architecture Patterns

### Pattern 1: Dynamic Import for Non-Critical Components

**What:** Use `next/dynamic` or `React.lazy` for components not needed on initial render of email list page.

**When to use:** Any component that renders behind user interaction (dialogs, compose, thread view).

**Email page candidates (email.tsx has ZERO dynamic imports currently):**

```typescript
// Source: Next.js docs + codebase analysis
import dynamic from 'next/dynamic';

// These are currently eagerly imported in email.tsx:
const ComposeDialog = dynamic(() => import('@/components/email/compose/ComposeDialog'), { ssr: false });
const LabelPickerDialog = dynamic(() => import('@/components/email/labels').then(m => ({ default: m.LabelPickerDialog })), { ssr: false });
const FolderPickerDialog = dynamic(() => import('@/components/email/folders/FolderPickerDialog').then(m => ({ default: m.FolderPickerDialog })), { ssr: false });
const KeyboardShortcutsDialog = dynamic(() => import('@/components/email/keyboard').then(m => ({ default: m.KeyboardShortcutsDialog })), { ssr: false });
const ExpandedMessage = dynamic(() => import('@/components/email/thread').then(m => ({ default: m.ExpandedMessage })));
```

### Pattern 2: Route-Level Code Splitting for Heavy Libraries

**What:** Ensure TipTap, FullCalendar, Rive, and assistant-ui are NOT in shared chunks loaded on email page.

**Impact assessment of heavy dependencies:**

| Package Group | Est. Size | Loaded on Email Page? | Action |
|--------------|-----------|----------------------|--------|
| TipTap (28+ extensions) | ~200-400KB | Yes if ComposeDialog imported eagerly | Dynamic import ComposeDialog |
| FullCalendar (6 packages) | ~150-300KB | No (calendar.tsx page only) | Verify not in shared chunk |
| @rive-app/react-webgl2 | ~200KB+ | Check | Dynamic import if on email route |
| assistant-ui + streamdown | ~100-200KB | Check (AI chat) | Should be route-isolated |
| @dnd-kit | ~50-80KB | Likely (email sidebar) | Accept if needed for DnD |

### Pattern 3: DashboardContainer as Reference

**What:** DashboardContainer.tsx already uses `React.lazy()` correctly for all widgets.

```typescript
// Already in codebase - good pattern to follow:
const BriefingWidget = lazy(() =>
  import('./widgets/BriefingWidget').then((m) => ({ default: m.BriefingWidget }))
);
```

**Email page should follow the same pattern** for dialogs and secondary views.

### Pattern 4: optimizePackageImports Expansion

**What:** Next.js `experimental.optimizePackageImports` tree-shakes barrel exports. Currently only MUI.

```javascript
// Expand in next.config.js:
optimizePackageImports: [
  '@mui/material',
  '@mui/icons-material',
  'lucide-react',        // Icon library used across project
  '@radix-ui/react-*',   // Multiple Radix packages
  '@tiptap/core',        // TipTap if barrel-exported
],
```

### Anti-Patterns to Avoid

- **Importing entire icon libraries:** `import { Pencil } from 'lucide-react'` should tree-shake, but verify with bundle analysis
- **Shared chunks pulling page-specific code:** If TipTap ends up in a common chunk because multiple pages import ComposeDialog, the email list page pays the cost
- **Over-splitting:** Don't dynamically import the ThreadList component itself -- it IS the LCP element

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundle analysis | Custom webpack stats parser | `ANALYZE=true npm run build` + `@next/bundle-analyzer` | Already configured, generates interactive treemap |
| Lighthouse CI | Custom perf measurement scripts | `@lhci/cli autorun` with `lighthouserc.js` | Already configured with correct thresholds |
| Memory profiling | Custom heap snapshots | `node --inspect` + Chrome DevTools / `clinic doctor` | Standard tooling, well-documented |
| Code splitting | Manual webpack chunk configuration | `next/dynamic` / `React.lazy` | Next.js handles chunk naming, prefetching |
| Performance budgets | Custom CI checks | Lighthouse CI assertions | Already have `lighthouserc.js` with error/warn levels |

## Common Pitfalls

### Pitfall 1: Measuring Dev Mode Instead of Production Build

**What goes wrong:** Dev mode LCP/TTI numbers are 3-5x worse than production. Optimizations look like they don't work.
**Why it happens:** Next.js dev mode disables tree-shaking, code splitting, and React compiler optimizations.
**How to avoid:** Always measure with `npm run build && npm run start`. Lighthouse CI config already uses `startServerCommand: 'npm run start'`.
**Warning signs:** LCP >5s even after aggressive splitting.

### Pitfall 2: Dynamic Import Breaking SSR

**What goes wrong:** Components with `{ ssr: false }` flash on hydration (layout shift).
**Why it happens:** Server sends empty placeholder, client renders component -- causes CLS.
**How to avoid:** Only use `ssr: false` for truly client-only components (WebGL, browser APIs). Provide proper Skeleton fallback via `loading` prop.

### Pitfall 3: Lighthouse CI Running Without Backend

**What goes wrong:** Email list page makes API calls that fail, showing error state instead of email list. Lighthouse measures error page LCP, not real LCP.
**Why it happens:** CI environment has no backend/database.
**How to avoid:** Either (a) mock API responses for Lighthouse runs, or (b) accept that Lighthouse CI measures the loading skeleton + error state, and focus on JS bundle metrics (TBT, TTI) rather than visual LCP. The `lighthouserc.js` currently uses `startServerCommand: 'npm run start'` which starts frontend only.

### Pitfall 4: Cache Warmth Affecting Results

**What goes wrong:** First run shows 4s LCP, subsequent runs show 1.5s due to browser/CDN caching.
**Why it happens:** Lighthouse should use clean cache by default, but `numberOfRuns: 3` averages can mask cold-start issues.
**How to avoid:** Lighthouse CI's `numberOfRuns: 3` with median already handles this. Keep it.

### Pitfall 5: RC-A1/A8 Confusion

**What goes wrong:** Planner creates tasks to "fix RC-A1/A8 with Redis locks" even though they were fixed in Phase 22.
**Why it happens:** ROADMAP.md and REQUIREMENTS.md still reference them.
**How to avoid:** The 7 deferred bugs are: BUG-011, BUG-012, BUG-018, BUG-029, BUG-038, BUG-039, BUG-044. RC-A1/A8 are NOT in scope -- they are already fixed and verified.

## Code Examples

### Dynamic Import with Loading Fallback (Next.js Pages Router)

```typescript
// Source: Next.js docs, adapted for this project's pattern
import dynamic from 'next/dynamic';
import { Skeleton, Box } from '@mui/material';

const ComposeDialog = dynamic(
  () => import('@/components/email/compose/ComposeDialog').then(m => ({ default: m.ComposeDialog })),
  {
    ssr: false,
    loading: () => null, // Dialog is hidden by default, no skeleton needed
  }
);
```

### Lighthouse CI Enforcement (Remove continue-on-error)

```yaml
# .github/workflows/frontend-ci.yml - change from:
      - name: Run Lighthouse CI
        run: npx @lhci/cli autorun
        continue-on-error: true  # REMOVE THIS LINE

# to:
      - name: Run Lighthouse CI
        run: npx @lhci/cli autorun
        # No continue-on-error -- PRs that regress LCP/TTI/CLS are blocked
```

### Memory Profiling with clinic

```bash
# Backend memory profiling under load
npx clinic doctor -- node dist/main.js &
# Simulate load
npx autocannon -c 20 -d 60 http://localhost:3000/api/v1/emails?folderId=inbox
# Generates flame graph + heap timeline
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual webpack config | Next.js `optimizePackageImports` | Next.js 14+ | Automatic barrel export tree-shaking |
| React.memo everywhere | React Compiler (stable in Next.js 16) | Next.js 16 / React 19 | Automatic memoization, no manual optimization |
| getServerSideProps + waterfall | React 19 Suspense + streaming | React 19 | Progressive hydration reduces TTI |
| Custom perf monitoring | Lighthouse CI with budget assertions | Lighthouse CI v1+ | Automated regression detection in CI |

**Deprecated/outdated:**
- `@next/font` is now `next/font` (built-in)
- Manual `React.memo` / `useMemo` wrapping -- React Compiler handles this in Next.js 16

## Open Questions

1. **Actual bundle composition unknown**
   - What we know: Email page has 25 eager imports, heavy deps exist (TipTap, FullCalendar, Rive)
   - What's unclear: Exact chunk sizes and which heavy deps land in the email page's chunk
   - Recommendation: Plan 37-01 must run `ANALYZE=true npm run build` as first task before any optimization

2. **Backend memory profiling scope**
   - What we know: Prisma connection pool is set to 20, IMAP pool uses semaphore, BullMQ has 54 workers
   - What's unclear: Whether there's actual unbounded growth or just theoretical concern
   - Recommendation: Run backend under simulated load for 10min, capture heap snapshots at 1/5/10min

3. **Lighthouse CI without backend data**
   - What we know: Email list page needs API data to render meaningful content
   - What's unclear: Whether Lighthouse CI results will be meaningful without a backend
   - Recommendation: Measure JS parse/compile time (TBT, TTI) even without data -- these are bundle-size-dependent and meaningful. LCP measurement requires either mock server or acceptance that we measure skeleton load.

## Deferred Bug Analysis

The "7 deferred v3.1 bugs" from BUG-REPORT Plan 04:

| Bug ID | Category | Description | Effort | Action |
|--------|----------|-------------|--------|--------|
| BUG-011 | perf | LCP 4.12s (target 2.5s) | HIGH | Covered by PERF-01 (bundle splitting) |
| BUG-012 | perf | TTI 4.13s (target 3.5s) | HIGH | Covered by PERF-01 (bundle splitting) |
| BUG-018 | code-quality | i18n hardcoded strings (non-user-facing) | LOW | Find and replace with t() calls |
| BUG-029 | code-quality | en.ts/it.ts >500 lines (3500+ lines) | LOW | Accepted exception -- translation type safety depends on single export |
| BUG-038 | code-quality | TODO: Signature from user settings | LOW | Convert DEBT comment to accepted or wire signature |
| BUG-039 | code-quality | TODO: Folder picker dialog | LOW | FolderPickerDialog now exists -- verify wiring |
| BUG-044 | code-quality | ESLint ai-elements warnings (10 errors) | LOW | React compiler rules in external component dir -- acceptable |

**Critical insight:** BUG-011 and BUG-012 are the same root cause as PERF-01. BUG-029 and BUG-044 should be marked as accepted exceptions (not bugs). BUG-038, BUG-039, and BUG-018 are minor debt items. RC-A1/A8 are NOT in this list -- they were fixed in Phase 22.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (frontend) + Lighthouse CI |
| Config file | `frontend/lighthouserc.js` (exists) |
| Quick run command | `cd frontend && npx @lhci/cli collect --url="http://localhost:3001/dashboard/email"` |
| Full suite command | `cd frontend && npx @lhci/cli autorun` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | LCP <2.5s on email list | lighthouse | `npx @lhci/cli autorun` (asserts via lighthouserc.js) | lighthouserc.js exists |
| PERF-01 | TTI <3.5s on email list | lighthouse | Same as above (TTI assertion in lighthouserc.js) | lighthouserc.js exists |
| PERF-02 | Deferred bugs closed | manual | Visual review + type-check + lint | N/A |

### Sampling Rate

- **Per task commit:** `cd frontend && npm run type-check && npm run lint`
- **Per wave merge:** `cd frontend && npm run build` (verifies no build regression from dynamic imports)
- **Phase gate:** `npx @lhci/cli autorun` green (requires running backend or mock) + all deferred bugs documented as resolved

### Wave 0 Gaps

- [ ] No mock server for Lighthouse CI in CI environment -- may need `msw` or accept TTI-only measurement
- [ ] `clinic` / `autocannon` not installed for backend memory profiling -- install in Plan 37-03

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `frontend/next.config.js`, `frontend/lighthouserc.js`, `.github/workflows/frontend-ci.yml`
- Codebase analysis: `frontend/pages/dashboard/email.tsx` (1017 lines, 25 eager imports, 0 dynamic imports)
- Codebase analysis: `.planning/phases/22-bug-audit/22-BUG-REPORT.md` (definitive list of deferred bugs)
- Codebase analysis: `backend/src/modules/email-sync/services/folder-sync.service.ts` (RC-A1/A8 already fixed with Redis locks)

### Secondary (MEDIUM confidence)

- [Next.js Package Bundling Guide](https://nextjs.org/docs/app/guides/package-bundling) - code splitting patterns
- [Next.js Production Checklist](https://nextjs.org/docs/pages/guides/production-checklist) - performance optimization
- [Lighthouse CI GitHub](https://github.com/GoogleChrome/lighthouse-ci) - CI enforcement patterns
- [Lighthouse CI Action](https://github.com/marketplace/actions/lighthouse-ci-action) - GitHub Actions integration

### Tertiary (LOW confidence)

- Bundle size estimates for TipTap/FullCalendar/Rive are approximate -- need `ANALYZE=true` build for actuals

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already installed and configured in the project
- Architecture: HIGH - patterns verified against existing DashboardContainer.tsx lazy loading
- Pitfalls: HIGH - RC-A1/A8 confusion is a concrete risk verified against BUG-REPORT
- Deferred bugs: HIGH - definitive list from 22-BUG-REPORT.md with exact bug IDs and statuses

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, no fast-moving dependencies)
