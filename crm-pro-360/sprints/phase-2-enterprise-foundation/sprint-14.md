# Sprint 14 — AI Forecasting & Beta Chiusa

**Phase:** 2 — Enterprise Foundation
**Epics:** EP-08 (AI/ML Engine), Cross-cutting (Beta Preparation)
**Date:** M7-W3 → M7-W4
**Status:** 📋 TODO

---

## Obiettivo Sprint

Implementare il forecast intelligente basato su ensemble ARIMA + Prophet con bande di confidenza, l'email intelligence base (sentiment analysis e entity extraction), e preparare l'ambiente beta chiusa per 10 pilot customer con strumenti di migrazione dati, onboarding e raccolta feedback.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| AI/ML | 3 | 24 |
| Backend | 2 | 16 |
| Frontend | 2 | 16 |
| QA | 2 | 16 |
| DevOps | 1 | 13 |
| **Totale** | **10** | **85 SP** |

---

## Sprint Backlog

- [ ] T-1401 — Modello forecast ensemble ARIMA + Prophet (training, tuning, validazione cross-temporale) — 8 SP — AI/ML — 📋 TODO
- [ ] T-1402 — API forecast con intervalli di confidenza (80%, 50%, 20%) e granularità configurabile — 5 SP — AI/ML — 📋 TODO
- [ ] T-1403 — Dashboard UI forecast con bande di confidenza 80/50/20 (area chart interattivo) — 5 SP — Frontend — 📋 TODO
- [ ] T-1404 — Modello sentiment analysis email (fine-tuning su dati business, 5 classi: very negative → very positive) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1405 — Servizio entity extraction email (persone, aziende, date, importi, prodotti) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1406 — API email intelligence (POST /ai/email-analyze, batch processing) — 3 SP — Backend — 📋 TODO
- [ ] T-1407 — UI analisi email: badge sentiment, chip entità estratte, timeline sentiment contatto — 5 SP — Frontend — 📋 TODO
- [ ] T-1408 — Setup ambiente beta (infrastruttura dedicata, SSL, dominio, monitoring) — 5 SP — DevOps — 📋 TODO
- [ ] T-1409 — Tool migrazione dati pilot customer (import CSV/Excel contatti, deal, aziende) — 5 SP — Backend — 📋 TODO
- [ ] T-1410 — Documentazione onboarding pilot customer (guida setup, FAQ, video tutorial script) — 3 SP — Backend — 📋 TODO
- [ ] T-1411 — Bug fix critici da sprint 09-13 (backlog bug prioritizzato) — 5 SP — Backend — 📋 TODO
- [ ] T-1412 — Bug fix UI/UX da sprint 09-13 (backlog bug frontend prioritizzato) — 3 SP — Frontend — 📋 TODO
- [ ] T-1413 — Performance testing end-to-end (load test API principali, target: 100 utenti concorrenti) — 5 SP — QA — 📋 TODO
- [ ] T-1414 — Security review Phase 2 (OWASP top 10, dependency audit, penetration test base) — 5 SP — DevOps — 📋 TODO
- [ ] T-1415 — Sistema inviti beta (generazione codici, landing page registrazione, quota management) — 3 SP — Backend — 📋 TODO
- [ ] T-1416 — Import dati pilot customer (esecuzione migrazione per 10 clienti pilota) — 3 SP — QA — 📋 TODO
- [ ] T-1417 — Meccanismo raccolta feedback in-app (widget feedback, categorizzazione, export) — 3 SP — Frontend — 📋 TODO
- [ ] T-1418 — Configurazione monitoring e alerting ambiente beta (Datadog/Grafana, alert Slack) — 5 SP — DevOps — 📋 TODO
- [ ] T-1419 — Release notes Phase 2 (changelog completo, feature highlights, known issues) — 3 SP — DevOps — 📋 TODO
- [ ] T-1420 — Test regressione completo su funzionalità Phase 1 + Phase 2 — 5 SP — QA — 📋 TODO
- [ ] T-1421 — Test E2E forecast e email intelligence — 3 SP — QA — 📋 TODO

