# 07 - API Specification

Specifica completa delle API REST e GraphQL di CRM Pro 360. Documento di riferimento per sviluppatori interni, partner di integrazione e consumatori SDK.

---

## 1. Principi di Design delle API

### Convenzioni RESTful

Tutte le risorse seguono convenzioni REST standard con naming al plurale e operazioni HTTP semantiche:

| Metodo | Semantica | Idempotente | Corpo richiesta |
|--------|-----------|-------------|-----------------|
| GET | Lettura risorsa/collezione | Si | No |
| POST | Creazione risorsa | No | Si |
| PUT | Sostituzione completa risorsa | Si | Si |
| PATCH | Aggiornamento parziale risorsa | Si | Si |
| DELETE | Eliminazione risorsa | Si | No |

### Struttura URL

```
https://api.crmpro360.eu/v2/{resource}
https://api.crmpro360.eu/v2/{resource}/{id}
https://api.crmpro360.eu/v2/{resource}/{id}/{sub-resource}
```

Regole di naming:
- Risorse al plurale in kebab-case: `/v2/contacts`, `/v2/audit-logs`
- Nessun trailing slash
- Nessun verbo nel path (eccezione: `/search`, `/export`, `/import` come azioni RPC-style)
- Sotto-risorse per relazioni dirette: `/v2/accounts/{id}/contacts`

### Headers obbligatori

| Header | Descrizione | Esempio |
|--------|-------------|---------|
| `Authorization` | Bearer JWT token per autenticazione | `Bearer eyJhbGciOiJSUzI1NiIs...` |
| `X-Tenant-ID` | Identificativo tenant per contesto multi-tenant | `tn_a1b2c3d4` |
| `Content-Type` | Tipo contenuto (JSON di default, multipart per upload) | `application/json` |
| `Accept` | Formato risposta desiderato | `application/json` |
| `Accept-Language` | Lingua per messaggi localizzati (it, en, de, fr, es) | `it-IT` |

### Headers opzionali

| Header | Descrizione | Esempio |
|--------|-------------|---------|
| `Idempotency-Key` | Chiave di idempotenza per POST/PUT/PATCH (UUID v4) | `550e8400-e29b-41d4-a716-446655440000` |
| `X-Request-ID` | ID tracciamento richiesta (generato dal server se assente) | `req_7f3a8b2c` |
| `X-Correlation-ID` | ID correlazione per tracciamento distribuito | `cor_9e1d4f6a` |

### Headers di risposta per Rate Limiting

| Header | Descrizione | Esempio |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Limite massimo richieste per finestra temporale | `500` |
| `X-RateLimit-Remaining` | Richieste rimanenti nella finestra corrente | `487` |
| `X-RateLimit-Reset` | Timestamp UTC di reset della finestra (epoch seconds) | `1711324800` |

### Status Code utilizzati

| Codice | Significato | Uso |
|--------|-------------|-----|
| 200 | OK | Risorsa letta o aggiornata con successo |
| 201 | Created | Risorsa creata con successo |
| 204 | No Content | Eliminazione riuscita, nessun corpo |
| 400 | Bad Request | Dati di input non validi |
| 401 | Unauthorized | Token assente o scaduto |
| 403 | Forbidden | Permessi insufficienti |
| 404 | Not Found | Risorsa inesistente |
| 409 | Conflict | Conflitto di stato (es. duplicato, merge conflict) |
| 422 | Unprocessable Entity | Validazione business logic fallita |
| 429 | Too Many Requests | Rate limit superato |
| 500 | Internal Server Error | Errore imprevisto del server |
| 503 | Service Unavailable | Servizio temporaneamente non disponibile |

---

## 2. Modello di Errore (RFC 7807)

### Schema di risposta errore

Tutte le risposte di errore seguono lo standard RFC 7807 `application/problem+json`:

```json
{
  "type": "https://api.crmpro360.eu/errors/validation-failed",
  "title": "Validazione fallita",
  "status": 400,
  "detail": "Il campo 'email' non contiene un indirizzo email valido.",
  "instance": "/v2/contacts",
  "traceId": "req_7f3a8b2c-e1d4-4f6a-9c3b-2a5d8e0f1b7c",
  "timestamp": "2026-03-24T10:30:00Z",
  "errors": [
    {
      "field": "email",
      "code": "INVALID_EMAIL_FORMAT",
      "message": {
        "it": "L'indirizzo email non è valido.",
        "en": "The email address is not valid."
      }
    }
  ]
}
```

### Registro codici di errore

#### Autenticazione e autorizzazione

| Codice | HTTP Status | Descrizione (IT) | Description (EN) |
|--------|-------------|-------------------|-------------------|
| `AUTH_TOKEN_MISSING` | 401 | Token di autenticazione assente | Authentication token missing |
| `AUTH_TOKEN_EXPIRED` | 401 | Token di autenticazione scaduto | Authentication token expired |
| `AUTH_TOKEN_INVALID` | 401 | Token di autenticazione non valido | Invalid authentication token |
| `AUTH_REFRESH_EXPIRED` | 401 | Refresh token scaduto, richiesto nuovo login | Refresh token expired, new login required |
| `AUTH_TENANT_MISMATCH` | 403 | Token non appartiene al tenant specificato | Token does not belong to specified tenant |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | Permessi insufficienti per questa operazione | Insufficient permissions for this operation |
| `AUTH_ROLE_REQUIRED` | 403 | Ruolo richiesto non assegnato all'utente | Required role not assigned to user |
| `AUTH_IP_BLOCKED` | 403 | Indirizzo IP bloccato dalla policy di sicurezza | IP address blocked by security policy |
| `AUTH_MFA_REQUIRED` | 403 | Autenticazione a due fattori richiesta | Two-factor authentication required |
| `AUTH_SESSION_REVOKED` | 401 | Sessione revocata dall'amministratore | Session revoked by administrator |

#### Validazione

