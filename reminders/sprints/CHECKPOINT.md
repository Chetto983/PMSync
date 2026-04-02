# Reminder Sprint — Checkpoint

## Status
- **Sprint:** 05 — Recurring Reminders — COMPLETE
- **Last Task Completed:** T-0508 — Type-check + unit tests
- **Next Task:** Sprint 06 — Reminder/FollowUp Unification
- **Tasks Done:** 8/8
- **SP Completed:** 16/16
- **Last Updated:** 2026-04-02 19:00

## Audit Findings Addressed
- C1: No pre-deadline alerts — ✅ fixed in S01
- C2: AI tools incomplete — ✅ fixed in S02
- C3: Email monitor O(N*K) query — ✅ fixed in S01
- C4: No Socket.IO events for Reminder — ✅ fixed in S01, frontend wired in S03
- C5: Telegram hardcoded Italian — ✅ fixed in S01
- H1: Notification scheduling not transactional — ✅ fixed in S01
- H2: No jitter on delayed jobs — ✅ fixed in S01
- H3: Email monitor batch across all tenants — ✅ fixed in S01
- M1: No recurring reminders — ✅ fixed in S05

## Last Modified Files
- backend/prisma/schema.prisma (isRecurring, recurrenceRule, recurrenceParentId fields + self-ref FK)
- backend/prisma/migrations/20260402180000_add_recurring_reminders/migration.sql
- backend/src/modules/reminder/services/reminder-recurrence.service.ts (NEW — rrule parsing)
- backend/src/modules/reminder/services/reminder.service.ts (completeReminder hook + createNextOccurrence)
- backend/src/modules/reminder/services/reminder-alert-scheduler.service.ts (expired recurring auto-create)
- backend/src/modules/reminder/services/reminder-ai-parser.service.ts (is_recurring + recurrence_rule in schema/prompt)
- backend/src/modules/reminder/dto/create-reminder.dto.ts (isRecurring, recurrenceRule)
- backend/src/modules/reminder/dto/update-reminder.dto.ts (isRecurring, recurrenceRule)
- backend/src/modules/reminder/reminder.module.ts (ReminderRecurrenceService registered)
- frontend/components/reminders/ReminderEditDialog.tsx (recurrence select)
- frontend/components/reminders/ReminderCard.tsx (recurring badge)
- frontend/lib/api/reminders.ts (Reminder type + UpdateReminderDto updated)
- frontend/locales/en.ts, it.ts, index.ts (recurrence i18n keys)
- backend/src/modules/reminder/services/__tests__/reminder-recurrence.service.spec.ts (NEW — 14 tests)

## Key Decisions Made
- Used `rrule` npm library for RFC 5545 RRULE parsing (no hand-rolled logic)
- Self-referencing FK `recurrenceParentId` links child instances to parent series
- Max 365 future instances for unbounded rules (safety cap)
- Bare RRULE (no DTSTART) anchors to current time — DTSTART should be prepended for deterministic behavior
- onDelete: SetNull for recurrenceParent FK — deleting parent doesn't cascade to children
- AI parser maps Italian ("ogni lunedì") and English ("weekly") to RRULE strings
- Frontend presets: None/Daily/Weekly/Monthly/Custom (custom shows RRULE text input)

## Blockers / Notes
- prisma migrate dev shadow DB still fails — manual migration created (same as S04)
- "View series" link (T-0507) shows badge only, series navigation deferred to future sprint

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Unit tests: ✅ 14/14 passing (ReminderRecurrenceService)
- Production deployment: ⏳ pending push
