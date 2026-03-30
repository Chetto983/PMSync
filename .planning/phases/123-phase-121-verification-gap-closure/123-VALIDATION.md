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
| **Full suite command** | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` |
| **Estimated runtime** | ~5 minutes (timed delivery polling adds ~4min delay) |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/validate-scheduling-signatures-templates.mjs`
- **After every plan wave:** Run full validation suite with `--check=all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (excluding timed-delivery poll)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 123-01-T1 | 01 | 1 | INFRA-06 | syntax | `node -c scripts/lib/validate-scheduling.mjs` | Yes | pending |
| 123-01-T2 | 01 | 1 | INFRA-10 | syntax | `node -c scripts/lib/validate-signatures.mjs` | Yes | pending |
| 123-02-T1 | 02 | 2 | INFRA-06,07,08,09,10 | e2e | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` | Yes | pending |
| 123-02-T2 | 02 | 2 | INFRA-06,07,08,09,10 | doc | `test -f .planning/phases/121-scheduling-signatures-templates/121-VERIFICATION.md` | No | pending |
| 123-02-T3 | 02 | 2 | ALL | checkpoint | Human approval of verification results | N/A | pending |

*Plan 01 has 2 tasks (script enhancement). Plan 02 has 3 tasks (live run + VERIFICATION.md + human approval).*

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] Enhance `scripts/lib/validate-scheduling.mjs` with timed delivery polling for INFRA-06 (`--check=timed-delivery`)
- [ ] Enhance `scripts/lib/validate-signatures.mjs` with signature content DB verification for INFRA-10 (`--check=signature-content`)
- [ ] Update orchestrator to route `--check=timed-delivery` and `--check=signature-content` flags

*Existing infrastructure covers most phase requirements. Only INFRA-06 timed poll and INFRA-10 body content check need enhancement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timed email fires at scheduled time | INFRA-06 | BullMQ cron timing requires real-time observation via Edge CDP | Schedule email 2min ahead, poll GET /emails/scheduled until status changes |
| Cancelled email not delivered | INFRA-07 | Requires scheduling then cancelling before cron fires | Schedule 3min ahead, cancel immediately, verify status remains cancelled after scheduled time passes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (excluding timed-delivery poll)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