| Codice | HTTP Status | Descrizione (IT) | Description (EN) |
|--------|-------------|-------------------|-------------------|
| `INVALID_EMAIL_FORMAT` | 400 | Formato email non valido | Invalid email format |
| `INVALID_PHONE_FORMAT` | 400 | Formato numero di telefono non valido | Invalid phone number format |
| `FIELD_REQUIRED` | 400 | Campo obbligatorio mancante | Required field missing |
| `FIELD_TOO_LONG` | 400 | Valore campo supera la lunghezza massima | Field value exceeds maximum length |
| `FIELD_TOO_SHORT` | 400 | Valore campo inferiore alla lunghezza minima | Field value below minimum length |
| `INVALID_DATE_FORMAT` | 400 | Formato data non valido (atteso ISO 8601) | Invalid date format (expected ISO 8601) |
| `INVALID_ENUM_VALUE` | 400 | Valore non ammesso per il campo enumerato | Invalid value for enumerated field |
| `INVALID_CURRENCY_CODE` | 400 | Codice valuta ISO 4217 non valido | Invalid ISO 4217 currency code |
| `INVALID_COUNTRY_CODE` | 400 | Codice paese ISO 3166-1 non valido | Invalid ISO 3166-1 country code |
| `INVALID_FILTER_SYNTAX` | 400 | Sintassi filtro RSQL non valida | Invalid RSQL filter syntax |

#### Business Logic

| Codice | HTTP Status | Descrizione (IT) | Description (EN) |
|--------|-------------|-------------------|-------------------|
| `CONTACT_DUPLICATE` | 409 | Contatto duplicato rilevato (stessa email) | Duplicate contact detected (same email) |
| `DEAL_STAGE_INVALID_TRANSITION` | 422 | Transizione di fase non valida per il deal | Invalid stage transition for deal |
| `DEAL_CLOSED_IMMUTABLE` | 422 | Deal chiuso non modificabile | Closed deal cannot be modified |
| `PIPELINE_HAS_DEALS` | 422 | Pipeline non eliminabile: contiene deal attivi | Pipeline cannot be deleted: contains active deals |
| `MERGE_CONFLICT` | 409 | Conflitto durante merge contatti | Conflict during contact merge |
| `SLA_BREACH_IMMINENT` | 422 | Azione bloccata: violazione SLA imminente | Action blocked: SLA breach imminent |
| `CAMPAIGN_ALREADY_SENT` | 422 | Campagna già inviata, non modificabile | Campaign already sent, cannot be modified |
| `TICKET_CLOSED` | 422 | Ticket chiuso, non è possibile aggiungere commenti | Ticket closed, cannot add comments |
| `QUOTA_EXCEEDED` | 422 | Quota del piano superata | Plan quota exceeded |
| `WEBHOOK_URL_UNREACHABLE` | 422 | URL webhook non raggiungibile | Webhook URL unreachable |

#### Sistema

| Codice | HTTP Status | Descrizione (IT) | Description (EN) |
|--------|-------------|-------------------|-------------------|
| `INTERNAL_ERROR` | 500 | Errore interno del server | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Servizio temporaneamente non disponibile | Service temporarily unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Limite di richieste superato | Rate limit exceeded |
| `RESOURCE_NOT_FOUND` | 404 | Risorsa non trovata | Resource not found |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Richiesta con stessa Idempotency-Key già elaborata | Request with same Idempotency-Key already processed |
| `REQUEST_TIMEOUT` | 408 | Timeout elaborazione richiesta | Request processing timeout |
| `PAYLOAD_TOO_LARGE` | 413 | Corpo della richiesta troppo grande (max 10MB) | Request body too large (max 10MB) |

---

## 3. Paginazione, Filtraggio e Ordinamento

### Paginazione cursor-based

La paginazione basata su cursore garantisce performance costanti indipendentemente dalla profondità di pagina.

**Parametri di query:**

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `cursor` | string | (vuoto) | Cursore opaco per la pagina successiva |
| `limit` | integer | 25 | Numero di elementi per pagina (min: 1, max: 100) |

