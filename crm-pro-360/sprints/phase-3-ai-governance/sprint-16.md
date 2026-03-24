# Sprint 16 — Analytics Advanced & AI Observability

## Fase: Phase 3 — AI Governance & Scale

## Date: M8-W3 → M8-W4

## Obiettivo Sprint

Cross-filtering tra widget, drill-down navigation, scheduling report con invio automatico via email, export PDF/Excel/PPT, cohort analysis, funnel visualization, AI model observability dashboard con drift detection e tracking costi.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 90 SP | 2 Backend, 3 Frontend, 1 AI/ML, 1 Data Engineer, 1 QA |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-1601 — Cross-filtering engine tra widget (click su segmento filtra tutti gli altri) | 5 | Frontend | 📋 TODO |
| 2 | T-1602 — Drill-down navigation (click su chart → vista filtrata con breadcrumb) | 5 | Frontend | 📋 TODO |
| 3 | T-1603 — Report scheduling service con cron expression e gestione retry | 5 | Backend | 📋 TODO |
| 4 | T-1604 — Email report delivery con PDF allegato (integrazione SendGrid) | 4 | Backend | 📋 TODO |
| 5 | T-1605 — Export dashboard a PDF via Puppeteer (headless render) | 5 | Backend | 📋 TODO |
| 6 | T-1606 — Export report a Excel con ExcelJS (multi-sheet, formattazione) | 4 | Backend | 📋 TODO |
| 7 | T-1607 — Export report a PowerPoint (slide con chart come immagini) | 4 | Backend | 📋 TODO |
| 8 | T-1608 — Cohort analysis engine (raggruppamento per data acquisizione, retention) | 5 | Data Engineer | 📋 TODO |
| 9 | T-1609 — Cohort visualization UI (heatmap retention, tabella cohort) | 5 | Frontend | 📋 TODO |
| 10 | T-1610 — Funnel visualization component (multi-step, conversion rate, drop-off) | 5 | Frontend | 📋 TODO |
| 11 | T-1611 — Embedded analytics (link condivisibile con token JWT, iframe-safe) | 4 | Backend | 📋 TODO |
| 12 | T-1612 — AI model observability dashboard (latenza, throughput, error rate) | 5 | AI/ML | 📋 TODO |
| 13 | T-1613 — Data drift detection con alert automatici (distribuzione feature input) | 5 | AI/ML | 📋 TODO |
| 14 | T-1614 — Model accuracy tracking charts (precision, recall, F1 nel tempo) | 4 | AI/ML | 📋 TODO |
| 15 | T-1615 — AI cost per tenant dashboard (token usage, API calls, costo stimato) | 4 | Data Engineer | 📋 TODO |
| 16 | T-1616 — Model A/B test results viewer (confronto metriche tra varianti) | 4 | Frontend | 📋 TODO |
| 17 | T-1617 — Forecasting trend line widget (regressione lineare, moving average) | 5 | Data Engineer | 📋 TODO |
| 18 | T-1618 — UI scheduling report (frequenza, destinatari, formato, anteprima) | 4 | Frontend | 📋 TODO |
| 19 | T-1619 — Performance optimization per dataset grandi (virtual scrolling, query pagination) | 4 | Backend | 📋 TODO |
| 20 | T-1620 — Cache layer per query aggregate (Redis, TTL configurabile per widget) | 4 | Backend | 📋 TODO |
| 21 | T-1621 — Integration tests cross-filtering e drill-down | 4 | QA | 📋 TODO |
| 22 | T-1622 — Integration tests export PDF/Excel/PPT (verifica contenuto generato) | 4 | QA | 📋 TODO |
| 23 | T-1623 — Integration tests AI observability dashboard e alert drift | 3 | QA | 📋 TODO |

**Totale: 90 SP** (23 item)

## Dipendenze Esterne

- **Puppeteer** — necessario per export PDF, richiede Chrome headless in ambiente di deploy
- **ExcelJS** — libreria per generazione Excel, nessuna dipendenza esterna
- **SendGrid API** — per invio email report schedulati (già configurato in backend)
- **Redis** — per cache layer query aggregate (già presente nell'infrastruttura)
- **Sprint 15** — dashboard builder e chart components devono essere completati

## Rischi Sprint

1. **Puppeteer in produzione** — Chrome headless in container Docker può avere problemi di memoria e timeout su dashboard complesse. Mitigazione: timeout aggressivo (30s), pool di istanze, fallback a rendering server-side semplificato.
2. **Data drift false positive** — detection automatica potrebbe generare troppi alert su dataset piccoli. Mitigazione: soglie configurabili per tenant, minimum sample size prima di alertare.
3. **Cross-filtering performance** — filtrare N widget contemporaneamente può causare N query parallele. Mitigazione: debounce, batch query, cache dei risultati intermedi.
4. **Export PowerPoint qualità** — convertire chart interattivi in immagini statiche perde interattività. Mitigazione: generare immagini ad alta risoluzione, includere dati in tabella di supporto.

## Definition of Done Sprint

1. [ ] Tutti i 23 item hanno stato completato o giustificazione per rinvio
2. [ ] Cross-filtering funziona tra almeno 3 widget contemporaneamente senza lag percepibile
3. [ ] Drill-down navigation mantiene contesto filtri e permette navigazione indietro
4. [ ] Report scheduling crea job cron e invia email con PDF allegato
5. [ ] Export PDF riproduce fedelmente il layout del dashboard (> 90% fidelità visiva)
6. [ ] Export Excel genera file valido con dati corretti e formattazione
7. [ ] Cohort analysis mostra retention matrix corretta su dataset di test
8. [ ] AI observability dashboard mostra metriche degli ultimi 30 giorni
9. [ ] Data drift detection genera alert solo su variazioni statisticamente significative
10. [ ] Cache layer riduce tempo query ripetute di almeno 80%
11. [ ] Integration tests passano al 100% in CI
12. [ ] Nessun memory leak rilevato nei test di export PDF (Puppeteer)

## Deliverable Attesi

- Cross-filtering e drill-down funzionanti su tutti i tipi di chart
- Sistema scheduling report con invio automatico via email
- Export in 3 formati: PDF, Excel, PowerPoint
- Cohort analysis e funnel visualization
- AI model observability dashboard con drift detection
- AI cost tracking per tenant
- Forecasting trend line widget

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | Cross-filtering: click su segmento pie chart, tutti i widget si aggiornano |
| **Scenario Demo 2** | Report scheduling: configurare invio settimanale, mostrare email ricevuta con PDF |
| **Scenario Demo 3** | AI observability: mostrare dashboard con metriche modello, simulare drift e alert |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 90 SP pianificati |
