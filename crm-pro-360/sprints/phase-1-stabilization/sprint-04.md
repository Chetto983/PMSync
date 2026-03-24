# Sprint 04 — RBAC Engine & Audit

## Fase: Phase 1 — Stabilization & Foundation
## Date: M2-W3 → M2-W4
## Sprint Goal / Obiettivo Sprint

Engine RBAC completo con modello gerarchico a 5 livelli (super_admin > admin > manager > user > viewer), permission model Resource×Action×Scope, Row-Level Security su PostgreSQL per isolamento dati multi-tenant, field-level security tramite interceptor NestJS, audit log immutabile con event sourcing su Kafka, tenant provisioning automatizzato. Frontend: pagine admin per gestione ruoli, permessi e audit viewer.

## Capacità Team: 90 SP

| Ruolo | Persone | Disponibilità |
|-------|---------|---------------|
| Backend | 4 | 100% |
| Frontend | 2 | 100% |
| Security | 1 | 100% |
| QA | 2 | 100% |

---

## Sprint Backlog

### EP-02 — Autorizzazione, Multi-Tenancy & Audit

- [ ] T-0401 — Modello gerarchico ruoli: definizione albero (super_admin > admin > manager > user > viewer) con ereditarietà permessi — 5 SP — Backend — 📋 TODO
- [ ] T-0402 — CRUD permessi: endpoint POST/GET/PUT/DELETE `/permissions` con validazione unicità (resource, action, scope) — 5 SP — Backend — 📋 TODO
- [ ] T-0403 — Endpoint POST `/roles/:roleId/permissions`: assegnazione batch permessi a ruolo con validazione gerarchia — 3 SP — Backend — 📋 TODO
- [ ] T-0404 — Endpoint POST `/users/:userId/roles`: assegnazione ruolo a utente con vincolo tenant, supporto ruoli multipli — 3 SP — Backend — 📋 TODO
- [ ] T-0405 — Permission checking middleware: decorator `@RequirePermission(resource, action, scope)` per controller NestJS — 5 SP — Backend — 📋 TODO
- [ ] T-0406 — Engine Resource×Action×Scope: valutazione permessi con supporto wildcard (`*`) e scope gerarchico (own/team/org/all) — 8 SP — Backend — 📋 TODO
- [ ] T-0407 — Field-level security interceptor: decorator `@SecureField(permission)` per mascherare campi sensibili in base al ruolo — 5 SP — Backend — 📋 TODO
- [ ] T-0408 — PostgreSQL Row-Level Security: policy RLS su tabelle principali filtrate per `tenant_id` dal JWT context — 8 SP — Backend — 📋 TODO
- [ ] T-0409 — Tenant provisioning service: creazione automatica tenant con schema, ruoli default, utente admin, configurazione base — 5 SP — Backend — 📋 TODO
- [ ] T-0410 — Tenant context middleware: estrazione `tenant_id` da JWT/header, inject nel Prisma client, validazione appartenenza utente — 3 SP — Backend — 📋 TODO
- [ ] T-0411 — Gerarchia organizzativa: modello workspace → organization → team con assegnazione utenti e permessi per livello — 5 SP — Backend — 📋 TODO
- [ ] T-0412 — Audit log service: registrazione immutabile di ogni azione mutativa (create, update, delete) con before/after snapshot — 5 SP — Backend — 📋 TODO
- [ ] T-0413 — Audit log producer Kafka: pubblicazione eventi audit su topic `crm.audit` per consumo asincrono e archiviazione — 3 SP — Backend — 📋 TODO
- [ ] T-0414 — Consent management service: registrazione consensi GDPR per utente (marketing, analytics, third-party), storico modifiche — 3 SP — Backend — 📋 TODO
- [ ] T-0415 — Pagina frontend gestione ruoli: lista ruoli, creazione/modifica ruolo, assegnazione permessi con checkbox matrix — 5 SP — Frontend — 📋 TODO
- [ ] T-0416 — Pagina frontend permission matrix: griglia Resource×Action con toggle per ogni ruolo, visualizzazione ereditarietà — 5 SP — Frontend — 📋 TODO
- [ ] T-0417 — Pagina frontend audit log viewer: tabella paginata con filtri (utente, azione, entità, data range), dettaglio diff — 3 SP — Frontend — 📋 TODO
- [ ] T-0418 — Pagina frontend GDPR consent: toggle per ogni tipo di consenso, storico consensi, data ultimo aggiornamento — 2 SP — Frontend — 📋 TODO
- [ ] T-0419 — Pagina frontend tenant settings: configurazione base tenant (nome, logo, timezone, lingua, limiti piano) — 3 SP — Frontend — 📋 TODO
- [ ] T-0420 — Test di integrazione RBAC: verifica accesso/negazione per ogni combinazione ruolo×risorsa×azione×scope — 5 SP — QA — 📋 TODO
- [ ] T-0421 — Test di sicurezza RLS: verifica isolamento dati tra tenant, tentativo di accesso cross-tenant tramite API — 3 SP — QA — 📋 TODO
- [ ] T-0422 — Test audit log: verifica completezza registrazione, immutabilità (nessun UPDATE/DELETE possibile), integrità dati — 2 SP — QA — 📋 TODO
- [ ] T-0423 — Test field-level security: verifica mascheramento campi per ruoli non autorizzati su endpoint GET — 2 SP — Security — 📋 TODO

