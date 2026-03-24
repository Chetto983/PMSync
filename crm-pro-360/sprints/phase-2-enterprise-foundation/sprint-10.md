# Sprint 10 — Marketing: Workflow Engine & Landing Pages

**Phase:** 2 — Enterprise Foundation
**Epic:** EP-05 — Marketing Automation
**Date:** M5-W3 → M5-W4
**Status:** 📋 TODO

---

## Obiettivo Sprint

Implementare il workflow engine condizionale multi-step per automazioni marketing, l'esecuzione A/B testing con calcolo significatività statistica, il landing page builder con form tracking, la logica di progressive profiling, e il servizio di attribution modeling multi-touch con connettori ad platform.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| Backend | 3 | 36 |
| Frontend | 3 | 33 |
| QA | 1 | 10 |
| Data Engineer | 1 | 11 |
| **Totale** | **8** | **90 SP** |

---

## Sprint Backlog

- [ ] T-1001 — Workflow engine backend con BullMQ (esecuzione step asincroni, retry, timeout) — 8 SP — Backend — 📋 TODO
- [ ] T-1002 — Editor visuale workflow con nodi if/else, wait, action, trigger — 8 SP — Frontend — 📋 TODO
- [ ] T-1003 — Configurazione trigger workflow (evento contatto, tag, score threshold, data) — 5 SP — Backend — 📋 TODO
- [ ] T-1004 — Motore esecuzione A/B test con split traffic configurabile — 5 SP — Backend — 📋 TODO
- [ ] T-1005 — Calcolatore significatività statistica (Z-test, confidence interval) — 5 SP — Data Engineer — 📋 TODO
- [ ] T-1006 — Landing page builder con componenti drag-and-drop (hero, form, CTA, testimonial) — 8 SP — Frontend — 📋 TODO
- [ ] T-1007 — Form builder con campi dinamici e tracking submission — 5 SP — Frontend — 📋 TODO
- [ ] T-1008 — Logica progressive profiling (campi mostrati in base a dati già noti del contatto) — 5 SP — Backend — 📋 TODO
- [ ] T-1009 — Servizio attribution modeling: first-touch, last-touch, multi-touch lineare — 5 SP — Backend — 📋 TODO
- [ ] T-1010 — Connettore Google Ads (import costi campagna, sync conversioni) — 5 SP — Data Engineer — 📋 TODO
- [ ] T-1011 — Connettore Meta Ads (import costi campagna, sync audience) — 5 SP — Backend — 📋 TODO
- [ ] T-1012 — Connettore LinkedIn Ads (import costi campagna, sync lead gen forms) — 5 SP — Backend — 📋 TODO
- [ ] T-1013 — Dashboard ROI campagne con metriche costo/lead, costo/opportunità, ROAS — 5 SP — Frontend — 📋 TODO
- [ ] T-1014 — Analytics landing page (visite, conversioni, bounce rate, heatmap base) — 5 SP — Frontend — 📋 TODO
- [ ] T-1015 — Webhook form submission con payload configurabile e retry — 3 SP — Backend — 📋 TODO
- [ ] T-1016 — Pipeline ETL dati ads platform per calcolo attribution — 3 SP — Data Engineer — 📋 TODO
- [ ] T-1017 — Test integrazione workflow engine (esecuzione multi-step, branching, timeout) — 5 SP — QA — 📋 TODO
- [ ] T-1018 — Test E2E landing page builder e form submission — 5 SP — QA — 📋 TODO

**Totale:** 90 SP — 18 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Credenziali API Google Ads (developer token, OAuth client) | PM | 📋 TODO | Necessario per T-1010 |
| Credenziali API Meta Marketing (app ID, access token) | PM | 📋 TODO | Necessario per T-1011 |
| Credenziali API LinkedIn Marketing (app ID, OAuth 2.0) | PM | 📋 TODO | Necessario per T-1012 |
| Sprint 09 completato (campaign engine base) | Team | 📋 TODO | Workflow engine dipende da campagne |
| Dominio staging per hosting landing page | DevOps | 📋 TODO | Necessario per T-1006 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Le API ads platform (Google/Meta/LinkedIn) hanno rate limit stringenti che rallentano lo sviluppo | Alta | Medio | Usare sandbox account; implementare caching aggressivo dei dati importati |
| 2 | Il workflow engine con branching complesso potrebbe generare deadlock o loop infiniti | Media | Alto | Implementare max execution time, cycle detection, e max step count per workflow |
| 3 | Il calcolo attribution multi-touch richiede dati storici non ancora disponibili nel sistema | Alta | Medio | Generare dati seed realistici; implementare attribution incrementale man mano che i dati arrivano |
| 4 | Il landing page builder potrebbe avere conflitti CSS con il tema del customer portal | Bassa | Medio | Isolamento CSS via Shadow DOM o iframe; namespace tutti gli stili |

---

## Definition of Done Sprint

- [ ] Workflow engine esegue correttamente sequenze multi-step con branching if/else
- [ ] Wait node rispetta delay configurato (minuti, ore, giorni) con precisione < 1 minuto
- [ ] A/B test split traffic entro margine 2% della distribuzione configurata
- [ ] Calcolatore significatività produce risultati corretti validati contro tool statistici di riferimento
- [ ] Landing page builder genera pagine responsive funzionanti su mobile e desktop
- [ ] Form submission tracciata correttamente con progressive profiling attivo
- [ ] Almeno un connettore ads (Google Ads) funzionante end-to-end con import dati
- [ ] Dashboard ROI mostra metriche aggregate corrette per campagna
- [ ] Tutti i test integrazione e E2E passano
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` pulito)
- [ ] Code review approvata per ogni PR

---

## Deliverable Attesi

1. **Workflow Engine** — Motore esecuzione workflow multi-step con branching condizionale e editor visuale
2. **A/B Testing Engine** — Split traffic automatico con calcolo significatività statistica
3. **Landing Page Builder** — Builder drag-and-drop con form tracking e progressive profiling
4. **Attribution Modeling** — Servizio attribution first/last/multi-touch con connettori ads platform
5. **Campaign ROI Dashboard** — Metriche aggregate costo/lead e ROAS per campagna

---

## Demo/Review Notes

**Data Demo:** _______________
**Partecipanti:** _______________

### Funzionalità Dimostrate
| # | Funzionalità | Esito | Note |
|---|-------------|-------|------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

### Feedback Stakeholder
-

### Action Items Post-Review
- [ ]
- [ ]

### Velocity Effettiva
- **SP Pianificati:** 90
- **SP Completati:** ___
- **SP Carry-over:** ___
