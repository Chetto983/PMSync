# 11. KPIs & Metriche di Performance

> Definizione completa degli indicatori chiave di prestazione per CRM Pro 360.
> Ogni metrica include target quantificati, strumenti di misurazione, soglie di allarme e responsabilità operative.

---

## Indice

1. [Performance Metrics](#1-performance-metrics)
2. [Reliability Metrics](#2-reliability-metrics)
3. [AI Operations Metrics](#3-ai-operations-metrics)
4. [Security Metrics](#4-security-metrics)
5. [Product Metrics](#5-product-metrics)
6. [Business Metrics](#6-business-metrics)
7. [Frontend Metrics](#7-frontend-metrics)
8. [Team & Process Metrics](#8-team--process-metrics)
9. [Monitoring & Dashboard](#9-monitoring--dashboard)
10. [OKR Mapping](#10-okr-mapping)

---

## 1. Performance Metrics

Metriche infrastrutturali che misurano la reattività e la capacità del sistema sotto carico normale e di picco.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| API latency p50 | < 100 ms | Prometheus + Grafana | > 80 ms | > 150 ms | On-call SRE entro 15 min |
| API latency p95 | < 200 ms | Prometheus + Grafana | > 160 ms | > 300 ms | On-call SRE entro 15 min |
| API latency p99 | < 500 ms | Prometheus + Grafana | > 400 ms | > 750 ms | On-call SRE + Engineering Lead entro 30 min |
| Page load time p95 | < 2 s | Lighthouse CI + RUM (Sentry) | > 1.5 s | > 3 s | Frontend Lead entro 1 h |
| Throughput sostenuto | > 10.000 req/s | Prometheus (rate counter) | < 12.000 req/s | < 10.000 req/s | SRE + Infrastructure Lead entro 15 min |
| Database query p95 | < 50 ms | pg_stat_statements + Prometheus exporter | > 40 ms | > 80 ms | DBA + Backend Lead entro 30 min |
| Search latency p95 | < 200 ms | Elasticsearch APM / Prometheus | > 160 ms | > 350 ms | Search team entro 30 min |
| WebSocket message delivery | < 100 ms | Custom Prometheus histogram | > 80 ms | > 200 ms | Backend Lead entro 30 min |
| File upload throughput | > 50 MB/s | Custom metric (bytes/duration) | < 60 MB/s | < 40 MB/s | Infrastructure Lead entro 1 h |
| Background job completion p95 | < 30 s | BullMQ metrics + Prometheus | > 25 s | > 45 s | Backend Lead entro 30 min |

### Dettaglio raccolta dati

- **Prometheus scrape interval**: 15 secondi per metriche applicative, 30 secondi per metriche infrastrutturali.
- **Retention**: 15 giorni ad alta risoluzione, 13 mesi aggregati (Thanos/Cortex).
- **Alerting**: Alertmanager con routing verso PagerDuty (critical) e Slack (warning).
- **Load testing**: k6 con scenari di carico eseguiti settimanalmente simulando 2x il traffico di picco previsto.

---

## 2. Reliability Metrics

Metriche di affidabilità che definiscono la disponibilità del servizio e la capacità di recupero da incidenti.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| Uptime SLA | 99,95% (max 26 min/mese di downtime) | Uptime Robot + Prometheus blackbox exporter | < 99,97% (trend mensile) | < 99,95% (violazione SLA) | VP Engineering + CTO entro 1 h |
| MTTR (Mean Time to Recovery) | < 30 min | Incident tracker (PagerDuty/Opsgenie) | > 20 min | > 30 min | Incident Commander + CTO |
| MTTD (Mean Time to Detection) | < 5 min | Alertmanager timestamp vs incident start | > 3 min | > 5 min | SRE Lead revisione alert rules |
| Change failure rate | < 5% | CI/CD pipeline (deploy rollback counter) | > 3% | > 5% | Engineering Lead + QA Lead |
| Deployment frequency | > 10/settimana | CI/CD pipeline metrics (GitHub Actions) | < 12/settimana | < 10/settimana | Engineering Lead revisione processo |
| RPO (Recovery Point Objective) | < 1 min | WAL replication lag (Prometheus) | > 30 s | > 1 min | DBA + Infrastructure Lead entro 15 min |
| RTO (Recovery Time Objective) | < 30 min | Disaster recovery drill (misurazione) | > 20 min | > 30 min | Infrastructure Lead + CTO |
| Error budget rimanente | > 20% del budget mensile | Calcolo automatico (Grafana) | < 30% | < 10% | SRE Lead + Engineering Lead freeze deploy |

### Gestione Error Budget

| Parametro | Valore |
|---|---|
| Budget mensile totale (99,95%) | 21,6 minuti di downtime consentiti |
| Calcolo | (1 - SLA_target) x minuti_nel_mese |
| Policy sotto 10% | Deploy freeze per nuove feature, solo bug fix e rollback |
| Policy a 0% | Post-mortem obbligatorio, revisione architetturale, freeze completo |
| Reset | Primo giorno di ogni mese solare |
| Reporting | Dashboard Grafana aggiornata in tempo reale, report settimanale via email |

---

## 3. AI Operations Metrics

Metriche operative per tutti i componenti di intelligenza artificiale del sistema, inclusi agent, modelli predittivi e pipeline di training.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| Agent success rate | > 95% | Custom Prometheus counter (successi/totali) | < 97% | < 95% | AI Lead entro 1 h |
| Agent latency p95 | < 5 s | Prometheus histogram | > 4 s | > 7 s | AI Lead entro 30 min |
| Costo per automazione | Tracking per tenant | Custom billing metrics + Grafana | > 120% della media mensile | > 150% della media mensile | AI Lead + Finance entro 24 h |
| Token budget utilization | < 80% del quota assegnato | Token counter per tenant (custom) | > 70% | > 85% | AI Lead + Account Manager entro 4 h |
| Lead scoring — Precision | > 85% | MLflow + evaluation pipeline settimanale | < 87% | < 85% | Data Science Lead entro 24 h |
| Lead scoring — Recall | > 75% | MLflow + evaluation pipeline settimanale | < 78% | < 75% | Data Science Lead entro 24 h |
| Churn prediction — AUC-ROC | > 0,85 | MLflow + evaluation pipeline settimanale | < 0,87 | < 0,85 | Data Science Lead entro 24 h |
| Forecast accuracy | Entro il 15% a inizio trimestre | Confronto forecast vs actual (Metabase) | Deviazione > 12% | Deviazione > 15% | Data Science Lead + VP Sales entro 48 h |
| Inference latency p95 | < 500 ms | Prometheus histogram (model serving) | > 400 ms | > 700 ms | AI Infrastructure Lead entro 30 min |
| Training pipeline duration | < 4 h | Airflow/Dagster task duration | > 3,5 h | > 5 h | MLOps Lead entro 2 h |
| Data drift detection | Esecuzione settimanale | Evidently AI / custom drift monitor | Drift score > 0,15 | Drift score > 0,25 | Data Science Lead entro 24 h |
| Model retraining — Lead scoring | Settimanale | Airflow scheduler | Ritardo > 1 giorno | Ritardo > 3 giorni | MLOps Lead entro 4 h |
| Model retraining — Altri modelli | Mensile | Airflow scheduler | Ritardo > 3 giorni | Ritardo > 7 giorni | MLOps Lead entro 24 h |

### Pipeline di Validazione Modelli

| Fase | Criterio di Accettazione | Azione in Caso di Fallimento |
|---|---|---|
| Validazione offline | Metriche sopra soglia su test set holdout | Blocco deploy, revisione feature engineering |
| Shadow deployment | Differenza < 5% rispetto al modello in produzione | Rollback automatico al modello precedente |
| Canary deployment (10% traffico) | Nessuna degradazione metriche business per 24 h | Rollback automatico, alert al team |
| Full rollout | Monitoraggio continuo per 7 giorni | Rollback manuale se degradazione > 3% |

---

## 4. Security Metrics

Metriche di sicurezza critiche per un CRM enterprise multi-tenant che gestisce dati sensibili di clienti europei.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| Tenant isolation integrity | 100% (zero cross-tenant leaks) | Test automatici + audit query log | Qualsiasi anomalia | Qualsiasi violazione confermata | CISO + CTO immediato, incident P0 |
| Permission enforcement coverage | 100% degli endpoint | Analisi statica + integration test | < 100% (endpoint scoperti) | < 100% (endpoint in produzione senza enforcement) | Security Lead entro 4 h |
| Vulnerabilità Critical — remediation | < 24 h | Snyk + Trivy + Dependabot | Età > 12 h | Età > 24 h | CISO + Engineering Lead immediato |
| Vulnerabilità High — remediation | < 72 h | Snyk + Trivy + Dependabot | Età > 48 h | Età > 72 h | Security Lead entro 4 h |
| Vulnerabilità Medium — remediation | < 7 giorni | Snyk + Trivy + Dependabot | Età > 5 giorni | Età > 7 giorni | Security Lead entro 24 h |
| Vulnerabilità Low — remediation | < 30 giorni | Snyk + Trivy + Dependabot | Età > 21 giorni | Età > 30 giorni | Security Lead revisione mensile |
| MFA adoption | > 90% degli utenti | Auth provider metrics | < 92% | < 90% | Product Lead + Security Lead entro 1 settimana |
| Failed login attempts | Monitoraggio continuo | Auth logs + Prometheus counter | > 50/h per singolo account | > 100/h globale | Security Lead entro 15 min, possibile blocco IP |
| Dependency vulnerabilities — Critical | 0 in qualsiasi momento | Snyk Dashboard | 1+ trovata | 1+ non risolta dopo 12 h | CISO immediato |
| Dependency vulnerabilities — High | < 5 in qualsiasi momento | Snyk Dashboard | 3+ presenti | 5+ presenti | Security Lead entro 24 h |
| Pen test findings post-remediation | 0 Critical, 0 High | Report pen test trimestrale | 1+ Medium non risolta | 1+ High/Critical non risolta | CISO + CTO immediato |
| Security training completion | 100% del team engineering | LMS / training tracker | < 100% entro 30 giorni dalla scadenza | < 100% entro 60 giorni dalla scadenza | CISO + HR entro 1 settimana |

### Calendario Audit di Sicurezza

| Attività | Frequenza | Responsabile |
|---|---|---|
| Scansione automatica vulnerabilità (SAST/DAST) | Ogni commit (CI pipeline) | DevSecOps |
| Revisione dipendenze | Giornaliera (automatizzata) | DevSecOps |
| Pen test esterno | Trimestrale | CISO + vendor esterno |
| Audit accessi e permessi | Mensile | Security Lead |
| Revisione log di sicurezza | Settimanale | Security Lead |
| Drill di incident response | Semestrale | CISO + SRE |

---

## 5. Product Metrics

Metriche di prodotto che misurano l'adozione, la soddisfazione degli utenti e il valore percepito della piattaforma.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| DAU/MAU ratio | > 60% | Google Analytics 4 / Mixpanel | < 65% | < 60% | Product Lead entro 1 settimana |
| Feature adoption per modulo | > 70% entro 90 giorni dal lancio | Mixpanel feature flags + event tracking | < 75% a 60 giorni | < 50% a 90 giorni | Product Lead + UX Lead entro 1 settimana |
| Time-to-first-value | < 14 giorni | Evento custom (primo workflow completato) | > 10 giorni (mediana) | > 14 giorni (mediana) | Onboarding Lead + CS Lead entro 48 h |
| Onboarding completion rate | > 90% | Mixpanel funnel analysis | < 92% | < 90% | Onboarding Lead entro 1 settimana |
| NPS (Net Promoter Score) | > 55 | Survey trimestrale (Delighted/Typeform) | < 60 | < 55 | Product Lead + CS Lead entro 2 settimane |
| CSAT | > 4,2 / 5,0 | Survey post-interazione (Intercom) | < 4,3 | < 4,2 | CS Lead entro 1 settimana |
| Ticket resolution time — P1 | < 4 h | Zendesk / Intercom SLA tracking | > 3 h | > 4 h | CS Lead + Engineering Lead immediato |
| Ticket resolution time — P2 | < 24 h | Zendesk / Intercom SLA tracking | > 18 h | > 24 h | CS Lead entro 4 h |
| Feature request response | < 48 h (acknowledgment) | Productboard / Linear | > 36 h | > 48 h | Product Lead entro 24 h |

### Segmentazione Metriche di Prodotto

| Segmento | DAU/MAU Target | NPS Target | Nota |
|---|---|---|---|
| Starter tier | > 50% | > 45 | Utenti self-service, engagement più basso è accettabile |
| Business tier | > 60% | > 55 | Core target, massima attenzione |
| Enterprise tier | > 70% | > 60 | Utenti ad alto valore, monitoraggio dedicato da CS |
| Utenti AI features | > 75% | > 60 | Early adopter, feedback prioritario per roadmap AI |

---

## 6. Business Metrics

Metriche finanziarie e commerciali che misurano la sostenibilità e la crescita del business.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| MRR growth | > 15% MoM (primi 12 mesi) | Stripe Billing + Metabase | < 17% | < 15% | VP Sales + CFO entro 1 settimana |
| ARR target | €8M a 18 mesi | Stripe Billing + Metabase | < 80% della proiezione lineare | < 70% della proiezione lineare | CEO + CFO revisione strategica |
| CAC payback period | < 12 mesi | CRM interno + costi marketing / nuovi clienti | > 10 mesi | > 12 mesi | VP Marketing + CFO entro 2 settimane |
| LTV/CAC ratio | > 3:1 | Calcolo trimestrale (LTV media / CAC media) | < 3,5:1 | < 3:1 | VP Sales + VP Marketing + CFO |
| Logo churn (annuale) | < 5% | CRM interno + Stripe cancellations | > 4% (trend trimestrale) | > 5% (trend trimestrale) | CS Lead + VP Sales entro 1 settimana |
| Net revenue churn (mensile) | < 0% (expansion > churn) | Stripe MRR analysis | > -2% (contrazione netta) | > 0% (churn netto positivo) | VP Sales + CS Lead entro 1 settimana |
| Average deal size | > €15K ACV | CRM pipeline analysis | < €17K (media trimestrale) | < €15K (media trimestrale) | VP Sales entro 2 settimane |
| Sales cycle — Business tier | < 60 giorni | CRM pipeline (opportunity created to closed-won) | > 50 giorni (media) | > 60 giorni (media) | VP Sales entro 2 settimane |
| Sales cycle — Enterprise tier | < 120 giorni | CRM pipeline (opportunity created to closed-won) | > 100 giorni (media) | > 120 giorni (media) | VP Sales entro 1 mese |
| Pipeline coverage | > 3x | CRM pipeline / quota trimestrale | < 3,5x | < 3x | VP Sales immediato |

### Unit Economics per Tier

| Tier | Prezzo Mensile | CAC Target | LTV Atteso (3 anni) | Margine Lordo |
|---|---|---|---|---|
| Starter | €49/utente | < €500 | €5.292 (3 utenti media) | > 80% |
| Business | €99/utente | < €3.000 | €35.640 (10 utenti media) | > 75% |
| Enterprise | €199/utente | < €15.000 | €214.920 (30 utenti media) | > 70% |

---

## 7. Frontend Metrics

Metriche specifiche per la qualità dell'esperienza utente lato client, inclusi Core Web Vitals e stabilità applicativa.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| LCP (Largest Contentful Paint) | < 2,5 s | Sentry Performance + CrUX | > 2,0 s | > 2,5 s | Frontend Lead entro 24 h |
| FID (First Input Delay) | < 100 ms | Sentry Performance + CrUX | > 80 ms | > 100 ms | Frontend Lead entro 24 h |
| CLS (Cumulative Layout Shift) | < 0,1 | Sentry Performance + CrUX | > 0,08 | > 0,1 | Frontend Lead entro 48 h |
| INP (Interaction to Next Paint) | < 200 ms | Sentry Performance + CrUX | > 160 ms | > 200 ms | Frontend Lead entro 24 h |
| Bundle size — Initial load | < 200 KB (gzip) | Webpack Bundle Analyzer + CI check | > 180 KB | > 200 KB | Frontend Lead blocco merge |
| Bundle size — Totale | < 500 KB (gzip) | Webpack Bundle Analyzer + CI check | > 450 KB | > 500 KB | Frontend Lead blocco merge |
| Lighthouse score — Performance | > 90 | Lighthouse CI (media mobile 7 giorni) | < 92 | < 90 | Frontend Lead entro 1 settimana |
| Lighthouse score — Accessibility | > 90 | Lighthouse CI | < 92 | < 90 | UX Lead entro 1 settimana |
| Lighthouse score — Best Practices | > 90 | Lighthouse CI | < 92 | < 90 | Frontend Lead entro 1 settimana |
| Lighthouse score — SEO | > 90 | Lighthouse CI | < 92 | < 90 | Frontend Lead entro 2 settimane |
| Accessibilità WCAG 2.2 AA | Pass completo | Axe-core CI + audit manuale trimestrale | Violazioni minori | Violazioni livello A o AA | UX Lead + Frontend Lead entro 1 settimana |
| Error rate (sessioni con errore) | < 0,1% | Sentry session tracking | > 0,08% | > 0,1% | Frontend Lead entro 24 h |
| JavaScript error rate | < 0,5% | Sentry error tracking | > 0,3% | > 0,5% | Frontend Lead entro 12 h |
| API call error rate (client-side) | < 1% | Sentry breadcrumbs + custom metric | > 0,7% | > 1% | Frontend Lead + Backend Lead entro 12 h |
| Client-side crash rate | < 0,01% | Sentry crash-free sessions | > 0,008% | > 0,01% | Frontend Lead entro 4 h |

### Budget di Performance per Route

| Route | LCP Target | Bundle Target | Nota |
|---|---|---|---|
| `/dashboard` | < 1,5 s | < 120 KB | Pagina più visitata, priorità massima |
| `/contacts` | < 2,0 s | < 100 KB | Lista virtualizzata, lazy load dettaglio |
| `/deals/pipeline` | < 2,5 s | < 150 KB | Drag-and-drop pesante, accettabile LCP più alto |
| `/email/inbox` | < 2,0 s | < 130 KB | WebSocket real-time, rendering incrementale |
| `/reports` | < 3,0 s | < 180 KB | Grafici complessi, lazy load chart library |
| `/settings` | < 2,0 s | < 80 KB | Pagina semplice, form-based |

---

## 8. Team & Process Metrics

Metriche di processo e produttività del team di sviluppo, misurate per garantire velocità sostenibile e qualità del codice.

| Metrica | Target | Strumento di Misurazione | Soglia Warning | Soglia Critical | Escalation |
|---|---|---|---|---|---|
| Sprint velocity | 80-100 SP (stabile dopo Sprint 3) | Linear / Jira velocity chart | < 85 SP o > 110 SP (instabilità) | < 70 SP per 2 sprint consecutivi | Engineering Lead entro 1 sprint |
| Sprint commitment accuracy | > 85% | Story points completati / impegnati | < 87% | < 85% | Scrum Master + Engineering Lead |
| Code review turnaround | < 4 h | GitHub PR metrics (time to first review) | > 3 h | > 4 h | Engineering Lead entro 1 giorno |
| CI pipeline duration | < 15 min | GitHub Actions workflow duration | > 12 min | > 15 min | DevOps Lead entro 1 settimana |
| Test coverage — Backend | > 80% | Jest + Istanbul (coverage report in CI) | < 82% | < 80% | Backend Lead blocco merge |
| Test coverage — Frontend | > 70% | Vitest + Istanbul (coverage report in CI) | < 73% | < 70% | Frontend Lead blocco merge |
| Bug escape rate | < 5% | Bug trovati in prod / bug totali (Linear) | > 4% | > 5% | QA Lead + Engineering Lead entro 1 sprint |
| Technical debt ratio | < 15% del capacity dello sprint | Story points tech-debt / totali | > 12% | > 15% | Engineering Lead revisione priorità |

### Definizione Story Points

| SP | Complessità | Esempio |
|---|---|---|
| 1 | Triviale, nessun rischio | Fix typo, aggiornamento copia |
| 2 | Semplice, pattern noto | Nuovo endpoint CRUD standard |
| 3 | Moderata, una decisione tecnica | Nuovo componente con stato locale |
| 5 | Complessa, più componenti coinvolti | Integrazione con servizio esterno |
| 8 | Molto complessa, rischio significativo | Nuova feature cross-module |
| 13 | Epica, da spezzare prima dello sprint | Refactor architetturale maggiore |

---

## 9. Monitoring & Dashboard

Architettura di monitoraggio centralizzata con dashboard organizzate per area di responsabilità.

### Stack di Monitoraggio

| Strumento | Ruolo | Metriche Raccolte |
|---|---|---|
| Prometheus | Raccolta metriche applicative e infrastrutturali | API latency, throughput, job duration, custom counters |
| Grafana | Visualizzazione e dashboard | Tutti i dati Prometheus, Loki, Tempo |
| Alertmanager | Gestione alert e routing | Tutte le soglie definite nelle tabelle sopra |
| Sentry | Error tracking e performance frontend | JS errors, crash rate, Core Web Vitals, API errors |
| Loki | Log aggregation | Application logs, access logs, audit logs |
| Tempo | Distributed tracing | Request traces end-to-end |
| PagerDuty | Incident management | Escalation per alert critical |
| Uptime Robot | Monitoraggio disponibilità esterna | Uptime SLA, endpoint health |
| MLflow | Model registry e metriche AI | Accuracy, AUC-ROC, drift score |
| Evidently AI | Data drift monitoring | Feature drift, prediction drift |
| Mixpanel | Product analytics | DAU/MAU, feature adoption, funnel |
| Google Analytics 4 | Web analytics | Traffico, conversioni, comportamento utente |
| Stripe Dashboard | Metriche finanziarie | MRR, churn, ACV |
| Snyk | Sicurezza dipendenze | Vulnerabilità per severity |
| Lighthouse CI | Performance frontend | Score per categoria, budget check |

### Layout Dashboard

#### Dashboard 1: Operations Overview (Grafana)

Pannelli co-locati per visione operativa in tempo reale:

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | Uptime status (semaforo), Error budget rimanente (gauge), Deployment count (counter) | 30 s |
| 2 | API latency p50/p95/p99 (time series), Throughput req/s (time series) | 15 s |
| 3 | Database query p95 (time series), Redis latency (time series), Background job duration (heatmap) | 15 s |
| 4 | Active WebSocket connections (gauge), Message delivery latency (histogram) | 15 s |

#### Dashboard 2: AI Operations (Grafana)

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | Agent success rate (gauge), Agent latency p95 (time series), Token utilization per tenant (bar chart) | 1 min |
| 2 | Model accuracy trend (time series), Drift score (gauge), Last retrain timestamp (stat) | 5 min |
| 3 | Inference latency p95 (time series), Training pipeline status (table), Cost per automation (bar chart) | 5 min |

#### Dashboard 3: Product & Business (Metabase/Grafana)

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | DAU/MAU trend (time series), Feature adoption heatmap (heatmap), NPS trend (line chart) | 1 h |
| 2 | MRR waterfall (bar chart), Logo churn trend (line chart), Pipeline coverage (gauge) | 1 h |
| 3 | Time-to-first-value distribution (histogram), Onboarding funnel (funnel chart), CSAT trend (line chart) | 1 h |

#### Dashboard 4: Security (Grafana)

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | Vulnerabilità aperte per severity (stacked bar), MFA adoption rate (gauge) | 1 h |
| 2 | Failed login heatmap (tempo x account), Tenant isolation test status (table) | 5 min |
| 3 | Dependency scan results (table), Pen test remediation tracker (table) | 6 h |

#### Dashboard 5: Frontend Performance (Grafana + Sentry)

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | Core Web Vitals (LCP, FID, CLS, INP) per route (multi-line chart) | 5 min |
| 2 | Bundle size trend (area chart), Lighthouse score trend (line chart) | 1 h |
| 3 | JS error rate (time series), Crash-free sessions (gauge), API error rate client-side (time series) | 1 min |

#### Dashboard 6: Team Health (Grafana + Linear API)

| Riga | Pannelli | Refresh |
|---|---|---|
| 1 | Sprint velocity trend (bar chart), Commitment accuracy (line chart) | Giornaliero |
| 2 | CI pipeline duration trend (time series), PR review turnaround (histogram) | 1 h |
| 3 | Test coverage trend (area chart), Bug escape rate (line chart), Tech debt ratio (gauge) | Giornaliero |

### Regole di Alert

| Livello | Canale di Notifica | Tempo di Risposta Atteso | Esempio |
|---|---|---|---|
| **Info** | Slack #ops-info | Nessun azione richiesta | Deploy completato, drift score sotto soglia |
| **Warning** | Slack #ops-alerts | Investigazione entro 1 h | API latency p95 > 160 ms |
| **Critical** | PagerDuty + Slack #incidents | Risposta entro 15 min | Uptime sotto SLA, tenant isolation failure |
| **P0 (Security)** | PagerDuty + telefono + Slack #security-incidents | Risposta immediata (< 5 min) | Cross-tenant data leak, vulnerabilità 0-day sfruttata |

### Cadenza di Reporting

| Report | Frequenza | Destinatari | Contenuto |
|---|---|---|---|
| Operations daily digest | Giornaliero (automatico, 08:00 CET) | SRE team, Engineering Lead | Uptime, error budget, incidenti ultimi 24 h |
| Performance weekly review | Settimanale (lunedì mattina) | Engineering team | Trend latency, throughput, Core Web Vitals |
| AI model health report | Settimanale | AI team, Product Lead | Accuracy, drift, costi, retraining status |
| Security posture report | Settimanale | CISO, Engineering Lead | Vulnerabilità, MFA, failed logins, audit findings |
| Product metrics report | Settimanale | Product Lead, CS Lead, VP Sales | DAU/MAU, NPS, ticket SLA, feature adoption |
| Business metrics report | Mensile | C-suite, Board | MRR, ARR progress, churn, unit economics |
| Sprint retrospective metrics | Ogni 2 settimane | Engineering team | Velocity, commitment accuracy, bug escape rate |
| Quarterly business review | Trimestrale | C-suite, Board, Investors | Tutte le metriche aggregate, trend, OKR progress |

### Ownership per Categoria

| Categoria | Owner Primario | Owner Secondario |
|---|---|---|
| Performance Metrics | SRE Lead | Backend Lead |
| Reliability Metrics | SRE Lead | Infrastructure Lead |
| AI Operations Metrics | AI Lead | Data Science Lead |
| Security Metrics | CISO | Security Lead |
| Product Metrics | Product Lead | UX Lead |
| Business Metrics | CFO | VP Sales |
| Frontend Metrics | Frontend Lead | UX Lead |
| Team & Process Metrics | Engineering Lead | Scrum Master |

---

## 10. OKR Mapping

Mappatura delle metriche agli Objectives and Key Results trimestrali per i primi 4 trimestri post-lancio.

### Q1: Affidabilità Infrastrutturale + Lancio Moduli Core

**Objective 1: Costruire un'infrastruttura affidabile e performante per il lancio**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Raggiungere uptime 99,95% per 3 mesi consecutivi | Uptime SLA, MTTR, MTTD | 99,95%, < 30 min, < 5 min |
| KR2: API latency p95 sotto 200 ms sotto carico di 5K req/s | API latency p95, Throughput | < 200 ms, > 5K req/s |
| KR3: CI pipeline sotto 15 min con coverage > 80% backend | CI pipeline duration, Test coverage | < 15 min, > 80% |
| KR4: Zero vulnerabilità critical o high nelle dipendenze | Dependency vulnerabilities | 0 critical, < 5 high |

**Objective 2: Lanciare i moduli core con alta qualità**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Lighthouse performance score > 90 su tutte le route core | Lighthouse score, Core Web Vitals | > 90, LCP < 2,5 s |
| KR2: Onboarding completion rate > 85% nei primi beta tester | Onboarding completion, Time-to-first-value | > 85%, < 14 giorni |
| KR3: Sprint velocity stabile tra 80-100 SP per 3 sprint consecutivi | Sprint velocity, Commitment accuracy | 80-100 SP, > 85% |
| KR4: WCAG 2.2 AA compliance su tutti i moduli lanciati | Accessibility audit | Pass completo |

### Q2: Acquisizione Clienti + AI MVP

**Objective 3: Acquisire i primi clienti paganti e dimostrare traction**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Raggiungere €200K MRR | MRR growth, Average deal size | > 15% MoM, > €15K ACV |
| KR2: DAU/MAU > 55% tra i clienti paganti | DAU/MAU ratio, Feature adoption | > 55%, > 60% a 90 giorni |
| KR3: NPS > 45 nel primo survey | NPS, CSAT | > 45, > 4,0 |
| KR4: Sales cycle Business tier < 75 giorni | Sales cycle, Pipeline coverage | < 75 giorni, > 3x |

**Objective 4: Lanciare l'AI MVP con risultati misurabili**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Lead scoring con precision > 80% e recall > 70% | Lead scoring precision/recall | > 80%, > 70% |
| KR2: Agent success rate > 90% | Agent success rate, Agent latency | > 90%, < 5 s |
| KR3: Inference latency p95 < 500 ms | Inference latency, Training pipeline | < 500 ms, < 4 h |
| KR4: Costo AI per tenant < €50/mese (mediana) | Costo per automazione, Token utilization | < €50, < 80% |

### Q3: Scalabilità + Mobile + Marketplace

**Objective 5: Scalare l'infrastruttura per la crescita**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Throughput sostenuto > 10K req/s | Throughput, API latency p99 | > 10K, < 500 ms |
| KR2: Database query p95 < 50 ms con 10x dati rispetto a Q1 | Database query p95, Search latency | < 50 ms, < 200 ms |
| KR3: Deployment frequency > 10/settimana con change failure rate < 5% | Deployment frequency, Change failure rate | > 10, < 5% |
| KR4: RPO < 1 min e RTO < 30 min verificati con drill | RPO, RTO | < 1 min, < 30 min |

**Objective 6: Espandere la piattaforma con mobile e marketplace**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: App mobile con LCP < 3 s e crash rate < 0,05% | Core Web Vitals (mobile), Crash rate | LCP < 3 s, < 0,05% |
| KR2: Feature adoption moduli marketplace > 50% a 60 giorni | Feature adoption | > 50% |
| KR3: MRR > €600K con net revenue churn < 0% | MRR, Net revenue churn | > €600K, < 0% |
| KR4: Logo churn < 6% (annualizzato) | Logo churn | < 6% |

### Q4: GA + Enterprise Readiness

**Objective 7: Raggiungere la General Availability con standard enterprise**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: Uptime 99,95% per 6 mesi consecutivi (Q3+Q4) | Uptime SLA | 99,95% |
| KR2: Pen test con 0 finding critical/high | Pen test findings, Permission enforcement | 0 critical/high, 100% |
| KR3: Tenant isolation 100% verificata con audit esterno | Tenant isolation integrity | 100% |
| KR4: Security training completato da 100% del team | Security training completion | 100% |

**Objective 8: Raggiungere i target finanziari per la serie successiva**

| Key Result | Metriche Collegate | Target |
|---|---|---|
| KR1: ARR run-rate > €5M (in linea per €8M a 18 mesi) | ARR target, MRR growth | > €5M run-rate |
| KR2: LTV/CAC > 3:1 con CAC payback < 12 mesi | LTV/CAC, CAC payback | > 3:1, < 12 mesi |
| KR3: NPS > 55 con DAU/MAU > 60% | NPS, DAU/MAU | > 55, > 60% |
| KR4: Churn prediction AUC-ROC > 0,85, forecast entro 15% | Churn AUC-ROC, Forecast accuracy | > 0,85, entro 15% |

### Matrice di Dipendenze OKR

| OKR | Dipende Da | Blocca |
|---|---|---|
| Q1-O1 (Infrastruttura) | Nessuno | Q2-O3, Q3-O5 |
| Q1-O2 (Lancio moduli) | Q1-O1 | Q2-O3, Q2-O4 |
| Q2-O3 (Acquisizione) | Q1-O2 | Q3-O6, Q4-O8 |
| Q2-O4 (AI MVP) | Q1-O1 | Q3-O5, Q4-O7 |
| Q3-O5 (Scalabilità) | Q1-O1, Q2-O4 | Q4-O7 |
| Q3-O6 (Mobile/Marketplace) | Q2-O3 | Q4-O8 |
| Q4-O7 (GA) | Q3-O5, Q2-O4 | Nessuno (milestone finale) |
| Q4-O8 (Target finanziari) | Q2-O3, Q3-O6 | Nessuno (milestone finale) |

---

## Appendice: Glossario Metriche

| Sigla | Significato | Definizione Operativa |
|---|---|---|
| p50 / p95 / p99 | Percentili | Il valore sotto il quale cade il 50% / 95% / 99% delle osservazioni |
| MTTR | Mean Time to Recovery | Tempo medio dal rilevamento dell'incidente al ripristino completo del servizio |
| MTTD | Mean Time to Detection | Tempo medio dall'inizio dell'anomalia al primo alert |
| RPO | Recovery Point Objective | Massima perdita di dati tollerabile in caso di disaster |
| RTO | Recovery Time Objective | Tempo massimo per il ripristino del servizio dopo un disaster |
| DAU/MAU | Daily/Monthly Active Users | Rapporto tra utenti attivi giornalieri e mensili (stickiness) |
| NPS | Net Promoter Score | % Promotori (9-10) meno % Detrattori (0-6) su scala 0-10 |
| CSAT | Customer Satisfaction Score | Media delle valutazioni di soddisfazione su scala 1-5 |
| MRR | Monthly Recurring Revenue | Ricavo ricorrente mensile da tutti i contratti attivi |
| ARR | Annual Recurring Revenue | MRR x 12 |
| ACV | Annual Contract Value | Valore annuale medio di un contratto |
| CAC | Customer Acquisition Cost | Costo totale sales + marketing / numero nuovi clienti nel periodo |
| LTV | Lifetime Value | Ricavo medio generato da un cliente durante l'intera relazione |
| AUC-ROC | Area Under ROC Curve | Misura della capacità discriminativa di un modello binario (0,5 = random, 1,0 = perfetto) |
| CLS | Cumulative Layout Shift | Misura della stabilità visiva della pagina durante il caricamento |
| LCP | Largest Contentful Paint | Tempo di rendering dell'elemento visibile più grande nel viewport |
| FID | First Input Delay | Tempo tra la prima interazione dell'utente e la risposta del browser |
| INP | Interaction to Next Paint | Latenza dell'interazione più lenta durante la sessione |
| SP | Story Points | Unità di misura della complessità relativa di una user story |
| SLA | Service Level Agreement | Accordo contrattuale sul livello di servizio garantito |
