---
phase: 117
slug: email-send-reply-forward
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 117 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright CDP + custom assertion helpers (validation-helpers.mjs) |
| **Config file** | `scripts/lib/validation-helpers.mjs` |
| **Quick run command** | `node scripts/validate-email-send.mjs --provider=gmail` |
| **Full suite command** | `node scripts/validate-email-send.mjs` |
| **Estimated runtime** | ~60 seconds (all providers, live network) |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/validate-email-send.mjs --provider=gmail`
- **After every plan wave:** Run `node scripts/validate-email-send.mjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 117-01-01 | 01 | 1 | WRITE-05 | integration | `npx tsc --noEmit` (backend) | Yes | pending |
| 117-02-01 | 02 | 1 | WRITE-01 | integration (live) | `node scripts/validate-email-send.mjs --provider=gmail` | No -- W0 | pending |
| 117-02-02 | 02 | 1 | WRITE-02 | integration (live) | `node scripts/validate-email-send.mjs --provider=outlook` | No -- W0 | pending |
| 117-02-03 | 02 | 1 | WRITE-03 | integration (live) | `node scripts/validate-email-send.mjs --provider=imap` | No -- W0 | pending |
| 117-02-04 | 02 | 1 | WRITE-04 | integration (live) | `node scripts/validate-email-send.mjs` (reply sub-test) | No -- W0 | pending |
| 117-02-05 | 02 | 1 | WRITE-05 | integration (live) | `node scripts/validate-email-send.mjs` (forward sub-test) | No -- W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-email-send.mjs` — orchestrator script (WRITE-01 through WRITE-05)
- [ ] `scripts/lib/validate-email-send.mjs` — per-provider validation logic module
- [ ] Bug fix: `backend/src/modules/email/services/email-send.service.ts` `forwardEmail()` — include original attachments (prerequisite for WRITE-05)

*Validation-helpers.mjs shared infrastructure already exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reply appears in same thread in provider web UI | WRITE-04 | Thread grouping is provider-side UI behavior | Open Gmail/Outlook web UI, find the replied email, confirm it's in the same thread |
| Sent email visible in provider Sent folder | WRITE-01/02/03 | Provider-side folder sync may lag | Open provider web UI, check Sent folder within 30 seconds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
