# Deferred Items - Phase 22 Bug Audit

## BUG-017: Backend file size violations (38 files > 500 lines)

**Decision:** Flag only. Splitting working files purely for compliance is high regression risk. Files should be split when they need other changes (natural refactoring opportunity).

**Top offenders:**
- email-sync-back.service.ts (1,429 lines)
- auth.service.ts (1,220 lines)
- emails.controller.ts (1,183 lines)
- email.tools.ts (1,112 lines)
- voltagent.service.ts (1,091 lines)

## BUG-034: DLQ alerting integration (dead-letter-queue.service.ts:474)

**Status:** Converted from TODO to DEBT comment with tracking reference.
**When to fix:** When alerting infrastructure (Slack/PagerDuty/email) is set up.

## BUG-036: Retry queue for failed AI analyses (sync-message-processor.service.ts)

**Status:** Converted from TODO to DEBT comment with tracking reference.
**Rationale:** Current fire-and-forget is intentional -- AI features should not block sync. Retry queue adds complexity without clear benefit.

## BUG-037: Billing alert email integration (billing-alert.service.ts:127)

**Status:** Converted from TODO to DEBT comment with tracking reference.
**When to fix:** When transactional email service is implemented.

## BUG-011: LCP exceeds budget (4.12s vs 2.5s target)

**Status:** Deferred. Requires dedicated performance optimization pass (bundle analysis, lazy loading, code splitting, image optimization).
**When to fix:** Next optimization phase or dedicated perf sprint.

## BUG-012: TTI exceeds budget (4.13s vs 3.5s target)

**Status:** Deferred. Related to BUG-011 -- same root causes (heavy JS hydration, large bundle).
**When to fix:** Same as BUG-011.

## BUG-018: Frontend file size violations (35 files > 500 lines)

**Decision:** Flag only, same as BUG-017 for backend. Files should be split during natural refactoring opportunities.

**Top offenders:**
- lib/api/ai.ts (1,495 lines)
- prompt-input.tsx (1,263 lines)
- Calendar.tsx (1,180 lines)
- Contacts.tsx (1,021 lines)
- email.tsx (1,012 lines)

## BUG-029: en.ts/it.ts locale files exceed 500 lines (3,500+ lines each)

**Decision:** Flag only. Could namespace-split into locales/en/*.ts modules but high refactoring risk and all translation type safety relies on the single export.

## BUG-038: Signature from user settings (ComposeEditor.tsx)

**Status:** Converted from TODO to DEBT comment with tracking reference.
**When to fix:** When signature settings editor is implemented and wired.

## BUG-039: Folder picker dialog (email.tsx)

**Status:** Converted from TODO to DEBT comment with tracking reference.
**When to fix:** When move-to-folder UI is prioritized.

## BUG-044: api.ts types file exceeds 500 lines (571 lines)

**Decision:** Flag only. Type-only file with no runtime code. Could be domain-split when editing.

## ESLint: 10 errors in ai-elements (React compiler rules)

**Status:** Pre-existing. All 10 errors are React compiler (react-hooks/static-components) warnings in the ai-elements external component directory. These patterns work at runtime but are flagged by the stricter React compiler analysis.
**Files:** commit.tsx, inline-citation.tsx, persona.tsx, prompt-input.tsx, reasoning.tsx, shimmer.tsx.

## BUG-028: MFA controller TenantGuard review

**Status:** Reviewed. MFA controller already has TenantGuard. No change needed.

## BUG-030: Auth endpoints (logout, refresh) TenantGuard review

**Status:** Reviewed. Auth endpoints are user-scoped operations. TenantGuard not required -- confirmed intentional.
