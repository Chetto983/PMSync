# Sprint 11 — Customer Service: Ticketing Core

**Phase:** 2 — Enterprise Foundation
**Epic:** EP-06 — Customer Service
**Date:** M6-W1 → M6-W2
**Status:** 📋 TODO

---

## Obiettivo Sprint

Implementare il sistema di ticketing multi-canale con supporto email e chat, il routing intelligente basato su regole e competenze agente, la gestione SLA con timer ed escalation automatica, e la dashboard agente con coda, ticket assegnati e metriche di performance.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| Backend | 3 | 36 |
| Frontend | 3 | 30 |
| QA | 1 | 11 |
| UX | 1 | 8 |
| **Totale** | **8** | **85 SP** |

---

## Sprint Backlog

- [ ] T-1101 — API CRUD ticket con validazione multi-tenant e permessi RBAC — 5 SP — Backend — 📋 TODO
- [ ] T-1102 — Servizio parsing email-to-ticket (inbound email webhook, estrazione subject/body/attachments) — 5 SP — Backend — 📋 TODO
- [ ] T-1103 — Chat widget come Web Component embeddabile (Shadow DOM, configurabile via attributi) — 8 SP — Frontend — 📋 TODO
- [ ] T-1104 — Routing engine intelligente (regole keyword, priority-based, skill-based, round-robin) — 5 SP — Backend — 📋 TODO
- [ ] T-1105 — Servizio configurazione SLA (definizione policy per priority, canale, tipo cliente) — 3 SP — Backend — 📋 TODO
- [ ] T-1106 — Timer SLA con escalation automatica (warning, breach, multi-livello) — 5 SP — Backend — 📋 TODO
- [ ] T-1107 — Dashboard agente: coda ticket, ticket assegnati, metriche personali — 8 SP — Frontend — 📋 TODO
- [ ] T-1108 — Vista dettaglio ticket con timeline conversazione multi-canale — 5 SP — Frontend — 📋 TODO
- [ ] T-1109 — Workflow stati ticket (state machine: new → open → pending → resolved → closed) — 3 SP — Backend — 📋 TODO
- [ ] T-1110 — Gestione priorità ticket (urgent, high, normal, low) con SLA differenziati — 2 SP — Backend — 📋 TODO
- [ ] T-1111 — Assegnazione e riassegnazione ticket (manuale, automatica, bulk) — 3 SP — Backend — 📋 TODO
- [ ] T-1112 — Note interne su ticket (visibili solo agli agenti, con mention @) — 3 SP — Frontend — 📋 TODO
- [ ] T-1113 — Libreria risposte predefinite (canned responses) con variabili template — 3 SP — Backend — 📋 TODO
- [ ] T-1114 — UI risposte predefinite con ricerca e inserimento rapido — 3 SP — Frontend — 📋 TODO
- [ ] T-1115 — Merge ticket (unione ticket duplicati con consolidamento timeline) — 3 SP — Backend — 📋 TODO
- [ ] T-1116 — Timeline multi-canale unificata (email, chat, note interne in vista singola) — 5 SP — Frontend — 📋 TODO
- [ ] T-1117 — Alert breach SLA (notifica in-app, email, webhook) — 3 SP — Backend — 📋 TODO
- [ ] T-1118 — UX research e wireframe per dashboard agente e ticket detail — 3 SP — UX — 📋 TODO
- [ ] T-1119 — Wireframe chat widget e flusso interazione utente finale — 5 SP — UX — 📋 TODO
- [ ] T-1120 — Test integrazione API ticketing (CRUD, routing, SLA timer) — 5 SP — QA — 📋 TODO
- [ ] T-1121 — Test E2E flusso completo: creazione ticket → routing → risposta → risoluzione — 3 SP — QA — 📋 TODO
- [ ] T-1122 — Test chat widget cross-browser (Chrome, Firefox, Safari, Edge) — 3 SP — QA — 📋 TODO

**Totale:** 85 SP — 22 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Configurazione inbound email (dominio dedicato per ricezione, MX record) | DevOps | 📋 TODO | Necessario per T-1102 |
| WebSocket/Socket.IO infrastruttura per chat real-time | Backend Lead | 📋 TODO | Già presente nel progetto (Socket.IO), verificare scaling |
| Design system componenti chat (bubble, input, typing indicator) | UX Lead | 📋 TODO | Necessario per T-1103 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Il Web Component chat potrebbe avere problemi di compatibilità con siti cliente che usano framework JS legacy | Media | Alto | Testare su stack comuni (jQuery, Angular 1.x, WordPress); isolare completamente via Shadow DOM |
| 2 | Il routing intelligente skill-based richiede configurazione competenze agenti non ancora definita | Alta | Medio | Implementare prima round-robin e rule-based; skill-based come enhancement progressivo |
| 3 | I timer SLA con precision sub-minuto potrebbero sovraccaricare il sistema con molti ticket aperti | Media | Alto | Usare approccio event-driven con BullMQ delayed jobs invece di polling; batch check periodico |
| 4 | Il parsing email-to-ticket potrebbe fallire su formati email non standard o encoding particolari | Alta | Medio | Usare libreria robusta (mailparser); implementare fallback con body raw; coda errori per review manuale |

---

## Definition of Done Sprint

- [ ] API CRUD ticket funzionante con filtro multi-tenant su tutte le query
- [ ] Parsing email-to-ticket crea correttamente ticket da email inbound con subject, body e attachments
- [ ] Chat widget funziona come Web Component standalone su pagina HTML vanilla
- [ ] Routing engine assegna ticket secondo regole configurate (keyword match, round-robin verificato)
- [ ] Timer SLA calcola correttamente tempo rimanente considerando orari lavorativi configurati
- [ ] Escalation automatica scatta entro 1 minuto dal breach SLA
- [ ] Dashboard agente mostra coda, ticket assegnati e metriche aggiornate in real-time
- [ ] State machine ticket gestisce tutte le transizioni valide e rifiuta quelle invalide
- [ ] Merge ticket consolida correttamente le timeline senza perdita di messaggi
- [ ] Tutti i test integrazione e E2E passano
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` pulito)
- [ ] Code review approvata per ogni PR

---

## Deliverable Attesi

1. **Ticketing API** — CRUD completo con routing automatico, gestione priorità e state machine
2. **Chat Widget** — Web Component embeddabile con conversazione real-time via Socket.IO
3. **SLA Engine** — Configurazione policy, timer con countdown, escalation automatica multi-livello
4. **Agent Dashboard** — Vista coda, ticket assegnati, timeline conversazione, metriche agente
5. **Canned Responses** — Libreria risposte predefinite con variabili template e ricerca

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
- **SP Pianificati:** 85
- **SP Completati:** ___
- **SP Carry-over:** ___
