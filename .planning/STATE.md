# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v3.0 AI Intelligence & Scalability

## Current Position

Phase: 1 of 5 — AI Infrastructure Cleanup
Plan: 3 of 3 in phase (01-03-PLAN.md complete)
Status: Phase 01 complete
Last activity: 2026-02-06 — Completed 01-03-PLAN.md (Prometheus metrics)

Progress: v3.0 Phase 01
```
[███████░░░░░░░░░░░░░░░░░░░░░░░] 23% (3/13 plans)
```

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 01-03-PLAN.md (Prometheus metrics infrastructure)
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
| Bidirectional URL-store sync | v2.1-02-02 | email.tsx syncs URL ?search= to Zustand store and vice versa |
| aria-label chip selectors | v2.1-02-02 | Use /Remove filter:.*/ pattern to avoid matching email list items |
| Prioritize Redis locks and retry first | v3.0-01-01 | Small effort, high impact on reliability (VOLT-02, VOLT-03) |
| No tool consolidation needed | v3.0-01-01 | Tools already well-consolidated, no duplicates found |
| @willsoto/nestjs-prometheus for metrics | v3.0-01-03 | NestJS-native integration with makeHistogramProvider helpers |
| Optional @InjectMetric for graceful degradation | v3.0-01-03 | Services work without PrometheusModule loaded |
| onToolMetrics callback for hooks | v3.0-01-03 | Avoids injecting services into pure function factory |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| LCP exceeds budget (4.12s vs 2.5s) | High | v2.1-01 | Primary v2.1 target |
| TTI exceeds budget (4.13s vs 3.5s) | High | v2.1-01 | Primary v2.1 target |
| E2E chip interaction tests | Medium | v2.1-02 | 5/7 search tests pass; chip removal click needs debugging |
| VOLT-01: No circuit breaker for LLM | High | v3.0-01 | Risk of cascade failures during API outages |

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

## v3.0 Roadmap — 5 Phases, 13 Plans

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 01 | AI Infrastructure Cleanup | INFRA-01/02/03 | COMPLETE (3/3 plans) |
| 02 | AI Chat Overhaul | CHAT-01/02/03 | Ready to plan |
| 03 | Auto-Triage Core | TRIAGE-01/02/03 | Ready to plan |
| 04 | Follow-Ups Refactor | FOLLOW-01/02 | Ready to plan |
| 05 | Nested Labels Frontend | LABELS-01 | Ready to plan |

**Deferred to v3.1:** Category assignment, predicted responses, bulk triage, rich chat responses

## Next Steps

**Currently:** Phase 01 complete. Ready for Phase 02 (AI Chat Overhaul).

**Phase 01 accomplishments:**
- 01-01: VoltAgent audit completed, identified VOLT-01 through VOLT-07 issues
- 01-02: Redis locks and retry logic added (VOLT-02/03)
- 01-03: Prometheus metrics infrastructure (VOLT-04)

**Known issues carried forward:**
- LCP/TTI targets monitored but not yet met (continue-on-error in CI)
- E2E auth mock infrastructure bug (pre-existing, affects all E2E tests)
- VOLT-01 (circuit breaker) deferred to Phase 02

---
*State updated: 2026-02-06 — Completed 01-03-PLAN.md (Prometheus metrics)*
