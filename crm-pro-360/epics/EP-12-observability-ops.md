# Epic EP-12: Observability & Operations

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-12 |
| **Titolo** | Observability & Operations |
| **Persona** | Chiara (CTO) |
| **Fase** | 1-4 (Sprint 1-2 setup base, Sprint 16 AI observability, Sprint 19 production hardening) |
| **Story Points Totali** | ~76 SP |
| **Stato** | Draft |
| **Data Creazione** | 2026-03-24 |

---

## Overview

Prometheus + Grafana dashboards operativi, Jaeger distributed tracing, Sentry error tracking, structured logging ECS format, alerting con PagerDuty/OpsGenie integration, SLA monitoring e reporting, capacity planning dashboards, incident management runbooks, status page pubblica.

L'osservabilita' non e' un nice-to-have: e' la differenza tra un team che reagisce agli incidenti e uno che li previene. Questo epic copre i tre pilastri (metriche, trace, log) piu' l'infrastruttura operativa per gestire il sistema in produzione con confidenza.

---

## User Stories

### US-138: Grafana Dashboards Operativi (RED Metrics)

**Come** Chiara (CTO), **voglio** dashboards Grafana con metriche RED (Rate, Errors, Duration) per ogni servizio, **in modo da** avere visibilita' immediata sullo stato di salute del sistema.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 1-2
**Dipendenze:** Nessuna (fondazione)

**Criteri di Accettazione:**

```gherkin
Given il sistema in produzione
When un operatore accede a Grafana
Then vede una dashboard "Overview" con:
  - Request rate per servizio (req/s)
  - Error rate per servizio (% e count)
  - Latenza per servizio (p50, p95, p99)
  - Saturazione risorse (CPU, memory, disk, connections)

Given il sistema con metriche Prometheus attive
When un operatore accede alla dashboard di un servizio specifico
Then vede metriche dettagliate:
  - Rate per endpoint (top 10 piu' chiamati)
  - Error breakdown per status code (4xx vs 5xx)
  - Latency histogram per endpoint
  - Active connections e connection pool usage

Given le dashboards Grafana
When vengono deployate in un nuovo ambiente
Then le dashboards sono provisionabili via JSON/YAML (dashboard-as-code)
  And non richiedono configurazione manuale
  And si auto-connettono alla data source Prometheus corretta

Given un operatore che analizza un problema
When seleziona un time range specifico
Then tutti i pannelli si aggiornano in sync
  And puo' drill-down cliccando su un servizio per vedere il dettaglio
  And puo' confrontare il periodo selezionato con lo stesso periodo precedente
```

---

### US-139: Distributed Tracing con Jaeger

**Come** Chiara (CTO), **voglio** distributed tracing con Jaeger e trace propagation cross-service, **in modo da** diagnosticare latenze e errori che attraversano piu' servizi.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 2-3
**Dipendenze:** US-138

**Criteri di Accettazione:**

```gherkin
Given una richiesta HTTP che attraversa API Gateway -> Backend -> Database -> Cache
When la richiesta viene completata
Then un trace unico collega tutti gli span dei servizi coinvolti
  And ogni span include: servizio, operazione, durata, status, attributi custom

Given il trace context
When una richiesta passa dal frontend al backend
Then il trace ID viene propagato via header W3C Trace Context (traceparent)
  And il backend propaga il context a tutte le chiamate downstream
  And il trace completo e' visibile nella UI di Jaeger

Given un operatore che investiga una richiesta lenta
When cerca il trace per request ID o trace ID in Jaeger
Then vede il waterfall completo con tutti gli span
  And identifica il servizio/operazione che introduce latenza
  And puo' cliccare su ogni span per vedere tag e log associati

Given il sistema in produzione con alto traffico
When il sampling rate e' configurato
Then il campionamento adattivo raccoglie il 100% dei trace con errori
  And campiona l'1% dei trace normali (configurabile)
  And i trace vengono mantenuti per 7 giorni

Given un trace con errore
When un operatore apre il trace in Jaeger
Then lo span con errore e' evidenziato in rosso
  And contiene il messaggio di errore e lo stack trace
  And include link diretto al log correlato (via trace ID)
```

