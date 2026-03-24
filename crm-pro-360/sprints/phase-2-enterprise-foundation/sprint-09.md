# Sprint 09 — Marketing Automation: Campaign Builder

**Phase:** 2 — Enterprise Foundation
**Epic:** EP-05 — Marketing Automation
**Date:** M5-W1 → M5-W2
**Status:** 📋 TODO

---

## Obiettivo Sprint

Implementare il campaign builder drag-and-drop per la creazione di campagne marketing, il motore di template email WYSIWYG basato su MJML, il selettore audience con segmentazione avanzata per campagne, e il servizio di scheduling email con gestione della coda di invio.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| Backend | 3 | 36 |
| Frontend | 3 | 33 |
| QA | 1 | 13 |
| UX | 1 | 8 |
| **Totale** | **8** | **90 SP** |

---

## Sprint Backlog

- [ ] T-0901 — API CRUD campagne con validazione multi-tenant — 5 SP — Backend — 📋 TODO
- [ ] T-0902 — Modello dati campagna (Prisma schema: Campaign, CampaignStep, CampaignRecipient) — 3 SP — Backend — 📋 TODO
- [ ] T-0903 — Campaign builder UI drag-and-drop con nodi step — 8 SP — Frontend — 📋 TODO
- [ ] T-0904 — Motore rendering template email basato su MJML — 5 SP — Backend — 📋 TODO
- [ ] T-0905 — Editor WYSIWYG template email con anteprima live — 8 SP — Frontend — 📋 TODO
- [ ] T-0906 — Libreria template preset (20+ modelli categorizzati) — 5 SP — UX — 📋 TODO
- [ ] T-0907 — Selettore audience con filtri segmentazione (demografici, comportamentali, custom) — 5 SP — Frontend — 📋 TODO
- [ ] T-0908 — Servizio scheduling email con coda BullMQ e rate limiting — 5 SP — Backend — 📋 TODO
- [ ] T-0909 — Integrazione email delivery con SendGrid e AWS SES (driver pattern) — 5 SP — Backend — 📋 TODO
- [ ] T-0910 — Gestione stati campagna (draft, scheduled, sending, sent, paused, cancelled) — 3 SP — Backend — 📋 TODO
- [ ] T-0911 — Anteprima email responsive (desktop e mobile side-by-side) — 5 SP — Frontend — 📋 TODO
- [ ] T-0912 — Vista lista campagne con filtri, ordinamento e paginazione — 5 SP — Frontend — 📋 TODO
- [ ] T-0913 — Vista dettaglio campagna con metriche real-time — 5 SP — Frontend — 📋 TODO
- [ ] T-0914 — Gestione unsubscribe con link one-click e suppression list — 3 SP — Backend — 📋 TODO
- [ ] T-0915 — Verifica dominio sender (SPF, DKIM, DMARC check) — 3 SP — Backend — 📋 TODO
- [ ] T-0916 — Tracking analytics email (open pixel, click redirect, eventi webhook) — 5 SP — Backend — 📋 TODO
- [ ] T-0917 — Gestione bounce (hard/soft) con aggiornamento automatico suppression list — 3 SP — Backend — 📋 TODO
- [ ] T-0918 — Duplicazione campagna con deep clone di step e template — 2 SP — Backend — 📋 TODO
- [ ] T-0919 — UI setup A/B test (varianti subject, contenuto, orario invio) — 3 SP — Frontend — 📋 TODO
- [ ] T-0920 — UX research e wireframe per campaign builder flow — 3 SP — UX — 📋 TODO
- [ ] T-0921 — Test integrazione API campagne (CRUD, scheduling, delivery) — 5 SP — QA — 📋 TODO
- [ ] T-0922 — Test E2E campaign builder e template editor — 5 SP — QA — 📋 TODO
- [ ] T-0923 — Test di carico scheduling service (10k email/min target) — 3 SP — QA — 📋 TODO

**Totale:** 90 SP — 23 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Account SendGrid con API key e dominio verificato | DevOps | 📋 TODO | Necessario per T-0909 |
| Account AWS SES con sandbox mode disabilitato | DevOps | 📋 TODO | Alternativa a SendGrid per T-0909 |
| Licenza MJML o conferma uso versione open-source | PM | 📋 TODO | Necessario per T-0904 |
| Design system aggiornato con componenti drag-and-drop | UX Lead | 📋 TODO | Necessario per T-0903 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Il rendering MJML potrebbe non coprire tutti i client email target (Outlook, Gmail, Apple Mail) | Media | Alto | Testare con Litmus/Email on Acid su top 10 client; definire tier di supporto |
| 2 | Il drag-and-drop builder potrebbe avere problemi di performance con campagne complesse (20+ nodi) | Media | Medio | Virtualizzazione canvas, lazy rendering nodi fuori viewport |
| 3 | Rate limiting SendGrid/SES potrebbe bloccare invii massivi durante i test | Alta | Medio | Usare sandbox/test mode; implementare backoff esponenziale nel queue |
| 4 | La gestione bounce richiede webhook endpoint pubblico non ancora disponibile in staging | Bassa | Alto | Configurare ngrok o tunnel temporaneo per staging; pianificare endpoint produzione |

---

## Definition of Done Sprint

- [ ] Tutte le API campagne passano test integrazione con copertura > 80%
- [ ] Campaign builder drag-and-drop funzionante con almeno 5 tipi di nodo (email, delay, condition, split, end)
- [ ] Editor WYSIWYG produce HTML email valido e responsive su desktop e mobile
- [ ] Almeno 20 template preset disponibili nella libreria, categorizzati per tipo
- [ ] Scheduling service processa correttamente code di invio con rate limiting configurabile
- [ ] Tracking open/click funzionante con dati visibili nella vista dettaglio campagna
- [ ] Gestione unsubscribe conforme CAN-SPAM e GDPR (one-click unsubscribe header)
- [ ] Tutti i test E2E passano su Chrome e Firefox
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` pulito su frontend e backend)
- [ ] Code review approvata da almeno 2 reviewer per ogni PR
- [ ] Documentazione API aggiornata su Swagger

---

## Deliverable Attesi

1. **Campaign Builder MVP** — Interfaccia drag-and-drop per creazione campagne multi-step
2. **Template Engine** — Motore MJML con editor WYSIWYG e libreria 20+ preset
3. **Email Scheduling Service** — Coda BullMQ con integrazione SendGrid/SES e rate limiting
4. **Analytics Base** — Tracking open/click con dashboard metriche per campagna
5. **Compliance Module** — Gestione unsubscribe, bounce, e verifica dominio sender

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
