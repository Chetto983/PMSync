---
phase: 90
slug: email-operations-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + Jest (backend unit) |
| **Config file** | `frontend/playwright.config.ts` (E2E), `backend/jest.config.js` (unit) |
| **Quick run command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx jest --passWithNoTests && cd ../frontend && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 90-01-01 | 01 | 1 | BAPI-02 | unit | `cd backend && npx jest --testPathPattern="email-crud\|email-send\|email-bulk\|email-search" --passWithNoTests` | ✅ Partial | ⬜ pending |
| 90-01-02 | 01 | 1 | BAPI-03 | unit | `cd backend && npx jest --testPathPattern="email-folder" --passWithNoTests` | ✅ | ⬜ pending |
| 90-01-03 | 01 | 1 | BAPI-04 | manual | Manual API test via authenticated session | ❌ | ⬜ pending |
| 90-01-04 | 01 | 1 | BAPI-05 | manual | Manual API test via authenticated session | ❌ | ⬜ pending |
| 90-01-05 | 01 | 1 | BAPI-25 | unit | `cd backend && npx jest --testPathPattern="attachment-streaming" --passWithNoTests` | ✅ Partial | ⬜ pending |
| 90-02-01 | 02 | 1 | FE-03 | manual | Live browser verification | ❌ | ⬜ pending |
| 90-02-02 | 02 | 1 | FE-04 | manual | Live browser verification | ❌ | ⬜ pending |
| 90-02-03 | 02 | 1 | FE-05 | manual | Live browser verification | ❌ | ⬜ pending |
| 90-02-04 | 02 | 1 | FE-12 | unit | `cd frontend && npx jest --testPathPattern="use-labels" --passWithNoTests` | ✅ | ⬜ pending |
| 90-02-05 | 02 | 1 | FE-13 | unit | `cd frontend && npx jest --testPathPattern="use-folders\|folder-utils" --passWithNoTests` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This is a verification phase — the goal is live audit, not test suite expansion.

- No E2E test specs exist for email operations (FE-03, FE-04, FE-05) — verification is manual/live
- No backend spec files for signatures or templates controllers — verification is manual API testing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signature CRUD via API | BAPI-04 | No spec file exists | Hit POST/GET/PUT/DELETE /signatures endpoints with authenticated session |
| Template CRUD via API | BAPI-05 | No spec file exists | Hit POST/GET/PUT/DELETE /templates endpoints with authenticated session |
| Email list renders with filters | FE-03 | No E2E spec, requires live Gmail | Open app, verify Inbox loads, apply filters, search, paginate |
| Thread view renders messages | FE-04 | No E2E spec, requires live Gmail | Open an email thread, verify messages/attachments/actions render |
| Compose works end-to-end | FE-05 | No E2E spec, requires live Gmail | New compose, reply, forward — verify draft save, schedule, undo |
| Scheduled send fires on time | BAPI-02 | BullMQ job timing requires real delay | Schedule email 1-2min out, verify it sends |
| Undo send cancels properly | FE-05 | May be client-side delay only | Send email, click undo within window, verify cancellation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
