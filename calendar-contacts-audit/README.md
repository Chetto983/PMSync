# Calendar & Contacts Audit

Systematic verification and hardening of the Calendar and Contacts modules in PMSync.

Both modules are **production-grade** — this audit verifies end-to-end correctness, closes known gaps, hardens provider sync, and validates in production.

## Structure

```
calendar-contacts-audit/
├── docs/
│   ├── 00-AUDIT-FINDINGS.md        # Known gaps and issues
│   ├── 01-ROADMAP.md               # Gantt + sprint breakdown
│   └── 02-PRODUCTION-SCORECARD.md  # Score tracking
├── sprints/
│   ├── phase-1-calendar-backend-verification/
│   ├── phase-2-contacts-backend-verification/
│   ├── phase-3-sync-provider-hardening/
│   ├── phase-4-frontend-gap-closure/
│   ├── phase-5-data-quality-dedup/
│   └── phase-6-e2e-production-validation/
```

## Modules Covered

| Module | Backend Path | Frontend Path | Endpoints |
|--------|-------------|---------------|-----------|
| Calendar | `backend/src/modules/calendar/` | `frontend/components/calendar/` | 20+ |
| Calendar Invites | `backend/src/modules/email/controllers/email-calendar-invite.controller.ts` | `frontend/components/calendar/RSVPButtons.tsx` | 4 |
| Contacts | `backend/src/modules/contacts/` | `frontend/components/contacts/` | 20+ |
| Reminders | `backend/src/modules/reminder/` | `frontend/components/reminders/` | 6 |

## Known Gaps (Pre-Audit)

From Phase 91 research (2026-03-20):

1. **No vCard import frontend UI** — API exists but no component exposes it
2. **Contact history endpoint is a stub** — returns empty array always
3. **Calendar invites live in email module** — confusing wiring, needs verification
4. **Reminders "Kanban" is a filtered list** — not a true Kanban board
5. **RSVP buttons may not be fully wired** — needs E2E verification

## Sprint Executor

Use `/calendar-contacts-sprint` to start or resume audit work. Auto-advances to the next incomplete sprint when invoked without arguments.
