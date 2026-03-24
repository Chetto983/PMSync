# Sprint 02 — Account Detail & Contact-Account Linking

| Campo | Valore |
|-------|--------|
| **Fase** | Phase 1 — Core CRM |
| **Sprint** | 02 di 08 |
| **Date** | 2026-04-08 → 2026-04-21 |
| **Obiettivo Sprint** | Costruire la vista dettaglio Account con gerarchia parent-child e implementare l'associazione contatti-account con ruoli (Decision Maker, Influencer, User, etc). |
| **Capacità** | 17 SP (solo dev, 2 settimane) |

---

## Sprint Backlog

- [ ] T-0201 — Creare pagina Account detail in `frontend/src/pages/dashboard/crm/accounts/[id].tsx` con layout a tab (Info, Contacts, Deals, Activity) — [2 SP] — 📋 TODO
- [ ] T-0202 — Implementare card info Account (nome, website, industry, size, revenue, indirizzo) con editing inline — [2 SP] — 📋 TODO
- [ ] T-0203 — Implementare componente albero gerarchia Account (parent-child) con MUI TreeView — [2 SP] — 📋 TODO
- [ ] T-0204 — API parent-child Account: `PATCH /crm/accounts/:id` per settare `parentId`, endpoint `GET /crm/accounts/:id/children` per sotto-account — [2 SP] — 📋 TODO
- [ ] T-0205 — API associazione Contact-Account: `POST /crm/accounts/:id/contacts` (body: contactId, role), `DELETE /crm/accounts/:accountId/contacts/:contactId` — [2 SP] — 📋 TODO
- [ ] T-0206 — Tab Contacts nella pagina Account detail: lista contatti associati con ruolo, pulsante aggiungi contatto (picker dialog) — [2 SP] — 📋 TODO
- [ ] T-0207 — Aggiungere selettore Account nella pagina dettaglio Contact esistente (autocomplete con ricerca) — [1 SP] — 📋 TODO
- [ ] T-0208 — Implementare breadcrumb navigation per Account (Dashboard > CRM > Accounts > Account Name) — [1 SP] — 📋 TODO
- [ ] T-0209 — TanStack Query hooks: `useAccountChildren`, `useAccountContacts`, `useLinkContact`, `useUnlinkContact` — [1 SP] — 📋 TODO
- [ ] T-0210 — Aggiornare traduzioni en/it per detail view, ruoli contatto, breadcrumb — [1 SP] — 📋 TODO
- [ ] T-0211 — Type-check entrambe le app, verificare che non ci siano regressioni — [1 SP] — 📋 TODO

---

## Dipendenze

- Sprint 01 completato: schema Prisma con `Account`, `AccountContact` e migration applicata.
- Modulo Account CRUD backend funzionante.
- Pagina Contact detail esistente in PMSync (per integrare il selettore Account).

## Rischi

1. **Ricorsione gerarchia** — Un account potrebbe essere assegnato come parent di un suo ancestor, creando cicli. Mitigazione: validazione backend che previene cicli (max 5 livelli di profondità).
2. **Performance TreeView** — Con molti sotto-account, il componente albero potrebbe essere lento. Mitigazione: lazy loading dei children (fetch on expand).
3. **Integrazione Contact esistente** — Modificare la pagina Contact detail per aggiungere il selettore Account potrebbe introdurre regressioni. Mitigazione: isolare la modifica in un componente separato `AccountSelector`.

## Definition of Done

- [ ] Pagina Account detail mostra tutte le informazioni dell'account
- [ ] Editing inline funziona e salva correttamente
- [ ] Albero gerarchia visualizza parent e children correttamente
- [ ] Associazione contact-account crea record `AccountContact` con ruolo
- [ ] Tab Contacts mostra contatti associati con ruoli
- [ ] Selettore Account funziona nella pagina Contact detail
- [ ] Nessun ciclo possibile nella gerarchia (validazione backend)
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] `cd frontend && npx tsc --noEmit` passa

## Deliverable Attesi

- Pagina Account detail completa con tab layout
- Componente `AccountHierarchyTree` riutilizzabile
- API Contact-Account linking con ruoli
- Selettore Account integrato nella pagina Contact
- Breadcrumb navigation CRM
