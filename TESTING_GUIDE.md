# 🧪 WebSocket Bidirectional Testing Guide

**Obiettivo**: Testare la bidirezionalità completa del sistema email realtime

---

## 📋 Prerequisites

Prima di iniziare, assicurati che:

- ✅ **Backend** è in esecuzione (`cd backend && npm run start:dev`)
- ✅ **Frontend** è in esecuzione (`cd frontend && npm run dev`)
- ✅ **PostgreSQL** è accessibile
- ✅ **Redis** è in esecuzione (per BullMQ)
- ✅ Almeno **1 provider email** configurato

---

## 🚀 Opzione 1: Test Automatico (Raccomandato)

### Step 1: Installa dipendenze

```bash
npm install socket.io-client axios
```

### Step 2: Ottieni JWT Token

1. Apri il browser: http://localhost:3001
2. Fai login con il tuo account
3. Apri DevTools (F12)
4. Vai a **Application** > **Local Storage**
5. Copia il valore di **"token"**

### Step 3: Esegui il test

```bash
node test-websocket.js "your-jwt-token-here"
```

### Cosa aspettarsi

Il script effettuerà automaticamente:

1. ✅ Verifica connessione backend
2. ✅ Fetch providers configurati
3. ✅ Connessione WebSocket
4. ✅ Test OUTBOUND (mark as read, star)
5. ✅ Monitoring INBOUND (attesa nuove email)

**Output esempio**:

```
================================================================================
🚀 WebSocket Bidirectional Email Test
================================================================================

ℹ️  Backend URL: http://localhost:3000
ℹ️  Token: eyJhbGciOiJIUzI1NiIsIn...

[Step 1] Checking backend health...
✅ Backend is running

[Step 2] Fetching email providers...
✅ Found 2 provider(s)
   1. user@gmail.com (google) [uuid-1]
   2. user@outlook.com (microsoft) [uuid-2]

[Step 3] Connecting to WebSocket...
✅ WebSocket connected!
   User ID: user-id-123
   Tenant ID: tenant-id-456
   Email: user@example.com

[Step 4] Registering event listeners...
✅ Event listeners registered
   Listening for: email:new, email:update, email:delete, ...

[Step 5] Fetching emails for testing...
✅ Found test email
   ID: email-123
   Subject: Test Email
   From: sender@example.com
   Read: false
   Starred: false

[Step 6] Testing OUTBOUND flow (Mark as Read)...
   Marking email email-123 as read...
✅ API call successful
   Waiting for WebSocket event...

📨 Event received: email:update
   Time: 2025-11-23T10:30:45.123Z
   Data: {
     "emailId": "email-123",
     "providerId": "uuid-1",
     "folder": "INBOX",
     "updates": { "isRead": true },
     "reason": "message-processed",
     "timestamp": "2025-11-23T10:30:45.123Z"
   }

✅ Received email:update event!
   OUTBOUND flow working correctly! ✓

[Step 7] Monitoring for INBOUND events...
   🔔 Listening for incoming emails...
   📧 Send yourself a test email to see it appear in realtime!

   To: user@gmail.com
   Subject: Test Email - Realtime Sync
   Body: Testing WebSocket bidirectional flow

   Press Ctrl+C to stop monitoring
```

### Invia Email di Test

Mentre lo script è in ascolto:

1. Apri Gmail/Outlook
2. Invia email a: **user@gmail.com** (il tuo provider)
3. Oggetto: **Test Email - Realtime Sync**
4. Corpo: **Testing WebSocket bidirectional flow**

**Dovresti vedere**:

```
📨 Event received: email:new
   Time: 2025-11-23T10:32:15.789Z
   Data: {
     "emailId": "new-email-id",
     "providerId": "uuid-1",
     "folder": "INBOX",
     "reason": "message-processed",
     "email": {
       "id": "new-email-id",
       "subject": "Test Email - Realtime Sync",
       "from": "sender@example.com",
       "...": "..."
     },
     "timestamp": "2025-11-23T10:32:15.789Z"
   }

✅ Received email:new event!
   INBOUND flow working correctly! ✓

📨 Event received: email:folder_counts_update
   Time: 2025-11-23T10:32:15.890Z
   Data: {
     "providerId": "uuid-1",
     "folderId": "INBOX",
     "folderName": "INBOX",
     "totalCount": 156,
     "unreadCount": 23,
     "timestamp": "2025-11-23T10:32:15.890Z"
   }
```

---

## 🧪 Opzione 2: Test Manuale Browser

### Step 1: Prepara 2 Browser Tabs

1. **Tab A**: Apri http://localhost:3001 e fai login
2. **Tab B**: Apri http://localhost:3001 (stessa finestra, tab separato) in modalità incognito O altro browser e fai login

### Step 2: Test INBOUND Flow

**Azione**: Invia email da esterno (Gmail/Outlook)

1. Apri Gmail/Outlook in un altro browser
2. Invia email al tuo account configurato
3. Oggetto: **Test INBOUND - Realtime**

