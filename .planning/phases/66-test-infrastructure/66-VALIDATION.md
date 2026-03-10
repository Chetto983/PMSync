---
phase: 66
slug: test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x (backend .spec.ts), Vitest 4.x (backend .test.ts), Playwright 1.58 (frontend E2E) |
| **Config file** | `backend/jest.config.ts`, `frontend/jest.config.ts`, `frontend/playwright.config.ts` |
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
| 66-01-01 | 01 | 1 | INFRA-01 | integration | `docker compose -f docker-compose.test.yml up -d && cd backend && npx jest --testPathPattern=test/setup` | ❌ W0 | ⬜ pending |
| 66-01-02 | 01 | 1 | INFRA-01 | integration | `cd backend && npx jest --testPathPattern=test/setup` | ❌ W0 | ⬜ pending |
| 66-02-01 | 02 | 1 | INFRA-02 | unit | `cd backend && npx jest --testPathPattern=test/helpers/factories` | ❌ W0 | ⬜ pending |
| 66-03-01 | 03 | 1 | INFRA-03 | integration | `cd backend && npx jest --testPathPattern=test/helpers/cleanup` | ❌ W0 | ⬜ pending |
| 66-04-01 | 04 | 2 | INFRA-04 | e2e | `cd frontend && npx playwright test --project=setup` | ❌ W0 | ⬜ pending |
| 66-05-01 | 05 | 2 | INFRA-05 | unit | `cd backend && npx jest --coverage` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docker-compose.test.yml` — PostgreSQL 16 + Redis 7 test containers
- [ ] `.env.test` — local test connection strings
- [ ] `backend/test/helpers/factories.ts` — createTestTenant, createTestUser, createTestSession stubs
- [ ] `backend/test/helpers/cleanup.ts` — DB cleanup utilities
- [ ] `backend/test/setup.ts` — Jest globalSetup for DB provisioning

*All above must exist before Wave 1 tasks can produce green tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker containers start on dev machine | INFRA-01 | Depends on Docker Desktop installation | Run `docker compose -f docker-compose.test.yml up -d` and verify both containers are healthy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
