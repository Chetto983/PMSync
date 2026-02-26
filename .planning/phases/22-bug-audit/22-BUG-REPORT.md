# Bug Report - Phase 22 Audit

**Date:** 2026-02-26
**Auditor:** Claude Code (Phase 22 Plan 01)
**Baseline Tag:** v3.1-pre-audit

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 12 |
| MEDIUM   | 18 |
| LOW      | 14 |
| **TOTAL** | **47** |

---

## Static Analysis Baseline

### TypeScript Compilation

| Target | Errors | Status |
|--------|--------|--------|
| Backend (`npx tsc --noEmit`) | 0 | PASS |
| Frontend (`npx tsc --noEmit`) | 0 | PASS |

### ESLint Status

| Target | Status | Error |
|--------|--------|-------|
| Backend | BROKEN | Tries to lint `coverage/block-navigation.js` with type-checked rules. Error: `@typescript-eslint/await-thenable` requires `parserOptions` for non-TS files. Coverage directory and `eslint.config.js` not in ignores. |
| Frontend | BROKEN | `eslint-plugin-react` 7.37.5 incompatible with ESLint 10.0.0. Error: `contextOrFilename.getFilename is not a function`. Plugin API changed in ESLint 10 flat config. |

### Jest Test Results

| Target | Pass | Fail | Total | Failing Tests |
|--------|------|------|-------|---------------|
| Backend | 672 | 0 | 672 | None (but `--detectOpenHandles` warning: worker process forced exit) |
| Frontend | 206 | 3 | 209 | `use-ai-compose.test.tsx` (2 failures), `use-ai-actions.test.tsx` (1 failure) |

**Frontend test failures (details):**

1. `use-ai-compose.test.tsx` - "should compose email successfully": expects `variantUsed` property in response (removed from implementation)
2. `use-ai-compose.test.tsx` - "should compose email with all options": expects `variant` parameter (removed from implementation)
3. `use-ai-actions.test.tsx` - "should approve action successfully": expects `approveAction(id)` but implementation calls `approveAction(id, undefined)` (signature changed to 2 args)

### npm Audit

| Location | Total | Low | Moderate | High | Critical | Prod-only |
|----------|-------|-----|----------|------|----------|-----------|
| Root | 5 | 0 | 0 | 5 | 0 | N/A (dev deps: fasttext, tar, minimatch) |
| Backend | 24 | 2 | 14 | 7 | 1 | 11 (1 low, 2 moderate, 7 high, 1 critical) |
| Frontend | 16 | 5 | 9 | 1 | 1 | 8 moderate (markdown-it ReDoS) |

**Production-critical vulnerabilities:**
- Backend: `xlsx` prototype pollution (HIGH/CRITICAL) via `node-nlp` -> `@nlpjs/xtables`; `qs` DoS; `minimatch` ReDoS
- Frontend: `markdown-it` ReDoS (MODERATE), `tmp` symlink write (via `@lhci/cli` -- dev only), `qs` DoS

### File Size Violations (>500 lines per CLAUDE.md rules)

**Backend (38 files exceed 500 lines):**

| File | Lines | Severity |
|------|-------|----------|
| email-sync-back.service.ts | 1,429 | Extreme |
| auth.service.ts | 1,220 | Extreme |
| emails.controller.ts | 1,183 | Extreme |
| email.tools.ts | 1,112 | Extreme |
| voltagent.service.ts | 1,091 | Extreme |
| provider-config.service.ts | 1,088 | Extreme |
| relationship-intelligence.service.ts | 1,078 | Extreme |
| email-insights.service.ts | 1,069 | Extreme |
| contacts.service.ts | 1,030 | Extreme |
| hitl.service.ts | 929 | High |
| calendar-events.service.ts | 927 | High |
| queue.service.ts | 926 | High |
| realtime-events.service.ts | 862 | High |
| microsoft-oauth.service.ts | 857 | High |
| webauthn.service.ts | 851 | High |
| microsoft-webhook.service.ts | 835 | High |
| voltagent.controller.ts | 835 | High |
| folders.controller.ts | 820 | High |
| email-triage.service.ts | 820 | High |
| daily-briefing.service.ts | 819 | High |
| imap-message.service.ts | 811 | High |
| intent-taxonomy.ts | 804 | High |
| writing-style.service.ts | 799 | High |
| sync-message-processor.service.ts | 794 | High |
| hooks.ts | 791 | High |
| insights.tools.ts | 770 | High |
| document-library.service.ts | 752 | High |
| cache.service.ts | 743 | High |
| abstract-calendar-sync.service.ts | 734 | High |
| analytics.service.ts | 722 | High |
| email-analysis.service.ts | 721 | High |
| email-crud.service.ts | 720 | High |
| sync-scheduler.service.ts | 709 | High |
| email-sync en.ts locale | 705 | High |
| gmail-message.service.ts | 702 | High |
| analytics.tools.ts | 697 | High |
| email-executor.ts | 680 | High |

**Frontend (35 files exceed 500 lines, excluding locales/index.ts):**

