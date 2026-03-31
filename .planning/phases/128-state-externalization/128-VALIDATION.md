---
phase: 128
slug: state-externalization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 128 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="triage-learning\|circuit-breaker\|email-triage" --no-coverage` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 128-01-01 | 01 | 1 | SCAL-04a | unit | `npx jest --testPathPattern="triage-learning" -t "signal buffer" --no-coverage` | ❌ W0 | ⬜ pending |
| 128-01-02 | 01 | 1 | SCAL-04a | unit | `npx jest --testPathPattern="triage-learning" -t "scoreCache" --no-coverage` | ❌ W0 | ⬜ pending |
| 128-02-01 | 02 | 1 | SCAL-04b | manual-only | N/A (documentation review) | N/A | ⬜ pending |
| 128-03-01 | 03 | 2 | SCAL-04c | unit | `npx jest --testPathPattern="email-triage" -t "semaphore" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ai/services/__tests__/triage-learning.spec.ts` — stubs for SCAL-04a (mock Redis, verify RPUSH/LRANGE/DEL calls)
- [ ] `backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts` — stubs for SCAL-04c (mock Redis, verify EVAL calls for acquire/release)

*Existing infrastructure covers CircuitBreaker documentation (SCAL-04b is manual-only).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CircuitBreaker tradeoff analysis documented | SCAL-04b | Documentation content quality requires human review | Verify `circuit-breaker.utils.ts` contains JSDoc block explaining per-instance design, tradeoffs, and mitigation path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
