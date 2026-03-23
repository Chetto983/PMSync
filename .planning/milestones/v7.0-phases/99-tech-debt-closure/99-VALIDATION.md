---
phase: 99
slug: tech-debt-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`.test.ts`) + Jest (`.spec.ts`) |
| **Config file** | `backend/vitest.config.ts` + `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run hybrid-search` |
| **Full suite command** | `cd backend && npx vitest run && npx jest --forceExit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx vitest run && npx jest --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 99-01-01 | 01 | 1 | BAPI-15 | unit | `cd backend && npx vitest run hybrid-search` | ✅ | ⬜ pending |
| 99-02-01 | 02 | 1 | SEC-05 | unit + script | `cd backend && npx jest better-auth-flows --forceExit` | ✅ | ⬜ pending |
| 99-03-01 | 03 | 1 | N/A | type-check | `cd frontend && npx tsc --noEmit` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hybrid search returns RRF-scored results on Railway | BAPI-15 | Requires deployed DB with SQL functions | Deploy migrations on Railway, call search endpoint, verify non-empty results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
