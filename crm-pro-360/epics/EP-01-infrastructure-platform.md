# Epic EP-01: Infrastructure & Platform Setup

| Campo | Valore |
|---|---|
| **Epic ID** | EP-01 |
| **Titolo** | Infrastructure & Platform Setup |
| **Progetto** | CRM Pro 360 |
| **Persona** | Chiara (CTO) |
| **Fase** | 1 (Sprint 1-2) |
| **Story Points stimati** | 89 SP |
| **Dipendenze** | Nessuna (epic fondazionale) |

## Panoramica

Setup completo dell'infrastruttura cloud-native per CRM Pro 360: cluster Kubernetes su AWS EKS gestito con Terraform, pipeline CI/CD con GitHub Actions e ArgoCD per GitOps, stack di monitoring con Prometheus, Grafana, Jaeger e Sentry, database layer con PostgreSQL 17 + Citus per sharding orizzontale, Redis Cluster per caching e pub/sub, Apache Kafka per event streaming, Elasticsearch 8 per full-text search. Docker Compose per sviluppo locale, gestione ambienti separati (dev/staging/prod) e Infrastructure as Code completa.

---

## User Stories

### US-001: Setup cluster Kubernetes EKS con Terraform

| Campo | Valore |
|---|---|
| **ID** | US-001 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 13 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | Nessuna |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** un cluster Kubernetes EKS provisionato tramite Terraform con node groups auto-scaling,
**in modo da** avere una piattaforma container orchestration production-ready, riproducibile e versionata.

**Acceptance Criteria:**

```gherkin
Given un repository Git con moduli Terraform per AWS EKS
When eseguo `terraform plan` e `terraform apply` sull'ambiente target
Then viene creato un cluster EKS v1.31 con:
  - 2 node groups (system: t3.large x2, workload: m6i.xlarge x3-10 con autoscaler)
  - VPC dedicata con subnet pubbliche e private su 3 AZ
  - Security groups restrittivi (solo porte necessarie)
  - IRSA (IAM Roles for Service Accounts) configurato
  - Cluster autoscaler e metrics-server installati
  - kubectl configurato e cluster raggiungibile

Given il cluster EKS è attivo
When il carico supera il 70% di CPU media sui nodi workload
Then il Cluster Autoscaler aggiunge nodi fino al massimo configurato (10)
  And una notifica viene inviata al canale Slack #infra-alerts

Given un nodo worker va in stato NotReady
When il controller di health-check lo rileva dopo 5 minuti
Then il nodo viene sostituito automaticamente dal node group ASG
  And i pod vengono rischedulati su nodi healthy
```

---

### US-002: Pipeline CI/CD con GitHub Actions + ArgoCD

| Campo | Valore |
|---|---|
| **ID** | US-002 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** una pipeline CI/CD automatizzata con GitHub Actions per build/test e ArgoCD per deployment GitOps,
**in modo da** garantire rilasci rapidi, ripetibili e auditabili su tutti gli ambienti.

**Acceptance Criteria:**

```gherkin
Given una pull request aperta su un branch feature
When viene eseguita la pipeline CI di GitHub Actions
Then vengono eseguiti in sequenza:
  - Lint (ESLint + Prettier check)
  - Type-check (tsc --noEmit)
  - Unit tests (Jest, coverage > 80%)
  - Build Docker image multi-stage
  - Security scan (Trivy) sull'immagine
  And la PR mostra lo stato pass/fail con report dettagliato

Given un merge su branch `main`
When la pipeline CD si attiva
Then l'immagine Docker viene taggata con SHA del commit e pushata su ECR
  And ArgoCD rileva il cambio nel manifesto Kubernetes (via Kustomize)
  And il deployment viene applicato in ambiente `staging` automaticamente
  And un messaggio Slack conferma il deploy con link al changelog

Given un deployment in staging è validato
When un maintainer approva la promotion a production
Then ArgoCD applica il sync sull'ambiente `prod` con strategia rolling update
  And il rollback automatico si attiva se il health check fallisce entro 5 minuti
```

---

### US-003: Setup PostgreSQL 17 con Citus sharding

| Campo | Valore |
|---|---|
| **ID** | US-003 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DBA / Backend Engineer |

