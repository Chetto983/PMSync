# Sprint — Telegram HITL (Human-in-the-Loop)

| Campo | Valore |
|-------|--------|
| **Area** | AI Chat — Telegram Integration |
| **Obiettivo** | Permettere agli utenti Telegram di approvare/rifiutare azioni AI (send_email, delete, reply, forward) tramite inline keyboard, eliminando il gap funzionale rispetto alla web UI |
| **Capacita** | 15 SP (solo dev, ~1 settimana) |
| **Prerequisiti** | Fix sanitizeMessages (commit 344c93da), AI SDK v6 tool approval flow |

---

## Problema Attuale

Quando MiniMax M2.7 chiama un tool con `needsApproval: true` (es. `send_email`, `delete_email`):
- **Web UI**: mostra bottoni Approve/Reject, utente decide, il frontend ri-invia con `tool-approval-response`
- **Telegram**: nessun meccanismo. Il tool call viene ignorato silenziosamente. L'utente non sa che l'AI voleva agire.

Tool bloccati su Telegram (sensitivity `HIGH_ONLY`):
- `send_email`, `reply_email`, `forward_email`, `delete_email` (email)
- `delete_contact` (contacts)
- `delete_event` (calendar)
- `delete_memory` (RAG)

---

## Architettura

### Flusso Attuale (broken)

```
User msg → generateChat() → MiniMax calls send_email
  → needsApproval = true → tool-approval-request in step content
  → toolResults EMPTY for that call → onStepFinish saves tool-call without result
  → agent loop exits (outputs != calls) → response text without action
  → user never knows AI wanted to send email
```

### Flusso Target

```
User: "Rispondi a Marco dicendo che va bene"
  ↓
generateChat() → MiniMax calls reply_email(to: marco@..., body: "Va bene")
  → needsApproval = true
  ↓
TelegramWebhookService detects pending approval in step result
  ↓
Stores approval state in Redis:
  telegram:approval:{actionId} → { toolCallId, toolName, args, conversationId, tenantId, userId }
  TTL: 1 hour
  ↓
Sends Telegram message:
  ┌──────────────────────────────────┐
  │ L'AI vorrebbe eseguire:         │
  │                                  │
  │ reply_email                      │
  │ A: marco@example.com            │
  │ Corpo: "Va bene"                │
  │                                  │
  │ [Approva]     [Rifiuta]         │
  └──────────────────────────────────┘
  ↓
User presses [Approva]
  ↓
callback_query → approve:{actionId}
  ↓
Load from Redis → reconstruct approval response
  ↓
Re-submit to aiChatService.generateChat() with clientMessages containing:
  - Original assistant message (with tool-call parts)
  - Tool message with tool-approval-response (approved: true)
  ↓
Agent executes reply_email → sends response back to Telegram
  ↓
editMessageText: "Email inviata a marco@example.com"
```

### Vincoli Tecnici

| Vincolo | Impatto | Mitigazione |
|---------|---------|-------------|
| `callback_data` max 64 bytes | Non possiamo inviare tutto il tool call | Usare `approve:{nanoid(12)}` — 20 bytes, payload in Redis |
| Webhook timeout 60s | Non possiamo bloccare aspettando l'utente | Split in 2 requests: detect → store → send buttons; callback → execute |
| `generateChat` e' sincrono | Non supporta pause/resume | Non serve pause: salviamo stato in Redis, il callback e' un nuovo request |
| `answerCallbackQuery` obbligatorio | Senza, spinner infinito su Telegram | Chiamare SEMPRE, anche su errore |
| Bottoni persistenti | Restano sul messaggio anche se scaduti | editMessageText per rimuoverli dopo approve/reject/expire |

---

## Sprint Backlog

### Fase 1 — Infrastruttura (4 SP)

- [ ] T-TH01 — **Redis namespace + DTO per pending approvals**: aggiungere `CacheNamespace.TELEGRAM_APPROVAL` in `cache.service.ts`. Creare `TelegramApprovalPayload` interface: `{ actionId, toolCallId, toolName, toolArgs, conversationId, tenantId, userId, chatId, messageId?, createdAt }`. TTL 1 ora. — [1 SP]

