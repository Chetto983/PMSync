---
phase: 102
slug: install-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 102 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd frontend && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd frontend && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 102-01-01 | 01 | 1 | INST-01 | unit | `cd frontend && npx vitest run src/hooks/__tests__/use-install-prompt.test.ts` | ❌ W0 | ⬜ pending |
| 102-01-02 | 01 | 1 | INST-02 | unit | `cd frontend && npx vitest run src/hooks/__tests__/use-install-prompt.test.ts` | ❌ W0 | ⬜ pending |
| 102-01-03 | 01 | 1 | INST-03 | unit | `cd frontend && npx vitest run src/hooks/__tests__/use-install-prompt.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/hooks/__tests__/use-install-prompt.test.ts` — stubs for INST-01, INST-02, INST-03
- [ ] Mock `beforeinstallprompt` event and `navigator.standalone` in test environment

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Android/Chrome install prompt appears | INST-01 | Requires real `beforeinstallprompt` event from browser | Open on Android Chrome, verify Snackbar appears with accept/dismiss |
| iOS Safari instructions dialog | INST-02 | Requires real iOS Safari UA and share sheet | Open on iOS Safari, verify instructions dialog appears |
| Standalone mode hides prompt | INST-03 | Requires app to be running in standalone display-mode | Install app, reopen, verify no install prompt shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
