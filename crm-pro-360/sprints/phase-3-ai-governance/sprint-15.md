# Sprint 15 — Analytics: Dashboard Builder & Report Engine

## Fase: Phase 3 — AI Governance & Scale

## Date: M8-W1 → M8-W2

## Obiettivo Sprint

Dashboard builder drag-and-drop, report engine con filtri avanzati, 50+ template predefiniti per sales/marketing/service/executive, KPI cards real-time con aggiornamento via WebSocket.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 90 SP | 1 Backend, 4 Frontend, 1 Data Engineer, 1 QA, 1 UX |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-1501 — API CRUD per dashboard (create, read, update, delete, clone) | 5 | Backend | 📋 TODO |
| 2 | T-1502 — Schema configurazione widget (tipo, dimensione, sorgente dati, filtri) | 5 | Backend | 📋 TODO |
| 3 | T-1503 — Dashboard grid layout engine con react-grid-layout | 5 | Frontend | 📋 TODO |
| 4 | T-1504 — Componente chart bar (Recharts) con theming | 4 | Frontend | 📋 TODO |
| 5 | T-1505 — Componente chart line (Recharts) con theming | 4 | Frontend | 📋 TODO |
| 6 | T-1506 — Componente chart pie (Recharts) con theming | 4 | Frontend | 📋 TODO |
| 7 | T-1507 — Componente chart funnel (Recharts) con theming | 4 | Frontend | 📋 TODO |
| 8 | T-1508 — Componente chart gauge (Recharts) con theming | 4 | Frontend | 📋 TODO |
| 9 | T-1509 — KPI card component con animazione valore e trend indicator | 5 | Frontend | 📋 TODO |
| 10 | T-1510 — API aggregazione dati per widget (group by, sum, avg, count, min, max) | 5 | Data Engineer | 📋 TODO |
| 11 | T-1511 — Report query engine con supporto filtri compositi | 5 | Backend | 📋 TODO |
| 12 | T-1512 — Filter panel UI (date range picker, entity selector, team filter) | 5 | Frontend | 📋 TODO |
| 13 | T-1513 — 15 template dashboard Sales (pipeline, revenue, win rate, forecast) | 5 | Frontend | 📋 TODO |
| 14 | T-1514 — 15 template dashboard Marketing (lead gen, campaign ROI, conversion) | 4 | Frontend | 📋 TODO |
| 15 | T-1515 — 10 template dashboard Service (ticket volume, SLA, CSAT, resolution time) | 4 | Frontend | 📋 TODO |
| 16 | T-1516 — 10+ template dashboard Executive (revenue, growth, churn, CAC, LTV) | 4 | Frontend | 📋 TODO |
| 17 | T-1517 — Template gallery UI con preview, ricerca e categorizzazione | 4 | UX | 📋 TODO |
| 18 | T-1518 — Dashboard sharing e embedding (link condivisibile con token) | 3 | Backend | 📋 TODO |
| 19 | T-1519 — Aggiornamento dati real-time via WebSocket per KPI cards | 5 | Data Engineer | 📋 TODO |
| 20 | T-1520 — Dashboard permissions (owner, shared read-only, shared edit, public) | 3 | Backend | 📋 TODO |
| 21 | T-1521 — Report builder wizard (step: sorgente → metriche → filtri → layout) | 5 | Frontend | 📋 TODO |
| 22 | T-1522 — Custom metric builder (formula editor con campo calcolato) | 5 | Frontend | 📋 TODO |
| 23 | T-1523 — Frontend state management per dashboard editor (Zustand store) | 3 | Frontend | 📋 TODO |
| 24 | T-1524 — Chart theming dark/light mode con MUI palette integration | 3 | Frontend | 📋 TODO |
| 25 | T-1525 — Responsive dashboard layout per tablet e mobile | 3 | Frontend | 📋 TODO |
| 26 | T-1526 — Integration tests per dashboard CRUD e widget rendering | 5 | QA | 📋 TODO |

**Totale: 90 SP** (26 item)

## Dipendenze Esterne

- **Recharts v2.x** — libreria charting, deve essere compatibile con React 19
- **react-grid-layout** — libreria drag-and-drop grid, verificare supporto React 19
- **WebSocket server** — endpoint Socket.IO esistente deve supportare canale dashboard updates
- **API aggregazione** — dipende da schema dati consolidato delle entità CRM (contatti, deal, ticket)

## Rischi Sprint

1. **Compatibilità React 19** — react-grid-layout e Recharts potrebbero non avere supporto ufficiale per React 19. Mitigazione: testare early nella W1, preparare fork se necessario.
2. **Performance rendering 50+ template** — caricare preview di tutti i template nella gallery potrebbe causare lag. Mitigazione: virtualizzazione lista, lazy loading dei preview.
3. **Complessità query engine** — filtri compositi con aggregazioni su dataset grandi possono causare query lente. Mitigazione: indici dedicati, query timeout, paginazione risultati.
4. **WebSocket scalabilità** — aggiornamento real-time per molti widget contemporanei può saturare il canale. Mitigazione: throttling updates, batch notifications.

## Definition of Done Sprint

1. [ ] Tutti i 26 item hanno stato completato o giustificazione per rinvio
2. [ ] Dashboard CRUD funzionante con almeno 5 widget type
3. [ ] Drag-and-drop grid funziona senza glitch visivi su Chrome, Firefox, Safari
4. [ ] KPI cards si aggiornano in real-time via WebSocket entro 2 secondi
5. [ ] Almeno 50 template disponibili nella gallery con preview
6. [ ] Filter panel applica filtri e aggiorna tutti i widget del dashboard
7. [ ] Report query engine gestisce almeno 100k record senza timeout (< 5s)
8. [ ] Chart theming funziona in dark e light mode senza artefatti
9. [ ] Dashboard permissions impediscono accesso non autorizzato (test negativo)
10. [ ] Integration tests passano al 100% in CI
11. [ ] Responsive layout verificato su viewport 768px e 1024px
12. [ ] Code review completata per tutti i PR

## Deliverable Attesi

- Dashboard builder drag-and-drop completamente funzionante
- 5 tipi di chart (bar, line, pie, funnel, gauge) con theming
- KPI cards real-time con WebSocket
- 50+ template predefiniti organizzati per categoria
- Report query engine con filtri compositi
- Dashboard sharing con link e permessi

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | Creazione dashboard da template Sales, aggiunta widget custom, resize e riordino |
| **Scenario Demo 2** | KPI card real-time: mostrare aggiornamento automatico dopo inserimento deal |
| **Scenario Demo 3** | Report builder wizard: creare report custom con filtri data + team |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 90 SP pianificati |