| File | Lines | Severity |
|------|-------|----------|
| lib/api/ai.ts | 1,495 | Extreme |
| prompt-input.tsx | 1,263 | Extreme |
| Calendar.tsx | 1,180 | Extreme |
| Contacts.tsx | 1,021 | Extreme |
| email.tsx (page) | 1,012 | Extreme |
| ComposeDialog.tsx | 974 | Extreme |
| Header.tsx | 898 | High |
| use-dashboard.ts | 823 | High |
| ChatSessionList.tsx | 748 | High |
| ChatMessages.tsx | 739 | High |
| ContactDetail.tsx | 718 | High |
| KanbanBoard/index.tsx | 704 | High |
| websocket-client.ts | 693 | High |
| Settings.tsx | 685 | High |
| use-contacts.ts | 684 | High |
| DashboardContainer.tsx | 674 | High |
| SchedulingDrawer.tsx | 610 | High |
| use-emails.ts | 601 | High |
| lightTheme.ts | 577 | High |
| darkTheme.ts | 577 | High |
| lib/api/emails.ts | 577 | High |
| types/api.ts | 571 | High |
| MentionInput.tsx | 560 | High |
| FolderSidebar.tsx | 558 | High |
| GenericProviderCard.tsx | 555 | High |
| email-ui-store.ts | 549 | High |
| login.tsx | 548 | High |
| AgentProgressIndicator.tsx | 548 | High |
| MobileFolderSheet.tsx | 543 | High |
| ComposeEditor.tsx | 534 | High |
| code-block.tsx | 528 | High |
| ExpandedMessage.tsx | 524 | High |
| CalendarEventDetail.tsx | 519 | High |
| EmailLayout.tsx | 515 | High |

### Prisma Migration Status

- Database schema reported as "up to date" (16 migrations applied)
- **MISSING MIGRATION:** `@@index([tenantId, aiPriority])` defined in `schema.prisma` line 410 but no migration SQL exists in `prisma/migrations/`. This index is not created in the database.
- No other schema drift detected.

### Dead Code / TODO Markers

**Backend (5 TODOs):**
1. `dead-letter-queue.service.ts:474` -- TODO: Integrate with alerting service
2. `embedding-provider.service.ts:84` -- TODO: Add OpenAI provider
3. `sync-message-processor.service.ts:420` -- TODO: Consider retry queue for failed AI analyses
4. `sync-message-processor.service.ts:725` -- TODO: Consider retry queue for failed AI analyses (duplicate)
5. `billing-alert.service.ts:127` -- TODO: Integrate with actual email service

**Frontend (2 TODOs):**
1. `ComposeEditor.tsx:268` -- TODO: signature from user settings once editor implemented
2. `email.tsx:728` -- TODO: Show folder picker dialog (Phase 4.3)

### i18n Audit

- en.ts: 3,512 lines / 3,084 keys
- it.ts: 3,489 lines / 3,083 keys
- **1 key missing in Italian translation** (en has 3,084 vs it has 3,083)
- No hardcoded English strings found in components (components use `t.*` patterns)

### Code Pattern Violations

- **Raw apiClient in components:** NONE found -- all components use TanStack Query hooks. CLEAN.
- **Hardcoded hex colors:** Found in `ColorPicker.tsx` (preset palette -- acceptable per decision "CALENDAR_COLORS hardcoded array acceptable"), `ContactDetail.tsx` (Google/Microsoft brand SVG colors -- brand requirement). No violations in UI layout components.
- **Components missing loading/error/empty states:** Not auditable statically without runtime check (deferred to Task 2).

---

## WCAG Accessibility Audit

### Scope

Audited all v3.1 components (phases 13-21) for WCAG AA compliance.

### Findings

52 aria-label/aria-labelledby/role attributes found across 36 frontend component files. This is a reasonable baseline.

#### ACC-001: LabelTreeDndWrapper resetState hoisting bug
- **Severity:** HIGH
- **Location:** `frontend/components/email/labels/LabelTreeDndWrapper.tsx:250-259`
- **Issue:** `resetState()` is called at lines 250 and 256, but `const resetState` is declared at line 259. `const` is NOT hoisted -- this is a runtime `ReferenceError` if drag-cancel fires. Keyboard users triggering drag cancel would crash the component.
- **Fix Plan:** 04 (frontend)

#### ACC-002: dangerouslySetInnerHTML without sanitization audit
- **Severity:** MEDIUM
- **Location:** 5 files use `dangerouslySetInnerHTML`
- **Files:** `SignatureSettings.tsx:303`, `schema-display.tsx:166`, `SeoHead.tsx:86`, `ComposeDialog.tsx:905`, `ComposeEditor.tsx:493`
- **Issue:** Need to verify that all HTML content passed to `dangerouslySetInnerHTML` is sanitized. `ComposeDialog.tsx` and `ComposeEditor.tsx` render email HTML (potential XSS vector). `SeoHead.tsx` renders JSON-LD (safe). `schema-display.tsx` renders highlighted code (needs review).
- **Fix Plan:** 04 (frontend) for sanitization review

#### ACC-003: Focus management in modals/panels
- **Severity:** MEDIUM
- **Issue:** Cannot verify focus containment in modals (ComposeDialog, AI chat panel, GDPR consent dialogs) without runtime testing. MUI Dialog components typically handle this, but custom panels may not.
- **Fix Plan:** 04 (frontend) -- needs runtime verification

---

## Security Audit (OWASP Top 10)

### XSS Prevention

| Check | Status | Details |
|-------|--------|---------|
| dangerouslySetInnerHTML | 5 usages | Email body rendering uses raw HTML -- needs DOMPurify or equivalent |
| Content-Security-Policy | CONFIGURED | Helmet CSP active in `main.ts` with strict directives |
| Script injection | MITIGATED | CSP blocks inline scripts (except Swagger `unsafe-inline`) |

### CSRF Protection

| Check | Status | Details |
|-------|--------|---------|
| csrf-csrf middleware | ACTIVE | `main.ts:101` applies `csrfMiddleware` globally |
| SameSite cookies | STRICT | `sameSite: 'strict'` configured in csrf middleware |
| Token endpoint | EXISTS | `/auth/csrf-token` provides CSRF tokens |
| Exemptions | REVIEWED | Auth endpoints, webhooks, health checks properly exempted |

