---
phase: 118
slug: drafts-bulk-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 118 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js mjs validation scripts (established pattern from phases 112-117) |
| **Config file** | none — scripts are self-contained |
| **Quick run command** | `node scripts/validate-drafts.mjs --quick` |
| **Full suite command** | `node scripts/validate-drafts.mjs && node scripts/validate-bulk-ops.mjs` |
| **Estimated runtime** | ~30 seconds (live Railway API calls) |

---

## Sampling Rate

- **After every task commit:** Run validation script for the specific area modified
- **After every plan wave:** Run full suite against Railway production
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 118-01-01 | 01 | 1 | WRITE-06 | integration | `node scripts/validate-drafts.mjs` | ❌ W0 | ⬜ pending |
| 118-01-02 | 01 | 1 | WRITE-07 | integration | `node scripts/validate-bulk-ops.mjs --mark` | ❌ W0 | ⬜ pending |
| 118-01-03 | 01 | 1 | WRITE-08 | integration | `node scripts/validate-bulk-ops.mjs --move` | ❌ W0 | ⬜ pending |
| 118-01-04 | 01 | 1 | WRITE-09 | integration | `node scripts/validate-bulk-ops.mjs --delete` | ❌ W0 | ⬜ pending |
| 118-01-05 | 01 | 1 | WRITE-10 | integration | `node scripts/validate-bulk-ops.mjs --labels` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-drafts.mjs` — draft CRUD lifecycle validation
- [ ] `scripts/validate-bulk-ops.mjs` — bulk operations validation (mark, move, delete, labels)

*Scripts follow established pattern from phases 112-117 validation scripts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| IMAP draft save | WRITE-06 | Railway blocks IMAP ports 993/143 | Mark as Blocked (Infrastructure) — same as WRITE-03 |

*All other behaviors have automated verification via Railway API.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
