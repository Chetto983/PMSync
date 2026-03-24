# 02 — Architettura CRM Pro 360

> Documento di architettura enterprise per CRM Pro 360 — piattaforma CRM AI-powered
> destinata a mid-enterprise europee. Copre l'analisi cross-layer e l'architettura target.

---

## Parte I — Cross-Layer Analysis

### 1. API Contract Management

Gestione centralizzata dei contratti API tramite OpenAPI 3.1 con pipeline di code generation automatizzata.

**Pipeline di generazione:**

1. I team backend definiscono gli endpoint in file `.yaml` OpenAPI 3.1 nella cartella `contracts/`.
2. Un job CI (`contract-codegen`) esegue la validazione dello schema e genera:
   - **Client TypeScript** per il frontend React (via `openapi-typescript-codegen`).
   - **DTO NestJS** per il backend Node (via template Handlebars custom).
   - **Pydantic models** per i servizi FastAPI (via `datamodel-code-generator`).
3. I pacchetti generati vengono pubblicati su un registry npm/PyPI privato.
4. Breaking change detection tramite `openapi-diff` in CI — qualsiasi modifica incompatibile blocca il merge.

**Versionamento:** ogni servizio espone la versione API nell'URL (`/api/v1/`, `/api/v2/`). Le versioni deprecate restano attive per 6 mesi con header `Sunset`.

**Struttura repository contratti:**

```
contracts/
├── crm-core/
│   ├── contacts.yaml
│   ├── deals.yaml
│   └── activities.yaml
├── ai-services/
│   ├── predictions.yaml
│   └── recommendations.yaml
├── billing/
│   └── subscriptions.yaml
└── shared/
    ├── error-model.yaml
    └── pagination.yaml
```

---

### 2. Error Model: Backend → API → Frontend

Modello di errore unificato che attraversa tutti i layer. Ogni errore è strutturato come:

```json
{
  "error": {
    "code": "CRM-4001",
    "message": "Il contatto non è stato trovato",
    "detail": "Contact with ID 'abc-123' does not exist in tenant 'acme-corp'",
    "requestId": "req_7f3a2b1c",
    "timestamp": "2026-03-24T10:30:00Z",
    "path": "/api/v1/contacts/abc-123",
    "meta": {}
  }
}
```

**Tabella codici di errore:**

| Codice | HTTP Status | Categoria | Descrizione (IT) | Origine |
|--------|-------------|-----------|-------------------|---------|
| `CRM-1001` | 500 | Internal | Errore interno del server | Backend |
| `CRM-1002` | 503 | Availability | Servizio temporaneamente non disponibile | Backend |
| `CRM-1003` | 504 | Timeout | Timeout nella comunicazione tra servizi | Gateway |
| `CRM-2001` | 401 | Auth | Token di autenticazione mancante o scaduto | Gateway |
| `CRM-2002` | 403 | Auth | Permessi insufficienti per questa operazione | Backend |
| `CRM-2003` | 401 | Auth | Refresh token invalido o revocato | Auth Service |
| `CRM-2004` | 403 | Tenant | Accesso negato al tenant richiesto | Middleware |
| `CRM-3001` | 400 | Validation | Dati di input non validi | Backend |
| `CRM-3002` | 409 | Conflict | Conflitto di concorrenza — risorsa modificata | Backend |
| `CRM-3003` | 422 | Business | Violazione regola di business | Backend |
| `CRM-3004` | 400 | Validation | Formato file non supportato | Backend |
| `CRM-4001` | 404 | NotFound | Risorsa non trovata | Backend |
| `CRM-4002` | 410 | Gone | Risorsa eliminata definitivamente | Backend |
| `CRM-5001` | 429 | RateLimit | Limite di richieste superato — tier base | Gateway |
| `CRM-5002` | 429 | RateLimit | Limite di richieste superato — tier AI | Gateway |
| `CRM-6001` | 402 | Billing | Crediti AI esauriti | Billing Service |
| `CRM-6002` | 402 | Billing | Piano non sufficiente per questa funzionalità | Billing Service |
| `CRM-7001` | 500 | AI | Modello AI non disponibile | AI Service |
| `CRM-7002` | 422 | AI | Input troppo lungo per il modello | AI Service |
| `CRM-7003` | 500 | AI | Risposta del modello non parsabile | AI Service |

**Mappatura frontend:** il client React intercetta gli errori nel layer API (`apiClient` interceptor) e li traduce in notifiche utente localizzate tramite un dizionario `error-codes → i18n key`.

---

### 3. Authentication Flow

Flusso completo di autenticazione: login, emissione token, refresh e revoca.

```mermaid
sequenceDiagram
    participant U as Browser/App
    participant G as Kong Gateway
    participant A as Auth Service
    participant R as Redis Session Store
    participant DB as PostgreSQL

    Note over U,DB: Login Flow
    U->>G: POST /auth/login {email, password, tenantSlug}
    G->>A: Forward (rate-limit checked)
    A->>DB: SELECT user WHERE email = ? AND tenant = ?
    DB-->>A: User record + hashed password
    A->>A: bcrypt.compare(password, hash)
    A->>R: SETEX session:{sessionId} 86400 {userId, tenantId, roles}
    A->>A: Sign JWT access token (15 min TTL)
    A->>A: Sign JWT refresh token (7 day TTL)
    A-->>G: 200 {accessToken, refreshToken, expiresIn}
    G-->>U: Set-Cookie: refresh_token (HttpOnly, Secure, SameSite=Strict)

    Note over U,DB: Authenticated Request
    U->>G: GET /api/v1/contacts (Authorization: Bearer {accessToken})
    G->>G: Validate JWT signature + expiry
    G->>G: Extract tenantId, inject X-Tenant-ID header
    G->>A: Forward to upstream service

    Note over U,DB: Token Refresh
    U->>G: POST /auth/refresh (Cookie: refresh_token)
    G->>A: Forward
    A->>R: GET session:{tokenJti}
    R-->>A: Session data (or nil if revoked)
    A->>A: Validate refresh token + session exists
    A->>A: Rotate: new access + refresh token pair
    A->>R: DEL old session, SETEX new session
    A-->>G: 200 {accessToken, refreshToken, expiresIn}
    G-->>U: Set-Cookie: new refresh_token

    Note over U,DB: Logout / Revoke
    U->>G: POST /auth/logout (Cookie: refresh_token)
    G->>A: Forward
    A->>R: DEL session:{sessionId}
    A->>R: SADD blacklist:{userId} {tokenJti} EX 900
    A-->>G: 204 No Content
    G-->>U: Clear-Cookie: refresh_token
```

