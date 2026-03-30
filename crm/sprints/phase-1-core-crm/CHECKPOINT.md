# Sprint 08 — Checkpoint

## Stato
- **Sprint:** 08 — Pipeline Dashboard & Alpha
- **Last Task Completed:** T-0811 — Alpha smoke testing
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 9/9 (T-0806/T-0807 moved to S07.1)
- **SP Completed:** 18/18
- **Last Updated:** 2026-03-26 18:10

## Last Modified Files
- backend/src/modules/crm/pipeline/services/pipeline.service.ts (metrics + saved views)
- backend/src/modules/crm/pipeline/controllers/pipeline.controller.ts (metrics + saved views endpoints)
- backend/src/modules/crm/pipeline/dto/saved-view.dto.ts (new)
- backend/src/modules/crm/scoring/deal-scoring.service.ts (scoring engine)
- backend/src/modules/crm/scoring/scoring.module.ts (new)
- backend/src/modules/crm/deal/services/deal.service.ts (score integration)
- backend/src/modules/crm/custom-fields/custom-fields.module.ts (PrismaModule fix)
- backend/prisma/schema.prisma (CrmSavedView model, deal score field)
- frontend/lib/api/crm-pipelines.ts (metrics + saved view types/API)
- frontend/hooks/queries/use-crm-pipelines.ts (metrics + saved view hooks)
- frontend/hooks/queries/crm-pipelines-keys.ts (metrics + views keys)
- frontend/components/dashboard/crm-pipelines/PipelineDashboard.tsx (new)
- frontend/components/dashboard/crm-pipelines/PipelineDashboardCharts.tsx (new)
- frontend/components/dashboard/crm-deals/DealScoreBadge.tsx (new)
- frontend/components/dashboard/crm-deals/SavedViewsPanel.tsx (new)
- frontend/components/dashboard/crm-deals/DealsList.tsx (score column + saved views)
- frontend/components/dashboard/crm-deals/DealCard.tsx (score badge)
- frontend/components/dashboard/crm-deals/DealDetail.tsx (score badge)
- frontend/pages/dashboard/crm/pipelines/[id]/dashboard.tsx (new)
- frontend/locales/en.ts (dashboard, score, saved views translations)
- frontend/locales/it.ts (dashboard, score, saved views translations)
- frontend/locales/index.ts (type definitions)

## Key Decisions Made
- T-0801: Dashboard page uses dynamic import with ErrorBoundary wrapper
- T-0802: Metrics calculated from deal data in PipelineService (no caching yet)
- T-0803: Recharts v3.7 — ConversionFunnelChart (bar), DealsByStageChart (donut), WinRateGauge (half-donut)
- T-0804: 10 scoring rules, 0-100 scale, fire-and-forget recalculation pattern
- T-0808: SavedViews stored as JSON filters per pipeline, UI as Chip row in DealsList
- T-0809: Already implemented in S05 (Kanban/List toggle in DealsList)
- T-0810: Found and fixed missing tenantId on deleteStage deal count check
- T-0811: Found and fixed missing PrismaModule import in CustomFieldsModule

## Patterns Established
- Fire-and-forget scoring: `this.rescoreDeal(id)` calls scoreDeal().catch() — non-blocking
- Dashboard charts: Recharts components in separate file from metrics cards
- DealScoreBadge: Shared component with getScoreColor (>=70 success, >=40 warning, default)
- SavedViewsPanel: Chip-based view selector with save/delete dialogs

## Blockers / Notes
- Pipeline service is 525 lines (slightly over 500 limit) — consider extracting saved views to own service
- Railway deployment of saved views endpoints (T-0808) may need verification after next deploy cycle
- Swagger is disabled in production — cannot verify routes via docs endpoint

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
- CRM module wiring: ✅ all 8 submodules correctly wired
- Railway health: ✅ 200 (DB, Redis, Mistral up)
- Railway CRM endpoints: ✅ pipelines/deals/accounts/products/custom-fields all 401

## Production Validation (2026-03-30)
- Railway `/health`: ✅ 200 — DB, Redis, Mistral up
- `GET /crm/pipelines`: ✅ 401 (route registered, auth guard active)
- `GET /crm/pipelines/:id/metrics`: ✅ 401 (Sprint 08 metrics endpoint live)
- `GET /crm/pipelines/:id/views`: ✅ 401 (Sprint 08 saved views endpoint live)
- `GET /crm/deals`: ✅ 401 (route registered)
- `PATCH /crm/deals/:id/stage`: ✅ 403 (route registered, guard active)
- Vercel `/dashboard/crm/pipelines`: ✅ 307 (auth redirect, page exists)
- Vercel `/dashboard/crm/deals`: ✅ 307 (auth redirect, page exists)
- Browser (Edge CDP): ✅ Pipeline list renders with 2 pipelines (Sales, Partner)
- Browser (Edge CDP): ✅ Pipeline Dashboard renders with Recharts charts (conversion funnel, deals by stage donut, win rate gauge)
- Browser (Edge CDP): ✅ Deals list renders ("Trattative") with 11 deals, stage chips, pipeline filter
- Browser (Edge CDP): ✅ Accounts page renders with 6 accounts, industry chips, search, export
- Mobile (375x812): ✅ All pages stack correctly, no horizontal overflow
- Screenshots: `scripts/screenshots/sprint08_*.png`