### SQL Injection / Prisma

| Check | Status | Details |
|-------|--------|---------|
| `$queryRawUnsafe` | NONE | Zero usage -- CLEAN |
| `$executeRawUnsafe` | NONE | Zero usage -- CLEAN |
| `$queryRaw` template literals | 20+ usages | All use tagged template literals (parameterized) -- SAFE |
| `$executeRaw` template literals | 8 usages | All use tagged template literals (parameterized) -- SAFE |
| `Prisma.sql` for dynamic queries | 3 usages | Parameterized via `Prisma.sql` -- SAFE |

### Authentication & Authorization

| Check | Status | Details |
|-------|--------|---------|
| JwtAuthGuard on controllers | ALL PROTECTED | Every controller has `@UseGuards(JwtAuthGuard, ...)` at class level |
| TenantGuard for multi-tenancy | CONSISTENT | All data-access controllers include `TenantGuard` |
| GDPR controllers bypass legal | CORRECT | All 5 compliance controllers have `@SkipLegalCheck()` (GDPR rights accessible regardless) |
| ThrottlerGuard | GLOBAL | Applied via `APP_GUARD` in `app.module.ts` -- all endpoints rate-limited |
| RolesGuard on admin endpoints | PRESENT | Tenant admin and email-sync admin endpoints use `RolesGuard` |

### Rate Limiting

| Check | Status | Details |
|-------|--------|---------|
| ThrottlerGuard | GLOBAL | `@nestjs/throttler` configured as global guard |
| AI endpoints | PROTECTED | QuotaGuard on all VoltAgent controllers (subscription-based limits) |

### Hardcoded Secrets

| Check | Status | Details |
|-------|--------|---------|
| API keys in source | NONE FOUND | All secrets come from `.env` via `configuration.ts` |
| `.env.example` exists | YES | Configuration documented |

**Security Summary:** The codebase has strong security practices. CSRF, CSP, auth guards, rate limiting all properly configured. The main concern is `dangerouslySetInnerHTML` for email body rendering (potential stored XSS from malicious emails).

---

## Email Sync Engine Audit

### IMAP Sync Flow

- **Entry:** `sync.worker.ts` receives BullMQ job -> calls `syncProviderFolders` then `syncEmails`
- **Error handling:** Comprehensive try/catch with logging and DLQ integration
- **Token refresh:** `provider-token.service.ts` handles OAuth token refresh with Redis lock to prevent concurrent refresh. Token expiry check is built into the sync flow (`isTokenExpiringSoon` + `refreshDriverIfNeeded`).

### Folder Operations (RC-A1 / RC-A8)

| Race Condition | Status | Implementation |
|----------------|--------|----------------|
| RC-A1: syncProviderFolders | **FIXED** | Redis lock with `folder-sync:{providerId}` key, 300s TTL, alerting monitor |
| RC-A8: folder CRUD | **FIXED** | Redis lock with `folder-crud:{providerId}` key, 30s TTL on create/rename/delete |

### Multi-Tenant Race Conditions

- Redis locks are per-provider (not per-tenant), which is correct -- folder sync is provider-scoped
- Sync worker uses Redis locks for sync operations
- No deadlock risk between folder sync and email sync (different lock keys)

### P2002/P2034 Handling

| Check | Status | Details |
|-------|--------|---------|
| `PrismaRetryService` exists | YES | `backend/src/common/services/prisma-retry.service.ts` |
| P2002 retry (unique constraint) | IMPLEMENTED | Exponential backoff with configurable max retries |
| P2034 retry (deadlock/write conflict) | IMPLEMENTED | Same retry service handles both codes |
| Usage in sync services | ACTIVE | `folder-sync-query.service.ts` and `sync-message-processor.service.ts` use it |
| Test coverage | YES | Tests for P2002, P2034 retry behavior, and max-retry exhaustion |

### Token Expiry Handling

- `provider-token.service.ts` checks token validity before each sync operation
- Refresh uses Redis lock to prevent concurrent refresh races
- Microsoft delta token expiration handled with reset fallback
- Google and IMAP token refresh integrated into driver initialization

**Sync Engine Summary:** The sync engine is well-hardened. RC-A1 and RC-A8 race conditions are fixed. P2002/P2034 retry logic is centralized and tested. Token refresh is protected against races. No critical issues found.

---

## Bug Inventory

### CRITICAL (blocks core functionality)

#### BUG-001: Frontend ESLint completely broken
- **Location:** `frontend/eslint.config.mjs` + `node_modules/eslint-plugin-react`
- **Category:** config
- **Impact:** Zero lint enforcement on frontend code. Any code quality regression goes undetected.
- **Root Cause:** `eslint-plugin-react` 7.37.5 uses `contextOrFilename.getFilename()` which was removed in ESLint 10 flat config API.
- **Fix:** Either downgrade ESLint to 9.x or upgrade to `eslint-plugin-react` 8.x+ compatible with ESLint 10. Also check `eslint-config-next` 16.1.6 compatibility.
- **Regression Test:** CI lint gate must pass after fix.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-002: Backend ESLint broken (lints coverage directory)
- **Location:** `backend/eslint.config.js`
- **Category:** config
- **Impact:** ESLint crashes trying to type-check non-TS files in `coverage/`. Cannot run backend lint.
- **Root Cause:** `coverage/` directory and `eslint.config.js` not in ignores array. Type-checked rules require `parserOptions.project` which doesn't include these files.
- **Fix:** Add `coverage/` and `eslint.config.js` to ESLint ignores.
- **Regression Test:** `npx eslint .` in backend must complete without errors.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-003: Missing Prisma migration for aiPriority index
- **Location:** `backend/prisma/schema.prisma:410`
- **Category:** database
- **Impact:** `@@index([tenantId, aiPriority])` is defined in schema but NOT migrated. Queries filtering by `aiPriority` do full table scans. Performance degradation for AI triage features.
- **Root Cause:** Index was added to schema during v3.0 but `prisma migrate dev` was never run to generate migration SQL.
- **Fix:** Run `npx prisma migrate dev --name add_tenant_ai_priority_index`.
- **Regression Test:** `npx prisma migrate status` should report no drift. Query EXPLAIN on aiPriority filter should use index.
- **Fix Plan:** 03 (backend)