**Come** Chiara (CTO),
**voglio** PostgreSQL 17 con estensione Citus configurata per sharding orizzontale basato su `tenant_id`,
**in modo da** supportare la crescita multi-tenant senza riprogettare lo schema in futuro.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è attivo con storage class EBS gp3
When eseguo il deployment di PostgreSQL 17 con Citus via Helm chart
Then viene creato un cluster Citus con:
  - 1 coordinator node (r6g.xlarge, 100GB gp3)
  - 2 worker nodes (r6g.large, 200GB gp3 ciascuno)
  - Streaming replication attiva con 1 replica per nodo
  - Connection pooling via PgBouncer (max 200 connessioni per nodo)
  - Backup automatico ogni 6 ore su S3 con retention 30 giorni

Given il database Citus è operativo
When creo una tabella distribuita con `SELECT create_distributed_table('contacts', 'tenant_id')`
Then i dati vengono distribuiti sui worker nodes tramite hash sharding su tenant_id
  And le query filtrate per tenant_id vengono eseguite solo sullo shard corretto
  And le query cross-tenant vengono eseguite in parallelo su tutti gli shard

Given un worker node diventa irraggiungibile
When il coordinator rileva il failure dopo 30 secondi
Then le query vengono servite dalla replica del worker
  And un alert PagerDuty viene inviato al team DBA
  And il nodo viene marcato come unhealthy nel monitoring
```

---

### US-004: Setup Redis Cluster

| Campo | Valore |
|---|---|
| **ID** | US-004 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 5 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** un Redis Cluster configurato per caching, session storage e BullMQ job queues,
**in modo da** avere un layer di caching distribuito ad alta disponibilita per l'intera piattaforma.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è operativo
When eseguo il deployment di Redis Cluster via Helm chart
Then viene creato un cluster Redis 7.x con:
  - 3 master nodes + 3 replica nodes (6 pod totali)
  - Persistent storage su EBS gp3 (20GB per nodo)
  - Password authentication abilitata via Kubernetes Secret
  - Maxmemory policy: allkeys-lru con limite 2GB per nodo
  - TLS abilitato per connessioni in-cluster

Given Redis Cluster è attivo
When un master node fallisce
Then la replica corrispondente viene promossa a master entro 15 secondi
  And il cluster continua a servire richieste senza downtime
  And un alert viene generato su Prometheus/Alertmanager

Given un'applicazione si connette a Redis
When esegue operazioni SET/GET con key prefix per namespace (cache:, session:, queue:)
Then le operazioni vengono distribuite sugli slot corretti
  And la latency media è inferiore a 1ms per operazioni single-key
```

---

### US-005: Setup Apache Kafka con KRaft

| Campo | Valore |
|---|---|
| **ID** | US-005 |
| **Priorita** | 🟡 Media |
| **Story Points** | 8 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** Apache Kafka in modalita KRaft (senza Zookeeper) per event streaming e comunicazione asincrona tra microservizi,
**in modo da** avere un message broker scalabile e durevole per il pattern event-driven dell'architettura.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è operativo
When eseguo il deployment di Kafka 3.7+ via Strimzi Operator
Then viene creato un cluster Kafka KRaft con:
  - 3 broker/controller nodes (combined mode)
  - Persistent storage su EBS gp3 (100GB per broker)
  - Replication factor = 3, min.insync.replicas = 2
  - Schema Registry (Confluent) deployato come sidecar
  - Topic auto-creation disabilitata (gestione esplicita)

Given Kafka è operativo
When creo un topic `crm.contacts.events` con 6 partizioni
Then il topic viene creato e replicato su tutti i broker
  And i producer possono pubblicare messaggi con schema Avro validato
  And i consumer group leggono con exactly-once semantics (idempotent producer + transactional consumer)

Given un broker Kafka va offline
When i controller rilevano il failure
Then le partizioni leader vengono riassegnate ai broker rimanenti entro 30 secondi
  And nessun messaggio viene perso (ISR garantito)
  And il throughput si riduce proporzionalmente ma il servizio resta disponibile