**Verifica**:
- ✅ Tab A: Email appare automaticamente (senza refresh)
- ✅ Tab B: Email appare automaticamente (senza refresh)
- ✅ Sidebar: Contatore INBOX si aggiorna
- ✅ Console (F12): Vedi log `[WS] Email new: ...`

### Step 3: Test OUTBOUND Flow (Mark as Read)

**Azione**: Tab A marca email come letta

1. **Tab A**: Clicca su un'email non letta
2. **Tab A**: Clicca su "Mark as read" o semplicemente apri l'email

**Verifica**:
- ✅ Tab A: Email diventa letta immediatamente (optimistic update)
- ✅ Tab B: Email si aggiorna a "letta" dopo 100-500ms (evento WS)
- ✅ Sidebar: Contatore non lette -1 in entrambi i tab
- ✅ Console: Vedi log `[WS] Email update: ...`
- ✅ Provider esterno: Email marcata come letta (verifica dopo 1-2 secondi)

### Step 4: Test OUTBOUND Flow (Star)

**Azione**: Tab B aggiunge stella

1. **Tab B**: Clicca sulla stella di un'email
2. **Tab B**: Stella appare immediatamente

**Verifica**:
- ✅ Tab B: Stella visibile immediatamente
- ✅ Tab A: Stella appare dopo 100-500ms (evento WS)
- ✅ Console: Vedi log `[WS] Email update: ...`

### Step 5: Test OUTBOUND Flow (Move)

**Azione**: Tab A sposta email in Archive

1. **Tab A**: Seleziona un'email
2. **Tab A**: Clicca "Archive" o trascina in "Archive"

**Verifica**:
- ✅ Tab A: Email scompare da INBOX immediatamente
- ✅ Tab B: Email scompare da INBOX dopo 100-500ms
- ✅ Sidebar: INBOX count -1, Archive count +1
- ✅ Console: Vedi log `[WS] Email update: ...` e `[WS] Folder counts update: ...`

### Step 6: Test OUTBOUND Flow (Delete)

**Azione**: Tab A elimina email

1. **Tab A**: Seleziona un'email
2. **Tab A**: Clicca "Delete"

**Verifica**:
- ✅ Tab A: Email scompare immediatamente
- ✅ Tab B: Email scompare dopo 100-500ms
- ✅ Sidebar: Folder count aggiornato
- ✅ Console: Vedi log `[WS] Email delete: ...`

---

## 🔍 Verifica Console Logs

### Frontend (DevTools Console)

Apri DevTools (F12) > Console e cerca:

```javascript
// Connessione
[useWebSocket] Connected successfully

// Eventi ricevuti
[WS] Email new: { emailId: '...', subject: '...' }
[WS] Email update: { emailId: '...', updates: { isRead: true } }
[WS] Email delete: { emailId: '...' }
[WS] Folder counts update: { folderId: 'INBOX', unreadCount: 23 }
[WS] Thread update: { threadId: '...', emailIds: [...] }
[WS] Sync status: { providerId: '...', status: 'completed' }
```

### Backend (Terminal/Logs)

Nel terminale dove gira `npm run start:dev`:

```bash
# Connessione client
[WS] Client connected: abc-123 | User: user@example.com | Tenant: tenant-456 | Connections: 1

# Eventi emessi
[RealtimeEventsService] Emitted email:new to room tenant:tenant-456
[RealtimeEventsService] Emitted email:update to room tenant:tenant-456
[RealtimeEventsService] Flushed 50 buffered email event(s)

# Disconnessione
[WS] Client disconnected: abc-123 | User: user@example.com | Last connection - tenant removed
```

---

## 📊 Checklist Test Completo

### ✅ INBOUND Tests (Provider → Frontend)

- [ ] **IN-01**: Email arriva da provider → Appare in realtime senza refresh
- [ ] **IN-02**: Contatori sidebar aggiornati automaticamente
- [ ] **IN-03**: Email con allegati mostra icona corretta
- [ ] **IN-04**: Multi-device: Email appare in tutti i browser connessi
- [ ] **IN-05**: Eventi `email:new` e `email:folder_counts_update` ricevuti

### ✅ OUTBOUND Tests (Frontend → Provider)

- [ ] **OUT-01**: Mark as read → Sync al provider (verifica Gmail/Outlook)
- [ ] **OUT-02**: Add star → Sync al provider
- [ ] **OUT-03**: Move to Archive → Email spostata su provider
- [ ] **OUT-04**: Delete → Email eliminata su provider
- [ ] **OUT-05**: Bulk operations (10+ email) → Tutte sincronizzate
- [ ] **OUT-06**: Eventi `email:update` ricevuti per ogni azione

### ✅ BIDIRECTIONAL Tests (Round-trip)

- [ ] **BI-01**: Tab A marca letta → Tab B riceve aggiornamento
- [ ] **BI-02**: Email arriva → Tutti i tab mostrano simultaneamente
- [ ] **BI-03**: Tab A sposta in Archive → Tab B aggiorna sidebar
- [ ] **BI-04**: Folder counts sincronizzati tra tutti i client
- [ ] **BI-05**: 2 browser diversi (non solo 2 tab) sincronizzati

