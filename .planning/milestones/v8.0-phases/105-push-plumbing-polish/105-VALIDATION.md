---
phase: 105
slug: push-plumbing-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 105 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (frontend) |
| **Config file** | `frontend/jest.config.ts` |
| **Quick run command** | `cd frontend && npx jest --passWithNoTests --testPathPattern="push\|sw-update"` |
| **Full suite command** | `cd frontend && npx jest --passWithNoTests` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest --passWithNoTests --testPathPattern="push\|sw-update"`
- **After every plan wave:** Run `cd frontend && npx jest --passWithNoTests`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 105-01-01 | 01 | 1 | PUSH-01 | unit | `npx jest --testPathPattern="use-push-subscription"` | ❌ W0 | ⬜ pending |
| 105-01-02 | 01 | 1 | PUSH-02 | manual | N/A — requires real browser push | N/A | ⬜ pending |
| 105-01-03 | 01 | 1 | PUSH-03 | manual | N/A — notification tap routing | N/A | ⬜ pending |
| 105-01-04 | 01 | 1 | PUSH-04 | unit | `npx jest --testPathPattern="use-push-subscription"` | ❌ W0 | ⬜ pending |
| 105-02-01 | 02 | 1 | PLSH-01 | unit | `npx jest --testPathPattern="sw-update"` | ❌ W0 | ⬜ pending |
| 105-02-02 | 02 | 1 | PLSH-02 | manual | Lighthouse PWA audit | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/hooks/__tests__/use-push-subscription.test.ts` — stubs for PUSH-01, PUSH-04
- [ ] `frontend/hooks/__tests__/use-sw-update.test.ts` — stubs for PLSH-01

*PUSH-02 (SW push event handler) is manual-only — requires real browser push environment. See Manual-Only Verifications.*

*Existing jest infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SW push event shows notification | PUSH-02 | Requires real browser push environment; SW APIs not available in jsdom/jest | 1. Send test push from backend 2. Verify notification appears with PMSync icon and correct title/body |
| Notification tap opens correct view | PUSH-03 | Requires real push event + OS notification tap | 1. Send test push from backend 2. Tap notification 3. Verify correct route opens |
| Lighthouse PWA audit passes | PLSH-02 | Requires full Lighthouse run against deployed app | 1. Deploy to staging 2. Run Lighthouse 3. Verify PWA score ≥ 90 |
| iOS Safari standalone-only gate | PUSH-04 | Requires real iOS device in standalone mode | 1. Open in iOS Safari 2. Verify push UI hidden 3. Add to Home Screen 4. Verify push UI visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
