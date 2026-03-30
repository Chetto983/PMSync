---
phase: 121
slug: scheduling-signatures-templates
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-30
---

# Phase 121 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright CDP + Node.js mjs scripts (same as Phases 112-120) |
| **Config file** | `scripts/lib/validation-helpers.mjs` |
| **Quick run command** | `node scripts/validate-scheduling-signatures-templates.mjs --check=signatures` |
| **Full suite command** | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` |
| **Type-check command** | `cd backend && npx tsc --noEmit` |
| **Estimated runtime** | ~60 seconds (CDP connect + API calls) |

> **Note:** This phase does NOT use Jest unit tests. All validation is via CDP-authenticated API integration scripts following the established pattern from Phases 112-120. The backend code already exists -- this phase validates it works end-to-end on production.

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit` (if backend files changed) + `node -c scripts/lib/validate-*.mjs` (if scripts changed)
- **After every plan wave:** Run `node scripts/validate-scheduling-signatures-templates.mjs --check=all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 121-01-01 | 01 | 1 | INFRA-06 | type-check | `cd backend && npx tsc --noEmit` | N/A (existing file) | pending |
| 121-01-02 | 01 | 1 | INFRA-06..10 | syntax | `node -c scripts/validate-scheduling-signatures-templates.mjs && node -c scripts/lib/validate-scheduling.mjs && node -c scripts/lib/validate-signatures.mjs && node -c scripts/lib/validate-templates.mjs` | Wave 0 | pending |
| 121-02-01 | 02 | 2 | INFRA-06..10 | integration | `node scripts/validate-scheduling-signatures-templates.mjs --check=all` | Depends on 121-01-02 | pending |
| 121-02-02 | 02 | 2 | INFRA-06..10 | human-verify | Human reviews 5/5 PASS output | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 is satisfied by Plan 01, Task 2 which creates the CDP validation scripts:

- [ ] `scripts/validate-scheduling-signatures-templates.mjs` -- orchestrator script
- [ ] `scripts/lib/validate-scheduling.mjs` -- INFRA-06, INFRA-07 checks
- [ ] `scripts/lib/validate-signatures.mjs` -- INFRA-08, INFRA-10 checks
- [ ] `scripts/lib/validate-templates.mjs` -- INFRA-09 checks

All scripts must pass `node -c` syntax check. Wave 0 is complete when Plan 01 Task 2 finishes.

*No Jest spec files are required for this phase. Validation uses the CDP integration script approach established in Phases 112-120.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scheduled email fires within ~1 minute of scheduledAt | INFRA-06 | Requires time-based BullMQ cron processing | Schedule email 2min ahead, wait, verify delivery. Automated test only confirms creation + queue membership, NOT timed delivery. |
| Default signature persists across sessions | INFRA-08 | Requires browser session persistence | Set default, close browser, reopen, verify selection |
| Default template persists across sessions | INFRA-09 | Requires browser session persistence | Set default, close browser, reopen, verify selection |

---

## Validation Scope Limitations

**What automated validation proves:**
- INFRA-06: POST /emails/send with scheduledAt creates a pending ScheduledEmail record (confirmed via GET /emails/scheduled)
- INFRA-07: DELETE /emails/scheduled/:id removes the pending record
- INFRA-08: Full signature CRUD lifecycle works, default selection persists within a session
- INFRA-09: Full template CRUD lifecycle works including duplicate and categories
- INFRA-10: POST /emails/send without signatureId succeeds (default signature path exercised)

**What automated validation does NOT prove:**
- INFRA-06: Actual timed delivery (BullMQ cron must fire and send -- requires manual wait)
- INFRA-10: Email body actually contains the signature content (API response does not expose final body)

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered by Plan 01, Task 2 (CDP scripts, not Jest)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
