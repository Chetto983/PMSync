# v2.0 Roadmap: Professional Email Client

## Overview

**Version:** v2.0
**Goal:** Build the best professional AI mail client — fast, intelligent, and secure
**Total Phases:** 8
**Total Requirements:** 24

## Phase Summary

| Phase | Name | Requirements | Focus |
|-------|------|--------------|-------|
| 01 | Performance Foundation | PERF-01 to PERF-04, DEBT-01 to DEBT-03 | Backend optimization enabling frontend |
| 02 | Frontend Core Setup | - | shadcn/ui, routing, folder structure |
| 03 | Email List & Thread | FE-01, FE-02, PERF-05, PERF-06 | Core reading experience |
| 04 | Email Composer | FE-03, FE-10 | Core writing experience |
| 05 | Folders & Navigation | FE-04, FE-06, FE-07 | Organization and productivity |
| 06 | Advanced Features | FE-05, FE-08, FE-09 | Kanban, search, dark mode |
| 07 | Security Hardening | SEC-01 to SEC-05 | Production security |
| 08 | Testing & Polish | - | E2E tests, performance audit |

---

## Phase 01: Performance Foundation

**Goal:** Optimize backend before building frontend to ensure smooth experience

**Requirements:**
- PERF-01: pgvector HNSW index
- PERF-02: N+1 query fix for folder counts
- PERF-03: Orphaned embedding cleanup
- PERF-04: Composite indexes
- DEBT-01: ConversationAtomicityService wiring
- DEBT-02: PrismaRetryService integration
- DEBT-03: DEPRECATED marker cleanup

**Why first:** Frontend will hammer these APIs — optimize before load increases.

**Plans:** 3 plans (Wave 1 - all parallel)

Plans:
- [x] 01-01-PLAN.md — HNSW verification/benchmark + composite index migration
- [x] 01-02-PLAN.md — Parallelize folder counts + orphan embedding cleanup job
- [x] 01-03-PLAN.md — Atomicity wiring + PrismaRetry refactor + DEPRECATED annotations

**Status:** COMPLETE (2026-02-02) — 7/7 requirements verified

**Deliverables:**
- Database migrations for indexes
- BullMQ cleanup job
- Service wiring complete
- Benchmark results documented

---

## Phase 02: Frontend Core Setup

**Goal:** Document existing frontend architecture and verify pattern consistency

**Scope (RE-SCOPED):** Research revealed 95% of roadmap items already implemented. Phase 02 focuses on:
- Architecture documentation for onboarding
- Pattern audit (i18n, data fetching consistency)
- Integration verification (dependencies work together)

**Why second:** Foundation documentation before building new features in Phase 03+.

**Approach:** 30-minute verification sprint (Option B from research)

Plans:
- [x] 02-SUMMARY.md — Verification sprint complete

**Status:** COMPLETE (2026-02-02) — Research found 95% already implemented, verification confirmed patterns

**Deliverables:**
- Pattern audit: 0 API violations, 74 translation usages verified
- Integration verification: Type-check passes
- Confidence for Phase 03: HIGH

---

## Phase 03: Email List & Thread Display

**Goal:** Complete query prefetching and verify optimistic updates (90% already implemented)

**Requirements:**
- FE-01: Email list with VList virtualization [ALREADY IMPLEMENTED - @tanstack/react-virtual]
- FE-02: Thread display with animations [ALREADY IMPLEMENTED - MUI Accordion]
- PERF-05: Optimistic updates with toast rollback [COMPLETE]
- PERF-06: Query prefetching (prefetch-on-hover) [COMPLETE]

**Dependencies:** Phase 02 (frontend setup)

**Scope (RE-SCOPED):** Research found 90%+ already implemented. Focus on gaps:
1. Add prefetch-on-hover to ThreadListItem.tsx (PERF-06)
2. Add prefetch-on-hover to FolderSidebar.tsx (PERF-06)
3. Verify toast rollback on optimistic update failure (PERF-05)

**Plans:** 1 plan (Wave 1)

Plans:
- [x] 03-01-PLAN.md — Prefetch-on-hover + optimistic toast verification

**Status:** COMPLETE (2026-02-02) — 4/4 requirements verified

**Deliverables:**
- Prefetch on email hover (300ms debounce)
- Prefetch on folder hover (300ms debounce)
- Toast notification on optimistic update rollback
- i18n support for error messages

---

## Phase 04: Email Composer

**Goal:** Complete 3 gaps in email composer (90% already implemented)

**Requirements:**
- FE-03: Email composer with TipTap [90% IMPLEMENTED]
- FE-10: AI compose [90% IMPLEMENTED]

**Dependencies:** Phase 02 (frontend setup), Phase 03 (for reply context)

**Scope (RE-SCOPED):** Research found 90% already implemented. Focus on 3 gaps:
1. AI keyboard shortcut (Cmd+J / Ctrl+J to trigger AI menu)
2. Mobile responsive toolbar (collapse to 5 buttons + More overflow)
3. Mobile fullscreen compose (fullscreen dialog on < 768px)

**Plans:** 3 plans (Wave 1 - all parallel)

Plans:
- [x] 04-01-PLAN.md — AI keyboard shortcut (Cmd+J / Ctrl+J)
- [x] 04-02-PLAN.md — Mobile responsive toolbar with overflow menu
- [x] 04-03-PLAN.md — Mobile fullscreen compose dialog

**Status:** COMPLETE (2026-02-03) — 2/2 requirements verified (FE-03, FE-10)

