# Sprint 06 — Checkpoint

## Status

- **Sprint:** 06 — Microsoft Calendar+Contacts Provider Hardening
- **Last Task Completed:** T-0605 — Microsoft folder cache tenant isolation
- **Next Task:** Sprint 07 (Calendar Frontend Gap Closure)
- **Tasks Done:** 5/5
- **SP Completed:** 14/14
- **Last Updated:** 2026-03-31 14:30

## Audit Findings Addressed

- CAL-C3: Microsoft delta query error handling — ✅ typed MicrosoftSyncError + abstract service handler
- CON-H4: Folder cache tenant isolation — ✅ verified (TRANSIENT scope + Redis key has tenantId) + hardened queries
- CAL-H3: DST/timezone edge cases — ✅ Windows alias expansion (15→46) + DST tests + round-trip verification

## Last Modified Files

- backend/src/modules/providers/errors/microsoft-provider.error.ts (NEW — typed error hierarchy)
- backend/src/modules/providers/errors/index.ts (added Microsoft exports)
- backend/src/modules/providers/services/microsoft-oauth.service.ts (typed errors in refreshAccessToken)
- backend/src/modules/email-sync/services/provider-token.service.ts (typed Microsoft error handling)
- backend/src/modules/calendar/services/microsoft-calendar-sync.service.ts (MicrosoftSyncError on 410)
- backend/src/modules/calendar/services/abstract-calendar-sync.service.ts (typed sync error handling)
- backend/src/modules/contacts/services/microsoft-contacts-webhook.service.ts (checkWebhookSilenceAndPoll)
- backend/src/modules/contacts/controllers/contacts-webhook.controller.ts (fallback-poll endpoint)
- backend/src/modules/calendar/utils/calendar-timezone.util.ts (46 Windows aliases)
- backend/src/modules/calendar/services/__tests__/calendar-timezone.util.spec.ts (DST edge case tests)
- backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts (tenantId in queries)

## Key Decisions Made

- MicrosoftProviderError hierarchy mirrors Google pattern from S05 (same base structure)
- refreshAccessToken throws typed errors; getProviderWithTokens propagates them
- Contacts sync uses full fetch (no delta), so 410 handling only applies to calendar
- Webhook fallback polling uses 30-min silence threshold, exposed as authenticated endpoint
- Windows timezone aliases expanded to cover all major MS Graph return values
- Folder cache in MicrosoftDriver is inherently tenant-isolated via Scope.TRANSIENT

## Blockers / Notes

- Jest test suite blocked by DB seed error (unrelated to sprint changes)
- Pre-existing TS error in routing-rule.service.ts fixed as part of T-0601 commit

## Validation Status

- Backend tsc: ✅ passing
- DST timezone tests: ✅ verified via tsx (all assertions pass)
