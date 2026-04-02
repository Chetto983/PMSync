---
phase: 142
slug: ai-background-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 142 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) |
| **Config file** | backend/jest.config.ts |
| **Quick run command** | `cd backend && npx jest --passWithNoTests --testPathPattern="auto-link\|email-category" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command + `cd backend && npx tsc --noEmit` + `cd frontend && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 142-01-01 | 01 | 1 | AI-01 | type-check | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 142-01-02 | 01 | 1 | AI-01 | type-check | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 142-01-03 | 01 | 1 | AI-02 | type-check | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 142-02-01 | 02 | 2 | AI-03 | type-check | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 142-02-02 | 02 | 2 | AI-01, AI-02, AI-03 | visual | manual | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Category chip visible in email list | AI-03 | Visual UI verification | Open email list, check colored chip next to auto-triaged emails |
| Contact/deal links in sidebar | AI-01, AI-02 | Requires real email data | View email with known contact, verify sidebar shows linked contact/deal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
