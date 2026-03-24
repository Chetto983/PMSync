# Sprint 04 — Deal CRUD & Associations

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 04 di 08 |
| **Date** | 2026-05-06 → 2026-05-19 |
| **Obiettivo Sprint** | Implementare il modello Deal completo con CRUD API, associazioni deal-contact-account-pipeline-stage. Costruire form di creazione, lista con filtri e pagina dettaglio base. |
| **Capacità** | 18 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0401 — Creare modulo NestJS `DealModule` con controller, service, DTOs (CreateDealDto, UpdateDealDto, DealResponseDto, DealListQueryDto con filtri) — [2 SP] — 📋 TODO
- [ ] T-0402 — Implementare endpoint Deal CRUD: `GET /crm/deals`, `GET /crm/deals/:id`, `POST /crm/deals`, `PATCH /crm/deals/:id`, `DELETE /crm/deals/:id` — tutti tenant-scoped — [2 SP] — 📋 TODO
- [ ] T-0403 — Implementare filtri sulla lista deal: per pipeline, stage, account, contact, date range (expectedCloseDate), amount range — query params su `GET /crm/deals` — [2 SP] — 📋 TODO
- [ ] T-0404 — API associazione Deal-Contact: `POST /crm/deals/:id/contacts` (contactId, role), `DELETE /crm/deals/:dealId/contacts/:contactId` — [1 SP] — 📋 TODO
- [ ] T-0405 — API associazione Deal-Account: campo `accountId` su Deal, validazione che account appartenga allo stesso tenant — [1 SP] — 📋 TODO
- [ ] T-0406 — Creare dialog creazione Deal (MUI Dialog): form con pipeline selector, stage selector (filtrato per pipeline), account autocomplete, contact autocomplete, amount, currency, expected close date — [3 SP] — 📋 TODO
- [ ] T-0407 — Creare pagina Deal list in `frontend/src/pages/dashboard/crm/deals/index.tsx` con MUI DataGrid (colonne: name, amount, stage, account, contact, expected close) e filtri toolbar — [2 SP] — 📋 TODO
- [ ] T-0408 — Creare pagina Deal detail base in `frontend/src/pages/dashboard/crm/deals/[id].tsx` con header (name, amount, stage badge), info card, sezioni placeholder per timeline e products — [2 SP] — 📋 TODO
- [ ] T-0409 — TanStack Query hooks: `useDeals`, `useDeal`, `useCreateDeal`, `useUpdateDeal`, `useDeleteDeal`, `useDealContacts`, `useLinkDealContact` — [1 SP] — 📋 TODO
- [ ] T-0410 — Traduzioni deal in en.ts e it.ts (campi form, filtri, stati, labels), type-check entrambe le app — [1 SP] — 📋 TODO
- [ ] T-0411 — Aggiungere navigazione CRM nella sidebar: Accounts, Pipelines, Deals come sotto-menu — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 01: schema Prisma con modello `Deal` e relazioni.
- Sprint 02: Account CRUD funzionante (per associazione deal-account).
- Sprint 03: Pipeline e Stage CRUD funzionanti (per selezione pipeline/stage nel form deal).

## Rischi

1. **Validazione cross-entity** — Il deal deve appartenere a uno stage di una pipeline specifica; cambiare pipeline richiede anche cambiare stage. Mitigazione: validare lato backend che `stageId` appartenga a `pipelineId`, resettare stage se pipeline cambia.
2. **Performance lista con filtri** — Query con molti join (deal + account + contact + stage + pipeline) può essere lenta. Mitigazione: indici sui FK, select solo campi necessari, pagination obbligatoria.
3. **Form dialog complesso** — Molti picker interdipendenti (pipeline → stage) in un singolo dialog. Mitigazione: usare controlled form con React Hook Form, stage selector disabilitato fino a selezione pipeline.

## Definition of Done

- [ ] Deal CRUD completo con tutti gli endpoint funzionanti
- [ ] Filtri lista deal funzionano (pipeline, stage, account, date range)
- [ ] Associazione deal-contact con ruolo funziona
- [ ] Campo accountId su deal validato correttamente
- [ ] Dialog creazione deal salva correttamente con tutti i campi
- [ ] DataGrid deal mostra dati reali con sorting e pagination
- [ ] Pagina deal detail mostra informazioni base del deal
- [ ] Navigazione CRM visibile nella sidebar
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Modulo NestJS `DealModule` sotto `backend/src/modules/crm/deal/`
- API Deal CRUD con filtri avanzati
- Dialog creazione deal con picker interconnessi
- Pagina Deal list + Deal detail base
- Navigazione CRM nella sidebar dell'app
