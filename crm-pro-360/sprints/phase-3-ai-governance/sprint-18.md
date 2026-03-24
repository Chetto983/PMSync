# Sprint 18 — Marketplace v1 & Beta Aperta

## Fase: Phase 3 — AI Governance & Scale

## Date: M9-W3 → M9-W4

## Obiettivo Sprint

Plugin system v1 con lifecycle completo, marketplace base per installazione plugin, developer portal per pubblicazione, V8 isolate sandbox per esecuzione sicura, preparazione beta aperta per 50 company con load testing e security hardening.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 85 SP | 3 Backend, 2 Frontend, 1 Security, 1 QA, 1 DevOps |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-1801 — Plugin lifecycle API (install, enable, disable, uninstall con hook pre/post) | 5 | Backend | 📋 TODO |
| 2 | T-1802 — Plugin manifest schema (JSON schema: nome, versione, permessi, entry point, dipendenze) | 3 | Backend | 📋 TODO |
| 3 | T-1803 — V8 isolate sandbox setup (isolated-vm, memory limit, timeout, no filesystem access) | 5 | Backend | 📋 TODO |
| 4 | T-1804 — Plugin permission model (scopes: read:contacts, write:deals, emit:events, ecc.) | 4 | Backend | 📋 TODO |
| 5 | T-1805 — Plugin host bridge (API limitata esposta ai plugin: CRM data, events, UI slots) | 5 | Backend | 📋 TODO |
| 6 | T-1806 — Marketplace listing page (grid card, filtri categoria, ricerca, ordinamento) | 4 | Frontend | 📋 TODO |
| 7 | T-1807 — App detail page (descrizione, screenshot, permessi richiesti, recensioni, installa) | 4 | Frontend | 📋 TODO |
| 8 | T-1808 — Developer registration portal (profilo sviluppatore, accettazione ToS) | 3 | Frontend | 📋 TODO |
| 9 | T-1809 — API key management per developer (generazione, revoca, rate limiting per key) | 4 | Backend | 📋 TODO |
| 10 | T-1810 — Plugin SDK v1 (npm package @crm-pro-360/plugin-sdk con tipi, helper, CLI) | 5 | Backend | 📋 TODO |
| 11 | T-1811 — Plugin template: Custom Field Renderer (aggiunge tipo campo personalizzato) | 3 | Backend | 📋 TODO |
| 12 | T-1812 — Plugin template: Webhook Connector (invia dati CRM a endpoint esterno) | 3 | Backend | 📋 TODO |
| 13 | T-1813 — Plugin template: Dashboard Widget (widget custom per dashboard builder) | 3 | Backend | 📋 TODO |
| 14 | T-1814 — Plugin review checklist automatizzata (manifest validation, permission audit, size check) | 4 | Security | 📋 TODO |
| 15 | T-1815 — Marketplace search con full-text e filtri (categoria, rating, autore, compatibilità) | 3 | Frontend | 📋 TODO |
| 16 | T-1816 — Beta environment scaling per 50 company (resource provisioning, connection pool) | 5 | DevOps | 📋 TODO |
| 17 | T-1817 — Load testing con k6 (scenari: 500 utenti concorrenti, peak hour simulation) | 5 | QA | 📋 TODO |
| 18 | T-1818 — Performance optimization basata su risultati load test (query slow, N+1, cache) | 4 | Backend | 📋 TODO |
| 19 | T-1819 — Security hardening review (OWASP top 10, CSP headers, rate limiting, input validation) | 5 | Security | 📋 TODO |
| 20 | T-1820 — Aggiornamento documentazione API per developer (OpenAPI spec, guide, esempi) | 3 | Backend | 📋 TODO |
| 21 | T-1821 — Beta invitation wave 2 (email onboarding, welcome flow, setup wizard) | 3 | Frontend | 📋 TODO |
| 22 | T-1822 — Feedback collection dashboard (NPS survey in-app, bug report widget, analytics) | 4 | Frontend | 📋 TODO |
| 23 | T-1823 — Release notes e changelog generazione automatica da commit history | 2 | DevOps | 📋 TODO |
| 24 | T-1824 — Monitoring alerts tuning (soglie CPU, memory, error rate, latenza p99) | 3 | DevOps | 📋 TODO |
| 25 | T-1825 — Integration tests plugin lifecycle (install → enable → execute → disable → uninstall) | 4 | QA | 📋 TODO |

