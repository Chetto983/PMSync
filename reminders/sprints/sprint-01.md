# Sprint 01 — Scheduler, Email Monitor & Scalability

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Critical Fixes |
| **Sprint** | 01 di 06 |
| **Obiettivo Sprint** | Aggiungere alert pre-scadenza (24h/1h/overdue) per la tabella Reminder, ottimizzare email monitor per 10K tenant, aggiungere Socket.IO events, fix scheduling transactional e jitter. |
| **Capacità** | 21 SP |

---

## Sprint Backlog

- [ ] T-0101 — Creare `ReminderAlertSchedulerService` che ogni 5 min controlla `Reminder` con `scadenzaDatetime` futuro e emette Socket.IO events: `reminder:upcoming` (24h prima), `reminder:imminent` (1h prima), `reminder:overdue` (passata scadenza), `reminder:expired` (>48h auto-annulla). Salvare in `InAppNotification`. — [3 SP]
- [ ] T-0102 — Registrare `ScheduledJobType.REMINDER_ALERT_CHECK` nel `ScheduledJobsQueueService` con cron `*/5 * * * *`. Handler delega a `ReminderAlertSchedulerService`. — [1 SP]
- [ ] T-0103 — Aggiungere campi `lastRemindedAt` e `remindCount` al modello Prisma `Reminder` per evitare notifiche duplicate (max 3 per imminent, 1 per upcoming). Creare migration. — [2 SP]
- [ ] T-0104 — Aggiungere Socket.IO event types in `realtime.types.ts`: `reminder:upcoming`, `reminder:imminent`, `reminder:overdue`, `reminder:completed`, `reminder:telegram-sent`. Payload: `{ reminderId, titolo, contatto, scadenzaDatetime, tenantId, userId }`. — [1 SP]
- [ ] T-0105 — Emettere `reminder:completed` e `reminder:telegram-sent` da `ReminderService.completeReminder()` e `ReminderNotifyQueueService.processNotification()`. — [1 SP]
- [ ] T-0106 — Fix email monitor query: sostituire `OR` per-keyword con singola query `subject ILIKE ANY(keywords) OR snippet ILIKE ANY(keywords)` usando raw SQL o Prisma `$queryRaw`. Aggiungere index `[tenantId, isDeleted, receivedAt]` sulla tabella Email. — [3 SP]
- [ ] T-0107 — Fix email monitor batch: aggiungere cursor-based pagination per tenant equo. Ogni run processa max 50 reminders per tenant, round-robin. — [2 SP]
- [ ] T-0108 — Fix scheduling transactional: wrappare `reminder.create` + `scheduleNotification` in try/catch. Se scheduling fallisce, loggare warning ma non far fallire la creazione. Aggiungere flag `notificationScheduled: boolean` al modello. — [2 SP]
- [ ] T-0109 — Aggiungere jitter ±30 secondi random al delay dei delayed jobs in `ReminderNotifyQueueService.scheduleNotification()` per evitare spike simultanei su Telegram API. — [1 SP]
- [ ] T-0110 — Locale-aware Telegram messages: leggere `locale` dalle preferenze utente (`User.preferences.locale` o default `it`). Creare dizionario `telegram-messages.ts` con tutte le stringhe (`PROMEMORIA`/`REMINDER`, `Scadenza:`/`Deadline:`, `EMAIL RILEVATA`/`EMAIL DETECTED`, `URGENTE`/`URGENT`, `attivi · monitora mail`/`active · monitoring mail`, `Controlla la mail`/`Check your email`). Usare in `TelegramBotService.sendReminderNotification()`, `sendDigest()`, `sendImmediateAlert()` e in `ReminderEmailMonitorService`. — [3 SP]
- [ ] T-0111 — Type-check backend + frontend, test unitari per `ReminderAlertSchedulerService`. — [2 SP]

---

## Dipendenze

- `ReminderNotifyQueueService` (appena implementato) deve essere stabile.
- `RealtimeEventsService` deve supportare nuovi event types.

## Rischi

1. **Duplicate alerts** — Senza `lastRemindedAt` il job ogni 5 min manda alerts duplicati. T-0103 previene.
2. **Email monitor performance** — Raw SQL potrebbe avere behavior diverso da Prisma query builder. Testare con EXPLAIN ANALYZE.
3. **Migration** — Aggiunta `lastRemindedAt` e `remindCount` richiede `prisma db push` prima del deploy.

## Definition of Done

- [ ] Reminder con `scadenzaDatetime` riceve alert 24h prima, 1h prima, e overdue
- [ ] Socket.IO events emessi per tutti i lifecycle events
- [ ] Email monitor query O(N) non O(N*K) per reminder
- [ ] Email monitor equo tra tenant (cursor-based)
- [ ] Jitter ±30s sui delayed jobs
- [ ] Scheduling robusto: creazione reminder non fallisce se BullMQ job scheduling fallisce
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa
