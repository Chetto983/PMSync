# Sprint 06 — Deal Detail & Stage Automations

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 06 di 08 |
| **Date** | 2026-06-03 → 2026-06-16 |
| **Obiettivo Sprint** | Completare la vista dettaglio Deal con timeline attività e note. Implementare automazioni base su cambio stage tramite BullMQ (invio notifiche, creazione task). |
| **Capacità** | 17 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0601 — Completare pagina Deal detail: header con stage badge, progress bar pipeline, pulsanti azione (edit, delete, change stage) — [2 SP] — 📋 TODO
- [ ] T-0602 — Creare componente `DealTimeline` con MUI Timeline: mostra attività, note, cambi stage in ordine cronologico inverso — [2 SP] — 📋 TODO
- [ ] T-0603 — API attività deal: `POST /crm/deals/:id/activities` (tipo: call, email, meeting, task; date, description), `GET /crm/deals/:id/activities` — [2 SP] — 📋 TODO
- [ ] T-0604 — Form creazione attività (MUI Dialog): tipo, data/ora, descrizione, durata opzionale — [1 SP] — 📋 TODO
- [ ] T-0605 — API note deal: `POST /crm/deals/:id/notes` (content), `GET /crm/deals/:id/notes`, `PATCH /crm/notes/:id`, `DELETE /crm/notes/:id` — [2 SP] — 📋 TODO
- [ ] T-0606 — Componente note con editor testo semplice, lista note con autore e timestamp — [1 SP] — 📋 TODO
- [ ] T-0607 — Creare `StageAutomationProcessor` BullMQ: job triggered su evento `deal:stage-changed`, esegue regole configurate per lo stage di destinazione — [3 SP] — 📋 TODO
- [ ] T-0608 — Implementare azione automazione: invio notifica in-app (tramite sistema notifiche PMSync esistente) su cambio stage — [1 SP] — 📋 TODO
- [ ] T-0609 — Implementare azione automazione: creazione task automatica su cambio stage (es. "Prepara proposta" quando deal entra in stage Proposal) — [1 SP] — 📋 TODO
- [ ] T-0610 — UI configurazione automazioni base: in Pipeline settings, per ogni stage, lista azioni (notify, create task) con toggle on/off e parametri — [2 SP] — 📋 TODO

---

## Dipendenze

- Sprint 04/05: Deal CRUD e stage transition funzionanti.
- Sprint 03: Pipeline settings page esistente (per aggiungere config automazioni).
- Infrastruttura BullMQ già configurata in PMSync.
- Sistema notifiche in-app PMSync esistente.

## Rischi

1. **Automazione loop** — Un'automazione che cambia stage potrebbe triggerare un'altra automazione. Mitigazione: flag `triggeredByAutomation` sul job, le automazioni non si ri-triggerano se il flag è true.
2. **BullMQ job failure** — Se il job processor fallisce, l'automazione non viene eseguita. Mitigazione: retry con backoff esponenziale (max 3 tentativi), dead letter queue per job falliti.
3. **Timeline performance** — Deal con molte attività potrebbe avere una timeline lenta. Mitigazione: pagination sulla timeline (ultimi 20 eventi, pulsante "Carica precedenti").

## Definition of Done

- [ ] Deal detail mostra tutte le informazioni con stage progress bar
- [ ] Timeline mostra attività, note e cambi stage in ordine cronologico
- [ ] Creazione attività funziona (call, email, meeting, task)
- [ ] Note CRUD funziona con editor testo
- [ ] Automazione su cambio stage esegue azioni configurate
- [ ] Notifica in-app inviata su stage change (se configurata)
- [ ] Task creata automaticamente su stage change (se configurata)
- [ ] Config automazioni accessibile da Pipeline settings
- [ ] No automation loop possibili
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Pagina Deal detail completa con timeline
- API attività e note per deal
- `StageAutomationProcessor` BullMQ sotto `backend/src/modules/crm/automation/`
- Azioni automazione: notifica + creazione task
- UI configurazione automazioni in Pipeline settings
