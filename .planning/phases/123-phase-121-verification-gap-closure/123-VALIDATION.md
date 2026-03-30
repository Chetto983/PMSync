---
phase: 123
slug: phase-121-verification-gap-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (mjs) + curl/API calls |
| **Config file** | `scripts/validate-scheduling-signatures-templates.mjs` |
| **Quick run command** | `node scripts/validate-scheduling-signatures-templates.mjs` |
| **Full suite command** | `node scripts/validate-scheduling-signatures-templates.mjs` |
| **Estimated runtime** | ~60 seconds (timed delivery polling adds delay) |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/validate-scheduling-signatures-templates.mjs`
- **After every plan wave:** Run full validation suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 123-01-01 | 01 | 1 | INFRA-06 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --infra-06` | ✅ | ⬜ pending |
| 123-01-02 | 01 | 1 | INFRA-07 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --infra-07` | ✅ | ⬜ pending |
| 123-01-03 | 01 | 1 | INFRA-08 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --infra-08` | ✅ | ⬜ pending |
| 123-01-04 | 01 | 1 | INFRA-09 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --infra-09` | ✅ | ⬜ pending |
| 123-01-05 | 01 | 1 | INFRA-10 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --infra-10` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Enhance `scripts/validate-scheduling-signatures-templates.mjs` with timed delivery polling for INFRA-06
- [ ] Add signature-content-in-body verification for INFRA-10

*Existing infrastructure covers most phase requirements. Only INFRA-06 timed poll and INFRA-10 body content check need enhancement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timed email fires at scheduled time | INFRA-06 | BullMQ cron timing requires real-time observation | Schedule email 2min ahead, poll GET /emails/scheduled until status changes |
| Cancelled email not delivered | INFRA-07 | Requires scheduling then cancelling before cron fires | Schedule 3min ahead, cancel immediately, verify status remains cancelled after scheduled time passes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
