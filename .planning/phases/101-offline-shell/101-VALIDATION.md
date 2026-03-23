---
phase: 101
slug: offline-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest (jsdom environment) |
| **Config file** | `frontend/jest.config.js` |
| **Quick run command** | `cd frontend && npx jest --no-coverage -x` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npx jest --passWithNoTests --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx tsc --noEmit && npx jest --passWithNoTests --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 1 | OFFL-01, OFFL-04 | manual + type-check | `cd frontend && npx tsc --noEmit` | N/A | pending |
| 101-01-02 | 01 | 1 | OFFL-02 | unit | `cd frontend && npx jest hooks/__tests__/use-online-status.test.ts --no-coverage -x` | No (W0) | pending |
| 101-01-03 | 01 | 1 | OFFL-02 | type-check | `cd frontend && npx tsc --noEmit` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `frontend/hooks/__tests__/use-online-status.test.ts` — unit test for online/offline hook (created as TDD RED in Task 2)
- [ ] Existing Jest infrastructure (jest.config.js, ts-jest, jsdom, @testing-library/react) covers framework needs

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Offline fallback page renders | OFFL-01 | Requires actual SW interception | 1. Build app 2. Open in browser 3. Go offline in DevTools 4. Navigate to uncached route 5. Verify branded page shows |
| App shell loads from cache offline | OFFL-04 | Requires cached SW + offline mode; verifies Phase 100 mechanism | 1. Visit app online (populates cache) 2. Go offline in DevTools > Application > Service Workers 3. Refresh — shell must render |
| Online/offline banner appears/disappears | OFFL-02 | Requires network state toggling | 1. Open app 2. Toggle offline in DevTools 3. Banner appears 4. Toggle online 5. Banner disappears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