**Totale: 85 SP** (25 item)

## Dipendenze Esterne

- **isolated-vm** — libreria V8 isolate per sandbox plugin, verificare compatibilità con Node.js versione in produzione
- **k6** — tool di load testing, richiede installazione su CI runner o macchina dedicata
- **Firebase/SendGrid** — per invio email beta invitation wave 2
- **App Store / Google Play** — review pendente da Sprint 17 per pubblicazione mobile
- **Sprint 15-16** — dashboard builder necessario per plugin template Dashboard Widget
- **Infrastruttura** — scaling a 50 company richiede approvazione budget per risorse aggiuntive (RAM, CPU, database connections)

## Rischi Sprint

1. **V8 isolate escape** — vulnerabilità nel sandbox potrebbe permettere a plugin malevoli di accedere al sistema host. Mitigazione: audit di sicurezza dedicato, memory limit stretto (128MB), CPU timeout (5s), nessun accesso filesystem/network diretto.
2. **Load testing rivela bottleneck critici** — k6 con 500 utenti potrebbe evidenziare problemi non risolvibili in questo sprint. Mitigazione: prioritizzare fix basati su impatto, documentare tech debt per sprint successivi, impostare soglie di accettazione realistiche.
3. **Adozione beta lenta** — 50 company target potrebbe essere ambizioso senza product-market fit validato. Mitigazione: onboarding guidato, support dedicato per i primi 10 tenant, feedback loop settimanale.
4. **Plugin SDK API surface troppo ampia** — esporre troppe API ai plugin aumenta superficie di attacco e costo manutenzione. Mitigazione: v1 minimalista (solo read contatti/deal, eventi base), espandere in v2 basandosi su richieste developer.

## Definition of Done Sprint

1. [ ] Tutti i 25 item hanno stato completato o giustificazione per rinvio
2. [ ] Plugin lifecycle completo (install → enable → execute → disable → uninstall) funzionante
3. [ ] V8 sandbox impedisce accesso a filesystem, network e variabili globali Node.js
4. [ ] Plugin con memory > 128MB viene terminato automaticamente
5. [ ] Marketplace mostra almeno 3 plugin template installabili
6. [ ] Developer portal permette registrazione e generazione API key
7. [ ] Load test k6: sistema regge 500 utenti concorrenti con p99 latenza < 2s
8. [ ] Security review completata con zero vulnerabilità critiche aperte
9. [ ] Beta environment operativo per 50 company con monitoring attivo
10. [ ] Feedback collection funzionante (NPS survey + bug report)
11. [ ] Release notes generate automaticamente dal changelog
12. [ ] Integration tests plugin lifecycle passano al 100%

## Deliverable Attesi

- Plugin system v1 con lifecycle API e V8 sandbox
- Plugin permission model e host bridge
- Plugin SDK v1 (npm package) con 3 template
- Marketplace listing con ricerca e dettaglio app
- Developer registration portal con API key management
- Review automatizzata plugin submission
- Beta environment scalato per 50 company
- Report load testing k6 con raccomandazioni
- Security hardening review completata
- Feedback collection dashboard attivo

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | Installare plugin Webhook Connector dal marketplace, configurare, verificare invio dati |
| **Scenario Demo 2** | Developer portal: registrarsi, creare plugin da template, pubblicare, vedere nel marketplace |
| **Scenario Demo 3** | Security: tentare escape da sandbox V8, mostrare che viene bloccato |
| **Scenario Demo 4** | Load test: mostrare report k6 con metriche latenza e throughput sotto carico |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 85 SP pianificati |
