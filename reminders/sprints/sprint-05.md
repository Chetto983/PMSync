# Sprint 05 — Recurring Reminders

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 2 — Feature Completeness |
| **Sprint** | 05 di 06 |
| **Obiettivo Sprint** | Aggiungere promemoria ricorrenti (ogni giorno, settimana, mese, custom). Il sistema crea automaticamente la prossima istanza quando quella corrente viene completata o scade. |
| **Capacità** | 16 SP |

---

## Sprint Backlog

- [ ] T-0501 — Aggiungere campi al modello Prisma `Reminder`: `isRecurring: Boolean`, `recurrenceRule: String?` (RRULE format RFC 5545), `recurrenceParentId: String?` (FK a Reminder genitore). Migration. — [2 SP]
- [ ] T-0502 — Creare `ReminderRecurrenceService` che calcola prossima occorrenza da RRULE. Usa libreria `rrule` (npm). Metodo `getNextOccurrence(rule: string, after: Date): Date | null`. — [2 SP]
- [ ] T-0503 — Hook in `ReminderService.completeReminder()`: se `isRecurring && recurrenceRule`, creare clone del reminder con `scadenzaDatetime = nextOccurrence`. Schedulare notifica per il clone. — [3 SP]
- [ ] T-0504 — Hook in `ReminderAlertSchedulerService`: se reminder è `expired` e `isRecurring`, auto-creare prossima istanza invece di marcare expired. — [2 SP]
- [ ] T-0505 — Aggiungere AI parser support per ricorrenza: riconoscere "ogni lunedì", "every day", "una volta al mese". Mappare a RRULE nel `ReminderAiParserService`. — [2 SP]
- [ ] T-0506 — Frontend: aggiungere campo "Ricorrenza" nel `ReminderEditDialog` con select: Mai, Ogni giorno, Ogni settimana, Ogni mese, Custom (mostra input RRULE). — [2 SP]
- [ ] T-0507 — Frontend: mostrare badge "Ricorrente" su `ReminderCard` se `isRecurring=true`. Link "Vedi serie" per navigare alla lista di istanze. — [1 SP]
- [ ] T-0508 — Type-check backend + frontend. Test unitari per `ReminderRecurrenceService`. — [2 SP]

---

## Dipendenze

- Sprint 01: `ReminderAlertSchedulerService` deve gestire expired reminders.
- Sprint 02: AI tools `update_reminder` deve supportare `recurrenceRule`.

## Rischi

1. **RRULE parsing** — RRULE è complesso (timezone, EXDATE, COUNT, UNTIL). Usare libreria `rrule` per evitare bug.
2. **Infinite recurrence** — Senza `UNTIL` o `COUNT`, i promemoria ricorrenti generano istanze per sempre. Mitigazione: cap a 365 istanze future.
3. **Delete cascade** — Eliminare il parent ricorrente deve eliminare tutte le istanze future. Mantenere le completate.

## Definition of Done

- [ ] Reminder "chiama Marco ogni lunedì" crea nuova istanza automaticamente dopo completamento
- [ ] AI parser riconosce "ogni giorno", "weekly", "una volta al mese"
- [ ] Frontend mostra badge ricorrente e selettore ricorrenza in edit dialog
- [ ] Completare un reminder ricorrente crea automaticamente il prossimo
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa
