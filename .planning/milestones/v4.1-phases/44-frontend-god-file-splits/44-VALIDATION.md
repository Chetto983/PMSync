---
phase: 44
slug: frontend-god-file-splits
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 + TypeScript compiler |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts` |
| **Estimated runtime** | ~30 seconds (type-check) / ~60 seconds (Playwright) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | TEST-07 | visual-regression | `cd frontend && npx playwright test e2e/visual-regression-splits.spec.ts --update-snapshots` | W0 creates | pending |
| 44-01-02 | 01 | 1 | QUAL-11 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-02-01 | 02 | 2 | QUAL-09 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-02-02 | 02 | 2 | QUAL-10 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-03-01 | 03 | 2 | QUAL-13 | type-check | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-03-02 | 03 | 2 | QUAL-12 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-04-01 | 04 | 3 | QUAL-08 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-04-02 | 04 | 3 | QUAL-07 | type-check + visual | `cd frontend && npx tsc --noEmit` | existing | pending |
| 44-04-03 | 04 | 3 | QUAL-14 | script | `find frontend/src -name "*.tsx" -o -name "*.ts" \| xargs wc -l \| awk '{if ($1>400) print}'` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `frontend/e2e/visual-regression-splits.spec.ts` — Playwright screenshot tests for all 6 pages (calendar, contacts, header, contact-detail, dashboard, settings)
- [ ] Golden screenshot baselines generated before any splits (first `--update-snapshots` run)
- [ ] Line count verification script for QUAL-14

*Wave 0 must be completed before any splits begin.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| email-ui-store consumer API unchanged | QUAL-13 | Type-check catches type errors but not runtime behavior | Verify email list, compose, kanban views all function after store split |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
