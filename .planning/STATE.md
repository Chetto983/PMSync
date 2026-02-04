# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The best professional AI mail client — fast, intelligent, and secure
**Current focus:** v2.0 — Frontend Email Client + Performance + Security

## Current Position

Phase: 08 of 8 (Testing & Polish)
Plan: 04 of 05 complete
Status: In progress
Last activity: 2026-02-04 - Completed 08-04-PLAN.md (Performance Monitoring Setup)

Progress: 4/5 Phase 08 plans complete
```
[########################] 80%
```

## Session Continuity

Last session: 2026-02-04
Stopped at: Completed 08-04-PLAN.md (Performance Monitoring Setup)
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
| CSRF token in memory, not localStorage | 07-05 | XSS prevention - token only accessible to same-origin JS |
| clearCsrfToken on 403 | 07-05 | Auto re-fetch on next mutation if token expired/invalid |
| Pixel 7/iPhone 14 device profiles | 08-01 | Current mainstream devices for mobile E2E testing |
| storageState pattern for auth | 08-01 | Reusable auth state across all browser projects |
| Graceful test skip on auth redirect | 08-02 | Allows partial test execution during auth infrastructure fix |
| Test-specific fixtures from fixtures.ts | 08-02 | Consistent mock data, custom auth handling per test file |
| Core Web Vitals 2025 thresholds | 08-04 | LCP <= 2.5s, CLS <= 0.1, TTI <= 3.5s budgets |
| Temporary public storage for Lighthouse | 08-04 | No external service needed for CI uploads |
| Bundle analyzer opt-in via ANALYZE=true | 08-04 | Zero impact on normal builds |

## Blockers & Concerns

| Issue | Severity | Phase | Notes |
|-------|----------|-------|-------|
| viewport-fit=cover missing | Low | 04-03 | Required for iOS safe area env() to work fully |
| Backend API for folder nesting | Medium | 05-03 | Frontend ready, needs PATCH /folders/:id { parentId } |
| Backend API for kanban persistence | Low | 06-02 | Column assignments are localStorage-only; backend API needed for cross-device sync |
| E2E auth infrastructure mismatch | High | 08-02 | auth.setup.ts uses 'auth-token' but app uses 'auth-storage' zustand persist key |
| LCP exceeds budget (4.12s vs 2.5s) | Medium | 08-04 | Tech debt - optimize root page load time |
| TTI exceeds budget (4.13s vs 3.5s) | Medium | 08-04 | Tech debt - related to LCP, needs code splitting |

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

1. **Phase 08 IN PROGRESS** — Performance Monitoring Setup complete (08-04)
2. **BLOCKER:** Fix E2E auth infrastructure (auth.setup.ts uses wrong localStorage key)
3. **TECH DEBT:** LCP/TTI optimization needed (baseline 4.12s/4.13s vs budgets 2.5s/3.5s)
4. Next: Plan 05 (CI Integration) - final phase 08 plan

---
*State updated: 2026-02-04 — Completed 08-04-PLAN.md (Performance Monitoring Setup)*
