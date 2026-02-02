# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v2.0 — Frontend Email Client + Performance + Security

## Current Position

Phase: 03 of 8 (Email List & Thread Display)
Plan: 01 of 1 - COMPLETE
Status: Plan 03-01 complete
Last activity: 2026-02-02 — Completed 03-01-PLAN.md (Prefetch + Toast)

Progress: 9/24 requirements (PERF-01 through PERF-06, DEBT-01 through DEBT-03 satisfied)
```
[#########...............] 38%
```

## Session Continuity

Last session: 2026-02-02T21:04:45Z
Stopped at: Completed 03-01-PLAN.md
Resume file: None

## Accumulated Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Standalone Prisma in benchmarks | 01-01 | CI/CD portability without NestJS startup |
| Partial indexes for filtered queries | 01-01 | 80% index size reduction for common patterns |
| CONCURRENTLY index creation | 01-01 | Avoid table locks in production |
| Promise.all for folder counts | 01-02 | Each provider independent, no cross-provider state |
| Weekly orphan cleanup at 2 AM Sunday | 01-02 | Avoid peak usage, batch processing with limits |
| Use indexed fields for embedding queries | 01-02 | O(log n) vs O(n) JSONB scans |
| ConversationAtomicityService NOT wired | 01-03 | Services don't mix Prisma + VoltAgent Memory API |
| PrismaRetryService for P2002/P2034 | 01-03 | Centralized retry logic, consistent backoff |
| Deprecation removal date 2026-06-30 | 01-03 | Clear Q2 2026 timeline, satisfies pre-commit hook |
| 300ms debounce for prefetch | 03-01 | Prevents API flood on fast mouse movements |
| staleTime 30s for prefetch guard | 03-01 | Prevents redundant prefetch of recent data |
| Global toast via useEffect | 03-01 | Satisfies React hooks lint rules for singleton |
| Map JUNK to SPAM for API | 03-01 | API specialUse only accepts specific values |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| (none) | - | - | All pre-existing issues resolved |

## Milestones

See: .planning/MILESTONES.md

**v1 Stability & Code Quality Refactor** — SHIPPED 2026-02-02
- 8 phases, 40 plans, ~5h 30min total
- 26/26 requirements satisfied
- 77% reduction in large service files

**v2.0 Professional Email Client** — IN PROGRESS
- Frontend: Email views with VList, TipTap, shadcn/ui
- Performance: pgvector HNSW, query optimization
- Security: S3 encryption, OAuth revocation, log redaction

## v2.0 Scope

**Frontend Email Client (10 requirements):**
- FE-01: Email list with VList virtualization
- FE-02: Thread display with animations
- FE-03: Email composer with TipTap
- FE-04: Folder sidebar with drag-drop
- FE-05: Kanban toggle view
- FE-06: Keyboard navigation
- FE-07: Multi-select with bulk actions
- FE-08: Search with filters
- FE-09: Dark mode
- FE-10: AI compose

**Performance (6 requirements):**
- PERF-01: pgvector HNSW index [DONE - 01-01]
- PERF-02: N+1 query fix for folder counts [DONE - 01-02]
- PERF-03: Orphaned embedding cleanup [DONE - 01-02]
- PERF-04: Composite indexes [DONE - 01-01]
- PERF-05: Optimistic updates [DONE - 03-01]
- PERF-06: Query prefetching [DONE - 03-01]

**Security (5 requirements):**
- SEC-01: S3 encryption
- SEC-02: OAuth revocation
- SEC-03: Log redaction
- SEC-04: CSRF protection
- SEC-05: Rate limiting

**Tech Debt (3 requirements):**
- DEBT-01: ConversationAtomicityService wiring [DONE - 01-03]
- DEBT-02: PrismaRetryService integration [DONE - 01-03]
- DEBT-03: DEPRECATED marker cleanup [DONE - 01-03]

## UI Vision

**Hybrid list/kanban** — Default list view with kanban toggle

**Inspirations:** Outlook (enterprise), Kanmail (kanban), Apple Mail (clean), Superhuman (speed)

**Key patterns:**
- VList virtualization (1000+ emails smooth)
- Optimistic updates (instant feedback)
- Motion animations
- Command palette
- Three-panel resizable layout

## Next Steps

1. Phase 03 Plan 01 COMPLETE - Prefetch and toast implemented
2. PERF-05 and PERF-06 now satisfied
3. Ready for Phase 04 (Email Composer) or continue Phase 03 if more plans needed

---
*State updated: 2026-02-02 — Completed 03-01-PLAN.md*