```

---

### US-006: Setup Elasticsearch 8

| Campo | Valore |
|---|---|
| **ID** | US-006 |
| **Priorita** | 🟡 Media |
| **Story Points** | 8 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** un cluster Elasticsearch 8 per full-text search su contatti, email, deal e knowledge base,
**in modo da** offrire ricerca istantanea e avanzata su tutti i dati CRM con supporto multi-lingua.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è operativo
When eseguo il deployment di Elasticsearch 8 via ECK Operator
Then viene creato un cluster ES con:
  - 3 master-eligible nodes (c6g.large, 50GB gp3)
  - 2 data nodes (r6g.xlarge, 500GB gp3)
  - 1 coordinating node per load balancing delle query
  - Security (TLS inter-node, autenticazione nativa) abilitata
  - ILM policy: hot (7gg) -> warm (30gg) -> delete (90gg) per indici di log

Given Elasticsearch è attivo
When creo un indice `crm-contacts` con mapping per campi multi-lingua (italiano, inglese)
Then l'indice viene creato con analyzer personalizzati per ogni lingua
  And le query full-text restituiscono risultati rilevanti con scoring BM25
  And la latency di ricerca è inferiore a 200ms per query standard (< 10k documenti)

Given un data node va offline
When il cluster rileva lo shard allocation failure
Then le shard replicas sui nodi rimanenti vengono promosse a primary
  And il cluster status diventa yellow (non red) e resta operativo
  And il recovery automatico riallinea le shard quando il nodo torna online
```

---

### US-007: Stack di monitoring (Prometheus + Grafana)

| Campo | Valore |
|---|---|
| **ID** | US-007 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** Prometheus per la raccolta metriche e Grafana per la visualizzazione con dashboard pre-configurate,
**in modo da** avere visibilita completa sulla salute e le performance di tutta l'infrastruttura e delle applicazioni.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è operativo
When eseguo il deployment dello stack kube-prometheus-stack via Helm
Then vengono installati:
  - Prometheus server con retention 15 giorni e storage 100GB
  - Alertmanager con integrazione Slack e PagerDuty
  - Grafana con SSO via OAuth2 e datasource Prometheus pre-configurato
  - Node exporter su ogni nodo del cluster
  - kube-state-metrics per metriche Kubernetes

Given Prometheus è attivo
When i servizi applicativi espongono metriche su /metrics
Then Prometheus le raccoglie ogni 15 secondi via ServiceMonitor CRD
  And le metriche sono queryabili con PromQL in Grafana
  And sono disponibili dashboard pre-configurate per:
    - Cluster overview (CPU, RAM, network, disk per nodo)
    - Pod resource usage per namespace
    - PostgreSQL (connessioni, query latency, replication lag)
    - Redis (hit rate, memory, connected clients)
    - Kafka (consumer lag, throughput, partition status)
    - Elasticsearch (search latency, indexing rate, cluster health)

Given una metrica supera la soglia di alert
When Alertmanager riceve l'alert da Prometheus
Then l'alert viene inviato al canale Slack #infra-alerts entro 1 minuto
  And gli alert critical (P1) attivano PagerDuty con escalation policy
  And l'alert viene registrato nel log di audit
```

---

### US-008: Distributed tracing con Jaeger + Sentry

| Campo | Valore |
|---|---|
| **ID** | US-008 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-007 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** Jaeger per il distributed tracing e Sentry per l'error tracking con source maps,
**in modo da** poter diagnosticare problemi di performance e errori in produzione attraverso tutta la catena di microservizi.

**Acceptance Criteria:**

```gherkin
Given lo stack di monitoring (US-007) è operativo
When eseguo il deployment di Jaeger con backend Elasticsearch
Then viene installato Jaeger con:
  - Collector che riceve span via OpenTelemetry Protocol (OTLP/gRPC)
  - Storage su Elasticsearch con retention 7 giorni
  - UI accessibile via Ingress con autenticazione
  - Sampling strategy: adaptive (1% in produzione, 100% in staging)

Given Jaeger è attivo e un servizio è instrumentato con OpenTelemetry SDK
When una richiesta HTTP attraversa API Gateway -> Auth Service -> CRM Service -> Database
Then viene generata una trace completa con span per ogni hop
  And ogni span include: service name, operation, duration, status, tags custom
  And la trace è visualizzabile nella UI di Jaeger con waterfall diagram

Given Sentry è configurato con DSN per frontend e backend
When un'eccezione non gestita viene lanciata in produzione
Then Sentry cattura l'errore con:
  - Stack trace con source maps (frontend) o source code context (backend)
  - Breadcrumbs degli ultimi 100 eventi prima dell'errore
  - Context utente (userId, tenantId, ruolo) senza PII
  - Collegamento alla trace Jaeger corrispondente via trace_id
  And l'errore viene raggruppato per fingerprint e de-duplicato
