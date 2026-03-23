---
phase: 95
slug: dead-code-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 95 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 (frontend) + Vitest 4 (backend) |
| **Config file** | `frontend/jest.config.ts`, `backend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npx jest --passWithNoTests && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` in affected package
- **After every plan wave:** Run full suite (both packages type-check + tests)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 95-01-01 | 01 | 1 | CLN-03, CLN-04 | type-check | `cd frontend && npx tsc --noEmit` | N/A | ⬜ pending |
| 95-01-02 | 01 | 1 | CLN-01 | type-check | `cd frontend && npx tsc --noEmit` | N/A | ⬜ pending |
| 95-02-01 | 02 | 2 | CLN-01 | type-check | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` | N/A | ⬜ pending |
| 95-02-02 | 02 | 2 | CLN-01 | type-check | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` | N/A | ⬜ pending |
| 95-03-01 | 03 | 3 | CLN-06 | grep scan | `grep -rn "console\.\(log\|debug\)" backend/src --include="*.ts" --exclude-dir=__tests__ --exclude-dir=scripts --exclude-dir=test` | N/A | ⬜ pending |
| 95-03-02 | 03 | 3 | CLN-07 | install | `cd frontend && npm install && cd ../backend && npm install` | N/A | ⬜ pending |
| 95-03-03 | 03 | 3 | CLN-05 | unit test | `cd frontend && npx jest lib/api/ai.test.ts` | ✅ | ⬜ pending |
| 95-03-04 | 03 | 3 | CLN-02 | grep scan | `grep -rn ">[A-Z][a-z]" frontend/src --include="*.tsx"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This is a deletion-only phase — no new test infrastructure needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| i18n completeness in it.ts | CLN-02 | Translation quality needs human review | Verify new Italian translations are accurate, not machine-translated placeholders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