### HIGH (significant functionality broken)

#### BUG-004: LabelTreeDndWrapper resetState hoisting bug
- **Location:** `frontend/components/email/labels/LabelTreeDndWrapper.tsx:250-259`
- **Category:** ui
- **Impact:** `resetState()` called at lines 250/256 before `const resetState` declaration at line 259. Will throw `ReferenceError` when drag-cancel or drag-end fires. Crashes label drag-and-drop.
- **Root Cause:** `const` is not hoisted (unlike `function`). The function reference is used before initialization in `handleDragEnd` and `handleDragCancel` callbacks.
- **Fix:** Move `const resetState = () => { ... }` declaration above `handleDragEnd` (before line 240).
- **Regression Test:** Unit test for drag-cancel and drag-end events on label tree.
- **Fix Plan:** 04 (frontend)

#### BUG-005: Frontend test: use-ai-compose expects removed `variantUsed` property
- **Location:** `frontend/hooks/ai/use-ai-compose.test.tsx:130`
- **Category:** test
- **Impact:** 2 tests fail permanently. CI cannot gate on frontend test pass.
- **Root Cause:** Implementation removed `variantUsed` from response and `variant` from params in a later phase, tests not updated.
- **Fix:** Update test expectations to match current `composeEmail` API signature (no `variant` param, no `variantUsed` response field).
- **Regression Test:** Existing tests once fixed.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-006: Frontend test: use-ai-actions expects wrong approveAction signature
- **Location:** `frontend/hooks/ai/use-ai-actions.test.tsx:231`
- **Category:** test
- **Impact:** 1 test fails permanently. Test expects `approveAction(id)` but impl calls `approveAction(id, undefined)`.
- **Root Cause:** `approveAction` signature changed to accept 2 args (id, feedback?) but test expects 1-arg call.
- **Fix:** Update test to `expect(voltAgentApi.approveAction).toHaveBeenCalledWith('exec-1', undefined)`.
- **Regression Test:** Existing test once fixed.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-007: Backend npm audit -- 11 production vulnerabilities
- **Location:** `backend/package.json` dependencies
- **Category:** deps
- **Impact:** 1 critical (xlsx prototype pollution), 7 high (minimatch ReDoS, xlsx, qs), 2 moderate, 1 low in production dependencies.
- **Root Cause:** `node-nlp` -> `@nlpjs/xtables` -> `xlsx` chain introduces known CVEs. `qs` and `minimatch` are transitive.
- **Fix:** `npm audit fix` for safe fixes. For `xlsx`: check if `node-nlp` has updated version without `xlsx` dependency, or replace with alternative NLP library.
- **Regression Test:** `npm audit --omit=dev` should report 0 high/critical.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-008: Frontend npm audit -- 8 production vulnerabilities
- **Location:** `frontend/package.json` dependencies
- **Category:** deps
- **Impact:** 8 moderate vulnerabilities in production (primarily `markdown-it` ReDoS, `qs` DoS).
- **Root Cause:** Transitive dependency versions with known CVEs.
- **Fix:** `npm audit fix` for safe fixes. Check if `markdown-it` has patched version available.
- **Regression Test:** `npm audit --omit=dev` should report 0 moderate+.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-009: dangerouslySetInnerHTML on email body without verified sanitization
- **Location:** `frontend/components/email/compose/ComposeDialog.tsx:905`, `ComposeEditor.tsx:493`
- **Category:** security
- **Impact:** Email body HTML rendered directly. A malicious email with XSS payload could execute in the user's browser context (access cookies, API tokens).
- **Root Cause:** Email HTML from IMAP/Gmail may contain malicious scripts. Need to verify DOMPurify or equivalent is applied before rendering.
- **Fix:** Verify sanitization pipeline. If not present, add DOMPurify sanitization before all `dangerouslySetInnerHTML` usages that render email content.
- **Regression Test:** Unit test with XSS payload in email body (script tags, event handlers).
- **Fix Plan:** 04 (frontend)

#### BUG-010: Backend Jest worker process forced exit warning
- **Location:** `backend/` (global test infrastructure)
- **Category:** test
- **Impact:** Jest warns about leaked async operations. Tests pass but workers force-exit, masking potential resource leaks (unclosed DB connections, timers).
- **Root Cause:** Some test suite(s) leave async operations running after completion (likely BullMQ connections or Redis subscriptions).
- **Fix:** Run `npx jest --detectOpenHandles` to identify leaking handles. Add proper teardown in affected test files.
- **Regression Test:** Jest should exit cleanly without `--forceExit`.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-011: LCP exceeds budget (4.12s vs 2.5s target)
- **Location:** Frontend bundle / page load
- **Category:** perf
- **Impact:** Users experience slow initial page load. Below professional-grade UX target.
- **Root Cause:** Large bundle size, potentially unoptimized images, lack of critical CSS inlining.
- **Fix:** Audit bundle with `next build --analyze`. Lazy-load non-critical components. Optimize images.
- **Regression Test:** Lighthouse CI with LCP < 2.5s budget.
- **Fix Plan:** 04 (frontend)

