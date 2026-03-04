---
phase: 34
slug: auth-security-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (backend unit) + Playwright (frontend E2E) |
| **Config file** | `backend/jest.config.js`, `frontend/playwright.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern "(crypto\|auth)" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --no-coverage && cd ../frontend && npx playwright test e2e/auth.spec.ts` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern "(crypto|auth)" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage && cd ../frontend && npx playwright test e2e/auth.spec.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | SEC-01 | unit | `cd backend && npx jest --testPathPattern auth.controller --no-coverage -t "cookie"` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | SEC-01 | unit | `cd backend && npx jest --testPathPattern auth.controller --no-coverage -t "logout"` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 1 | SEC-01 | unit | `cd backend && npx jest --testPathPattern handshake --no-coverage` | ❌ W0 | ⬜ pending |
| 34-02-01 | 02 | 2 | SEC-01 | e2e | `cd frontend && npx playwright test e2e/auth.spec.ts` | ✅ (needs update) | ⬜ pending |
| 34-02-02 | 02 | 2 | SEC-01 | e2e | `cd frontend && npx playwright test e2e/auth.spec.ts -g "websocket"` | ❌ W0 | ⬜ pending |
| 34-02-03 | 02 | 2 | SEC-01 | e2e | `cd frontend && npx playwright test` | ✅ (needs rewrite) | ⬜ pending |
| 34-03-01 | 03 | 1 | SEC-03 | unit | `cd backend && npx jest --testPathPattern crypto.service --no-coverage` | ❌ W0 | ⬜ pending |
| 34-03-02 | 03 | 1 | SEC-03 | unit | `cd backend && npx jest --testPathPattern crypto.service --no-coverage -t "cbc"` | ❌ W0 | ⬜ pending |
| 34-03-03 | 03 | 1 | SEC-03 | manual | `grep -r "aes-256-cbc" backend/src --include="*.ts"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/services/__tests__/crypto.service.spec.ts` — stubs for SEC-03 (GCM encrypt, CBC fallback decrypt)
- [ ] `backend/src/modules/auth/controllers/__tests__/auth.controller.cookie.spec.ts` — stubs for SEC-01 (cookie set/clear)
- [ ] `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` — stubs for SEC-01 (WS cookie auth)
- [ ] Update `frontend/e2e/fixtures.ts` — authHelper with cookie injection
- [ ] Update `frontend/e2e/auth.setup.ts` — cookie-based storage state

*Existing Jest + Playwright infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No JWT in localStorage after login | SEC-01 | Browser DevTools inspection | 1. Login. 2. Open DevTools > Application > Local Storage. 3. Confirm no `auth-storage` key with token. |
| AES-CBC audit confirms zero remaining usage | SEC-03 | Code audit | Run `grep -r "aes-256-cbc" backend/src --include="*.ts"`. Only `crypto.service.ts` decryptCbc fallback should remain. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
