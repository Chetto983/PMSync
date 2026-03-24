# Sprint 07 — Pipeline & Deal Management

## Fase: Phase 1 — Stabilization & Foundation
## Date: M4-W1 → M4-W2
## Obiettivo: Pipeline visuale Kanban con drag-and-drop, CRUD deal, multi-pipeline, weighted pipeline, gestione stage.
## Capacità: 85 SP
## Team: 3 Backend, 3 Frontend, 1 QA, 1 UX

---

## Backlog

### EP-04 — Pipeline & Deal Management

- [ ] T-0701 — API CRUD pipeline: creazione con nome e descrizione, soft delete, ordinamento pipeline, tenant isolation — 5 SP — Backend — 📋 TODO
- [ ] T-0702 — API CRUD stage: creazione con nome, colore, posizione ordinale, probabilità di chiusura (0-100%), rotting days — 5 SP — Backend — 📋 TODO
- [ ] T-0703 — API CRUD deal: creazione con titolo, valore, valuta, data chiusura prevista, owner, associazione pipeline/stage — 8 SP — Backend — 📋 TODO
- [ ] T-0704 — Associazione deal-contatto e deal-account: relazioni N:M con ruolo (decision maker, influencer, champion) — 3 SP — Backend — 📋 TODO
- [ ] T-0705 — Componente Kanban board: colonne per stage, drag-and-drop tra colonne con @dnd-kit, animazione fluida, scroll orizzontale — 8 SP — Frontend — 📋 TODO
- [ ] T-0706 — Componente deal card: titolo, valore formattato, contatto principale, owner avatar, indicatore rotting, chip stage — 3 SP — Frontend — 📋 TODO
- [ ] T-0707 — UI configurazione stage: drag-and-drop riordino, editor inline nome/colore/probabilità, aggiunta/rimozione stage — 5 SP — Frontend — 📋 TODO
- [ ] T-0708 — Supporto multi-pipeline: selector pipeline nella toolbar, switch rapido, pipeline di default per utente — 3 SP — Backend/Frontend — 📋 TODO
- [ ] T-0709 — Weighted pipeline: calcolo valore pesato (deal value × stage probability), aggregazione per pipeline e per owner — 5 SP — Backend — 📋 TODO
- [ ] T-0710 — Vista dettaglio deal: layout con sidebar info principali, tab attività/note/file/email, header con stage indicator — 5 SP — Frontend — 📋 TODO
- [ ] T-0711 — Form creazione/modifica deal: campi con validazione, picker contatto/account con ricerca, selezione prodotti — 5 SP — Frontend — 📋 TODO
- [ ] T-0712 — API catalogo prodotti/listino prezzi: CRUD prodotti con nome, codice, prezzo unitario, unità di misura — 5 SP — Backend — 📋 TODO
- [ ] T-0713 — Associazione prodotti a deal: line items con quantità, prezzo unitario, sconto, totale riga calcolato — 3 SP — Backend — 📋 TODO
- [ ] T-0714 — Filtri e ordinamento deal: per valore, data chiusura, owner, stage, contatto, account. Filtri salvabili come vista — 3 SP — Backend/Frontend — 📋 TODO
- [ ] T-0715 — Viste salvate (saved views): persistenza filtri/ordinamento per utente, condivisione vista con team — 3 SP — Backend/Frontend — 📋 TODO
- [ ] T-0716 — Vista lista deal alternativa: DataGrid MUI con colonne configurabili, toggle Kanban/Lista nella toolbar — 3 SP — Frontend — 📋 TODO
- [ ] T-0717 — WebSocket per aggiornamenti real-time Kanban: broadcast cambio stage, nuovo deal, deal eliminato via Socket.IO — 5 SP — Backend — 📋 TODO
- [ ] T-0718 — State management frontend deal/pipeline: TanStack Query con optimistic updates su drag-drop, invalidazione su WebSocket event — 3 SP — Frontend — 📋 TODO
- [ ] T-0719 — Integration test API deal/pipeline: CRUD completo, weighted pipeline calculation, tenant isolation, permessi — 5 SP — QA — 📋 TODO
- [ ] T-0720 — Test E2E Kanban drag-drop: spostamento deal tra stage, verifica persistenza, undo su errore — 3 SP — QA — 📋 TODO

