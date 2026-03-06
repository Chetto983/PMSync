---
phase: 50
slug: schema-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | backend/jest.config.ts, frontend/vitest.config.ts |
| **Quick run command** | `cd backend && npx jest --testPathPattern="auth" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage && cd ../frontend && npx vitest run` |
| **Estimated runtime** | ~30 seconds (quick), ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="auth" --no-coverage`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | CORE-06 | unit | `npx jest --testPathPattern="better-auth-schema"` | ❌ W0 | ⬜ pending |
| 50-01-02 | 01 | 1 | CORE-06 | integration | `npx jest --testPathPattern="better-auth-init"` | ❌ W0 | ⬜ pending |
| 50-02-01 | 02 | 1 | CORE-06 | integration | `npx jest --testPathPattern="session-cookie"` | ❌ W0 | ⬜ pending |
| 50-02-02 | 02 | 1 | CORE-07 | unit | `npx jest --testPathPattern="hibp"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/auth/__tests__/better-auth-schema.spec.ts` — stubs for CORE-06 (schema validation)
- [ ] `backend/src/auth/__tests__/better-auth-init.spec.ts` — stubs for CORE-06 (instance init)
- [ ] `backend/src/auth/__tests__/session-cookie.spec.ts` — stubs for CORE-06 (cookie config)
- [ ] `backend/src/auth/__tests__/hibp.spec.ts` — stubs for CORE-07 (HIBP check)

*Test stubs created in Wave 0, filled during plan execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie visible in browser DevTools as httpOnly | CORE-06 | Browser-only check | 1. Start dev servers 2. Sign up 3. Open DevTools > Application > Cookies 4. Verify `better-auth.session_token` is httpOnly, SameSite=Lax |
| NestJS consumer reads session from shared DB | CORE-06 | Cross-process integration | 1. Sign up via Next.js 2. Call NestJS endpoint with session cookie 3. Verify 200 response with user context |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
