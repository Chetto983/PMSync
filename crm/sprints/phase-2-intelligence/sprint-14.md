# Sprint 14 — AI Governance & Phase 2 Wrap-up

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 14                                          |
| **Date**        | 2026-06-03 → 2026-06-16 (2 settimane)      |
| **Obiettivo**   | Dashboard governance AI con monitoraggio accuratezza modelli, cost tracking e data drift detection. Bug fixes e stabilizzazione di tutta la Phase 2. |
| **Capacità**    | 16 SP (solo dev)                            |

---

## Sprint Backlog

- [ ] T-1401 — Pagina AI governance dashboard: layout MUI con tab (Accuracy, Costs, Drift, Models). Overview con KPI cards: total predictions, average accuracy, monthly cost, active models — [2 SP] — 📋 TODO
- [ ] T-1402 — Tab Accuracy: grafici MUI X Charts per ogni modello (LeadScore, Churn, Forecast) con metriche nel tempo (AUC, MAPE, precision/recall). Selector range temporale — [2 SP] — 📋 TODO
- [ ] T-1403 — Cost tracking per AI feature: estensione `AiRunLedger` con campo `prediction_type` (lead_score, churn, forecast, nba, chat), aggregazione costi per tipo e periodo — [2 SP] — 📋 TODO
- [ ] T-1404 — Tab Costs: breakdown costo per feature AI, trend mensile, proiezione costo prossimo mese basata su volume corrente — [1 SP] — 📋 TODO
- [ ] T-1405 — Data drift detection service: confronto distribuzione features tra training set e ultimo batch di inference (PSI — Population Stability Index), alert se PSI > 0.2 — [2 SP] — 📋 TODO
- [ ] T-1406 — Tab Drift: visualizzazione PSI per ogni feature di ogni modello, evidenziazione features con drift significativo, storico drift — [1 SP] — 📋 TODO
- [ ] T-1407 — Model retraining trigger: pulsante manuale "Retrain" per ogni modello + alert automatico quando accuracy scende sotto soglia configurabile. Job BullMQ `model-retrain` — [2 SP] — 📋 TODO
- [ ] T-1408 — Phase 2 bug fixes: revisione e fix di tutti i bug aperti su lead scoring, forecasting, churn, NBA accumulati negli sprint 09-13 — [2 SP] — 📋 TODO
- [ ] T-1409 — Performance review: analisi query lente (Prisma query logging), ottimizzazione indici, tuning cache Redis (TTL, eviction policy) per tutti i servizi intelligence — [1 SP] — 📋 TODO
- [ ] T-1410 — Integration test suite Phase 2: test end-to-end che copre il flusso completo (feature compute → scoring → forecast → churn → NBA → governance) — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 09-13 completati (tutti i modelli AI operativi)
- `AiRunLedger` esistente nel backend (da estendere con `prediction_type`)
- Training set salvati per ogni modello (necessari per confronto drift)
- MUI X Charts per tutti i grafici della dashboard

## Rischi

1. **Bug backlog sottostimato** — I bug accumulati in 5 sprint potrebbero richiedere più dei 2 SP allocati. Mitigazione: triage brutale, fix solo P0/P1, P2+ rimandati a Phase 3 se necessario.
2. **Drift detection falsi positivi** — Con dataset piccoli il PSI può essere instabile. Mitigazione: soglia conservativa (PSI > 0.25), minimo 100 record per calcolo, warning invece di alert per dataset piccoli.
3. **Retraining destabilizzante** — Un retrain con dati degradati potrebbe peggiorare il modello. Mitigazione: confronto automatico metriche pre/post retrain, rollback automatico se nuove metriche peggiori di > 10%.

## Definition of Done

- [ ] Dashboard governance accessibile con tutti e 4 i tab funzionanti
- [ ] Metriche di accuratezza visualizzate per ogni modello con trend temporale
- [ ] Cost tracking attivo per tutte le feature AI, breakdown visibile
- [ ] Drift detection calcola PSI e segnala features problematiche
- [ ] Retraining manuale funzionante con confronto pre/post metriche
- [ ] Tutti i bug P0/P1 della Phase 2 risolti
- [ ] Query ottimizzate (nessuna query > 500ms su dataset tipico)
- [ ] Integration test suite verde per flusso completo Phase 2
- [ ] `npx tsc --noEmit` passa su frontend e backend
- [ ] Traduzioni IT/EN complete per dashboard governance

## Deliverable Attesi

- `frontend/src/pages/crm/ai-governance.tsx` con dashboard completa
- `frontend/src/components/crm/governance/` con `AccuracyTab`, `CostsTab`, `DriftTab`, `ModelsTab`, `KPICards`
- `backend/src/modules/crm/governance/` con drift detection service, retraining trigger, cost aggregation
- Migrazione Prisma per campo `prediction_type` su `AiRunLedger`
- Integration test suite in `backend/src/modules/crm/__tests__/phase-2-integration.spec.ts`
- Bug fix log documentato
