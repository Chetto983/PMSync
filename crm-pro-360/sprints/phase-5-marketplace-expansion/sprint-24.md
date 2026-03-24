# Sprint 24 — On-Premise & Localization

## Fase: Phase 5 — Marketplace & Expansion

## Date: M12-W3 → M12-W4

## Obiettivo Sprint

Opzione deployment on-premise con Helm chart Kubernetes, guida installazione e supporto air-gapped. Localizzazione completa per mercato DACH (tedesco) e Francia (francese) con formattazione locale. Compliance DACH e privacy tedesca. License management e update mechanism per installazioni on-premise. Planning v2.0: retrospettiva Year 1, roadmap draft, analisi tech debt, creazione epic v2.0. Chiusura release notes v1.x.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 85 SP | 2 DevOps, 2 Backend, 2 Frontend, 1 QA, 1 Technical Writer, 1 PM |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-2401 — Helm chart per on-premise deployment (values.yaml, templates, dependency chart: PostgreSQL, Redis, Elasticsearch) | 5 | DevOps | 📋 TODO |
| 2 | T-2402 — On-premise installation guide (prerequisiti HW/SW, step-by-step, troubleshooting, FAQ) | 4 | Technical Writer | 📋 TODO |
| 3 | T-2403 — Air-gapped deployment support (container registry mirror, offline bundle, checksum verification) | 5 | DevOps | 📋 TODO |
| 4 | T-2404 — German localization DE (UI strings, email template, notification, error messages, pluralizzazione) | 5 | Frontend | 📋 TODO |
| 5 | T-2405 — French localization FR (UI strings, email template, notification, error messages, pluralizzazione) | 5 | Frontend | 📋 TODO |
| 6 | T-2406 — Locale-specific formatting: date (DD.MM.YYYY DE, DD/MM/YYYY FR), number (1.000,00 vs 1 000,00), currency (€) | 3 | Frontend | 📋 TODO |
| 7 | T-2407 — DACH compliance requirements review (BDSG, DSGVO specifiche, Auftragsverarbeitung, Datenschutzbeauftragter) | 4 | Backend | 📋 TODO |
| 8 | T-2408 — German privacy regulation adjustments (data residency DE, consent management DE-specific, Impressum) | 4 | Backend | 📋 TODO |
| 9 | T-2409 — On-premise license management (license key generation, validation, feature gating, expiration) | 5 | Backend | 📋 TODO |
| 10 | T-2410 — On-premise update mechanism (version check, download, apply con zero-downtime rolling update) | 5 | DevOps | 📋 TODO |
| 11 | T-2411 — V2.0 feature planning workshop (stakeholder survey, feature voting, market analysis, competitor review) | 3 | PM | 📋 TODO |
| 12 | T-2412 — V2.0 roadmap draft (H1 plan, milestone, dependency graph, resource estimation) | 3 | PM | 📋 TODO |
| 13 | T-2413 — Retrospettiva Year 1 (velocity trend, quality metrics, incident post-mortem, team feedback) | 3 | PM | 📋 TODO |
| 14 | T-2414 — Customer feedback analysis (NPS trend, feature request ranking, churn reason, CSAT by module) | 3 | PM | 📋 TODO |
| 15 | T-2415 — Performance baseline Year 1 (response time trend, uptime, error rate, throughput, cost per user) | 3 | DevOps | 📋 TODO |
| 16 | T-2416 — Architecture review e tech debt assessment (dependency age, code coverage gap, scalability limit) | 4 | Backend | 📋 TODO |
| 17 | T-2417 — Documentation update tutti i moduli (allineamento a stato corrente, screenshot, changelog link) | 4 | Technical Writer | 📋 TODO |
| 18 | T-2418 — Training material update (slide deck, hands-on lab, certification quiz per admin e utenti) | 3 | Technical Writer | 📋 TODO |
| 19 | T-2419 — V2.0 epic creation (EP-13 → EP-18 draft con scope, acceptance criteria, estimation range) | 4 | PM | 📋 TODO |
| 20 | T-2420 — Release notes v1.x final (changelog completo M1-M12, highlight per modulo, known issues) | 3 | Technical Writer | 📋 TODO |
| 21 | T-2421 — On-premise smoke test suite (Helm install → health check → CRUD → backup → restore → update) | 4 | QA | 📋 TODO |
| 22 | T-2422 — Localization QA (review nativo DE/FR, context accuracy, UI overflow, screenshot comparison) | 4 | QA | 📋 TODO |

