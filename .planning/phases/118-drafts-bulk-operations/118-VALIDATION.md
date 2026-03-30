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
| **Quick run command** | `node scripts/validate-drafts-bulk.mjs --provider=gmail` |
| **Full suite command** | `node scripts/validate-drafts-bulk.mjs` |
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
| 118-01-T1 | 01 | 1 | WRITE-06 | unit | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 118-01-T2 | 01 | 1 | WRITE-06..10 | integration | `node -c scripts/validate-drafts-bulk.mjs` | ❌ W0 | ⬜ pending |
| 118-02-T1 | 02 | 2 | WRITE-06..10 | integration | `node scripts/validate-drafts-bulk.mjs` | ❌ W0 | ⬜ pending |
| 118-02-T2 | 02 | 2 | WRITE-06..10 | manual | human checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-drafts-bulk.mjs` — unified orchestrator for draft CRUD + bulk operations validation
- [ ] `scripts/lib/validate-drafts-bulk.mjs` — validation library (helpers, test functions)

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
