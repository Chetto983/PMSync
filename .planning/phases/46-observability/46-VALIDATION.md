---
phase: 46
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) + Jest (existing) |
| **Config file** | `backend/vitest.config.ts` / `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/common/metrics` |
| **Full suite command** | `cd backend && npm run vitest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/common/metrics`
- **After every plan wave:** Run `cd backend && npm run vitest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | OBS-01 | integration | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-endpoint.test.ts` | Wave 0 | pending |
| 46-01-02 | 01 | 1 | OBS-02 | unit | `cd backend && npx vitest run src/common/metrics/__tests__/http-metrics.test.ts` | Wave 0 | pending |
| 46-02-01 | 02 | 1 | OBS-03 | unit | `cd backend && npx vitest run src/common/metrics/__tests__/queue-metrics.test.ts` | Wave 0 | pending |
| 46-03-01 | 03 | 1 | OBS-04 | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-metrics.test.ts` | Wave 0 | pending |
| 46-04-01 | 04 | 2 | TEST-09 | integration | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-endpoint.test.ts` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/common/metrics/__tests__/metrics-endpoint.test.ts` — stubs for OBS-01, TEST-09
- [ ] `src/common/metrics/__tests__/http-metrics.test.ts` — stubs for OBS-02
- [ ] `src/common/metrics/__tests__/queue-metrics.test.ts` — stubs for OBS-03
- [ ] `src/modules/ai/services/__tests__/ai-metrics.test.ts` — stubs for OBS-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prometheus server can scrape /metrics | TEST-09 | Requires running Prometheus instance | 1. Start backend 2. Configure Prometheus to scrape localhost:3000/metrics 3. Verify targets page shows UP |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
