# Sprint 15 — Ticket Model & Email-to-Ticket

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-04-06 → 2026-04-19 (2 settimane)      |
| **Obiettivo**    | Modello ticket con workflow stati, servizio conversione email→ticket, ticket CRUD API, ticket list UI |
| **Capacità**     | 18 SP (solo dev, ~9 SP/settimana)           |

---

## Sprint Backlog

- [x] T-1501 — Prisma model `Ticket` — [2 SP] — ✅ DONE
- [x] T-1502 — Prisma model `TicketComment` — [1 SP] — ✅ DONE
- [x] T-1503 — Migrazione Prisma e generazione client — [1 SP] — ✅ DONE
- [x] T-1504 — NestJS `TicketModule` (controller, service, DTOs) — [3 SP] — ✅ DONE
- [x] T-1505 — Ticket CRUD API — [3 SP] — ✅ DONE
- [x] T-1506 — Ticket status state machine — [2 SP] — ✅ DONE
- [x] T-1507 — Email-to-Ticket service — [3 SP] — ✅ DONE
- [x] T-1508 — Pagina ticket list — [2 SP] — ✅ DONE
- [x] T-1509 — Pagina ticket detail — [2 SP] — ✅ DONE
- [x] T-1510 — TanStack Query hooks — [1 SP] — ✅ DONE

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
