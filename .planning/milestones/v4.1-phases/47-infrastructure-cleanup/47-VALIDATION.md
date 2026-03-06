---
phase: 47
slug: infrastructure-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (backend), Jest (frontend) |
| **Config file** | `backend/jest.config.js`, `frontend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=<pattern> --forceExit` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests --ci --forceExit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=<relevant> --forceExit`
- **After every plan wave:** Run `npx jest --passWithNoTests --ci --forceExit` + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | INFRA-01/02/03 | integration | `npx jest tests/realtime-redis-adapter.spec.ts --forceExit` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | TEST-10 | integration | Same as above | ❌ W0 | ⬜ pending |
| 47-02-01 | 02 | 1 | CLN-01/02 | unit+integration | `npx jest --testPathPattern=csrf --forceExit` | ❌ W0 | ⬜ pending |
| 47-02-02 | 02 | 1 | TEST-11 | unit | Same as above | ❌ W0 | ⬜ pending |
| 47-03-01 | 03 | 2 | CLN-06 | script | `npx ts-node scripts/re-encrypt-cbc-to-gcm.ts --dry-run` | ❌ W0 | ⬜ pending |
| 47-03-02 | 03 | 2 | TEST-13 | assertion | Same as above | ❌ W0 | ⬜ pending |
| 47-04-01 | 04 | 2 | CLN-04/05 | CI | `cd frontend && npx knip` + bundle size check | ❌ W0 | ⬜ pending |
| 47-04-02 | 04 | 2 | TEST-12 | CI script | Shell script in CI workflow | ❌ W0 | ⬜ pending |
| 47-04-03 | 04 | 2 | CLN-03 | assertion | `test ! -f backend/src/common/filters/all-exceptions*` | ✅ Pre-satisfied | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/realtime-redis-adapter.spec.ts` — stubs for TEST-10 cross-instance WS
- [ ] `backend/test/csrf-error.spec.ts` — stubs for TEST-11 CSRF error handling
- [ ] `scripts/re-encrypt-cbc-to-gcm.ts` — migration script (TEST-13)
- [ ] `frontend/knip.json` — Knip configuration for dependency audit
- [ ] CI workflow bundle budget step (TEST-12)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 2-instance WS delivery | TEST-10 | Requires 2 backend processes | Start 2 instances with different ports, connect client to each, publish on A, verify receipt on B |
| Bundle budget CI gate | TEST-12 | Requires CI pipeline run | Push branch, verify CI job fails when bundle exceeds 10MB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