**Dettagli implementativi:**
- Access token: JWT RS256, TTL 15 minuti, contiene `sub`, `tenantId`, `roles[]`, `jti`.
- Refresh token: JWT RS256, TTL 7 giorni, ruotato ad ogni utilizzo (rotation strategy).
- Blacklist: gestita in Redis con TTL pari alla durata residua dell'access token.
- MFA: supportato via TOTP (Google Authenticator) come step aggiuntivo post-password.

---

### 4. Tenant Context Propagation

Propagazione del contesto tenant dal header HTTP fino all'interfaccia utente, garantendo isolamento totale dei dati.

```mermaid
flowchart LR
    A[Client Request] -->|Authorization: Bearer JWT| B[Kong Gateway]
    B -->|Decode JWT, extract tenantId| C{Token valido?}
    C -->|No| D[401 Unauthorized]
    C -->|Si| E[Inject X-Tenant-ID header]
    E --> F[NestJS TenantMiddleware]
    F -->|Validate tenantId exists in DB| G{Tenant attivo?}
    G -->|No| H[403 CRM-2004]
    G -->|Si| I[Set AsyncLocalStorage context]
    I --> J[Service Layer]
    J -->|tenantId from context| K[Prisma Middleware]
    K -->|Auto-inject WHERE tenantId = ?| L[(PostgreSQL + Citus)]
    L -->|Shard by tenantId| M[Tenant Shard Node]
    M -->|Response data| N[API Response]
    N -->|X-Tenant-ID in response header| O[Frontend]
    O -->|Store in Zustand tenantStore| P[UI Components]
    P -->|Render tenant-specific branding| Q[User Interface]
```

**Garanzie di isolamento:**
- Prisma middleware inietta automaticamente `tenantId` in ogni query (SELECT, INSERT, UPDATE, DELETE).
- Citus distribuisce i dati su shard dedicati per tenant, usando `tenantId` come distribution column.
- Row-Level Security (RLS) attivo su PostgreSQL come secondo livello di protezione.
- Il frontend mantiene il `tenantId` corrente in uno Zustand store e lo include in ogni richiesta API.

---

### 5. Observability: Correlation ID Propagation

Propagazione end-to-end dell'identificativo di correlazione per tracciabilità completa delle richieste.

**Strategia di propagazione:**

| Layer | Header/Campo | Generazione | Formato |
|-------|-------------|-------------|---------|
| Kong Gateway | `X-Request-ID` | Generato se assente | UUIDv4 |
| Kong Gateway | `X-Correlation-ID` | Propagato dal client o generato | UUIDv4 |
| NestJS Backend | `correlationId` (log field) | Estratto da header | UUIDv4 |
| FastAPI Services | `correlation_id` (log field) | Estratto da header | UUIDv4 |
| Kafka Messages | `headers.correlationId` | Copiato dal contesto | UUIDv4 |
| Frontend | `x-correlation-id` (request header) | Generato per sessione utente | UUIDv4 |
| Sentry | `tags.correlationId` | Estratto dal contesto | UUIDv4 |
| Jaeger | `traceId` (OpenTelemetry) | Auto-generato, linkato | Hex 32 chars |

**Implementazione NestJS:**

```typescript
// correlation.middleware.ts
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    const store = { correlationId, tenantId: req.headers['x-tenant-id'] };
    asyncLocalStorage.run(store, () => {
      res.setHeader('X-Correlation-ID', correlationId);
      next();
    });
  }
}
```

**Logging strutturato:** tutti i servizi emettono log JSON con campi `correlationId`, `tenantId`, `service`, `traceId` — aggregati in Elasticsearch e queryabili da Grafana.

---

### 6. Cost/Token Accounting: AI Call → Billing → UI

Contabilizzazione dei costi AI dall'invocazione del modello fino alla visualizzazione in interfaccia.

**Pipeline di metering:**

1. **AI Service** — ogni chiamata LLM registra: `modelId`, `inputTokens`, `outputTokens`, `latencyMs`, `tenantId`, `userId`.
2. **Metering Event** — pubblicato su Kafka topic `ai.usage.metered` con schema Avro.
3. **Billing Consumer** — aggrega i token per tenant/periodo e calcola il costo in base al piano tariffario.
4. **Usage Store** — i dati aggregati sono scritti in PostgreSQL tabella `ai_usage_ledger`.
5. **API Endpoint** — `GET /api/v1/billing/ai-usage` restituisce consumo corrente, limiti e proiezioni.
6. **Frontend Widget** — il componente `<AiUsageMeter />` mostra barra di progresso, costo stimato e alert soglia.

**Tabella tariffaria per modello:**

| Modello | Input (€/1M tokens) | Output (€/1M tokens) | Uso tipico |
|---------|---------------------|----------------------|------------|
| GPT-4o | €2.50 | €10.00 | Analisi complesse, generazione report |
| Claude Sonnet | €3.00 | €15.00 | Ragionamento avanzato su deal |
| Mistral Large | €2.00 | €6.00 | Classificazione email, sentiment |
| Embedding (ada-002) | €0.10 | — | Ricerca semantica contatti/deal |

**Alert automatici:** al 75%, 90% e 100% del budget mensile AI, il sistema invia notifiche push + email all'admin del tenant.

---

### 7. Logging Correlation: Request ID Across All Layers

Formato unificato di logging che permette di ricostruire l'intero percorso di una richiesta attraverso tutti i microservizi.

**Formato log standard (JSON):**

```json
{
  "timestamp": "2026-03-24T10:30:00.123Z",
  "level": "info",
  "service": "crm-contacts",
  "correlationId": "req_7f3a2b1c",
  "traceId": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "spanId": "1a2b3c4d5e6f7a8b",
  "tenantId": "tenant_acme",
  "userId": "usr_42",
  "method": "GET",
  "path": "/api/v1/contacts",
  "statusCode": 200,
  "duration": 45,
  "message": "Request completed"
}
```

