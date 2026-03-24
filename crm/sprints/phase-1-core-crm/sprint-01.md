# Sprint 01 — Schema CRM & Account Model

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 01 di 08 |
| **Date** | 2026-03-25 → 2026-04-07 |
| **Obiettivo Sprint** | Definire lo schema Prisma per tutti i modelli CRM (Account, Pipeline, Stage, Deal, Product). Implementare Account CRUD backend + Account list UI. |
| **Capacità** | 18 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0101 — Definire schema Prisma: modello `Account` con campi (name, website, industry, size, revenue, address, tenantId, parentId) e relazioni — [3 SP] — 📋 TODO
- [ ] T-0102 — Definire schema Prisma: modelli `Pipeline`, `Stage` (position, probability, color), `Deal` (amount, currency, expectedCloseDate, stage, pipeline, account, contact) — [3 SP] — 📋 TODO
- [ ] T-0103 — Definire schema Prisma: modelli `Product` (name, code, price, currency), `DealProduct` (quantity, discount, unitPrice), `AccountContact` (role, isPrimary) — [2 SP] — 📋 TODO
- [ ] T-0104 — Eseguire migration Prisma e verificare che `npx prisma generate` produca il client corretto — [1 SP] — 📋 TODO
- [ ] T-0105 — Creare modulo NestJS `AccountModule` con controller, service, DTOs (CreateAccountDto, UpdateAccountDto, AccountResponseDto) — [2 SP] — 📋 TODO
- [ ] T-0106 — Implementare endpoint CRUD Account: `GET /crm/accounts`, `GET /crm/accounts/:id`, `POST /crm/accounts`, `PATCH /crm/accounts/:id`, `DELETE /crm/accounts/:id` — tutti tenant-scoped — [2 SP] — 📋 TODO
- [ ] T-0107 — Creare pagina Account list in `frontend/src/pages/dashboard/crm/accounts/index.tsx` con MUI DataGrid (sorting, pagination, search) — [2 SP] — 📋 TODO
- [ ] T-0108 — Creare dialog creazione Account (MUI Dialog con form: name, website, industry, size) — [1 SP] — 📋 TODO
- [ ] T-0109 — Creare TanStack Query hooks: `useAccounts`, `useAccount`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount` in `frontend/hooks/queries/use-accounts.ts` — [1 SP] — 📋 TODO
- [ ] T-0110 — Aggiungere traduzioni CRM Account in `frontend/locales/en.ts` e `it.ts`, aggiornare types in `index.ts` — [1 SP] — 📋 TODO

---

## Dipendenze

- Schema Prisma esistente PMSync (contacts, users, tenants) deve essere stabile.
- Ambiente PostgreSQL configurato e raggiungibile.
- Autenticazione better-auth funzionante per proteggere gli endpoint.

## Rischi

1. **Conflitto migration Prisma** — Lo schema CRM aggiunge molte tabelle; possibili conflitti con migration esistenti. Mitigazione: creare un singolo file migration per tutto il batch CRM.
2. **Complessità relazioni** — Le relazioni Account → Contact, Account → Deal, Deal → Product sono numerose. Rischio di circolarità o N+1 query. Mitigazione: definire eager loading solo dove necessario, usare `select` espliciti.
3. **Scope creep UI** — La tentazione di aggiungere filtri avanzati nella list page. Mitigazione: solo sorting/pagination/search base in questo sprint.

## Definition of Done

- [ ] Migration Prisma applicata senza errori su database locale
- [ ] `npx prisma generate` produce client con tutti i modelli CRM
- [ ] Tutti gli endpoint Account rispondono correttamente (testati via REST client)
- [ ] Ogni query Account include filtro `tenantId`
- [ ] Pagina Account list mostra dati reali dal backend
- [ ] Dialog creazione Account salva correttamente
- [ ] `cd backend && npx tsc --noEmit` passa senza errori
- [ ] `cd frontend && npx tsc --noEmit` passa senza errori

## Deliverable Attesi

- File migration Prisma con tutti i modelli CRM Phase 1
- Modulo NestJS `AccountModule` completo sotto `backend/src/modules/crm/account/`
- Pagina frontend Account list + dialog creazione
- TanStack Query hooks per Account CRUD
- Traduzioni CRM base (en + it)
