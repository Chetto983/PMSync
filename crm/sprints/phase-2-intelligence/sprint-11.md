# Sprint 11 — Revenue Forecasting

| Campo           | Valore                                      |
| --------------- | ------------------------------------------- |
| **Fase**        | Phase 2 — Intelligence Layer                |
| **Sprint**      | 11                                          |
| **Date**        | 2026-04-22 → 2026-05-05 (2 settimane)      |
| **Obiettivo**   | Forecasting revenue basato su storico deal. Decomposizione time series in TypeScript (moving average + trend + stagionalità). Dashboard forecast con bande di confidenza. |
| **Capacità**    | 17 SP (solo dev)                            |

---

## Sprint Backlog

- [ ] T-1101 — Modello Prisma `ForecastSnapshot`: pipeline reference, periodo (quarter/month), predicted revenue, confidence bands (p20/p50/p80), actual revenue (nullable), `createdAt` — [1 SP] — 📋 TODO
- [ ] T-1102 — Deal history aggregation service: calcolo mensile di close rate, valore medio deal, conversione per stage, revenue totale. Aggregazione per pipeline e tenant — [2 SP] — 📋 TODO
- [ ] T-1103 — Simple time series forecasting in TypeScript: moving average (window 3 mesi) + linear trend extraction + seasonal decomposition additiva. Output: predicted value + confidence intervals — [3 SP] — 📋 TODO
- [ ] T-1104 — API endpoint `GET /crm/forecast?pipelineId=X&period=quarter` con proiezione 4 trimestri avanti, filtro per pipeline — [2 SP] — 📋 TODO
- [ ] T-1105 — Pagina dashboard forecast: layout MUI con selector pipeline e periodo, area chart MUI X Charts con linea forecast + bande di confidenza 80/50/20% (sfumature di colore) — [3 SP] — 📋 TODO
- [ ] T-1106 — Widget forecast vs actuals: comparazione tra previsioni passate e risultati reali, calcolo MAPE (Mean Absolute Percentage Error) — [2 SP] — 📋 TODO
- [ ] T-1107 — BullMQ job `forecast-refresh` settimanale: ricalcolo forecast per tutte le pipeline attive, salvataggio snapshot — [1 SP] — 📋 TODO
- [ ] T-1108 — Forecast accuracy tracking: persistenza MAPE per ogni snapshot, trend accuratezza nel tempo — [1 SP] — 📋 TODO
- [ ] T-1109 — Query hooks `useForecast` e `useForecastAccuracy` con TanStack Query, traduzioni IT/EN — [1 SP] — 📋 TODO
- [ ] T-1110 — Type-check frontend e backend, validazione Swagger endpoint — [1 SP] — 📋 TODO

---

## Dipendenze

- Storico deal sufficiente (minimo 6 mesi di dati per seasonal decomposition). Fallback: proiezione solo su moving average + trend se dati < 6 mesi.
- MUI X Charts per area chart con bande di confidenza
- BullMQ scheduler per job settimanale (cron syntax)

## Rischi

1. **Storico insufficiente** — Con meno di 6 mesi di deal chiusi, la seasonal decomposition non ha senso. Mitigazione: fallback graceful a moving average + trend, UI mostra avviso "dati insufficienti per stagionalità".
2. **Forecast accuracy bassa** — Le time series semplici senza variabili esogene hanno limiti intrinseci. Mitigazione: mostrare sempre confidence bands larghe, disclaimer visibile, MAPE trasparente.
3. **Performance aggregation** — L'aggregazione mensile su deal storici potrebbe essere lenta con volumi alti. Mitigazione: materialized view o cache Redis con TTL 24h.

## Definition of Done

- [ ] Migrazione Prisma `ForecastSnapshot` applicata
- [ ] Aggregation service calcola metriche mensili correttamente su seed data
- [ ] Forecasting produce proiezioni con confidence bands per 4 trimestri
- [ ] Dashboard mostra area chart con bande di confidenza visivamente chiare
- [ ] Forecast vs actuals widget calcola e mostra MAPE
- [ ] Job settimanale registrato e testabile manualmente
- [ ] `npx tsc --noEmit` passa su frontend e backend
- [ ] Traduzioni IT/EN complete

## Deliverable Attesi

- Schema Prisma aggiornato con `ForecastSnapshot`
- `backend/src/modules/crm/forecasting/` con aggregation service, time series engine, BullMQ job
- `frontend/src/pages/crm/forecast.tsx` con dashboard completa
- `frontend/src/components/crm/forecast/` con `ForecastChart`, `ForecastVsActuals`, `AccuracyBadge`
- `frontend/hooks/queries/use-forecast.ts`