**Stack di osservabilità:**
- **Raccolta:** ogni servizio scrive su stdout in JSON. Fluentd (DaemonSet K8s) raccoglie e invia a Elasticsearch.
- **Storage:** Elasticsearch 8 con index lifecycle management — hot (7 giorni), warm (30 giorni), cold (90 giorni), delete.
- **Visualizzazione:** Grafana dashboards con filtri per `correlationId`, `tenantId`, `service`.
- **Alerting:** Prometheus AlertManager per metriche (latenza p99 > 500ms, error rate > 1%).
- **Tracing distribuito:** Jaeger riceve span OpenTelemetry, linkati tramite `traceId`.
- **Error tracking:** Sentry cattura eccezioni con contesto `correlationId` e `tenantId`.

---

### 8. Event-Driven Architecture: Kafka → WebSocket → UI

Architettura event-driven per aggiornamenti in tempo reale dall'elaborazione backend fino all'interfaccia utente.

```mermaid
sequenceDiagram
    participant S as CRM Service
    participant K as Kafka Broker
    participant C as Event Consumer
    participant R as Redis PubSub
    participant W as WebSocket Gateway
    participant U as Browser Client

    Note over S,U: Esempio: nuovo deal creato
    S->>K: Publish "deal.created" (topic: crm.deals.events)
    K->>C: Consumer Group "notifications" riceve evento
    C->>C: Arricchisce evento (user names, tenant branding)
    C->>R: PUBLISH channel "tenant:{tenantId}:events" {enriched event}
    R->>W: WebSocket Gateway sottoscritto al canale Redis
    W->>W: Filtra per userId e permessi
    W->>U: WS frame: {type: "deal.created", data: {dealId, title, value}}
    U->>U: TanStack Query invalidation: queryClient.invalidateQueries(["deals"])
    U->>U: Toast notification: "Nuovo deal: Progetto Alpha - €50.000"

    Note over S,U: Esempio: AI prediction completata
    S->>K: Publish "ai.prediction.completed" (topic: ai.predictions.events)
    K->>C: Consumer Group "notifications" riceve evento
    C->>C: Calcola confidence score, prepara summary
    C->>R: PUBLISH channel "tenant:{tenantId}:events"
    R->>W: Forward al WebSocket Gateway
    W->>U: WS frame: {type: "ai.prediction", data: {dealId, score: 0.87}}
    U->>U: Aggiorna widget AI prediction in tempo reale
```

**Garanzie di delivery:**
- Kafka: `acks=all`, `min.insync.replicas=2`, retention 7 giorni.
- Consumer: at-least-once con idempotency check (dedup via `eventId` in Redis SET con TTL 24h).
- WebSocket: riconnessione automatica con exponential backoff (1s, 2s, 4s, max 30s). Buffer eventi persi durante disconnessione (max 50 eventi, 5 min window).

---

### 9. Contract Testing Strategy (Pact)

Strategia di contract testing per garantire compatibilità tra consumer e provider senza integration test pesanti.

**Architettura Pact:**

- **Consumer tests:** ogni frontend o servizio consumer genera un Pact file (JSON) descrivendo le interazioni attese.
- **Pact Broker:** server centrale (self-hosted) dove i Pact file vengono pubblicati e versionati.
- **Provider verification:** ogni servizio provider esegue la verifica dei Pact in CI, confermando che soddisfa i contratti.
- **Can-I-Deploy:** check pre-deploy che verifica compatibilità tra le versioni in procinto di andare in produzione.

**Coppie di contratto principali:**

| Consumer | Provider | Interazioni testate |
|----------|----------|---------------------|
| React Frontend | CRM Contacts API | CRUD contatti, ricerca, filtri |
| React Frontend | Deals API | Pipeline view, deal stages, forecast |
| React Frontend | AI Predictions API | Score request, prediction history |
| React Frontend | Auth Service | Login, refresh, logout |
| Notification Service | Contacts API | Lookup contatto per email enrichment |
| AI Service | CRM Core API | Fetch deal data per scoring |
| Billing Service | AI Metering API | Usage aggregation query |

**Pipeline CI:**

```
consumer-test → publish-pact → provider-verify → can-i-deploy → deploy
```

Ogni PR che modifica un contratto API triggera automaticamente la verifica su tutti i consumer registrati. Se un provider non è compatibile, il deploy è bloccato.

---

## Parte II — Target Enterprise Architecture

### 10. System Context Diagram (C4 Level 1)

Vista ad alto livello del sistema CRM Pro 360 e delle sue interazioni con attori e sistemi esterni.

```mermaid
C4Context
    title CRM Pro 360 - System Context (C4 Level 1)

    Person(user, "Utente CRM", "Sales rep, account manager, admin")
    Person(admin, "Amministratore IT", "Configura tenant e integrazioni")

    System(crm, "CRM Pro 360", "Piattaforma CRM AI-powered per mid-enterprise europee")

    System_Ext(email, "Email Provider", "Gmail, Outlook 365 — sincronizzazione email bidirezionale")
    System_Ext(calendar, "Calendar Provider", "Google Calendar, Outlook — gestione appuntamenti")
    System_Ext(erp, "ERP Aziendale", "SAP, Oracle — dati finanziari e ordini")
    System_Ext(llm, "LLM Provider", "OpenAI, Anthropic, Mistral — modelli AI")
    System_Ext(payment, "Payment Gateway", "Stripe — gestione abbonamenti e pagamenti")
    System_Ext(identity, "Identity Provider", "Okta, Azure AD — SSO enterprise via SAML/OIDC")
    System_Ext(enrichment, "Data Enrichment", "Clearbit, Apollo — arricchimento dati aziendali")

    Rel(user, crm, "Usa quotidianamente", "HTTPS/WSS")
    Rel(admin, crm, "Configura e monitora", "HTTPS")
    Rel(crm, email, "Sincronizza email", "IMAP/API")
    Rel(crm, calendar, "Sincronizza eventi", "CalDAV/API")
    Rel(crm, erp, "Scambia dati finanziari", "REST/SFTP")
    Rel(crm, llm, "Invoca modelli AI", "HTTPS")
    Rel(crm, payment, "Gestisce billing", "HTTPS")
    Rel(crm, identity, "Autentica utenti SSO", "SAML 2.0/OIDC")
    Rel(crm, enrichment, "Arricchisce profili", "HTTPS")
```

