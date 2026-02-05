# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v2.1 — Performance Optimization & Polish

## Current Position

Phase: 01 of 3 (Performance Code Splitting)
Plan: 01 of 02 (complete)
Status: In progress
Last activity: 2026-02-05 - Completed 01-01-PLAN.md (code splitting)

Progress: 1/5 v2.1 requirements complete
```
[######                        ] 20%
```

## Session Continuity

Last session: 2026-02-05
Stopped at: Completed 01-01-PLAN.md
Resume file: None

## Accumulated Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Standalone Prisma in benchmarks | v2.0-01-01 | CI/CD portability without NestJS startup |
| Partial indexes for filtered queries | v2.0-01-01 | 80% index size reduction for common patterns |
| CONCURRENTLY index creation | v2.0-01-01 | Avoid table locks in production |
| Promise.all for folder counts | v2.0-01-02 | Each provider independent, no cross-provider state |
| Weekly orphan cleanup at 2 AM Sunday | v2.0-01-02 | Avoid peak usage, batch processing with limits |
| 300ms debounce for prefetch | v2.0-03-01 | Prevents API flood on fast mouse movements |
| Mobile header with Send, no Schedule | v2.0-04-03 | Simplify mobile UX; schedule send available on desktop |
| 5 primary actions on mobile toolbar | v2.0-04-02 | AI, Bold, Italic, Link, Attach - most used |
| 16px indentation per nesting level | v2.0-05-03 | Clean visual hierarchy with MUI spacing |
| Regex tokenization for search filters | v2.0-06-03 | Handles quoted strings and space-separated tokens |
| Kanban columns LOCAL ONLY | v2.0-06-02 | Backend API out of scope v2.0; localStorage via Zustand |
| AES256 (SSE-S3) over SSE-KMS | v2.0-07-01 | Simpler, cheaper, sufficient for attachments |
| csrf-csrf package | v2.0-07-04 | Maintained SPA-focused package, replaces deprecated csurf |
| Pixel 7/iPhone 14 device profiles | v2.0-08-01 | Current mainstream devices for mobile E2E testing |
| fail-fast: false in CI matrix | v2.0-08-05 | Complete browser coverage even if one fails |
| ssr: false for TipTap dynamic import | v2.1-01-01 | TipTap uses browser APIs (window, document) |
| ssr: false for @dnd-kit dynamic import | v2.1-01-01 | @dnd-kit uses browser APIs (window, document) |
| Reuse KanbanSkeleton for lazy load | v2.1-01-01 | Already exists with configurable columns/cards |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| LCP exceeds budget (4.12s vs 2.5s) | High | v2.1-01 | Primary v2.1 target |
| TTI exceeds budget (4.13s vs 3.5s) | High | v2.1-01 | Primary v2.1 target |
| 7 search filter tests skipped | Medium | v2.1-02 | POLISH-02 target |
| viewport-fit=cover missing | Low | v2.1-02 | POLISH-01 target |
| Backend API for folder nesting | Low | v2.1-03 | API-01 target |

## Milestones

See: .planning/MILESTONES.md

**v2.0 Professional Email Client** — SHIPPED 2026-02-04 🎉
- 8 phases, 21 plans
- 24/24 requirements satisfied
- 200 E2E tests across 5 browsers

**v1 Stability & Code Quality Refactor** — SHIPPED 2026-02-02
- 8 phases, 40 plans
- 77% reduction in large service files

**v2.1 Optimization & Polish** — IN PROGRESS
- 3 phases, 5 plans
- 5 requirements (OPT-01/02, POLISH-01/02, API-01)

## v2.1 Scope

**Performance (2 requirements):**
- OPT-01: Code splitting for LCP [target]
- OPT-02: Code splitting for TTI [target]

**Polish (2 requirements):**
- POLISH-01: iOS viewport-fit meta tag [target]
- POLISH-02: Search filter E2E tests [target]

**Backend API (1 requirement):**
- API-01: Folder nesting endpoint [target]

## Next Steps

1. **EXECUTE:** 01-02-PLAN.md — Additional performance optimizations
2. **PARALLEL:** Phases 02 and 03 can run concurrently
3. **VERIFY:** Run Lighthouse after code splitting to measure LCP/TTI improvement

---
*State updated: 2026-02-05 — Completed 01-01-PLAN.md (code splitting)*