**Deliverables:**
- TipTap extension for Cmd+J AI shortcut
- Responsive toolbar (5 buttons + More on mobile)
- Fullscreen compose on mobile with sticky header
- iOS safe area handling

---

## Phase 05: Folders & Navigation

**Goal:** Complete email organization and power user keyboard workflow

**Requirements:**
- FE-04: Folder sidebar with drag-drop [90% - Visual complete, drag-into-folder awaits API]
- FE-06: Keyboard navigation [COMPLETE]
- FE-07: Multi-select with bulk actions [COMPLETE]

**Dependencies:** Phase 03 (email list for context)

**Plans:** 3 plans (Wave 1 - all parallel)

Plans:
- [x] 05-01-PLAN.md — Multi-select store wiring + Shift+click range selection
- [x] 05-02-PLAN.md — Keyboard shortcuts completion + help dialog
- [x] 05-03-PLAN.md — Nested folder support (drag folder into folder)

**Status:** COMPLETE (2026-02-03) — 3/3 requirements verified (FE-04, FE-06, FE-07)

**Deliverables:**
- ThreadList wired to Zustand store for selection
- Shift+click range selection
- Bulk action handlers wired to API
- Extended keyboard shortcuts (e/#/r/a/f// /?)
- KeyboardShortcutsDialog component (140 lines, full i18n)
- Nested folder indentation (16px per level)
- API gap documented: Backend needs `PATCH /folders/:id { parentId }`

---

## Phase 06: Advanced Features

**Goal:** Add differentiating features (dark mode, kanban view, search filters)

**Requirements:**
- FE-05: Kanban toggle view
- FE-08: Search with filters
- FE-09: Dark mode

**Dependencies:** Phase 03-05 (core email features)

**Plans:** 3 plans (Wave 1 - all parallel)

Plans:
- [x] 06-01-PLAN.md — Dark mode toggle with light/dark/system options
- [x] 06-02-PLAN.md — Kanban toggle view with drag-drop columns
- [x] 06-03-PLAN.md — Search with filter parsing (from:, to:, has:attachment)

**Status:** COMPLETE (2026-02-03) — 3/3 requirements verified (FE-05, FE-08, FE-09)

**Deliverables:**
- ThemeToggle component with menu (light/dark/system)
- EmailKanbanBoard with four columns (DndKit drag-drop)
- Enhanced EmailSearchBar with filter chips
- View preference persistence via Zustand

---

## Phase 07: Security Hardening

**Goal:** Production security measures

**Requirements:**
- SEC-01: S3 server-side encryption
- SEC-02: OAuth token revocation
- SEC-03: Log redaction
- SEC-04: CSRF protection
- SEC-05: Rate limiting

**Dependencies:** None (can run parallel with frontend phases)

**Plans:** 5 plans

Plans:
- [x] 07-01-PLAN.md — S3 encryption + log redaction
- [x] 07-02-PLAN.md — Rate limiting configuration
- [x] 07-03-PLAN.md — OAuth token revocation
- [x] 07-04-PLAN.md — CSRF protection backend
- [x] 07-05-PLAN.md — CSRF frontend integration

**Status:** COMPLETE (2026-02-04) — 5/5 requirements verified

**Deliverables:**
- S3 bucket encryption enabled
- OAuth revocation on disconnect
- Log redaction middleware
- CSRF tokens implemented
- Rate limiting configured

---

## Phase 08: Testing & Polish

**Goal:** Ensure production readiness with comprehensive E2E tests, performance auditing, and accessibility compliance

**Dependencies:** All previous phases

**Plans:** 5 plans (Wave 1-3)

Plans:
- [ ] 08-01-PLAN.md — E2E infrastructure (Playwright config, auth setup, packages)
- [ ] 08-02-PLAN.md — E2E core flow tests (auth, compose, search)
- [ ] 08-03-PLAN.md — Accessibility testing (axe-core integration)
- [ ] 08-04-PLAN.md — Performance & bundle analysis (Lighthouse CI)
- [ ] 08-05-PLAN.md — CI workflow & final verification

**Wave Structure:**
- Wave 1: 08-01, 08-02 (parallel - infra and tests)
- Wave 2: 08-03, 08-04 (parallel - a11y and perf, need infra)
- Wave 3: 08-05 (CI workflow, needs all tests)

**Deliverables:**
- E2E test suite for critical flows (auth, compose, search)
- Cross-browser testing (Chromium, Firefox, Safari)
- Mobile device testing (Pixel 7, iPhone 14)
- Accessibility compliance (WCAG 2.1 AA via axe-core)
- Performance baselines (Lighthouse CI)
- GitHub Actions CI workflow

---

## Execution Order

```
Phase 01 ─────────────────────────────────────────────────────┐
          └──> Phase 02 ──> Phase 03 ──> Phase 04             │
                              │                               │
                              v                               │
                         Phase 05 ──> Phase 06 ──> Phase 08 <─┤
                                                   ^          │
Phase 07 (parallel) ───────────────────────────────┘          │
                                                              │
All phases complete ──────────────────────────────────────────┘
```

**Notes:**
- Phase 07 (Security) can run parallel with frontend phases
- Phase 08 (Testing) requires all features complete
- Estimate: ~6-8 phases, similar scope to v1

---

## Success Criteria

- [ ] 24/24 requirements satisfied
- [ ] E2E tests passing for all email flows
- [ ] Performance: <100ms list scroll, <200ms thread load
- [ ] Accessibility: No critical axe-core violations
- [ ] Zero regressions in existing functionality

---
*Roadmap created: 2026-02-02*
*Phase 08 planned: 2026-02-04*