**Totale:** 85 SP — 21 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Sprint 13 completato (AI service infrastructure) | Team | 📋 TODO | Forecast e email intelligence dipendono da FastAPI service |
| Lista 10 pilot customer confermati con dati di contatto | Sales/PM | 📋 TODO | Necessario per T-1416 |
| Dati storici pipeline per training forecast (min 12 mesi) | Data Team | 📋 TODO | Necessario per T-1401 |
| Infrastruttura beta dedicata provisioned (VM, DB, Redis) | DevOps | 📋 TODO | Necessario per T-1408 |
| Budget approvato per infrastruttura beta (stima costi mensili) | PM | 📋 TODO | Necessario per T-1408 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | I dati storici pipeline insufficienti producono forecast inaffidabili con bande di confidenza troppo ampie | Alta | Alto | Definire soglia minima dati (6 mesi); mostrare avviso qualità forecast; usare solo ARIMA se dati < 12 mesi |
| 2 | Il carico di bug fix da sprint precedenti potrebbe assorbire più SP del previsto | Alta | Medio | Prioritizzare solo bug P0/P1; carry-over bug P2 a sprint successivi; time-box bug fix a 8 SP max |
| 3 | I pilot customer potrebbero avere dati in formati non standard che rompono il tool di import | Media | Alto | Validazione pre-import con report errori; supporto formati comuni (CSV UTF-8, Excel xlsx); mapping colonne manuale |
| 4 | Il performance testing potrebbe rivelare bottleneck architetturali che richiedono refactoring significativo | Media | Alto | Iniziare load test early; focus su top 5 API più usate; accettare fix incrementali post-beta |
| 5 | Il sentiment analysis potrebbe avere accuracy insufficiente su email business italiane | Media | Medio | Fine-tuning su dataset email business italiano; fallback a modello multilingua; mostrare confidence score |

---

## Definition of Done Sprint

- [ ] Forecast model produce previsioni con bande di confidenza 80/50/20 validate su dati storici
- [ ] MAPE (Mean Absolute Percentage Error) forecast < 25% su test set con dati >= 12 mesi
- [ ] Dashboard forecast mostra chart interattivo con bande di confidenza e drill-down temporale
- [ ] Sentiment analysis accuracy > 80% su test set email business
- [ ] Entity extraction identifica correttamente persone, aziende e importi con F1 > 0.75
- [ ] UI email analysis mostra badge sentiment e chip entità per ogni email
- [ ] Ambiente beta funzionante con SSL, monitoring e alerting configurati
- [ ] Tool migrazione importa correttamente dati CSV/Excel per almeno 3 pilot customer di test
- [ ] Tutti i bug P0 da sprint precedenti risolti
- [ ] Load test passa con 100 utenti concorrenti senza errori 5xx
- [ ] Security review non rivela vulnerabilità critiche o alte non mitigate
- [ ] Widget feedback in-app funzionante e raccoglie feedback categorizzato
- [ ] Release notes complete con changelog e known issues documentati
- [ ] Tutti i test regressione Phase 1 + Phase 2 passano
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` pulito su frontend e backend)

---

## Deliverable Attesi

1. **AI Forecast** — Modello ensemble ARIMA + Prophet con API e dashboard bande di confidenza
2. **Email Intelligence** — Sentiment analysis e entity extraction con UI integrata nella vista email
3. **Beta Environment** — Infrastruttura dedicata con monitoring, alerting e SSL
4. **Migration Tools** — Import CSV/Excel per contatti, deal e aziende con validazione e report errori
5. **Beta Program** — Sistema inviti, onboarding documentation, feedback widget, release notes
6. **Quality Gate** — Performance testing, security review, test regressione completo

---

## Demo/Review Notes

**Data Demo:** _______________
**Partecipanti:** _______________

### Funzionalità Dimostrate
| # | Funzionalità | Esito | Note |
|---|-------------|-------|------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

### Feedback Stakeholder
-

### Action Items Post-Review
- [ ]
- [ ]

### Velocity Effettiva
- **SP Pianificati:** 85
- **SP Completati:** ___
- **SP Carry-over:** ___

---

## Note Beta Chiusa

### Pilot Customer Checklist
| # | Cliente | Dati Importati | Onboarding | Accesso | Feedback |
|---|---------|---------------|------------|---------|----------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

### Criteri Go/No-Go Beta
- [ ] Zero vulnerabilità critiche aperte
- [ ] Uptime > 99% nelle ultime 48h di staging
- [ ] Tutti i pilot customer hanno ricevuto credenziali
- [ ] Documentazione onboarding revisionata da almeno 2 persone non-tech
- [ ] Canale supporto beta attivo (Slack/email dedicato)
