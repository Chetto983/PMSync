---
phase: 69
slug: backend-integration-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (NestJS backend) |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="69" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --testPathPattern="(tenant-isolation|auth-guard|contract)" --no-coverage` |
| **Estimated runtime** | ~30-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="69" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --testPathPattern="(tenant-isolation|auth-guard|contract)" --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 1 | BINT-01 | integration | `cd backend && npx jest tenant-isolation --no-coverage` | ❌ W0 | ⬜ pending |
| 69-01-02 | 01 | 1 | BINT-01 | integration | `cd backend && npx jest tenant-isolation --no-coverage` | ❌ W0 | ⬜ pending |
| 69-02-01 | 02 | 1 | BINT-02 | integration | `cd backend && npx jest auth-guard-chain --no-coverage` | ❌ W0 | ⬜ pending |
| 69-02-02 | 02 | 1 | BINT-02 | integration | `cd backend && npx jest auth-guard-chain --no-coverage` | ❌ W0 | ⬜ pending |
| 69-03-01 | 03 | 1 | BINT-03 | contract | `cd backend && npx jest contract --no-coverage` | ❌ W0 | ⬜ pending |
| 69-03-02 | 03 | 1 | BINT-03 | contract | `cd backend && npx jest contract --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/integration/tenant-isolation.spec.ts` — stub for BINT-01
- [ ] `backend/test/integration/auth-guard-chain.spec.ts` — stub for BINT-02
- [ ] `backend/test/contract/calendar.contract.spec.ts` — stub for BINT-03
- [ ] `backend/test/contract/labels.contract.spec.ts` — stub for BINT-03
- [ ] `backend/test/contract/providers.contract.spec.ts` — stub for BINT-03
- [ ] `backend/test/contract/subscription.contract.spec.ts` — stub for BINT-03
- [ ] `backend/test/contract/orgs.contract.spec.ts` — stub for BINT-03
- [ ] `backend/test/contract/admin.contract.spec.ts` — stub for BINT-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OpenAPI spec generation | BINT-03 | Requires live NestJS server to generate spec | Run `cd backend && npx ts-node scripts/generate-openapi.ts`, verify `openapi-spec.json` exists and includes calendar/labels/providers/subscription paths |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
