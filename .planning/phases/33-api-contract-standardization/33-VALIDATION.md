---
phase: 33
slug: api-contract-standardization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend) / vitest (frontend) |
| **Config file** | `backend/jest.config.ts` / `frontend/vitest.config.ts` |
| **Quick run command** | `npm run type-check` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests && cd ../frontend && npm run type-check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | API-01 | integration | `curl + jq shape check` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | API-02 | integration | `curl error endpoint + shape check` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | API-03 | integration | `curl raw route → 404` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | API-04 | integration | `curl -v + check x-request-id header` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | PERF-04 | manual | `browser console audit` | N/A | ⬜ pending |
| TBD | 04 | 2 | API-05 | CI | `npx spectral lint` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test infrastructure already exists — no Wave 0 needed for framework
- [ ] Integration test scripts may be added per-plan

*Existing infrastructure covers framework requirements. Per-endpoint verification scripts created during execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Silent fallback elimination | PERF-04 | Requires browser console inspection | Open dashboard, disconnect API, verify error cards render instead of mock data |
| Frontend error card UX | PERF-04 | Visual verification | Trigger API error, verify muted card + retry button + collapsible details |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
