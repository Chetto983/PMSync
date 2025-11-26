# API Reference - Sistema Multi-Agent (v1)

## Indice
- [1. Autenticazione](#1-autenticazione)
- [2. Multi-Agent Endpoints](#2-multi-agent-endpoints)
- [3. HITL Endpoints](#3-hitl-endpoints)
- [4. Feedback Endpoints](#4-feedback-endpoints)
- [5. Rate Limiting](#5-rate-limiting)
- [6. Esempi SDK](#6-esempi-sdk)

---

## 1. Autenticazione
Tutti gli endpoint richiedono il header `Authorization: Bearer <token>`.

---

## 2. Multi-Agent Endpoints

### 2.1 Process Message (session gestita dal server)
Invia un messaggio all'orchestratore. Se `sessionId` è omesso, il server ne crea uno e lo restituisce. Se `sessionId` non appartiene all'utente/tenant: `403 Forbidden`. `forceAgent` sconosciuto: `400 Bad Request`. L'endpoint include i risultati RAG (`knowledgeHits`) quando interviene il KnowledgeAgent.

**Endpoint**
```
POST /ai/multi-agent/process
```

**Request**
```json
{
  "sessionId": "session_abc123",
  "message": "Genera una smart reply per l'email da john@example.com",
  "forceAgent": "EmailAgent"
}
```

**Response** `200 OK`
```json
{
  "success": true,
  "sessionId": "session_abc123",
  "messages": ["..."],
  "pendingActionIds": ["action_xyz"],
  "executedActionIds": [],
  "intent": { "intent": "EMAIL", "confidence": 0.9 },
  "agentUsed": "EmailAgent",
  "knowledgeHits": [
    {
      "id": "hit1",
      "subject": "Doc 1",
      "snippet": "...",
      "score": 0.78,
      "source": "kb://handbook/onboarding",
      "metadata": { "page": 3, "tags": ["policy"] }
    }
  ],
  "executionTimeMs": 1200
}
```

---

## 3. HITL Endpoints
- `GET /ai/multi-agent/pending-actions` (filtri: `status`, `agentName`, `limit`, `offset`)
- `GET /ai/multi-agent/pending-actions/:id`
- `POST /ai/multi-agent/pending-actions/:id/approve`
- `POST /ai/multi-agent/pending-actions/:id/reject`
- `GET /ai/multi-agent/stats/action-counts`

Tutti richiedono JWT e rispettano ownership (solo admin/super-admin possono agire su altri utenti).

---

## 4. Feedback Endpoints
Gli endpoint espongono storico, approval/success rate e reset dei profili di learning. Tutti sono scoped per tenant e validano l'ownership dell'utente.

### 4.1 Storico feedback
`GET /ai/multi-agent/feedback`

Query: `limit` (default 50), `offset` (default 0), `agentName` (opzionale).

Response `200 OK`
```json
{
  "success": true,
  "total": 120,
  "limit": 50,
  "offset": 0,
  "feedback": [
    {
      "id": "fbk_123",
      "agentName": "EmailAgent",
      "actionType": "SEND_EMAIL",
      "wasApproved": true,
      "wasExecuted": true,
      "wasSuccessful": true,
      "originalConfidence": 0.62,
      "adjustedConfidence": 0.68,
      "userRating": 5,
      "userFeedback": "Ottima risposta",
      "contextSnapshot": { "messageId": "msg_1" },
      "createdAt": "2025-02-03T10:20:30.000Z",
      "action": {
        "id": "act_1",
        "actionType": "SEND_EMAIL",
        "status": "APPROVED",
        "createdAt": "2025-02-03T10:20:00.000Z"
      }
    }
  ]
}
```

### 4.2 Statistiche di learning (per utente)
`GET /ai/multi-agent/stats/learning`

Restituisce profili di learning per ciascun agente/azione, incluse confidence boost e approval/success rate derivati.

### 4.3 Statistiche aggregate (per tenant)
`GET /ai/multi-agent/stats/aggregate`

Restituisce tentativi totali, approval rate, success rate e breakdown per agente (usare per trend/rate in dashboard).

### 4.4 Statistiche feedback aggregate
`GET /ai/multi-agent/feedback/stats`

Restituisce le stesse metriche aggregate di cui sopra, derivate dai feedback registrati (totale tentativi, approval/success rate pesati, breakdown per agente). È l'endpoint da esporre in Swagger per i grafici di trend/rate.

### 4.5 Reset profilo di learning
`POST /ai/multi-agent/learning/reset`

Body:
```json
{ "agentName": "EmailAgent", "actionType": "SEND_EMAIL" }
```

Elimina il profilo di learning per l'agente (opzionalmente per `actionType`); utile dopo modifiche al modello.

---

## 5. Rate Limiting
Valori configurabili da `.env`:
- `/ai/multi-agent/process`: `AI_RATE_LIMIT_RPM` (default 60 rpm), TTL `RATE_LIMIT_TTL_MS` (default 60s).
- HITL/feedback/altro: `RATE_LIMIT_MAX` (default 300 rpm) e TTL `RATE_LIMIT_TTL_MS`.
Se superato: `429 Too Many Requests`.

---

## 6. Esempi SDK

### JavaScript/TypeScript (axios)
```ts
import axios from 'axios';
const client = axios.create({
  baseURL: 'https://api.mailagent.com',
  headers: { Authorization: `Bearer ${YOUR_TOKEN}` }
});

const { data } = await client.post('/ai/multi-agent/process', {
  message: 'Reply to john@example.com'
});
console.log(data.sessionId, data.messages);
```

### Python
```python
import requests

class MailAgentClient:
    def __init__(self, token, base_url="https://api.mailagent.com"):
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def send_message(self, message, session_id=None):
        payload = {"message": message}
        if session_id:
            payload["sessionId"] = session_id
        r = requests.post(f"{self.base_url}/ai/multi-agent/process", headers=self.headers, json=payload)
        r.raise_for_status()
        return r.json()

client = MailAgentClient(token="YOUR_TOKEN")
resp = client.send_message("Reply to john@example.com")
print(resp.get("sessionId"), resp.get("messages"))
```

### cURL
```bash
TOKEN="YOUR_TOKEN"
BASE_URL="https://api.mailagent.com"

curl -X POST "$BASE_URL/ai/multi-agent/process" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Reply to john@example.com"}'
```
