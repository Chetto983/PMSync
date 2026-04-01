# Reminder System — Audit & Hardening Roadmap

## Panoramica

Audit completo del sistema reminder di PMSync: promemoria utente, follow-up AI, email monitoring, notifiche Telegram, e AI chat tools.

- **Stato attuale:** Funzionale ma incompleto — crea e notifica ma manca gestione lifecycle
- **Formato:** solo developer, 6 sprint (~3 settimane), 2 fasi
- **Stima totale:** ~78 SP

---

## Cosa Funziona Già

| Capability                  | Modulo                                  | Status |
|-----------------------------|------------------------------------------|--------|
| Reminder CRUD               | `reminder/services/reminder.service.ts`  | ✅     |
| AI natural language parsing  | `reminder/services/reminder-ai-parser.ts`| ✅     |
| Exact-time Telegram notify   | `telegram/services/reminder-notify.queue` | ✅     |
| Email monitoring (5min)      | `telegram/services/reminder-email-monitor`| ✅     |
| Startup rehydration          | `telegram/services/telegram-scheduler`   | ✅     |
| Edit dialog (frontend)       | `components/reminders/ReminderEditDialog`| ✅     |
| AI tools: create + list      | `ai-chat/tools/reminder-tools.service`   | ✅     |
| FollowUp scheduler (15min)   | `ai/services/reminder-scheduler.service` | ✅     |
| Tenant scoping all queries   | All services                             | ✅     |
| Rate limiting on endpoints   | `reminder/controllers/reminder.controller`| ✅    |
| 60-day retention cleanup     | `data-cleanup.service.ts`                | ✅     |

---

## Cosa Manca (dall'Audit)

| Severity | Issue                                           | Sprint |
|----------|-------------------------------------------------|--------|
| CRITICAL | No upcoming/imminent alerts for Reminder table   | S01    |
| CRITICAL | AI tools missing update/delete/complete           | S02    |
| CRITICAL | Email monitor O(N*K) query at scale               | S01    |
| CRITICAL | No Socket.IO events for Reminder table            | S01    |
| HIGH     | Notification scheduling not transactional          | S01    |
| HIGH     | No jitter on delayed jobs (API spike)              | S01    |
| HIGH     | No user notification on delivery failure           | S03    |
| HIGH     | Email monitor batch hardcoded 100 across tenants   | S01    |
| HIGH     | Frontend no Socket.IO subscription                 | S03    |
| MEDIUM   | No search endpoint                                 | S04    |
| MEDIUM   | No bulk status change                              | S04    |
| MEDIUM   | No recurring reminders                             | S05    |
| MEDIUM   | Reminder vs FollowUp two separate systems           | S06    |
| MEDIUM   | No audit trail                                      | S04    |
| MEDIUM   | Unused slotMattina/Pomeriggio/Sera columns           | S04    |
| MEDIUM   | Missing optimistic updates                           | S03    |

---

## Fasi

### Phase 1 — Critical Fixes & Scalability (Sprint 01-03, ~48 SP)
Corregge tutti i bug critici e high-priority. Rende il sistema sicuro per 10K tenant.

### Phase 2 — Feature Completeness (Sprint 04-06, ~30 SP)
Aggiunge funzionalità mancanti: search, bulk ops, recurring, unification.

---

## Struttura Directory

```
reminders/
├── README.md                      ← questo file
├── docs/
│   └── AUDIT-FINDINGS.md          — Risultati audit completo
└── sprints/
    ├── sprint-01.md               — Scheduler + Email Monitor + Scalability
    ├── sprint-02.md               — AI Chat Tools Complete
    ├── sprint-03.md               — Frontend Real-time + UX
    ├── sprint-04.md               — Search, Bulk Ops, Audit Trail
    ├── sprint-05.md               — Recurring Reminders
    └── sprint-06.md               — Reminder/FollowUp Unification
```

---

## Esecuzione

Ogni sprint va eseguito con:
1. `cd backend && npx tsc --noEmit` dopo ogni modifica backend
2. `cd frontend && npx tsc --noEmit` dopo ogni modifica frontend
3. Validazione E2E su Railway/Vercel a fine sprint
4. Commit atomico per ogni task