**Struttura risposta envelope:**

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMzQ1Njc4OTAiLCJjcmVhdGVkQXQiOiIyMDI2LTAzLTI0VDEwOjMwOjAwWiJ9",
    "limit": 25,
    "hasMore": true,
    "totalCount": 1842
  }
}
```

Il campo `totalCount` viene incluso solo se il parametro `?count=true` viene specificato (operazione costosa su dataset grandi).

### Filtraggio RSQL

Il parametro `filter` accetta sintassi RSQL/FIQL per query complesse:

| Operatore | Significato | Esempio |
|-----------|-------------|---------|
| `==` | Uguale a | `name==Mario` |
| `!=` | Diverso da | `status!=closed` |
| `>` | Maggiore di | `amount>10000` |
| `>=` | Maggiore o uguale a | `createdAt>=2026-01-01` |
| `<` | Minore di | `age<30` |
| `<=` | Minore o uguale a | `score<=50` |
| `=in=` | In lista | `status=in=(open,pending)` |
| `=out=` | Non in lista | `priority=out=(low,trivial)` |
| `=like=` | Contiene (case-insensitive) | `name=like=*rossi*` |
| `=null=` | E' null | `phone=null=true` |
| `;` | AND logico | `name==Mario;age>25` |
| `,` | OR logico | `status==open,status==pending` |

**Esempio complesso:**

```
GET /v2/contacts?filter=company.name=like=*tech*;createdAt>=2026-01-01;status=in=(active,prospect)
```

### Ordinamento

```
GET /v2/contacts?sort=createdAt:desc,lastName:asc
```

Direzioni supportate: `asc` (crescente), `desc` (decrescente). Primo campo ha priorità massima.

### Selezione campi

Per ridurre il payload di risposta, specificare i campi desiderati:

```
GET /v2/contacts?fields=id,firstName,lastName,email,company
```

Le relazioni annidate usano notazione punto: `fields=id,company.name,company.industry`.

### Esempio completo richiesta/risposta

**Richiesta:**

```http
GET /v2/contacts?filter=status==active;company.industry==technology&sort=createdAt:desc&limit=2&fields=id,firstName,lastName,email HTTP/1.1
Host: api.crmpro360.eu
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Tenant-ID: tn_a1b2c3d4
Accept: application/json
```

**Risposta (200 OK):**

```json
{
  "data": [
    {
      "id": "cnt_9f8e7d6c",
      "firstName": "Marco",
      "lastName": "Bianchi",
      "email": "m.bianchi@techcorp.it"
    },
    {
      "id": "cnt_5a4b3c2d",
      "firstName": "Giulia",
      "lastName": "Ferri",
      "email": "g.ferri@innovatech.eu"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6ImNudF81YTRiM2MyZCJ9",
    "limit": 2,
    "hasMore": true
  }
}
```

---

## 4. Risorse API

### 4.1 Contacts API

Gestione completa dei contatti CRM: persone fisiche associate a un'azienda o indipendenti.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/contacts` | Lista contatti con paginazione e filtri |
| POST | `/v2/contacts` | Creazione nuovo contatto |
| GET | `/v2/contacts/:id` | Dettaglio singolo contatto |
| PUT | `/v2/contacts/:id` | Sostituzione completa contatto |
| PATCH | `/v2/contacts/:id` | Aggiornamento parziale contatto |
| DELETE | `/v2/contacts/:id` | Eliminazione contatto (soft delete) |
| POST | `/v2/contacts/import` | Importazione massiva da CSV/Excel |
| GET | `/v2/contacts/export` | Esportazione contatti in CSV/Excel |
| POST | `/v2/contacts/merge` | Unione di due o piu contatti duplicati |
| GET | `/v2/contacts/:id/timeline` | Timeline unificata attivita del contatto |
| GET | `/v2/contacts/:id/activities` | Lista attivita (email, chiamate, note) |
| POST | `/v2/contacts/search` | Ricerca full-text avanzata |
| GET | `/v2/contacts/:id/deals` | Deal associati al contatto |
| GET | `/v2/contacts/:id/tickets` | Ticket di supporto del contatto |

**Creazione contatto - Richiesta:**

```http
POST /v2/contacts HTTP/1.1
Host: api.crmpro360.eu
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Tenant-ID: tn_a1b2c3d4
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "firstName": "Alessandro",
  "lastName": "Moretti",
  "email": "a.moretti@esempio.it",
  "phone": "+39 02 1234567",
  "mobile": "+39 333 1234567",
  "jobTitle": "Direttore Commerciale",
  "accountId": "acc_d4e5f6a7",
  "address": {
    "street": "Via Roma 42",
    "city": "Milano",
    "province": "MI",
    "postalCode": "20121",
    "country": "IT"
  },
  "tags": ["decision-maker", "enterprise"],
  "customFields": {
    "cf_linkedin": "https://linkedin.com/in/amoretti",
    "cf_preferred_language": "it"
  },
  "source": "web_form",
  "ownerId": "usr_b2c3d4e5"
}
```

**Risposta (201 Created):**

```json
{
  "data": {
    "id": "cnt_1a2b3c4d",
    "firstName": "Alessandro",
    "lastName": "Moretti",
    "email": "a.moretti@esempio.it",
    "phone": "+39 02 1234567",
    "mobile": "+39 333 1234567",
    "jobTitle": "Direttore Commerciale",
    "accountId": "acc_d4e5f6a7",
    "address": {
      "street": "Via Roma 42",
      "city": "Milano",
      "province": "MI",
      "postalCode": "20121",
      "country": "IT"
    },
    "tags": ["decision-maker", "enterprise"],
    "customFields": {
      "cf_linkedin": "https://linkedin.com/in/amoretti",
      "cf_preferred_language": "it"
    },
    "source": "web_form",
    "ownerId": "usr_b2c3d4e5",
    "status": "active",
    "leadScore": null,
    "createdAt": "2026-03-24T10:30:00Z",
    "updatedAt": "2026-03-24T10:30:00Z"
  }
}
```

**Lista contatti - Risposta (200 OK):**

```json
{
  "data": [
    {
      "id": "cnt_1a2b3c4d",
      "firstName": "Alessandro",
      "lastName": "Moretti",
      "email": "a.moretti@esempio.it",
      "jobTitle": "Direttore Commerciale",
      "account": {
        "id": "acc_d4e5f6a7",
        "name": "TechCorp Italia S.r.l."
      },
      "status": "active",
      "leadScore": 78,
      "ownerId": "usr_b2c3d4e5",
      "lastActivityAt": "2026-03-23T14:22:00Z",
      "createdAt": "2026-03-20T09:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6ImNudF8xYTJiM2M0ZCJ9",
    "limit": 25,
    "hasMore": true,
    "totalCount": 4271
  }
}
```

### 4.2 Accounts API

Gestione aziende/organizzazioni con supporto gerarchie (holding, filiali).

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/accounts` | Lista account con filtri e paginazione |
| POST | `/v2/accounts` | Creazione nuovo account |
| GET | `/v2/accounts/:id` | Dettaglio account |
| PUT | `/v2/accounts/:id` | Sostituzione completa account |
| PATCH | `/v2/accounts/:id` | Aggiornamento parziale |
| DELETE | `/v2/accounts/:id` | Eliminazione account (soft delete) |
| GET | `/v2/accounts/:id/contacts` | Contatti associati all'account |
| GET | `/v2/accounts/:id/deals` | Deal associati all'account |
| GET | `/v2/accounts/:id/children` | Account figlio nella gerarchia |
| GET | `/v2/accounts/:id/timeline` | Timeline attivita dell'account |
| POST | `/v2/accounts/:id/contacts` | Associazione contatto all'account |
| DELETE | `/v2/accounts/:id/contacts/:contactId` | Rimozione associazione contatto |

### 4.3 Pipeline & Deals API

Gestione pipeline di vendita, fasi e deal. Supporta drag-drop per cambio fase e previsioni di fatturato.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/pipelines` | Lista pipeline configurate |
| POST | `/v2/pipelines` | Creazione nuova pipeline |
| GET | `/v2/pipelines/:id` | Dettaglio pipeline con fasi |
| PUT | `/v2/pipelines/:id` | Aggiornamento pipeline |
| DELETE | `/v2/pipelines/:id` | Eliminazione pipeline (solo se vuota) |
| GET | `/v2/pipelines/:id/stages` | Lista fasi di una pipeline |
| POST | `/v2/pipelines/:id/stages` | Aggiunta fase alla pipeline |
| PUT | `/v2/pipelines/:id/stages/:stageId` | Aggiornamento fase |
| DELETE | `/v2/pipelines/:id/stages/:stageId` | Eliminazione fase |
| GET | `/v2/deals` | Lista deal con filtri |
| POST | `/v2/deals` | Creazione nuovo deal |
| GET | `/v2/deals/:id` | Dettaglio deal |
| PUT | `/v2/deals/:id` | Aggiornamento completo deal |
| PATCH | `/v2/deals/:id` | Aggiornamento parziale deal |
| DELETE | `/v2/deals/:id` | Eliminazione deal (soft delete) |
| PATCH | `/v2/deals/:id/stage` | Cambio fase deal (drag-drop) |
| GET | `/v2/deals/forecast` | Previsioni di fatturato aggregate |
| GET | `/v2/deals/:id/activities` | Attivita legate al deal |
| POST | `/v2/deals/:id/activities` | Registrazione attivita su deal |
| GET | `/v2/deals/:id/contacts` | Contatti coinvolti nel deal |

**Creazione deal - Richiesta:**

```http
POST /v2/deals HTTP/1.1
Host: api.crmpro360.eu
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Tenant-ID: tn_a1b2c3d4
Content-Type: application/json
Idempotency-Key: 660f9511-f30c-52e5-b827-557766551111

{
  "title": "Implementazione ERP - TechCorp Italia",
  "pipelineId": "pip_aaa111bbb",
  "stageId": "stg_qualification",
  "amount": 185000.00,
  "currency": "EUR",
  "probability": 40,
  "expectedCloseDate": "2026-06-30",
  "accountId": "acc_d4e5f6a7",
  "contactIds": ["cnt_1a2b3c4d", "cnt_9f8e7d6c"],
  "ownerId": "usr_b2c3d4e5",
  "tags": ["erp", "enterprise", "q2-target"],
  "customFields": {
    "cf_competitor": "SAP",
    "cf_decision_process": "committee"
  },
  "notes": "Primo incontro fissato per il 28 marzo. Budget approvato dal CDA."
}
```

**Risposta (201 Created):**

```json
{
  "data": {
    "id": "deal_x1y2z3w4",
    "title": "Implementazione ERP - TechCorp Italia",
    "pipelineId": "pip_aaa111bbb",
    "pipeline": {
      "id": "pip_aaa111bbb",
      "name": "Enterprise Sales"
    },
    "stageId": "stg_qualification",
    "stage": {
      "id": "stg_qualification",
      "name": "Qualificazione",
      "order": 2
    },
    "amount": 185000.00,
    "currency": "EUR",
    "probability": 40,
    "weightedAmount": 74000.00,
    "expectedCloseDate": "2026-06-30",
    "accountId": "acc_d4e5f6a7",
    "contactIds": ["cnt_1a2b3c4d", "cnt_9f8e7d6c"],
    "ownerId": "usr_b2c3d4e5",
    "tags": ["erp", "enterprise", "q2-target"],
    "customFields": {
      "cf_competitor": "SAP",
      "cf_decision_process": "committee"
    },
    "notes": "Primo incontro fissato per il 28 marzo. Budget approvato dal CDA.",
    "status": "open",
    "daysInStage": 0,
    "createdAt": "2026-03-24T11:00:00Z",
    "updatedAt": "2026-03-24T11:00:00Z"
  }
}
```

### 4.4 Marketing API

Gestione campagne marketing, template email e workflow di automazione.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/campaigns` | Lista campagne con filtri |
| POST | `/v2/campaigns` | Creazione nuova campagna |
| GET | `/v2/campaigns/:id` | Dettaglio campagna |
| PUT | `/v2/campaigns/:id` | Aggiornamento campagna |
| DELETE | `/v2/campaigns/:id` | Eliminazione campagna (solo bozze) |
| POST | `/v2/campaigns/:id/send` | Invio campagna ai destinatari |
| POST | `/v2/campaigns/:id/schedule` | Programmazione invio campagna |
| GET | `/v2/campaigns/:id/metrics` | Metriche campagna (open rate, CTR, bounce) |
| GET | `/v2/campaigns/:id/recipients` | Lista destinatari con stato consegna |
| GET | `/v2/email-templates` | Lista template email |
| POST | `/v2/email-templates` | Creazione template email |
| GET | `/v2/email-templates/:id` | Dettaglio template |
| PUT | `/v2/email-templates/:id` | Aggiornamento template |
| DELETE | `/v2/email-templates/:id` | Eliminazione template |
| GET | `/v2/workflows` | Lista workflow di automazione |
| POST | `/v2/workflows` | Creazione workflow |
| POST | `/v2/workflows/:id/activate` | Attivazione workflow |
| POST | `/v2/workflows/:id/deactivate` | Disattivazione workflow |

### 4.5 Tickets API

Gestione ticket di supporto con tracciamento SLA e timeline conversazioni.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/tickets` | Lista ticket con filtri e paginazione |
| POST | `/v2/tickets` | Creazione nuovo ticket |
| GET | `/v2/tickets/:id` | Dettaglio ticket |
| PUT | `/v2/tickets/:id` | Aggiornamento completo ticket |
| PATCH | `/v2/tickets/:id` | Aggiornamento parziale ticket |
| DELETE | `/v2/tickets/:id` | Eliminazione ticket (soft delete) |
| POST | `/v2/tickets/:id/assign` | Assegnazione ticket a operatore |
| POST | `/v2/tickets/:id/escalate` | Escalation ticket a livello superiore |
| PATCH | `/v2/tickets/:id/status` | Cambio stato ticket |
| GET | `/v2/tickets/:id/timeline` | Timeline completa del ticket |
| POST | `/v2/tickets/:id/comments` | Aggiunta commento al ticket |
| GET | `/v2/tickets/:id/comments` | Lista commenti del ticket |
| GET | `/v2/tickets/:id/sla` | Stato SLA corrente del ticket |
| POST | `/v2/tickets/:id/attachments` | Caricamento allegato (multipart/form-data) |

### 4.6 Analytics API

Dashboard, report personalizzati, KPI e analisi funnel di vendita.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/analytics/dashboards` | Lista dashboard disponibili |
| POST | `/v2/analytics/dashboards` | Creazione dashboard personalizzata |
| GET | `/v2/analytics/dashboards/:id` | Dettaglio dashboard con widget |
| PUT | `/v2/analytics/dashboards/:id` | Aggiornamento dashboard |
| POST | `/v2/analytics/reports/execute` | Esecuzione report con parametri |
| GET | `/v2/analytics/reports/templates` | Template report predefiniti |
| GET | `/v2/analytics/kpis` | KPI aggregati per periodo |
| GET | `/v2/analytics/funnels` | Analisi funnel conversione pipeline |
| GET | `/v2/analytics/revenue` | Analisi ricavi per periodo e segmento |
| POST | `/v2/analytics/export` | Esportazione dati analitici (CSV/PDF) |

### 4.7 AI API

Servizi di intelligenza artificiale: lead scoring predittivo, previsione churn, suggerimenti next-best-action, forecast e assistente conversazionale.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/v2/ai/lead-score` | Calcolo score predittivo per lead/contatto |
| POST | `/v2/ai/lead-score/batch` | Calcolo score per batch di contatti |
| POST | `/v2/ai/churn-predict` | Previsione rischio churn per account |
| POST | `/v2/ai/next-best-action` | Suggerimento prossima azione ottimale |
| POST | `/v2/ai/forecast` | Previsioni di vendita AI-driven |
| POST | `/v2/ai/chat` | Assistente AI conversazionale (SSE streaming) |
| GET | `/v2/ai/chat/conversations` | Lista conversazioni AI dell'utente |
| GET | `/v2/ai/chat/conversations/:id` | Dettaglio conversazione con messaggi |
| DELETE | `/v2/ai/chat/conversations/:id` | Eliminazione conversazione |
| POST | `/v2/ai/enrich` | Arricchimento dati contatto/account da fonti esterne |
| POST | `/v2/ai/enrich/batch` | Arricchimento batch |
| GET | `/v2/ai/usage` | Utilizzo crediti AI per periodo |
| POST | `/v2/ai/sentiment` | Analisi sentiment testo (email, commenti) |

**AI Chat (SSE streaming) - Richiesta:**

```http
POST /v2/ai/chat HTTP/1.1
Host: api.crmpro360.eu
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Tenant-ID: tn_a1b2c3d4
Content-Type: application/json
Accept: text/event-stream

{
  "conversationId": "conv_abc123",
  "message": "Mostrami i deal con probabilita sopra il 70% in scadenza questo mese",
  "context": {
    "currentView": "pipeline",
    "pipelineId": "pip_aaa111bbb"
  }
}
```

**Risposta (SSE stream):**

```
event: message_start
data: {"conversationId":"conv_abc123","messageId":"msg_xyz789"}

event: content_delta
data: {"delta":"Ho trovato "}

event: content_delta
data: {"delta":"3 deal con probabilità superiore al 70%"}

event: tool_call
data: {"toolName":"search_deals","args":{"probability_gte":70,"expectedCloseDate_lte":"2026-03-31"}}

event: tool_result
data: {"toolName":"search_deals","result":[{"id":"deal_x1y2z3w4","title":"ERP TechCorp","amount":185000,"probability":85}]}

event: content_delta
data: {"delta":" in scadenza entro marzo 2026:\n\n1. **ERP TechCorp** - €185.000 (85%)\n2. **CRM MegaStore** - €42.000 (75%)\n3. **Consulenza DataFlow** - €28.500 (72%)"}

event: message_end
data: {"messageId":"msg_xyz789","usage":{"promptTokens":340,"completionTokens":128}}
```

### 4.8 Admin API

Gestione utenti, ruoli, permessi, impostazioni tenant e audit log.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/admin/users` | Lista utenti del tenant |
| POST | `/v2/admin/users` | Creazione utente (invito) |
| GET | `/v2/admin/users/:id` | Dettaglio utente |
| PUT | `/v2/admin/users/:id` | Aggiornamento utente |
| PATCH | `/v2/admin/users/:id/status` | Attivazione/disattivazione utente |
| DELETE | `/v2/admin/users/:id` | Rimozione utente dal tenant |
| GET | `/v2/admin/roles` | Lista ruoli disponibili |
| POST | `/v2/admin/roles` | Creazione ruolo personalizzato |
| PUT | `/v2/admin/roles/:id` | Aggiornamento ruolo e permessi |
| DELETE | `/v2/admin/roles/:id` | Eliminazione ruolo personalizzato |
| GET | `/v2/admin/permissions` | Lista permessi disponibili nel sistema |
| GET | `/v2/admin/tenant/settings` | Impostazioni tenant corrente |
| PUT | `/v2/admin/tenant/settings` | Aggiornamento impostazioni tenant |
| GET | `/v2/admin/audit-log` | Registro audit con filtri avanzati |
| GET | `/v2/admin/audit-log/:id` | Dettaglio singola voce audit |
| POST | `/v2/admin/api-keys` | Generazione nuova API key |
| GET | `/v2/admin/api-keys` | Lista API key attive |
| DELETE | `/v2/admin/api-keys/:id` | Revoca API key |

**Audit log con filtri - Richiesta:**

```http
GET /v2/admin/audit-log?filter=action==contact.create;userId==usr_b2c3d4e5;createdAt>=2026-03-01&sort=createdAt:desc&limit=10 HTTP/1.1
Host: api.crmpro360.eu
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Tenant-ID: tn_a1b2c3d4
```

**Risposta (200 OK):**

```json
{
  "data": [
    {
      "id": "aud_f1e2d3c4",
      "action": "contact.create",
      "resourceType": "contact",
      "resourceId": "cnt_1a2b3c4d",
      "userId": "usr_b2c3d4e5",
      "userName": "Marco Rossi",
      "ipAddress": "93.42.118.201",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "changes": {
        "firstName": { "old": null, "new": "Alessandro" },
        "lastName": { "old": null, "new": "Moretti" },
        "email": { "old": null, "new": "a.moretti@esempio.it" }
      },
      "metadata": {
        "source": "web_ui",
        "sessionId": "sess_a1b2c3"
      },
      "createdAt": "2026-03-24T10:30:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6ImF1ZF9mMWUyZDNjNCJ9",
    "limit": 10,
    "hasMore": true
  }
}
```

### 4.9 Webhooks API

Configurazione e gestione sottoscrizioni webhook per notifiche evento in tempo reale.

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/v2/webhooks` | Lista sottoscrizioni webhook attive |
| POST | `/v2/webhooks` | Creazione sottoscrizione webhook |
| GET | `/v2/webhooks/:id` | Dettaglio sottoscrizione |
| PUT | `/v2/webhooks/:id` | Aggiornamento sottoscrizione |
| DELETE | `/v2/webhooks/:id` | Eliminazione sottoscrizione |
| POST | `/v2/webhooks/:id/test` | Invio evento di test al webhook |
| GET | `/v2/webhooks/:id/deliveries` | Storico consegne con esito |
| POST | `/v2/webhooks/:id/deliveries/:deliveryId/retry` | Ripetizione consegna fallita |

#### Tabella eventi webhook

| Evento | Descrizione | Payload contiene |
|--------|-------------|------------------|
| `contact.created` | Nuovo contatto creato | Contatto completo |
| `contact.updated` | Contatto aggiornato | Contatto + campi modificati (diff) |
| `contact.deleted` | Contatto eliminato | ID contatto + timestamp |
| `contact.merged` | Contatti unificati | ID sopravvissuto + ID eliminati |
| `account.created` | Nuovo account creato | Account completo |
| `account.updated` | Account aggiornato | Account + diff |
| `account.deleted` | Account eliminato | ID account |
| `deal.created` | Nuovo deal creato | Deal completo |
| `deal.updated` | Deal aggiornato | Deal + diff |
| `deal.stage_changed` | Cambio fase deal | Deal + fase precedente + fase nuova |
| `deal.won` | Deal vinto (chiuso positivo) | Deal completo |
| `deal.lost` | Deal perso (chiuso negativo) | Deal + motivo perdita |
| `deal.deleted` | Deal eliminato | ID deal |
| `ticket.created` | Nuovo ticket creato | Ticket completo |
| `ticket.updated` | Ticket aggiornato | Ticket + diff |
| `ticket.assigned` | Ticket assegnato a operatore | Ticket + operatore precedente/nuovo |
| `ticket.status_changed` | Cambio stato ticket | Ticket + stato precedente/nuovo |
| `ticket.sla_breach` | Violazione SLA ticket | Ticket + dettagli SLA |
| `ticket.comment_added` | Nuovo commento su ticket | Ticket ID + commento |
| `campaign.sent` | Campagna inviata | Campagna + conteggio destinatari |
| `campaign.completed` | Campagna completata (tutti i delivery) | Campagna + metriche finali |
| `user.created` | Nuovo utente aggiunto al tenant | Utente (senza password) |
| `user.deactivated` | Utente disattivato | ID utente + timestamp |
| `ai.enrichment_completed` | Arricchimento AI completato | Risorsa arricchita + campi aggiunti |

#### Schema payload webhook

```json
{
  "id": "evt_a1b2c3d4e5f6",
  "type": "deal.stage_changed",
  "tenantId": "tn_a1b2c3d4",
  "timestamp": "2026-03-24T14:30:00Z",
  "data": {
    "deal": {
      "id": "deal_x1y2z3w4",
      "title": "Implementazione ERP - TechCorp Italia",
      "amount": 185000.00,
      "currency": "EUR"
    },
    "previousStage": {
      "id": "stg_qualification",
      "name": "Qualificazione"
    },
    "newStage": {
      "id": "stg_proposal",
      "name": "Proposta"
    },
    "changedBy": "usr_b2c3d4e5"
  }
}
```

#### Verifica firma webhook

Ogni consegna include un header `X-Webhook-Signature` calcolato con HMAC-SHA256:

```
X-Webhook-Signature: sha256=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

Algoritmo di verifica (pseudocodice):

```python
import hmac, hashlib

def verify_signature(payload_body: bytes, secret: str, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        payload_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

---

## 5. GraphQL API

Endpoint GraphQL disponibile su `https://api.crmpro360.eu/v2/graphql`. Utilizza la stessa autenticazione Bearer JWT e header `X-Tenant-ID` delle API REST.

### Schema principale (tipi)

```graphql
type Contact {
  id: ID!
  firstName: String!
  lastName: String!
  email: String
  phone: String
  mobile: String
  jobTitle: String
  account: Account
  status: ContactStatus!
  leadScore: Int
  tags: [String!]!
  customFields: JSON
  activities(limit: Int, cursor: String): ActivityConnection!
  deals: [Deal!]!
  tickets: [Ticket!]!
  timeline(limit: Int, cursor: String): TimelineConnection!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Account {
  id: ID!
  name: String!
  industry: String
  website: String
  annualRevenue: Float
  employeeCount: Int
  parentAccount: Account
  children: [Account!]!
  contacts(limit: Int, cursor: String): ContactConnection!
  deals(limit: Int, cursor: String): DealConnection!
  address: Address
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Deal {
  id: ID!
  title: String!
  pipeline: Pipeline!
  stage: Stage!
  amount: Float!
  currency: String!
  probability: Int!
  weightedAmount: Float!
  expectedCloseDate: Date
  account: Account
  contacts: [Contact!]!
  owner: User!
  status: DealStatus!
  daysInStage: Int!
  tags: [String!]!
  activities(limit: Int, cursor: String): ActivityConnection!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Ticket {
  id: ID!
  subject: String!
  description: String
  priority: TicketPriority!
  status: TicketStatus!
  assignee: User
  requester: Contact
  account: Account
  sla: SLAStatus
  comments(limit: Int, cursor: String): CommentConnection!
  tags: [String!]!
  createdAt: DateTime!
  updatedAt: DateTime!
  resolvedAt: DateTime
}

enum ContactStatus { ACTIVE, INACTIVE, PROSPECT, LEAD, CUSTOMER }
enum DealStatus { OPEN, WON, LOST }
enum TicketPriority { LOW, MEDIUM, HIGH, URGENT }
enum TicketStatus { OPEN, PENDING, IN_PROGRESS, RESOLVED, CLOSED }
```

### Query - esempi

**Query annidata: contatti con deal e account**

```graphql
query ContactsWithDeals($filter: ContactFilter, $limit: Int) {
  contacts(filter: $filter, limit: $limit, sort: { field: CREATED_AT, direction: DESC }) {
    edges {
      node {
        id
        firstName
        lastName
        email
        leadScore
        account {
          id
          name
          industry
        }
        deals {
          id
          title
          amount
          stage {
            name
          }
          probability
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

**Query con aggregazioni:**

```graphql
query DealsFunnel($pipelineId: ID!, $dateRange: DateRangeInput!) {
  dealsFunnel(pipelineId: $pipelineId, dateRange: $dateRange) {
    stages {
      id
      name
      dealCount
      totalValue
      averageDaysInStage
      conversionRate
    }
    summary {
      totalDeals
      totalValue
      overallConversionRate
      averageSalesCycle
    }
  }
}
```

### Mutation - esempi

**Creazione contatto:**

```graphql
mutation CreateContact($input: CreateContactInput!) {
  createContact(input: $input) {
    contact {
      id
      firstName
      lastName
      email
      status
      createdAt
    }
    errors {
      field
      code
      message
    }
  }
}
```

**Cambio fase deal:**

```graphql
mutation UpdateDealStage($dealId: ID!, $stageId: ID!, $notes: String) {
  updateDealStage(dealId: $dealId, stageId: $stageId, notes: $notes) {
    deal {
      id
      title
      stage {
        id
        name
        order
      }
      daysInStage
      updatedAt
    }
    previousStage {
      id
      name
    }
  }
}
```

### Subscription - esempi

**Cambio fase deal in tempo reale:**

```graphql
subscription OnDealStageChanged($pipelineId: ID) {
  dealStageChanged(pipelineId: $pipelineId) {
    deal {
      id
      title
      amount
      stage {
        id
        name
      }
    }
    previousStage {
      id
      name
    }
    changedBy {
      id
      name
    }
    timestamp
  }
}
```

**Nuovo ticket creato:**

```graphql
subscription OnNewTicket($priority: [TicketPriority!]) {
  ticketCreated(priority: $priority) {
    ticket {
      id
      subject
      priority
      requester {
        id
        firstName
        lastName
      }
      account {
        id
        name
      }
    }
    timestamp
  }
}
```

### Strategia Federation per microservizi

L'API GraphQL utilizza Apollo Federation v2 per comporre lo schema da microservizi indipendenti:

| Subgraph | Responsabilita | Entita chiave |
|----------|---------------|---------------|
| `contacts-subgraph` | Contatti e account | Contact, Account |
| `sales-subgraph` | Pipeline, deal, forecast | Deal, Pipeline, Stage |
| `marketing-subgraph` | Campagne, template, workflow | Campaign, EmailTemplate |
| `support-subgraph` | Ticket, SLA, commenti | Ticket, Comment |
| `analytics-subgraph` | Dashboard, report, KPI | Dashboard, Report |
| `ai-subgraph` | Lead scoring, previsioni, chat | AIConversation, Prediction |
| `admin-subgraph` | Utenti, ruoli, audit | User, Role, AuditEntry |

Ogni subgraph estende le entita condivise con la direttiva `@key`:

```graphql
# sales-subgraph estende Contact definito in contacts-subgraph
extend type Contact @key(fields: "id") {
  id: ID! @external
  deals: [Deal!]! @requires(fields: "id")
}
```

Il gateway Apollo Router gestisce query planning, risoluzione distribuita e caching a livello di federation.

---

## 6. Rate Limiting

### Limiti per piano tariffario

| Piano | Richieste/minuto | Richieste/giorno | Burst massimo | AI requests/giorno |
|-------|-----------------|-------------------|---------------|-------------------|
| Professional | 100 | 5.000 | 150 | 500 |
| Business | 500 | 25.000 | 750 | 2.500 |
| Enterprise | 2.000 | Illimitato | 3.000 | 25.000 |

### Algoritmo Token Bucket

Il rate limiting utilizza l'algoritmo token bucket per gestire burst controllati:

- Ogni tenant ha un bucket con capacita pari al limite burst del piano
- I token vengono aggiunti al bucket a frequenza costante (richieste/minuto diviso 60 = token/secondo)
- Ogni richiesta consuma un token
- Se il bucket e vuoto, la richiesta viene rifiutata con status 429
- Endpoint AI consumano 5 token per richiesta (operazioni computazionalmente costose)
- Endpoint di export/import consumano 10 token per richiesta

### Risposta 429 (Rate Limit Exceeded)

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711324812

{
  "type": "https://api.crmpro360.eu/errors/rate-limit-exceeded",
  "title": "Limite di richieste superato",
  "status": 429,
  "detail": "Hai superato il limite di 100 richieste al minuto per il piano Professional. Riprova tra 12 secondi.",
  "instance": "/v2/contacts",
  "traceId": "req_rate_429_abc123",
  "timestamp": "2026-03-24T10:30:00Z",
  "retryAfter": 12
}
```

---

## 7. Strategia di Versioning

### Versioning URL path

Le API utilizzano versioning nel path URL per garantire compatibilita retroattiva:

```
https://api.crmpro360.eu/v1/{resource}   # Versione legacy (deprecata)
https://api.crmpro360.eu/v2/{resource}   # Versione corrente
```

### Politica di deprecazione

- **Finestra di sunset:** 12 mesi dalla data di annuncio deprecazione alla rimozione
- **Header Sunset:** ogni risposta da endpoint deprecati include l'header `Sunset` (RFC 8594)
- **Header Deprecation:** indica che l'endpoint e deprecato con link alla documentazione

```http
HTTP/1.1 200 OK
Sunset: Sat, 24 Mar 2027 00:00:00 GMT
Deprecation: true
Link: <https://docs.crmpro360.eu/migration/v1-to-v2>; rel="deprecation"
```

### Definizione breaking vs non-breaking changes

**Breaking changes** (richiedono nuova versione major):

- Rimozione di un endpoint o metodo HTTP
- Rimozione di un campo dalla risposta
- Modifica del tipo di dato di un campo esistente
- Aggiunta di un parametro obbligatorio
- Modifica della semantica di un campo esistente
- Modifica dei codici di errore per uno scenario esistente

**Non-breaking changes** (compatibili all'interno della stessa versione):

- Aggiunta di nuovi endpoint
- Aggiunta di campi opzionali alla richiesta
- Aggiunta di nuovi campi alla risposta
- Aggiunta di nuovi valori enum (se il client gestisce valori sconosciuti)
- Aggiunta di nuovi header opzionali
- Miglioramento dei messaggi di errore (testo, non codice)

### Guida migrazione v1 -> v2

Principali differenze tra v1 e v2:

| Aspetto | v1 | v2 |
|---------|----|----|
| Paginazione | Offset-based (`?page=2&per_page=25`) | Cursor-based (`?cursor=xxx&limit=25`) |
| Filtraggio | Query param singoli (`?status=active`) | RSQL (`?filter=status==active`) |
| Error format | Proprietario `{ error: string }` | RFC 7807 `application/problem+json` |
| ID format | Auto-increment numerico | Prefixed string (`cnt_`, `deal_`, `acc_`) |
| Timestamp | Unix epoch (secondi) | ISO 8601 con timezone (`Z`) |
| Envelope risposta | `{ results: [], total: N }` | `{ data: [], pagination: { ... } }` |
| Multi-tenant | Query param `?tenant_id=` | Header `X-Tenant-ID` |

---

## 8. SDK e Developer Experience

### SDK ufficiali

| Linguaggio | Package | Versione minima runtime |
|------------|---------|------------------------|
| TypeScript/JavaScript | `@crmpro360/sdk` | Node.js 20+ / Browser ES2022 |
| Python | `crmpro360-sdk` | Python 3.11+ |
| Java | `eu.crmpro360:sdk` | Java 17+ |
| .NET | `CrmPro360.Sdk` | .NET 8+ |
| Go | `github.com/crmpro360/sdk-go` | Go 1.22+ |

### Esempi di codice SDK

**TypeScript - Creazione contatto e ricerca deal:**

```typescript
import { CrmPro360Client } from '@crmpro360/sdk';

const client = new CrmPro360Client({
  baseUrl: 'https://api.crmpro360.eu',
  apiKey: process.env.CRMPRO360_API_KEY,
  tenantId: 'tn_a1b2c3d4',
});

// Creazione contatto
const contact = await client.contacts.create({
  firstName: 'Luca',
  lastName: 'Verdi',
  email: 'l.verdi@azienda.it',
  jobTitle: 'CTO',
  accountId: 'acc_d4e5f6a7',
  tags: ['tech', 'decision-maker'],
});

console.log(`Contatto creato: ${contact.id}`);

// Ricerca deal con filtri
const deals = await client.deals.list({
  filter: 'probability>=70;stage.name==Proposta',
  sort: 'amount:desc',
  limit: 10,
});

for (const deal of deals.data) {
  console.log(`${deal.title}: €${deal.amount} (${deal.probability}%)`);
}

// Streaming AI chat
const stream = client.ai.chat({
  conversationId: 'conv_new',
  message: 'Quali deal sono a rischio questo trimestre?',
});

for await (const event of stream) {
  if (event.type === 'content_delta') {
    process.stdout.write(event.delta);
  }
}
```

**Python - Lead scoring e previsione churn:**

```python
from crmpro360 import CrmPro360Client
import os

client = CrmPro360Client(
    base_url="https://api.crmpro360.eu",
    api_key=os.environ["CRMPRO360_API_KEY"],
    tenant_id="tn_a1b2c3d4",
)

# Lead scoring per un contatto
score = client.ai.lead_score(contact_id="cnt_1a2b3c4d")
print(f"Lead score: {score.value}/100 (confidenza: {score.confidence}%)")
print(f"Fattori principali: {', '.join(score.factors[:3])}")

# Previsione churn per account
churn = client.ai.churn_predict(account_id="acc_d4e5f6a7")
print(f"Rischio churn: {churn.risk_level} ({churn.probability}%)")
print(f"Segnali: {churn.signals}")

# Paginazione automatica su tutti i contatti
for contact in client.contacts.list_all(
    filter="status==active;leadScore>=50",
    sort="leadScore:desc",
):
    print(f"{contact.first_name} {contact.last_name}: score {contact.lead_score}")

# Export contatti in CSV
export_job = client.contacts.export(format="csv", filter="status==active")
export_job.wait_for_completion(timeout=300)
export_job.download("contatti_attivi.csv")
```

### API Playground

Interfaccia Swagger UI interattiva disponibile su:

```
https://api.crmpro360.eu/api/docs          # Swagger UI
https://api.crmpro360.eu/api/docs-json      # Specifica OpenAPI 3.1 (JSON)
https://api.crmpro360.eu/api/docs-yaml      # Specifica OpenAPI 3.1 (YAML)
```

Funzionalita del playground:
- Autenticazione integrata (inserisci Bearer token)
- Selezione tenant tramite header
- Esecuzione richieste live con visualizzazione risposta
- Schema validation dei parametri
- Esempi di richiesta/risposta per ogni endpoint

### Postman Collection

Collection Postman disponibile per importazione diretta:

```
https://api.crmpro360.eu/postman/crmpro360-v2.postman_collection.json
```

La collection include:
- Variabili di ambiente pre-configurate (`{{base_url}}`, `{{api_key}}`, `{{tenant_id}}`)
- Cartelle organizzate per modulo (Contacts, Deals, Tickets, AI, Admin)
- Pre-request script per autenticazione automatica
- Test assertions per validazione risposte
- Flussi end-to-end (creazione account -> contatto -> deal -> chiusura)

### Generazione OpenAPI da NestJS

La specifica OpenAPI 3.1 viene generata automaticamente dai decorator NestJS:

```typescript
// Esempio: decorator su controller NestJS
@ApiTags('contacts')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-ID', required: true })
@Controller('v2/contacts')
export class ContactsController {

  @Post()
  @ApiOperation({ summary: 'Creazione nuovo contatto' })
  @ApiBody({ type: CreateContactDto })
  @ApiResponse({ status: 201, type: ContactResponseDto })
  @ApiResponse({ status: 400, type: ProblemDetailDto })
  @ApiResponse({ status: 409, description: 'Contatto duplicato' })
  async create(@Body() dto: CreateContactDto): Promise<ContactResponseDto> {
    // ...
  }
}
```

La specifica viene rigenerata ad ogni deploy e pubblicata sugli endpoint `/api/docs-json` e `/api/docs-yaml`. I client SDK vengono generati automaticamente dalla specifica OpenAPI tramite pipeline CI/CD con `openapi-generator`.
