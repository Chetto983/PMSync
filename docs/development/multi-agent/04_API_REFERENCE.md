# 🔌 API Reference - Sistema Multi-Agent

## 📋 Indice

- [1. Autenticazione](#1-autenticazione)
- [2. Multi-Agent Endpoints](#2-multi-agent-endpoints)
- [3. HITL Endpoints](#3-hitl-endpoints)
- [4. Feedback Endpoints](#4-feedback-endpoints)
- [5. Modelli Dati](#5-modelli-dati)
- [6. Codici Errore](#6-codici-errore)
- [7. Rate Limiting](#7-rate-limiting)
- [8. Esempi SDK](#8-esempi-sdk)

---

## 1. Autenticazione

### JWT Token

Tutti gli endpoint richiedono autenticazione tramite JWT token nell'header `Authorization`.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Ottenere un token:**

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "tenantId": "tenant_abc"
  }
}
```

**Riferimenti:**
- [JWT.io](https://jwt.io/) - JWT debugger
- [RFC 7519](https://tools.ietf.org/html/rfc7519) - JWT specification

---

## 2. Multi-Agent Endpoints

### 2.1 Create Session

Crea una nuova sessione multi-agente.

**Endpoint:**
```
POST /ai/multi-agent/session
```

**Request:**
```http
POST /ai/multi-agent/session HTTP/1.1
Host: api.mailagent.com
Authorization: Bearer {token}
Content-Type: application/json

{}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "session": {
    "id": "session_abc123",
    "tenantId": "tenant_abc",
    "userId": "user_123",
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST https://api.mailagent.com/ai/multi-agent/session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### 2.2 Get Session

Recupera una sessione esistente con la cronologia.

**Endpoint:**
```
GET /ai/multi-agent/session/:id
```

**Parameters:**
- `id` (path): ID della sessione

**Response:** `200 OK`
```json
{
  "success": true,
  "session": {
    "id": "session_abc123",
    "tenantId": "tenant_abc",
    "userId": "user_123",
    "messages": [
      {
        "role": "user",
        "content": "Rispondi a john@example.com"
      },
      {
        "role": "assistant",
        "content": "Ho preparato una bozza di risposta...",
        "steps": [
          {
            "tool": "knowledge_search",
            "output": "Found 3 relevant emails..."
          }
        ]
      }
    ],
    "createdAt": "2025-01-20T10:00:00Z",
    "updatedAt": "2025-01-20T10:15:00Z"
  }
}
```

**cURL Example:**
```bash
curl -X GET https://api.mailagent.com/ai/multi-agent/session/session_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2.3 Send Message

Invia un messaggio all'orchestratore multi-agente.

**Endpoint:**
```
POST /ai/multi-agent/message
```

**Request:**
```json
{
  "sessionId": "session_abc123",
  "message": "Genera una smart reply per l'email da john@example.com"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "sessionId": "session_abc123",
  "messages": [
    "Ho analizzato l'email da john@example.com.",
    "Ho generato 3 suggerimenti di risposta:",
    "1. Gentile John, grazie per...",
    "2. Ciao John! Ti rispondo subito...",
    "3. John, ho ricevuto la tua email..."
  ],
  "actions": [
    {
      "type": "SEND_EMAIL",
      "payload": {
        "to": "john@example.com",
        "subject": "Re: Meeting follow-up",
        "body": "Gentile John, grazie per..."
      },
      "confidence": 0.85,
      "adjustedConfidence": 0.95,
      "severity": "MEDIUM",
      "reasoningSteps": "Generated smart reply based on email context and RAG search",
      "learningContext": {
        "originalConfidence": 0.85,
        "boost": 0.10,
        "profileAttempts": 25
      }
    }
  ],
  "pendingActions": [
    {
      "id": "action_xyz789",
      "type": "SEND_EMAIL",
      "status": "PENDING",
      "confidence": 0.95,
      "createdAt": "2025-01-20T10:16:00Z"
    }
  ],
  "metadata": {
    "intent": "EMAIL",
    "agentUsed": "EmailAgent",
    "executionTimeMs": 1250
  }
}
```

**cURL Example:**
```bash
curl -X POST https://api.mailagent.com/ai/multi-agent/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_abc123",
    "message": "Reply to john@example.com"
  }'
```

**Riferimenti:**
- [LangChain Agents](https://python.langchain.com/docs/modules/agents/) - Agent architecture
- [Mistral API](https://docs.mistral.ai/api/) - LLM integration

---

## 3. HITL Endpoints

### 3.1 List Pending Actions

Recupera tutte le azioni in attesa di approvazione.

**Endpoint:**
```
GET /ai/hitl/actions
```

**Query Parameters:**
- `status` (optional): Filter by status (`PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`)
- `limit` (optional): Max results (default: 50, max: 100)

**Response:** `200 OK`
```json
{
  "success": true,
  "actions": [
    {
      "id": "action_xyz789",
      "sessionId": "session_abc123",
      "tenantId": "tenant_abc",
      "userId": "user_123",
      "type": "SEND_EMAIL",
      "payload": {
        "to": "john@example.com",
        "subject": "Re: Meeting",
        "body": "Hi John..."
      },
      "confidence": 0.85,
      "adjustedConfidence": 0.95,
      "severity": "MEDIUM",
      "status": "PENDING",
      "reasoningSteps": "Generated based on...",
      "createdAt": "2025-01-20T10:16:00Z"
    }
  ]
}
```

**cURL Example:**
```bash
curl -X GET "https://api.mailagent.com/ai/hitl/actions?status=PENDING&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3.2 Approve Action

Approva un'azione proposta dall'agente.

**Endpoint:**
```
POST /ai/hitl/actions/:id/approve
```

**Parameters:**
- `id` (path): ID dell'azione

**Request:** (optional)
```json
{
  "modifiedPayload": {
    "to": "john@example.com",
    "subject": "Re: Meeting (modified)",
    "body": "User modified body..."
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "action": {
    "id": "action_xyz789",
    "status": "APPROVED",
    "approvedAt": "2025-01-20T10:20:00Z",
    "approvedBy": "user_123",
    "executedAt": "2025-01-20T10:20:05Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST https://api.mailagent.com/ai/hitl/actions/action_xyz789/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 3.3 Reject Action

Rifiuta un'azione proposta.

**Endpoint:**
```
POST /ai/hitl/actions/:id/reject
```

**Request:**
```json
{
  "reason": "Email body not appropriate for this context"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "action": {
    "id": "action_xyz789",
    "status": "REJECTED",
    "rejectedAt": "2025-01-20T10:20:00Z",
    "rejectedBy": "user_123",
    "rejectionReason": "Email body not appropriate..."
  }
}
```

**cURL Example:**
```bash
curl -X POST https://api.mailagent.com/ai/hitl/actions/action_xyz789/reject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Not appropriate"
  }'
```

---

## 4. Feedback Endpoints

### 4.1 Get Feedback Stats

Recupera statistiche sul sistema di feedback.

**Endpoint:**
```
GET /ai/feedback/stats
```

**Query Parameters:**
- `agentName` (optional): Filter by agent
- `actionType` (optional): Filter by action type
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "approved": 135,
    "rejected": 15,
    "executed": 135,
    "successful": 130,
    "approvalRate": 0.90,
    "executionRate": 0.90,
    "successRate": 0.96
  }
}
```

**cURL Example:**
```bash
curl -X GET "https://api.mailagent.com/ai/feedback/stats?agentName=EmailAgent&startDate=2025-01-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4.2 Get Top Agents

Recupera gli agenti con le migliori performance.

**Endpoint:**
```
GET /ai/feedback/top-agents
```

**Query Parameters:**
- `limit` (optional): Number of results (default: 10)

**Response:** `200 OK`
```json
{
  "success": true,
  "agents": [
    {
      "agentName": "EmailAgent",
      "actionType": "SEND_EMAIL",
      "successRate": 0.96,
      "approvalRate": 0.90,
      "totalAttempts": 150,
      "confidenceBoost": 0.15
    },
    {
      "agentName": "CalendarAgent",
      "actionType": "CREATE_EVENT",
      "successRate": 0.92,
      "approvalRate": 0.85,
      "totalAttempts": 80,
      "confidenceBoost": 0.10
    }
  ]
}
```

---

### 4.3 Rate Action (Manual Feedback)

Permette all'utente di dare feedback esplicito su un'azione.

**Endpoint:**
```
POST /ai/feedback/rate
```

**Request:**
```json
{
  "actionId": "action_xyz789",
  "rating": 5,
  "feedback": "Perfect response, very helpful!"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "feedback": {
    "id": "feedback_abc",
    "actionId": "action_xyz789",
    "userRating": 5,
    "userFeedback": "Perfect response...",
    "createdAt": "2025-01-20T10:25:00Z"
  }
}
```

---

### 4.4 Get Confidence Trend

Visualizza il trend della confidence nel tempo.

**Endpoint:**
```
GET /ai/feedback/trend
```

**Query Parameters:**
- `agentName` (optional): Filter by agent
- `actionType` (optional): Filter by action type
- `days` (optional): Days to look back (default: 30)

**Response:** `200 OK`
```json
{
  "success": true,
  "trend": [
    {
      "date": "2025-01-15",
      "avgConfidence": 0.82,
      "approvalRate": 0.85,
      "count": 15
    },
    {
      "date": "2025-01-16",
      "avgConfidence": 0.84,
      "approvalRate": 0.88,
      "count": 18
    },
    {
      "date": "2025-01-17",
      "avgConfidence": 0.87,
      "approvalRate": 0.91,
      "count": 22
    }
  ]
}
```

---

## 5. Modelli Dati

### AgentAction

```typescript
interface AgentAction {
  type: string;                      // 'SEND_EMAIL', 'CREATE_EVENT', etc.
  payload: Record<string, any>;      // Action-specific data
  confidence: number;                // 0.0 - 1.0 (original confidence)
  adjustedConfidence?: number;       // 0.0 - 1.0 (after learning boost)
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoningSteps?: string;           // LLM reasoning
  learningContext?: {
    originalConfidence: number;
    boost: number;
    profileAttempts: number;
  };
}
```

### AgentResult

```typescript
interface AgentResult {
  messages: string[];                // User-facing messages
  actions: AgentAction[];            // Proposed actions (HITL)
  metadata?: {
    intent?: string;
    agentUsed?: string;
    executionTimeMs?: number;
  };
}
```

### AgentPendingAction (Database)

```typescript
interface AgentPendingAction {
  id: string;
  sessionId: string;
  userId: string;
  tenantId: string;
  type: string;
  payload: Json;
  confidence: number;
  severity: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED';
  reasoningSteps?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
  executedAt?: Date;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
}
```

### AgentActionFeedback (Database)

```typescript
interface AgentActionFeedback {
  id: string;
  actionId: string;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  wasApproved: boolean;
  wasExecuted: boolean;
  wasSuccessful?: boolean;
  originalConfidence: number;
  adjustedConfidence?: number;
  userFeedback?: string;
  userRating?: number;              // 1-5 stars
  executionTimeMs?: number;
  errorMessage?: string;
  contextSnapshot?: Json;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 6. Codici Errore

### 4xx Client Errors

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request format or parameters |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Access denied (wrong tenant/user) |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |

**Example 401 Response:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid or expired token"
}
```

### 5xx Server Errors

| Code | Status | Description |
|------|--------|-------------|
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Mistral AI API error |
| 503 | Service Unavailable | Database or Redis unavailable |
| 504 | Gateway Timeout | Request timeout (LLM call too slow) |

**Example 502 Response:**
```json
{
  "success": false,
  "statusCode": 502,
  "message": "External service error",
  "error": "Mistral API returned 503",
  "details": {
    "service": "mistral",
    "statusCode": 503
  }
}
```

**Riferimenti:**
- [HTTP Status Codes](https://httpstatuses.com/) - Complete reference
- [RFC 7231](https://tools.ietf.org/html/rfc7231) - HTTP semantics

---

## 7. Rate Limiting

### Limiti per Endpoint

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/ai/multi-agent/message` | 60 req | 1 minute |
| `/ai/hitl/actions/*` | 120 req | 1 minute |
| `/ai/feedback/*` | 180 req | 1 minute |
| All others | 300 req | 1 minute |

### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1642684800
```

**429 Response:**
```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

**Riferimenti:**
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques) - Google Cloud guide

---

## 8. Esempi SDK

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.mailagent.com',
  headers: {
    'Authorization': `Bearer ${YOUR_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Create session
const { data: sessionData } = await client.post('/ai/multi-agent/session');
const sessionId = sessionData.session.id;

// Send message
const { data: messageData } = await client.post('/ai/multi-agent/message', {
  sessionId,
  message: 'Reply to john@example.com'
});

console.log('Agent response:', messageData.messages);
console.log('Pending actions:', messageData.pendingActions);

// Approve action
if (messageData.pendingActions.length > 0) {
  const actionId = messageData.pendingActions[0].id;
  await client.post(`/ai/hitl/actions/${actionId}/approve`);
}
```

### Python

```python
import requests

class MailAgentClient:
    def __init__(self, token: str, base_url: str = "https://api.mailagent.com"):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    def create_session(self):
        r = requests.post(
            f"{self.base_url}/ai/multi-agent/session",
            headers=self.headers
        )
        r.raise_for_status()
        return r.json()["session"]["id"]

    def send_message(self, session_id: str, message: str):
        r = requests.post(
            f"{self.base_url}/ai/multi-agent/message",
            headers=self.headers,
            json={"sessionId": session_id, "message": message}
        )
        r.raise_for_status()
        return r.json()

    def approve_action(self, action_id: str):
        r = requests.post(
            f"{self.base_url}/ai/hitl/actions/{action_id}/approve",
            headers=self.headers
        )
        r.raise_for_status()
        return r.json()

# Usage
client = MailAgentClient(token="YOUR_TOKEN")
session_id = client.create_session()
result = client.send_message(session_id, "Reply to john@example.com")

if result["pendingActions"]:
    action_id = result["pendingActions"][0]["id"]
    client.approve_action(action_id)
```

### cURL (Bash script)

```bash
#!/bin/bash

TOKEN="YOUR_TOKEN_HERE"
BASE_URL="https://api.mailagent.com"

# Create session
SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/ai/multi-agent/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session.id')
echo "Created session: $SESSION_ID"

# Send message
MESSAGE_RESPONSE=$(curl -s -X POST "$BASE_URL/ai/multi-agent/message" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"message\": \"Reply to john@example.com\"}")

echo "Agent response:"
echo $MESSAGE_RESPONSE | jq '.messages'

# Approve first pending action
ACTION_ID=$(echo $MESSAGE_RESPONSE | jq -r '.pendingActions[0].id')
if [ "$ACTION_ID" != "null" ]; then
  curl -X POST "$BASE_URL/ai/hitl/actions/$ACTION_ID/approve" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json"
  echo "Approved action: $ACTION_ID"
fi
```

---

## 📚 Riferimenti Esterni

### API Design
- **[REST API Tutorial](https://restfulapi.net/)** - Best practices
- **[OpenAPI Specification](https://swagger.io/specification/)** - API documentation standard
- **[API Design Patterns](https://www.apiscene.io/api-design/)** - Common patterns

### Testing Tools
- **[Postman](https://www.postman.com/)** - API testing platform
- **[Insomnia](https://insomnia.rest/)** - REST client
- **[HTTPie](https://httpie.io/)** - Command-line HTTP client

### SDKs & Libraries
- **[Axios](https://axios-http.com/)** - HTTP client for Node.js/Browser
- **[Requests](https://requests.readthedocs.io/)** - HTTP library for Python
- **[Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)** - Browser native

---

**Versione API:** v1.0.0
**Ultimo aggiornamento:** 2025-11-20
**Base URL (Production):** `https://api.mailagent.com`
**Base URL (Staging):** `https://staging-api.mailagent.com`
**Base URL (Development):** `http://localhost:3000`

**Swagger UI:** [https://api.mailagent.com/api/docs](https://api.mailagent.com/api/docs)

---

**Vedi anche:**
- [INDEX.md](./INDEX.md) - Indice generale
- [01_ROADMAP_DETTAGLIATA.md](./01_ROADMAP_DETTAGLIATA.md) - Roadmap implementazione
- [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) - Architettura sistema

## External References (planning)
- OpenAPI/Swagger basics: https://swagger.io/specification/
- NestJS controllers/validation: https://docs.nestjs.com/controllers
- Rate limiting patterns: https://docs.nestjs.com/security/rate-limiting
- JWT best practices: https://datatracker.ietf.org/doc/html/rfc7519
- API testing (supertest): https://github.com/ladjs/supertest
- Proactive assistant patterns (for conversational APIs): https://blog.langchain.dev/plan-and-execute-agents/; https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler
- TypeScript/NestJS specifics: https://docs.nestjs.com/openapi/introduction (NestJS Swagger); https://github.com/colinhacks/zod (validation in TS); https://github.com/prisma/prisma-examples/tree/latest/typescript/rest-nestjs (Prisma + NestJS example)
- UI/UX references (API-driven UIs): https://mui.com/material-ui/react-card/ (cards), https://mui.com/material-ui/react-data-grid/ (tables/lists), https://notistack.com/ (snackbars/alerts)