---

**Totale Story Points: 90 SP**

---

## Dipendenze Esterne

- Auth service completo con JWT che include `tenant_id`, `user_id`, `roles` (output Sprint 03)
- Schema database v1 con tabelle `roles`, `permissions`, `user_roles` (output Sprint 02)
- Kafka cluster con topic `crm.audit` (output Sprint 02)
- Redis per caching permessi utente (invalidazione su modifica ruolo)

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | RLS policies degradano performance su query complesse con JOIN multi-tabella | Alta | Alto | Benchmark query critiche con EXPLAIN ANALYZE, prevedere indici dedicati e query optimization |
| 2 | Gerarchia permessi con wildcard crea combinazioni impreviste che bypassano restrizioni | Media | Critico | Test exhaustivi matrice permessi, review security dedicata prima del merge |
| 3 | Audit log ad alto volume impatta performance write path delle API | Media | Alto | Audit log asincrono via Kafka, buffering in memoria, batch insert ogni 500ms |
| 4 | Field-level security interceptor incompatibile con serializzazione DTO complessi (nested objects) | Media | Medio | Testare con DTO reali dei moduli CRM, supportare mascheramento ricorsivo |
| 5 | Tenant provisioning fallisce a metà lasciando tenant in stato inconsistente | Bassa | Alto | Implementare saga pattern con compensazione, stato `provisioning` → `active` / `failed` |

## Definition of Done Sprint

- [ ] RBAC engine valuta correttamente permessi per tutte le combinazioni ruolo×risorsa×azione×scope
- [ ] RLS attivo su tutte le tabelle principali, nessun data leak cross-tenant verificato con test
- [ ] Field-level security maschera campi sensibili per ruoli non autorizzati
- [ ] Tenant provisioning crea tenant completo (schema, ruoli, admin) in < 5 secondi
- [ ] Audit log registra ogni azione mutativa con before/after, impossibile modificare/cancellare record
- [ ] Consent management traccia consensi GDPR con storico completo
- [ ] Pagine frontend admin funzionanti: ruoli, permessi, audit viewer, consent, tenant settings
- [ ] Test di integrazione RBAC, RLS, audit e field-level security passano in CI/CD
- [ ] Performance: permission check < 5ms (cached), audit log write < 10ms (async)

## Deliverable Attesi

1. **RBAC engine** — Modello gerarchico, Resource×Action×Scope, permission checking middleware
2. **Multi-tenancy** — RLS PostgreSQL, tenant context middleware, tenant provisioning
3. **Field-level security** — Interceptor NestJS con mascheramento campi per ruolo
4. **Audit log** — Registrazione immutabile con Kafka event sourcing, viewer UI
5. **Consent management** — GDPR compliance con storico consensi
6. **Admin UI** — Pagine gestione ruoli, permission matrix, audit viewer, tenant settings

## Demo/Review Notes

**Data Review:** Fine M2-W4
**Partecipanti:** Product Owner, Tech Lead, Security Lead, CISO/DPO, Team Backend, Team Frontend

### Checklist Demo
- [ ] Demo creazione nuovo tenant: provisioning completo con ruoli e admin
- [ ] Demo RBAC: login come admin → accesso completo, login come viewer → solo lettura
- [ ] Demo field-level security: stesso endpoint, campi diversi visibili per ruolo diverso
- [ ] Demo RLS: tentativo di accesso dati di altro tenant → risultato vuoto (non errore)
- [ ] Demo audit log viewer: mostrare trail completo di azioni con diff before/after
- [ ] Demo permission matrix: assegnazione permesso a ruolo, verifica effetto immediato
- [ ] Demo consent management: toggle consenso, visualizzazione storico
- [ ] Mostrare report test di sicurezza cross-tenant

### Feedback Raccolto
_(da compilare durante la review)_

### Action Items Post-Review
_(da compilare durante la review)_
