# Sprint 14 — Checkpoint

## Stato
- **Sprint:** 14 — AI Governance & Phase 2 Wrap-up
- **Last Task Completed:** T-1410 — Integration test suite Phase 2
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 16/16
- **Last Updated:** 2026-03-30 16:05

## Last Modified Files
- backend/prisma/schema.prisma (PredictionType enum, DriftCheck model, closedAt index)
- backend/src/modules/crm/governance/governance.service.ts (overview, accuracy, costs, trend)
- backend/src/modules/crm/governance/governance.controller.ts (all endpoints)
- backend/src/modules/crm/governance/governance.module.ts (3 providers)
- backend/src/modules/crm/governance/dto/governance.dto.ts
- backend/src/modules/crm/governance/drift-detection.service.ts (PSI calculation)
- backend/src/modules/crm/governance/model-retrain.service.ts (BullMQ retrain)
- backend/src/modules/crm/crm.module.ts (GovernanceModule registered)
- backend/src/modules/ai/services/ai-run-ledger.service.ts (predictionType auto-populate)
- backend/src/modules/crm/lead-scoring/firmographic-feature.service.ts (tenantId fix)
- backend/src/modules/crm/nba/nba.service.ts (status transition validation)
- backend/src/common/config/queue.config.ts (CRM_MODEL_RETRAIN queue)
- backend/src/modules/crm/__tests__/phase-2-integration.test.ts (8 tests)
- frontend/pages/dashboard/crm/ai-governance.tsx (page)
- frontend/components/dashboard/crm-governance/GovernanceDashboard.tsx (main)
- frontend/components/dashboard/crm-governance/AccuracyTab.tsx (recharts)
- frontend/components/dashboard/crm-governance/CostsTab.tsx (table + bar chart)
- frontend/components/dashboard/crm-governance/DriftTab.tsx (PSI table)
- frontend/components/dashboard/crm-governance/ModelsTab.tsx (registry + retrain)
- frontend/lib/api/crm-governance.ts (API module)
- frontend/hooks/queries/use-crm-governance.ts (TanStack Query hooks)
- frontend/hooks/queries/crm-governance-keys.ts (query keys)
- frontend/components/layout/Sidebar.tsx (nav entry)
- frontend/locales/en.ts, it.ts, index.ts (governance translations)

## Key Decisions Made
- Used Recharts (already installed) instead of MUI X Charts (not installed)
- PredictionType enum auto-populated from runType mapping in ledger service
- Drift detection uses PSI with 10 equal-width bins and Laplace smoothing
- PSI thresholds: <0.1 stable, 0.1-0.2 warning, >0.2 critical
- Model registry shows known types even without evaluations (defaults to rule-based)
- BullMQ queue for retrain jobs (fire-and-forget, worker to be implemented when ML pipeline exists)

## Patterns Established
- GovernanceModule pattern: service + controller + drift + retrain in single module
- Frontend governance tabs: each tab is a separate component with own data fetching
- Cost aggregation uses predictionType with legacy runType fallback for pre-Sprint 14 data

## Bug Fixes Applied (T-1408)
- firmographic-feature.service.ts: findUnique → findFirst with tenantId (defense-in-depth)
- nba.service.ts: Status transition validation (DISMISSED/EXECUTED are terminal)

## Performance Fixes Applied (T-1409)
- Added @@index([tenantId, closedAt]) on CrmDeal for forecast queries
- Parallelized all 4 queries in GovernanceService.getOverview() (3 round trips → 1)

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Integration tests: ✅ 8/8 passing
- Circular deps: ✅ zero

## Production Validation (2026-03-30)
- Railway `/health`: ✅ 200 — DB, Redis, Mistral up
- `GET /crm/governance/overview`: ✅ 401 (route registered, auth guard active)
- `GET /crm/governance/accuracy`: ✅ 401 (route registered)
- `GET /crm/governance/costs`: ✅ 401 (route registered)
- `GET /crm/governance/drift`: ✅ 401 (route registered)
- `GET /crm/governance/models`: ✅ 401 (route registered)
- Vercel `/dashboard/crm/ai-governance`: ✅ 307 (auth redirect, page exists)
