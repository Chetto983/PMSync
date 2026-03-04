# Phase 22: Bug Audit - Research

**Researched:** 2026-02-26
**Domain:** Full-stack audit and remediation (NestJS + Next.js + Prisma + Playwright)
**Confidence:** HIGH

## Summary

Phase 22 is a comprehensive burn-down audit of the entire PMSync codebase. The application has accumulated technical debt and bugs across 21 prior phases spanning v2.0 through v3.1. The user explicitly stated the app is "full of bugs" and wants every single one found and fixed -- zero known bugs when done. This is not a selective audit; it is a scorched-earth remediation phase.

The codebase currently has: 518 backend TypeScript files, ~70 frontend source files plus ~550 frontend component/page/hook files. Backend TypeScript compiles clean (0 errors). Frontend TypeScript compiles clean (0 errors). However, frontend ESLint is **completely broken** (ESLint 10 + incompatible eslint-plugin-react 7.37.5 throws runtime errors), backend ESLint has a flat config issue, frontend Jest has 3 failing tests across 2 suites, and there are significant file-size violations (>500 lines per CLAUDE.md rules). There are 24 npm audit vulnerabilities in the backend, 16 in the frontend, and 5 in the root.

The phase also absorbs two unfinished plans: 19-04 (WritingStyleSettings frontend panel, fully planned but unexecuted) and 21-01 (Triage Prompt enrichment, completely unplanned with an empty phase directory).

