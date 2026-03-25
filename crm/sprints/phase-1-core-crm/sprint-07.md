# Sprint 07 — Contact Enhancements & Custom Fields

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 07 di 08 |
| **Date** | 2026-06-17 → 2026-06-30 |
| **Obiettivo Sprint** | Implementare bulk import/export contatti (CSV/Excel), campi custom configurabili per entità CRM, e segmentazione dinamica basata su regole. |
| **Capacità** | 18 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [x] T-0701 — Creare servizio CSV import (`CsvImportService`): parsing con `papaparse`, validazione righe, deduplicazione per email, gestione errori riga per riga — [3 SP] — ✅ DONE
- [x] T-0702 — UI import contatti: dialog upload file, step 1: upload CSV, step 2: mapping colonne (drag source → target field), step 3: preview prime 5 righe, step 4: conferma e importa — [3 SP] — ✅ DONE
- [x] T-0703 — Endpoint import: `POST /crm/contacts/import` (multipart file upload), processamento async via BullMQ, progress tracking via Socket.IO — [2 SP] — ✅ DONE
- [x] T-0704 — Creare servizio Excel export (`ExcelExportService` con ExcelJS): export contatti e account con colonne configurabili — [2 SP] — ✅ DONE
- [x] T-0705 — Pulsante export nelle pagine lista Contacts e Accounts: `GET /crm/contacts/export?format=xlsx&filters=...` — download diretto — [1 SP] — ✅ DONE
- [x] T-0706 — API custom fields: `POST /crm/custom-fields` (entity, name, type: text|number|date|select, options[], required), `GET /crm/custom-fields?entity=account`, `PATCH`, `DELETE` — valori salvati in tabella `CustomFieldValue` (entityId, fieldId, value JSONB) — [3 SP] — ✅ DONE
- [x] T-0707 — Componenti rendering custom fields: `CustomFieldRenderer` che genera input MUI corretto per tipo (TextField, NumberField, DatePicker, Select), integrato nei form Account/Contact/Deal — [2 SP] — ✅ DONE
- [x] T-0708 — UI admin configurazione custom fields: pagina `frontend/src/pages/dashboard/crm/settings/custom-fields.tsx` con lista campi per entità, dialog crea/modifica — [1 SP] — ✅ DONE
- [x] T-0709 — Motore segmentazione dinamica: `SegmentService` che trasforma regole JSON (field, operator, value) in query Prisma — supporta AND/OR, campi standard + custom — [1 SP] — ✅ DONE

---

## Dipendenze

- Sprint 01/02: Contact e Account CRUD funzionanti.
- Sprint 04: Deal CRUD funzionante (per custom fields su deal).
- BullMQ configurato (per import async).
- Socket.IO configurato (per progress tracking import).

## Rischi

1. **CSV malformati** — File con encoding errato, delimitatori misti, righe incomplete. Mitigazione: detection encoding con `chardet`, supporto delimitatori `,` `;` `\t`, skip righe invalide con report errori.
2. **Custom fields performance** — Query su `CustomFieldValue` JSONB può essere lenta senza indici. Mitigazione: GIN index su colonna `value`, limitare query su custom fields a casi filtrati.
3. **Segmentazione query injection** — Regole JSON trasformate in query potrebbero permettere injection. Mitigazione: whitelist di campi e operatori permessi, validazione strict con class-validator prima di costruire la query.

## Definition of Done

- [ ] Import CSV funziona end-to-end (upload → mapping → preview → import)
- [ ] Progress import visibile via Socket.IO
- [ ] Errori import riportati riga per riga
- [ ] Export Excel funziona per contatti e account
- [ ] Custom fields CRUD funzionante per Account, Contact, Deal
- [ ] Custom fields renderizzati correttamente nei form entità
- [ ] Admin UI per configurare custom fields
- [ ] Segmentazione produce query corrette con regole AND/OR
- [ ] Nessun rischio SQL injection nelle query segmentazione
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- `CsvImportService` e `ExcelExportService` sotto `backend/src/modules/crm/import-export/`
- UI import multi-step con field mapping
- API e componenti custom fields
- Pagina admin custom fields
- `SegmentService` con motore regole → query