---

### 11. Container Diagram (C4 Level 2)

Dettaglio dei container applicativi che compongono CRM Pro 360.

```mermaid
C4Container
    title CRM Pro 360 - Container Diagram (C4 Level 2)

    Person(user, "Utente CRM")

    System_Boundary(crm, "CRM Pro 360") {
        Container(spa, "Web Application", "React 19, Vite, TailwindCSS", "SPA per desktop e tablet")
        Container(mobile, "Mobile App", "React Native, Expo", "App nativa iOS/Android")
        Container(gateway, "API Gateway", "Kong", "Routing, rate limiting, autenticazione JWT")
        Container(auth, "Auth Service", "NestJS", "Login, SSO, gestione sessioni e token")
        Container(core, "CRM Core Service", "NestJS", "Contatti, aziende, deal, attività")
        Container(ai, "AI Service", "FastAPI, LangChain", "Scoring, predizioni, NLP, RAG")
        Container(notify, "Notification Service", "NestJS", "Email, push, in-app notifications")
        Container(billing, "Billing Service", "NestJS", "Piani, fatturazione, metering AI")
        Container(workflow, "Workflow Engine", "NestJS", "Automazioni e workflow personalizzati")
        Container(search, "Search Service", "FastAPI", "Full-text e semantic search")
        Container(sync, "Sync Service", "NestJS", "Sincronizzazione email, calendario, ERP")
        Container(ws, "WebSocket Gateway", "NestJS + Socket.IO", "Eventi real-time verso i client")
        Container(db, "Primary Database", "PostgreSQL 17 + Citus", "Dati applicativi shardati per tenant")
        Container(cache, "Cache Layer", "Redis Cluster + Memcached", "Sessioni, cache query, rate limit")
        Container(es, "Search Index", "Elasticsearch 8", "Indici full-text e log aggregati")
        Container(kafka, "Event Bus", "Kafka", "Comunicazione asincrona tra servizi")
        Container(storage, "Object Storage", "S3/MinIO", "Allegati, documenti, export")
    }

    Rel(user, spa, "Usa", "HTTPS")
    Rel(user, mobile, "Usa", "HTTPS")
    Rel(spa, gateway, "Chiama API", "HTTPS")
    Rel(mobile, gateway, "Chiama API", "HTTPS")
    Rel(gateway, auth, "Autentica", "gRPC")
    Rel(gateway, core, "Route", "HTTP")
    Rel(gateway, ai, "Route", "HTTP")
    Rel(gateway, billing, "Route", "HTTP")
    Rel(core, db, "Legge/Scrive", "TCP")
    Rel(core, cache, "Cache", "TCP")
    Rel(core, kafka, "Pubblica eventi", "TCP")
    Rel(ai, db, "Legge contesto", "TCP")
    Rel(ai, es, "Ricerca semantica", "HTTP")
    Rel(notify, kafka, "Consuma eventi", "TCP")
    Rel(ws, cache, "PubSub canali", "TCP")
    Rel(workflow, kafka, "Orchestrazione", "TCP")
    Rel(search, es, "Query", "HTTP")
    Rel(sync, kafka, "Pubblica sync events", "TCP")
    Rel(billing, db, "Dati billing", "TCP")
```

---

### 12. Microservices Map con Communication Patterns

Mappa dei microservizi con pattern di comunicazione sincrono e asincrono.

```mermaid
flowchart TB
    subgraph CLIENT["Client Layer"]
        SPA["Web SPA<br/>React 19"]
        MOB["Mobile App<br/>React Native"]
    end

    subgraph GATEWAY["API Gateway Layer"]
        KONG["Kong Gateway<br/>Rate Limit, Auth, Routing"]
    end

    subgraph SYNC_SERVICES["Servizi Sincroni"]
        AUTH["Auth Service<br/>NestJS"]
        CORE["CRM Core<br/>NestJS"]
        BILLING["Billing Service<br/>NestJS"]
        SEARCH["Search Service<br/>FastAPI"]
    end

    subgraph ASYNC_SERVICES["Servizi Asincroni"]
        AI["AI Service<br/>FastAPI + LangChain"]
        NOTIFY["Notification Service<br/>NestJS"]
        WORKFLOW["Workflow Engine<br/>NestJS"]
        SYNC_SVC["Sync Service<br/>NestJS"]
        ANALYTICS["Analytics Service<br/>FastAPI"]
    end

    subgraph DATA_LAYER["Data Layer"]
        PG[("PostgreSQL 17<br/>Citus Sharding")]
        REDIS[("Redis Cluster")]
        ES[("Elasticsearch 8")]
        KAFKA[("Kafka Cluster")]
        S3[("S3 / MinIO")]
    end

    subgraph REALTIME["Real-time Layer"]
        WSGATEWAY["WebSocket Gateway<br/>Socket.IO"]
    end

    SPA -->|"HTTPS (sync)"| KONG
    MOB -->|"HTTPS (sync)"| KONG
    SPA <-->|"WSS (async)"| WSGATEWAY
    MOB <-->|"WSS (async)"| WSGATEWAY

    KONG -->|"HTTP sync"| AUTH
    KONG -->|"HTTP sync"| CORE
    KONG -->|"HTTP sync"| BILLING
    KONG -->|"HTTP sync"| SEARCH
    KONG -->|"HTTP sync"| AI

    CORE -->|"Kafka async"| KAFKA
    AI -->|"Kafka async"| KAFKA
    BILLING -->|"Kafka async"| KAFKA
    SYNC_SVC -->|"Kafka async"| KAFKA

    KAFKA -->|"Kafka async"| NOTIFY
    KAFKA -->|"Kafka async"| WORKFLOW
    KAFKA -->|"Kafka async"| ANALYTICS
    KAFKA -->|"Kafka async"| WSGATEWAY

    CORE --> PG
    AUTH --> PG
    BILLING --> PG
    CORE --> REDIS
    AUTH --> REDIS
    AI --> ES
    SEARCH --> ES
    NOTIFY --> S3
    SYNC_SVC --> S3

    WSGATEWAY --> REDIS
```

---

### 13. AI Orchestration Topology

Topologia dell'orchestrazione AI con routing intelligente, caching e fallback tra modelli.

