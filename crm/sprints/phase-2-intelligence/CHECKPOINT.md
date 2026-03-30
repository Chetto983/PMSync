# Sprint 12 — Checkpoint

## Stato

- **Sprint:** 12 — Churn Prediction
- **Last Task Completed:** T-1210 — Type-check validation + circular dep fix
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 16/16
- **Last Updated:** 2026-03-30 10:35

## Last Modified Files

- backend/prisma/schema.prisma (ChurnSignal model, relations on Tenant/Contact/CrmAccount)
- backend/src/modules/crm/churn/churn-features.types.ts (new — shared ChurnFeatures interface)
- backend/src/modules/crm/churn/churn-feature.service.ts (new — feature extraction)
- backend/src/modules/crm/churn/churn-email-metrics.ts (new — email decay + meeting drop helpers)
- backend/src/modules/crm/churn/churn-assessment.service.ts (new — LLM-based churn assessment)
- backend/src/modules/crm/churn/churn.controller.ts (new — REST endpoints)
- backend/src/modules/crm/churn/churn.module.ts (new — module wiring)
- backend/src/modules/crm/churn/churn-recompute.cron.ts (new — weekly cron)
- backend/src/modules/crm/churn/dto/churn.dto.ts (new — query DTOs)
- backend/src/modules/crm/crm.module.ts (ChurnModule added)
- frontend/lib/api/crm-churn.ts (new — API module)
- frontend/hooks/queries/crm-churn-keys.ts (new — query keys)
- frontend/hooks/queries/use-crm-churn.ts (new — query hooks)
- frontend/hooks/queries/index.ts (churn exports)
- frontend/components/dashboard/crm-churn/ChurnWarningsList.tsx (new — list page)
- frontend/components/dashboard/crm-churn/ChurnRiskBadge.tsx (new — badge component)
- frontend/components/dashboard/crm-churn/SignalBreakdown.tsx (new — bar chart)
- frontend/pages/dashboard/crm/churn.tsx (new — page wrapper)
- frontend/components/dashboard/crm-accounts/AccountDetail.tsx (ChurnRiskBadge added)
- frontend/components/contacts/ContactDetail.tsx (ChurnRiskBadge added)
- frontend/locales/en.ts (churn translations)
- frontend/locales/it.ts (churn translations)
- frontend/locales/index.ts (churn type definitions)

## Key Decisions Made

- T-1204: Used LLM (Mistral via MistralService.completePrompt) instead of ml.js logistic regression — user preference, simpler stack
- T-1204: Added heuristic fallback when LLM unavailable — rule-based scoring with same signal factors
- T-1202: Email decay compares 30d vs 31-90d response time windows, meeting drop compares current vs previous quarter
- T-1208: Used Recharts horizontal bar chart (already installed) instead of radar chart — clearer for signal comparison
- T-1209: Used @Cron decorator (Sunday 03:00 UTC) instead of BullMQ — simpler for weekly job, same pattern as forecast cron
- T-1210: Extracted ChurnFeatures interface into churn-features.types.ts to break circular dependency

## Patterns Established

- Churn module at `backend/src/modules/crm/churn/`
- Churn API module: `frontend/lib/api/crm-churn.ts`
- Churn components: `frontend/components/dashboard/crm-churn/`
- Churn page: `frontend/pages/dashboard/crm/churn.tsx`
- LLM assessment pattern: system prompt + structured JSON response + heuristic fallback
- Shared types in `*-types.ts` files to avoid circular deps between service and helper
- ChurnRiskBadge: reusable component with contactId/accountId prop, auto-fetches signal

## Blockers / Notes

- Support ticket trend feature (T-1203) skipped — no support ticket model exists in schema
- ChurnRiskBadge only shows for probability >= 0.3 (avoid noise for low-risk contacts)
- Pre-existing type error in TriageToolUI.tsx (toolCallId missing) — unrelated to Sprint 12

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing TriageToolUI error only)
- Circular deps: ✅ zero
- Prisma generate: ✅ done
- DB push: ✅ schema synced to Railway
- Railway /health: ✅ 200 (DB, Redis, Mistral up)
- Railway /crm/churn/at-risk: ✅ 401 (route registered, auth guard active)
- Railway /crm/churn/contact/test: ✅ 401 (route registered)
- Vercel /dashboard/crm/churn: ✅ 307 (auth redirect, page exists)
