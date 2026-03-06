---
phase: 50
slug: schema-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-06
---

# Phase 50 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | backend/jest.config.ts, frontend/vitest.config.ts |
| **Quick run command** | `cd backend && npx prisma validate` |
| **Full suite command** | `cd backend && npx prisma validate && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit --skipLibCheck` |
| **Estimated runtime** | ~15 seconds (quick), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 50-01-01 | 01 | 1 | CORE-06, CORE-07 | unit + validate | `cd frontend && npx vitest run lib/__tests__/hibp.test.ts; cd ../backend && npx prisma validate` | pending |
| 50-01-02 | 01 | 1 | CORE-06 | type-check | `cd frontend && npx prisma generate && npx tsc --noEmit --skipLibCheck 2>&1 \| head -100` | pending |
| 50-02-01 | 02 | 2 | CORE-06 | type-check | `cd backend && npx tsc --noEmit 2>&1 \| head -100` | pending |
| 50-02-02 | 02 | 2 | CORE-06 | manual | Human verifies both servers start and auth routes respond | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

No Wave 0 test stubs required. Phase 50 validation uses:
- `npx prisma validate` for schema correctness
- `npx tsc --noEmit` for type safety
- `npx vitest run` for HIBP unit tests (created inline by Task 50-01-01)
- Human checkpoint for cross-service integration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie visible in browser DevTools as httpOnly | CORE-06 | Browser-only check | 1. Start dev servers 2. Sign up 3. Open DevTools > Application > Cookies 4. Verify `better-auth.session_token` is httpOnly, SameSite=Lax |
| NestJS consumer reads session from shared DB | CORE-06 | Cross-process integration | 1. Sign up via Next.js 2. Call NestJS endpoint with session cookie 3. Verify 200 response with user context |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
