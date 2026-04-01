# Reminder System — Audit Findings

**Data audit:** 2026-04-01
**Auditor:** Claude Code
**Scope:** Backend services, frontend components, AI tools, database schema, queue jobs, Socket.IO events

---

## Files Audited

| Area | File | Verdict |
|------|------|---------|
| Reminder CRUD | `backend/src/modules/reminder/services/reminder.service.ts` | OK — minor gaps |
| AI Parser | `backend/src/modules/reminder/services/reminder-ai-parser.service.ts` | OK |
| Telegram Notify Queue | `backend/src/modules/telegram/services/reminder-notify.queue.ts` | OK — needs jitter |
| Telegram Scheduler | `backend/src/modules/telegram/services/telegram-scheduler.service.ts` | OK — rehydration only |
| Email Monitor | `backend/src/modules/telegram/services/reminder-email-monitor.service.ts` | WARN — O(N*K) query |
| FollowUp Scheduler | `backend/src/modules/ai/services/reminder-scheduler.service.ts` | OK — only handles FollowUp |
| Telegram Bot | `backend/src/modules/telegram/services/telegram-bot.service.ts` | OK |
| Reminder Controller | `backend/src/modules/reminder/controllers/reminder.controller.ts` | OK |
| AI Tools | `backend/src/modules/ai-chat/tools/reminder-tools.service.ts` | WARN — only 2/6 tools |
| Tool Domains | `backend/src/modules/ai-chat/constants/tool-domains.ts` | WARN — 4 registered, 2 built |
| Realtime Types | `backend/src/modules/realtime/types/realtime.types.ts` | WARN — no reminder events |
| Realtime Events | `backend/src/modules/realtime/services/realtime-events.service.ts` | WARN — no reminder emitters |
| Queue Config | `backend/src/common/services/scheduled-jobs.queue.ts` | OK |
| Prisma Schema | `backend/prisma/schema.prisma` (Reminder model) | OK — minor index gaps |
| Frontend Board | `frontend/components/reminders/RemindersBoard.tsx` | OK |
| Frontend Card | `frontend/components/reminders/ReminderCard.tsx` | OK — missing indicators |
| Frontend Create | `frontend/components/reminders/ReminderCreateDialog.tsx` | OK |
| Frontend Edit | `frontend/components/reminders/ReminderEditDialog.tsx` | OK |
| Frontend Hooks | `frontend/hooks/queries/use-reminders.ts` | OK — no Socket.IO |
| Frontend API | `frontend/lib/api/reminders.ts` | OK |

---

## Finding Details

### C1 — No pre-deadline alerts for Reminder table
- **Severity:** CRITICAL
- **Location:** `backend/src/modules/ai/services/reminder-scheduler.service.ts`
- **Description:** `ReminderSchedulerService` only processes `emailFollowUp` table. The `Reminder` table has NO scheduler for upcoming (24h), imminent (1h), or overdue alerts. Users only get notification at exact `scadenzaDatetime` via `ReminderNotifyQueueService`.
- **Impact:** User sets reminder "Monday 2pm" but gets zero warning beforehand.
- **Fix:** Sprint 01 — T-0101, T-0102, T-0103

### C2 — AI tools incomplete (2 of 6)
- **Severity:** CRITICAL
- **Location:** `backend/src/modules/ai-chat/tools/reminder-tools.service.ts`
- **Description:** `tool-domains.ts` registers `update_reminder` and `delete_reminder` but `ReminderToolsService` only builds `create_reminder` and `list_reminders`. Missing: `complete_reminder`, `update_reminder`, `delete_reminder`, `snooze_reminder`.
- **Impact:** AI can create reminders but cannot manage them. Users must switch to UI.
- **Fix:** Sprint 02 — T-0201 through T-0207

### C3 — Email monitor O(N*K) query
- **Severity:** CRITICAL
- **Location:** `backend/src/modules/telegram/services/reminder-email-monitor.service.ts:146`
- **Description:** For each reminder, builds `OR` clause with N subqueries (one per keyword, each with subject + snippet). 100 reminders × 5 keywords = 500 subqueries per job run.
- **Impact:** Query timeout at 10K tenants. DB CPU spike every 5 minutes.
- **Fix:** Sprint 01 — T-0106

### C4 — No Socket.IO events for Reminder table
- **Severity:** CRITICAL
- **Location:** `backend/src/modules/realtime/types/realtime.types.ts`
- **Description:** Only `followup:reminder:*` events exist. No events for reminder lifecycle (created, completed, telegram-sent, overdue).
- **Impact:** Frontend never updates in real-time when reminders change.
- **Fix:** Sprint 01 — T-0104, T-0105

### C5 — Telegram messages hardcoded Italian
- **Severity:** CRITICAL
- **Location:** `backend/src/modules/telegram/services/telegram-bot.service.ts` (lines 145, 155, 162, 186, 198, 223), `reminder-email-monitor.service.ts:180`
- **Description:** All Telegram notification strings are hardcoded Italian: `*PROMEMORIA*`, `Scadenza:`, `attivi · monitora mail`, `*EMAIL RILEVATA*`, `URGENTE: ... Nessuna risposta ricevuta`, `Controlla la mail e aggiorna lo stato`. No locale lookup from user preferences.
- **Impact:** English-speaking users receive Italian Telegram messages.
- **Fix:** Sprint 01 — T-0110

### H1 — Notification scheduling not transactional
- **Severity:** HIGH
- **Location:** `backend/src/modules/reminder/services/reminder.service.ts:135`
- **Description:** `scheduleNotification()` runs after Prisma create. If Redis/BullMQ is down, reminder exists but notification job never scheduled.
- **Fix:** Sprint 01 — T-0108

### H2 — No jitter on delayed jobs
- **Severity:** HIGH
- **Location:** `backend/src/modules/telegram/services/reminder-notify.queue.ts:119`
- **Description:** All reminders at same time fire simultaneously. 50 reminders at 10:00 = 50 Telegram API calls at once.
- **Fix:** Sprint 01 — T-0109

### H3 — Email monitor batch across all tenants
- **Severity:** HIGH
- **Location:** `backend/src/modules/telegram/services/reminder-email-monitor.service.ts:57`
- **Description:** `take: 100` loads reminders across ALL tenants. Tenant with 90 active reminders starves other tenants.
- **Fix:** Sprint 01 — T-0107