```mermaid
flowchart TB
    subgraph INGRESS["Ingresso Richieste AI"]
        API["AI API Endpoint<br/>/api/v1/ai/*"]
    end

    subgraph ROUTER["AI Router Layer"]
        CLASSIFIER["Request Classifier<br/>Determina complessità e tipo"]
        QUOTA["Quota Manager<br/>Verifica crediti tenant"]
        CACHE_CHECK["Semantic Cache<br/>Redis + Embedding similarity"]
    end

    subgraph ORCHESTRATOR["LangChain Orchestrator"]
        CHAIN["Chain Manager<br/>Seleziona pipeline"]
        RAG["RAG Pipeline<br/>Retrieval-Augmented Generation"]
        AGENT["Agent Executor<br/>Tool-calling autonomo"]
        SIMPLE["Simple Completion<br/>Single-shot LLM call"]
    end

    subgraph MODELS["Model Pool"]
        GPT4["GPT-4o<br/>Analisi complesse"]
        CLAUDE["Claude Sonnet<br/>Ragionamento deal"]
        MISTRAL["Mistral Large<br/>Classificazione, sentiment"]
        EMBED["Embedding Model<br/>ada-002"]
    end

    subgraph CONTEXT["Context Assembly"]
        VECTOR_DB["pgvector<br/>Embedding store"]
        ENTITY_DB["Entity Context<br/>PostgreSQL"]
        HISTORY["Conversation History<br/>Redis"]
    end

    subgraph OUTPUT["Output Processing"]
        PARSER["Output Parser<br/>Structured extraction"]
        GUARD["Safety Guard<br/>PII detection, content filter"]
        METER["Token Meter<br/>Conteggio e billing"]
        RESP["Response Builder<br/>Format per frontend"]
    end

    API --> CLASSIFIER
    CLASSIFIER --> QUOTA
    QUOTA -->|"Crediti OK"| CACHE_CHECK
    QUOTA -->|"Crediti esauriti"| DENY["402 CRM-6001"]
    CACHE_CHECK -->|"Cache hit"| RESP
    CACHE_CHECK -->|"Cache miss"| CHAIN

    CHAIN -->|"Richiesta semplice"| SIMPLE
    CHAIN -->|"Richiesta con contesto"| RAG
    CHAIN -->|"Richiesta con azioni"| AGENT

    RAG --> VECTOR_DB
    RAG --> ENTITY_DB
    AGENT --> ENTITY_DB
    SIMPLE --> HISTORY

    SIMPLE --> MISTRAL
    RAG --> GPT4
    AGENT --> CLAUDE
    RAG --> EMBED

    GPT4 --> PARSER
    CLAUDE --> PARSER
    MISTRAL --> PARSER
    PARSER --> GUARD
    GUARD --> METER
    METER --> RESP
```

---

### 14. Event-Driven Architecture: Kafka Topic Map

Mappa completa dei topic Kafka con strategia di partizionamento e consumer group.

```mermaid
flowchart LR
    subgraph PRODUCERS["Producers"]
        P_CORE["CRM Core"]
        P_AUTH["Auth Service"]
        P_AI["AI Service"]
        P_SYNC["Sync Service"]
        P_BILLING["Billing Service"]
        P_WORKFLOW["Workflow Engine"]
    end

    subgraph KAFKA_TOPICS["Kafka Topics"]
        T1["crm.contacts.events<br/>Partitions: 12<br/>Key: tenantId<br/>Retention: 7d"]
        T2["crm.deals.events<br/>Partitions: 12<br/>Key: tenantId<br/>Retention: 7d"]
        T3["crm.activities.events<br/>Partitions: 6<br/>Key: tenantId<br/>Retention: 3d"]
        T4["auth.sessions.events<br/>Partitions: 6<br/>Key: userId<br/>Retention: 1d"]
        T5["ai.usage.metered<br/>Partitions: 6<br/>Key: tenantId<br/>Retention: 30d"]
        T6["ai.predictions.events<br/>Partitions: 6<br/>Key: tenantId<br/>Retention: 7d"]
        T7["sync.email.events<br/>Partitions: 12<br/>Key: tenantId<br/>Retention: 3d"]
        T8["billing.invoices.events<br/>Partitions: 3<br/>Key: tenantId<br/>Retention: 90d"]
        T9["workflow.triggers<br/>Partitions: 6<br/>Key: tenantId<br/>Retention: 7d"]
        T10["notifications.outbound<br/>Partitions: 6<br/>Key: tenantId<br/>Retention: 1d"]
    end

    subgraph CONSUMERS["Consumer Groups"]
        C_NOTIFY["cg-notifications<br/>Instances: 3"]
        C_ANALYTICS["cg-analytics<br/>Instances: 2"]
        C_SEARCH["cg-search-indexer<br/>Instances: 3"]
        C_BILLING["cg-billing-meter<br/>Instances: 2"]
        C_WS["cg-websocket<br/>Instances: 3"]
        C_WORKFLOW["cg-workflow<br/>Instances: 2"]
        C_AUDIT["cg-audit-log<br/>Instances: 1"]
    end

    P_CORE --> T1
    P_CORE --> T2
    P_CORE --> T3
    P_AUTH --> T4
    P_AI --> T5
    P_AI --> T6
    P_SYNC --> T7
    P_BILLING --> T8
    P_WORKFLOW --> T9

    T1 --> C_NOTIFY
    T1 --> C_SEARCH
    T1 --> C_ANALYTICS
    T1 --> C_AUDIT
    T2 --> C_NOTIFY
    T2 --> C_SEARCH
    T2 --> C_ANALYTICS
    T2 --> C_WS
    T2 --> C_WORKFLOW
    T2 --> C_AUDIT
    T3 --> C_SEARCH
    T3 --> C_ANALYTICS
    T4 --> C_AUDIT
    T5 --> C_BILLING
    T6 --> C_WS
    T6 --> C_NOTIFY
    T7 --> C_SEARCH
    T7 --> C_NOTIFY
    T8 --> C_NOTIFY
    T8 --> C_AUDIT
    T9 --> C_WORKFLOW
    T10 --> C_NOTIFY
```

**Strategia di partizionamento:** tutti i topic business usano `tenantId` come partition key per garantire ordinamento degli eventi per tenant. Il topic `auth.sessions.events` usa `userId` per distribuire il carico uniformemente.

