---
phase: 157
slug: scale-to-1000-users
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 157 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 157-RESEARCH.md §Validation Architecture (line 766).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (unit/integration)** | jest 29.x (existing `backend/jest.config.js`) |
| **Framework (load test)** | artillery ^2.0 (new devDep — Wave 0 install) |
| **Config file (unit)** | `backend/jest.config.js` |
| **Config file (load)** | `backend/load-test/artillery.config.yml` (new — Wave 0) |
| **Quick run command** | `cd backend && npx tsc --noEmit` + `npx jest <spec path> --forceExit` |
| **Full suite command** | `cd backend && npm run lint:win && npx tsc --noEmit && npx jest --forceExit` |
| **Baseline load-test command** | `cd backend && npx artillery run load-test/scenarios/baseline.yml --environment staging` |
| **Estimated unit runtime** | ~90 s |
| **Estimated load-test runtime** | ~15 min (100/500/1000 VU ramp) |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` (mandatory per CLAUDE.md) + task-scoped Jest spec
- **After every plan wave:** Full Jest suite
- **Before `/gsd-verify-work`:** Full Jest suite green + Artillery baseline recorded
- **Max feedback latency:** 90 s for unit, 15 min for load test (only at end of plan 03/baseline)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 157-01-01 | 01 | 1 | SCALE-01 | — | N/A | compile+unit | `cd backend && npx tsc --noEmit && npx jest src/modules/email-sync/drivers/google --forceExit` | ❌ W0 (needs `@googleapis/*` installed) | ⬜ pending |
| 157-01-02 | 01 | 1 | SCALE-01 | — | N/A | compile+unit | `cd backend && npx tsc --noEmit && npx jest src/modules/calendar/drivers/google --forceExit` | ❌ W0 | ⬜ pending |
| 157-01-03 | 01 | 1 | SCALE-01 | — | N/A | compile+unit | `cd backend && npx tsc --noEmit && npx jest src/modules/contacts/drivers/google --forceExit` | ❌ W0 | ⬜ pending |
| 157-01-04 | 01 | 1 | SCALE-01 | — | oauth integrity | compile+unit | `cd backend && npx jest src/modules/providers/services/__tests__/google-oauth.service.spec.ts --forceExit` | ❌ W0 | ⬜ pending |
| 157-01-05 | 01 | 1 | SCALE-01 | — | N/A | measurement | `du -sh backend/node_modules/@googleapis backend/node_modules/google-auth-library` (expect ~2.5 MB; baseline `googleapis` was 199.6 MB) | ✅ | ⬜ pending |
| 157-02-01 | 02 | 2 | SCALE-02 | — | tenant isolation | unit | `cd backend && npx jest src/modules/email/services/__tests__/attachment-metrics.service.spec.ts --forceExit` | ❌ W0 (new spec file) | ⬜ pending |
| 157-02-02 | 02 | 2 | SCALE-02 | — | LRU eviction bound | unit | `npx jest -t "LRU eviction" src/modules/email/services/__tests__/attachment-metrics.service.spec.ts` | ❌ W0 | ⬜ pending |
| 157-03-01 | 03 | 2 | SCALE-04 | — | auth in load test | compile+smoke | `cd backend && npx artillery run load-test/scenarios/smoke.yml --environment staging` (10 VUs, expect 0 errors) | ❌ W0 | ⬜ pending |
| 157-03-02 | 03 | 2 | SCALE-04 | — | socket.io handshake | smoke | `npx artillery run load-test/scenarios/socketio.yml --environment staging` (50 VUs, expect handshake success rate > 99%) | ❌ W0 | ⬜ pending |
| 157-04-01 | 04 | 3 | SCALE-05 | — | p95 baseline | load | `npx artillery run load-test/scenarios/baseline.yml --environment staging --output baseline.json` + `artillery report baseline.json` | ❌ W0 | ⬜ pending |
| 157-04-02 | 04 | 3 | SCALE-05 | — | RAM slope | measurement | Read Railway `MEMORY_USAGE_GB` metric during baseline run; record p95 RAM + per-user slope | manual-assisted | ⬜ pending |
| 157-05-01 | 05 | 4 | SCALE-06 | T-157-01 | migration ownership | compile+deploy | `railway up --service backend-worker --detach` + check `railway logs --service backend-worker` for `prisma migrate deploy` log line; `railway logs --service backend-http` must NOT contain it | ❌ W0 (needs `railway.worker.toml` + `railway.http.toml`) | ⬜ pending |
| 157-05-02 | 05 | 4 | SCALE-06 | — | health endpoint | http | `curl https://<http-service>/health/live` → 200 and `curl https://<worker-service>/health/live` → 200 | ✅ (health.controller.ts:44 already has /health/live) | ⬜ pending |
| 157-05-03 | 05 | 4 | SCALE-06 | — | acceptance gate | load | `npx artillery run load-test/scenarios/acceptance-1000vu.yml --environment staging` — pass criteria: p95 HTTP < 500 ms, p95 Socket.IO event < 200 ms, each replica RAM < 3 GB throughout run | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 (pre-plan setup) must complete before plans 01–05 can execute:

- [ ] `backend/package.json` — new deps: `@googleapis/gmail`, `@googleapis/calendar`, `@googleapis/people`, `google-auth-library`, `lru-cache@^11`, `artillery@^2` (devDep). `googleapis` and `@types/googleapis` removed.
- [ ] `backend/src/modules/email/services/__tests__/attachment-metrics.service.spec.ts` — new spec file scaffold (copy shape from `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts`)
- [ ] `backend/load-test/artillery.config.yml` — base config with environments (local/staging), phases (100/500/1000 VU ramp), baseline processors
- [ ] `backend/load-test/scenarios/` — scenario YAMLs (smoke, socketio, baseline, acceptance-1000vu)
- [ ] `backend/load-test/processors/auth.js` — better-auth session setup for virtual users
- [ ] `backend/railway.http.toml` and `backend/railway.worker.toml` — per-service Railway config (cloned from existing `backend/railway.toml`)
- [ ] `docs/load-testing.md` — runbook (how to run each scenario, how to read the report)
- [ ] `docs/infra-runbook.md` — 2-service topology documentation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RAM slope per user under real load | SCALE-05 | Requires live Railway metrics API queries during the load-test run; Jest cannot drive this | 1. Start baseline load-test on staging. 2. In parallel, run `scripts/probe-railway-ram.sh` every 30s for the duration. 3. Compute delta(RAM) / delta(active-users) at each phase transition. Record in `.planning/phases/157-scale-to-1000-users/157-BASELINE.md` |
| Railway 2-service topology deploy | SCALE-06 | Railway CLI + dashboard changes (create `backend-http` and `backend-worker` services, set env vars, wire domains); cannot be automated from test suite | Runbook steps in `docs/infra-runbook.md` §Deployment; verify via `railway status --service backend-http` and `railway status --service backend-worker` after deploy |
| Migration race prevented | SCALE-06 / T-157-01 | Requires 2 parallel service boots on Railway, observing that only worker runs `prisma migrate deploy` | Trigger simultaneous redeploys of both services; confirm `prisma migrate deploy` log line appears exactly once (in worker logs); HTTP service must NOT attempt migration |
| Acceptance gate hit in production | SCALE-06 | Final acceptance is production traffic sustained over a week — soak testing is out of phase 157 scope | Post-phase-157: monitor Railway metrics for 7 days; assert per-replica p95 RAM < 3 GB and HTTP p95 < 500 ms during peak hours. If gate missed, file follow-up phase. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies recorded above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (load-test/manual tasks sandwiched between unit-tested tasks)
- [ ] Wave 0 covers all MISSING references (new deps, new spec files, new load-test rig, new railway TOMLs)
- [ ] No watch-mode flags (`--watch`, `--watchAll` forbidden)
- [ ] Feedback latency < 90 s for unit; load tests deliberately slower and opt-in per plan wave
- [ ] `nyquist_compliant: true` set in frontmatter (pending plan execution — will flip after plan-checker pass)

**Approval:** pending — awaits gsd-plan-checker verification after plans are drafted.
