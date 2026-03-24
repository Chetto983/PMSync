# Sprint 06 — Contatti Avanzati & Account

## Fase: Phase 1 — Stabilization & Foundation
## Date: M3-W3 → M3-W4
## Obiettivo: Import/export massivo, de-duplicazione fuzzy, timeline interazioni, segmentazione, account CRUD con gerarchia, merge contatti.
## Capacità: 90 SP
## Team: 3 Backend, 3 Frontend, 1 QA, 1 Data Engineer

---

## Backlog

### EP-03 — Gestione Contatti (Avanzata) & Account

- [ ] T-0601 — Servizio import CSV/Excel: parsing async con BullMQ, validazione riga per riga, report errori dettagliato — 8 SP — Backend — 📋 TODO
- [ ] T-0602 — UI mapping colonne import: drag-drop colonne sorgente su campi CRM, preview primi 10 record, gestione duplicati — 5 SP — Frontend — 📋 TODO
- [ ] T-0603 — Servizio export contatti (CSV, Excel, JSON): filtri applicati, campi selezionabili, generazione async con download link — 5 SP — Backend — 📋 TODO
- [ ] T-0604 — Algoritmo de-duplicazione fuzzy: Levenshtein distance su nome + matching fonetico (Double Metaphone) su cognome, scoring composito — 8 SP — Data Engineer — 📋 TODO
- [ ] T-0605 — UI suggerimenti duplicati: lista coppie candidate con score, confronto side-by-side dei campi, azioni merge/ignora/collega — 5 SP — Frontend — 📋 TODO
- [ ] T-0606 — Backend merge contatti: unificazione dati con strategia campo-per-campo (keep newest/keep filled/manual), migrazione relazioni — 8 SP — Backend — 📋 TODO
- [ ] T-0607 — UI merge contatti: wizard step-by-step per risoluzione conflitti campo, preview risultato finale prima di conferma — 5 SP — Frontend — 📋 TODO
- [ ] T-0608 — Servizio timeline: aggregazione attività da email, note, deal, task, meeting in feed cronologico unificato — 5 SP — Backend — 📋 TODO
- [ ] T-0609 — Componente UI timeline: feed verticale con icone per tipo attività, filtri per tipo, paginazione infinita — 5 SP — Frontend — 📋 TODO
- [ ] T-0610 — Motore segmentazione dinamica: definizione regole con condizioni su campi contatto, aggiornamento membership automatico — 5 SP — Backend — 📋 TODO
- [ ] T-0611 — UI rule builder segmentazione: interfaccia visuale per costruzione regole AND/OR, preview conteggio risultati in tempo reale — 5 SP — Frontend — 📋 TODO
- [ ] T-0612 — API CRUD account: creazione, lettura, modifica, eliminazione con soft delete, associazione contatti multipli — 5 SP — Backend — 📋 TODO
- [ ] T-0613 — Vista dettaglio account: header con logo e info principali, tab contatti associati, tab deal, tab attività — 3 SP — Frontend — 📋 TODO
- [ ] T-0614 — Gerarchia account parent/child: struttura ad albero, navigazione breadcrumb, vincolo max 5 livelli profondità — 3 SP — Backend — 📋 TODO
- [ ] T-0615 — Associazione account-contatto: ruolo del contatto nell'account, contatto primario, gestione N:M — 2 SP — Backend — 📋 TODO
- [ ] T-0616 — Gestione tag contatti e account: CRUD tag, autocompletamento, colori personalizzabili, filtro per tag — 3 SP — Backend/Frontend — 📋 TODO
- [ ] T-0617 — Vista Kanban contatti: board configurabile per stato/fase, drag-drop per cambio stato — 3 SP — Frontend — 📋 TODO
- [ ] T-0618 — Framework azioni bulk: selezione multipla, azioni disponibili (tag, assegna, elimina, esporta), conferma batch — 3 SP — Frontend — 📋 TODO
- [ ] T-0619 — Integration test import/dedup/merge: scenari con dati realistici, verifica integrità post-merge, edge case charset — 5 SP — QA — 📋 TODO
- [ ] T-0620 — Test E2E flusso import completo: upload file, mapping, preview, esecuzione, verifica contatti creati — 3 SP — QA — 📋 TODO

**Totale: 91 SP**

---

## Dipendenze Esterne

