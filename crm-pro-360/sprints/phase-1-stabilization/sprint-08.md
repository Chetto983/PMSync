# Sprint 08 — Pipeline Avanzata & Alpha Release

## Fase: Phase 1 — Stabilization & Foundation
## Date: M4-W3 → M4-W4
## Obiettivo: Automazioni stage, deal scoring, forecast manuale, dashboard pipeline base, preventivi PDF. Rilascio alpha interno.
## Capacità: 85 SP
## Team: 3 Backend, 3 Frontend, 2 QA, 1 DevOps

---

## Backlog

### EP-04 — Pipeline Avanzata + Cross-cutting Alpha Release

- [ ] T-0801 — Motore automazioni stage: trigger su cambio stage, azioni configurabili (assegna owner, invia email, crea task, aggiorna campo) — 8 SP — Backend — 📋 TODO
- [ ] T-0802 — UI rule builder automazioni stage: interfaccia visuale trigger → condizione → azione, anteprima regola, toggle attiva/disattiva — 5 SP — Frontend — 📋 TODO
- [ ] T-0803 — Motore deal scoring: regole basate su attributi deal (valore, anzianità, attività recente, completezza dati), punteggio 0-100 — 5 SP — Backend — 📋 TODO
- [ ] T-0804 — Visualizzazione deal score: badge colorato nella deal card e detail view, tooltip con breakdown punteggio — 2 SP — Frontend — 📋 TODO
- [ ] T-0805 — API forecast manuale: aggregazione deal per owner/team/quarter, filtro per pipeline, calcolo best case/commit/worst case — 5 SP — Backend — 📋 TODO
- [ ] T-0806 — Widget dashboard forecast: tabella pivot owner × mese con totali, barra progresso vs obiettivo, selettore periodo — 5 SP — Frontend — 📋 TODO
- [ ] T-0807 — Dashboard pipeline — conversion rate: percentuale deal che avanzano tra stage consecutivi, grafico funnel — 5 SP — Backend/Frontend — 📋 TODO
- [ ] T-0808 — Dashboard pipeline — velocity: tempo medio permanenza per stage, trend settimanale, alert su deal stagnanti — 5 SP — Backend/Frontend — 📋 TODO
- [ ] T-0809 — Dashboard pipeline — win/loss rate: rapporto deal chiusi vinti vs persi per periodo, breakdown per owner e pipeline — 3 SP — Backend/Frontend — 📋 TODO
- [ ] T-0810 — Gestione attività e note su deal: CRUD note con rich text, log attività automatico, menzioni @utente — 5 SP — Backend/Frontend — 📋 TODO
- [ ] T-0811 — Motore generazione PDF preventivi: template engine (Handlebars), rendering HTML → PDF con Puppeteer, campi dinamici — 8 SP — Backend — 📋 TODO
- [ ] T-0812 — UI anteprima e download preventivo: selezione template, preview in-browser, download PDF, invio via email — 3 SP — Frontend — 📋 TODO
- [ ] T-0813 — Preparazione alpha release — deploy staging: configurazione ambiente staging, migration database, seed dati demo — 3 SP — DevOps — 📋 TODO
- [ ] T-0814 — Smoke test suite alpha: test automatizzati per flussi critici (login, CRUD contatto, CRUD deal, Kanban, ricerca) — 5 SP — QA — 📋 TODO
- [ ] T-0815 — Baseline performance: misurazione tempi risposta API (p50, p95, p99), tempo caricamento pagine, dimensione bundle frontend — 3 SP — QA/DevOps — 📋 TODO
- [ ] T-0816 — Security scan SAST: analisi statica codice con Semgrep/SonarQube, remediation vulnerabilità critical e high — 3 SP — DevOps — 📋 TODO
- [ ] T-0817 — Documentazione API Swagger: revisione completa endpoint contatti, account, pipeline, deal. Esempi request/response — 3 SP — Backend — 📋 TODO
- [ ] T-0818 — User Acceptance Testing: sessioni guidate con 5 utenti interni, raccolta feedback strutturato, prioritizzazione bug — 5 SP — QA/UX — 📋 TODO
- [ ] T-0819 — Bug fix da Sprint 05-07: risoluzione bug P1/P2 identificati durante gli sprint precedenti (budget riservato) — 5 SP — Backend/Frontend — 📋 TODO
- [ ] T-0820 — Alpha release notes: changelog funzionale, known issues, guida utente base, comunicazione interna — 2 SP — QA — 📋 TODO

**Totale: 85 SP**

---

## Dipendenze Esterne

