# Bundle Analysis Report - Phase 28

**Build date:** 2026-03-03
**Next.js version:** 16.1.6 (webpack mode for analysis)
**Node.js:** 22.15.0

## Context

Phase 28-01 deleted 108 dead files (69 ai-elements, 26 AiDashboard, 6 hooks, etc.).
Phase 28-02 cleaned all remaining voltagent references and removed 89 dead swagger paths.

This report captures the "after" state. Since Plan 01 already performed the deletions,
the "before" state is not available for direct comparison.

## Total Static Bundle

| Metric | Value |
|--------|-------|
| Total static directory | 5.7 MB |
| Total chunks directory | 4.6 MB |
| Number of JS chunks | 87 |

## Top 10 Largest Chunks

| Chunk | Size (KB) | Notes |
|-------|-----------|-------|
| 4162-*.js | 658.6 | Shared vendor (MUI/libs) |
| _app-*.js | 481.2 | App shell (providers, layout, global state) |
| 8614-*.js | 324.2 | Shared vendor |
| 7741-*.js | 319.4 | Shared vendor |
| 686-*.js | 205.8 | Shared vendor |
| framework-*.js | 185.3 | React framework |
| 7375-*.js | 178.2 | Shared vendor |
| 3060-*.js | 167.1 | Shared vendor |
| main-*.js | 125.6 | Next.js main |
| cc997884-*.js | 117.7 | Shared vendor |

## Page-Specific Chunks (First Load JS per route)

| Route | Page Chunk (KB) | Notes |
|-------|-----------------|-------|
| /dashboard/settings | 104.0 | Heaviest page |
| /dashboard/calendar | 59.0 | FullCalendar library |
| /dashboard/ai | 56.5 | AI dashboard widgets |
| /dashboard/contacts | 49.4 | Contact list + virtual |
| /dashboard/email | 36.9 | Email list |
| /dashboard/ai/memories | 20.9 | Memory viewer |
| /terms | 19.1 | Static legal |
| /privacy | 17.4 | Static legal |
| /dashboard | 15.2 | Dashboard overview |
| /auth/login | 13.8 | Login form |

## ai-elements in Production Bundle

**Result: ZERO ai-elements code found in production bundle.**

```
grep -r "ai-elements" .next/static/ -> no matches
```

This confirms that Next.js tree-shaking already eliminated the ai-elements code
from the production bundle BEFORE Plan 01 performed the physical file deletion.
The dead files existed on disk but were not referenced by any live import chain,
so webpack never included them.

## Bundle Impact Assessment

**Expected delta from Phase 28 deletions: minimal to zero.**

Rationale:
1. ai-elements (69 files, ~8K LOC) were unreferenced after Phase 27 replaced
   them with assistant-ui components. Tree-shaking excluded them.
2. AiDashboard (26 files) was similarly unreferenced after its replacement.
3. VoltAgent hooks (6 files) were dead imports cleaned in 28-01.

The physical deletion in 28-01 and reference cleanup in 28-02 are hygiene
operations -- they reduce cognitive load, prevent accidental re-imports, and
clean the repository, but do not change the production bundle size.

## Observations

- The `_app` chunk at 481 KB is the heaviest single page-associated chunk
  (contains global providers, theme, query client, layout).
- MUI + vendor libraries dominate the shared chunks (~1.5 MB combined).
- No hard size targets are enforced at this phase. CI bundle budget
  enforcement is deferred to Phase 30 per CONTEXT.md decisions.

## Analyzer Reports

HTML treemap reports generated at:
- `.next/analyze/client.html` (1.2 MB)
- `.next/analyze/nodejs.html` (691 KB)
- `.next/analyze/edge.html` (275 KB)

---

*Phase: 28-cleanup-voltagent-deletion*
*Report generated: 2026-03-03*