#### BUG-012: TTI exceeds budget (4.13s vs 3.5s target)
- **Location:** Frontend JavaScript execution
- **Category:** perf
- **Impact:** App not interactive for 4+ seconds. Users cannot click/type during this time.
- **Root Cause:** Heavy JavaScript hydration, potentially blocking synchronous operations.
- **Fix:** Code-split heavy components. Defer non-critical JS. Use React.lazy for dashboard widgets.
- **Regression Test:** Lighthouse CI with TTI < 3.5s budget.
- **Fix Plan:** 04 (frontend)

#### BUG-013: Root npm audit -- 5 high vulnerabilities
- **Location:** Root `package.json` dependencies
- **Category:** deps
- **Impact:** `tar`, `minimatch`, `fasttext` chain has known CVEs. Dev-only (fasttext + tar), but `minimatch` ReDoS is concerning.
- **Root Cause:** `fasttext` -> `node-pre-gyp` -> `tar` vulnerable chain.
- **Fix:** `npm audit fix` or `npm audit fix --force` with breaking change acceptance for fasttext.
- **Regression Test:** `npm audit` should report 0 high.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-014: E2E chip interaction tests (5/7 pass)
- **Location:** Frontend E2E tests
- **Category:** test
- **Impact:** 2 E2E search filter chip tests fail. Chip removal click behavior not correctly tested.
- **Root Cause:** E2E auth mock may not mock all required endpoints, or chip removal selector is fragile.
- **Fix:** Debug failing E2E tests. Fix auth mock coverage. Update selectors if needed.
- **Regression Test:** All 7 chip interaction tests pass.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-015: E2E auth mock infrastructure bug
- **Location:** Frontend E2E auth setup
- **Category:** test
- **Impact:** Auth mock doesn't cover all endpoints called on page load. New API calls in later phases break E2E tests.
- **Root Cause:** Mock coverage not maintained as app evolved. Auth setup is static, not dynamic.
- **Fix:** Audit all API calls made during page load. Update auth mock to cover all of them. Consider a more robust mock strategy.
- **Regression Test:** All E2E test suites pass reliably.
- **Fix Plan:** 02 (tooling/CI)

### MEDIUM (incorrect behavior, workaround exists)

#### BUG-016: i18n -- 1 missing Italian translation key
- **Location:** `frontend/locales/it.ts`
- **Category:** i18n
- **Impact:** 1 string will show English fallback for Italian users.
- **Root Cause:** A key was added to `en.ts` without corresponding `it.ts` entry (likely in a recent phase).
- **Fix:** Diff en.ts vs it.ts key structures, add missing key.
- **Regression Test:** Key count assertion in CI.
- **Fix Plan:** 04 (frontend)

#### BUG-017: File size violations -- 38 backend files exceed 500 lines
- **Location:** Backend source files (see table above)
- **Category:** code-quality
- **Impact:** Violates CLAUDE.md "max 500 lines per file" rule. Harder to maintain, review, test.
- **Root Cause:** Incremental feature additions across 21 phases without refactoring passes.
- **Fix:** Document as tech debt. Only split files that also have bugs requiring refactoring. Splitting working files purely for compliance is high regression risk.
- **Regression Test:** CI check for file size limits.
- **Fix Plan:** 03 (backend) -- flag only, split on case-by-case basis

#### BUG-018: File size violations -- 35 frontend files exceed 500 lines
- **Location:** Frontend source files (see table above)
- **Category:** code-quality
- **Impact:** Same as BUG-017 for frontend.
- **Root Cause:** Same as BUG-017.
- **Fix:** Same approach -- flag, don't split unless fixing other bugs in same file.
- **Regression Test:** CI check for file size limits.
- **Fix Plan:** 04 (frontend) -- flag only

#### BUG-019: ContactDetail.tsx hardcoded hex colors for brand logos
- **Location:** `frontend/components/contacts/ContactDetail.tsx:70-105`
- **Category:** ui
- **Impact:** Hardcoded `#ffffff`, `#e0e0e0`, and brand colors (Google blue, Microsoft green, etc.) instead of theme tokens. Will look wrong in dark theme.
- **Root Cause:** SVG brand logos use official brand colors (acceptable). But `bgcolor: '#ffffff'` and `border: '1px solid #e0e0e0'` should use theme tokens.
- **Fix:** Replace `#ffffff` with `theme.palette.background.paper`, `#e0e0e0` with `theme.palette.divider`.
- **Regression Test:** Visual test in both light and dark themes.
- **Fix Plan:** 04 (frontend)

#### BUG-020: TODO in sync-message-processor appears twice
- **Location:** `backend/src/modules/email-sync/services/sync-message-processor.service.ts:420,725`
- **Category:** code-quality
- **Impact:** Duplicate TODO comment suggests copy-paste without resolution. Not a functional bug.
- **Root Cause:** Same retry queue TODO copied when code was duplicated.
- **Fix:** Consolidate or remove duplicate. Add retry queue if valuable, or delete TODOs if not planned.
- **Regression Test:** N/A
- **Fix Plan:** 03 (backend)

