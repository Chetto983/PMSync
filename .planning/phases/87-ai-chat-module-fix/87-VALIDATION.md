---
phase: 87
slug: ai-chat-module-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS backend) |
| **Config file** | backend/jest.config.ts |
| **Quick run command** | `cd backend && npx jest --testPathPattern="ai-chat" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds (ai-chat only), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx jest --testPathPattern="ai-chat" --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 87-01-01 | 01 | 1 | BUG-2 | unit | `npx jest conversation.service` | ✅ | ⬜ pending |
| 87-01-02 | 01 | 1 | RULE-1 | unit | `npx jest conversation.service` | ✅ | ⬜ pending |
| 87-02-01 | 02 | 1 | BUG-1 | unit | `npx jest email-tools` | ✅ | ⬜ pending |
| 87-02-02 | 02 | 1 | BUG-5 | unit | `npx jest ai-chat.service` | ✅ | ⬜ pending |
| 87-02-03 | 02 | 1 | RACE-1 | unit | `npx jest conversation.service` | ✅ | ⬜ pending |
| 87-03-01 | 03 | 2 | BUG-3 | unit | `npx jest email-tools` | ✅ | ⬜ pending |
| 87-03-02 | 03 | 2 | BUG-6 | unit | `npx jest contact-tools` | ✅ | ⬜ pending |
| 87-03-03 | 03 | 2 | BUG-7 | unit | `npx jest conversation.service` | ✅ | ⬜ pending |
| 87-03-04 | 03 | 2 | BUG-8 | unit | `npx jest rag-tools` | ✅ | ⬜ pending |
| 87-03-05 | 03 | 2 | RACE-4 | unit | `npx jest ai-chat.service` | ✅ | ⬜ pending |
| 87-04-01 | 04 | 3 | DEAD-1-5 | tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 87-04-02 | 04 | 3 | RULE-3 | tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Backend jest configuration and test files already exist for the ai-chat module.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-user read blocked | BUG-2 | Needs 2 authenticated users in same tenant | Create 2 users, verify User A cannot GET User B's conversation |
| Reply All includes CC | BUG-1 | Needs email service integration | Send replyAll=true, verify CC recipients in queued email |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
