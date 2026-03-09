---
phase: 54
slug: websocket-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (via @nestjs/testing) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern realtime-handshake.cookie --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern realtime-handshake.cookie --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | NEST-05 | unit | `cd backend && npx jest --testPathPattern realtime-handshake.cookie --no-coverage` | ✅ | ⬜ pending |
| 54-01-02 | 01 | 1 | NEST-05 | manual | Manual smoke test: trigger email sync, verify WS events | N/A | ⬜ pending |
| 54-01-03 | 01 | 1 | NEST-05 | manual | Manual smoke test: open chat, verify WS events | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email sync notifications work with new WS auth | NEST-05 | Requires live email sync trigger + browser WS observation | 1. Open app in browser 2. Trigger email sync 3. Verify sync events arrive via WS in devtools |
| Chat works with new WS auth | NEST-05 | Requires live chat session + browser WS observation | 1. Open app in browser 2. Open AI chat 3. Verify chat messages flow via WS |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