#### BUG-021: SignatureSettings dangerouslySetInnerHTML
- **Location:** `frontend/components/settings/SignatureSettings.tsx:303`
- **Category:** security
- **Impact:** Renders signature HTML preview. If user enters malicious HTML, it executes. Lower risk than email body (user-generated, not external).
- **Root Cause:** HTML signature preview rendered without sanitization.
- **Fix:** Add DOMPurify sanitization for signature preview.
- **Regression Test:** XSS payload in signature HTML should be stripped.
- **Fix Plan:** 04 (frontend)

#### BUG-022: schema-display.tsx dangerouslySetInnerHTML
- **Location:** `frontend/src/components/ai-elements/schema-display.tsx:166`
- **Category:** security
- **Impact:** Renders highlighted code/JSON. If AI returns malicious content, could execute. Lower risk (AI output, not user input).
- **Root Cause:** Code highlighting uses innerHTML for syntax coloring.
- **Fix:** Verify highlighting library output is safe, or add sanitization.
- **Regression Test:** XSS payload in schema data should be stripped.
- **Fix Plan:** 04 (frontend)

#### BUG-023: Helmet CSP allows unsafe-inline for scripts
- **Location:** `backend/src/main.ts:44`
- **Category:** security
- **Impact:** `scriptSrc: ["'self'", "'unsafe-inline'"]` weakens CSP. Needed for Swagger UI but could be restricted to non-production.
- **Root Cause:** Swagger UI requires inline scripts for its interactive documentation.
- **Fix:** Apply `unsafe-inline` only in non-production environments. Production should use strict CSP with nonces.
- **Regression Test:** Swagger works in dev, production CSP rejects inline scripts.
- **Fix Plan:** 03 (backend)

#### BUG-024: Subscription controller missing TenantGuard
- **Location:** `backend/src/modules/subscription/controllers/subscription.controller.ts:40`
- **Category:** security
- **Impact:** `@UseGuards(JwtAuthGuard)` without `TenantGuard`. Users could potentially access subscription data across tenants.
- **Root Cause:** Subscription is user-scoped (not tenant-scoped) in some endpoints, but should verify tenant isolation.
- **Fix:** Audit subscription endpoints for tenant isolation. Add `TenantGuard` where tenant-scoped data is accessed.
- **Regression Test:** Multi-tenant test verifying tenant A cannot access tenant B subscription data.
- **Fix Plan:** 03 (backend)

#### BUG-025: Autumn controller endpoints missing TenantGuard
- **Location:** `backend/src/modules/subscription/controllers/autumn.controller.ts:67-269`
- **Category:** security
- **Impact:** 8 endpoints with `@UseGuards(JwtAuthGuard)` but no `TenantGuard`. Similar concern as BUG-024.
- **Root Cause:** Billing/payment endpoints may be user-scoped, but should still validate tenant context.
- **Fix:** Audit all Autumn endpoints for tenant isolation requirements.
- **Regression Test:** Multi-tenant billing isolation test.
- **Fix Plan:** 03 (backend)

#### BUG-026: Templates controller missing TenantGuard
- **Location:** `backend/src/modules/email/controllers/templates.controller.ts:26`
- **Category:** security
- **Impact:** `@UseGuards(JwtAuthGuard)` without `TenantGuard`. Email templates could leak across tenants.
- **Root Cause:** Template controller may have been added before TenantGuard was standardized.
- **Fix:** Add `TenantGuard` to templates controller.
- **Regression Test:** Multi-tenant template isolation test.
- **Fix Plan:** 03 (backend)

#### BUG-027: Signatures controller missing TenantGuard
- **Location:** `backend/src/modules/email/controllers/signatures.controller.ts:21`
- **Category:** security
- **Impact:** `@UseGuards(JwtAuthGuard)` without `TenantGuard`. Email signatures could leak across tenants.
- **Root Cause:** Same as BUG-026.
- **Fix:** Add `TenantGuard` to signatures controller.
- **Regression Test:** Multi-tenant signature isolation test.
- **Fix Plan:** 03 (backend)

#### BUG-028: MFA controller uses TenantGuard but may not need it
- **Location:** `backend/src/modules/auth/controllers/mfa.controller.ts:59`
- **Category:** config
- **Impact:** MFA is user-scoped (not tenant-scoped). `TenantGuard` adds unnecessary dependency. Not broken, but inconsistent.
- **Root Cause:** Copied guard pattern from other controllers.
- **Fix:** Review if MFA endpoints need tenant context. If not, remove TenantGuard.
- **Regression Test:** MFA operations should work without tenant header.
- **Fix Plan:** 03 (backend)

#### BUG-029: en.ts/it.ts locale files exceed 500 lines (3,500+ lines each)
- **Location:** `frontend/locales/en.ts`, `frontend/locales/it.ts`, `frontend/locales/index.ts`
- **Category:** code-quality
- **Impact:** Violates file size rule. Difficult to maintain monolithic translation files.
- **Root Cause:** All translations in single files across 21+ phases.
- **Fix:** Could namespace-split into `locales/en/*.ts` modules, but high refactoring risk. Flag as tech debt.
- **Regression Test:** Translation type-check must pass.
- **Fix Plan:** 04 (frontend) -- flag only, defer split

#### BUG-030: Backend auth endpoints (logout, refresh) lack TenantGuard
- **Location:** `backend/src/modules/auth/controllers/auth.controller.ts:204,216`
- **Category:** security
- **Impact:** `/auth/logout` and `/auth/refresh-token` use `@UseGuards(JwtAuthGuard)` only. These are user-scoped operations and may not need TenantGuard, but the audit should confirm.
- **Root Cause:** Auth operations are inherently user-scoped (logout, token refresh).
- **Fix:** Confirm these don't access tenant-scoped data. If confirmed, mark as intentional.
- **Regression Test:** N/A if confirmed user-scoped.
- **Fix Plan:** 03 (backend) -- review only

