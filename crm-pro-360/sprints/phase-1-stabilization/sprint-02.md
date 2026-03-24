# Sprint 02 — Data Layer & Message Bus

## Fase: Phase 1 — Stabilization & Foundation
## Date: M1-W3 → M1-W4
## Sprint Goal / Obiettivo Sprint

Setup completo del data layer: PostgreSQL 17 con estensione Citus per sharding multi-tenant, Redis Cluster per caching e sessioni, Apache Kafka in modalità KRaft per event streaming, Elasticsearch 8 per ricerca full-text. Schema database v1 con tabelle fondamentali, framework di migrazione, seed data, e monitoring per ogni data store.

## Capacità Team: 90 SP

| Ruolo | Persone | Disponibilità |
|-------|---------|---------------|
| DevOps | 2 | 100% |
| Backend | 3 | 100% |
| Data Engineer | 2 | 100% |

---

## Sprint Backlog

### EP-01 — Infrastruttura Data Layer

- [ ] T-0201 — Provisioning PostgreSQL 17 su RDS Multi-AZ con estensione Citus abilitata — 8 SP — DevOps — 📋 TODO
- [ ] T-0202 — Configurazione PgBouncer per connection pooling (pool_mode=transaction, max 200 connessioni) — 5 SP — DevOps — 📋 TODO
- [ ] T-0203 — Setup Redis Cluster a 6 nodi (3 master + 3 replica) su ElastiCache — 5 SP — DevOps — 📋 TODO
- [ ] T-0204 — Deploy Apache Kafka cluster KRaft (3 broker, no ZooKeeper) su EKS via Strimzi Operator — 8 SP — DevOps — 📋 TODO
- [ ] T-0205 — Provisioning Elasticsearch 8 cluster (3 nodi) con TLS inter-nodo abilitato — 5 SP — DevOps — 📋 TODO
- [ ] T-0206 — Setup Prisma ORM con generazione client tipizzato e configurazione multi-schema — 5 SP — Backend — 📋 TODO
- [ ] T-0207 — Framework migrazione database: convenzioni naming, rollback strategy, CI integration — 3 SP — Backend — 📋 TODO
- [ ] T-0208 — Schema v1: tabella `tenants` con campi (id, name, slug, plan, settings JSONB, created_at, updated_at) — 3 SP — Backend — 📋 TODO
- [ ] T-0209 — Schema v1: tabella `users` con campi (id, tenant_id FK, email, password_hash, status, last_login_at, created_at) — 3 SP — Backend — 📋 TODO
- [ ] T-0210 — Schema v1: tabella `roles` e `permissions` con relazione many-to-many e tabella pivot `role_permissions` — 5 SP — Backend — 📋 TODO
- [ ] T-0211 — Schema v1: tabella `user_roles` con vincolo unique (user_id, role_id) e indici composti — 2 SP — Backend — 📋 TODO
- [ ] T-0212 — Schema v1: tabella `audit_logs` append-only (id, tenant_id, user_id, action, entity_type, entity_id, payload JSONB, ip, created_at) — 3 SP — Data Engineer — 📋 TODO
- [ ] T-0213 — Seed data: tenant demo, utente admin, ruoli base (super_admin, admin, manager, user, viewer) — 3 SP — Backend — 📋 TODO
- [ ] T-0214 — Creazione topic Kafka principali: `crm.events`, `crm.audit`, `crm.notifications`, `crm.email-sync` con retention e partizioni — 5 SP — Data Engineer — 📋 TODO
- [ ] T-0215 — Configurazione Elasticsearch index templates per entità CRM (contacts, companies, deals) con mapping tipizzati — 5 SP — Data Engineer — 📋 TODO
- [ ] T-0216 — Libreria Redis caching wrapper: get/set/del con serializzazione JSON, TTL configurabile, prefix per namespace — 3 SP — Backend — 📋 TODO
- [ ] T-0217 — Configurazione backup automatico PostgreSQL: snapshot giornaliero RDS, retention 30 giorni, test restore — 5 SP — DevOps — 📋 TODO
- [ ] T-0218 — Backup automatico Elasticsearch: snapshot repository S3, policy giornaliera, retention 14 giorni — 3 SP — DevOps — 📋 TODO
- [ ] T-0219 — Dashboard Grafana per PostgreSQL: connessioni attive, query lente, replication lag, dimensione tabelle — 3 SP — Data Engineer — 📋 TODO
- [ ] T-0220 — Dashboard Grafana per Redis: hit/miss ratio, memoria usata, connessioni, latenza comandi — 2 SP — Data Engineer — 📋 TODO
- [ ] T-0221 — Dashboard Grafana per Kafka: consumer lag, throughput per topic, partizioni under-replicated — 3 SP — Data Engineer — 📋 TODO
- [ ] T-0222 — Dashboard Grafana per Elasticsearch: cluster health, shard status, indexing rate, search latency — 2 SP — Data Engineer — 📋 TODO

