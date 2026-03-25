# Sprint 05 — Kanban Board & Drag-Drop

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 05 di 08 |
| **Date** | 2026-05-20 → 2026-06-02 |
| **Obiettivo Sprint** | Costruire la vista Kanban pipeline con drag-and-drop per spostamento deal tra stage. Implementare deal card, aggiornamento ottimistico, valore pesato per stage e notifiche real-time via Socket.IO. |
| **Capacità** | 20 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [x] T-0501 — Creare componente `KanbanBoard` con `@dnd-kit/core` — colonne = stage, card = deal — [3 SP] — ✅ DONE
- [x] T-0502 — Creare componente `DealCard` con MUI Card: nome deal, importo formattato, contatto principale, badge colore stage, indicatore expected close — [2 SP] — ✅ DONE
- [x] T-0503 — Implementare endpoint `PATCH /crm/deals/:id/stage` per transizione stage con validazione (stageId deve appartenere alla stessa pipeline) — [2 SP] — ✅ DONE
- [x] T-0504 — Implementare optimistic update su drag-drop: aggiornamento immediato UI, rollback su errore API, toast di conferma/errore — [3 SP] — ✅ DONE
- [x] T-0505 — Calcolo valore pipeline pesato per stage: `sum(deal.amount * stage.probability / 100)` — visualizzare nel header di ogni colonna — [2 SP] — ✅ DONE
- [x] T-0506 — Riepilogo stage nel header colonna: conteggio deal, valore totale, valore pesato — [1 SP] — ✅ DONE
- [x] T-0507 — Emettere evento Socket.IO `crm:deal:stage-changed` quando un deal cambia stage — broadcast a tutti gli utenti dello stesso tenant — [2 SP] — ✅ DONE
- [x] T-0508 — Sottoscrizione Socket.IO nel frontend: aggiornare Kanban board in real-time quando un altro utente sposta un deal — [2 SP] — ✅ DONE
- [x] T-0509 — Stati di caricamento e vuoto per Kanban: skeleton colonne durante fetch, messaggio "Nessun deal" per stage vuoti, empty state per pipeline senza deal — [1 SP] — ✅ DONE
- [x] T-0510 — Layout responsivo Kanban: scroll orizzontale su mobile, colonne compatte su schermi piccoli — [1 SP] — ✅ DONE
- [x] T-0511 — Traduzioni Kanban, type-check entrambe le app — [1 SP] — ✅ DONE

---

## Dipendenze

- Sprint 03: Pipeline e Stage CRUD completati.
- Sprint 04: Deal CRUD con associazione stage/pipeline funzionante.
- Infrastruttura Socket.IO già presente in PMSync (riutilizzare gateway esistente).

## Rischi

1. **Conflitto drag concorrente** — Due utenti spostano lo stesso deal contemporaneamente. Mitigazione: usare `updatedAt` come optimistic lock, rifiutare update se il deal è stato modificato nel frattempo (409 Conflict).
2. **Performance con molti deal** — Centinaia di deal card per stage rallentano il rendering. Mitigazione: virtualizzare le colonne se > 50 card, pagination per stage con "Carica altri".
3. **Compatibilità @hello-pangea/dnd con React 19** — Libreria potrebbe avere problemi con React 19 concurrent mode. Mitigazione: testare subito, avere come fallback `dnd-kit` se necessario.

## Definition of Done

- [ ] Kanban board mostra deal organizzati per stage
- [ ] Drag-and-drop sposta deal tra stage con optimistic update
- [ ] Rollback visivo se API fallisce
- [ ] Valore pesato calcolato e mostrato per ogni stage
- [ ] Header colonna mostra conteggio deal e valore totale
- [ ] Evento Socket.IO emesso su stage change
- [ ] Board si aggiorna in real-time per altri utenti dello stesso tenant
- [ ] Loading skeleton e empty state presenti
- [ ] Layout funziona su mobile (scroll orizzontale)
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Componenti `KanbanBoard` e `DealCard` sotto `frontend/src/components/crm/kanban/`
- Endpoint stage transition con optimistic lock
- Integrazione Socket.IO per aggiornamenti real-time deal
- Vista Kanban pipeline accessibile da pagina pipeline
