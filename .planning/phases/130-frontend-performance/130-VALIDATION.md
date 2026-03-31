---
phase: 130
slug: frontend-performance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend), Next.js build + bundle-analyzer (frontend) |
| **Config file** | `frontend/next.config.ts` (analyzer), `backend/vitest.config.ts` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 130-01-01 | 01 | 1 | PERF-01 | bundle | `ANALYZE=true npm run build` | existing | pending |
| 130-01-02 | 01 | 1 | PERF-01 | build | `cd frontend && npx tsc --noEmit` | existing | pending |
| 130-02-01 | 02 | 1 | PERF-02 | type-check | `cd backend && npx tsc --noEmit` | existing | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `@next/bundle-analyzer` already installed and configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lighthouse scores hold or improve | PERF-01 | Requires browser-based Lighthouse audit | Run `npx lighthouse https://mail-agent-indol.vercel.app --output json` before and after |
| Lazy-loaded components render with fallbacks | PERF-01 | Visual UI verification | Navigate to calendar, CRM pipeline, email compose — verify Skeleton shown then content loads |
| Cache-Control headers present on GET endpoints | PERF-02 | Requires live backend inspection | `curl -I https://backend-production-78e1.up.railway.app/api/v1/labels` — check Cache-Control header |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
