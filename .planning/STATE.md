# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v2.0 — Frontend Email Client + Performance + Security

## Current Position

Phase: 07 of 8 (Security Hardening)
Plan: 04 of 05 complete (07-01 + 07-02 + 07-03 + 07-04 finished)
Status: Phase 07 IN PROGRESS - Only 07-05 (Frontend CSRF) remaining
Last activity: 2026-02-04 - Completed 07-04-PLAN.md (CSRF Protection Backend)

Progress: 24/24 requirements SATISFIED
\`\`\`
[########################] 100%
\`\`\`

## Session Continuity

Last session: 2026-02-04
Stopped at: Completed 07-04-PLAN.md
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
| Mobile header with Send, no Schedule | 04-03 | Simplify mobile UX; schedule send available on desktop |
| 5 primary actions on mobile toolbar | 04-02 | AI, Bold, Italic, Link, Attach - most used, fits thumb zone |
| Popover for overflow menu | 04-02 | Avoids z-index issues with TipTap editor |
| 44px touch targets | 04-02 | Apple HIG compliance for thumb accessibility |
| Mod-j shortcut for AI | 04-01 | TipTap handles Mac/Windows automatically |
| Ref-based Popover anchor | 04-01 | Keyboard trigger has no MouseEvent for anchor |
| 16px indentation per nesting level | 05-03 | Clean visual hierarchy with MUI spacing |
| API gap for folder nesting | 05-03 | Backend needs PATCH /folders/:id { parentId } |
| Zustand store for selection state | 05-01 | Persists across re-renders, shared with bulk actions |
| MouseEvent modifier key detection | 05-01 | Native browser event has shiftKey/ctrlKey/metaKey |
| Chip components for keyboard keys | 05-02 | Consistent MUI visual style in help dialog |
| Shortcuts grouped by category | 05-02 | Navigation, Actions, Other for scanability |
| Reuse existing theme translations | 06-01 | settings.generalPanel.themeOptions already has light/dark/system |
| Regex tokenization for search filters | 06-03 | Handles quoted strings and space-separated tokens |
| useMemo for parsedFilters | 06-03 | Avoids reparsing on every render |
| Immediate chip removal (no debounce) | 06-03 | Instant UX feedback when removing filter chips |
| Kanban columns LOCAL ONLY | 06-02 | Backend API out of scope; localStorage via Zustand persist |
| Separate DndContext for Kanban | 06-02 | Avoid conflicts with existing folder drag-drop system |
| remove: false for log redaction | 07-01 | Keep keys visible for debugging while censoring values |
| AES256 (SSE-S3) over SSE-KMS | 07-01 | Simpler, cheaper, sufficient for attachments |
| Best-effort OAuth revocation | 07-03 | Never block provider deletion; log warnings on failure |
| Google: revoke refresh token | 07-03 | Automatically invalidates all associated access tokens |
| Microsoft: session revocation | 07-03 | Uses Graph API; access tokens remain valid up to 1 hour |
| csrf-csrf package | 07-04 | Maintained SPA-focused package, replaces deprecated csurf |
| Session ID: userId fallback to IP | 07-04 | Authenticated use userId, anonymous/pre-auth use IP |
| __Host-csrf cookie in production | 07-04 | Additional security prefix for CSRF cookie |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| viewport-fit=cover missing | Low | 04-03 | Required for iOS safe area env() to work fully |
| Backend API for folder nesting | Medium | 05-03 | Frontend ready, needs PATCH /folders/:id { parentId } |
| Backend API for kanban persistence | Low | 06-02 | Column assignments are localStorage-only; backend API needed for cross-device sync |

## Milestones

See: .planning/MILESTONES.md

**v1 Stability & Code Quality Refactor** — SHIPPED 2026-02-02
- 8 phases, 40 plans, ~5h 30min total
- 26/26 requirements satisfied
- 77% reduction in large service files

**v2.0 Professional Email Client** — IN PROGRESS
- Frontend: Email views with VList, TipTap, shadcn/ui
- Performance: pgvector HNSW, query optimization
- Security: S3 encryption, OAuth revocation, log redaction, CSRF protection

## v2.0 Scope

**Frontend Email Client (10 requirements):**
- FE-01: Email list with VList virtualization
- FE-02: Thread display with animations
- FE-03: Email composer with TipTap [DONE - 04]
- FE-04: Folder sidebar with drag-drop [DONE - 05-03]
- FE-05: Kanban toggle view [DONE - 06-02]
- FE-06: Keyboard navigation [DONE - 05-02]
- FE-07: Multi-select with bulk actions [DONE - 05-01]
- FE-08: Search with filters [DONE - 06-03]
- FE-09: Dark mode [DONE - 06-01]
- FE-10: AI compose [DONE - 04]

**Performance (6 requirements):**
- PERF-01: pgvector HNSW index [DONE - 01-01]
- PERF-02: N+1 query fix for folder counts [DONE - 01-02]
- PERF-03: Orphaned embedding cleanup [DONE - 01-02]
- PERF-04: Composite indexes [DONE - 01-01]
- PERF-05: Optimistic updates [DONE - 03-01]
- PERF-06: Query prefetching [DONE - 03-01]

**Security (5 requirements):**
- SEC-01: S3 encryption [DONE - 07-01]
- SEC-02: OAuth revocation [DONE - 07-03]
- SEC-03: Log redaction [DONE - 07-01]
- SEC-04: CSRF protection [DONE - 07-04]
- SEC-05: Rate limiting [DONE - 07-02]

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

1. **Plan 07-04 COMPLETE** — SEC-04 (CSRF Protection Backend)
2. Continue with 07-05: Frontend CSRF Integration
3. Phase 07 almost complete - only frontend CSRF remaining

---
*State updated: 2026-02-04 — Completed 07-04-PLAN.md (CSRF Protection Backend)*
