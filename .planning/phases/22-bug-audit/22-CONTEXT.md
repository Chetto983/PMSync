# Phase 22: Bug Audit - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Comprehensive audit and remediation of all bugs across the entire PMSync codebase (v3.0 + v3.1 features). Covers backend APIs, frontend UI/UX, database, email sync engine, AI chat, GDPR features, security, accessibility, i18n, performance, and dependency health. Two-pass approach: audit/report first, then fix everything found. Also completes unfinished plans from Phase 19 (19-04 WritingStyleSettings) and Phase 21 (21-01 Triage Prompt enrichment).

</domain>

<decisions>
## Implementation Decisions

### Audit Scope
- Full audit of ALL functionality — every v3.0 and v3.1 feature, every endpoint, every UI component
- Both backend (NestJS APIs, email sync, AI services) and frontend (Next.js, email list, chat, dashboard, GDPR panels) — both equally broken
- Full visual audit using Playwright screenshots at all breakpoints: desktop (1440px), tablet (768px), mobile (375px)
- Both static code analysis AND live endpoint testing (static first to find obvious issues, then live testing for runtime bugs)
- Full i18n audit: check for hardcoded strings, missing translations, en/it sync
- WCAG accessibility re-audit on all v3.1 components (focus, aria, contrast, keyboard nav)
- Security scan: OWASP top 10 basics (XSS, CSRF, SQL injection, auth bypass, rate limiting)
- Config/environment audit: verify .env.example matches actual usage, no hardcoded secrets
- Full database audit: Prisma migrations in sync, missing indexes (@@index[tenantId, aiPriority] from STATE.md), schema consistency
- Deep email sync engine audit: IMAP sync, folder operations, multi-tenant race conditions, P2002/P2034 handling
- Performance audit: frontend bundle size, React re-renders, backend query performance, memory leaks
- Full dependency audit: npm audit, outdated packages, unused dependencies, known CVEs
- Verify ALL completed plans (phases 13-21) work end-to-end — not just code review, actual runtime validation
- Complete unfinished plans: 19-04 (WritingStyleSettings panel), 21-01 (Triage Prompt enrichment)
- Clean build target: zero TypeScript errors, zero lint warnings, clean build output

### Bug Prioritization
- Fix EVERYTHING found — zero known bugs when done
- Fix order: backend first, then frontend (frontend fixes depend on working backend)
- Break backward compatibility if needed — frontend will be fixed in the same phase
- Two-pass approach: first pass audits and documents all bugs in BUG-REPORT.md, second pass fixes them. User reviews report between passes.
- Bug report lives in .planning/phases/22-bug-audit/ as markdown
- Every bug fix includes a regression test
- Full impact analysis when fixing shared code — trace all callers, verify nothing breaks
- Fix root causes, not symptoms — even if it means refactoring
- Remove ALL dead code found (unused imports, unreachable functions, commented-out blocks)
- Atomic commits: one commit per bug fix for clean git history and easy revert

### Audit Methodology
- Parallel agents per domain area for the audit pass (backend-api, frontend-ui, sync-engine, ai-chat, gdpr, security, etc.)
- Visual audit compares against Superhuman/shadcn patterns AND fixes broken layouts
- API testing: manual curl exploration first, then automated ts-node scripts to verify fixes
- Leverage ALL available Claude Code skills (skills.sh) — analyzer, reviewer, tester, debugger, code-review-swarm, etc.
- Full before/after verification report with metrics: bug count, test coverage, type errors, lint warnings, screenshots
- Save before/after screenshots to repo in docs/screenshots/
- Commits directly to main (each atomic commit is revertable)

### UX/UI Quality Bar
- Superhuman-level polish: every component looks intentional — consistent spacing, typography, colors, animations
- Unify component patterns: MUI for layout components, Tailwind for ai-elements only, theme colors everywhere (no hardcoded hex)
- Audit both light AND dark themes
- Every component must have: loading skeleton, error fallback, empty state — no blank screens
- Full animation pass: subtle micro-interactions on all interactive elements (0.15s transitions, smooth scrolling, hover feedback, focus rings)

### Testing Strategy
- All three test levels: unit tests, integration tests, AND E2E (Playwright) tests
- 80%+ line coverage target across the codebase
- Fix ALL broken and skipped tests — every test either passes or gets deleted if no longer relevant
- Fix the pre-existing E2E auth mock infrastructure bug (prerequisite for reliable E2E testing)
- Add/fix CI gates: GitHub Actions for type-check, lint, unit tests must pass
- Optimize test speed: target full test suite under 2 minutes (parallelize, mock slow dependencies)

### Rollback Plan
- Commits directly to main — each atomic commit is independently revertable
- Fix forward on regressions (don't revert, fix the new breakage immediately)
- Git tags at key checkpoints: v3.1-pre-audit, v3.1-post-backend-fixes, v3.1-post-frontend-fixes, v3.1-post-audit
- Type-check gate on every commit: tsc --noEmit must pass before each commit

### Claude's Discretion
- Specific order of feature areas within backend/frontend passes
- Which static analysis tools to use per area (beyond tsc + eslint)
- How to structure the BUG-REPORT.md (severity categories, grouping)
- Agent topology for the parallel audit pass
- Which specific skills from skills.sh to deploy for each domain area

</decisions>

<specifics>
## Specific Ideas

- User explicitly stated "now is full of bugs" — treat this as a burn-down-everything phase, not a selective audit
- User wants skills.sh (Claude Code skills ecosystem) used for the audit — leverage analyzer, reviewer, debugger, code-review-swarm, etc.
- Known broken areas called out: AI chat, email sync/list, GDPR features — these should get priority within their stack layer
- Known issues from STATE.md to address:
  - LCP exceeds budget (4.12s vs 2.5s target)
  - TTI exceeds budget (4.13s vs 3.5s target)
  - E2E chip interaction tests (5/7 pass, chip removal needs debugging)
  - E2E auth mock infrastructure bug
  - Pre-existing lint error in LabelTreeDndWrapper.tsx (resetState accessed before declaration)
  - @@index([tenantId, aiPriority]) needs Prisma migration
- Compare UI against: Superhuman (premium email UX), shadcn/ui (clean components), TailAdmin (responsive patterns)
- Email list design follows the Superhuman-inspired pattern from CLAUDE.md: clean 2-line layout, hover checkbox, floating action bar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. All items discussed are remediation of existing features, not new capabilities.

</deferred>

---

*Phase: 22-bug-audit*
*Context gathered: 2026-02-26*
