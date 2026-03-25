---
phase: 111
slug: push-notification-test-debt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 111 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest 29.4.6 |
| **Config file** | `backend/package.json` (jest section) |
| **Quick run command** | `cd backend && npm run test -- --testPathPattern=push` |
| **Full suite command** | `cd backend && npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm run test -- --testPathPattern=push`
- **After every plan wave:** Run `cd backend && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 111-01-01 | 01 | 1 | tech-debt | unit | `npm run test -- --testPathPattern=push.controller` | ✅ | ⬜ pending |
| 111-01-02 | 01 | 1 | tech-debt | unit | `npm run test -- --testPathPattern=push.service` | ✅ | ⬜ pending |
| 111-02-01 | 02 | 1 | tech-debt | unit | `npm run test -- --testPathPattern=push-dispatch.worker` | ✅ | ⬜ pending |
| 111-02-02 | 02 | 1 | tech-debt | unit | `npm run test -- --testPathPattern=push-dispatch.handler` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
