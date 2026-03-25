# Sprint 07.1 — Placeholder Cleanup (Sub-Sprint)

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 07.1 (sub-sprint inserito tra S07 e S08) |
| **Obiettivo Sprint** | Eliminare tutti i tab placeholder rimasti dopo S01-S07: Deal > Products e Account > Activity. Portare a zero i "Coming in Sprint" nel CRM. |
| **Capacita** | 8 SP (micro-sprint, ~3-4 giorni) |

---

## Motivazione

La validazione E2E di Sprint 07 ha rivelato 2 tab placeholder residui:
1. **Deal Detail > Products** — "Coming in Sprint 08"
2. **Account Detail > Activity** — "Coming in Sprint 08"

Questi placeholder danneggiano la UX e la credibilita dell'applicazione. Si anticipa la loro implementazione prima di Sprint 08 (Dashboard & Alpha) per garantire che tutti i detail page siano completi.

---

## Sprint Backlog

### Deal Products (da T-0806 / T-0807 di Sprint 08)

- [ ] T-0711 — Product CRUD API: `ProductController` + `ProductService` sotto `backend/src/modules/crm/product/` — `GET /crm/products` (list, filtro tenantId + search + isActive), `POST /crm/products`, `PATCH /crm/products/:id`, `DELETE /crm/products/:id` (soft delete). Campi: name, code, description, price (Decimal), currency, isActive. Schema Prisma `CrmProduct` gia presente. — [2 SP] — TODO
- [ ] T-0712 — Deal-Product association API: `POST /crm/deals/:id/products` (body: productId, quantity, unitPrice, discount), `GET /crm/deals/:id/products`, `DELETE /crm/deals/:id/products/:linkId`. Schema Prisma `DealProduct` gia presente. Aggiungere endpoint nel `DealController`. — [1 SP] — TODO
- [ ] T-0713 — Frontend API module + query hooks per Products: `frontend/lib/api/crm-products.ts`, `frontend/hooks/queries/use-crm-products.ts`. Hook per CRUD prodotti e per deal-product link (useDealProducts, useLinkDealProduct, useUnlinkDealProduct). — [1 SP] — TODO
- [ ] T-0714 — DealProductsTab component: sostituisce il placeholder in Deal Detail. Tabella prodotti collegati (name, code, qty, unitPrice, discount, subtotal), bottone "Add Product" con dialog di selezione. Calcolo totale deal da somma subtotals. Pattern identico a DealContactsTab. — [2 SP] — TODO

### Account Activity

- [ ] T-0715 — Extend CrmActivity per supportare accountId opzionale: aggiungere `accountId String?` + relazione + indice in schema Prisma. Aggiungere endpoint `GET /crm/accounts/:id/activities` + `POST /crm/accounts/:id/activities` nel `AccountController`. Riutilizzare stessa logica di `DealService.listActivities/createActivity`. — [1 SP] — TODO
- [ ] T-0716 — AccountActivityTab component: sostituisce il placeholder in Account Detail. Riutilizza MUI Timeline (`@mui/lab`), stessi icon/color map di DealTimeline. Hook `useAccountActivities` + `useCreateAccountActivity`. Dialog "Log Activity" riutilizza pattern CreateActivityDialog. — [1 SP] — TODO

---

## Dipendenze

- Sprint 01-07 completati (tutti i moduli base funzionanti).
- Schema Prisma `CrmProduct`, `DealProduct`, `CrmActivity` gia presenti.
- `DealTimeline` e `DealContactsTab` come pattern di riferimento.
- `@mui/lab` gia installato (usato in DealTimeline).

## Impatto su Sprint 08

I task T-0806 e T-0807 di Sprint 08 sono coperti da T-0711/T-0712/T-0713/T-0714 di questo sub-sprint. Sprint 08 verra aggiornato per rimuovere quei task e usare i 3 SP recuperati per ulteriore stabilizzazione o bug fix.

## Rischi

1. **CrmActivity non ha accountId** — Richiede modifica schema + `prisma db push`. Rischio basso: aggiunta campo nullable non rompe nulla.
2. **Product price calcoli con Decimal** — Usare `parseFloat()` solo per display, mantenere `Decimal` in DB. Nessun calcolo finanziario critico lato frontend.

## Definition of Done

- [ ] Product CRUD API funzionante (list, create, update, soft delete)
- [ ] Deal-Product association funzionante (link, list, unlink)
- [ ] DealProductsTab mostra prodotti collegati con totale calcolato
- [ ] Account Activity endpoint funzionante (list, create)
- [ ] AccountActivityTab mostra timeline con tipi attivita e dialog creazione
- [ ] Zero tab placeholder rimasti in Deal Detail e Account Detail
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa
- [ ] Validazione browser Edge CDP su tutte le pagine modified