- [ ] T-TH02 — **Metodo `generateChatWithApproval` in `AiChatService`**: nuova variante di `generateChat` che, invece di ri-lanciare l'errore quando `toolResults` e' incompleto per approval, ritorna un risultato strutturato: `{ text, conversationId, pendingApprovals: Array<{ toolCallId, toolName, args }> }`. Usa l'`onStepFinish` per catturare `tool-approval-request` parts dal step content. — [2 SP]

- [ ] T-TH03 — **Metodo `resolveApproval` in `AiChatService`**: accetta `{ conversationId, toolCallId, approved, tenantId, userId }`. Ricostruisce i `clientMessages` con `tool-approval-response` e chiama `generateChat` con `isApprovalResubmit = true`. Ritorna il testo risposta. — [1 SP]

### Fase 2 — Telegram Rendering (4 SP)

- [ ] T-TH04 — **Inline keyboard builder** in `TelegramBotService`: metodo `sendApprovalRequest(chatId, toolName, toolArgs, actionId)` che formatta un messaggio Markdown con anteprima dell'azione + inline keyboard `[Approva]` / `[Rifiuta]`. Gestione speciale per ogni tool type (send_email mostra destinatario/oggetto, delete mostra cosa si cancella). Ritorna il `message_id` per editare dopo. — [2 SP]

- [ ] T-TH05 — **Tool preview formatters**: funzioni di formatting per ogni tool type che producono un riassunto leggibile dell'azione. Map `toolName → formatter(args) → string[]`. Es: `send_email → ["A: marco@x.com", "Oggetto: Re: Fattura", "Corpo: Va bene..."]`. Sotto `backend/src/modules/telegram/utils/tool-preview.ts`. — [1 SP]

- [ ] T-TH06 — **`editMessageText` per risoluzione**: metodo `updateApprovalMessage(chatId, messageId, resolution)` che sostituisce il messaggio originale con "Azione approvata" o "Azione rifiutata" rimuovendo i bottoni. — [1 SP]

### Fase 3 — Callback Flow (5 SP)

- [ ] T-TH07 — **Refactor `handleChatRelay`**: modificare per usare `generateChatWithApproval`. Se `pendingApprovals.length > 0`: salvare ogni approval in Redis con `actionId` (nanoid), inviare inline keyboard via `sendApprovalRequest`, salvare `messageId` nel payload Redis. Se `pendingApprovals.length === 0`: comportamento attuale (invia testo). — [2 SP]

- [ ] T-TH08 — **Callback handler `approve:{actionId}` / `reject:{actionId}`**: nuovo ramo in `handleCallbackQuery`. Flow: `answerCallbackQuery` immediato → load payload da Redis → valida tenant (sicurezza!) → se approved: chiama `resolveApproval` → invia risposta AI → `editMessageText`. Se rejected: `editMessageText` con "Azione rifiutata" → nessuna esecuzione. Se scaduto (Redis miss): `editMessageText` con "Azione scaduta". Eliminare key Redis dopo risoluzione (single-use). — [2 SP]

- [ ] T-TH09 — **Gestione errori e edge cases**: timeout su `resolveApproval` (60s), doppio click (Redis key gia eliminata → "Gia gestito"), conversazione eliminata nel frattempo (404 → messaggio di errore), circuit breaker open (messaggio "AI temporaneamente non disponibile"). — [1 SP]

### Fase 4 — Testing & Polish (2 SP)

- [ ] T-TH10 — **E2E test via Edge CDP**: test manuale completo del flusso su Railway/Vercel. Scenario: utente chiede di inviare email → bottoni appaiono → approve → email inviata → conferma. Secondo scenario: reject → nessuna azione. Terzo: scadenza (aspettare TTL o eliminare Redis key). — [1 SP]

