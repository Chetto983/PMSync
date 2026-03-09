---
phase: 53
slug: frontend-auth-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) + TypeScript compiler (build) |
| **Config file** | `frontend/playwright.config.ts` |
| **Quick run command** | `cd frontend && npm run type-check` |
| **Full suite command** | `cd frontend && npx playwright test e2e/auth.spec.ts && npm run type-check && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run type-check`
- **After every plan wave:** Run `cd frontend && npx playwright test e2e/auth.spec.ts && npm run type-check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | FEUI-01 | e2e | `npx playwright test e2e/auth.spec.ts` | Exists (needs update) | ⬜ pending |
| 53-01-02 | 01 | 1 | FEUI-02 | build | `npm run type-check` | N/A | ⬜ pending |
| 53-02-01 | 02 | 2 | FEUI-03 | build | `npm run type-check` (zero old imports) | N/A | ⬜ pending |
| 53-02-02 | 02 | 2 | FEUI-04 | e2e | `npx playwright test e2e/auth.spec.ts` | Exists (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/auth.setup.ts` — update: inject `better-auth.session_token` cookie instead of `access_token`
- [ ] `e2e/auth.spec.ts` — update: selectors for better-auth-ui forms (not MUI forms)
- [ ] `e2e/fixtures.ts` — update: remove `/auth/me` mock, update cookie name
- [ ] Framework install: `npm install @daveyplate/better-auth-ui@latest sonner`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| useSession provides correct user shape | FEUI-02 | Requires running app with real session | 1. Login via UI 2. Open React DevTools 3. Verify useSession().data.user has firstName, lastName, role |
| Session expiry toast/redirect | FEUI-02 | Requires waiting for session timeout or manual cookie deletion | 1. Login 2. Delete session cookie in DevTools 3. Trigger API call 4. Verify toast + redirect to /auth/login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