### ✅ ERROR Handling Tests

- [ ] **ERR-01**: Disconnetti rete → Status diventa "disconnected"
- [ ] **ERR-02**: Riconnetti rete → Auto-reconnect funziona
- [ ] **ERR-03**: API error → Optimistic update rollback
- [ ] **ERR-04**: Token expired → Disconnessione pulita

### ✅ Performance Tests

- [ ] **PERF-01**: 100+ email sync → Buffering funziona (non 100 eventi singoli)
- [ ] **PERF-02**: Event latency < 500ms
- [ ] **PERF-03**: No memory leaks (monitora DevTools Memory)

---

## 🐛 Troubleshooting

### Problema: Eventi NON Ricevuti

**Symptom**: Frontend non riceve eventi WebSocket

**Debug Steps**:

1. **Verifica connessione**:
   ```javascript
   // Console frontend
   websocketClient.isConnected() // Dovrebbe essere true
   ```

2. **Verifica backend logs**:
   ```bash
   # Cerca questi log
   [WS] Client connected: ...
   [RealtimeEventsService] Emitted email:new to room ...
   ```

3. **Verifica tenant isolation**:
   - Assicurati che entrambi i browser siano loggati con lo STESSO account
   - Verifica `tenantId` nei log backend

4. **Verifica event listeners**:
   ```javascript
   // Console frontend - dovrebbe mostrare listener registrati
   console.log('Listeners:', Object.keys(websocketClient.socket._callbacks || {}));
   ```

### Problema: Optimistic Update Non Revertito

**Symptom**: Azione fallisce ma UI non torna allo stato precedente

**Debug**:

1. Verifica rollback nel codice:
   ```typescript
   // use-email-actions.ts
   try {
     updateEmail(emailId, { isRead: true }); // Optimistic
     await emailApi.updateEmail(emailId, { isRead: true });
   } catch (error) {
     updateEmail(emailId, { isRead: false }); // ✅ Rollback deve esserci
   }
   ```

2. Simula error:
   - Spegni backend
   - Prova un'azione (mark as read)
   - UI dovrebbe rollback

### Problema: Provider Non Sincronizzato

**Symptom**: Modifiche in MailAgent non appaiono su Gmail/Outlook

**Debug**:

1. Verifica backend logs per sync errors:
   ```bash
   grep "Failed to sync email update to provider" logs/backend.log
   ```

2. Verifica token provider:
   - Token potrebbe essere scaduto
   - OAuth refresh token potrebbe essere invalido

3. Verifica permessi OAuth:
   - Gmail: Richiede scope `https://mail.google.com/`
   - Outlook: Richiede scope `Mail.ReadWrite`

### Problema: Eventi Duplicati

**Symptom**: Ricevi 2-3 volte lo stesso evento

**Possibili cause**:

1. **Listener registrati multipli**: Verifica cleanup in useEffect
   ```typescript
   useEffect(() => {
     const unsub = websocketClient.onEmailNew(handler);
     return () => unsub(); // ✅ Cleanup importante
   }, []);
   ```

2. **Multiple connessioni**: Verifica che `connect()` non sia chiamato più volte

---

## 📈 Metrics da Monitorare

### Connection Health

- **Connection Time**: < 500ms
- **Reconnect Time**: < 2s
- **Active Connections**: Numero di client connessi per tenant

### Event Latency

- **INBOUND**: < 500ms (email provider → frontend)
- **OUTBOUND**: < 100ms (action → WS event)
- **BUFFERING**: 200-250ms (configurabile)

### Success Rate

- **API Success**: > 99%
- **WS Delivery**: > 99%
- **Provider Sync**: > 95% (può fallire per rate limiting)

---

## ✅ Test Completato

Se tutti i test passano, hai verificato:

✅ **INBOUND**: Provider → Backend → DB → WebSocket → Frontend
✅ **OUTBOUND**: Frontend → API → DB → WebSocket → Provider
✅ **BIDIRECTIONAL**: Multi-device sync funzionante
✅ **ERROR HANDLING**: Rollback e reconnect funzionanti
✅ **PERFORMANCE**: Buffering e latency ottimali

Il sistema email realtime è **completamente funzionale e bidirezionale**! 🎉

---

## 📚 Riferimenti

- [WEBSOCKET_REVIEW.md](docs/WEBSOCKET_REVIEW.md) - Code review completa
- [WEBSOCKET_REFACTOR_SUMMARY.md](docs/WEBSOCKET_REFACTOR_SUMMARY.md) - Summary refactoring
- [WEBSOCKET_ALIGNMENT.md](docs/WEBSOCKET_ALIGNMENT.md) - Type alignment
- [WEBSOCKET_BIDIRECTIONAL_TEST_PLAN.md](docs/WEBSOCKET_BIDIRECTIONAL_TEST_PLAN.md) - Piano test dettagliato

