---
phase: 70
slug: frontend-unit-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + jsdom + ts-jest |
| **Config file** | `frontend/jest.config.js` (exists) |
| **Quick run command** | `cd frontend && npx jest --testPathPattern="<file>" --no-coverage` |
| **Full suite command** | `cd frontend && npx jest --coverage` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest --testPathPattern="<file>" --no-coverage`
- **After every plan wave:** Run `cd frontend && npx jest --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green + coverage >= 30%
- **Max feedback latency:** ~10 seconds per file

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/calendar-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-02 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/contact-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-03 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/dashboard-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-04 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/folders-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-05 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/label-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-06 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/label-tree-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-07 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/sync-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-08 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui-store" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-09 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/compose-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-10 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/filter-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-11 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/kanban-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-12 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/selection-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-13 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/sidebar-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-01-14 | 01 | 1 | FTEST-01 | unit | `cd frontend && npx jest --testPathPattern="stores/email-ui/view-slice" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-01 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-emails" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-02 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-folders" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-03 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-contacts" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-04 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-organizations" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-05 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-settings" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-06 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-providers" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-07 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-labels" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-08 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-folder-metadata" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-09 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-billing" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-02-10 | 02 | 1 | FTEST-02 | unit | `cd frontend && npx jest --testPathPattern="hooks/queries/use-subscription-limits" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-03-01 | 03 | 2 | FTEST-03 | unit | `cd frontend && npx jest --testPathPattern="components/settings/SecurityMfaSection" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-03-02 | 03 | 2 | FTEST-03 | unit | `cd frontend && npx jest --testPathPattern="components/settings/SecurityPasswordSection" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-03-03 | 03 | 2 | FTEST-03 | unit | `cd frontend && npx jest --testPathPattern="components/settings/SecuritySessionsSection" --no-coverage` | ❌ W0 | ⬜ pending |
| 70-03-04 | 03 | 2 | FTEST-03 | unit | `cd frontend && npx jest --testPathPattern="components/settings/SecurityAccountsSection" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All 28 test files are new and must be created. No Wave 0 stubs needed — each plan creates its test files directly.

- [ ] `frontend/stores/calendar-store.test.ts` — FTEST-01
- [ ] `frontend/stores/contact-store.test.ts` — FTEST-01
- [ ] `frontend/stores/dashboard-store.test.ts` — FTEST-01
- [ ] `frontend/stores/folders-store.test.ts` — FTEST-01
- [ ] `frontend/stores/label-store.test.ts` — FTEST-01
- [ ] `frontend/stores/label-tree-store.test.ts` — FTEST-01
- [ ] `frontend/stores/sync-store.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui-store.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/compose-slice.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/filter-slice.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/kanban-slice.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/selection-slice.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/sidebar-slice.test.ts` — FTEST-01
- [ ] `frontend/stores/email-ui/view-slice.test.ts` — FTEST-01
- [ ] `frontend/hooks/queries/use-emails.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-folders.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-contacts.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-organizations.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-settings.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-providers.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-labels.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-folder-metadata.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-billing.test.ts` — FTEST-02
- [ ] `frontend/hooks/queries/use-subscription-limits.test.ts` — FTEST-02
- [ ] `frontend/components/settings/SecurityMfaSection.test.tsx` — FTEST-03
- [ ] `frontend/components/settings/SecurityPasswordSection.test.tsx` — FTEST-03
- [ ] `frontend/components/settings/SecuritySessionsSection.test.tsx` — FTEST-03
- [ ] `frontend/components/settings/SecurityAccountsSection.test.tsx` — FTEST-03

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
