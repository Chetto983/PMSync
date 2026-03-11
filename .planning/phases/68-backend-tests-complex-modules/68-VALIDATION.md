---
phase: 68
slug: backend-tests-complex-modules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 with ts-jest 29.4.6 |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="68" --no-coverage` |
| **Full suite command** | `cd backend && npx jest --coverage` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern="(calendar|contacts|providers|subscription).*spec" --no-coverage`
- **After every plan wave:** Run `cd backend && npx jest --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (per-module pattern run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-01 | 01 | 0 | BTEST-01 | unit | `cd backend && npx jest ics-parser.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-01-02 | 01 | 0 | BTEST-01 | integration | `cd backend && npx jest calendar-conflict.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-01-03 | 01 | 0 | BTEST-01 | integration | `cd backend && npx jest google-calendar-sync.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-01-04 | 01 | 0 | BTEST-01 | integration | `cd backend && npx jest google-calendar-webhook.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-02-01 | 02 | 0 | BTEST-02 | integration | `cd backend && npx jest contact-sync.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-02-02 | 02 | 0 | BTEST-02 | integration | `cd backend && npx jest relationship-score.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-02-03 | 02 | 0 | BTEST-02 | integration | `cd backend && npx jest contacts-cache.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-02-04 | 02 | 0 | BTEST-02 | integration | `cd backend && npx jest google-contacts-webhook.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-03-01 | 03 | 0 | BTEST-03 | integration | `cd backend && npx jest google-oauth.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-03-02 | 03 | 0 | BTEST-03 | integration | `cd backend && npx jest provider-config.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-03-03 | 03 | 0 | BTEST-03 | integration | `cd backend && npx jest imap.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-04-01 | 04 | 0 | BTEST-04 | integration | `cd backend && npx jest subscription.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-04-02 | 04 | 0 | BTEST-04 | unit | `cd backend && npx jest usage-tracking.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-04-03 | 04 | 0 | BTEST-04 | unit | `cd backend && npx jest quota.guard.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 68-04-04 | 04 | 0 | BTEST-04 | integration | `cd backend && npx jest subscription-lifecycle.service.spec.ts --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All spec files must be created before test tasks run (they don't exist yet):

- [ ] `backend/src/modules/calendar/services/__tests__/ics-parser.service.spec.ts` — BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/calendar-conflict.service.spec.ts` — BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/google-calendar-sync.service.spec.ts` — BTEST-01
- [ ] `backend/src/modules/calendar/services/__tests__/google-calendar-webhook.service.spec.ts` — BTEST-01
- [ ] `backend/src/modules/contacts/services/__tests__/contact-sync.service.spec.ts` — BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/relationship-score.service.spec.ts` — BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/contacts-cache.service.spec.ts` — BTEST-02
- [ ] `backend/src/modules/contacts/services/__tests__/google-contacts-webhook.service.spec.ts` — BTEST-02
- [ ] `backend/src/modules/providers/services/__tests__/google-oauth.service.spec.ts` — BTEST-03
- [ ] `backend/src/modules/providers/services/__tests__/provider-config.service.spec.ts` — BTEST-03
- [ ] `backend/src/modules/providers/services/__tests__/imap.service.spec.ts` — BTEST-03
- [ ] `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` — BTEST-04
- [ ] `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts` — BTEST-04
- [ ] `backend/src/modules/subscription/services/__tests__/quota.guard.spec.ts` — BTEST-04
- [ ] `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` — BTEST-04

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