---

**Totale Story Points: 90 SP**

---

## Dipendenze Esterne

- Cluster EKS operativo (output Sprint 01)
- Monitoring stack Prometheus + Grafana funzionante (output Sprint 01)
- Account AWS con permessi per RDS, ElastiCache, S3 (backup)
- Strimzi Operator Helm chart compatibile con versione EKS

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Estensione Citus non compatibile con RDS Multi-AZ senza Citus Cloud | Media | Alto | Validare compatibilità nella prima giornata, fallback su partitioning nativo PostgreSQL |
| 2 | Kafka KRaft instabile su EKS per problemi di storage persistente | Media | Alto | Usare storage class gp3 con IOPS garantiti, testare failover nodo dal giorno 3 |
| 3 | Elasticsearch richiede più risorse del previsto sui nodi EKS | Alta | Medio | Monitorare consumo risorse, prevedere node group dedicato se necessario |
| 4 | Connection pooling PgBouncer introduce latenza su query transazionali Prisma | Bassa | Medio | Benchmark con e senza PgBouncer, documentare configurazione ottimale |
| 5 | Schema v1 troppo rigido per evoluzioni future dei moduli CRM | Media | Medio | Usare JSONB per campi estendibili, pianificare migration strategy incrementale |

## Definition of Done Sprint

- [ ] PostgreSQL 17 raggiungibile dal cluster EKS, Citus abilitato, PgBouncer funzionante
- [ ] Redis Cluster risponde a `CLUSTER INFO` con stato `ok`, test set/get riuscito
- [ ] Kafka produce e consuma messaggi su tutti i topic creati, no partizioni under-replicated
- [ ] Elasticsearch cluster health `green`, index templates applicati correttamente
- [ ] Schema v1 applicato tramite migrazione Prisma, seed data inserito
- [ ] Backup PostgreSQL ed Elasticsearch eseguito almeno 1 volta con successo
- [ ] Tutte le dashboard Grafana mostrano dati reali dei data store
- [ ] Libreria Redis caching testata con unit test (>90% coverage)

## Deliverable Attesi

1. **PostgreSQL 17 + Citus** — RDS Multi-AZ con PgBouncer, schema v1 migrato
2. **Redis Cluster** — 6 nodi su ElastiCache con libreria caching wrapper
3. **Kafka KRaft** — 3 broker su EKS, 4 topic principali configurati
4. **Elasticsearch 8** — 3 nodi con index templates per entità CRM
5. **Backup automation** — Snapshot giornalieri PostgreSQL + Elasticsearch
6. **Monitoring data layer** — 4 dashboard Grafana dedicate

## Demo/Review Notes

**Data Review:** Fine M1-W4
**Partecipanti:** Product Owner, Tech Lead, Team Backend, Team Data, DBA

### Checklist Demo
- [ ] Demo connessione applicazione → PostgreSQL via PgBouncer
- [ ] Demo Prisma migration: create + rollback
- [ ] Demo produce/consume messaggio Kafka su topic `crm.events`
- [ ] Demo ricerca Elasticsearch su index contacts con dati seed
- [ ] Demo Redis cache hit/miss con metriche Grafana in tempo reale
- [ ] Mostrare backup restore PostgreSQL su ambiente di test

### Feedback Raccolto
_(da compilare durante la review)_

### Action Items Post-Review
_(da compilare durante la review)_
