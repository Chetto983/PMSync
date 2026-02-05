# v2.1 Roadmap: Optimization & Polish

## Overview

**Version:** v2.1
**Goal:** Performance optimization and polish items deferred from v2.0
**Total Phases:** 3
**Total Requirements:** 5

## Phase Summary

| Phase | Name | Requirements | Focus |
|-------|------|--------------|-------|
| 01 | Performance Code Splitting | OPT-01, OPT-02 | LCP/TTI optimization |
| 02 | Polish & Completion | POLISH-01, POLISH-02 | iOS safe area, E2E tests |
| 03 | Backend Folder Nesting | API-01 | Folder hierarchy API |

---

## Phase 01: Performance Code Splitting

**Goal:** Achieve Core Web Vitals performance budgets through code splitting

**Requirements:**
- OPT-01: Code splitting for LCP (2.5s target)
- OPT-02: Code splitting for TTI (3.5s target)

**Why first:** Performance is the primary v2.1 deliverable. Audit showed 4.12s LCP vs 2.5s target.

**Approach:**
1. Audit bundle with webpack-bundle-analyzer
2. Identify heavy non-critical components (dashboard widgets, kanban, etc.)
3. Implement React.lazy with Suspense boundaries
4. Add skeleton fallbacks
5. Verify with Lighthouse CI

**Plans:** 2 plans (Wave 1 + Wave 2)

Plans:
- [x] 01-01-PLAN.md — Bundle analysis + React.lazy implementation (Wave 1) ✓
- [x] 01-02-PLAN.md — Route-based splitting + Lighthouse verification (Wave 2) ✓

**Status:** COMPLETE (2026-02-05) — 8/8 must-haves verified

**Deliverables:**
- Lazy-loaded non-critical widgets
- Skeleton fallback components
- LCP <= 2.5s, TTI <= 3.5s verified

---

## Phase 02: Polish & Completion

**Goal:** Complete iOS polish and E2E test coverage

**Requirements:**
- POLISH-01: iOS viewport-fit meta tag
- POLISH-02: Search filter E2E tests (7 skipped)

**Dependencies:** None (can run parallel with Phase 01)

**Plans:** 2 plans (Wave 1 - parallel)

Plans:
- [ ] 02-01-PLAN.md — iOS viewport-fit=cover meta tag
- [ ] 02-02-PLAN.md — Search filter E2E test completion

**Deliverables:**
- viewport-fit=cover in _app.tsx (per Next.js docs)
- All 47 E2E tests passing (0 skipped)

---

## Phase 03: Backend Folder Nesting

**Goal:** Enable drag-folder-into-folder with backend support

**Requirements:**
- API-01: PATCH /folders/:id { parentId } endpoint

**Dependencies:** None (can run parallel with Phase 01-02)

**Plans:** 1 plan

Plans:
- [ ] 03-01-PLAN.md — Folder nesting endpoint with validation

**Deliverables:**
- PATCH /api/folders/:id endpoint
- Circular reference prevention
- Tenant isolation validation
- Unit tests

---

## Execution Order

```
Phase 01 (Performance) ──────────────────────────────────┐
                                                         │
Phase 02 (Polish) ──────────────────────────────────────>│──> v2.1 Complete
                                                         │
Phase 03 (Backend) ──────────────────────────────────────┘
```

**Notes:**
- All 3 phases can run in parallel (no dependencies)
- Estimate: 3-5 plans total, ~1 day execution
- Small focused milestone for tech debt cleanup

---

## Success Criteria

- [ ] 5/5 requirements satisfied
- [ ] LCP <= 2.5s (currently 4.12s)
- [ ] TTI <= 3.5s (currently 4.13s)
- [ ] 47/47 E2E tests passing (currently 40/47)
- [ ] iOS safe area working on iPhone X+
- [ ] Folder nesting API functional

---
*Roadmap created: 2026-02-04*
