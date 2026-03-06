---
phase: 43
slug: contract-tests-backend-god-file-splits
status: draft
nyquist_compliant: false
wave_0_complete: false
wave_0_note: "Plans create their own Wave 0 tests (characterization tests written BEFORE splits, contract tests in Task 1). This is a self-covering pattern -- no pre-existing test stubs needed."
created: 2026-03-05
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest 29.4.6 |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="<pattern>" --forceExit` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests --ci --forceExit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="<changed-area>" --forceExit`
- **After every plan wave:** Run `cd backend && npx jest --passWithNoTests --ci --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | APIS-01, APIS-02, TEST-04 | unit + CI | `npx jest --testPathPattern="contract" --forceExit` + `grep contract-test .github/workflows/ci.yml` | W0 (self-created) | pending |
| 43-01-02 | 01 | 1 | APIS-03, APIS-04 | integration | `npx jest --testPathPattern="attachment-streaming" --forceExit` | W0 (self-created) | pending |
| 43-02-01 | 02 | 1 | QUAL-01, TEST-06 | unit + wc | `npx jest --testPathPattern="email-sync-back.pre-split" --forceExit` | W0 (self-created) | pending |
| 43-02-02 | 02 | 1 | QUAL-02, TEST-06 | unit + wc | `npx jest --testPathPattern="auth.pre-split" --forceExit` | W0 (self-created) | pending |
| 43-03-01 | 03 | 1 | QUAL-03, TEST-06 | unit + wc | `npx jest --testPathPattern="emails-controller" --forceExit` | W0 (self-created) | pending |
| 43-03-02 | 03 | 1 | QUAL-04, TEST-06 | unit + wc | `npx jest --testPathPattern="email-insights" --forceExit` | W0 (self-created) | pending |
| 43-03-03 | 03 | 1 | QUAL-05, TEST-06 | unit + wc | `npx jest --testPathPattern="contacts" --forceExit` | W0 (self-created) | pending |
| 43-04-01 | 04 | 2 | QUAL-06 | script | `wc -l` on all 22 files + `awk '$1>=400'` | N/A (verification only) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 test files are created by the plans themselves as part of the task actions:

- [ ] `backend/test/contract/*.contract.spec.ts` -- created by Plan 01 Task 1 (covers APIS-01, TEST-04)
- [ ] `backend/src/modules/email/controllers/__tests__/attachment-streaming.spec.ts` -- created by Plan 01 Task 2 (covers APIS-03, APIS-04)
- [ ] `backend/src/modules/email/services/__tests__/email-sync-back.pre-split.spec.ts` -- created by Plan 02 Task 1 (covers QUAL-01, TEST-06)
- [ ] `backend/src/modules/auth/services/__tests__/auth.pre-split.spec.ts` -- created by Plan 02 Task 2 (covers QUAL-02, TEST-06)
- [ ] `backend/src/modules/email/controllers/__tests__/emails-controller.pre-split.spec.ts` -- created by Plan 03 Task 1 (covers QUAL-03, TEST-06)
- [ ] `backend/src/modules/ai/services/__tests__/email-insights.pre-split.spec.ts` -- created by Plan 03 Task 2 (covers QUAL-04, TEST-06)
- [ ] `backend/src/modules/contacts/services/__tests__/contacts.pre-split.spec.ts` -- created by Plan 03 Task 3 (covers QUAL-05, TEST-06)
- [ ] `.github/workflows/ci.yml` contract-test step -- created by Plan 01 Task 1 (covers APIS-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI fails on contract divergence | APIS-02 | Requires actual CI run | Push branch, verify pipeline fails with spec mismatch |
| 50MB+ attachment memory stays flat | TEST-05 | Requires memory profiling with real large file in live env | Run with `--max-old-space-size=256`, stream 50MB file, verify no OOM via `process.memoryUsage()` |

NOTE: TEST-05 automated coverage is partial. Plan 43-01 Task 2 verifies the streaming mechanism (no `arrayBuffer` call, `pipeline` used, Content-Length passthrough) but does NOT verify memory stays flat under >=50MB load. The 50MB memory profiling test requires a live environment and is listed here as manual verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (self-covering pattern documented)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
