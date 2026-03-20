---
phase: 91
slug: calendar-contacts-reminders-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (backend), Playwright CDP (frontend E2E) |
| **Config file** | backend/jest.config.ts, frontend/playwright.config.ts |
| **Quick run command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx jest --no-coverage --forceExit` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx jest --no-coverage --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 91-01-01 | 01 | 1 | BAPI-06 | manual + unit | `cd backend && npx jest --testPathPattern="calendar" --no-coverage` | ✅ existing | ⬜ pending |
| 91-01-02 | 01 | 1 | BAPI-23 | manual | `cd backend && npx tsc --noEmit` | ✅ existing | ⬜ pending |
| 91-02-01 | 02 | 1 | BAPI-07 | manual + unit | `cd backend && npx jest --testPathPattern="contacts" --no-coverage` | ✅ existing | ⬜ pending |
| 91-02-02 | 02 | 1 | FE-08 | manual (CDP) | `cd frontend && npx tsc --noEmit` | ✅ existing | ⬜ pending |
| 91-03-01 | 03 | 1 | BAPI-12 | manual | `cd backend && npx tsc --noEmit` | ❌ gap | ⬜ pending |
| 91-03-02 | 03 | 1 | FE-14 | manual (CDP) | `cd frontend && npx tsc --noEmit` | ❌ gap | ⬜ pending |
| 91-04-01 | 01 | 1 | FE-07 | manual (CDP) | `cd frontend && npx tsc --noEmit` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Backend Jest tests exist for calendar and contacts. Frontend verification is manual/CDP-based, consistent with Phase 89/90 patterns.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Calendar event CRUD via FullCalendar UI | FE-07 | FullCalendar rendering requires browser, drag-drop interaction | Open calendar page, create event via dialog, edit via click, delete via detail panel |
| RSVP buttons respond to calendar invites | BAPI-23, FE-07 | Requires real email with calendar invite attachment | Find email with .ics attachment, click RSVP accept/decline/tentative |
| Contacts VIP toggle and bulk delete | FE-08 | Interactive multi-select and toggle behavior | Select multiple contacts, verify bulk delete; toggle VIP on contact detail |
| vCard import (API-only, no UI) | BAPI-07 | No frontend UI exists, API-only verification | `curl -X POST /contacts/import/vcard` with test .vcf file |
| Reminders Kanban/filtered view | FE-14 | Status filter chips + card rendering requires browser | Open reminders page, verify filter chips work, create/complete/delete reminders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