---

### US-140: Sentry Error Tracking

**Come** Chiara (CTO), **voglio** Sentry per il tracking degli errori con source maps e release tracking, **in modo da** identificare e risolvere i bug rapidamente con contesto completo.

**Story Points:** 5
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 1
**Dipendenze:** Nessuna

**Criteri di Accettazione:**

```gherkin
Given un errore non gestito nel backend
When l'eccezione viene catturata da Sentry
Then l'evento include:
  - Stack trace completo con source maps risolte
  - Request context (URL, method, headers, body)
  - User context (userId, tenantId, ruolo)
  - Breadcrumbs (ultimi 20 eventi prima dell'errore)
  - Release version e environment

Given un errore nel frontend (React)
When l'errore viene catturato dall'ErrorBoundary integrato con Sentry
Then l'evento include:
  - Stack trace con source maps (non codice minificato)
  - Component tree path
  - Browser e OS info
  - Replay della sessione (ultimi 60 secondi)

Given la pipeline di deploy
When una nuova release viene deployata
Then le source maps vengono caricate su Sentry automaticamente
  And la release viene taggata con il commit SHA
  And Sentry associa gli errori alla release corretta

Given un errore ricorrente
When lo stesso errore si verifica 10+ volte in 5 minuti
Then Sentry raggruppa gli eventi (fingerprinting)
  And invia un'alerta con la frequenza e l'impatto (utenti coinvolti)
  And l'errore viene marcato come "regression" se era stato risolto in precedenza
```

---

### US-141: Structured Logging ECS Format con Correlation ID

**Come** Chiara (CTO), **voglio** log strutturati in formato ECS con correlation ID, **in modo da** correlare log tra servizi e abilitare query efficaci in Elasticsearch/Loki.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 2
**Dipendenze:** Nessuna

**Criteri di Accettazione:**

```gherkin
Given ogni richiesta HTTP in ingresso
When la richiesta viene processata
Then viene generato un correlation ID unico (UUID v4) se non presente nell'header X-Correlation-ID
  And il correlation ID viene propagato a tutti i log generati durante la richiesta
  And il correlation ID viene restituito nell'header di risposta

Given un log emesso da qualsiasi servizio
When viene scritto su stdout
Then e' in formato JSON ECS (Elastic Common Schema):
  - @timestamp (ISO 8601)
  - log.level (debug, info, warn, error)
  - message
  - service.name
  - trace.id (correlation ID)
  - event.action (per audit log)
  - error.* (per errori: type, message, stack_trace)
  - http.* (per request log: method, url, status_code, response_time)

Given log di servizi diversi con lo stesso correlation ID
When un operatore cerca per correlation ID in Loki/Elasticsearch
Then trova tutti i log correlati alla stessa richiesta
  And puo' ricostruire il percorso completo della richiesta

Given i livelli di log configurabili per ambiente
When il sistema e' in produzione
Then il livello minimo e' "info" (no debug)
  And i log PII-sensitive sono mascherati (email -> ***@***.com)
  And i log vengono ruotati automaticamente (retention 30 giorni)

Given un'operazione sensibile (login, cambio password, accesso dati)
When l'operazione viene completata
Then viene emesso un audit log con event.action specifico
  And include: utente, risorsa, azione, risultato, IP, timestamp
```

---

### US-142: Alerting Rules con Escalation

**Come** Chiara (CTO), **voglio** regole di alerting con escalation automatica verso PagerDuty/OpsGenie, **in modo da** garantire che gli incidenti vengano gestiti rapidamente anche fuori orario.

**Story Points:** 8
**Priorita:** 🔴 Alta
**Sprint Target:** Sprint 3-4
**Dipendenze:** US-138

**Criteri di Accettazione:**