```

---

### US-009: Docker Compose per ambiente di sviluppo locale

| Campo | Valore |
|---|---|
| **ID** | US-009 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 5 |
| **Sprint** | Sprint 1 |
| **Dipendenze** | Nessuna |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** un Docker Compose che replichi l'intera infrastruttura in locale con un singolo comando,
**in modo da** permettere a ogni sviluppatore di lavorare in un ambiente identico alla produzione senza configurazioni manuali.

**Acceptance Criteria:**

```gherkin
Given il repository è clonato e Docker Desktop è installato
When eseguo `docker compose up -d` dalla root del progetto
Then vengono avviati tutti i servizi in meno di 3 minuti:
  - PostgreSQL 17 (porta 5432) con schema migrato e seed data
  - Redis 7 (porta 6379) in standalone mode
  - Kafka (porta 9092) con KRaft in single-node mode
  - Elasticsearch 8 (porta 9200) in single-node mode
  - Jaeger (porta 16686) all-in-one
  - MailHog (porta 8025) per email testing
  And tutti i servizi sono healthy secondo i healthcheck configurati

Given i servizi Docker Compose sono attivi
When avvio il backend con `npm run start:dev` e il frontend con `npm run dev`
Then il backend si connette a tutti i servizi senza errori
  And il frontend è raggiungibile su http://localhost:3001
  And le email inviate dal backend sono visibili su MailHog

Given uno sviluppatore modifica il file `.env.example`
When aggiunge una nuova variabile d'ambiente
Then il Docker Compose fallisce con un messaggio chiaro indicando la variabile mancante
  And il README documenta tutte le variabili richieste con valori di esempio
```

---

### US-010: Gestione ambienti (dev/staging/prod) con Terraform

| Campo | Valore |
|---|---|
| **ID** | US-010 |
| **Priorita** | 🟡 Media |
| **Story Points** | 8 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** ambienti dev, staging e prod completamente isolati, gestiti via Terraform con workspace o directory separate,
**in modo da** garantire parita tra gli ambienti e prevenire interferenze tra le fasi di sviluppo, test e produzione.

**Acceptance Criteria:**

```gherkin
Given la struttura Terraform è organizzata in moduli riutilizzabili
When eseguo `terraform apply -var-file=envs/staging.tfvars`
Then viene provisionato un ambiente staging completo con:
  - Cluster EKS dedicato (dimensionamento ridotto rispetto a prod)
  - Database PostgreSQL isolato con dati di test
  - Redis, Kafka, Elasticsearch dimensionati per staging
  - Networking isolata (VPC separata, no peering con prod)
  - DNS: *.staging.crmpro360.io

Given tutti e tre gli ambienti sono provisionati
When confronto le configurazioni tra staging e production
Then le differenze sono SOLO di sizing (instance type, replica count, storage)
  And la configurazione di rete, security groups e IAM policies è identica nella struttura
  And il backend Terraform state è su S3 con lock DynamoDB, un bucket per ambiente

Given un modulo Terraform viene modificato
When eseguo `terraform plan` su ogni ambiente
Then il piano mostra le modifiche previste senza effetti collaterali cross-ambiente
  And le modifiche distruttive richiedono conferma esplicita (`-auto-approve` disabilitato in prod)
```

---

### US-011: Container registry e image scanning

| Campo | Valore |
|---|---|
| **ID** | US-011 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-002 |
| **Assegnatario** | DevOps Engineer |

**Come** Chiara (CTO),
**voglio** un container registry privato (ECR) con scanning automatico delle vulnerabilita su ogni push,
**in modo da** garantire che solo immagini sicure e validate vengano deployate negli ambienti.

**Acceptance Criteria:**

```gherkin
Given AWS ECR è configurato con repository per ogni microservizio
When la pipeline CI pusha una nuova immagine Docker
Then ECR esegue automaticamente un vulnerability scan (enhanced scanning con Inspector)
  And l'immagine viene taggata con: SHA commit, branch name, timestamp build
  And le immagini non taggate vengono eliminate dopo 7 giorni (lifecycle policy)

Given lo scan rileva una vulnerabilita CRITICAL o HIGH
When il risultato viene elaborato dalla pipeline CI
Then il deployment viene bloccato automaticamente
  And un report dettagliato viene pubblicato come commento sulla PR
  And un alert viene inviato al canale Slack #security-alerts

Given le immagini sono in ECR
When un deployment Kubernetes referenzia un'immagine
Then l'image pull avviene tramite IAM role (no credenziali hardcoded)
  And l'image pull policy è `Always` per i tag mutabili, `IfNotPresent` per SHA