**Dead Letter Queue (DLQ):** ogni consumer group ha un DLQ dedicato (`*.dlq`) con retention 30 giorni. Dopo 3 tentativi falliti, l'evento viene spostato nel DLQ e un alert viene inviato su Slack.

---

### 15. Plugin/Module System Architecture

Architettura del sistema di plugin per estensibilità delle funzionalità CRM.

```mermaid
flowchart TB
    subgraph HOST["CRM Host Application"]
        REGISTRY["Plugin Registry<br/>Catalogo e lifecycle"]
        LOADER["Plugin Loader<br/>Dynamic import + sandboxing"]
        HOOKS["Hook System<br/>Event bus per estensioni"]
        API_BRIDGE["API Bridge<br/>Espone API CRM ai plugin"]
    end

    subgraph PLUGIN_TYPES["Tipi di Plugin"]
        UI_PLUGIN["UI Plugin<br/>React component remoto<br/>(Module Federation)"]
        BACKEND_PLUGIN["Backend Plugin<br/>NestJS dynamic module<br/>(isolato per tenant)"]
        WORKFLOW_PLUGIN["Workflow Action Plugin<br/>Custom step nel workflow engine"]
        INTEGRATION_PLUGIN["Integration Plugin<br/>Connettore verso sistemi esterni"]
    end

    subgraph SECURITY["Security Layer"]
        SANDBOX["V8 Isolate Sandbox<br/>Esecuzione codice isolata"]
        PERMISSIONS["Permission Manifest<br/>Dichiarazione accessi richiesti"]
        REVIEW["Review Pipeline<br/>Analisi statica + approvazione"]
        QUOTA_P["Resource Quota<br/>CPU, memoria, API calls"]
    end

    subgraph LIFECYCLE["Plugin Lifecycle"]
        INSTALL["Install<br/>Download + validazione"]
        ACTIVATE["Activate<br/>Registrazione hooks"]
        RUN["Running<br/>Esecuzione in sandbox"]
        DEACTIVATE["Deactivate<br/>Cleanup risorse"]
        UNINSTALL["Uninstall<br/>Rimozione dati"]
    end

    REGISTRY --> LOADER
    LOADER --> UI_PLUGIN
    LOADER --> BACKEND_PLUGIN
    LOADER --> WORKFLOW_PLUGIN
    LOADER --> INTEGRATION_PLUGIN

    UI_PLUGIN --> HOOKS
    BACKEND_PLUGIN --> API_BRIDGE
    WORKFLOW_PLUGIN --> API_BRIDGE
    INTEGRATION_PLUGIN --> API_BRIDGE

    LOADER --> SANDBOX
    SANDBOX --> PERMISSIONS
    REGISTRY --> REVIEW
    SANDBOX --> QUOTA_P

    INSTALL --> ACTIVATE
    ACTIVATE --> RUN
    RUN --> DEACTIVATE
    DEACTIVATE --> UNINSTALL
```

**Modello di estensione:**
- **UI Plugin:** caricati via Webpack Module Federation. Ogni plugin è un micro-frontend React isolato, montato in slot predefiniti dell'interfaccia (sidebar, detail panel, dashboard widget).
- **Backend Plugin:** moduli NestJS dinamici caricati a runtime. Ogni plugin dichiara un manifest con le API richieste e i permessi necessari.
- **Sicurezza:** esecuzione in V8 Isolates con limiti di CPU (100ms per invocazione), memoria (64MB) e API calls (1000/ora per plugin).

---

### 16. Workflow Engine Design

Motore di workflow basato su state machine per automazioni CRM personalizzabili.

```mermaid
stateDiagram-v2
    [*] --> Draft: Creazione workflow

    Draft --> Active: Attivazione
    Draft --> Archived: Archiviazione diretta

    Active --> Paused: Pausa manuale
    Active --> Active: Trigger ricevuto (esecuzione)

    Paused --> Active: Ripresa
    Paused --> Archived: Archiviazione

    Active --> Archived: Disattivazione

    Archived --> Draft: Clonazione come bozza
    Archived --> [*]: Eliminazione definitiva

    state Active {
        [*] --> WaitingTrigger
        WaitingTrigger --> Evaluating: Evento trigger ricevuto
        Evaluating --> ConditionCheck: Valutazione condizioni
        ConditionCheck --> ExecuteActions: Condizioni soddisfatte
        ConditionCheck --> WaitingTrigger: Condizioni non soddisfatte
        ExecuteActions --> ActionSuccess: Tutte le azioni completate
        ExecuteActions --> ActionFailed: Errore in una azione
        ActionSuccess --> WaitingTrigger: Reset per prossimo trigger
        ActionFailed --> RetryQueue: Tentativo retry
        RetryQueue --> ExecuteActions: Retry (max 3)
        RetryQueue --> ErrorState: Max retry superato
        ErrorState --> WaitingTrigger: Reset manuale admin
    }
```

**Componenti del workflow engine:**

| Componente | Responsabilità | Tecnologia |
|------------|---------------|------------|
| Trigger Listener | Ascolta eventi Kafka e matching con workflow attivi | NestJS + Kafka consumer |
| Condition Evaluator | Valuta espressioni condizionali (JSONLogic) | Custom evaluator |
| Action Executor | Esegue azioni sequenziali o parallele | BullMQ job queue |
| State Manager | Persiste stato workflow e execution history | PostgreSQL + Redis |
| Template Store | Catalogo workflow preconfigurati | PostgreSQL |
| Scheduler | Trigger time-based (cron) | BullMQ scheduler |

**Tipi di trigger supportati:**
- **Event:** `deal.stage_changed`, `contact.created`, `email.received`, `task.overdue`
- **Schedule:** espressioni cron (`0 9 * * MON` = ogni lunedi alle 9:00)
- **Manual:** invocazione manuale da UI o API
- **Webhook:** ricezione HTTP POST da sistemi esterni

**Tipi di azione supportati:**
- Invia email/notifica, crea task, aggiorna campo, assegna owner, invoca AI prediction, chiama webhook esterno, attendi (delay), fork parallelo.

---

### 17. Marketplace Extensibility Model

Modello di estensibilità tramite marketplace per plugin e integrazioni di terze parti.