```gherkin
Given le metriche Prometheus raccolte
When l'error rate di un servizio supera il 5% per 5 minuti
Then Alertmanager attiva un alert di severita' "warning"
  And invia notifica su Slack nel canale #ops-alerts
  And se il problema persiste per 15 minuti, scala a "critical" e notifica PagerDuty

Given un alert critico attivato
When PagerDuty riceve la notifica
Then crea un incident e chiama il reperibile secondo la schedule configurata
  And se il reperibile non risponde entro 10 minuti, scala al backup
  And se il backup non risponde entro 10 minuti, scala al team lead

Given le regole di alerting
When vengono definite nel codice (alerts-as-code)
Then sono versionabili in Git
  And includono: nome, espressione PromQL, soglie, severita', runbook link
  And vengono deployate automaticamente via CI/CD

Given un operatore che riceve un alert
When apre l'alert in PagerDuty/OpsGenie
Then trova un link diretto alla dashboard Grafana con il time range dell'anomalia
  And un link al runbook specifico per quel tipo di problema
  And il correlation ID (se disponibile) per cercare log e trace

Given un falso positivo ricorrente
When un operatore mette in mute un alert
Then il mute ha una durata massima (default: 4 ore)
  And viene loggato nell'audit trail con motivazione
  And scaduto il mute, l'alert torna attivo automaticamente
```

---

### US-143: SLA Monitoring Dashboard

**Come** Chiara (CTO), **voglio** una dashboard per il monitoraggio degli SLA (uptime, latenza, error rate), **in modo da** verificare il rispetto degli SLO/SLA e generare report per gli stakeholder.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 6-7
**Dipendenze:** US-138

**Criteri di Accettazione:**

```gherkin
Given il sistema con SLO definiti
When un operatore accede alla SLA dashboard
Then vede per ogni servizio:
  - Uptime corrente (rolling 30 giorni) con target SLO (es. 99.9%)
  - Error budget rimanente (es. "43 minuti di downtime rimasti questo mese")
  - Latenza p95 vs target SLO (es. < 200ms)
  - Trend settimanale e mensile

Given la fine del mese
When il sistema genera il report SLA
Then produce un documento con:
  - Uptime effettivo vs SLO per ogni servizio
  - Numero e durata degli incidenti
  - MTTR (Mean Time to Resolution) medio
  - Error budget consumato vs totale
  And il report e' disponibile in PDF e via API

Given un SLO che sta per essere violato
When l'error budget scende sotto il 20%
Then il sistema invia un alert "error budget burn rate elevato"
  And la dashboard evidenzia il servizio in giallo
  And quando l'error budget raggiunge 0%, il servizio viene evidenziato in rosso

Given un operatore che analizza un incident
When seleziona un periodo di downtime nella timeline
Then vede i dettagli: inizio, fine, durata, servizi impattati
  And puo' linkare il post-mortem corrispondente
```

---

### US-144: Capacity Planning Dashboard

**Come** Chiara (CTO), **voglio** una dashboard per il capacity planning (CPU, memoria, disco, connessioni), **in modo da** prevedere quando sara' necessario scalare le risorse.

**Story Points:** 5
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 8
**Dipendenze:** US-138

**Criteri di Accettazione:**

```gherkin
Given il sistema con metriche storiche di almeno 30 giorni
When un operatore accede alla capacity planning dashboard
Then vede per ogni risorsa (CPU, RAM, disk, DB connections, Redis memory):
  - Utilizzo attuale (%)
  - Trend ultimi 30 giorni
  - Proiezione lineare: "al ritmo attuale, saturazione in X giorni"
  - Soglia di warning (70%) e critica (85%)

Given una risorsa che supera la soglia di warning (70%)
When la proiezione indica saturazione entro 14 giorni
Then il sistema genera un alert "capacity-warning"
  And la dashboard mostra una raccomandazione: "Scalare verticalmente" o "Aggiungere replica"

Given un operatore che pianifica la crescita
When visualizza la dashboard "Growth Forecast"
Then vede correlazioni tra metriche di business (utenti, tenant, email processate)
  e consumo risorse
  And puo' simulare scenari: "se aggiungiamo 100 tenant, quanto storage serve?"

Given la dashboard provisioned as code
When viene deployata
Then tutti i pannelli usano variabili template per ambiente e cluster
  And le query PromQL sono ottimizzate (recording rules per query pesanti)
```