```

---

### US-012: Gestione secrets con HashiCorp Vault

| Campo | Valore |
|---|---|
| **ID** | US-012 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 2 |
| **Dipendenze** | US-001 |
| **Assegnatario** | DevOps Engineer / Security Engineer |

**Come** Chiara (CTO),
**voglio** HashiCorp Vault per la gestione centralizzata dei secrets con rotazione automatica e audit trail,
**in modo da** eliminare i secrets hardcodati e garantire un accesso sicuro e tracciabile a credenziali e chiavi di cifratura.

**Acceptance Criteria:**

```gherkin
Given il cluster EKS è operativo
When eseguo il deployment di Vault via Helm chart in HA mode
Then viene creato un cluster Vault con:
  - 3 repliche in HA con Raft storage backend
  - Auto-unseal tramite AWS KMS
  - Audit log abilitato su stdout (raccolto da Prometheus/Loki)
  - Kubernetes auth method configurato per i service account del cluster

Given Vault è attivo e unsealed
When un pod Kubernetes con service account annotato richiede un secret
Then Vault Agent Injector inietta il secret come file nel pod via sidecar
  And il secret non viene mai esposto come variabile d'ambiente
  And il secret viene rinnovato automaticamente prima della scadenza del lease

Given un database credential è gestito da Vault Dynamic Secrets
When un servizio richiede una connessione al database
Then Vault genera credenziali temporanee con TTL di 1 ora
  And le credenziali vengono ruotate automaticamente alla scadenza
  And ogni accesso è tracciato nell'audit log con: timestamp, identity, path, operation
  And le credenziali revocate non permettono piu l'accesso al database
