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

- [x] T-0711 — Product CRUD API — [2 SP] — ✅ DONE
- [x] T-0712 — Deal-Product association API — [1 SP] — ✅ DONE
- [x] T-0713 — Frontend API module + query hooks for Products — [1 SP] — ✅ DONE
- [x] T-0714 — DealProductsTab component — [2 SP] — ✅ DONE

### Account Activity

- [x] T-0715 — Extend CrmActivity for accountId — [1 SP] — ✅ DONE
- [x] T-0716 — AccountActivityTab component — [1 SP] — ✅ DONE

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

- [x] Product CRUD API funzionante (list, create, update, soft delete)
- [x] Deal-Product association funzionante (link, list, unlink)
- [x] DealProductsTab mostra prodotti collegati con totale calcolato
- [x] Account Activity endpoint funzionante (list, create)
- [x] AccountActivityTab mostra timeline con tipi attivita e dialog creazione
- [x] Zero tab placeholder rimasti in Deal Detail e Account Detail
- [x] `cd backend && npx tsc --noEmit` passa
- [x] `cd frontend && npx tsc --noEmit` passa
- [x] Validazione browser Edge CDP su Account Activity (Deal Products: Edge disconnected, code verified)