---

### US-145: Incident Management Runbooks

**Come** Chiara (CTO), **voglio** runbooks per almeno 10 scenari di incident, **in modo da** standardizzare la risposta agli incidenti e ridurre il MTTR.

**Story Points:** 8
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 10-11
**Dipendenze:** US-138, US-139, US-141, US-142

**Criteri di Accettazione:**

```gherkin
Given un set di 10+ scenari di incident comuni
When i runbooks vengono redatti
Then ogni runbook include:
  - Titolo e severita' dell'incident
  - Sintomi: come l'incidente si manifesta (alert, metriche, user report)
  - Diagnosi: step-by-step per identificare la root cause
  - Risoluzione: azioni correttive ordinate per probabilita' di successo
  - Escalation: quando e a chi scalare
  - Post-mortem template

Given i 10 scenari minimi coperti:
  1. Database connection pool esaurito
  2. Redis down o unreachable
  3. Alto error rate API (> 5%)
  4. Latenza API degradata (p95 > 1s)
  5. Disk space esaurito
  6. Memory leak in un servizio
  7. Certificate TLS in scadenza
  8. Email delivery failure (SendGrid down)
  9. AI model timeout o rate limit
  10. Deployment fallito (rollback procedure)
When un operatore affronta uno di questi scenari
Then segue il runbook linkato nell'alert
  And il runbook e' accessibile direttamente dalla notifica PagerDuty/OpsGenie

Given un incidente risolto
When il team esegue il post-mortem
Then usa il template standard: timeline, root cause, impatto, azioni correttive
  And il post-mortem viene archiviato e linkato al runbook per migliorarlo

Given i runbooks nel repository
When vengono aggiornati
Then sono versionabili in Git (formato Markdown)
  And ogni runbook ha un campo "last_verified" con data dell'ultima verifica
  And i runbook non verificati da 90+ giorni generano un reminder automatico
```

---

### US-146: Status Page Pubblica

**Come** Chiara (CTO), **voglio** una status page pubblica, **in modo da** comunicare proattivamente lo stato del sistema ai clienti e ridurre il carico sul supporto durante gli incidenti.

**Story Points:** 5
**Priorita:** 🟢 Bassa
**Sprint Target:** Sprint 12
**Dipendenze:** US-138, US-142

**Criteri di Accettazione:**

```gherkin
Given la status page pubblica (status.crmpro360.com)
When un utente accede alla pagina
Then vede lo stato di ogni componente:
  - API (operational, degraded, major outage)
  - Frontend Web App
  - Email Processing
  - AI Services
  - Database
  And vede l'uptime degli ultimi 90 giorni per componente

Given un incidente in corso
When un operatore crea un incident nella status page
Then gli utenti iscritti ricevono notifica (email, webhook, RSS)
  And la pagina mostra: titolo, impatto, stato (investigating, identified, monitoring, resolved)
  And gli aggiornamenti vengono pubblicati in ordine cronologico

Given un sistema di health check automatico
When un health check fallisce per 3 check consecutivi (intervallo: 30 secondi)
Then lo stato del componente cambia automaticamente
  And viene creato un incident draft per review dell'operatore

Given un utente che vuole ricevere notifiche
When si iscrive alla status page
Then puo' scegliere: email, webhook, RSS
  And puo' selezionare i componenti di interesse
  And riceve solo le notifiche per i componenti selezionati

Given la manutenzione programmata
When un operatore schedula una maintenance window
Then la status page mostra il banner con data, ora e durata prevista
  And gli iscritti ricevono notifica 24 ore prima e all'inizio della manutenzione
```

---

### US-147: AI Model Observability

**Come** Chiara (CTO), **voglio** metriche di osservabilita' specifiche per i modelli AI (drift, accuracy, costo per inference), **in modo da** monitorare la qualita' e i costi del layer AI in produzione.

**Story Points:** 13
**Priorita:** 🟡 Media
**Sprint Target:** Sprint 16
**Dipendenze:** US-138

**Criteri di Accettazione:**

