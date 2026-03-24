# Sprint 08 — Pipeline Dashboard & Alpha

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 08 di 08 |
| **Date** | 2026-07-01 → 2026-07-14 |
| **Obiettivo Sprint** | Costruire dashboard pipeline con metriche (conversion rate, deal velocity, win rate). Implementare deal scoring rule-based, Product CRUD base, viste salvate pipeline. Stabilizzazione e alpha testing. |
| **Capacità** | 18 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0801 — Creare pagina Pipeline dashboard in `frontend/src/pages/dashboard/crm/pipelines/[id]/dashboard.tsx`: layout con card metriche e grafici — [2 SP] — 📋 TODO
- [ ] T-0802 — API metriche pipeline: `GET /crm/pipelines/:id/metrics` — calcolo conversion rate per stage (deal entrati vs usciti), average deal velocity (giorni medi per stage), win rate (won / total closed) — [3 SP] — 📋 TODO
- [ ] T-0803 — Grafici dashboard: funnel conversion (MUI/recharts bar chart), deal velocity trend (line chart), win rate gauge — [2 SP] — 📋 TODO
- [ ] T-0804 — Motore deal scoring rule-based: `DealScoringService` con regole configurabili (field, condition, points) — score calcolato 0-100, salvato su deal, ricalcolo su update — [2 SP] — 📋 TODO
- [ ] T-0805 — UI deal score: badge score nel DealCard Kanban e nel Deal detail header, colonna score nella Deal list DataGrid — [1 SP] — 📋 TODO
- [ ] T-0806 — Product CRUD API: `GET /crm/products`, `POST /crm/products`, `PATCH /crm/products/:id`, `DELETE /crm/products/:id` — campi: name, code, description, unitPrice, currency, isActive — [2 SP] — 📋 TODO
- [ ] T-0807 — Associazione Deal-Product: `POST /crm/deals/:id/products` (productId, quantity, unitPrice, discount), lista prodotti nel Deal detail — [1 SP] — 📋 TODO
- [ ] T-0808 — Viste salvate pipeline: serializzazione filtri (stage[], dateRange, amountRange, assignee) come `SavedView` — `GET /crm/pipelines/:id/views`, `POST`, `DELETE` — [2 SP] — 📋 TODO
- [ ] T-0809 — Toggle vista pipeline: switch Kanban / List nella pagina pipeline (riutilizza Kanban di S05 e DataGrid di S04) — [1 SP] — 📋 TODO
- [ ] T-0810 — Bug fix da sprint S01-S07: riservare capacity per fix accumulati durante gli sprint precedenti — [1 SP] — 📋 TODO
- [ ] T-0811 — Alpha smoke testing: test manuale end-to-end di tutti i flussi CRM principali (create account → create deal → move through pipeline → won), type-check finale — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 01-07 completati: tutti i moduli CRM base funzionanti.
- Sprint 05: Kanban board (per toggle vista e badge score).
- Sprint 04: Deal list DataGrid (per toggle vista e colonna score).
- Libreria grafici (recharts o chart.js) — da installare se non presente.

## Rischi

1. **Metriche lente su grandi dataset** — Calcolo conversion rate e velocity richiede aggregazioni su molti deal. Mitigazione: query aggregate Prisma con `groupBy`, caching risultati in Redis con TTL 5 minuti.
2. **Debito tecnico accumulato** — 7 sprint di sviluppo senza refactoring dedicato. Mitigazione: T-0810 riservato per fix, ma se i bug sono troppi, ridurre scope su T-0808 (saved views) o T-0804 (scoring).
3. **Alpha testing insufficiente** — Un solo SP per smoke testing potrebbe non bastare. Mitigazione: testare incrementalmente durante lo sprint, non solo alla fine. Usare checklist di flussi critici.

## Definition of Done

- [ ] Dashboard pipeline mostra conversion rate, deal velocity, win rate
- [ ] Grafici funzionano con dati reali
- [ ] Deal scoring calcola score 0-100 basato su regole
- [ ] Score visibile in Kanban card, Deal detail, Deal list
- [ ] Product CRUD funzionante
- [ ] Associazione Deal-Product con quantity e discount
- [ ] Saved views salvano e ripristinano filtri pipeline
- [ ] Toggle Kanban/List funziona
- [ ] Flusso end-to-end testato: account → deal → pipeline stages → won
- [ ] Nessun errore TypeScript in backend e frontend
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Pagina Pipeline dashboard con metriche e grafici
- `DealScoringService` sotto `backend/src/modules/crm/scoring/`
- Product CRUD + associazione Deal-Product
- Saved views per pipeline
- Toggle vista Kanban/List
- Alpha release CRM Pro 360 Phase 1 — pronta per feedback
