---
phase: 116
slug: attachments-search
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-26
---

# Phase 116 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js validation scripts (.mjs) + Playwright for binary downloads |
| **Orchestrator** | `scripts/validate-attachments-search.mjs` |
| **Module** | `scripts/lib/validate-attachments-search.mjs` |
| **Quick run command** | `node scripts/validate-attachments-search.mjs --provider=gmail --quick` |
| **Full suite command** | `node scripts/validate-attachments-search.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for one provider
- **After every plan wave:** Run full suite command (all providers)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 116-01-01 | 01 | 1 | READ-06..09 | static | `node -e "import('./scripts/lib/validate-attachments-search.mjs').then(m => { if (typeof m.validateAttachmentsSearch !== 'function') process.exit(1); })"` | W0 | pending |
| 116-01-02 | 01 | 1 | READ-06..09 | static | `node -e "import('./scripts/validate-attachments-search.mjs').catch(e => { if (/9222\|CDP\|ECONNREFUSED/.test(e.message)) process.exit(0); process.exit(1); })"` | W0 | pending |
| 116-02-01 | 02 | 2 | READ-06..09 | live | `node scripts/validate-attachments-search.mjs --provider=gmail --quick` | W0 | pending |
| 116-02-02 | 02 | 2 | READ-06..09 | checkpoint | Human verifies full provider suite output | -- | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-attachments-search.mjs` -- orchestrator script (created by Plan 01 Task 2)
- [ ] `scripts/lib/validate-attachments-search.mjs` -- validation logic module (created by Plan 01 Task 1)

*Reuses existing validation infra from phases 112-115 (`scripts/lib/validation-helpers.mjs`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Binary file opens correctly | READ-06 | Need to verify content renders | Download attachment, open in appropriate app |
| Search relevance quality | READ-09 | Subjective relevance judgment | Search for known terms, verify results make sense |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