**Primary recommendation:** Structure the audit as two major passes -- (1) audit-and-document pass producing BUG-REPORT.md, (2) fix pass working backend-first then frontend -- with explicit user review gate between the two passes.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Full audit of ALL functionality -- every feature, every endpoint, every UI component
- Both backend (NestJS APIs, email sync, AI services) and frontend (Next.js, email list, chat, dashboard, GDPR panels) -- both equally broken
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
- Verify ALL completed plans (phases 13-21) work end-to-end -- not just code review, actual runtime validation
- Complete unfinished plans: 19-04 (WritingStyleSettings panel), 21-01 (Triage Prompt enrichment)
- Clean build target: zero TypeScript errors, zero lint warnings, clean build output
- Fix EVERYTHING found -- zero known bugs when done
- Fix order: backend first, then frontend (frontend fixes depend on working backend)
- Break backward compatibility if needed -- frontend will be fixed in the same phase
- Two-pass approach: first pass audits and documents all bugs in BUG-REPORT.md, second pass fixes them. User reviews report between passes
- Bug report lives in .planning/phases/22-bug-audit/ as markdown
- Every bug fix includes a regression test
- Full impact analysis when fixing shared code -- trace all callers, verify nothing breaks
- Fix root causes, not symptoms -- even if it means refactoring
- Remove ALL dead code found (unused imports, unreachable functions, commented-out blocks)
- Atomic commits: one commit per bug fix for clean git history and easy revert
- Parallel agents per domain area for the audit pass (backend-api, frontend-ui, sync-engine, ai-chat, gdpr, security, etc.)
- Visual audit compares against Superhuman/shadcn patterns AND fixes broken layouts
- API testing: manual curl exploration first, then automated ts-node scripts to verify fixes
- Leverage ALL available Claude Code skills (skills.sh) -- analyzer, reviewer, tester, debugger, code-review-swarm, etc.
- Full before/after verification report with metrics: bug count, test coverage, type errors, lint warnings, screenshots
- Save before/after screenshots to repo in docs/screenshots/
- Commits directly to main (each atomic commit is revertable)
- Superhuman-level polish: every component looks intentional -- consistent spacing, typography, colors, animations
- Unify component patterns: MUI for layout components, Tailwind for ai-elements only, theme colors everywhere (no hardcoded hex)
- Audit both light AND dark themes
- Every component must have: loading skeleton, error fallback, empty state -- no blank screens
- Full animation pass: subtle micro-interactions on all interactive elements (0.15s transitions, smooth scrolling, hover feedback, focus rings)
- All three test levels: unit tests, integration tests, AND E2E (Playwright) tests
- 80%+ line coverage target across the codebase
- Fix ALL broken and skipped tests -- every test either passes or gets deleted if no longer relevant
- Fix the pre-existing E2E auth mock infrastructure bug (prerequisite for reliable E2E testing)
- Add/fix CI gates: GitHub Actions for type-check, lint, unit tests must pass
- Optimize test speed: target full test suite under 2 minutes (parallelize, mock slow dependencies)
- Commits directly to main -- each atomic commit is independently revertable
- Fix forward on regressions (don't revert, fix the new breakage immediately)
- Git tags at key checkpoints: v3.1-pre-audit, v3.1-post-backend-fixes, v3.1-post-frontend-fixes, v3.1-post-audit
- Type-check gate on every commit: tsc --noEmit must pass before each commit

### Claude's Discretion

- Specific order of feature areas within backend/frontend passes
- Which static analysis tools to use per area (beyond tsc + eslint)
- How to structure the BUG-REPORT.md (severity categories, grouping)
- Agent topology for the parallel audit pass
- Which specific skills from skills.sh to deploy for each domain area

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope. All items discussed are remediation of existing features, not new capabilities.
</user_constraints>

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|

| NestJS | 11.1.13 | Backend framework | Installed |
| Next.js | 16.1.6 | Frontend framework | Installed |
| Prisma | 7.3.0 | ORM + migrations | Installed |
| TypeScript | 5.9.3 | Type checking (both) | Installed |
| Jest | (bundled) | Unit testing (both) | Installed |
| Playwright | 1.57.0 | E2E testing | Installed |
| ESLint | 10.0.0 | Linting (both) | BROKEN (see pitfalls) |
| TanStack Query | (installed) | Frontend data fetching | Installed |
| MUI | (installed) | Frontend UI components | Installed |

### Audit-Specific Tools (No Install Needed)

| Tool | Purpose | How to Use |
|------|---------|------------|

| `npx tsc --noEmit` | Type checking | Both backend and frontend directories |
| `npx jest` | Unit tests | Both directories |
| `npx playwright test` | E2E tests | Frontend directory |
| `npm audit` | Dependency vulnerabilities | All 3 package.json locations |
| `wc -l` + `find` | File size audit | Find >500 line files |
| Playwright MCP screenshots | Visual audit | All breakpoints |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|

| Manual code review | SonarQube/CodeClimate | Overkill for one-time audit; manual review catches context-specific bugs better |
| Custom grep scripts | depcheck (unused deps) | `npx depcheck` can identify unused dependencies automatically |
| Manual security scan | npm audit + OWASP ZAP | npm audit covers dependency CVEs; OWASP ZAP is overkill for this scope |

## Architecture Patterns

### Recommended Audit Structure

.planning/phases/22-bug-audit/
  22-CONTEXT.md          # User decisions (exists)
  22-RESEARCH.md         # This file
  22-BUG-REPORT.md       # Pass 1 output: all bugs found
  22-01-PLAN.md          # Pass 1: Audit (parallel domain agents)
  22-02-PLAN.md          # Pass 2: Backend fixes
  22-03-PLAN.md          # Pass 2: Frontend fixes
  22-04-PLAN.md          # Pass 2: Tests + CI + coverage
  22-05-PLAN.md          # Pass 2: Unfinished plans (19-04, 21-01)
  22-06-PLAN.md          # Pass 2: Final verification + metrics report
docs/screenshots/
  before/                # Pre-audit screenshots
  after/                 # Post-fix screenshots

### Pattern 1: Domain-Parallel Audit

**What:** Split audit into independent domain areas that can be investigated in parallel
**When to use:** Pass 1 (audit discovery)
**Domains:**

1. **backend-api** -- All NestJS controllers, services, guards, interceptors
2. **backend-sync** -- Email sync engine, IMAP, folder ops, race conditions
3. **backend-ai** -- VoltAgent, tools, embeddings, triage, drafts
4. **backend-gdpr** -- Consent, audit logging, data rights, legal guards
5. **frontend-ui** -- All React components, pages, layouts, responsive design
6. **frontend-data** -- TanStack Query hooks, API modules, stores, websocket
7. **frontend-i18n** -- Translations (en/it sync, hardcoded strings, missing keys)
8. **security** -- Auth flows, CSRF, XSS, rate limiting, secrets
9. **database** -- Schema, migrations, indexes, query performance
10. **deps** -- npm audit, outdated packages, unused dependencies
11. **ci-tests** -- Broken tests, CI config, coverage gaps

### Pattern 2: Severity-Categorized Bug Report

**What:** Every bug gets a severity, category, and location
**Structure for BUG-REPORT.md:**

```markdown
## Bug Report

### Summary
| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH     | N |
| MEDIUM   | N |
| LOW      | N |

### CRITICAL (blocks core functionality)
#### BUG-001: [Title]
- **Location:** [file:line]
- **Category:** [api|ui|sync|ai|gdpr|security|perf|test|config]
- **Impact:** [what breaks]
- **Root Cause:** [why]
- **Fix:** [proposed fix]
- **Regression Test:** [what test to add]

### HIGH (significant functionality broken)
...

### MEDIUM (incorrect behavior, workaround exists)
...

### LOW (cosmetic, code quality, tech debt)
...
```

### Pattern 3: Atomic Fix Commits

**What:** One commit per bug fix with descriptive message and regression test
**Format:**

fix(category): BUG-NNN short description

- Root cause: [explanation]
- Fix: [what was changed]
- Test: [what regression test was added]

### Anti-Patterns to Avoid

- **Batch fixing without testing:** Fix one bug, run type-check + tests, commit. Never batch multiple fixes without verification.
- **Fixing symptoms not causes:** If a component crashes, don't just add a null check -- find why the data is null.
- **Fixing tests to match bugs:** If a test fails because the code is wrong, fix the code. Never adjust test expectations to match buggy behavior.
- **Ignoring callers:** When fixing shared code (services, utils, hooks), trace ALL callers first. A "fix" that breaks 5 other places is not a fix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|

| Unused dependency detection | Manual grep for imports | `npx depcheck` | Handles re-exports, dynamic imports, config files |
| Visual regression testing | Manual screenshot comparison | Playwright screenshot assertions | Deterministic, automatable, CI-compatible |
| Security vulnerability scan | Manual CVE lookup | `npm audit` | Comprehensive, transitive dependency coverage |
| Code coverage measurement | Manual test mapping | `jest --coverage` | Accurate line/branch/function coverage |
| Dead code detection | Manual grep | TypeScript compiler unused exports + IDE | Catches unreachable code paths |

**Key insight:** For a one-time audit, existing tooling (tsc, jest, npm audit, playwright, depcheck) covers 90% of automated detection. The real value is in manual expert review of patterns, business logic, and architectural issues.

## Common Pitfalls

### Pitfall 1: ESLint Incompatibility (CONFIRMED BUG)

**What goes wrong:** Frontend ESLint is completely non-functional. ESLint 10.0.0 + eslint-plugin-react 7.37.5 throws `contextOrFilename.getFilename is not a function`.
**Why it happens:** eslint-plugin-react 7.x is not compatible with ESLint 10 flat config API changes.
**How to avoid:** Either downgrade ESLint to 9.x or upgrade eslint-plugin-react to a version compatible with ESLint 10. The eslint-config-next 16.1.6 likely needs alignment too.
**Warning signs:** `npm run lint` in frontend crashes instead of reporting warnings.

### Pitfall 2: Backend ESLint Flat Config Self-Linting

**What goes wrong:** Backend ESLint tries to lint `eslint.config.js` itself with type-checked rules that require tsconfig, which doesn't include the config file.
**Why it happens:** The `eslint.config.js` file matches `**/*.ts` glob (actually it's a .js file but still gets processed) and the `recommendedTypeChecked` config requires parserOptions.project.
**How to avoid:** Add `eslint.config.js` to the ignores array.

### Pitfall 3: Frontend Test Drift

**What goes wrong:** 3 tests fail in 2 suites (`use-ai-compose.test.tsx`, `use-ai-actions.test.tsx`). Tests expect properties (`variantUsed`, `variant`) that were removed from the implementation, and `approveAction` signature changed (now takes 2 args, test expects 1).
**Why it happens:** Implementation changed in later phases without updating tests.
**How to avoid:** Fix tests to match current implementation. Add CI gates that fail on test failures.

### Pitfall 4: File Size Violations

**What goes wrong:** CLAUDE.md mandates max 500 lines per file. Currently 15+ backend files and 10+ frontend files exceed this limit, with the worst offenders at 1,429 lines (email-sync-back.service.ts) and 1,263 lines (prompt-input.tsx).
**Why it happens:** Incremental feature additions without refactoring.
**How to avoid:** This is a code quality issue for the audit to flag but NOT necessarily fix in this phase unless the refactoring is safe and contained. Splitting large files risks introducing regressions.

### Pitfall 5: Missing Database Migration

**What goes wrong:** `@@index([tenantId, aiPriority])` is defined in schema.prisma but was never migrated to the database. The Prisma migrate status says "up to date" because it tracks migration files, not schema diff.
**Why it happens:** The index was added to the schema file but `prisma migrate dev` was never run to generate the migration SQL.
**How to avoid:** Run `npx prisma migrate dev --name add_missing_indexes` to generate and apply the migration.

### Pitfall 6: Audit Scope Creep

**What goes wrong:** A "fix everything" mandate can lead to refactoring perfectly working code, introducing new bugs.
**Why it happens:** Overzealous cleanup without clear bug criteria.
**How to avoid:** The BUG-REPORT.md must distinguish between "broken behavior" (fix) and "suboptimal code" (document but don't fix unless safe). Only fix things that are actually broken or violate explicit rules (like file size limits).

### Pitfall 7: E2E Auth Mock Fragility

**What goes wrong:** The auth.setup.ts mocks localStorage + API routes but doesn't mock ALL endpoints the app calls on load. If the app adds new initial API calls, E2E tests break.
**Why it happens:** Mock coverage doesn't keep pace with app changes.
**How to avoid:** The E2E auth mock needs to be comprehensive -- mock all endpoints called during initial page load, or use a more robust auth simulation.

### Pitfall 8: npm Audit False Positives

**What goes wrong:** Many npm audit warnings are in dev dependencies (e.g., @lhci/cli, fasttext) that don't affect production.
**Why it happens:** npm audit doesn't distinguish dev vs production impact.
**How to avoid:** Use `npm audit --production` for accurate production vulnerability count. Document dev-only vulnerabilities separately.

## Code Examples

### Running the Audit Commands (verified from codebase)

```bash
# Backend type-check (currently passes)
cd backend && npx tsc --noEmit

# Frontend type-check (currently passes)
cd frontend && npx tsc --noEmit

# Backend tests (currently 672/672 pass)
cd backend && npx jest

# Frontend tests (currently 206/209 pass, 3 failures)
cd frontend && npx jest

# npm audit (all 3 locations)
npm audit                    # root: 5 high
cd backend && npm audit      # 24 vulns (2 low, 14 moderate, 7 high, 1 critical)
cd frontend && npm audit     # 16 vulns (5 low, 9 moderate, 1 high, 1 critical)

# Prisma migration status
cd backend && npx prisma migrate status

# Find files exceeding 500 lines
find backend/src -name "*.ts" ! -name "*.spec.ts" -exec wc -l {} + | sort -rn | head -20
find frontend -name "*.tsx" -o -name "*.ts" | grep -v node_modules | grep -v ".next" | xargs wc -l | sort -rn | head -20
```

### Known Failing Frontend Tests (verified)

## FAIL hooks/ai/use-ai-compose.test.tsx

   "should compose email successfully" -- expects variantUsed property (removed from impl)
   "should compose email with all options" -- expects variant parameter (removed from impl)

### Known Failing Backend Tests (verified)

AIL hooks/ai/use-ai-actions.test.tsx
   "should approve action successfully" -- expects approveAction(id) but impl is approveAction(id, undefined)

### Missing Prisma Migration (verified)

```bash
# The schema has this index defined:
# @@index([tenantId, aiPriority])
# But grep shows no migration SQL for it:
grep -r "tenantId.*aiPriority" prisma/migrations/  # returns nothing

# Fix:
cd backend && npx prisma migrate dev --name add_tenant_ai_priority_index
```

### LabelTreeDndWrapper.tsx Bug (verified)

```typescript
// Lines 250, 256: resetState() is called
// Line 259: const resetState = () => { ... }
// const is NOT hoisted -- this is a runtime ReferenceError waiting to happen
// Fix: Move resetState declaration above its first usage
```

## State of the Art

### Current Codebase Metrics (Baseline for Audit)

| Metric | Current Value | Target |
|--------|---------------|--------|

| Backend TS errors | 0 | 0 |
| Frontend TS errors | 0 | 0 |
| Backend lint | ESLint config error (self-lint) | 0 warnings |
| Frontend lint | ESLint BROKEN (plugin incompat) | 0 warnings |
| Backend Jest | 672/672 pass (100%) | 100% |
| Frontend Jest | 206/209 pass (98.6%) | 100% |
| E2E tests | Unknown (auth mock may be broken) | All pass |
| npm audit (backend) | 24 vulnerabilities | 0 production |
| npm audit (frontend) | 16 vulnerabilities | 0 production |
| npm audit (root) | 5 vulnerabilities | 0 production |
| Files >500 lines (backend) | 15+ files | 0 files |
| Files >500 lines (frontend) | 10+ files | Minimize |
| TODO/FIXME markers (backend) | 19 | Document |
| TODO/FIXME markers (frontend) | 16 | Document |
| LCP | 4.12s | < 2.5s |
| TTI | 4.13s | < 3.5s |

### Known Issues Carried Forward (from STATE.md)

| Issue | Source | Status |
|-------|--------|--------|

| LCP exceeds budget (4.12s vs 2.5s target) | v2.1-01 | Open |
| TTI exceeds budget (4.13s vs 3.5s target) | v2.1-01 | Open |
| E2E chip interaction tests (5/7 pass) | v2.1-02 | Open |
| E2E auth mock infrastructure bug | Pre-existing | Open |
| Lint error in LabelTreeDndWrapper.tsx (resetState) | Pre-existing | Open -- CONFIRMED |
| @@index([tenantId, aiPriority]) needs migration | v3.0 | Open -- CONFIRMED |

### Unfinished Plans

| Plan | Status | What's Needed |
|------|--------|---------------|

| 19-04 (WritingStyleSettings) | Fully planned, not executed | Execute the existing plan (create component, hooks, translations, wire into Settings) |
| 21-01 (Triage Prompt enrichment) | Phase dir empty (only .gitkeep) | Needs planning AND execution -- enrich Apply AI Suggestions prompt with email metadata |

### Technology Versions (verified from node_modules)

| Package | Backend | Frontend |
|---------|---------|----------|

| TypeScript | 5.9.3 | 5.9.3 |
| ESLint | 10.0.0 | 10.0.0 |
| Next.js | -- | 16.1.6 |
| NestJS | 11.1.13 | -- |
| Prisma | 7.3.0 | -- |
| Playwright | -- | 1.57.0 |
| React | -- | (via Next.js 16) |
| eslint-plugin-react | -- | 7.37.5 (INCOMPATIBLE with ESLint 10) |
| eslint-config-next | -- | 16.1.6 |

## Open Questions

1. **E2E Test Status**
   - What we know: Auth mock setup exists, 6 test files exist, but running them requires a live frontend server or build
   - What's unclear: How many E2E tests actually pass with the current auth mock infrastructure bug
   - Recommendation: Attempt to run E2E tests early in the audit to establish baseline. The auth mock bug may need fixing first.

2. **Frontend Build Status**
   - What we know: TypeScript compiles clean with `--noEmit`
   - What's unclear: Whether `next build` succeeds (full production build with bundling)
   - Recommendation: Run `npm run build` in frontend early to establish baseline

3. **Live Backend Status**
   - What we know: Tests pass, TypeScript compiles
   - What's unclear: Whether the backend actually starts and serves API requests correctly
   - Recommendation: Start backend during audit pass, curl key endpoints

4. **File Size Violations -- Fix or Flag?**
   - What we know: 15+ backend files exceed 500-line limit, some at 1400+ lines
   - What's unclear: Whether splitting these files is safe in a bug-fix phase (high regression risk)
   - Recommendation: Flag in BUG-REPORT.md as tech debt. Only split if the file also has bugs that require refactoring anyway. Do not split working files purely for compliance.

5. **eslint-plugin-react Compatibility**
   - What we know: Version 7.37.5 crashes with ESLint 10
   - What's unclear: Whether upgrading to eslint-plugin-react 8.x exists and is compatible
   - Recommendation: Research eslint-plugin-react ESLint 10 compatibility during the fix pass. May need to pin ESLint to 9.x instead.

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection via Read/Bash/Grep tools -- all findings verified against actual files
- `npx tsc --noEmit` -- both backend and frontend compile clean
- `npx jest` -- backend 672/672, frontend 206/209
- `npm audit` -- vulnerability counts from actual scan
- `npx prisma migrate status` -- "Database schema is up to date" (but missing compound index migration)

### Secondary (MEDIUM confidence)

- STATE.md known issues -- carried forward from prior phases, some confirmed, some unverified at runtime
- CONTEXT.md user decisions -- locked constraints from discussion phase

### Tertiary (LOW confidence)

- LCP/TTI performance numbers -- from prior phase measurements, may have changed since then
- E2E test status -- unknown without running against live app

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all versions verified from node_modules
- Architecture: HIGH -- audit structure follows established patterns from CONTEXT.md decisions
- Pitfalls: HIGH -- all major pitfalls confirmed through direct codebase inspection
- Known bugs: HIGH -- ESLint crash, test failures, migration gap all reproduced
- Performance metrics: LOW -- LCP/TTI numbers are stale from prior phases

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable codebase, no external dependency churn expected during audit)
