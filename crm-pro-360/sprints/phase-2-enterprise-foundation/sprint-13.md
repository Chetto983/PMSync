# Sprint 13 — AI Engine Setup & Lead Scoring

**Phase:** 2 — Enterprise Foundation
**Epic:** EP-08 — AI/ML Engine
**Date:** M7-W1 → M7-W2
**Status:** 📋 TODO

---

## Obiettivo Sprint

Setup dell'infrastruttura AI con servizio FastAPI dedicato, feature store dual-layer (Redis online + PostgreSQL offline), model registry con versioning, pipeline di lead scoring predittivo con ensemble XGBoost + neural network, e deal scoring rule-based con visualizzazione in pipeline.

---

## Capacità Team

| Ruolo | Risorse | SP Allocati |
|-------|---------|-------------|
| AI/ML | 4 | 44 |
| Backend | 2 | 20 |
| Frontend | 1 | 8 |
| Data Engineer | 1 | 13 |
| **Totale** | **8** | **85 SP** |

---

## Sprint Backlog

- [ ] T-1301 — Setup servizio FastAPI AI (struttura progetto, Docker, health check, config) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1302 — Model registry service (CRUD modelli, versioning, metadata, stato deploy) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1303 — Feature store online (Redis) con TTL configurabile e invalidazione — 5 SP — Data Engineer — 📋 TODO
- [ ] T-1304 — Feature store offline (PostgreSQL) con tabelle feature per entità e timestamp — 3 SP — Data Engineer — 📋 TODO
- [ ] T-1305 — Pipeline computazione feature via Kafka (consumer eventi CRM, calcolo feature real-time) — 5 SP — Data Engineer — 📋 TODO
- [ ] T-1306 — Pipeline training lead scoring model (data extraction, preprocessing, split train/test) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1307 — Feature engineering lead scoring: 50+ variabili (demografiche, firmografiche, comportamentali, engagement) — 8 SP — AI/ML — 📋 TODO
- [ ] T-1308 — Training ensemble XGBoost + neural network con hyperparameter tuning — 8 SP — AI/ML — 📋 TODO
- [ ] T-1309 — Framework valutazione modelli (AUC, precision/recall, calibration, feature importance) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1310 — API endpoint lead score (POST /ai/lead-score, batch scoring, caching) — 3 SP — Backend — 📋 TODO
- [ ] T-1311 — Explainability lead score: top 5 fattori contributivi per ogni prediction — 5 SP — AI/ML — 📋 TODO
- [ ] T-1312 — Widget UI lead score nel profilo contatto (score gauge, trend, top factors) — 5 SP — Frontend — 📋 TODO
- [ ] T-1313 — Deal scoring rule engine (regole configurabili: budget, timeline, decision maker, competition) — 5 SP — Backend — 📋 TODO
- [ ] T-1314 — Visualizzazione deal score nella pipeline kanban (badge score, colore semaforo) — 3 SP — Frontend — 📋 TODO
- [ ] T-1315 — Storage modelli versionati su S3 (upload, download, lifecycle policy) — 3 SP — Backend — 📋 TODO
- [ ] T-1316 — Framework base A/B testing modelli (champion/challenger, traffic split, metriche comparazione) — 5 SP — AI/ML — 📋 TODO
- [ ] T-1317 — Servizio metering token e costi AI (tracking chiamate API, token consumati, costi per tenant) — 5 SP — Backend — 📋 TODO
- [ ] T-1318 — Test integrazione pipeline AI (feature computation, scoring, model serving) — 3 SP — AI/ML — 📋 TODO
- [ ] T-1319 — Test integrazione API lead score e deal score — 3 SP — Backend — 📋 TODO

**Totale:** 85 SP — 19 item

---

## Dipendenze Esterne

| Dipendenza | Owner | Stato | Note |
|------------|-------|-------|------|
| Cluster Kafka configurato per eventi CRM (o alternativa Redis Streams) | DevOps | 📋 TODO | Necessario per T-1305 |
| Bucket S3 (o MinIO) per storage modelli ML | DevOps | 📋 TODO | Necessario per T-1315 |
| GPU instance per training modelli (almeno T4) o accesso a servizio ML managed | DevOps | 📋 TODO | Necessario per T-1308 |
| Dati storici CRM sufficienti per training (min 10k lead con outcome noto) | Data Team | 📋 TODO | Necessario per T-1306; generare dati sintetici se insufficienti |
| Redis cluster con memoria sufficiente per feature store (stima 2GB) | DevOps | 📋 TODO | Necessario per T-1303 |

---

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Dati storici insufficienti o di scarsa qualità per training lead scoring affidabile | Alta | Alto | Preparare pipeline dati sintetici realistici; implementare monitoring data quality; definire soglia minima dati |
| 2 | Il servizio FastAPI introduce un nuovo stack tecnologico (Python) che il team potrebbe non padroneggiare | Media | Medio | Pair programming con AI/ML engineers; template progetto con best practice; documentare setup e deploy |
| 3 | Latenza feature computation real-time via Kafka potrebbe essere troppo alta per scoring in-line | Media | Alto | Implementare fallback a feature pre-computate; cache aggressivo su Redis; scoring asincrono come alternativa |
| 4 | Il costo GPU per training ricorrente potrebbe superare il budget allocato | Media | Medio | Usare spot instance; schedulare training off-peak; valutare modelli più leggeri se costi eccessivi |

---

## Definition of Done Sprint

- [ ] Servizio FastAPI AI avviabile con Docker, health check funzionante, config esternalizzata
- [ ] Model registry permette CRUD modelli con versioning e tracking stato deploy
- [ ] Feature store online (Redis) serve feature con latenza < 10ms p99
- [ ] Feature store offline (PostgreSQL) contiene feature storiche per almeno 30 giorni
- [ ] Pipeline Kafka computa feature in near-real-time (< 30s dalla generazione evento)
- [ ] Lead scoring model addestrato con AUC > 0.75 su test set
- [ ] API lead score risponde in < 200ms con caching attivo
- [ ] Explainability mostra top 5 fattori con contributo percentuale per ogni prediction
- [ ] Deal scoring rule engine applica regole configurabili correttamente
- [ ] Widget lead score visibile nel profilo contatto con gauge e trend
- [ ] Metering service traccia correttamente token e costi per tenant
- [ ] Tutti i test integrazione passano
- [ ] Nessun errore TypeScript backend (`npx tsc --noEmit` pulito)

---

## Deliverable Attesi

1. **AI Service** — Servizio FastAPI con Docker, model registry, e storage S3
2. **Feature Store** — Dual-layer Redis (online) + PostgreSQL (offline) con pipeline Kafka
3. **Lead Scoring Model** — Ensemble XGBoost + neural network con 50+ feature e explainability
4. **Deal Scoring** — Rule engine configurabile con visualizzazione in pipeline kanban
5. **AI Metering** — Tracking token, costi e usage per tenant

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