```gherkin
Given il sistema AI in produzione
When un operatore accede alla dashboard "AI Observability"
Then vede le metriche per ogni modello/provider:
  - Numero di inferenze (rate/min)
  - Latenza per inference (p50, p95, p99)
  - Token usage (input e output, media per richiesta)
  - Costo stimato per inference e cumulativo giornaliero/mensile
  - Error rate e tipi di errore (timeout, rate limit, invalid response)

Given un modello con metriche storiche
When l'operatore analizza il tab "Quality"
Then vede indicatori di drift:
  - Distribuzione delle confidence scores nel tempo
  - Lunghezza media delle risposte (anomalie = possibile degradation)
  - Feedback utente (thumbs up/down) trend
  - Confronto metriche per release/prompt version

Given il costo AI che supera il budget giornaliero
When il costo stimato supera la soglia configurata (es. 50 EUR/giorno)
Then il sistema invia un alert con breakdown dei costi per modello e operazione
  And la dashboard evidenzia il componente piu' costoso
  And suggerisce ottimizzazioni (caching, model downgrade per operazioni semplici)

Given un modello che mostra drift significativo
When la confidence media scende sotto la soglia (es. 0.6 per 24 ore)
Then il sistema genera un alert "model-drift-detected"
  And logga campioni rappresentativi per analisi (senza PII)
  And suggerisce di rivedere i prompt o valutare un modello alternativo

Given un operatore che confronta modelli
When seleziona due modelli/prompt versions
Then vede un confronto side-by-side: latenza, costo, quality score
  And puo' eseguire un A/B test controllato con traffic split configurabile
```

---

## Riepilogo Story Points

| Story | Titolo | SP | Priorita | Sprint |
|-------|--------|----|----------|--------|
| US-138 | Grafana Dashboards Operativi | 8 | 🔴 Alta | 1-2 |
| US-139 | Distributed Tracing con Jaeger | 8 | 🔴 Alta | 2-3 |
| US-140 | Sentry Error Tracking | 5 | 🔴 Alta | 1 |
| US-141 | Structured Logging ECS Format | 8 | 🔴 Alta | 2 |
| US-142 | Alerting Rules con Escalation | 8 | 🔴 Alta | 3-4 |
| US-143 | SLA Monitoring Dashboard | 8 | 🟡 Media | 6-7 |
| US-144 | Capacity Planning Dashboard | 5 | 🟡 Media | 8 |
| US-145 | Incident Management Runbooks | 8 | 🟡 Media | 10-11 |
| US-146 | Status Page Pubblica | 5 | 🟢 Bassa | 12 |
| US-147 | AI Model Observability | 13 | 🟡 Media | 16 |
| **Totale** | | **76** | | |

---

## Task Breakdown

### Metriche e Dashboards (US-138, US-143, US-144)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1000 | Configurare Prometheus: service discovery, scrape config, retention policy | 6 | DevOps | US-138 |
| T-1001 | Instrumentare backend NestJS con `prom-client`: HTTP metrics, custom counters | 8 | Backend Dev | US-138 |
| T-1002 | Instrumentare frontend Next.js con Web Vitals e custom metrics | 6 | Frontend Dev | US-138 |
| T-1003 | Creare Grafana dashboard "System Overview" con RED metrics (JSON provisioning) | 8 | DevOps | US-138 |
| T-1004 | Creare Grafana dashboard per-service con drill-down per endpoint | 6 | DevOps | US-138 |
| T-1005 | Configurare recording rules PromQL per query pesanti | 4 | DevOps | US-138 |
| T-1006 | Creare dashboard SLA con error budget tracking (burn rate SLI) | 8 | DevOps | US-143 |
| T-1007 | Implementare SLA report generator (PDF via Puppeteer/wkhtmltopdf) | 6 | Backend Dev | US-143 |
| T-1008 | Creare API endpoint per SLO data export (JSON/CSV) | 4 | Backend Dev | US-143 |
| T-1009 | Creare dashboard Capacity Planning con proiezioni lineari | 6 | DevOps | US-144 |
| T-1010 | Implementare growth simulator (what-if scenarios basati su metriche storiche) | 8 | Backend Dev | US-144 |

