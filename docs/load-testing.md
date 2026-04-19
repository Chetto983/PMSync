# Load Testing Runbook — SCALE-04

**Purpose:** Drive PMSync's backend under realistic HTTP + Socket.IO + AI-chat load to verify the SCALE-06 acceptance gate (p95 < 500 ms, RAM < 3 GB per replica at 1000 users for 15 minutes).

**Tool:** [Artillery v2.0.30+](https://artillery.io/) — chosen over k6 because Artillery speaks Socket.IO natively and k6 does not.

## Acceptance Gate

| Metric | Target | Measured By |
|---|---|---|
| HTTP p95 latency | < 500 ms | Artillery `ensure: p95: 500` (native gate, exits non-zero on breach) |
| Error rate | < 1% | Artillery `ensure: maxErrorRate: 1` |
| RAM per replica | < 3 GB | Prometheus `nodejs_heap_size_used_bytes` scrape during 15-min hold |
| Per-user RAM slope | documented (no hard gate yet — baseline pending Plan 04) | `(RAM_at_1000VU − RAM_at_0VU) / 1000` |

The p95 target of 500 ms is **aspirational**. Plan 04 will measure the current baseline; if the baseline is 400 ms, the gate is tight. If it's 2 s, the gate is a stretch goal. See `.planning/phases/157-scale-to-1000-users/157-RESEARCH.md §Open Question 1`.

## Pre-flight Checklist

Before every load-test run:

- [ ] **Target is staging, not production** (unless explicitly approved). Prod load-testing requires a maintenance window.
- [ ] `.env.loadtest` exists in `backend/` with filled-in values (copy from `.env.loadtest.example`).
- [ ] `loadtest-tenant` is seeded with 1000 users via `npm run load-test:seed` AND the seed's smoke-login validation passed.
- [ ] Target URL is reachable: `curl -I $LOADTEST_TARGET/health/live` returns 200.
- [ ] Artillery is installed: `cd backend && npx artillery --version` prints `2.x`.
- [ ] Prometheus scrape target is pointed at the load-test replica (if running the RAM gate).
- [ ] Free at least 1 GB RAM and 2 CPU cores on the machine RUNNING Artillery — a throttled load-gen skews the numbers. Use GitHub Actions (~10 Gbps egress) or a t3.large, NOT a dev laptop on home Wi-Fi.

## Commands

All commands run from `backend/` directory:

```bash
# Seed 1000 synthetic users in loadtest-tenant via better-auth's signUpEmail
# (proper bcrypt + account row). Runs smoke-login validation on first 10 users
# before bulk-seeding remaining 990 — aborts early if auth is broken.
npm run load-test:seed

# Re-run smoke-login check against existing seeded users (no new users created)
npm run load-test:smoke-login

# 10-VU / 30-s smoke — verifies config loads + auth flow works
npm run load-test:smoke

# Full 100/500/1000 ramp (takes ~22 min total)
npm run load-test:1000

# Generate HTML report from the latest JSON output
npm run load-test:report
# Opens: load-test/report.html

# MANDATORY AFTER EVERY RUN — deletes loadtest-tenant rows
npm run load-test:cleanup
```

**Chain seed → test → cleanup in CI:**
```yaml
- run: npm run load-test:seed
- run: npm run load-test:smoke
- run: npm run load-test:cleanup
  if: always()   # run even if the test failed
```

## Reading the Report

After `npm run load-test:report`, open `load-test/report.html`. Key sections:

| Section | What to look for |
|---|---|
| **Summary** | `http.codes.200` count ≈ `http.requests` count; `errors.*` should be near-zero. |
| **Latency histograms** | `http.response_time.p95` per endpoint. The aggregate p95 is a bad metric — check per-endpoint (plugin `metrics-by-endpoint`). |
| **Phases** | Each phase should show sustained throughput matching its `arrivalRate`. If phase 5 (hold 1000) shows a drop to 700, the server is rejecting requests. |
| **errors.ECONNREFUSED / ETIMEDOUT** | The load generator's network is overwhelmed, not the server. Re-run from a bigger machine. |
| **errors.EHOSTUNREACH** | DNS / Railway service down. Check `LOADTEST_TARGET`. |

## Known Pitfalls (from RESEARCH.md)

1. **Tenant leak (Pitfall 5):** If `load-test:cleanup` is skipped, `loadtest-tenant` rows accumulate and pollute aggregate dashboards. ALWAYS run cleanup after the test. The npm script includes a safety guard that refuses to delete tenants whose ID doesn't start with `loadtest-`.

2. **LRU access-gated TTL (Pitfall 6):** Not relevant to this runbook (and no longer relevant to Plan 02 either after revision v2 deleted the unused tenantCounters Map).

3. **Per-user RAM dominated by buffer churn (Pitfall 7):** Take RAM measurements at STEADY STATE — 5+ minutes into the 1000-VU hold phase — not during the ramp. Ramping allocates transient Buffer objects that skew `rss`; the 15-min hold gives V8's GC time to drain them.

4. **k6 for Socket.IO:** Don't try it. k6's `ws` module speaks raw WebSocket; Socket.IO's framing/heartbeat/ack protocol will not be exercised. Metrics lie.

5. **Load-testing from home Wi-Fi:** Your uplink is ~10 Mbps. Artillery at 1000 VUs × 50 KB/req needs ≥400 Mbps. Use GitHub Actions or an EC2 t3.large.

6. **Missing baseline:** SCALE-05 (Plan 04) runs the CURRENT topology's baseline BEFORE the split. Do not interpret the first post-split run in isolation — always compare before/after.

7. **Seed bypassing better-auth:** v1 of the seed script used `prisma.user.create` directly, which skipped bcrypt password hashing. Result: every Artillery `/sign-in/email` returned 401. v2 (current) uses `auth.api.signUpEmail` and includes a smoke-login validation step against the first 10 seeded users — if that step fails, the seed exits non-zero before bulk seeding the remaining 990. Never revert this without re-validating signUp pipeline.

## Rollback Procedure

If a load test uncovers a regression severe enough to halt the phase:

1. `npm run load-test:cleanup` (delete loadtest-tenant).
2. Revert the most recent phase commits that affect the system under test.
3. Re-run `load-test:smoke` against the reverted state to confirm recovery.
4. Document the regression in a new `.planning/phases/XXX-regression/` directory before resuming phase 157.

The load-test rig itself is reversible: `git revert` the commits from phase 157 plan 03 removes all load-test files. The only out-of-tree artifact is the seeded `loadtest-tenant` — cleanup handles it.

## References

- `.planning/phases/157-scale-to-1000-users/157-RESEARCH.md` — complete research document
- `backend/load-test/artillery.config.yml` — the config this runbook executes
- [Artillery docs](https://www.artillery.io/docs)
- [Socket.IO load testing guide](https://socket.io/docs/v4/load-testing/)
