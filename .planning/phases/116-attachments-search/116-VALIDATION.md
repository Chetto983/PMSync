---
phase: 116
slug: attachments-search
status: draft
nyquist_compliant: false
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
| **Config file** | `backend/tests/validation/116-attachments-search/` |
| **Quick run command** | `node backend/tests/validation/116-attachments-search/validate-attachments-search.mjs --provider gmail` |
| **Full suite command** | `node backend/tests/validation/116-attachments-search/validate-attachments-search.mjs` |
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
| 116-01-01 | 01 | 1 | READ-06 | integration | `node validate-attachments-search.mjs --module attachment-download` | ❌ W0 | ⬜ pending |
| 116-01-02 | 01 | 1 | READ-07 | integration | `node validate-attachments-search.mjs --module on-demand-fetch` | ❌ W0 | ⬜ pending |
| 116-01-03 | 01 | 1 | READ-08 | integration | `node validate-attachments-search.mjs --module folder-stats` | ❌ W0 | ⬜ pending |
| 116-01-04 | 01 | 1 | READ-09 | integration | `node validate-attachments-search.mjs --module search` | ❌ W0 | ⬜ pending |
| 116-02-01 | 02 | 2 | READ-06..09 | live | `node validate-attachments-search.mjs --live` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/validation/116-attachments-search/validate-attachments-search.mjs` — orchestrator script
- [ ] `backend/tests/validation/116-attachments-search/modules/` — per-requirement validation modules

*Reuses existing validation infra from phases 112-115.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Binary file opens correctly | READ-06 | Need to verify content renders | Download attachment, open in appropriate app |
| Search relevance quality | READ-09 | Subjective relevance judgment | Search for known terms, verify results make sense |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
