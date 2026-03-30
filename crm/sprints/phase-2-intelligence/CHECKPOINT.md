# Sprint 11 — Checkpoint

## Stato

- **Sprint:** 11 — Revenue Forecasting
- **Last Task Completed:** T-1110 — Type-check validation
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 17/17
- **Last Updated:** 2026-03-30 14:30

## Last Modified Files

- backend/prisma/schema.prisma (ForecastSnapshot model, CrmPipeline relation)
- backend/src/modules/crm/forecasting/deal-aggregation.service.ts (new)
- backend/src/modules/crm/forecasting/time-series.engine.ts (new)
- backend/src/modules/crm/forecasting/forecast.service.ts (new)
- backend/src/modules/crm/forecasting/forecast.controller.ts (new)
- backend/src/modules/crm/forecasting/forecast-refresh.cron.ts (new)
- backend/src/modules/crm/forecasting/forecasting.module.ts (new)
- backend/src/modules/crm/forecasting/dto/forecast.dto.ts (new)
- backend/src/modules/crm/crm.module.ts (ForecastingModule added)
- frontend/lib/api/crm-forecast.ts (new)
- frontend/hooks/queries/crm-forecast-keys.ts (new)
- frontend/hooks/queries/use-crm-forecast.ts (new)
- frontend/hooks/queries/index.ts (exports)
- frontend/components/dashboard/crm-forecast/ForecastChart.tsx (new)
- frontend/components/dashboard/crm-forecast/ForecastDashboard.tsx (new)
- frontend/components/dashboard/crm-forecast/ForecastVsActuals.tsx (new)
- frontend/pages/dashboard/crm/forecast.tsx (new)
- frontend/locales/en.ts (forecast translations)
- frontend/locales/it.ts (forecast translations)
- frontend/locales/index.ts (forecast type definitions)

## Key Decisions Made

- T-1101: ForecastSnapshot uses Decimal(15,2) for all revenue fields, period as string ('month'|'quarter')
- T-1103: Pure TypeScript time series engine — no Python/ML deps. Moving average (window=3), OLS linear trend, additive seasonal decomposition. Confidence bands use residual std x z-score x sqrt(1+horizon)
- T-1104: Forecast API at /crm/forecast, not nested under pipelines. Controller injects PrismaService directly for default pipeline lookup
- T-1105: Used Recharts (already installed) instead of MUI X Charts. Area chart with p20/p80 confidence band, dashed forecast line, reference line at boundary
- T-1107: Used @Cron decorator instead of BullMQ queue — simpler for a weekly job with no retry/backpressure needs
- T-1108: MAPE stored on ForecastSnapshot, accuracy endpoint returns historical snapshots + avg MAPE

## Patterns Established

- Forecasting module at `backend/src/modules/crm/forecasting/`
- Forecast API module: `frontend/lib/api/crm-forecast.ts`
- Forecast components: `frontend/components/dashboard/crm-forecast/`
- Forecast page: `frontend/pages/dashboard/crm/forecast.tsx`
- Cron service pattern: `@Cron('0 2 * * 0')` for weekly jobs (Sunday 02:00 UTC)
- Time series engine is a pure function module (no DI), testable in isolation

## Blockers / Notes

- Forecast accuracy will only populate once periods close (no historical backfill)
- Sprint 11 used Recharts for charts instead of MUI X Charts as specified — Recharts was already installed and used in Sprint 08

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
- Prisma generate: ✅ done
- DB push: ✅ schema synced to Railway
