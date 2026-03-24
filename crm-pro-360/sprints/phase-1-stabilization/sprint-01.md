# Sprint 01 — Fondamenta Infrastrutturali

## Fase: Phase 1 — Stabilization & Foundation
## Date: M1-W1 → M1-W2
## Sprint Goal / Obiettivo Sprint

Setup completo dell'infrastruttura cloud: cluster Kubernetes EKS, pipeline CI/CD con GitHub Actions + ArgoCD, stack di monitoring base (Prometheus + Grafana), ambiente di sviluppo locale con Docker Compose. Al termine dello sprint, ogni sviluppatore deve poter deployare un container nel cluster EKS tramite merge su `main`.

## Capacità Team: 90 SP

| Ruolo | Persone | Disponibilità |
|-------|---------|---------------|
| DevOps/SRE | 3 | 100% |
| Backend | 2 | 100% |
| Security | 1 | 100% |

---

## Sprint Backlog

### EP-01 — Infrastruttura Cloud & DevOps

- [ ] T-0101 — Configurazione Terraform per VPC multi-AZ con subnet pubbliche/private — 8 SP — DevOps — 📋 TODO
- [ ] T-0102 — Provisioning cluster EKS con managed node groups (3 nodi t3.large) — 8 SP — DevOps — 📋 TODO
- [ ] T-0103 — Configurazione IAM roles per service accounts (IRSA) e OIDC provider — 5 SP — DevOps — 📋 TODO
- [ ] T-0104 — Setup container registry ECR con lifecycle policies per pulizia immagini — 3 SP — DevOps — 📋 TODO
- [ ] T-0105 — Definizione namespace strategy (dev, staging, production) con resource quotas — 3 SP — DevOps — 📋 TODO
- [ ] T-0106 — Creazione base Helm chart per microservizi con template standardizzato — 5 SP — DevOps — 📋 TODO
- [ ] T-0107 — Network policies Calico per isolamento namespace e regole ingress/egress — 5 SP — Security — 📋 TODO
- [ ] T-0108 — GitHub Actions workflow: build e push immagini Docker multi-stage — 5 SP — DevOps — 📋 TODO
- [ ] T-0109 — GitHub Actions workflow: test runner con caching dipendenze npm — 3 SP — Backend — 📋 TODO
- [ ] T-0110 — GitHub Actions workflow: lint (ESLint + Prettier) con fail-fast — 2 SP — Backend — 📋 TODO
- [ ] T-0111 — GitHub Actions workflow: security scan con Trivy per vulnerabilità container — 3 SP — Security — 📋 TODO
- [ ] T-0112 — Setup ArgoCD su cluster EKS con ApplicationSet per multi-environment — 5 SP — DevOps — 📋 TODO
- [ ] T-0113 — Configurazione GitOps repository structure per manifesti Kubernetes — 3 SP — DevOps — 📋 TODO
- [ ] T-0114 — Docker Compose per ambiente di sviluppo locale (PostgreSQL, Redis, Kafka) — 5 SP — Backend — 📋 TODO
- [ ] T-0115 — Documentazione ambiente di sviluppo: setup locale e onboarding guide — 3 SP — Backend — 📋 TODO

### EP-12 — Monitoring & Observability

- [ ] T-0116 — Installazione Prometheus Operator via Helm con ServiceMonitor CRDs — 5 SP — DevOps — 📋 TODO
- [ ] T-0117 — Configurazione Grafana con datasource Prometheus e dashboard cluster overview — 5 SP — DevOps — 📋 TODO
- [ ] T-0118 — Dashboard Grafana per metriche nodo (CPU, memoria, disco, network) — 3 SP — DevOps — 📋 TODO
- [ ] T-0119 — Setup progetto Sentry per error tracking backend e frontend — 3 SP — Backend — 📋 TODO
- [ ] T-0120 — Installazione Jaeger Operator per distributed tracing con storage Elasticsearch — 5 SP — DevOps — 📋 TODO
- [ ] T-0121 — Setup libreria structured logging (Pino/Winston) con formato JSON e correlation ID — 3 SP — Backend — 📋 TODO

---

**Totale Story Points: 90 SP**

---

## Dipendenze Esterne

- Account AWS con permessi per creare risorse EKS, VPC, ECR, IAM
- Licenza GitHub Team/Enterprise per GitHub Actions minutes sufficienti
- Dominio DNS configurato per ArgoCD UI e Grafana
- Accesso Sentry (self-hosted o cloud) con progetto dedicato

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Limiti quote AWS su EKS/VPC bloccano provisioning | Media | Alto | Pre-verificare quote account, aprire ticket supporto preventivo |
| 2 | Terraform state corruption durante setup parallelo | Bassa | Alto | Usare remote state su S3 con DynamoDB locking dal giorno 1 |
| 3 | ArgoCD sync loop per conflitto tra Helm values e GitOps manifesti | Media | Medio | Definire convenzione chiara: Helm genera manifesti, ArgoCD li applica |
| 4 | Docker Compose locale diverge troppo dal cluster EKS | Alta | Medio | Usare stesse immagini base, documentare differenze note |

## Definition of Done Sprint

- [ ] Cluster EKS raggiungibile e funzionante con `kubectl get nodes` che mostra 3 nodi Ready
- [ ] Pipeline CI/CD completa: push su branch → build → test → lint → security scan → deploy su dev
- [ ] ArgoCD sincronizza automaticamente un'applicazione sample dal GitOps repo
- [ ] Prometheus raccoglie metriche cluster, Grafana mostra dashboard funzionanti
- [ ] Sentry riceve errori da un'applicazione test
- [ ] Jaeger mostra trace end-to-end di una richiesta HTTP sample
- [ ] Docker Compose locale avvia tutti i servizi con `docker compose up`
- [ ] Documentazione onboarding validata da almeno 1 sviluppatore non del team infra

## Deliverable Attesi

1. **Cluster EKS production-ready** — VPC multi-AZ, 3 nodi, IRSA configurato
2. **Pipeline CI/CD** — 4 workflow GitHub Actions (build, test, lint, security)
3. **GitOps con ArgoCD** — Sync automatico da repository manifesti
4. **Stack monitoring** — Prometheus + Grafana + Sentry + Jaeger operativi
5. **Dev environment** — Docker Compose locale documentato e funzionante

## Demo/Review Notes

**Data Review:** Fine M1-W2
**Partecipanti:** Product Owner, Tech Lead, Team DevOps, Team Backend

### Checklist Demo
- [ ] Demo live: deploy di un container sample tramite merge su `main`
- [ ] Mostrare dashboard Grafana con metriche cluster reali
- [ ] Mostrare trace Jaeger end-to-end
- [ ] Mostrare error tracking su Sentry
- [ ] Demo Docker Compose locale: `docker compose up` → servizi healthy

### Feedback Raccolto
_(da compilare durante la review)_

### Action Items Post-Review
_(da compilare durante la review)_
