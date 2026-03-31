# Sprint 05 — Email Analysis, Triage & Semaphore

| Campo | Valore |
|-------|--------|
| **Phase** | 3 — Email Intelligence |
| **Sprint** | 05 |
| **SP** | 15 |
| **Objective** | Fix triage semaphore deadlock, add tenant isolation to follow-up detection, add briefing timeout, limit triage backfill lookback |
| **Addresses** | EI-C1, EI-H1, EI-H2, EI-H3 |

---

## Sprint Backlog

### T-0501: Fix triage distributed semaphore deadlock risk [4 SP]
- [ ] Read `email-triage.service.ts` — locate Redis Lua semaphore logic
- [ ] Add TTL to semaphore slots (configurable, default 5 min)
- [ ] Add health check: detect stale slots and auto-release after TTL
- [ ] Add monitoring: log semaphore utilization to metrics
- [ ] Write test: simulate worker crash mid-lock, verify slot released after TTL
- [ ] Addresses: **EI-C1**

### T-0502: Add per-tenant isolation to follow-up detection batch [3 SP]
- [ ] Read `follow-up-detection.service.ts` — trace batch processing
- [ ] Partition batch by tenantId — process each tenant's emails separately
- [ ] Add per-tenant concurrency limit (max 1 concurrent detection per tenant)
- [ ] Prevent one tenant's email volume from starving others
- [ ] Addresses: **EI-H1**

### T-0503: Add token budget + timeout to briefing service [3 SP]
- [ ] Read `briefing.service.ts` — trace prompt assembly
- [ ] Add max input token budget (configurable, default 4000 tokens)
- [ ] Truncate or summarize sections that exceed budget allocation
- [ ] Add LLM call timeout (configurable, default 60s)
- [ ] Addresses: **EI-H2**

### T-0504: Add max-age lookback window to triage backfill [3 SP]
- [ ] Read `triage-backfill-scheduler.service.ts` — trace email selection query
- [ ] Add `TRIAGE_BACKFILL_MAX_AGE_DAYS` env var (default 7)
- [ ] Filter: only process emails received within lookback window
- [ ] Log skipped count for monitoring
- [ ] Addresses: **EI-H3**

### T-0505: Verify triage cost controls are enforced [2 SP]
- [ ] Read triage service — verify 20 emails/batch, 24h window limits
- [ ] Write test: attempt to triage 25 emails, verify batch capped at 20
- [ ] Verify cost check runs before LLM call, not after

---

## Dependencies

- None

## Risks

1. **T-0501** — TTL too short could release active slots. 5 min should be safe for any triage batch.
2. **T-0503** — Token budget may truncate important sections. Use priority ordering: urgent > deadlines > follow-ups > trends.

## Definition of Done

- [ ] Triage semaphore auto-releases stale slots after TTL
- [ ] Follow-up detection processes tenants independently
- [ ] Briefing service respects token budget and timeout
- [ ] Triage backfill limited to last 7 days by default
- [ ] Cost controls verified with tests
- [ ] `npx tsc --noEmit` passes on backend
