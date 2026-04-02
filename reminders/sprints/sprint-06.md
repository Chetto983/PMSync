# Sprint 06 — Reminder / FollowUp Unification

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 2 — Feature Completeness |
| **Sprint** | 06 di 06 |
| **Obiettivo Sprint** | Unificare i due sistemi paralleli (Reminder creato utente + EmailFollowUp rilevato AI) in un'unica vista e API. Eliminare confusione UX dove l'utente ha promemoria in due posti diversi. |
| **Capacità** | 14 SP |

---

## Sprint Backlog

- [x] T-0601 — Creare endpoint unificato `GET /reminders/unified` che combina `Reminder` + `EmailFollowUp` in un unico formato. Aggiungere campo `source: 'user' | 'ai-followup'` per distinguere. Sort unificato per `scadenzaDatetime / dueDate`. — [3 SP] — ✅ DONE
- [x] T-0602 — Creare `UnifiedReminderDto` che mappa entrambi i modelli: `{ id, source, titolo, descrizione, contatto, scadenzaDatetime, priorita, status, emailSubject?, emailFrom?, monitoraEmail, telegramInviato }`. — [1 SP] — ✅ DONE
- [x] T-0603 — Aggiungere azioni per follow-ups nell'endpoint unificato: `POST /reminders/unified/:id/resolve`, `POST /reminders/unified/:id/snooze`. Routing interno basato su `source`. — [2 SP] — ✅ DONE
- [x] T-0604 — Frontend: modificare `RemindersBoard` per usare endpoint unificato. Aggiungere filter chip "Fonte" (Tutti, Utente, AI Follow-up). — [2 SP] — ✅ DONE
- [x] T-0605 — Frontend: `ReminderCard` deve gestire entrambi i tipi. Follow-ups mostrano email subject/from. Reminders mostrano contatto/azione. Badge "AI" per follow-ups. — [2 SP] — ✅ DONE
- [x] T-0606 — Aggiungere "Converti in promemoria" su follow-up cards: crea `Reminder` da `EmailFollowUp` con campi pre-compilati, poi resolve il follow-up. — [2 SP] — ✅ DONE
- [x] T-0607 — Type-check backend + frontend. Validazione E2E su Railway/Vercel. Sprint finale: cleanup e E2E completo. — [2 SP] — ✅ DONE

---

## Dipendenze

- Sprint 01-05 completati.
- `EmailFollowUp` model e `FollowUpService` devono essere stabili.
- `ReminderSchedulerService` (follow-up scheduler) continua a funzionare per follow-ups.

## Rischi

1. **Breaking change API** — L'endpoint unificato aggiunge complessità. Mantenere i vecchi endpoint per backward compat.
2. **Sorting cross-model** — `Reminder.scadenzaDatetime` e `EmailFollowUp.dueDate` hanno formati potenzialmente diversi. Normalizzare in DTO.
3. **Notification conflict** — Un follow-up convertito in reminder potrebbe ricevere doppia notifica (dal scheduler follow-up E dal reminder notify queue). Mitigazione: risolvere follow-up prima di creare reminder.

## Definition of Done

- [x] Una singola pagina "Promemoria" mostra sia reminders utente che follow-ups AI
- [x] Filter "Fonte" filtra per user-created vs AI-detected
- [x] Follow-up può essere convertito in reminder con un click
- [x] Azioni resolve/snooze funzionano per entrambi i tipi
- [x] Nessuna notifica duplicata tra i due sistemi (convert resolves follow-up first)
- [x] `cd backend && npx tsc --noEmit` passa
- [x] `cd frontend && npx tsc --noEmit` passa
- [ ] E2E validato su Railway/Vercel
