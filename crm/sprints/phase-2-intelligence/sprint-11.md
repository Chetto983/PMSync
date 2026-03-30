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

- [x] T-1101 — Modello Prisma `ForecastSnapshot` — [1 SP] — ✅ DONE
- [x] T-1102 — Deal history aggregation service — [2 SP] — ✅ DONE
- [x] T-1103 — Time series forecasting engine in TypeScript — [3 SP] — ✅ DONE
- [x] T-1104 — Forecast API endpoint — [2 SP] — ✅ DONE
- [x] T-1105 — Forecast dashboard page with Recharts area chart — [3 SP] — ✅ DONE
- [x] T-1106 — Forecast vs actuals widget — [2 SP] — ✅ DONE
- [x] T-1107 — Weekly forecast-refresh cron job — [1 SP] — ✅ DONE
- [x] T-1108 — Forecast accuracy tracking (MAPE) — [1 SP] — ✅ DONE
- [x] T-1109 — Query hooks + translations IT/EN — [1 SP] — ✅ DONE
- [x] T-1110 — Type-check + circular deps validation — [1 SP] — ✅ DONE

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

- [x] Migrazione Prisma `ForecastSnapshot` applicata
- [x] Aggregation service calcola metriche mensili correttamente su seed data
- [x] Forecasting produce proiezioni con confidence bands per 4 trimestri
- [x] Dashboard mostra area chart con bande di confidenza visivamente chiare
- [x] Forecast vs actuals widget calcola e mostra MAPE
- [x] Job settimanale registrato e testabile manualmente
- [x] `npx tsc --noEmit` passa su frontend e backend
- [x] Traduzioni IT/EN complete

## Deliverable Attesi

- Schema Prisma aggiornato con `ForecastSnapshot`
- `backend/src/modules/crm/forecasting/` con aggregation service, time series engine, BullMQ job
- `frontend/src/pages/crm/forecast.tsx` con dashboard completa
- `frontend/src/components/crm/forecast/` con `ForecastChart`, `ForecastVsActuals`, `AccuracyBadge`
- `frontend/hooks/queries/use-forecast.ts`
