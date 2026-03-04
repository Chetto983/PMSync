---
phase: 37
slug: performance-debt-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (frontend) + Lighthouse CI |
| **Config file** | `frontend/lighthouserc.js` (exists) |
| **Quick run command** | `cd frontend && npm run type-check && npm run lint` |
| **Full suite command** | `cd frontend && npx @lhci/cli autorun` |
| **Estimated runtime** | ~60 seconds (type-check+lint), ~120 seconds (Lighthouse) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run type-check && npm run lint`
- **After every plan wave:** Run `cd frontend && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green (`npx @lhci/cli autorun`)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | PERF-01 | build | `ANALYZE=true npm run build` | ✅ | ⬜ pending |
| 37-01-02 | 01 | 1 | PERF-01 | build | `cd frontend && npm run build` | ✅ | ⬜ pending |
| 37-01-03 | 01 | 1 | PERF-01 | lighthouse | `npx @lhci/cli autorun` | ✅ | ⬜ pending |
| 37-02-01 | 02 | 1 | PERF-02 | manual | Visual review + `npm run type-check` | N/A | ⬜ pending |
| 37-02-02 | 02 | 1 | PERF-02 | manual | Visual review + `npm run lint` | N/A | ⬜ pending |
| 37-03-01 | 03 | 2 | PERF-01 | ci | `gh workflow run frontend-ci.yml` | ✅ | ⬜ pending |
| 37-03-02 | 03 | 2 | PERF-01 | profiling | `clinic doctor -- node dist/main.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `clinic` + `autocannon` — install for backend memory profiling (Plan 37-03)
- [ ] Mock server or `msw` — needed for Lighthouse CI in CI environment without backend

*Existing infrastructure covers type-check, lint, build, and Lighthouse config.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deferred bugs resolved | PERF-02 | Bug fixes verified by code review + type-check | Review each BUG-REPORT item, confirm fix or document accepted exception |
| No unbounded cache growth | PERF-01 | Requires load simulation | Run backend under simulated load, monitor heap with `clinic` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
