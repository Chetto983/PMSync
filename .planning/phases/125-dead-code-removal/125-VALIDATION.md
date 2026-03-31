---
phase: 125
slug: dead-code-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 125 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), Next.js build (frontend) |
| **Config file** | `backend/jest.config.ts`, `frontend/tsconfig.json` |
| **Quick run command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && cd ../frontend && npm run type-check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` in the modified project
- **After every plan wave:** Run full type-check for both backend and frontend
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 125-01-01 | 01 | 1 | LEGC-01 | grep+tsc | `grep -r "@ApiBearerAuth" backend/src && cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 125-01-02 | 01 | 1 | LEGC-01 | grep+tsc | `grep -r "addBearerAuth" backend/src && cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 125-02-01 | 02 | 1 | LEGC-02 | grep | `grep -r "voltAgentApi\|multiAgentApi" frontend/src` | ✅ | ⬜ pending |
| 125-03-01 | 03 | 2 | LEGC-03 | build+tsc | `cd frontend && npm run type-check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Swagger shows cookie auth only | LEGC-01 | Visual check of /api/docs | Start backend, open /api/docs, verify no Bearer auth option |
| No broken layouts after Tailwind removal | LEGC-03 | Visual regression | Start frontend, navigate key pages, check for missing styles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
