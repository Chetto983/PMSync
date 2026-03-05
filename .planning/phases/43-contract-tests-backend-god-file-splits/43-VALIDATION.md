---
phase: 43
slug: contract-tests-backend-god-file-splits
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 43-01-01 | 01 | 1 | APIS-01, TEST-04 | unit | `npx jest --testPathPattern="contract" --forceExit` | ❌ W0 | ⬜ pending |
| 43-01-02 | 01 | 1 | APIS-02 | CI config | Manual: verify ci.yml step added | ❌ W0 | ⬜ pending |
| 43-01-03 | 01 | 1 | APIS-03, APIS-04, TEST-05 | integration | `npx jest --testPathPattern="attachment.*stream" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-01 | 02 | 1 | QUAL-01, TEST-06 | unit + wc | `npx jest --testPathPattern="email-sync-back" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-02 | 02 | 1 | QUAL-02, TEST-06 | unit + wc | `npx jest --testPathPattern="auth\.(login\|token\|password)" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-03 | 02 | 2 | QUAL-03, TEST-06 | unit + wc | `npx jest --testPathPattern="email.*(query\|actions)" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-04 | 02 | 2 | QUAL-04, TEST-06 | unit + wc | `npx jest --testPathPattern="email-(analysis\|insight)" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-05 | 02 | 2 | QUAL-05, TEST-06 | unit + wc | `npx jest --testPathPattern="contact-(crud\|sync)" --forceExit` | ❌ W0 | ⬜ pending |
| 43-02-06 | 02 | 2 | QUAL-06 | script | `find backend/src -name "*.ts" \| xargs wc -l \| awk '$1>400'` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/contract/auth-login.contract.spec.ts` — stub for APIS-01, TEST-04
- [ ] `backend/test/contract/emails-list.contract.spec.ts` — stub for APIS-01, TEST-04
- [ ] `backend/test/contract/contacts-list.contract.spec.ts` — stub for APIS-01, TEST-04
- [ ] `backend/test/contract/ai-chat.contract.spec.ts` — stub for APIS-01, TEST-04
- [ ] `backend/test/contract/briefing.contract.spec.ts` — stub for APIS-01, TEST-04
- [ ] `backend/src/modules/email/controllers/__tests__/attachment-streaming.spec.ts` — covers APIS-03, APIS-04, TEST-05
- [ ] Pre-split characterization tests for each god-file — covers TEST-06
- [ ] CI workflow update for contract test gate — covers APIS-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI fails on contract divergence | APIS-02 | Requires actual CI run | Push branch, verify pipeline fails with spec mismatch |
| 50MB+ attachment memory stays flat | TEST-05 | Needs memory profiling in live env | Run with `--max-old-space-size=256`, stream 50MB file, no OOM |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
