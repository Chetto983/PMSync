# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v2.1 — Performance Optimization & Polish

## Current Position

Phase: 02 of 3 (Polish & Completion)
Plan: 02 of 02 (complete - with blocker)
Status: Phase complete with infrastructure blocker
Last activity: 2026-02-05 - Completed 02-02-PLAN.md (Search Filter E2E Tests)

Progress: 4/5 v2.1 plans complete
```
[########################      ] 80%
```

## Session Continuity

Last session: 2026-02-05
Stopped at: Completed 02-02-PLAN.md
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
| continue-on-error: true for Lighthouse CI | v2.1-01-02 | Don't block PRs until budgets verified achievable |
| Separate lighthouse job in CI | v2.1-01-02 | Clearer separation, parallel execution, easy toggle |
| 3 URLs tested by Lighthouse | v2.1-01-02 | Email, compose, follow-ups - key performance pages |
| 0px fallback for safe area insets | v2.1-02-01 | Non-iOS devices automatically get 0px |
| Landscape safe area (left/right) | v2.1-02-01 | Support iPhone landscape mode on all mobile components |
| calc() for Desktop FAB safe area | v2.1-02-01 | Preserve 24px base spacing while adding safe area |
| Serial execution for search E2E | v2.1-02-02 | Prevents tenant data race conditions |
| test.beforeEach for E2E mock setup | v2.1-02-02 | Ensures mocks set before each test |
| URL navigation for filter tests | v2.1-02-02 | /dashboard/email?search=filter:value pattern |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| LCP exceeds budget (4.12s vs 2.5s) | High | v2.1-01 | Primary v2.1 target |
| TTI exceeds budget (4.13s vs 3.5s) | High | v2.1-01 | Primary v2.1 target |
| E2E infrastructure bug | High | v2.1-02 | Route mocks not intercepting auth API - affects ALL E2E tests |
| Backend API for folder nesting | Low | v2.1-03 | API-01 target |

## Milestones

See: .planning/MILESTONES.md

**v2.0 Professional Email Client** — SHIPPED 2026-02-04
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
- POLISH-01: iOS viewport-fit meta tag [COMPLETE]
- POLISH-02: Search filter E2E tests [BLOCKED - infrastructure issue]

**Backend API (1 requirement):**
- API-01: Folder nesting endpoint [target]

## Next Steps

1. **COMPLETE:** Phase 01 done (code splitting + Lighthouse CI)
2. **COMPLETE:** Phase 02 done (iOS safe area + Search E2E structure)
3. **BLOCKER:** E2E infrastructure bug needs investigation before search tests can pass
4. **NEXT:** Phase 03 (Folder Nesting API)

---
*State updated: 2026-02-05 — Completed 02-02-PLAN.md (Search Filter E2E Tests)*