```mermaid
flowchart TB
    subgraph DEVELOPERS["Developer Ecosystem"]
        DEV["Plugin Developer"]
        SDK["CRM Pro 360 SDK<br/>TypeScript + Python"]
        CLI["crm-cli<br/>Scaffolding e deploy"]
        DOCS["Developer Portal<br/>docs.crmpro360.eu"]
    end

    subgraph PIPELINE["Publishing Pipeline"]
        SUBMIT["Submit Plugin<br/>Upload bundle + manifest"]
        AUTO_REVIEW["Automated Review<br/>Security scan, performance test"]
        MANUAL_REVIEW["Manual Review<br/>Team CRM Pro 360"]
        PUBLISH["Publish to Marketplace<br/>Versioned release"]
    end

    subgraph MARKETPLACE["Marketplace"]
        CATALOG["Plugin Catalog<br/>Ricerca, filtri, categorie"]
        RATINGS["Rating System<br/>Recensioni e valutazioni"]
        BILLING_MP["Billing Integration<br/>Free, paid, freemium"]
        ANALYTICS_MP["Analytics Dashboard<br/>Install count, usage, revenue"]
    end

    subgraph TENANT["Tenant Installation"]
        DISCOVER["Scoperta plugin<br/>Browse marketplace"]
        INSTALL_T["Installazione<br/>One-click con permessi"]
        CONFIG["Configurazione<br/>Settings specifici tenant"]
        MONITOR["Monitoraggio<br/>Usage e performance"]
    end

    DEV --> SDK
    DEV --> CLI
    DEV --> DOCS
    CLI --> SUBMIT
    SUBMIT --> AUTO_REVIEW
    AUTO_REVIEW -->|"Pass"| MANUAL_REVIEW
    AUTO_REVIEW -->|"Fail"| DEV
    MANUAL_REVIEW -->|"Approved"| PUBLISH
    MANUAL_REVIEW -->|"Rejected"| DEV
    PUBLISH --> CATALOG

    CATALOG --> DISCOVER
    DISCOVER --> INSTALL_T
    INSTALL_T --> CONFIG
    CONFIG --> MONITOR

    CATALOG --> RATINGS
    CATALOG --> BILLING_MP
    PUBLISH --> ANALYTICS_MP
```

**Modello economico:**
- **Free tier:** plugin open-source, nessuna commissione.
- **Paid tier:** il developer imposta il prezzo. CRM Pro 360 trattiene il 20% come commissione piattaforma.
- **Revenue share:** pagamenti gestiti via Stripe Connect. Il developer riceve i fondi mensilmente.

**Categorie marketplace:** Integrazioni (ERP, email, calendar), AI Extensions (modelli custom, prompt library), UI Widgets (dashboard components, report templates), Workflow Actions (custom automation steps).

---

### 18. Multi-Region Deployment Topology (EU-Centric)

Topologia di deploy multi-regione centrata sull'Europa con tre regioni principali: Frankfurt, Dublin, Milan.

```mermaid
flowchart TB
    subgraph GLOBAL["Global Layer"]
        CF["Cloudflare CDN<br/>Edge caching + WAF + DDoS"]
        DNS["Route 53<br/>Latency-based routing"]
    end

    subgraph FRANKFURT["eu-central-1 (Frankfurt) — PRIMARY"]
        direction TB
        EKS_FRA["EKS Cluster<br/>6 nodes (m6i.2xlarge)"]
        PG_FRA[("PostgreSQL Primary<br/>Citus Coordinator<br/>+ 4 Worker Nodes")]
        REDIS_FRA[("Redis Cluster<br/>3 masters + 3 replicas")]
        KAFKA_FRA[("Kafka Cluster<br/>3 brokers")]
        ES_FRA[("Elasticsearch<br/>3 nodes")]
        S3_FRA[("S3 Bucket<br/>Primary storage")]
    end

    subgraph DUBLIN["eu-west-1 (Dublin) — SECONDARY"]
        direction TB
        EKS_DUB["EKS Cluster<br/>4 nodes (m6i.2xlarge)"]
        PG_DUB[("PostgreSQL Standby<br/>Streaming Replica")]
        REDIS_DUB[("Redis Cluster<br/>3 masters + 3 replicas")]
        ES_DUB[("Elasticsearch<br/>Cross-cluster replica")]
        S3_DUB[("S3 Bucket<br/>Cross-region replica")]
    end

    subgraph MILAN["eu-south-1 (Milan) — SECONDARY"]
        direction TB
        EKS_MIL["EKS Cluster<br/>4 nodes (m6i.2xlarge)"]
        PG_MIL[("PostgreSQL Standby<br/>Streaming Replica")]
        REDIS_MIL[("Redis Cluster<br/>3 masters + 3 replicas")]
        ES_MIL[("Elasticsearch<br/>Cross-cluster replica")]
        S3_MIL[("S3 Bucket<br/>Cross-region replica")]
    end

    CF --> DNS
    DNS -->|"Latency routing"| EKS_FRA
    DNS -->|"Latency routing"| EKS_DUB
    DNS -->|"Latency routing"| EKS_MIL

    EKS_FRA --> PG_FRA
    EKS_FRA --> REDIS_FRA
    EKS_FRA --> KAFKA_FRA
    EKS_FRA --> ES_FRA
    EKS_FRA --> S3_FRA

    EKS_DUB --> PG_DUB
    EKS_DUB --> REDIS_DUB
    EKS_DUB --> ES_DUB
    EKS_DUB --> S3_DUB

    EKS_MIL --> PG_MIL
    EKS_MIL --> REDIS_MIL
    EKS_MIL --> ES_MIL
    EKS_MIL --> S3_MIL

    PG_FRA -->|"Streaming Replication"| PG_DUB
    PG_FRA -->|"Streaming Replication"| PG_MIL
    KAFKA_FRA -->|"MirrorMaker 2"| EKS_DUB
    KAFKA_FRA -->|"MirrorMaker 2"| EKS_MIL
    S3_FRA -->|"Cross-Region Replication"| S3_DUB
    S3_FRA -->|"Cross-Region Replication"| S3_MIL
```

