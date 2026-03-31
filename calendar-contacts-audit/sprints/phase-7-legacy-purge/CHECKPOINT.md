# Sprint 12 — Checkpoint

## Status

- **Sprint:** 12 — Remove ALL Legacy Code
- **Last Task Completed:** T-1207 — Remove legacy calendar/contacts code superseded by CRM
- **Next Task:** Sprint 13 (E2E Production Validation)
- **Tasks Done:** 7/7
- **SP Completed:** 14/14
- **Last Updated:** 2026-03-31 13:30

## Audit Findings Addressed

- LEG-C1: GraphExpansionService deprecated — ✅ deleted, fallback removed
- LEG-C2: ConversationMessage.content deprecated — ✅ already removed in prior commit
- LEG-H1: Hand-rolled Prometheus metrics — ✅ removed (HealthService + QueueHealthService)
- LEG-H2: multiAgentApi shim — ✅ already removed in prior cleanup
- LEG-H3: hashForSearch deprecated — ✅ removed, tests cleaned
- LEG-H4: checkQuota always-true stub — ✅ removed
- LEG-H5: emitUnreadCountUpdate never called — ✅ removed
- LEG-H6: Header dead theme toggle props — ✅ removed
- LEG-M1: Stale @deprecated aliases (starredEmailsOptions, useStarredEmails) — ✅ removed
- LEG-M2: AI DTO stale comments — ✅ removed
- LEG-M3: Calendar/contacts dead exports — ✅ verified none exist (all actively used)

## Last Modified Files

- backend/src/modules/ai-chat/services/graph-expansion.service.ts (deleted)
- backend/src/modules/ai-chat/tools/rag-tools.service.ts (removed fallback + GraphExpansionService dep)
- backend/src/modules/ai-chat/ai-chat.module.ts (removed GraphExpansionService provider)
- backend/src/modules/health/controllers/health.controller.ts (removed GET /health/metrics)
- backend/src/modules/health/services/health.service.ts (removed getPrometheusMetrics ~230 lines)
- backend/src/common/services/queue-health.service.ts (removed exportPrometheusText)
- backend/src/prisma/encryption/field-encryption.utils.ts (removed hashForSearch)
- backend/src/modules/subscription/services/usage-tracking.service.ts (removed checkQuota)
- backend/src/modules/realtime/services/realtime-events.service.ts (removed emitUnreadCountUpdate)
- backend/src/modules/ai/dto/ai.dto.ts (removed stale comments)
- frontend/components/layout/Header.tsx (removed dead theme toggle props)
- frontend/hooks/queries/use-dashboard.ts (removed starredEmailsOptions, useStarredEmails aliases)
- frontend/lib/api/ai.ts (ConversationMessage.content already removed)

## Key Decisions Made

- Session.tenantId left in Prisma schema (nullable field with Tenant relation) — auto-generated TS type cannot be selectively removed; field already excluded from TENANT_SCOPED_MODELS
- importantEmailsOptions/useImportantEmails kept — still actively used by AiTriageWidget
- QueueHealthService kept (only exportPrometheusText removed) — getHealthStatus, getQueueStatus still active
- VoltAgent/GraphExpansion mentions in comments kept — historical context explaining why things were removed

## Blockers / Notes

- None

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing PortalKBBrowse.tsx error from other session)
- madge --circular: ✅ zero circular deps
- grep @deprecated backend/src/ frontend/: ✅ zero results
- grep multiAgentApi frontend/: ✅ zero results
- grep GraphExpansion backend/: ✅ 1 comment only (in replacement service)