### Distributed Tracing (US-139)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1011 | Deployare Jaeger (all-in-one per dev, collector + storage per prod) | 6 | DevOps | US-139 |
| T-1012 | Integrare OpenTelemetry SDK nel backend NestJS (auto-instrumentation) | 8 | Backend Dev | US-139 |
| T-1013 | Configurare trace context propagation (W3C headers) cross-service | 4 | Backend Dev | US-139 |
| T-1014 | Aggiungere span personalizzati per operazioni business-critical | 6 | Backend Dev | US-139 |
| T-1015 | Configurare sampling adattivo (100% errori, 1% normali) | 4 | DevOps | US-139 |
| T-1016 | Integrare link Jaeger nelle dashboard Grafana (exemplars) | 4 | DevOps | US-139 |

### Error Tracking (US-140)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1017 | Configurare Sentry project per backend e frontend | 4 | DevOps | US-140 |
| T-1018 | Integrare Sentry SDK nel backend NestJS con context enrichment | 6 | Backend Dev | US-140 |
| T-1019 | Integrare Sentry SDK nel frontend React con ErrorBoundary e session replay | 6 | Frontend Dev | US-140 |
| T-1020 | Configurare source map upload nella CI/CD pipeline | 4 | DevOps | US-140 |
| T-1021 | Configurare alerting Sentry (Slack + email per nuovi issue e regression) | 3 | DevOps | US-140 |

### Structured Logging (US-141)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1022 | Implementare logger ECS-compatible (winston o pino con ECS formatter) | 6 | Backend Dev | US-141 |
| T-1023 | Implementare middleware correlation ID (genera/propaga X-Correlation-ID) | 4 | Backend Dev | US-141 |
| T-1024 | Aggiungere PII masking al logger (email, phone, IP per GDPR) | 6 | Backend Dev | US-141 |
| T-1025 | Configurare log aggregation (Loki o Elasticsearch) con retention 30 giorni | 6 | DevOps | US-141 |
| T-1026 | Implementare audit log per operazioni sensibili (login, data access, config changes) | 8 | Backend Dev | US-141 |
| T-1027 | Creare dashboard Grafana per log exploration (filtro per correlation ID, servizio, livello) | 4 | DevOps | US-141 |

### Alerting e Incident Management (US-142, US-145)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1028 | Configurare Alertmanager con routing rules (warning -> Slack, critical -> PagerDuty) | 6 | DevOps | US-142 |
| T-1029 | Definire alert rules PromQL per tutti i servizi (alerts-as-code in YAML) | 8 | DevOps | US-142 |
| T-1030 | Integrare PagerDuty/OpsGenie con escalation policy (reperibile -> backup -> lead) | 4 | DevOps | US-142 |
| T-1031 | Implementare silence/mute management con audit trail | 4 | DevOps | US-142 |
| T-1032 | Aggiungere runbook link in ogni alert rule (annotation) | 2 | DevOps | US-142 |
| T-1033 | Scrivere runbook: Database connection pool esaurito | 3 | SRE | US-145 |
| T-1034 | Scrivere runbook: Redis down o unreachable | 3 | SRE | US-145 |
| T-1035 | Scrivere runbook: Alto error rate API (> 5%) | 3 | SRE | US-145 |
| T-1036 | Scrivere runbook: Latenza API degradata (p95 > 1s) | 3 | SRE | US-145 |
| T-1037 | Scrivere runbook: Disk space esaurito | 2 | SRE | US-145 |
| T-1038 | Scrivere runbook: Memory leak in un servizio | 3 | SRE | US-145 |
| T-1039 | Scrivere runbook: Certificate TLS in scadenza | 2 | SRE | US-145 |
| T-1040 | Scrivere runbook: Email delivery failure (SendGrid) | 3 | SRE | US-145 |
| T-1041 | Scrivere runbook: AI model timeout/rate limit | 3 | SRE | US-145 |
| T-1042 | Scrivere runbook: Deployment fallito (rollback) | 3 | SRE | US-145 |
| T-1043 | Creare post-mortem template e processo di review | 4 | SRE | US-145 |

