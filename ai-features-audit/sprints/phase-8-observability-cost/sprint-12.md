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

### T-1203: Add proactive cost alerting per tenant [3 SP]
- [ ] Read `ai-analytics.service.ts` — locate burn rate calculation
- [ ] Add threshold check: when tenant reaches 80% of monthly AI quota, create alert
- [ ] Send notification via existing alert infrastructure (Socket.IO or email)
- [ ] Add `AI_COST_ALERT_THRESHOLD` env var (default 0.8)
- [ ] Addresses: **OBS-M1**

### T-1204: Expose embedding queue metrics in health endpoint [2 SP]
- [ ] Read `email-embedding.queue.ts` and `contact-embedding.queue.ts`
- [ ] Add queue depth, DLQ size, processing rate to `/ai/health/detailed`
- [ ] Add alert threshold: DLQ > 100 items = degraded health
- [ ] Addresses: **OBS-M2**

### T-1205: Surface circuit breaker state to frontend [2 SP]
- [ ] Read `ai-circuit-breaker.ts` — trace state management
- [ ] Add circuit breaker state to `/ai/health` response (open/closed/half-open)
- [ ] Frontend: when circuit is open, show banner "AI features temporarily unavailable"
- [ ] Disable AI action buttons when circuit is open (prevent wasted requests)
- [ ] Addresses: **OBS-M3**

### T-1206: Add time-series granularity toggle to analytics [1 SP]
- [ ] Read `ai-analytics.service.ts` — locate time-series query
- [ ] Add `granularity` param: hourly, daily, weekly (default: daily)
- [ ] Update `AiAnalyticsQueryDto` with new field
- [ ] Addresses: **OBS-L1**

---

## Dependencies

- None (observability can be hardened independently)

## Risks

1. **T-1203** — Alert spam if tenant hovers near threshold. Add cooldown (max 1 alert per 24h per tenant).
2. **T-1205** — Circuit breaker state on frontend must not leak internal architecture. Use generic "degraded" status.

## Definition of Done

- [ ] Ledger writes retry once on failure — no silent data loss
- [ ] Public health endpoint returns minimal info only
- [ ] Cost alerts fire at 80% quota threshold (configurable)
- [ ] Embedding queue metrics visible in detailed health
- [ ] Circuit breaker state surfaced — frontend shows degraded mode
- [ ] Analytics supports hourly/daily/weekly granularity
- [ ] `npx tsc --noEmit` passes on both backend and frontend