**Totale: 85 SP**

---

## Dipendenze Esterne

- **Sprint 05-06 completati**: Modulo contatti e account devono essere stabili per le associazioni deal-contatto/account.
- **UX Design** Kanban board e deal detail approvato in Figma entro M4-W1 day 1.
- **@dnd-kit** libreria selezionata e prototipata per drag-and-drop (verificare compatibilità React 19).
- **Socket.IO** già configurato nel backend (verificare namespace dedicato per pipeline events).
- **Definizione pipeline di default** concordata con Product Owner: nomi stage, probabilità, colori.

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Drag-and-drop Kanban non fluido con >50 deal per colonna, causando UX degradata | Media | Alto | Virtualizzazione card con `react-window` dentro colonne. Lazy loading deal oltre il viewport visibile. Performance test con 200 deal. |
| 2 | Race condition su spostamento deal concorrente: due utenti muovono stesso deal simultaneamente | Media | Alto | Optimistic locking con version field sul deal. WebSocket broadcast immediato del cambio stage. Conflict resolution: ultimo vince + notifica all'altro utente. |
| 3 | Calcolo weighted pipeline lento con molti deal (>1000) causa query aggregate non indicizzate | Bassa | Medio | Indici composti su (pipeline_id, stage_id, value). Cache aggregazione con invalidazione su deal change. Query plan verificato con EXPLAIN. |
| 4 | @dnd-kit incompatibile con React 19 concurrent features, causando bug intermittenti | Bassa | Critico | Spike tecnico in W1 day 1-2: prototipo Kanban con 3 colonne e 10 card. Se fallisce, fallback a `react-beautiful-dnd` o implementazione custom. |

---

## Definition of Done Sprint

- [ ] Tutti i 20 task completati e in stato DONE
- [ ] Pipeline CRUD funzionante con supporto multi-pipeline per tenant
- [ ] Stage configurabili con drag-drop riordino, probabilità e colori
- [ ] Deal CRUD con associazioni a contatti, account e prodotti
- [ ] Kanban board fluido con drag-drop funzionante per spostamento deal tra stage
- [ ] Weighted pipeline calcolato correttamente e visualizzato in header pipeline
- [ ] Real-time updates via WebSocket: cambio stage visibile su tutti i client connessi in <1s
- [ ] Vista lista alternativa funzionante con toggle Kanban/Lista
- [ ] Integration test coprono CRUD deal/pipeline, weighted calculation, permessi
- [ ] Test E2E drag-drop Kanban passa su Chrome e Firefox
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
- [ ] Performance: Kanban carica in <2s con 100 deal, drag-drop risponde in <100ms

---

## Deliverable Attesi

1. **API Pipeline/Deal** — Endpoint REST completi per pipeline, stage, deal, prodotti con weighted pipeline
2. **Kanban Board** — Componente visuale drag-and-drop con real-time updates via WebSocket
3. **Deal Management UI** — Vista dettaglio, form creazione, filtri, viste salvate, toggle lista/Kanban
4. **Catalogo Prodotti** — API base per gestione prodotti e associazione a deal con line items
5. **Test Suite** — Integration test API e E2E per drag-drop Kanban

---

## Demo/Review Notes

**Data Demo:** Fine M4-W2 (venerdì)
**Partecipanti:** Product Owner, Tech Lead, Team Dev, UX Designer, Stakeholder Sales

### Agenda Demo
1. [ ] Creazione pipeline con stage personalizzati (colori, probabilità, ordinamento)
2. [ ] Creazione deal con associazione contatto, account, prodotti
3. [ ] Drag-and-drop deal tra stage sulla Kanban board
4. [ ] Real-time update: secondo browser vede lo spostamento in tempo reale
5. [ ] Weighted pipeline value calcolato e visualizzato
6. [ ] Toggle vista Kanban/Lista con filtri e viste salvate
7. [ ] Vista dettaglio deal con tab attività

### Feedback Raccolto
| Punto | Feedback | Azione |
|-------|----------|--------|
| | | |

### Velocity Effettiva
- SP pianificati: 85
- SP completati: ___
- SP carry-over: ___

### Note per Sprint Successivo
- _Da compilare durante la review_