```

---

## Task Breakdown

### Cluster EKS (US-001)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0001 | Definire modulo Terraform per VPC (subnet, NAT GW, IGW, route tables) | 6h | DevOps | TODO |
| T-0002 | Definire modulo Terraform per EKS cluster (control plane, OIDC provider) | 8h | DevOps | TODO |
| T-0003 | Configurare node groups con launch templates e autoscaling policies | 4h | DevOps | TODO |
| T-0004 | Installare e configurare Cluster Autoscaler via Helm | 2h | DevOps | TODO |
| T-0005 | Configurare IRSA per service accounts (autoscaler, external-dns, cert-manager) | 3h | DevOps | TODO |
| T-0006 | Installare ingress controller (NGINX) con ALB integration | 3h | DevOps | TODO |
| T-0007 | Configurare cert-manager con Let's Encrypt per TLS automatico | 2h | DevOps | TODO |
| T-0008 | Test di failover: simulare node failure e verificare rescheduling | 2h | DevOps | TODO |

### CI/CD Pipeline (US-002)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0009 | Creare workflow GitHub Actions per CI (lint, test, build, scan) | 4h | DevOps | TODO |
| T-0010 | Configurare build Docker multi-stage con layer caching | 3h | DevOps | TODO |
| T-0011 | Installare ArgoCD nel cluster e configurare ApplicationSet per ambienti | 4h | DevOps | TODO |
| T-0012 | Creare Kustomize overlays per dev/staging/prod | 3h | DevOps | TODO |
| T-0013 | Configurare notifiche Slack per pipeline e deployment | 1h | DevOps | TODO |
| T-0014 | Configurare rollback automatico ArgoCD su health check failure | 2h | DevOps | TODO |

### PostgreSQL + Citus (US-003)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0015 | Definire Helm chart per PostgreSQL 17 con Citus extension | 4h | DBA | TODO |
| T-0016 | Configurare PgBouncer come connection pooler | 2h | DBA | TODO |
| T-0017 | Creare script di distribuzione tabelle con `create_distributed_table` | 3h | DBA | TODO |
| T-0018 | Configurare backup automatico su S3 con pgBackRest | 3h | DBA | TODO |
| T-0019 | Test di failover: simulare worker node failure e verifica replica promotion | 2h | DBA | TODO |

### Redis Cluster (US-004)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0020 | Definire Helm chart per Redis Cluster (3 master + 3 replica) | 3h | DevOps | TODO |
| T-0021 | Configurare TLS, password auth e maxmemory policy | 2h | DevOps | TODO |
| T-0022 | Creare script di smoke test per operazioni CRUD e failover | 1h | DevOps | TODO |

### Kafka KRaft (US-005)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0023 | Installare Strimzi Operator e definire KafkaCluster CRD in KRaft mode | 4h | DevOps | TODO |
| T-0024 | Configurare Schema Registry Confluent con storage Kafka | 3h | DevOps | TODO |
| T-0025 | Creare topic pre-definiti per domini CRM (contacts, deals, emails, events) | 2h | DevOps | TODO |
| T-0026 | Configurare monitoring Kafka con JMX exporter per Prometheus | 2h | DevOps | TODO |
| T-0027 | Test di resilienza: simulare broker failure e verificare rebalancing | 2h | DevOps | TODO |

### Elasticsearch 8 (US-006)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0028 | Installare ECK Operator e definire Elasticsearch CRD | 3h | DevOps | TODO |
| T-0029 | Configurare ILM policies (hot/warm/delete) | 2h | DevOps | TODO |
| T-0030 | Creare index templates per domini CRM con analyzer multi-lingua | 3h | Backend | TODO |
| T-0031 | Configurare security (TLS, autenticazione nativa, RBAC ES) | 2h | DevOps | TODO |

### Monitoring Stack (US-007)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0032 | Installare kube-prometheus-stack via Helm | 2h | DevOps | TODO |
| T-0033 | Creare dashboard Grafana per cluster overview | 3h | DevOps | TODO |
| T-0034 | Creare dashboard Grafana per PostgreSQL, Redis, Kafka, ES | 4h | DevOps | TODO |
| T-0035 | Configurare Alertmanager con regole per SLI/SLO e integrazioni Slack/PagerDuty | 3h | DevOps | TODO |
| T-0036 | Definire ServiceMonitor CRD per ogni servizio applicativo | 2h | DevOps | TODO |

### Jaeger + Sentry (US-008)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0037 | Installare Jaeger con backend Elasticsearch via Helm | 2h | DevOps | TODO |
| T-0038 | Configurare OpenTelemetry Collector come DaemonSet | 3h | DevOps | TODO |
| T-0039 | Configurare Sentry self-hosted o SaaS con DSN per frontend/backend | 2h | DevOps | TODO |
| T-0040 | Integrare trace_id Jaeger con Sentry error context | 2h | Backend | TODO |

### Docker Compose (US-009)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0041 | Creare docker-compose.yml con tutti i servizi infrastrutturali | 3h | Backend | TODO |
| T-0042 | Creare script di init per seed data e migrazioni automatiche | 2h | Backend | TODO |
| T-0043 | Configurare healthcheck per ogni servizio nel Compose | 1h | Backend | TODO |
| T-0044 | Documentare setup locale nel README con troubleshooting | 2h | Backend | TODO |

### Gestione Ambienti (US-010)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0045 | Creare struttura Terraform con moduli condivisi e tfvars per ambiente | 4h | DevOps | TODO |
| T-0046 | Configurare backend S3 + DynamoDB lock per ogni ambiente | 2h | DevOps | TODO |
| T-0047 | Definire DNS zones e record per *.dev/staging/prod.crmpro360.io | 2h | DevOps | TODO |
| T-0048 | Creare pipeline Terraform CI per plan automatico su PR | 2h | DevOps | TODO |

### Container Registry (US-011)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0049 | Configurare ECR repositories con lifecycle policies | 2h | DevOps | TODO |
| T-0050 | Abilitare enhanced scanning con Inspector e integrare con CI | 2h | DevOps | TODO |
| T-0051 | Configurare IAM roles per image pull da EKS | 1h | DevOps | TODO |

### Vault (US-012)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-0052 | Installare Vault HA con Raft storage via Helm | 3h | DevOps | TODO |
| T-0053 | Configurare auto-unseal con AWS KMS | 2h | DevOps | TODO |
| T-0054 | Configurare Kubernetes auth method e policies per service accounts | 3h | DevOps | TODO |
| T-0055 | Configurare database dynamic secrets per PostgreSQL | 3h | DevOps | TODO |
| T-0056 | Installare e configurare Vault Agent Injector | 2h | DevOps | TODO |
| T-0057 | Test end-to-end: pod ottiene secret da Vault e si connette al DB | 2h | DevOps | TODO |

---

## Technical Design Notes

### Decisioni architetturali chiave

1. **EKS vs ECS vs self-managed K8s:** Scelto EKS per bilanciare il controllo operativo (namespace isolation, CRD, Helm) con la riduzione del carico di gestione del control plane. ECS sarebbe piu semplice ma limita la portabilita e l'ecosistema di tooling.

2. **Citus vs schema-per-tenant vs database-per-tenant:** Citus con sharding su `tenant_id` offre il miglior rapporto tra isolamento dati e efficienza operativa. Schema-per-tenant non scala oltre 1000 tenant. Database-per-tenant complica backup e migrazioni.

3. **KRaft vs Zookeeper:** KRaft elimina la dipendenza da Zookeeper, riducendo la complessita operativa e migliorando i tempi di recovery del controller.

4. **Vault vs AWS Secrets Manager vs Sealed Secrets:** Vault scelto per la capacita di dynamic secrets, rotazione automatica e audit trail. AWS Secrets Manager sarebbe vendor lock-in. Sealed Secrets non supporta dynamic credentials.

5. **ArgoCD vs Flux:** ArgoCD scelto per la UI piu matura, il supporto ApplicationSet per multi-environment e la community piu ampia.

6. **Prometheus vs Datadog vs CloudWatch:** Prometheus + Grafana scelto per costi prevedibili (no per-host pricing), query language potente (PromQL) e integrazione nativa con Kubernetes.

---

## Rischi

| # | Rischio | Probabilita | Impatto | Mitigazione |
|---|---|---|---|---|
| R1 | Costi AWS superano il budget per il cluster multi-AZ | Alta | Alto | Usare Spot Instances per workload node group. Definire budget alerts su AWS. Rivedere sizing dopo 2 settimane di dati reali. |
| R2 | Citus sharding introduce complessita nelle query cross-tenant (JOIN, aggregazioni) | Media | Alto | Definire reference tables per lookup condivisi. Evitare JOIN cross-shard nel design dello schema. Documentare pattern di query supportati. |
| R3 | La curva di apprendimento di Kubernetes rallenta il team di sviluppo | Media | Medio | Workshop interno di 2 giorni su K8s basics. Skaffold per hot-reload in sviluppo locale. Docker Compose come fallback per chi non necessita K8s. |
| R4 | Kafka KRaft non sufficientemente maturo per produzione | Bassa | Alto | KRaft è GA da Kafka 3.5. Monitorare le release notes. Piano di fallback: aggiungere Zookeeper se si presentano bug critici. |
| R5 | Vault introduce un single point of failure per tutti i secrets | Media | Critico | HA mode con 3 repliche. Auto-unseal con KMS. Testare scenario di disaster recovery mensile. Mantenere break-glass procedure con AWS Secrets Manager come backup. |
| R6 | Drift di configurazione tra ambienti nonostante Terraform | Bassa | Medio | Terraform plan automatico su ogni PR. Drift detection settimanale con `terraform plan -detailed-exitcode`. Vietare modifiche manuali via IAM policy. |
| R7 | Image scanning blocca troppi deployment per falsi positivi | Media | Medio | Definire whitelist per CVE accettate con giustificazione documentata. Separare blocking (CRITICAL) da warning (HIGH). Revisione settimanale delle policy. |

---

## Definition of Done

- [ ] Cluster EKS raggiungibile e tutti i nodi in stato Ready
- [ ] Pipeline CI/CD esegue lint, test, build, scan e deploy senza errori su almeno 3 run consecutivi
- [ ] PostgreSQL 17 + Citus operativo con sharding verificato su tabella di test
- [ ] Redis Cluster operativo con failover testato
- [ ] Kafka operativo con producer/consumer di test funzionanti
- [ ] Elasticsearch operativo con indice di test e query full-text verificata
- [ ] Dashboard Grafana visualizzano metriche di tutti i servizi infrastrutturali
- [ ] Jaeger mostra trace end-to-end su chiamata di test multi-servizio
- [ ] Sentry cattura errori di test con source map corretta
- [ ] Docker Compose avvia tutti i servizi in locale con `docker compose up -d` in meno di 3 minuti
- [ ] Ambienti dev/staging/prod provisionati e isolati con Terraform
- [ ] ECR configurato con scan automatico e lifecycle policies
- [ ] Vault fornisce secrets ai pod via Agent Injector senza errori
- [ ] Tutti i secrets sono in Vault, nessun secret hardcodato in codice o ConfigMap
- [ ] Documentazione operativa (runbook) per ogni componente infrastrutturale
- [ ] Load test di base superato: 100 request/s senza errori per 10 minuti
