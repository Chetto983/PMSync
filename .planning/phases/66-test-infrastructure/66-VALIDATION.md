---
phase: 66
slug: test-infrastructure
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x (backend .spec.ts), Vitest 4.x (backend .test.ts), Playwright 1.58 (frontend E2E) |
| **Config file** | `backend/jest.config.js`, `frontend/jest.config.js`, `frontend/playwright.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=test/helpers --no-coverage` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=test/helpers --no-coverage`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 66-01-01 | 01 | 1 | INFRA-01 | integration | `docker compose -f docker-compose.test.yml up -d && cd backend && npx jest --testPathPattern=test/setup` | W0 gap | pending |
| 66-01-02 | 01 | 1 | INFRA-01 | integration | `cd backend && npx tsc --noEmit` | W0 gap | pending |
| 66-02-01 | 02 | 2 | INFRA-02 | unit | `cd backend && npx jest --testPathPattern=test/helpers/factories` | W0 gap | pending |
| 66-02-02 | 02 | 2 | INFRA-01,02,03 | smoke | `cd backend && npx dotenv-cli -e .env.test -- npx jest --testPathPattern=test/smoke --no-coverage --forceExit` | W0 gap | pending |
| 66-03-01 | 03 | 2 | INFRA-04 | config | `node -e "const c = require('fs').readFileSync('frontend/playwright.config.ts','utf8'); if(!c.includes('3100')) process.exit(1)"` | W0 gap | pending |
| 66-03-02 | 03 | 2 | INFRA-04 | config | `node -e "const c = require('fs').readFileSync('frontend/e2e/fixtures.ts','utf8'); if(c.includes('page.route')) process.exit(1)"` | W0 gap | pending |
| 66-03-03 | 03 | 2 | INFRA-05 | config | `cd backend && node -e "const c=require('./jest.config.js'); if(c.coverageThreshold.global.lines!==50) process.exit(1)" && cd ../frontend && node -e "const c=require('./jest.config.js'); if(c.coverageThreshold.global.lines!==30) process.exit(1)"` | exists | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] Plan 01 creates `docker-compose.test.yml` — PostgreSQL 16 + Redis 7 test containers
- [x] Plan 01 creates `.env.test` — local test connection strings
- [x] Plan 01 creates `backend/test/global-setup.ts` — Jest globalSetup for DB provisioning
- [x] Plan 01 creates `backend/test/global-teardown.ts` — Jest globalTeardown for cleanup
- [x] Plan 01 creates `backend/test/helpers/prisma-test-client.ts` — shared Prisma test client
- [x] Plan 02 creates `backend/test/helpers/factories.ts` — createTestTenant, createTestUser, createTestSession
- [x] Plan 02 creates `backend/test/helpers/cleanup.ts` — DB cleanup utilities
- [x] Plan 02 creates `backend/test/smoke.spec.ts` — smoke test verifying INFRA-01/02/03
- [x] Plan 03 creates `frontend/e2e/smoke.spec.ts` — E2E smoke test verifying INFRA-04
- [x] Plan 01 installs `dotenv-cli`: `cd backend && npm install -D dotenv-cli`

*All Wave 0 artifacts are created by plan tasks. No pre-existing test files required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker containers start on dev machine | INFRA-01 | Depends on Docker Desktop installation | Run `docker compose -f docker-compose.test.yml up -d` and verify both containers are healthy |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
