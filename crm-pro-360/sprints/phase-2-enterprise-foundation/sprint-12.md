# Sprint 12 — Knowledge Base, Customer Portal & SSO

**Phase:** 2 — Enterprise Foundation
**Epics:** EP-06 (Customer Service), EP-02 (Security/Auth), EP-09 (Integrations)
**Date:** M6-W3 → M6-W4
**Status:** 📋 TODO

---

## Obiettivo Sprint

Implementare la knowledge base con ricerca full-text Elasticsearch, il portale self-service per i clienti con submission e tracking ticket, l'autenticazione SSO tramite SAML 2.0 e OIDC per clienti enterprise, e i survey CSAT/NPS con dashboard risultati.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| Backend | 3 | 33 |
| Frontend | 3 | 30 |
| Security | 1 | 13 |
| QA | 1 | 14 |
| **Totale** | **8** | **90 SP** |

---

## Sprint Backlog

- [ ] T-1201 — API CRUD knowledge base (articoli, categorie, tag) con multi-tenant — 5 SP — Backend — 📋 TODO
- [ ] T-1202 — Editor articoli rich text con supporto immagini, video embed e code block — 5 SP — Frontend — 📋 TODO
- [ ] T-1203 — Gestione categorie e tag per organizzazione articoli KB — 3 SP — Backend — 📋 TODO
- [ ] T-1204 — Integrazione Elasticsearch per ricerca full-text articoli KB (indexing, query, highlight) — 8 SP — Backend — 📋 TODO
- [ ] T-1205 — Frontend portale cliente: layout pubblico, navigazione, branding configurabile — 5 SP — Frontend — 📋 TODO
- [ ] T-1206 — Portale: form submission ticket con allegati e categorizzazione — 5 SP — Frontend — 📋 TODO
- [ ] T-1207 — Portale: vista tracking ticket con stato, timeline e risposte — 5 SP — Frontend — 📋 TODO
- [ ] T-1208 — Implementazione SSO SAML 2.0 (SP-initiated e IdP-initiated flow) — 8 SP — Security — 📋 TODO
- [ ] T-1209 — Implementazione SSO OIDC (authorization code flow con PKCE) — 5 SP — Security — 📋 TODO
- [ ] T-1210 — UI amministrazione SSO (configurazione IdP, certificati, mapping attributi) — 5 SP — Frontend — 📋 TODO
- [ ] T-1211 — Trigger survey CSAT post-risoluzione ticket (email con link, in-app widget) — 3 SP — Backend — 📋 TODO
- [ ] T-1212 — Survey NPS periodico con scheduling configurabile per segmento cliente — 3 SP — Backend — 📋 TODO
- [ ] T-1213 — Dashboard risultati survey (CSAT trend, NPS score, distribuzione risposte) — 5 SP — Frontend — 📋 TODO
- [ ] T-1214 — Connettore base Google Workspace (OAuth 2.0, sync contatti e calendario) — 5 SP — Backend — 📋 TODO
- [ ] T-1215 — Connettore base Microsoft 365 (OAuth 2.0, Graph API, sync contatti e calendario) — 5 SP — Backend — 📋 TODO
- [ ] T-1216 — Analytics articoli KB (visualizzazioni, rating helpfulness, ricerche senza risultato) — 3 SP — Backend — 📋 TODO
- [ ] T-1217 — UI analytics KB con metriche articoli più visti e gap di contenuto — 3 SP — Frontend — 📋 TODO
- [ ] T-1218 — Test integrazione SSO SAML con IdP di test (Okta dev, Azure AD free) — 5 SP — QA — 📋 TODO
- [ ] T-1219 — Test integrazione ricerca Elasticsearch (indexing, query, relevance) — 3 SP — QA — 📋 TODO
- [ ] T-1220 — Test E2E portale cliente (submission ticket, tracking, KB search) — 3 SP — QA — 📋 TODO
- [ ] T-1221 — Test E2E survey flow (trigger, compilazione, dashboard) — 3 SP — QA — 📋 TODO

**Totale:** 90 SP — 21 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Cluster Elasticsearch (o OpenSearch) configurato in staging e produzione | DevOps | 📋 TODO | Necessario per T-1204 |
| Account Okta Developer o Azure AD per test SSO SAML/OIDC | Security Lead | 📋 TODO | Necessario per T-1208, T-1209 |
| Sprint 11 completato (ticketing core) | Team | 📋 TODO | Portale dipende da API ticket |
| Credenziali Google Workspace API (OAuth client per sync) | PM | 📋 TODO | Necessario per T-1214 |
| Credenziali Microsoft 365 API (Azure app registration) | PM | 📋 TODO | Necessario per T-1215 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | L'integrazione SAML 2.0 è notoriamente complessa e ogni IdP ha peculiarità diverse | Alta | Alto | Usare libreria consolidata (passport-saml / samlify); testare con almeno 2 IdP diversi |
| 2 | Elasticsearch richiede tuning significativo per ricerca in italiano (analyzer, stemming, stopwords) | Media | Medio | Configurare analyzer italiano custom; usare multi-language analyzer come fallback |
| 3 | Il portale cliente espone una superficie di attacco pubblica che richiede hardening specifico | Media | Alto | Rate limiting aggressivo, CAPTCHA su form, input sanitization; security review dedicata |
| 4 | I connettori Google/Microsoft potrebbero richiedere app verification process lungo | Alta | Medio | Iniziare processo verifica app subito; usare test account con permessi estesi per sviluppo |

---

## Definition of Done Sprint

- [ ] Knowledge base CRUD funzionante con articoli, categorie e tag
- [ ] Ricerca full-text Elasticsearch restituisce risultati rilevanti con highlight dei match
- [ ] Portale cliente permette submission ticket con allegati e tracking stato
- [ ] SSO SAML 2.0 funzionante con almeno un IdP (Okta o Azure AD)
- [ ] SSO OIDC funzionante con authorization code flow + PKCE
- [ ] UI admin SSO permette configurazione IdP senza intervento tecnico
- [ ] Survey CSAT si attiva automaticamente post-risoluzione ticket
- [ ] Dashboard survey mostra NPS score e CSAT trend corretti
- [ ] Connettore Google Workspace sincronizza contatti correttamente
- [ ] Connettore Microsoft 365 sincronizza contatti correttamente
- [ ] Tutti i test integrazione e E2E passano
- [ ] Nessun errore TypeScript (`npx tsc --noEmit` pulito)

---

## Deliverable Attesi

1. **Knowledge Base** — CRUD articoli con editor rich text, categorie/tag, e ricerca full-text Elasticsearch
2. **Customer Portal** — Portale self-service con submission ticket, tracking, e accesso KB
3. **SSO Enterprise** — SAML 2.0 e OIDC con UI admin per configurazione IdP
4. **Survey System** — CSAT post-risoluzione e NPS periodico con dashboard risultati
5. **Workspace Connectors** — Integrazione base Google Workspace e Microsoft 365

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