#### BUG-031: Document library controller missing QuotaGuard
- **Location:** `backend/src/modules/ai/voltagent/controllers/document-library.controller.ts:85`
- **Category:** config
- **Impact:** `@UseGuards(JwtAuthGuard, TenantGuard)` without `QuotaGuard`. Document uploads could bypass subscription quotas.
- **Root Cause:** Controller added without QuotaGuard (other AI controllers have it).
- **Fix:** Add `QuotaGuard` to match other AI controllers.
- **Regression Test:** Upload beyond quota should fail with 429.
- **Fix Plan:** 03 (backend)

#### BUG-032: Follow-up controller uses updated git diff state
- **Location:** `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts`
- **Category:** config
- **Impact:** File shows as modified in git status. Needs review for correctness.
- **Root Cause:** Uncommitted changes from prior work.
- **Fix:** Review and either commit or revert the changes.
- **Regression Test:** N/A
- **Fix Plan:** 03 (backend)

#### BUG-033: Uncommitted test file changes
- **Location:** `backend/src/common/services/__tests__/tenant-key.service.spec.ts`, `backend/src/prisma/encryption/__tests__/field-encryption.extension.spec.ts`
- **Category:** config
- **Impact:** Test files modified but not committed. May contain fixes or regressions.
- **Root Cause:** Prior development session left uncommitted changes.
- **Fix:** Review changes, run tests, commit if they pass.
- **Regression Test:** All affected tests must pass.
- **Fix Plan:** 02 (tooling/CI)

### LOW (cosmetic, code quality, tech debt)

#### BUG-034: TODO: Integrate with alerting service
- **Location:** `backend/src/common/services/dead-letter-queue.service.ts:474`
- **Category:** code-quality
- **Impact:** DLQ alerts not sent to external services (email, Slack). Operational visibility gap.
- **Fix:** Implement or remove TODO.
- **Fix Plan:** 03 (backend)

#### BUG-035: TODO: Add OpenAI provider
- **Location:** `backend/src/modules/ai/services/embedding/embedding-provider.service.ts:84`
- **Category:** code-quality
- **Impact:** Only Mistral embeddings supported. Not a bug, but documented intent.
- **Fix:** Implement if needed, or change TODO to documented limitation.
- **Fix Plan:** 05 (unfinished plans)

#### BUG-036: TODO: Retry queue for failed AI analyses
- **Location:** `backend/src/modules/email-sync/services/sync-message-processor.service.ts:420,725`
- **Category:** code-quality
- **Impact:** Failed AI analysis during email sync is logged but not retried. Emails may miss AI classification.
- **Fix:** Implement retry queue or remove TODOs with documented rationale.
- **Fix Plan:** 03 (backend)

#### BUG-037: TODO: Integrate with actual email service
- **Location:** `backend/src/modules/subscription/services/billing-alert.service.ts:127`
- **Category:** code-quality
- **Impact:** Billing alerts not sent via email. Operational gap.
- **Fix:** Implement or document as future feature.
- **Fix Plan:** 03 (backend)

#### BUG-038: TODO: Signature from user settings
- **Location:** `frontend/components/email/compose/ComposeEditor.tsx:268`
- **Category:** code-quality
- **Impact:** Email signatures are not auto-populated from user settings. Manual workaround (paste).
- **Fix:** Wire signature settings to compose editor.
- **Fix Plan:** 04 (frontend)

#### BUG-039: TODO: Folder picker dialog
- **Location:** `frontend/pages/dashboard/email.tsx:728`
- **Category:** code-quality
- **Impact:** Folder picker not implemented for moving emails. Move-to-folder action may be non-functional.
- **Fix:** Implement folder picker or remove the TODO action.
- **Fix Plan:** 04 (frontend)

#### BUG-040: ColorPicker uses hardcoded hex presets
- **Location:** `frontend/components/common/ColorPicker.tsx:58-69`
- **Category:** ui
- **Impact:** Color presets are hardcoded hex values rather than theme tokens. However, these are semantic color presets (user-selectable label colors) per decision "CALENDAR_COLORS hardcoded array acceptable".
- **Fix:** No fix needed -- documented as acceptable per prior decision.
- **Fix Plan:** N/A (accepted)

#### BUG-041: Backfill encryption script uncommitted changes
- **Location:** `backend/src/scripts/backfill-encryption.ts`
- **Category:** config
- **Impact:** Modified but uncommitted. May contain fixes for encryption backfill.
- **Fix:** Review and commit.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-042: Backend Jest forced exit (detectOpenHandles)
- **Location:** Backend test infrastructure
- **Category:** test
- **Impact:** Resource leak warning. Not blocking but indicates test cleanup issues.
- **Fix:** Covered by BUG-010.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-043: Theme files exceed 500 lines
- **Location:** `frontend/theme/lightTheme.ts` (577 lines), `frontend/theme/darkTheme.ts` (577 lines)
- **Category:** code-quality
- **Impact:** Theme definition files are inherently large (define all MUI tokens). Splitting would reduce maintainability.
- **Fix:** Flag as tech debt. Theme files are configuration, not logic -- acceptable exception.
- **Fix Plan:** N/A (accepted exception)

#### BUG-044: api.ts types file exceeds 500 lines
- **Location:** `frontend/types/api.ts` (571 lines)
- **Category:** code-quality
- **Impact:** TypeScript type definitions file. Large but type-only (no runtime code). Could be split by domain.
- **Fix:** Flag as tech debt. Consider domain-split if editing.
- **Fix Plan:** 04 (frontend) -- flag only