- **Sprint 05 completato**: API CRUD contatti e Elasticsearch devono essere stabili e in produzione.
- **Libreria Double Metaphone** selezionata e validata per supporto multilingua (italiano/inglese minimo).
- **BullMQ/Redis** configurato per job di import asincrono con concurrency adeguata (max 3 job paralleli per tenant).
- **Storage S3** (o compatibile) per file import/export temporanei con policy di retention 7 giorni.
- **Dataset di test** con 10k contatti realistici (con duplicati intenzionali) preparato dal Data Engineer entro M3-W3 day 1.

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Import CSV con encoding non-UTF8 (Latin-1, Windows-1252) causa corruzione dati nomi italiani con accenti | Alta | Medio | Implementare auto-detection encoding con `chardet`. Supportare esplicito UTF-8, Latin-1, Windows-1252. Test con dataset italiano reale. |
| 2 | Algoritmo dedup genera troppi falsi positivi su cognomi italiani comuni (Rossi, Bianchi), rendendo inutile la feature | Media | Alto | Soglia scoring configurabile per tenant. Combinare nome+cognome+email per ridurre falsi positivi. A/B test soglie su dataset campione. |
| 3 | Merge contatti corrompe relazioni (deal, email, note) se la migrazione FK non è transazionale | Bassa | Critico | Merge in singola transazione database. Audit log pre/post merge. Soft delete contatto sorgente (non hard delete) per rollback 30gg. |
| 4 | Timeline aggregation query troppo lenta con molte tabelle join su contatti ad alta attività (>1000 eventi) | Media | Medio | Vista materializzata per timeline. Paginazione con cursor. Cache TanStack Query con staleTime 2min. |
| 5 | Gerarchia account ricorsiva causa N+1 query o loop infiniti su strutture circolari | Bassa | Alto | Recursive CTE con limite profondità (max 5). Vincolo DB che impedisce cicli. Integration test con strutture complesse. |

---

## Definition of Done Sprint

- [ ] Tutti i 20 task completati e in stato DONE
- [ ] Import CSV/Excel funzionante con file fino a 50k righe in <5 minuti
- [ ] Export genera file scaricabili entro 30s per dataset fino a 10k contatti
- [ ] Dedup identifica almeno 85% dei duplicati reali nel dataset di test con <10% falsi positivi
- [ ] Merge contatti preserva tutte le relazioni (deal, email, note, tag) senza perdita dati
- [ ] Timeline carica primi 20 eventi in <1s, scroll infinito fluido
- [ ] Account CRUD con gerarchia navigabile fino a 5 livelli
- [ ] Integration test coprono scenari import (successo, errori parziali, charset), dedup, merge
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
- [ ] Code review completata per tutti i PR con almeno 1 approval
- [ ] Nessuna regressione su funzionalità Sprint 05 (smoke test automatico)

---

## Deliverable Attesi

1. **Import/Export Engine** — Servizio asincrono per import CSV/Excel e export multi-formato con UI di mapping
2. **Sistema De-duplicazione** — Algoritmo fuzzy matching con UI di revisione e merge guidato
3. **Timeline Contatti** — Feed unificato attività con filtri e paginazione infinita
4. **Segmentazione Dinamica** — Motore regole con rule builder visuale
5. **Modulo Account** — CRUD completo con gerarchia parent/child e associazione contatti
6. **Test Suite** — Integration test e E2E per flussi import, dedup, merge

---

## Demo/Review Notes

**Data Demo:** Fine M3-W4 (venerdì)
**Partecipanti:** Product Owner, Tech Lead, Team Dev, Data Engineer, Stakeholder CRM

### Agenda Demo
1. [ ] Import file CSV con 1000 contatti: mapping colonne, esecuzione, report risultati
2. [ ] Rilevamento duplicati automatico e workflow di merge
3. [ ] Timeline interazioni di un contatto con filtri per tipo
4. [ ] Creazione segmento dinamico con rule builder
5. [ ] Navigazione gerarchia account con contatti associati
6. [ ] Export contatti filtrati in formato Excel

### Feedback Raccolto
| Punto | Feedback | Azione |
|-------|----------|--------|
| | | |

### Velocity Effettiva
- SP pianificati: 91
- SP completati: ___
- SP carry-over: ___

### Note per Sprint Successivo
- _Da compilare durante la review_