### Status Page e AI Observability (US-146, US-147)

| Task ID | Descrizione | Ore | Ruolo | Story |
|---------|-------------|-----|-------|-------|
| T-1044 | Valutare e deployare status page (Statuspage.io vs Cachet vs custom) | 6 | DevOps | US-146 |
| T-1045 | Implementare health check automatici per ogni componente | 6 | Backend Dev | US-146 |
| T-1046 | Configurare auto-update stato basato su health check (con delay anti-flap) | 4 | DevOps | US-146 |
| T-1047 | Implementare subscription system (email, webhook, RSS) per status updates | 6 | Backend Dev | US-146 |
| T-1048 | Implementare maintenance window scheduling con notifiche | 4 | Backend Dev | US-146 |
| T-1049 | Instrumentare AI layer con metriche custom (token usage, latency, cost) | 8 | Backend Dev | US-147 |
| T-1050 | Creare Grafana dashboard "AI Observability" (costo, performance, quality) | 8 | DevOps | US-147 |
| T-1051 | Implementare drift detection (confidence score monitoring, output distribution) | 10 | Backend Dev | US-147 |
| T-1052 | Implementare cost tracking e budget alerting per AI inference | 6 | Backend Dev | US-147 |
| T-1053 | Implementare A/B test framework per modelli/prompt versions | 8 | Backend Dev | US-147 |

---

## Riepilogo Task

| Area | Task | Ore Totali |
|------|------|------------|
| Metriche e Dashboards | T-1000 - T-1010 | 70 |
| Distributed Tracing | T-1011 - T-1016 | 32 |
| Error Tracking | T-1017 - T-1021 | 23 |
| Structured Logging | T-1022 - T-1027 | 34 |
| Alerting e Incident Mgmt | T-1028 - T-1043 | 56 |
| Status Page e AI Obs. | T-1044 - T-1053 | 66 |
| **Totale** | **54 task** | **281 ore** |

---

## Technical Design Notes

### PromQL Query Patterns

**RED Metrics per servizio:**
```promql
# Rate - request rate per servizio
sum(rate(http_request_duration_seconds_count{service="$service"}[5m])) by (handler)

# Errors - error rate percentuale
sum(rate(http_request_duration_seconds_count{service="$service", status_code=~"5.."}[5m]))
/
sum(rate(http_request_duration_seconds_count{service="$service"}[5m])) * 100

# Duration - latenza p95
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="$service"}[5m])) by (le, handler))
```

**Error Budget Burn Rate:**
```promql
# SLO 99.9% = 0.1% error budget
# Burn rate: quante volte piu' veloce del budget si stanno consumando gli errori
(
  1 - (
    sum(rate(http_request_duration_seconds_count{status_code!~"5.."}[1h]))
    /
    sum(rate(http_request_duration_seconds_count[1h]))
  )
) / (1 - 0.999)
```

**Capacity Projection:**
```promql
# Proiezione lineare: quando la risorsa raggiungera' l'80%?
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[7d], 30*24*3600) < 0
```

### Grafana Dashboard Provisioning as Code

Tutte le dashboard vengono gestite come JSON/YAML in Git e deployate automaticamente:

```
monitoring/
  grafana/
    dashboards/
      overview.json
      per-service.json
      sla.json
      capacity.json
      ai-observability.json
    datasources/
      prometheus.yaml
      jaeger.yaml
      loki.yaml
    provisioning/
      dashboards.yaml
      datasources.yaml
  prometheus/
    prometheus.yml
    rules/
      recording.yml
      alerting.yml
  alertmanager/
    alertmanager.yml
```

**CI/CD Integration:**
- Le dashboard vengono validate con `grafana-dashboard-linter` nel pipeline
- Le alert rules vengono testate con `promtool check rules`
- Il deploy e' idempotente (Grafana provisioning API o config reload)

### Runbook Automation

Ogni runbook e' un file Markdown con sezioni standard:

```markdown
# Runbook: [Titolo]

## Severita': P1/P2/P3
## Ultima Verifica: YYYY-MM-DD

## Sintomi
- Alert: `AlertName`
- Dashboard: [link]
- Comportamento utente: ...

## Diagnosi
1. Verifica metrica X: `promql_query`
2. Controlla log: `query_loki`
3. Verifica stato servizio: `kubectl get pods`

## Risoluzione
### Opzione A (piu' probabile): ...
### Opzione B: ...
### Opzione C (escalation): ...

## Escalation
- Se non risolto in 30 min -> chiama [ruolo]
- Se impatto su > 50% utenti -> attiva incident commander

## Post-Incident
- [ ] Compilare post-mortem template
- [ ] Review con il team entro 48 ore
- [ ] Aggiornare runbook se necessario
```

---

## Rischi

| ID | Rischio | Probabilita | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-12.1 | Overhead di performance dell'instrumentation (tracing + metrics) che degrada le prestazioni | Media | Medio | Sampling adattivo per i trace. Benchmark prima/dopo ogni aggiunta di instrumentation. Budget: max 2% overhead su latenza p95. |
| R-12.2 | Alert fatigue - troppi alert generano desensibilizzazione del team | Alta | Alto | Iniziare con pochi alert ad alta confidenza. Review settimanale degli alert: eliminare falsi positivi, affinare soglie. Misurare signal-to-noise ratio. |
| R-12.3 | Costi di storage per metriche, log e trace che crescono in modo imprevedibile | Media | Medio | Definire retention policy chiare (metriche: 90gg, log: 30gg, trace: 7gg). Monitorare i costi dello storage stesso. Compressione e downsampling per dati storici. |
| R-12.4 | Runbooks che diventano obsoleti rapidamente e non vengono aggiornati | Alta | Medio | Campo "last_verified" con reminder automatico ogni 90 giorni. Post-mortem obbligatorio aggiorna il runbook. Assegnare un owner per ogni runbook. |
| R-12.5 | Vendor lock-in su PagerDuty/OpsGenie/Sentry con costi crescenti | Bassa | Medio | Usare abstraction layer (OpenTelemetry per tracing, Alertmanager per routing). Documentare le alternative per ogni componente. |
| R-12.6 | AI model observability incompleta - metriche di qualita' soggettive e difficili da automatizzare | Alta | Alto | Combinare metriche automatiche (confidence, latenza) con feedback utente esplicito. Campionamento manuale periodico per validare le metriche automatiche. Non affidarsi solo ai numeri. |
| R-12.7 | Status page che non riflette la realta' (stati manuali non aggiornati durante incident) | Media | Alto | Automatizzare il piu' possibile con health check. Processo di incident che include aggiornamento status page come step obbligatorio. Alert se lo stato manuale e automatico divergono. |

---

## Definition of Done

1. Prometheus raccoglie metriche da tutti i servizi con scrape interval <= 15 secondi.
2. Grafana dashboard "Overview" mostra RED metrics per tutti i servizi con dati reali.
3. Dashboard provisioned as code: deploy in un nuovo ambiente in < 5 minuti senza configurazione manuale.
4. Jaeger raccoglie trace distribuiti con propagazione cross-service funzionante.
5. Sampling adattivo configurato: 100% errori, 1% normali (configurabile per ambiente).
6. Sentry cattura errori backend e frontend con source maps risolte e session replay.
7. Tutti i log sono in formato ECS JSON con correlation ID propagato end-to-end.
8. PII masking attivo nel logger: nessun dato sensibile nei log in chiaro.
9. Alert rules definite come codice (YAML in Git) con test via `promtool`.
10. Escalation funzionante: alert critico -> Slack -> PagerDuty -> reperibile -> backup -> lead.
11. 10 runbooks scritti, verificati e linkati negli alert.
12. Status page pubblica operativa con health check automatici e subscription.
13. Dashboard AI Observability mostra: costo per inference, latenza, drift indicators.
14. SLA dashboard mostra uptime e error budget con report mensile generabile.
15. Overhead dell'instrumentation < 2% su latenza p95 (validato con benchmark).