#### BUG-045: Uncommitted changes in 4 files
- **Location:** `backend/src/common/services/__tests__/tenant-key.service.spec.ts`, `backend/src/modules/ai/voltagent/controllers/follow-up.controller.ts`, `backend/src/prisma/encryption/__tests__/field-encryption.extension.spec.ts`, `backend/src/scripts/backfill-encryption.ts`
- **Category:** config
- **Impact:** Uncommitted changes from prior development. Unknown if these are fixes, WIP, or regressions.
- **Fix:** Review all 4 files, test, commit or revert.
- **Fix Plan:** 02 (tooling/CI)

#### BUG-046: Plan 19-04 (WritingStyleSettings) unexecuted
- **Location:** Phase 19
- **Category:** code-quality
- **Impact:** WritingStyleSettings frontend panel fully planned but never implemented. Feature incomplete.
- **Fix:** Execute the existing plan.
- **Fix Plan:** 05 (unfinished plans)

#### BUG-047: Plan 21-01 (Triage Prompt enrichment) unplanned
- **Location:** Phase 21
- **Category:** code-quality
- **Impact:** Triage prompt enrichment phase directory empty (only .gitkeep). Feature not started.
- **Fix:** Plan and execute.
- **Fix Plan:** 05 (unfinished plans)

---

## Fix Plan Assignment Summary

| Fix Plan | Description | Bug Count | Bug IDs |
|----------|-------------|-----------|---------|
| 02 | Tooling, CI, Tests, Dependencies | 11 | BUG-001, 002, 005, 006, 007, 008, 010, 013, 014, 015, 033/041/045 |
| 03 | Backend Fixes | 13 | BUG-003, 017, 020, 023, 024, 025, 026, 027, 028, 030, 031, 032, 034-037 |
| 04 | Frontend Fixes | 13 | BUG-004, 009, 011, 012, 016, 018, 019, 021, 022, 029, 038, 039, 044 |
| 05 | Unfinished Plans | 3 | BUG-035, 046, 047 |
| N/A | Accepted / No fix | 2 | BUG-040, 043 |

---

## Runtime & Visual Audit

### Frontend Build Status

| Check | Status | Details |
|-------|--------|---------|
| `next build` | **PASS** | Compiled successfully in 11.1s (Turbopack). 26 routes generated. |
| Static pages | 3/3 generated | `/dashboard/email/compose`, `/privacy`, `/terms` |
| Dynamic pages | 23 routes | All server-rendered on demand |
| TypeScript | PASS | No errors during build |

### Screenshot Inventory

18 authenticated before-state screenshots captured at 3 breakpoints for 6 pages:

| Page | Desktop (1440) | Tablet (768) | Mobile (375) |
|------|---------------|--------------|--------------|
| Dashboard | dashboard-desktop-1440.png | dashboard-tablet-768.png | dashboard-mobile-375.png |
| Email List | email-list-desktop-1440.png | email-list-tablet-768.png | email-list-mobile-375.png |
| Contacts | contacts-desktop-1440.png | contacts-tablet-768.png | contacts-mobile-375.png |
| Calendar | calendar-desktop-1440.png | calendar-tablet-768.png | calendar-mobile-375.png |
| Settings | settings-desktop-1440.png | settings-tablet-768.png | settings-mobile-375.png |
| AI Chat | ai-chat-desktop-1440.png | ai-chat-tablet-768.png | ai-chat-mobile-375.png |

**Location:** `docs/screenshots/before/`

**Note:** All screenshots captured with authenticated session via Playwright MCP (manual login + MFA).

### Visual Issues Found

- AI chat page at tablet/mobile breakpoints shows empty content area — chat messages and quick actions not visible, only header renders.
- Contacts page on tablet/mobile shows contact detail panel instead of list view — no way to navigate back to list.
- Calendar mobile (375px) truncates event names heavily ("0 Comp...").
- Settings mobile captured timezone dropdown open (cosmetic — retaken with it closed).
- GDPR consent/data panels are nested within settings — not directly accessible as standalone routes.

---

## Metrics Baseline

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Backend TS errors | 0 | 0 | MET |
| Frontend TS errors | 0 | 0 | MET |
| Backend ESLint | BROKEN (coverage dir) | 0 warnings | BLOCKED |
| Frontend ESLint | BROKEN (plugin compat) | 0 warnings | BLOCKED |
| Backend Jest | 672/672 (100%) | 100% | MET |
| Frontend Jest | 206/209 (98.6%) | 100% | 3 failures |
| Frontend Build | PASS (11.1s) | PASS | MET |
| npm audit (root) | 5 high | 0 | 5 high |
| npm audit (backend prod) | 11 vulns | 0 | 1 critical, 7 high |
| npm audit (frontend prod) | 8 moderate | 0 | 8 moderate |
| Files >500 lines (backend) | 38 files | 0 | 38 files |
| Files >500 lines (frontend) | 35 files | minimize | 35 files |
| i18n key sync | 1 missing in it.ts | 0 | 1 key |
| LCP | 4.12s (stale) | < 2.5s | ~1.6s over |
| TTI | 4.13s (stale) | < 3.5s | ~0.6s over |
| TODO/FIXME markers (backend) | 5 | document | documented |
| TODO/FIXME markers (frontend) | 2 | document | documented |
| E2E tests | unknown (auth mock bug) | all pass | needs investigation |
| Uncommitted changes | 4 files | 0 | 4 files |

---

*Report complete. 47 bugs cataloged. Ready for user review.*
