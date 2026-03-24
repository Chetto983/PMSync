# Sprint 15 — Ticket Model & Email-to-Ticket

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-04-06 → 2026-04-19 (2 settimane)      |
| **Obiettivo**    | Modello ticket con workflow stati, servizio conversione email→ticket, ticket CRUD API, ticket list UI |
| **Capacità**     | 18 SP (solo dev, ~9 SP/settimana)           |

---

## Sprint Backlog

- [ ] T-1501 — Prisma model `Ticket` (id, tenantId, subject, description, status enum `[open, in_progress, waiting, resolved, closed]`, priority enum `[low, medium, high, urgent]`, assigneeId, contactId, accountId, emailThreadId, slaDeadline, createdAt, updatedAt) con indici su tenantId+status e tenantId+assigneeId — [2 SP] — 📋 TODO
- [ ] T-1502 — Prisma model `TicketComment` (id, ticketId, authorId, body, isInternal boolean, createdAt) con FK verso Ticket e User — [1 SP] — 📋 TODO
- [ ] T-1503 — Migrazione Prisma e generazione client. Verificare che i modelli esistenti (Email, Contact, Account) non abbiano conflitti con le nuove relazioni — [1 SP] — 📋 TODO
- [ ] T-1504 — NestJS `TicketModule` con controller, service e DTOs (CreateTicketDto, UpdateTicketDto, TicketFilterDto con paginazione). Registrare nel root module — [3 SP] — 📋 TODO
- [ ] T-1505 — Ticket CRUD API: `POST /tickets`, `GET /tickets` (con filtri status/priority/assignee + paginazione cursor-based), `GET /tickets/:id`, `PATCH /tickets/:id`, `DELETE /tickets/:id`. Ogni query filtrata per tenantId — [3 SP] — 📋 TODO
- [ ] T-1506 — Ticket status state machine: definire transizioni valide (open→in_progress, in_progress→waiting, waiting→in_progress, in_progress→resolved, resolved→closed, qualsiasi→closed). Rifiutare transizioni non valide con 422 — [2 SP] — 📋 TODO
- [ ] T-1507 — Email-to-Ticket service: riutilizzare il parser email esistente di PMSync per convertire email in arrivo da inbox/folder dedicata in ticket. Creare ticket con subject dall'email, body come description, linkare emailThreadId. Gestire deduplicazione su messageId — [3 SP] — 📋 TODO
- [ ] T-1508 — Pagina ticket list (`/tickets`): MUI DataGrid con colonne subject, status (chip colorato), priority, assignee, createdAt. Filtri per status e priority nella toolbar. Paginazione server-side — [2 SP] — 📋 TODO
- [ ] T-1509 — Pagina ticket detail (`/tickets/:id`): visualizzazione dati ticket, thread conversazione dalle email linkate (riutilizzare componenti email esistenti), sezione commenti — [2 SP] — 📋 TODO
- [ ] T-1510 — TanStack Query hooks: `useTickets(filters)`, `useTicket(id)`, `useCreateTicket()`, `useUpdateTicket()`. queryOptions con staleTime 5min, gcTime 30min, retry 1. Export da `frontend/hooks/queries/index.ts` — [1 SP] — 📋 TODO

**Totale: 20 SP** _(buffer -2 SP per imprevisti migrazione = 18 SP effettivi)_

---

## Dipendenze

- Modelli Prisma esistenti: `Email`, `EmailThread`, `Contact`, `Account`, `User` devono essere disponibili e stabili.
- Email parsing engine di PMSync (folder management, thread detection) deve essere funzionante.
- Autenticazione (better-auth session) attiva per estrarre tenantId e userId dal context.

## Rischi

1. **Conflitto migrazione Prisma** — L'aggiunta di FK verso EmailThread potrebbe richiedere backfill su dati esistenti. Mitigazione: rendere emailThreadId nullable.
2. **Complessità email-to-ticket** — Il parser email potrebbe non gestire tutti i formati (HTML-only, allegati inline). Mitigazione: iniziare con plain text + subject, iterare dopo.
3. **Performance DataGrid** — Con molti ticket il cursor-based pagination potrebbe avere edge case. Mitigazione: testare con 1000+ record seed.

## Definition of Done

- [ ] Migrazione Prisma applicata senza errori su database di sviluppo
- [ ] Tutti gli endpoint CRUD rispondono correttamente (test manuale o HTTP file)
- [ ] State machine rifiuta transizioni non valide con status 422
- [ ] Email-to-ticket crea ticket correttamente da email di test
- [ ] Pagina lista ticket mostra dati reali con filtri funzionanti
- [ ] Pagina dettaglio ticket mostra conversazione email linkata
- [ ] `npx tsc --noEmit` passa su backend e frontend senza errori
- [ ] `npm run lint:win` passa su entrambi i progetti

## Deliverable Attesi

- Schema Prisma aggiornato con modelli `Ticket` e `TicketComment`
- `TicketModule` NestJS completo (controller, service, DTOs)
- Servizio email-to-ticket integrato con engine email PMSync
- Pagine `/tickets` e `/tickets/:id` funzionanti nel frontend
- Query hooks TanStack pronti per riuso nei sprint successivi
