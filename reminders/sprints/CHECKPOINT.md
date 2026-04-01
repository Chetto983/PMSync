# Reminder Sprint — Checkpoint

## Status
- **Sprint:** 01 — Scheduler, Email Monitor & Scalability
- **Last Task Completed:** T-0111 — Type-check + unit tests
- **Next Task:** Sprint 01 COMPLETE — Production validation pending
- **Tasks Done:** 11/11
- **SP Completed:** 21/21
- **Last Updated:** 2026-04-01 23:30

## Audit Findings Addressed
- C1: No pre-deadline alerts — DONE (T-0101, T-0102, T-0103)
- C3: Email monitor O(N*K) query — DONE (T-0106)
- C4: No Socket.IO events for Reminder — DONE (T-0104, T-0105)
- C5: Telegram hardcoded Italian — DONE (T-0110)
- H1: Notification scheduling not transactional — DONE (T-0108)
- H2: No jitter on delayed jobs — DONE (T-0109)
- H3: Email monitor batch across all tenants — DONE (T-0107)

## Last Modified Files
- backend/src/modules/reminder/services/reminder-alert-scheduler.service.ts (NEW)
- backend/src/modules/reminder/services/__tests__/reminder-alert-scheduler.service.spec.ts (NEW)
- backend/src/modules/telegram/utils/telegram-messages.ts (NEW)
- backend/src/common/interfaces/reminder-notify.interface.ts (NEW)
- backend/src/common/services/scheduled-jobs.queue.ts
- backend/src/modules/realtime/types/realtime.types.ts
- backend/src/modules/realtime/services/realtime-events.service.ts
- backend/src/modules/reminder/services/reminder.service.ts
- backend/src/modules/reminder/reminder.module.ts
- backend/src/modules/telegram/services/reminder-notify.queue.ts
- backend/src/modules/telegram/services/reminder-email-monitor.service.ts
- backend/src/modules/telegram/services/telegram-bot.service.ts
- backend/src/modules/telegram/telegram.module.ts
- backend/prisma/schema.prisma

## Key Decisions Made
- Used ±30s jitter on delayed jobs to prevent Telegram API spikes
- Raw SQL ILIKE ANY(array) instead of Prisma OR expansion for email monitor
- Per-tenant round-robin (max 50/tenant) for email monitor fairness
- IReminderNotifyQueue interface extracted to break ReminderModule↔TelegramModule circular dep
- User locale resolved from UserPreferences.language (default 'it' for backward compat)

## Blockers / Notes
- prisma db push done for schema changes (notificationScheduled, lastRemindedAt, remindCount, Email index)
- Production validation NOT yet done (git push + Railway/Vercel deploy pending)

## Validation Status
- Backend tsc: PASSING
- Frontend tsc: not checked (no frontend changes in S01)
- Unit tests: 7/7 passing (reminder-alert-scheduler.service.spec.ts)
