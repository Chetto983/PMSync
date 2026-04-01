# Sprint 12 — Ledger, Analytics & Health Endpoints

| Campo | Valore |
|-------|--------|
| **Phase** | 8 — Observability & Cost |
| **Sprint** | 12 |
| **SP** | 12 |
| **Objective** | Add retry to ledger writes, secure health endpoint, add cost alerting, expose queue metrics, surface circuit breaker state |
| **Addresses** | OBS-H1, OBS-H2, OBS-M1, OBS-M2, OBS-M3, OBS-L1 |

---

## Sprint Backlog

### T-1201: Add retry logic to AiRunLedger writes [2 SP] ✅ DONE
- [x] Read `ai-run-ledger.service.ts` — trace `recordRun()` fire-and-forget
- [x] Add 1 retry with 500ms delay on DB write failure
- [x] On final failure: log error (don't lose telemetry silently)
- [x] Keep fire-and-forget pattern — don't block requests
- [x] Addresses: **OBS-H1**

### T-1202: Secure AI health endpoint — minimize public exposure [2 SP] ✅ DONE (already addressed)
- [x] Read `ai-health.controller.ts` — audit `/ai/health` vs `/ai/health/detailed`
- [x] Public `/ai/health`: return only `{ status: 'ok' | 'degraded' }` — no internal details (already minimal)
- [x] Auth-gated `/ai/health/detailed`: keep circuit breaker state, failure counts (already `@Roles('admin')`)
- [x] Addresses: **OBS-H2** — no code change needed, already properly secured

### T-1203: Add proactive cost alerting per tenant [3 SP] ✅ DONE
- [x] Read `ai-analytics.service.ts` — locate burn rate calculation
- [x] Add threshold check: when tenant reaches 80% of monthly AI quota, create alert
- [x] Send notification via existing alert infrastructure (Socket.IO `ai:cost:alert` event)
- [x] Add `AI_COST_ALERT_THRESHOLD` env var (default 0.8) + 24h Redis cooldown
- [x] Addresses: **OBS-M1**

### T-1204: Expose embedding queue metrics in health endpoint [2 SP] ✅ DONE
- [x] Read `email-embedding.queue.ts` and `contact-embedding.queue.ts`
- [x] Add queue depth (waiting/active/failed) to `/ai/health/detailed` via `getQueueStats()`
- [x] Add alert threshold: DLQ > 100 items = degraded health
- [x] Addresses: **OBS-M2**

### T-1205: Surface circuit breaker state to frontend [2 SP] ✅ DONE
- [x] Read `ai-health.controller.ts` — public endpoint already returns degraded status
- [x] Frontend: useAiHealth() polls /ai/health every 30s
- [x] AiDegradedBanner shows warning when degraded/unhealthy, auto-hides on recovery
- [x] Wired into Layout.tsx above page content
- [x] Addresses: **OBS-M3**

### T-1206: Add time-series granularity toggle to analytics [1 SP] ✅ DONE
- [x] Read `ai-analytics.service.ts` — locate time-series query
- [x] Add `granularity` param: hourly, daily, weekly (default: daily)
- [x] Update `AiAnalyticsQueryDto` with new field + IsIn validator
- [x] Addresses: **OBS-L1**

---

## Dependencies

- None (observability can be hardened independently)

## Risks

1. **T-1203** — Alert spam if tenant hovers near threshold. Add cooldown (max 1 alert per 24h per tenant).
2. **T-1205** — Circuit breaker state on frontend must not leak internal architecture. Use generic "degraded" status.

## Definition of Done

- [x] Ledger writes retry once on failure — no silent data loss
- [x] Public health endpoint returns minimal info only
- [x] Cost alerts fire at 80% quota threshold (configurable)
- [x] Embedding queue metrics visible in detailed health
- [x] Circuit breaker state surfaced — frontend shows degraded mode
- [x] Analytics supports hourly/daily/weekly granularity
- [x] `npx tsc --noEmit` passes on both backend and frontend
