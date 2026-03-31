---
phase: 129
slug: replica-activation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/common/config/__tests__/queue-config-scaling.test.ts src/__tests__/graceful-shutdown.test.ts src/common/metrics/__tests__/metrics-replica-label.test.ts -x` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 129-01-01 | 01 | 1 | SCAL-03 | unit/tdd | `cd backend && npx vitest run src/common/config/__tests__/queue-config-scaling.test.ts -x` | ✅ | ⬜ pending |
| 129-01-02 | 01 | 1 | SCAL-03 | auto | `cd backend && npx vitest run src/common/config/__tests__/queue-config-scaling.test.ts -x` | ✅ | ⬜ pending |
| 129-02-01 | 02 | 1 | PERF-03 | auto | `cd backend && npx vitest run src/__tests__/graceful-shutdown.test.ts -x` | ❌ W0 | ⬜ pending |
| 129-02-02 | 02 | 1 | PERF-04 | auto | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-replica-label.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-replica Railway deployment | SCAL-03 | Requires Railway production environment with numReplicas=2 | Deploy with `numReplicas=2` in railway.toml, verify both replicas handle traffic via logs |
| WebSocket sticky sessions | PERF-03 | Requires real network with multiple replicas | Connect WebSocket client, verify messages routed correctly across replicas |
| No duplicate job processing | SCAL-03 | Requires concurrent BullMQ workers on separate replicas | Submit jobs, verify each job processed exactly once via logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