- [ ] T-TH11 — **Audit logging + metriche**: estendere `AuditService.logHitlDecision` per includere `channel: 'telegram'`. Log: tool name, decisione, tempo di risposta utente (createdAt → resolvedAt). Alert se troppi reject (possibile AI che propone azioni non volute). — [1 SP]

---

## Dipendenze

- Fix sanitizeMessages consecutive tool messages (commit 344c93da) — DONE
- `TelegramBotService` gia supporta inline keyboards e `answerCallbackQuery`
- `CacheService` (Redis) gia presente con pattern namespace
- `AiChatService.generateChat` gia ha il path `isApprovalResubmit` per il web
- `nanoid` gia dipendenza del progetto

## Rischi

1. **MiniMax M2.7 non supporta bene tool approval** — Il modello potrebbe non gestire correttamente la re-submission con `tool-approval-response`. Mitigazione: testare con il modello reale prima di T-TH03. Se non funziona, fallback: ri-chiamare `generateChat` con un prompt esplicito "The user approved executing {toolName} with args {args}. Execute it now."

2. **Race condition su callback multipli** — Se l'AI propone 3 azioni in un turno, l'utente riceve 3 messaggi con bottoni. Potrebbe approvarne 1 e rifiutarne 2, o ignorarne alcuni. Mitigazione: ogni approval e' indipendente (actionId unico), gestire in parallelo. Aggiungere "annulla tutti" se > 2 pending.

3. **Telegram webhook timeout** — Se `resolveApproval` impiega > 60s (model slow), il webhook fallisce. Mitigazione: usare `AbortSignal.timeout(55_000)` e inviare "Processing..." prima dell'esecuzione.

4. **callback_data collision** — nanoid(12) ha spazio sufficiente (62^12 combinazioni). Nessun rischio reale.

## Definition of Done

- [ ] Utente Telegram puo approvare `send_email` via inline button
- [ ] Utente Telegram puo rifiutare `delete_email` via inline button
- [ ] Azione scaduta mostra messaggio "Azione scaduta" e rimuove bottoni
- [ ] Doppio click su bottone mostra "Gia gestito"
- [ ] Audit log registra decisioni HITL con channel=telegram
- [ ] Flusso completo testato su Railway
- [ ] `cd backend && npx tsc --noEmit` passa
- [ ] Nessun impatto su web UI HITL (path separati)

## File Coinvolti

| File | Modifiche |
|------|-----------|
| `backend/src/common/services/cache.service.ts` | Aggiungere `TELEGRAM_APPROVAL` namespace |
| `backend/src/modules/ai-chat/services/ai-chat.service.ts` | `generateChatWithApproval`, `resolveApproval` |
| `backend/src/modules/telegram/services/telegram-bot.service.ts` | `sendApprovalRequest`, `updateApprovalMessage` |
| `backend/src/modules/telegram/services/telegram-webhook.service.ts` | Refactor `handleChatRelay`, nuovo callback handler |
| `backend/src/modules/telegram/utils/tool-preview.ts` | NUOVO — tool preview formatters |
| `backend/src/common/services/audit.service.ts` | Aggiungere `channel` a `logHitlDecision` |

## Note Architetturali

**Perche non usare `convertToModelMessages` direttamente?**
Il web frontend invia UIMessage[] complete con approval responses embedded. Telegram non ha UIMessage — lavora con testo semplice. Invece di simulare UIMessage[], creiamo un path dedicato `resolveApproval` che costruisce i ModelMessage[] direttamente, piu pulito e testabile.

**Perche Redis e non DB?**
Le pending approvals sono effimere (TTL 1h), ad alta frequenza di lettura (ogni callback le legge), e non servono dopo la risoluzione. Redis e' il match perfetto. Il pattern e' identico a `TELEGRAM_LINK` (token QR code).

**Perche non BullMQ?**
Non serve una queue — non c'e' processing asincrono. L'approvazione e' sincrona: callback arriva → leggi Redis → esegui → rispondi. BullMQ aggiungerebbe complessita senza beneficio.
