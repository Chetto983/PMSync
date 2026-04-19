---
phase: 157-scale-to-1000-users
plan: 03
subsystem: infra-load-testing
tags: [artillery, load-test, socket-io, better-auth, scale-04]
requires:
  - 157-01 (googleapis scoped migration merged on main)
provides:
  - Artillery load-test rig (full 100/500/1000 VU ramp + 10-VU smoke)
  - Socket.IO-capable scenario layer (engine socketio-v3)
  - better-auth-based loadtest-tenant seed (bcrypt + smoke-login validation) + cleanup
  - load-testing runbook
affects:
  - backend/package.json (+7 npm scripts, +artillery devDep)
  - backend/package-lock.json
  - backend/.gitignore (net new)
tech-stack:
  added:
    - artillery@^2.0.30 (devDep — dev only, npm prune --omit=dev strips from prod image)
  patterns:
    - better-auth signUpEmail pipeline for synthetic users (NOT raw prisma.user.create)
    - chunked bcrypt parallelism (CHUNK_SIZE=10 per RESOLVED Open Q#6)
    - smoke-login HTTP validation before bulk seed (fail-fast on auth regression)
    - CommonJS Artillery processor with redactCookie + pickUser hooks
key-files:
  created:
    - backend/load-test/artillery.config.yml
    - backend/load-test/artillery-smoke.yml
    - backend/load-test/scenarios/http-only.yml
    - backend/load-test/scenarios/socketio.yml
    - backend/load-test/scenarios/ai-chat.yml
    - backend/load-test/processors/auth.js
    - backend/.env.loadtest.example
    - backend/.gitignore
    - backend/scripts/seed-loadtest-users.ts
    - backend/scripts/cleanup-loadtest-users.ts
    - docs/load-testing.md
  modified:
    - backend/package.json
    - backend/package-lock.json
decisions:
  - "Artillery v2 was chosen over k6 because k6's ws module cannot speak Socket.IO's framing/ack protocol (Pitfall 4 in runbook)."
  - "Seed uses auth.api.signUpEmail (bcrypt + account row) — NOT raw prisma.user.create — because raw inserts bypass bcrypt and every /sign-in/email returns 401."
  - "Chunks of 10 (not 50) in seed because bcrypt saturates CPU on the event loop; larger chunks yield zero throughput gain and block the loop."
  - "Smoke-login validation runs after the first 10 users seed and exits non-zero on ANY failure, aborting the remaining 990-user bulk seed — catches auth pipeline regressions in ~30s instead of ~3min."
  - "backend/.gitignore had to be force-added (git add -f) because the root .gitignore line 141 ignores any nested .gitignore file."
  - "Artillery v2.0.30 removed the 'validate' CLI command that the plan's verification block expected — substituted with js-yaml structural parse (same loader Artillery uses internally). Flagged as Rule 1 deviation below."
  - "Seed script uses the existing createPrismaClient() factory (FOLLOW EXISTING PATTERNS), not plain `new PrismaClient()` — the factory sets up the adapter-pg pool correctly."
  - "Tenant upsert passes slug: TENANT_ID because Tenant.slug is @unique + non-null in schema (plan's sketch omitted this; schema verification caught it)."
metrics:
  duration_minutes: 20
  completed_date: 2026-04-19
  tasks_completed: 4
  files_created: 11
  files_modified: 2
---

# Phase 157 Plan 03: SCALE-04 Artillery Load-Test Rig — Summary

**One-liner:** Build the Artillery v2 load-test rig (100/500/1000 VU ramp + 10-VU smoke) with Socket.IO-native scenarios, better-auth-based loadtest-tenant seed (bcrypt + smoke-login validation), cleanup, and runbook — zero production impact (dev-only dep).

## Commits

| # | Hash | Type | Description |
|---|---|---|---|
| 1 | `055a63a7` | chore | Install artillery@^2 as devDep + 7 load-test npm scripts + backend/.gitignore secrets |
| 2 | `50d631c7` | feat | Artillery configs (full + smoke) + 3 scenarios + CJS auth processor + .env.loadtest.example |
| 3 | `5033005c` | feat | loadtest-tenant seed (better-auth signUpEmail + smoke-login validation) + cleanup scripts |
| 4 | `0cd980f5` | docs | Load-testing runbook (pre-flight, commands, pitfalls, rollback) |

## What Was Built

### 1. Artillery installation + npm scripts (Task 1)
- `artillery@^2.0.30` added to `devDependencies` (npm prune --omit=dev in `Dockerfile.railway:15` strips it from prod images — verified pre-existing).
- 7 new `load-test:*` npm scripts: `smoke`, `100`, `1000`, `seed`, `cleanup`, `report`, `smoke-login`. All use the `dotenv-cli -e .env.loadtest --` prefix matching the existing test script convention.
- `backend/.gitignore` created (had to `git add -f` because root `.gitignore:141` globally ignores nested `.gitignore` files) with entries for `.env.loadtest`, `load-test/report-*.json`, `load-test/report.html`, and 6 run-log artifacts.

### 2. Artillery configs + processor + env example (Task 2)
- `load-test/artillery.config.yml`: full 100 → 500 → 1000 VU ramp (22-min total window), 3 scenarios weighted 80/20/5, `ensure: { p95: 500, maxErrorRate: 1 }` native gate, `socketio-v3` engine block.
- `load-test/artillery-smoke.yml`: 10 VU / 30s variant with `ensure: { maxErrorRate: 0 }`.
- `load-test/scenarios/{http-only,socketio,ai-chat}.yml`: standalone single-scenario configs for diagnostic runs.
- `load-test/processors/auth.js`: CommonJS module exporting `redactCookie` (scrubs `set-cookie` + `authorization` headers before Artillery writes reports, addresses Security V7 / T-157-03-01) and `pickUser` (deterministic VU-to-user mapping).
- `backend/.env.loadtest.example`: placeholder env file with staging URL default, documented secret names, no real secrets.

### 3. Seed + cleanup scripts (Task 3)
- `scripts/seed-loadtest-users.ts`:
  - Bootstraps better-auth in-process via `createBetterAuthInstance(prisma, emailService)`.
  - Uses `auth.api.signUpEmail({ body: { email, password, name } })` — runs bcrypt + writes `account` row with password hash (the v1 bug was raw `prisma.user.create` which bypassed bcrypt and caused every `/sign-in/email` to return 401).
  - Chunks of 10 via `Promise.allSettled` (not 50 — bcrypt CPU saturation per RESOLVED Open Q#6).
  - Sets `emailVerified: true` + `tenantId: TENANT_ID` directly after signUp to bypass `requireEmailVerification: true` gate (acceptable for synthetic users).
  - Idempotent: `findFirst({ where: { email, tenantId } })` short-circuits if user exists.
  - **Smoke-login validation**: after the first 10 users are seeded, issues real HTTP `POST /api/auth/sign-in/email` for those 10 users against `LOADTEST_TARGET` and exits non-zero if ANY return non-200 — aborts the remaining 990-user bulk seed. Prevents waiting 3 minutes to discover the auth pipeline is broken.
  - `--smoke-login-only` flag re-runs the 10-user check against existing seeded users without creating new ones.
- `scripts/cleanup-loadtest-users.ts`:
  - Deletes sessions, accounts, users, and tenant row for `loadtest-tenant`.
  - Safety guard: refuses to delete tenants whose ID doesn't start with `loadtest-` (prevents production deletion if env is misconfigured — T-157-03-02 mitigation).
- Both scripts use `createPrismaClient()` factory (FOLLOW EXISTING PATTERNS — the factory sets up the adapter-pg pool with the right connection limits).

### 4. Runbook (Task 4)
- `docs/load-testing.md` (109 lines): acceptance-gate table, pre-flight checklist, command block, report-reading guide, 7 pitfalls (including the v2 seed-bypass fix — Pitfall 7), rollback procedure, references to Artillery + Socket.IO docs.

## Verification Results

| Check | Result |
|---|---|
| `grep -c '"artillery": "\^2' backend/package.json` | 1 ✓ |
| `grep -c '"load-test:' backend/package.json` | 7 ✓ |
| 5 Artillery YAML configs parse via js-yaml | all OK ✓ |
| `grep "ensure:" backend/load-test/artillery.config.yml` | 1 ✓ |
| `grep "p95: 500" backend/load-test/artillery.config.yml` | 1 ✓ |
| `grep "socketio-v3" backend/load-test/artillery.config.yml` | 2 (engines block + scenario engine) ✓ |
| `grep "rampTo: 1000" backend/load-test/artillery.config.yml` | 1 ✓ |
| `grep "/sign-in/email" backend/load-test/artillery.config.yml` | 2 (HTTP + AI chat) ✓ |
| `grep "arrivalRate: 10" backend/load-test/artillery-smoke.yml` | 1 ✓ |
| `grep "module.exports" backend/load-test/processors/auth.js` | 1 ✓ |
| `grep "redactCookie" / "pickUser"` processor | 1 / 1 ✓ |
| Processor require() loads; exports both functions | ✓ |
| `grep "CHUNK_SIZE = 10"` seed | 1 ✓ (not 50) |
| `grep "auth.api.signUpEmail"` seed | 2 ✓ (≥ 1 required) |
| `grep "smokeLoginValidation"` seed | 3 ✓ (≥ 2 required) |
| `grep "refusing to delete"` cleanup | 1 ✓ |
| `grep "^\.env\.loadtest$" backend/.gitignore` | 1 ✓ |
| `grep "^load-test/report-" backend/.gitignore` | 1 ✓ |
| `grep "^load-test/report\.html$" backend/.gitignore` | 1 ✓ |
| Runbook contains Acceptance Gate, Pitfall (4×), Rollback Procedure, Seed bypassing better-auth | ✓ all present |
| `cd backend && npx tsc --noEmit` | exit 0 ✓ |

## Plan 04's Next Step

Plan 04 (SCALE-05) will run the baseline measurement: `npm run load-test:seed` → `npm run load-test:smoke` (zero-error gate) → `npm run load-test:1000` against the current single-topology Railway deploy. The rig is ready; Plan 04 only needs `.env.loadtest` filled in with real staging credentials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Artillery v2 removed the `validate` CLI command**
- **Found during:** Task 2 verification
- **Issue:** Plan's `<automated>` verification block calls `npx artillery validate <file>`. Artillery v2.0.30's CLI does NOT expose a `validate` subcommand (only `run`, `report`, `quick`, `help`, and the various cloud runners). Running `npx artillery validate` prints "Warning: validate is not a artillery command" and exits 1.
- **Fix:** Substituted with a Node-based `js-yaml` structural parse that verifies each file has both `config` and `scenarios` blocks (js-yaml is what Artillery uses internally anyway — transitive dep). All 5 YAML configs pass this stricter-than-syntax check. The YAML structural gate remains in SUMMARY self-check.
- **Files modified:** none (documentation-only substitution).
- **Commit:** 50d631c7 (covers the files; the verification change is noted here).

**2. [Rule 2 - Missing critical functionality] Tenant schema requires `slug` @unique**
- **Found during:** Task 3 — reading `prisma/schema.prisma` before writing seed.
- **Issue:** Plan's seed sketch calls `prisma.tenant.upsert({ create: { id, name } })` but `Tenant.slug String @unique` is required (not nullable) in the current schema. The upsert would throw on first run.
- **Fix:** Added `slug: TENANT_ID` to the create payload (TENANT_ID itself, since it's already unique and `loadtest-` prefixed).
- **Files modified:** `backend/scripts/seed-loadtest-users.ts`.
- **Commit:** 5033005c.

**3. [Rule 3 - Blocker] `backend/.gitignore` ignored by root .gitignore**
- **Found during:** Task 1 `git status` after creating the file.
- **Issue:** Root `.gitignore:141` has the literal line `.gitignore`, which matches any `.gitignore` in any subdirectory. The new `backend/.gitignore` was silently excluded from git tracking — `git status` showed nothing.
- **Fix:** `git add -f backend/.gitignore` force-adds despite the ignore rule. Verified via `git check-ignore -v backend/.gitignore` before fixing.
- **Files modified:** n/a (workflow fix).
- **Commit:** 055a63a7.

**4. [Rule 3 - Blocker] Plan's seed uses `new PrismaClient()`, existing pattern is `createPrismaClient()`**
- **Found during:** Task 3 — checking existing scripts before writing seed.
- **Issue:** The plan script sketch does `new PrismaClient()` directly. Every existing script in `backend/scripts/` uses `createPrismaClient()` from `src/prisma/prisma-client.factory.ts` which wires up the `PrismaPg` adapter with explicit pool config (important under load).
- **Fix:** Used `createPrismaClient()`. Added `import 'dotenv/config'` at the top to match the factory's expectation (and matches existing `seed-pst-data.ts` pattern line 8).
- **Files modified:** `backend/scripts/seed-loadtest-users.ts`, `backend/scripts/cleanup-loadtest-users.ts`.
- **Commit:** 5033005c.

### Out-of-Scope / No Changes

- **No edit to `backend/src/modules/email/services/attachment-metrics.service.ts`** — confirmed via `git diff 7da27f6ba...HEAD --name-only`. That file is Plan 157-02's exclusive territory in Wave 2.
- **No Railway TOML changes** — those belong to a later plan (Wave 3 topology split, not in 157-03 scope).
- **No `googleapis` scoped-package edits** — merged in Plan 157-01 already.

## Known Stubs

None. All scripts and configs are wired to real endpoints (better-auth's `/api/auth/sign-in/email`, PMSync's `/emails`, `/ai/chat`). No placeholder UI or hardcoded mock data.

## Threat Flags

No new security surface introduced beyond what the plan's `<threat_model>` already tracks (T-157-03-01 through T-157-03-07). All mitigations listed there are implemented:
- T-157-03-01 (cookie leak in reports) → `redactCookie` hook in auth.js processor ✓
- T-157-03-02 (tenant cross-contamination) → `loadtest-` prefix guard in cleanup ✓
- T-157-03-03 (bcrypt DoS) → CHUNK_SIZE=10 parallelism ✓
- T-157-03-04 (prod target misconfiguration) → runbook pre-flight checklist ✓
- T-157-03-06 (synthetic users in dashboards) → tenant isolation + cleanup ✓
- T-157-03-07 (seed bypasses bcrypt) → auth.api.signUpEmail + smoke-login validation ✓

## Self-Check: PASSED

Verified:
- All 11 new files present on disk:
  - backend/.env.loadtest.example ✓
  - backend/.gitignore ✓
  - backend/load-test/artillery.config.yml ✓
  - backend/load-test/artillery-smoke.yml ✓
  - backend/load-test/scenarios/http-only.yml ✓
  - backend/load-test/scenarios/socketio.yml ✓
  - backend/load-test/scenarios/ai-chat.yml ✓
  - backend/load-test/processors/auth.js ✓
  - backend/scripts/seed-loadtest-users.ts ✓
  - backend/scripts/cleanup-loadtest-users.ts ✓
  - docs/load-testing.md ✓
- 2 modified files present in git diff:
  - backend/package.json ✓
  - backend/package-lock.json ✓
- All 4 task commits exist in git log:
  - 055a63a7 chore ✓
  - 50d631c7 feat (artillery configs) ✓
  - 5033005c feat (seed + cleanup) ✓
  - 0cd980f5 docs (runbook) ✓
- `cd backend && npx tsc --noEmit` exits 0 ✓
- No unauthorized file modifications (scope boundary respected) ✓
