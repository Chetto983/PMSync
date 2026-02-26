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

## BUG-028: MFA controller TenantGuard review

**Status:** Reviewed. MFA controller already has TenantGuard. No change needed.

## BUG-030: Auth endpoints (logout, refresh) TenantGuard review

**Status:** Reviewed. Auth endpoints are user-scoped operations. TenantGuard not required -- confirmed intentional.