- **Sprint 07 completato**: Pipeline e deal CRUD devono essere stabili. Kanban board funzionante.
- **Puppeteer** installabile nell'ambiente di staging/produzione (richiede Chromium headless). Verificare compatibilità container Docker.
- **Template preventivo** approvato dal Product Owner: layout, campi obbligatori, logo aziendale, termini e condizioni.
- **Ambiente staging** provisionato da DevOps entro M4-W3 day 1: server, database, Redis, Elasticsearch, S3.
- **5 utenti interni** disponibili per UAT nella W4 (minimo 2h ciascuno).
- **Semgrep/SonarQube** licenza e configurazione CI pipeline disponibili.

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Generazione PDF con Puppeteer instabile in container: crash Chromium, memory leak su documenti complessi | Alta | Alto | Implementare pool di istanze Puppeteer (max 3) con timeout 30s per documento. Fallback a libreria PDF pura (PDFKit) per template semplici. Health check periodico del processo Chromium. |
| 2 | Bug accumulati da Sprint 05-07 superano il budget di 5 SP riservato, ritardando feature alpha | Media | Alto | Triage rigoroso: solo P1 (bloccanti) e P2 (degradano UX critica) nel budget. P3+ rinviati a Sprint 09. Se budget esaurito in W3, comunicare trade-off al PO. |
| 3 | Automazioni stage creano loop infiniti: automazione A sposta deal → trigger automazione B → sposta deal → trigger A | Media | Critico | Limite di 5 esecuzioni automazione per singolo evento trigger. Flag `triggered_by_automation` per prevenire catene. Circuit breaker con alert. |
| 4 | UAT rivela gap funzionali significativi che richiedono rework prima del rilascio alpha | Media | Alto | UAT pianificato in W4 day 1-2, lasciando W4 day 3-5 per fix critici. Criteri alpha: nessun P1 aperto, max 5 P2 documentati come known issues. |
| 5 | Security scan SAST genera centinaia di finding, rendendo impossibile la remediation nel timebox | Media | Medio | Focus esclusivo su finding Critical e High. Suppressione documentata per falsi positivi. Medium e Low tracciati come tech debt per Sprint 09+. |

---

## Definition of Done Sprint

- [ ] Tutti i 20 task completati e in stato DONE
- [ ] Automazioni stage funzionanti con protezione anti-loop (max 5 catene)
- [ ] Deal scoring calcolato e visualizzato correttamente per tutti i deal esistenti
- [ ] Dashboard pipeline mostra conversion rate, velocity e win/loss rate con dati reali
- [ ] Forecast manuale aggregato per owner/team/quarter con 3 scenari (best/commit/worst)
- [ ] PDF preventivo generato correttamente da template, scaricabile e inviabile via email
- [ ] Ambiente staging deployato e funzionante con dati demo
- [ ] Smoke test suite passa al 100% su staging
- [ ] Nessuna vulnerabilità Critical o High aperta nel report SAST
- [ ] Performance baseline documentata: API p95 <500ms, page load <3s, bundle <500KB gzipped
- [ ] UAT completato con almeno 5 utenti, feedback raccolto e prioritizzato
- [ ] Nessun bug P1 aperto. Max 5 bug P2 documentati come known issues
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
- [ ] Alpha release notes pubblicate internamente

---

## Deliverable Attesi

1. **Automazioni Stage** — Motore trigger/azione con rule builder visuale e protezione anti-loop
2. **Deal Scoring** — Sistema di punteggio configurabile con visualizzazione nella UI
3. **Dashboard Pipeline** — Widget forecast, conversion funnel, velocity, win/loss rate
4. **Preventivi PDF** — Generazione da template con anteprima e download
5. **Alpha Release** — Deploy staging, smoke test, security scan, UAT completato
6. **Documentazione** — Swagger API completo, release notes, baseline performance

---

## Demo/Review Notes

**Data Demo:** Fine M4-W4 (venerdì) — ALPHA RELEASE REVIEW
**Partecipanti:** Product Owner, Tech Lead, Team Dev, DevOps, Management, Stakeholder Sales & CRM

### Agenda Demo
1. [ ] Configurazione automazione: "quando deal entra in stage Negoziazione → assegna a Sales Manager + crea task follow-up"
2. [ ] Deal scoring: confronto punteggio tra deal con diversi livelli di completezza
3. [ ] Dashboard pipeline: funnel conversion, velocity per stage, win rate mensile
4. [ ] Forecast: vista aggregata per team Q2 con scenari best/commit/worst
5. [ ] Generazione preventivo PDF: selezione template, anteprima, download
6. [ ] Demo end-to-end su staging: creazione contatto → creazione deal → spostamento Kanban → generazione preventivo
7. [ ] Presentazione risultati UAT e known issues

### Feedback Raccolto
| Punto | Feedback | Azione |
|-------|----------|--------|
| | | |

### Velocity Effettiva
- SP pianificati: 85
- SP completati: ___
- SP carry-over: ___

### Velocity Cumulativa Phase 1 (Sprint 05-08)
| Sprint | Pianificati | Completati | % |
|--------|-------------|------------|---|
| 05 | 90 | ___ | ___ |
| 06 | 91 | ___ | ___ |
| 07 | 85 | ___ | ___ |
| 08 | 85 | ___ | ___ |
| **Totale** | **351** | ___ | ___ |

### Alpha Release Checklist
- [ ] Staging environment operativo
- [ ] Smoke test 100% pass
- [ ] Nessun bug P1 aperto
- [ ] Security scan: 0 Critical, 0 High
- [ ] Release notes distribuite
- [ ] Accesso utenti alpha configurato
- [ ] Canale feedback (Slack/Teams) creato

### Note per Phase 2
- _Da compilare durante la review_
