---
phase: 86
slug: ai-chat-bug-fix-migrate-to-official-patterns
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript `tsc --noEmit` (both backend + frontend) |
| **Config file** | `frontend/tsconfig.json`, `backend/tsconfig.json` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 86-01-01 | 01 | 1 | Tool UI migration | type-check | `cd frontend && npx tsc --noEmit` | N/A | pending |
| 86-02-01 | 02 | 1 | Thread persistence | type-check + manual | `cd frontend && npx tsc --noEmit` | N/A | pending |
| 86-03-01 | 03 | 2 | Legacy cleanup | type-check | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat history loads on thread switch | Thread persistence | Requires live backend + auth session | Open chat, switch threads, verify messages load |
| HITL approval card renders | Tool rendering | Requires AI model to invoke HIGH-risk tool | Trigger send_email, verify approve/deny buttons appear |
| Tool UIs render for all 21 tools | Tool rendering | Each tool needs AI to call it | Trigger various tools via chat prompts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
