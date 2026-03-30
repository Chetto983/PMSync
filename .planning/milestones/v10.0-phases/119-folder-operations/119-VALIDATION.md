---
phase: 119
slug: folder-operations
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-30
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright/Edge CDP validation scripts |
| **Config file** | `scripts/validate-folder-ops.mjs` (orchestrator) |
| **Quick run command** | `node -c scripts/validate-folder-ops.mjs` (syntax check, Wave 1) |
| **Full suite command** | `node scripts/validate-folder-ops.mjs --provider=gmail` (live validation, Wave 2) |
| **Estimated runtime** | ~60 seconds (live run) |

---

## Sampling Rate

- **After Wave 1 task commit:** Run `node -c scripts/validate-folder-ops.mjs && node -c scripts/lib/validate-folder-ops.mjs` (syntax gate)
- **After Wave 2 Task 1:** Run `node scripts/validate-folder-ops.mjs --provider=gmail` (functional gate)
- **Before `/gsd:verify-work`:** Full live validation must be green + human checkpoint approved
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 119-01-01 | 01 | 1 | FOLD-01..05 | syntax | `node -c scripts/validate-folder-ops.mjs` | ❌ W0 | ⬜ pending |
| 119-01-02 | 01 | 1 | FOLD-01..05 | syntax | `node -c scripts/lib/validate-folder-ops.mjs` | ❌ W0 | ⬜ pending |
| 119-02-01 | 02 | 2 | FOLD-01..05 | live E2E | `node scripts/validate-folder-ops.mjs --provider=gmail` | depends on W1 | ⬜ pending |
| 119-02-02 | 02 | 2 | FOLD-04 | manual | Human checkpoint: external folder sync | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-folder-ops.mjs` — orchestrator entry point (created by Plan 01 Task 1)
- [ ] `scripts/lib/validate-folder-ops.mjs` — test logic library (created by Plan 01 Task 2)
- [ ] `scripts/lib/validation-helpers.mjs` — already exists (shared auth/CSRF/reporting utilities)

*Wave 0 = Plan 01 (Wave 1). Scripts are created as the first wave, then executed in Wave 2.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| External folder changes sync locally | FOLD-04 | Requires creating folder in provider web UI | 1. Create folder in Gmail/Outlook web UI. 2. POST /folders/sync/:id. 3. Confirm new folder appears in local DB. |
| IMAP provider folder ops | FOLD-01..05 | Railway blocks IMAP ports | Document as infrastructure-blocked (consistent with WRITE-03) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
