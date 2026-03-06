---
phase: 45
slug: forwardref-burn-down
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (NestJS testing) |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx nest start --entryFile main 2>&1 | head -20` |
| **Full suite command** | `cd backend && npm run test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx nest start --entryFile main 2>&1 | head -20` (bootstrap check)
- **After every plan wave:** Run `cd backend && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green + `grep -r forwardRef backend/src | wc -l` <= 12
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | DEBT-01 | integration | `cd backend && npx nest start --entryFile main 2>&1 \| head -20` | N/A | pending |
| 45-01-02 | 01 | 1 | DEBT-02 | grep | `grep -r forwardRef backend/src/modules/cache \| wc -l` | N/A | pending |
| 45-02-01 | 02 | 1 | DEBT-03 | integration | `cd backend && npx nest start --entryFile main 2>&1 \| head -20` | N/A | pending |
| 45-02-02 | 02 | 1 | DEBT-04 | grep | `grep -r forwardRef backend/src/modules/email-sync \| wc -l` | N/A | pending |
| 45-03-01 | 03 | 2 | DEBT-05 | integration | `cd backend && npx nest start --entryFile main 2>&1 \| head -20` | N/A | pending |
| 45-04-01 | 04 | 2 | TEST-08 | unit | `cd backend && npm run test` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

No new test framework or config needed. Validation relies on:
1. NestJS bootstrap success (no circular dependency warnings)
2. `grep -r forwardRef backend/src | wc -l` count
3. Existing test suite passing unchanged

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