**Strategia di routing:**
- **Read traffic:** instradato alla regione più vicina tramite latency-based DNS routing.
- **Write traffic:** instradato sempre alla regione PRIMARY (Frankfurt) dove risiede il coordinator Citus e il Kafka cluster primario.
- **Data residency:** i tenant possono scegliere la regione di residenza dati per compliance GDPR. I dati non lasciano la regione selezionata.

**Infrastructure as Code:** tutto gestito con Terraform (moduli per EKS, RDS, ElastiCache, MSK) e ArgoCD per il deploy applicativo su tutti i cluster K8s.

---

### 19. Disaster Recovery Architecture

Architettura di disaster recovery con obiettivi di RPO e RTO definiti per ogni componente.

```mermaid
flowchart TB
    subgraph NORMAL["Operatività Normale"]
        PRIMARY["Frankfurt PRIMARY<br/>Tutte le operazioni read/write"]
        STANDBY_D["Dublin STANDBY<br/>Read-only, warm standby"]
        STANDBY_M["Milan STANDBY<br/>Read-only, warm standby"]
    end

    subgraph DETECTION["Detection Layer"]
        HEALTH["Health Check<br/>Prometheus + custom probes<br/>Intervallo: 10s"]
        ALERT["AlertManager<br/>Soglie: 3 check falliti consecutivi"]
        RUNBOOK["Automated Runbook<br/>PagerDuty + Terraform"]
    end

    subgraph FAILOVER["Failover Procedure"]
        DECIDE["Decision Gate<br/>Automatico o manuale?"]
        AUTO["Failover Automatico<br/>Se: DB unreachable > 60s"]
        MANUAL["Failover Manuale<br/>Se: degradazione parziale"]
        PROMOTE["Promuovi Dublin a PRIMARY<br/>pg_promote + DNS update"]
        REDIRECT["Aggiorna DNS<br/>TTL 60s, propagazione < 5 min"]
        VERIFY["Verifica integrità<br/>Data consistency check"]
    end

    subgraph RECOVERY["Recovery Post-Failover"]
        REBUILD["Ricostruisci Frankfurt<br/>Da backup + WAL replay"]
        RESYNC["Risincronizza dati<br/>pg_basebackup dalla nuova primary"]
        REVERT["Failback a Frankfurt<br/>Quando pronto e verificato"]
    end

    PRIMARY -->|"Streaming Replication<br/>RPO < 1 min"| STANDBY_D
    PRIMARY -->|"Streaming Replication<br/>RPO < 1 min"| STANDBY_M

    HEALTH -->|"Failure detected"| ALERT
    ALERT --> DECIDE
    DECIDE -->|"Total outage"| AUTO
    DECIDE -->|"Partial degradation"| MANUAL
    AUTO --> PROMOTE
    MANUAL --> PROMOTE
    PROMOTE --> REDIRECT
    REDIRECT --> VERIFY

    VERIFY -->|"OK"| REBUILD
    VERIFY -->|"Data loss detected"| RUNBOOK
    REBUILD --> RESYNC
    RESYNC --> REVERT
```

**Obiettivi RPO/RTO per componente:**

| Componente | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) | Strategia |
|------------|-------------------------------|-------------------------------|-----------|
| PostgreSQL (dati core) | < 1 minuto | < 5 minuti | Streaming replication sincrona verso Dublin |
| PostgreSQL (dati analytics) | < 15 minuti | < 30 minuti | Streaming replication asincrona |
| Redis (sessioni) | 0 (ricostruibile) | < 2 minuti | Sessioni ri-autenticate dal client |
| Redis (cache) | 0 (ricostruibile) | < 1 minuto | Cache ricostruita on-demand |
| Elasticsearch (indici) | < 30 minuti | < 15 minuti | Cross-cluster replication + re-index da DB |
| Kafka (eventi) | < 1 minuto | < 10 minuti | MirrorMaker 2 cross-region |
| S3 (allegati) | < 1 minuto | < 1 minuto | Cross-region replication nativa AWS |
| DNS (routing) | N/A | < 5 minuti | TTL 60s, health check ogni 10s |

**Procedure di test DR:**
- **Chaos Engineering:** sessioni mensili con Litmus Chaos su EKS — simulazione failure nodi, network partition, disk full.
- **DR Drill:** test trimestrale di failover completo verso Dublin con rollback entro 4 ore.
- **Backup verification:** restore giornaliero automatico di un backup PostgreSQL su ambiente di test con data integrity check.

**Backup strategy:**
- PostgreSQL: WAL archiving continuo su S3 + snapshot giornaliero. Retention: 30 giorni snapshot, 7 giorni WAL.
- Elasticsearch: snapshot notturno su S3. Retention: 14 giorni.
- S3: versioning attivo + cross-region replication. Lifecycle policy: archive dopo 90 giorni su Glacier.

---

## Appendice — Riepilogo Decisioni Architetturali

| Decisione | Scelta | Motivazione |
|-----------|--------|-------------|
| API Gateway | Kong | Plugin ecosystem maturo, supporto rate limiting per tenant, compatibilità K8s |
| Database | PostgreSQL 17 + Citus | Sharding nativo per `tenantId`, SQL standard, estensioni (pgvector, PostGIS) |
| Event Bus | Kafka | Throughput elevato, ordering per partition key, ecosystem connectors |
| Cache | Redis Cluster + Memcached | Redis per sessioni/pubsub, Memcached per cache read-heavy ad alta concorrenza |
| Search | Elasticsearch 8 | Full-text multilingue, aggregazioni analitiche, log aggregation unificata |
| AI Framework | LangChain + FastAPI | Chain composability, tool-calling nativo, async Python per workload AI |
| ML Framework | PyTorch + scikit-learn | PyTorch per modelli custom, scikit-learn per scoring tabellare leggero |
| Container Orchestration | K8s (EKS/GKE) | Standard de facto, autoscaling HPA/VPA, service mesh ready |
| IaC | Terraform + ArgoCD | Terraform per infrastruttura, ArgoCD per GitOps applicativo su K8s |
| Observability | Prometheus + Grafana + Jaeger + Sentry | Stack open-source maturo, costi prevedibili, community ampia |
| Architettura | DDD + Event Sourcing + CQRS | Separazione read/write per scalabilità, audit trail nativo, bounded context chiari |
| Resilienza | Circuit Breaker (Hystrix/resilience4j pattern) | Protezione da cascade failure tra microservizi, fallback degradato |
