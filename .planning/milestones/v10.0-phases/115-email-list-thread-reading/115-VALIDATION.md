---
phase: 115
slug: email-list-thread-reading
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-26
---

# Phase 115 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | `backend/jest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=email --no-coverage --bail` |
| **Full suite command** | `cd backend && npx jest --testPathPattern=email --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=email --no-coverage --bail`
- **After every plan wave:** Run `cd backend && npx jest --testPathPattern=email --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 115-01-01 | 01 | 1 | READ-01 | e2e | `node scripts/validate-email-read.mjs --provider=gmail` | ❌ W0 | ⬜ pending |
| 115-01-02 | 01 | 1 | READ-02 | e2e | `node scripts/validate-email-read.mjs --provider=gmail` | ❌ W0 | ⬜ pending |
| 115-01-03 | 01 | 1 | READ-03 | e2e | `node scripts/validate-email-read.mjs --provider=gmail` | ❌ W0 | ⬜ pending |
| 115-01-04 | 01 | 1 | READ-04 | e2e | `node scripts/validate-email-read.mjs --provider=gmail` | ❌ W0 | ⬜ pending |
| 115-01-05 | 01 | 1 | READ-05 | e2e | `node scripts/validate-email-read.mjs --provider=gmail` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/validate-email-read.mjs` — E2E validation orchestrator for all READ requirements
- [ ] `scripts/lib/validate-email-read.mjs` — validation module with per-requirement checks
- [ ] `scripts/lib/validation-helpers.mjs` — shared helpers (already exists from Phase 112-114)

*Existing test infrastructure covers unit/integration; E2E validation scripts needed for phase-specific success criteria.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTML body renders correctly in browser | READ-05 | Visual rendering quality | Open email detail, verify HTML renders without XSS artifacts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