**Totale: 85 SP** (22 item)

## Dipendenze Esterne

- **Kubernetes cluster** — ambiente di test on-premise (minikube o cluster dedicato) per validazione Helm chart
- **Container registry** — Harbor o registry privato per distribuzione air-gapped, setup e licensing
- **Traduttori nativi** — revisione linguistica DE/FR da madrelingua, contratto con agenzia traduzione o freelance
- **Sprint 23** — marketplace e SDK come prerequisito per documentazione completa v1.x
- **Legal DE** — consulenza legale per BDSG/DSGVO specifiche, Auftragsverarbeitung template
- **Legal FR** — consulenza per CNIL requirements specifici, cookie consent FR
- **License server** — infrastruttura per validazione license key on-premise (self-hosted o servizio terzo)

## Rischi Sprint

1. **Helm chart complessità** — troppi parametri configurabili rendono l'installazione on-premise fragile. Mitigazione: values.yaml con default sensibili, profili preset (small/medium/large), test automatico con 3 configurazioni diverse, quick-start con valori minimi.
2. **Localizzazione DE/FR qualità insufficiente** — traduzioni automatiche senza review nativo producono UI innaturale. Mitigazione: traduzione base con AI, review obbligatorio da madrelingua, glossario termini tecnici CRM per ogni lingua, feedback loop con utenti beta DACH/FR.
3. **Air-gapped deployment non testabile** — ambiente completamente isolato difficile da replicare in CI/CD. Mitigazione: test in VM senza accesso internet, bundle offline con checksum, documentazione step-by-step con screenshot, supporto dedicato per primi 5 clienti on-premise.
4. **V2.0 planning scope creep** — workshop genera troppe idee senza prioritizzazione chiara. Mitigazione: framework RICE per scoring feature, budget fisso per H1 v2.0 (6 epic max), stakeholder voting con dot-voting, PM ha veto su scope.

## Definition of Done Sprint

1. [ ] Tutti i 22 item hanno stato completato o giustificazione documentata per rinvio
2. [ ] Helm chart installabile su Kubernetes con `helm install` in < 15 minuti
3. [ ] Air-gapped deployment funzionante senza accesso internet (offline bundle testato)
4. [ ] Localizzazione DE: 100% stringhe tradotte, review nativo completato
5. [ ] Localizzazione FR: 100% stringhe tradotte, review nativo completato
6. [ ] Formattazione locale corretta per date, numeri e valuta in DE e FR
7. [ ] DACH compliance: gap analysis completata con remediation plan
8. [ ] License management: generazione, validazione e feature gating funzionanti
9. [ ] On-premise update: rolling update con zero-downtime verificato
10. [ ] V2.0 roadmap draft approvato da stakeholder con almeno 6 epic definite
11. [ ] Retrospettiva Year 1 completata con action items documentati
12. [ ] Release notes v1.x final pubblicate
13. [ ] On-premise smoke test suite passa al 100%

## Deliverable Attesi

- Helm chart per Kubernetes on-premise deployment
- On-premise installation guide e troubleshooting
- Air-gapped deployment bundle con offline support
- Localizzazione completa DE (tedesco) e FR (francese)
- Formattazione locale date/number/currency per DE e FR
- DACH compliance review e German privacy adjustments
- On-premise license management system
- On-premise update mechanism (zero-downtime)
- V2.0 roadmap draft con epic EP-13 → EP-18
- Retrospettiva Year 1 e customer feedback analysis
- Performance baseline Year 1
- Architecture review e tech debt assessment
- Documentazione e training material aggiornati
- Release notes v1.x final

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | On-premise: helm install su cluster Kubernetes, health check, login, CRUD contatti — tutto offline |
| **Scenario Demo 2** | Localizzazione: switch lingua DE e FR, mostrare UI, email, notifiche, formattazione date/numeri |
| **Scenario Demo 3** | License management: generare chiave, installare, mostrare feature gating, license expiration warning |
| **Scenario Demo 4** | V2.0 roadmap: presentazione draft con epic prioritizzate, timeline, resource plan |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 85 SP pianificati |
