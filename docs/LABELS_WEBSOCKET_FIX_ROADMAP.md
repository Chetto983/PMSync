# Label WebSocket Fix - Roadmap

**Data**: 2025-11-23
**Problema**: Eventi WebSocket `email:update` con `reason: 'labels-updated'` NON vengono ricevuti dal client

---

## 🔍 Analisi Problema

### Sintomi
- ✅ API label funzionano correttamente (POST, PUT, DELETE)
- ✅ Label aggiunte/rimosse da email nel DB
- ❌ Eventi WebSocket NON ricevuti dal client
- ⚠️ 0 eventi ricevuti anche dopo 5+ secondi di attesa

### Codice Analizzato
1. **labels.service.ts:206-214** - Chiamata a `emitEmailUpdate()` ✅
2. **realtime-events.service.ts:269-271** - Handler per `labels-updated` ✅
3. **labels.module.ts** - RealtimeModule importato ✅
4. **websocket-client.ts** - Event listener registrato ✅

### Ipotesi Bug

#### Ipotesi 1: Email object incompleto
**Probabilità**: 🔴 ALTA

Il metodo `emailsService.getEmailsByIds()` potrebbe:
- Restituire array vuoto
- Non includere correttamente il campo `providerId`
- Avere un problema con il tenantId filtering

**Verifica**:
```typescript
// labels.service.ts:200-203
const updatedEmails = await this.emailsService.getEmailsByIds(
  uniqueIds,
  tenantId,
);
```

Se `updatedEmails` è vuoto, il `forEach` (line 206) non viene eseguito.

#### Ipotesi 2: Provider ID undefined
**Probabilità**: 🟡 MEDIA

```typescript
// labels.service.ts:209
providerId: email.providerId,
```

Se `email.providerId` è undefined, l'evento potrebbe essere scartato dal buffer.

#### Ipotesi 3: Buffer non processa eventi labels-updated
**Probabilità**: 🟢 BASSA

Il buffer potrebbe avere una whitelist di `reason` e non includere `labels-updated`.

**Verifica**: Controllare `bufferEmailEvent()` in realtime-events.service.ts

#### Ipotesi 4: Dependency injection problem
**Probabilità**: 🟢 BASSA

RealtimeEventsService potrebbe non essere iniettato correttamente, ma questo causerebbe un errore a runtime.

---

## 🛠️ Piano di Fix

### Step 1: Diagnostica - Aggiungere Logging
**File**: `backend/src/modules/labels/services/labels.service.ts`

```typescript
// DOPO line 203
console.log('[LABELS DEBUG] updatedEmails count:', updatedEmails.length);
if (updatedEmails.length > 0) {
  console.log('[LABELS DEBUG] First email:', {
    id: updatedEmails[0].id,
    providerId: updatedEmails[0].providerId,
    folder: updatedEmails[0].folder,
    emailLabels: updatedEmails[0].emailLabels?.length || 0
  });
}

// DENTRO forEach (line 206)
console.log('[LABELS DEBUG] Emitting email:update for:', email.id);
```

### Step 2: Verificare getEmailsByIds
**File**: `backend/src/modules/email/services/emails.service.ts:267`

Aggiungere log prima del return:
```typescript
console.log('[EMAILS DEBUG] getEmailsByIds result:', {
  requested: ids.length,
  found: emails.length,
  tenantId
});
```

### Step 3: Verificare Buffer
**File**: `backend/src/modules/realtime/services/realtime-events.service.ts`

Trovare metodo `bufferEmailEvent()` e verificare se filtra eventi per `reason`.

### Step 4: Fix Implementato
Basato sui risultati della diagnostica, implementare una delle seguenti soluzioni:

**Soluzione A**: Se `updatedEmails` è vuoto
```typescript
// Alternativa: fetch email direttamente con Prisma invece di usare getEmailsByIds
const updatedEmails = await this.prisma.email.findMany({
  where: { id: { in: uniqueIds }, tenantId },
  include: {
    emailLabels: {
      include: { label: true }
    }
  }
});
```

**Soluzione B**: Se providerId è undefined
```typescript
// Verificare che email.providerId esista prima di emettere
updatedEmails.forEach((email) => {
  if (!email.providerId) {
    console.warn('[LABELS] Email missing providerId:', email.id);
    return;
  }
  this.realtimeEvents.emitEmailUpdate(tenantId, {
    emailId: email.id,
    providerId: email.providerId,
    folder: email.folder,
    reason: 'labels-updated',
    email: email as any,
  });
});
```

**Soluzione C**: Se buffer scarta eventi
```typescript
// Usare emitEmailUpdate direttamente senza buffer
// O configurare buffer per accettare labels-updated
```

### Step 5: Test
1. Eseguire `node test-labels.js <token>`
2. Verificare ricezione eventi
3. Controllare console backend per log diagnostici
4. Rimuovere log dopo conferma fix

---

## 📋 Checklist Implementazione

- [ ] **Step 1**: Aggiungere logging diagnostico
- [ ] **Step 2**: Eseguire test e analizzare log
- [ ] **Step 3**: Identificare root cause
- [ ] **Step 4**: Implementare fix appropriato
- [ ] **Step 5**: Rimuovere logging diagnostico
- [ ] **Step 6**: Test finale con script automatico
- [ ] **Step 7**: Verificare anche removeEmailFromLabel (stessa logica)
- [ ] **Step 8**: Documentare fix in WEBSOCKET_WORK_SUMMARY.md

---

## 🎯 Risultato Atteso

Dopo il fix:
```
[Step 7] OUTBOUND - Adding label to email...
✅ API call successful
   Waiting 5s for WebSocket event (buffer delay)...

📨 Event received: email:update (labels-updated)
   Time: 2025-11-23T...
   Email ID: cmic6pmfi0000yh40eyvzka3p
   Labels count: 1
   Data: { emailId: '...', reason: 'labels-updated', ... }

✅ Received email:update event for label addition!
   OUTBOUND flow working correctly! ✓
```

---

## 🔧 Metodi Legacy da Rimuovere

Prima del fix, pulire il codebase:

### Backend
1. ✅ `hardDelete` in labels.service.ts - **RIMOSSO**
2. [ ] Verificare altri metodi non utilizzati in labels.service.ts
3. [ ] Verificare metodi deprecati in realtime-events.service.ts

### Frontend
1. [ ] Verificare metodi legacy in websocket-client.ts
2. [ ] Verificare use-websocket.ts per codice non utilizzato

### Test
1. [ ] Rimuovere script di test duplicati
2. [ ] Consolidare helper functions

---

## 📊 Timeline Stimata

- **Step 1-2** (Diagnostica): 10 minuti
- **Step 3** (Analisi): 5 minuti
- **Step 4** (Fix): 15 minuti
- **Step 5** (Test): 10 minuti
- **Cleanup**: 10 minuti

**Totale**: ~50 minuti

---

## ✅ Success Criteria

1. ✅ Eventi `email:update` ricevuti per add label
2. ✅ Eventi `email:update` ricevuti per remove label
3. ✅ Payload include `reason: 'labels-updated'`
4. ✅ Payload include email completa con emailLabels
5. ✅ Test script passa al 100%
6. ✅ 0 metodi legacy rimasti nel codebase
