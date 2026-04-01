# Sprint 04 — Search, Bulk Ops & Audit Trail

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 2 — Feature Completeness |
| **Sprint** | 04 di 06 |
| **Obiettivo Sprint** | Aggiungere ricerca full-text, operazioni bulk, audit trail per GDPR, e cleanup colonne database inutilizzate. |
| **Capacità** | 14 SP |

---

## Sprint Backlog

- [ ] T-0401 — Aggiungere endpoint `GET /reminders/search?q=<text>` che cerca in `titolo`, `descrizione`, `contatto` con `ILIKE`. Aggiungere index GIN su `titolo` e `contatto`. — [2 SP]
- [ ] T-0402 — Aggiungere endpoint `PATCH /reminders/bulk` per cambio status/priorità multiplo. Body: `{ ids: string[], status?: ReminderStatus, priorita?: ReminderPriorita }`. Cancella notifiche per status non-attivo. — [3 SP]
- [ ] T-0403 — Frontend: aggiungere `SearchBar` in `RemindersBoard` sopra i filtri status. Debounce 300ms, chiama endpoint search. Mostrare risultati come lista filtrata. — [2 SP]
- [ ] T-0404 — Frontend: aggiungere dropdown "Azioni" nella bulk action bar con opzioni: "Segna completati", "Cambia priorità", "Elimina selezionati". Usare `useBulkUpdateReminders` mutation. — [2 SP]
- [ ] T-0405 — Backend: aggiungere audit log entries per reminder CRUD. Ogni create/update/delete/complete scrive in `AuditLog` con `action`, `entityType: 'Reminder'`, `entityId`, `changes` (JSON diff). — [2 SP]
- [ ] T-0406 — Rimuovere colonne `slotMattina`, `slotPomeriggio`, `slotSera` dal modello `TelegramSettings` (non più usate dopo migrazione a exact-time). Migration Prisma. — [1 SP]
- [ ] T-0407 — Type-check backend + frontend. Aggiungere hook `useBulkUpdateReminders` e endpoint search nel frontend API client. — [2 SP]

---

## Dipendenze

- Sprint 01-03 completati.
- `AuditModule` deve essere disponibile (esiste già nel codebase).

## Rischi

1. **Index GIN performance** — Su tabelle grandi, ILIKE con GIN può essere lento. Alternativa: `pg_trgm` extension.
2. **Bulk update + notification cancel** — Se 100 reminders cambiano status a "completato", 100 BullMQ job vanno cancellati. Potrebbe essere lento. Batch cancellation.
3. **Schema migration** — Rimozione colonne `slot*` richiede deploy coordinato: prima deploy codice senza riferimenti, poi migration.

## Definition of Done

- [ ] Ricerca "omron" trova tutti i reminder con keyword nel titolo/descrizione/contatto
- [ ] Bulk change status funziona su N reminders selezionati
- [ ] Audit log registra ogni operazione reminder
- [ ] Colonne slot* rimosse dal database
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa
