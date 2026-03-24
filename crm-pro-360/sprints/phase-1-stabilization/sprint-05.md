# Sprint 05 — Modulo Contatti (Core)

## Fase: Phase 1 — Stabilization & Foundation
## Date: M3-W1 → M3-W2
## Obiettivo: Modulo contatti completo: CRUD, validazione, ricerca con Elasticsearch, campi custom, vista lista/tabella.
## Capacità: 90 SP
## Team: 3 Backend, 3 Frontend, 1 QA, 1 UX

---

## Backlog

### EP-03 — Gestione Contatti (Core)

- [ ] T-0501 — API REST CRUD contatti (create, read, update, delete) con validazione input DTO — 8 SP — Backend — 📋 TODO
- [ ] T-0502 — Regole di validazione contatti: email univoca per tenant, telefono formato E.164, campi obbligatori configurabili — 5 SP — Backend — 📋 TODO
- [ ] T-0503 — Indicizzazione contatti su Elasticsearch: mapping campi, analizzatori per nome/email/telefono — 8 SP — Backend — 📋 TODO
- [ ] T-0504 — API di ricerca contatti con filtri multipli (nome, email, azienda, tag, data creazione) — 5 SP — Backend — 📋 TODO
- [ ] T-0505 — Schema JSONB per campi custom: struttura dati, validazione tipo, vincoli di unicità opzionali — 5 SP — Backend — 📋 TODO
- [ ] T-0506 — API configurazione campi custom: CRUD definizioni campo, ordinamento, raggruppamento sezioni — 5 SP — Backend — 📋 TODO
- [ ] T-0507 — Servizio di sincronizzazione Elasticsearch via Kafka CDC: listener eventi contatto, retry con backoff esponenziale — 8 SP — Backend — 📋 TODO
- [ ] T-0508 — Vista lista contatti con DataGrid MUI: colonne configurabili, selezione multipla, azioni inline — 5 SP — Frontend — 📋 TODO
- [ ] T-0509 — Vista dettaglio contatto: layout a schede (info, attività, note, file), header con avatar e azioni rapide — 5 SP — Frontend — 📋 TODO
- [ ] T-0510 — Form creazione/modifica contatto con validazione client-side, autocompletamento azienda — 5 SP — Frontend — 📋 TODO
- [ ] T-0511 — Rendering dinamico campi custom nella UI: supporto tipi text, number, date, select, multi-select, checkbox — 5 SP — Frontend — 📋 TODO
- [ ] T-0512 — Barra di ricerca con autocomplete debounced (300ms) e risultati raggruppati per tipo — 3 SP — Frontend — 📋 TODO
- [ ] T-0513 — Pannello filtri avanzati: combinazione AND/OR, salvataggio filtri come viste personalizzate — 5 SP — Frontend — 📋 TODO
- [ ] T-0514 — Paginazione cursor-based per lista contatti: navigazione fluida, preload pagina successiva — 3 SP — Backend — 📋 TODO
- [ ] T-0515 — Ordinamento multi-colonna lato server con indici database ottimizzati — 2 SP — Backend — 📋 TODO
- [ ] T-0516 — Integration test API contatti: CRUD completo, validazione errori, permessi tenant isolation — 5 SP — QA — 📋 TODO
- [ ] T-0517 — Integrazione TanStack Query per contatti: queryOptions, invalidazione cache, optimistic updates su delete — 3 SP — Frontend — 📋 TODO
- [ ] T-0518 — Stati loading (Skeleton MUI), error (Alert con retry), empty state (illustrazione + CTA) per tutte le viste contatti — 3 SP — Frontend — 📋 TODO
- [ ] T-0519 — Design responsive: lista contatti adattiva mobile/tablet, detail view con drawer su mobile — 2 SP — UX/Frontend — 📋 TODO

**Totale: 90 SP**

---

## Dipendenze Esterne

- **Elasticsearch cluster** deve essere provisionato e accessibile dall'ambiente di staging prima dell'inizio dello sprint.
- **Kafka** (o equivalente message broker) configurato per CDC events dal database PostgreSQL.
- **UX Design** delle schermate contatti (lista, dettaglio, form) approvato e consegnato in Figma entro M3-W1 day 1.
- **API Gateway** configurato per i nuovi endpoint `/contacts` con rate limiting appropriato.

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Latenza Elasticsearch su volumi elevati (>100k contatti) causa mapping non ottimizzato | Media | Alto | Definire mapping esplicito con keyword fields per filtri, text fields solo per full-text search. Benchmark con dataset sintetico 200k record in W1. |
| 2 | CDC Kafka perde eventi durante picchi di scrittura, causando disallineamento indice ES | Bassa | Alto | Implementare reconciliation job schedulato ogni 6h. Dead letter queue per eventi falliti con alerting. |
| 3 | Campi custom JSONB degradano performance query con volumi alti di definizioni per tenant | Media | Medio | Limitare a 50 campi custom per tenant. Indice GIN su colonna JSONB. Monitorare query plan con EXPLAIN ANALYZE. |
| 4 | Complessità rendering dinamico campi custom causa ritardi frontend oltre la W2 | Media | Medio | Iniziare da 3 tipi base (text, number, select) in W1, aggiungere restanti in W2. Componente generico con strategy pattern. |

---

## Definition of Done Sprint

- [ ] Tutti i 19 task completati e in stato DONE
- [ ] API CRUD contatti funzionante con validazione completa e tenant isolation verificata
- [ ] Elasticsearch indicizza contatti in tempo reale (<2s latenza) tramite CDC pipeline
- [ ] Ricerca full-text restituisce risultati rilevanti in <500ms per dataset 50k contatti
- [ ] Campi custom configurabili e renderizzati correttamente per tutti i 6 tipi supportati
- [ ] Integration test coprono almeno 80% dei path critici (CRUD, search, custom fields)
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
- [ ] Code review completata per tutti i PR con almeno 1 approval
- [ ] Documentazione Swagger aggiornata per tutti i nuovi endpoint
- [ ] Performance: lista contatti carica in <1s con 1000 record, search in <500ms

---

## Deliverable Attesi

1. **API Contatti v1** — Endpoint REST completi per CRUD, ricerca, e configurazione campi custom
2. **Pipeline Elasticsearch** — Sincronizzazione in tempo reale via Kafka CDC con monitoring
3. **UI Contatti** — Vista lista, dettaglio, form creazione/modifica con campi custom dinamici
4. **Test Suite** — Integration test API con copertura path critici
5. **Documentazione API** — Swagger/OpenAPI aggiornato per modulo contatti

---

## Demo/Review Notes

**Data Demo:** Fine M3-W2 (venerdì)
**Partecipanti:** Product Owner, Tech Lead, Team Dev, Stakeholder CRM

### Agenda Demo
1. [ ] Creazione contatto con campi standard e custom
2. [ ] Ricerca full-text e filtri avanzati
3. [ ] Vista lista con ordinamento e paginazione
4. [ ] Vista dettaglio contatto
5. [ ] Configurazione campi custom da admin

### Feedback Raccolto
| Punto | Feedback | Azione |
|-------|----------|--------|
| | | |

### Velocity Effettiva
- SP pianificati: 90
- SP completati: ___
- SP carry-over: ___

### Note per Sprint Successivo
- _Da compilare durante la review_
