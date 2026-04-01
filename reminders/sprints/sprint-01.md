# Sprint 01 — Scheduler, Email Monitor & Scalability

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Critical Fixes |
| **Sprint** | 01 di 06 |
| **Obiettivo Sprint** | Aggiungere alert pre-scadenza (24h/1h/overdue) per la tabella Reminder, ottimizzare email monitor per 10K tenant, aggiungere Socket.IO events, fix scheduling transactional e jitter. |
| **Capacità** | 21 SP |

---

## Sprint Backlog

- [x] T-0101 — Creare `ReminderAlertSchedulerService` — [3 SP] — DONE
- [x] T-0102 — Registrare `REMINDER_ALERT_CHECK` nel ScheduledJobsQueueService — [1 SP] — DONE
- [x] T-0103 — Aggiungere campi `lastRemindedAt` e `remindCount` + `notificationScheduled` al Reminder — [2 SP] — DONE
- [x] T-0104 — Socket.IO event types per Reminder lifecycle — [1 SP] — DONE (pre-existing)
- [x] T-0105 — Emettere `reminder:completed` e `reminder:telegram-sent` — [1 SP] — DONE
- [x] T-0106 — Fix email monitor O(N*K) query con ILIKE ANY + index — [3 SP] — DONE
- [x] T-0107 — Fix email monitor batch fairness per tenant (max 50/tenant) — [2 SP] — DONE
- [x] T-0108 — Fix scheduling transactional + `notificationScheduled` flag — [2 SP] — DONE
- [x] T-0109 — Jitter ±30s sui delayed jobs — [1 SP] — DONE
- [x] T-0110 — Locale-aware Telegram messages (telegram-messages.ts) — [3 SP] — DONE
- [x] T-0111 — Type-check + 7 unit tests per ReminderAlertSchedulerService — [2 SP] — DONE

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
