# Phase 08-04 Performance Baseline

**Date:** 2026-02-04
**Measured On:** Windows 11, Node 22.x, Next.js 16.1.4 (Turbopack)

## Core Web Vitals

| Metric | Value | Budget | Status |
|--------|-------|--------|--------|
| LCP (Largest Contentful Paint) | 4.12s | <= 2.5s | **WARN** |
| CLS (Cumulative Layout Shift) | 0.0000 | <= 0.1 | PASS |
| TBT (Total Blocking Time) | 182ms | <= 300ms | PASS |
| FCP (First Contentful Paint) | 760ms | <= 1.8s | PASS |
| TTI (Time to Interactive) | 4.13s | <= 3.5s | **WARN** |

## Lighthouse Scores

| Category | Score | Threshold | Status |
|----------|-------|-----------|--------|
| Performance | 84 | >= 80 | PASS |
| Accessibility | 98 | >= 90 | PASS |
| Best Practices | 96 | >= 90 | PASS |

## Bundle Sizes

| Chunk | Size | Notes |
|-------|------|-------|
| Total JS chunks | ~24 MB | 532 files (uncompressed) |
| Largest chunk | 762 KB | Likely MUI/TipTap bundle |
| 2nd largest | 613 KB | |
| 3rd largest | 608 KB | |
| 4th largest | 520 KB | |
| 5th largest | 478 KB | |

## Analysis

### Passing Metrics
- **CLS: 0.0000** - Excellent layout stability, no shifts
- **TBT: 182ms** - Good thread responsiveness
- **FCP: 760ms** - Fast first paint
- **Performance: 84** - Above 80 threshold
- **Accessibility: 98** - Excellent a11y score
- **Best Practices: 96** - Strong best practices

### Metrics Requiring Attention

**LCP: 4.12s (Budget: 2.5s)**
- Exceeds Core Web Vitals "Good" threshold by 1.62s
- Root page redirects to auth/dashboard which adds latency
- Possible improvements: preload critical CSS, optimize hero images

**TTI: 4.13s (Budget: 3.5s)**
- Exceeds threshold by 0.63s
- Related to LCP - main content load affects interactivity
- Possible improvements: code splitting, defer non-critical JS

### Bundle Size Observations
- Total uncompressed JS is 24MB across 532 chunks
- Largest single chunk is 762KB (likely MUI + icons)
- Code splitting is aggressive (532 chunks) which is good for caching
- Consider tree-shaking opportunities in largest chunks

## Tech Debt Tracked

1. **LCP optimization needed** - Current 4.12s exceeds 2.5s budget
2. **TTI optimization needed** - Current 4.13s exceeds 3.5s budget
3. **Bundle analysis** - Run `ANALYZE=true npm run build` to identify large dependencies

## Notes

- Metrics measured on root page `/` which redirects to login/dashboard
- Production page metrics (email list, compose) may differ
- CLS of 0 indicates good skeleton/loading states
- High a11y score (98) reflects WCAG compliance work in Phase 06

## Recommended Next Steps

1. Run bundle analyzer to identify code splitting opportunities
2. Add preload hints for critical resources
3. Consider lazy loading non-critical MUI icons
4. Measure actual email list page for realistic user metrics
