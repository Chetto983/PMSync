---
phase: 96
slug: ui-ux-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 96 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + vitest (unit) |
| **Config file** | `frontend/playwright.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npm run type-check && npx playwright test` |
| **Estimated runtime** | ~30 seconds (type-check), ~120 seconds (Playwright) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd frontend && npm run type-check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 96-01-01 | 01 | 0 | UIPOL-01 | unit | `cd frontend && npx tsc --noEmit` | ⬜ W0 | ⬜ pending |
| 96-02-01 | 02 | 1 | UIPOL-01 | visual | `grep -r "EmptyState" frontend/src/` | ⬜ W0 | ⬜ pending |
| 96-02-02 | 02 | 1 | UIPOL-02 | visual | `grep -r "Skeleton" frontend/src/` | ⬜ W0 | ⬜ pending |
| 96-02-03 | 02 | 1 | UIPOL-03 | visual | `grep -r "QueryErrorAlert" frontend/src/` | ⬜ W0 | ⬜ pending |
| 96-03-01 | 03 | 2 | UIPOL-04 | responsive | `grep -r "useMediaQuery" frontend/src/` | ⬜ W0 | ⬜ pending |
| 96-03-02 | 03 | 2 | UIPOL-05 | theme | `grep -r "dark" frontend/src/theme/` | ✅ | ⬜ pending |
| 96-04-01 | 04 | 2 | UIPOL-06 | a11y | `grep -r "tabIndex\|aria-" frontend/src/` | ⬜ W0 | ⬜ pending |
| 96-04-02 | 04 | 2 | UIPOL-07 | i18n | `diff <(grep -oP "\\w+(?=:)" frontend/locales/en.ts) <(grep -oP "\\w+(?=:)" frontend/locales/it.ts)` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/common/EmptyState.tsx` — reusable empty state component
- [ ] `frontend/src/components/common/QueryErrorAlert.tsx` — reusable error + retry component
- [ ] Translation key gap analysis script

*These are shared components that all subsequent plans depend on.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Empty state illustrations render correctly | UIPOL-01 | Visual appearance | Open each page with no data, verify illustration + CTA |
| Skeleton matches content layout | UIPOL-02 | Visual layout matching | Compare skeleton shape to loaded content |
| Mobile layout (375px) | UIPOL-04 | Responsive visual | Resize to 375px, verify no overflow/hidden content |
| Dark mode no white flash | UIPOL-05 | Runtime visual | Toggle dark mode, verify no flash or unthemed elements |
| Keyboard navigation flow | UIPOL-06 | Interactive flow | Tab through all interactive elements on each page |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
