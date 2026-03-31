# Sprint 16 — Routing, SLA & Agent Dashboard

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-04-20 → 2026-05-03 (2 settimane)      |
| **Obiettivo**    | Routing basato su regole, SLA management con timer, dashboard agente con code |
| **Capacità**     | 18 SP (solo dev, ~9 SP/settimana)           |

---

## Sprint Backlog

- [x] T-1601 — Prisma model `SLAPolicy` (id, tenantId, name, priority enum, responseTimeMinutes, resolutionTimeMinutes, businessHoursOnly boolean, createdAt). Seed con policy default per ogni priority level — [2 SP] — ✅ DONE
- [x] T-1602 — SLA timer service con BullMQ: alla creazione ticket, schedulare delayed job basato su SLAPolicy. Job controlla deadline → se scaduto, escalare (cambiare priority o notificare). Riutilizzare infrastruttura Redis/BullMQ esistente — [3 SP] — ✅ DONE
- [x] T-1603 — Routing rule engine: modello `RoutingRule` (id, tenantId, name, conditions JSON `{field, operator, value}[]`, action JSON `{assignTo, setPriority}`, priority/ordine, active boolean). Valutazione regole in ordine su ticket creation — [3 SP] — ✅ DONE
- [x] T-1604 — API routing rules CRUD: `POST /routing-rules`, `GET /routing-rules`, `PATCH /routing-rules/:id`, `DELETE /routing-rules/:id`. Condizioni supportate: keyword nel subject, sender domain, priority match — [2 SP] — ✅ DONE
- [x] T-1605 — SLA badge component: chip MUI che mostra tempo rimanente con colore semantico (green >50% tempo, yellow 20-50%, red <20%). Calcolo client-side basato su slaDeadline — [1 SP] — ✅ DONE
- [x] T-1606 — Ticket assignment e reassignment: endpoint `PATCH /tickets/:id/assign` con assigneeId. Ricalcolare SLA se priority cambia. Audit log per ogni cambio assegnazione (riutilizzare audit logging PMSync) — [2 SP] — ✅ DONE
- [x] T-1607 — Ticket internal notes: filtrare TicketComment per isInternal. Gli utenti staff vedono tutti i commenti, i commenti interni sono esclusi dalle API portal. UI con toggle "Nota interna" nel form commento — [1 SP] — ✅ DONE
- [x] T-1608 — Agent dashboard page (`/dashboard/agent`): tre colonne Kanban-style — "I miei ticket" (assignee=me), "Non assegnati" (assignee=null), "SLA a rischio" (slaDeadline entro 2 ore). MUI Card per ogni ticket con subject, priority chip, SLA badge — [3 SP] — ✅ DONE
- [x] T-1609 — Real-time ticket updates via Socket.IO: emettere eventi `ticket:created`, `ticket:updated`, `ticket:assigned` sul canale tenant. Dashboard agente si aggiorna in tempo reale senza polling. Riutilizzare gateway Socket.IO esistente — [2 SP] — ✅ DONE
- [ ] T-1610 — Type-check e lint su backend e frontend. Fix eventuali regressioni — [1 SP] — 📋 TODO

**Totale: 20 SP** _(buffer -2 SP per complessità BullMQ = 18 SP effettivi)_

---

## Dipendenze

- Sprint 15 completato: modelli `Ticket`, `TicketComment`, CRUD API funzionanti.
- BullMQ e Redis configurati e funzionanti (infrastruttura PMSync esistente).
- Socket.IO gateway esistente nel backend PMSync per eventi real-time.
- Audit logging service disponibile per tracciare cambi assegnazione.

## Rischi

1. **Complessità rule engine** — Le condizioni JSON potrebbero diventare complesse da validare. Mitigazione: limitare a 3 tipi di condizione (keyword, domain, priority) per MVP; estendere dopo.
2. **Race condition SLA timer** — Se un ticket viene aggiornato mentre il job BullMQ è in esecuzione, il timer potrebbe essere stale. Mitigazione: il job ri-legge il ticket dal DB prima di escalare, verifica che la deadline sia ancora superata.
3. **Performance dashboard real-time** — Troppi eventi Socket.IO su tenant con molti ticket potrebbero causare overhead. Mitigazione: throttle eventi a max 1/secondo per tipo, aggregare batch.

## Definition of Done

- [ ] SLA policy applicata automaticamente alla creazione di ogni ticket
- [ ] BullMQ job escalation scatta correttamente quando SLA scade (testato con timer breve)
- [ ] Routing rules assegnano ticket automaticamente in base a condizioni configurate
- [ ] Dashboard agente mostra le tre colonne con dati reali
- [ ] SLA badge mostra colori corretti in base al tempo rimanente
- [ ] Assegnazione ticket genera audit log entry
- [ ] Note interne visibili solo a staff, nascoste in API portal
- [ ] Eventi Socket.IO aggiornano dashboard senza refresh manuale
- [ ] `npx tsc --noEmit` passa su backend e frontend senza errori
- [ ] `npm run lint:win` passa su entrambi i progetti

## Deliverable Attesi

- Modelli `SLAPolicy` e `RoutingRule` in Prisma con seed data
- SLA timer service con BullMQ delayed jobs e logica escalation
- Rule engine per auto-routing ticket in ingresso
- Dashboard agente con vista Kanban e aggiornamento real-time
- Componente SLA badge riutilizzabile
