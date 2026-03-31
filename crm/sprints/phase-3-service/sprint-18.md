# Sprint 18 — CSAT, Reports & Beta Release

| Campo            | Valore                                      |
| ---------------- | ------------------------------------------- |
| **Fase**         | Phase 3 — Customer Service                  |
| **Date**         | 2026-05-18 → 2026-05-31 (2 settimane)      |
| **Obiettivo**    | Survey CSAT automatico post-risoluzione, report SLA e performance, stabilizzazione, beta release |
| **Capacità**     | 16 SP (solo dev, ~8 SP/settimana)           |

---

## Sprint Backlog

- [x] T-1801 — Prisma model `CSATSurvey` (id, tenantId, ticketId FK unique, rating int 1-5, comment text nullable, respondedAt nullable, token string unique per accesso pubblico, createdAt). Prisma model `TicketTemplate` (id, tenantId, name, body text, category string nullable, createdAt) per canned responses — [2 SP] — ✅ DONE
- [x] T-1802 — CSAT email trigger: BullMQ job che si attiva quando ticket passa a status `resolved`. Inviare email al contatto del ticket con link alla survey (`/portal/survey/:token`). Riutilizzare infrastruttura email PMSync (SendGrid HTTP API). Delay configurabile (default 1 ora post-risoluzione) — [3 SP] — ✅ DONE
- [x] T-1803 — CSAT response page (`/portal/survey/:token`): pagina pubblica con 5 stelle cliccabili (MUI Rating component), campo commento opzionale, submit button. Mostrare subject del ticket per contesto. Dopo submit, mostrare messaggio di ringraziamento. Impedire doppio submit — [2 SP] — ✅ DONE
- [x] T-1804 — CSAT aggregation API: `GET /analytics/csat` con filtri dateRange, assigneeId. Restituire: media voto, conteggio risposte, distribuzione per stella, trend mensile (ultimi 6 mesi). Query aggregate Prisma, filtrate per tenantId — [2 SP] — ✅ DONE
- [x] T-1805 — Service analytics page (`/analytics/service`): dashboard con 4 card KPI (first response time medio, resolution time medio, SLA compliance rate %, CSAT medio). Grafico trend CSAT con MUI/Recharts. Tabella top 10 ticket per tempo di risoluzione. Filtro periodo — [3 SP] — ✅ DONE
- [x] T-1806 — Canned responses: API CRUD `TicketTemplate` (`POST /ticket-templates`, `GET /ticket-templates`, `PATCH`, `DELETE`). Nel form risposta ticket, bottone "Inserisci risposta rapida" con menu dropdown che lista template e inserisce body nel campo commento — [2 SP] — ✅ DONE
- [x] T-1807 — Bug fixes Phase 3: riservare capacity per fix di bug scoperti durante sprint 15-17. Prioritizzare: crash bloccanti > dati corrotti > UX broken > cosmetici — [2 SP] — ✅ DONE
- [x] T-1808 — Integration test suite per ticketing: testare flusso completo email→ticket→assign→SLA→resolve→CSAT. Verificare routing rules, state machine transitions, portal tracking. Usare test database separato — [2 SP] — ✅ DONE
- [ ] T-1809 — Smoke test end-to-end: test manuale di tutti i flussi critici su ambiente di staging. Checklist: creazione ticket, assegnazione, SLA escalation, risoluzione, CSAT survey, KB search, portal submit, portal tracking — [1 SP] — 📋 TODO
- [ ] T-1810 — Beta release preparation: aggiornare seed data con ticket, KB articles e SLA policies di esempio. Verificare migrazioni in sequenza da zero. Tag git `v0.3.0-beta`. Deploy su Railway staging — [1 SP] — 📋 TODO

**Totale: 20 SP** _(buffer -4 SP per bug fix e stabilizzazione = 16 SP effettivi)_

---

## Dipendenze

- Sprint 15-17 completati: tutti i modelli, API e pagine del modulo ticketing funzionanti.
- SendGrid HTTP API configurata e funzionante (infrastruttura PMSync esistente).
- BullMQ/Redis operativi per job CSAT delayed.
- Ambiente staging Railway disponibile per smoke test e beta deploy.

## Rischi

1. **Accumulo bug dagli sprint precedenti** — I 2 SP riservati per bug fix potrebbero non bastare se sprint 15-17 hanno lasciato debito tecnico significativo. Mitigazione: tracciare bug appena scoperti, prioritizzare solo bloccanti, rimandare cosmetici a Phase 4.
2. **Email deliverability CSAT** — Le email survey potrebbero finire in spam, specialmente se il dominio SendGrid non ha DKIM/SPF configurati. Mitigazione: verificare setup DNS prima dello sprint, usare template email minimale senza immagini.
3. **Calcolo metriche SLA inaccurato** — Il calcolo di first response time e resolution time dipende dalla correttezza dei timestamp di assegnazione e risoluzione. Se ci sono stati aggiornamenti manuali o edge case nella state machine, le metriche saranno sballate. Mitigazione: validare metriche su 20+ ticket di test prima di mostrare in dashboard.

## Definition of Done

- [ ] Survey CSAT inviata automaticamente 1 ora dopo risoluzione ticket
- [ ] Pagina survey pubblica funzionante con rating 1-5 e commento
- [ ] Doppio submit survey impedito (token monouso)
- [ ] Dashboard analytics mostra KPI reali con dati corretti
- [ ] Trend CSAT visualizzato correttamente su grafico
- [ ] Canned responses inseribili nel form risposta ticket
- [ ] Test suite integration passa su tutti i flussi critici
- [ ] Smoke test manuale completato senza errori bloccanti
- [ ] Migrazioni Prisma applicabili in sequenza da database vuoto
- [ ] Tag `v0.3.0-beta` creato e deploy su staging riuscito
- [ ] `npx tsc --noEmit` passa su backend e frontend senza errori
- [ ] `npm run lint:win` passa su entrambi i progetti

## Deliverable Attesi

- Modelli `CSATSurvey` e `TicketTemplate` in Prisma
- Job BullMQ per invio automatico survey CSAT post-risoluzione
- Pagina survey pubblica nel portal
- API aggregazione CSAT con metriche e trend
- Dashboard analytics service con KPI e grafici
- Libreria canned responses con quick-insert nel form risposta
- Test suite integration per flusso ticketing completo
- Release `v0.3.0-beta` deployata su staging
