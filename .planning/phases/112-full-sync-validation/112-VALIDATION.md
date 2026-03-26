---
phase: 112
slug: full-sync-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 112 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js scripts (mjs) + Playwright CDP for authenticated API calls |
| **Config file** | none — scripts are standalone validation runners |
| **Quick run command** | `node scripts/validate-full-sync.mjs --provider gmail --quick` |
| **Full suite command** | `node scripts/validate-full-sync.mjs --all` |
| **Estimated runtime** | ~30 seconds per provider |

---

## Sampling Rate

- **After every task commit:** Run quick validation for the provider being worked on
- **After every plan wave:** Run full suite command across all providers
- **Before `/gsd:verify-work`:** Full suite must be green for all 3 providers
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 112-01-01 | 01 | 1 | SYNC-01 | integration | `node scripts/validate-full-sync.mjs --provider gmail` | ❌ W0 | ⬜ pending |
| 112-01-02 | 01 | 1 | SYNC-02 | integration | `node scripts/validate-full-sync.mjs --provider outlook` | ❌ W0 | ⬜ pending |
| 112-01-03 | 01 | 1 | SYNC-03 | integration | `node scripts/validate-full-sync.mjs --provider imap` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-full-sync.mjs` — main validation runner
- [ ] `scripts/lib/validation-helpers.mjs` — shared helpers (API calls, assertions, reporting)
- [ ] Playwright CDP connection to Edge for authenticated session reuse

*Wave 0 creates the validation script infrastructure that all tasks use.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual folder hierarchy in UI | SYNC-01/02/03 | Requires rendering check | Open email sidebar, verify nested folders match provider |
| Email body rendering fidelity | SYNC-01/02/03 | HTML rendering comparison | Open 5 emails per provider, compare body to webmail |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
