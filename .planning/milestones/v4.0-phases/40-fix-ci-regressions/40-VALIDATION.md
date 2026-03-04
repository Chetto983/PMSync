---
phase: 40
slug: fix-ci-regressions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (grep/test commands for CI workflow files) |
| **Config file** | none — no test framework needed |
| **Quick run command** | `grep -c "paths:" .github/workflows/frontend-ci.yml; grep -c "echo.*OpenAPI" .github/workflows/ci.yml; test ! -f frontend/lib/utils/auth-token.ts && echo PASS` |
| **Full suite command** | Same as quick run — 3 smoke checks |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run all 3 smoke checks
- **After every plan wave:** Run all 3 smoke checks
- **Before `/gsd:verify-work`:** All 3 checks must pass
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | SC-1 | smoke | `grep -c "paths:" .github/workflows/frontend-ci.yml` (expect 0 or error) | N/A | ⬜ pending |
| 40-01-02 | 01 | 1 | SC-2 | smoke | `grep -c "echo.*OpenAPI" .github/workflows/ci.yml` (expect 0) | N/A | ⬜ pending |
| 40-01-03 | 01 | 1 | SC-3 | smoke | `test ! -f frontend/lib/utils/auth-token.ts && echo PASS` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework or stub files needed — verification is via file content checks and file existence.

---

## Manual-Only Verifications

All phase behaviors have automated verification (grep/test smoke commands).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
