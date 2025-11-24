# Test WebSocket Label Updates - Browser Console

## Istruzioni per testare le label WebSocket updates

### 1. Apri la Console del Browser
- Apri l'applicazione frontend
- Premi F12 e vai sulla tab "Console"

### 2. Verifica connessione WebSocket
Incolla e esegui:
```javascript
// Check if WebSocket client exists
console.log('WebSocket client exists:', typeof websocketClient !== 'undefined');
```

### 3. Aggiungi un listener manuale per email:update
```javascript
// Store original console.log
const originalLog = console.log;

// Intercept email:update events
if (typeof websocketClient !== 'undefined') {
  websocketClient.onEmailUpdate((data) => {
    originalLog('📨 [MANUAL TEST] Received email:update event:');
    originalLog('   Reason:', data.reason);
    originalLog('   Email ID:', data.emailId);
    originalLog('   Has email object:', !!data.email);

    if (data.email) {
      originalLog('   Email subject:', data.email.subject);
      originalLog('   Has emailLabels:', !!data.email.emailLabels);
      originalLog('   EmailLabels count:', data.email.emailLabels?.length || 0);

      if (data.email.emailLabels && data.email.emailLabels.length > 0) {
        originalLog('   📊 Email labels:');
        data.email.emailLabels.forEach(el => {
          originalLog(`      - ${el.label.name} (${el.label.id})`);
        });
      } else {
        originalLog('   ⚠️  WARNING: emailLabels is empty or missing!');
      }
    } else {
      originalLog('   ⚠️  WARNING: email object is missing!');
    }
  });

  console.log('✅ Manual email:update listener registered!');
} else {
  console.error('❌ websocketClient not found!');
}
```

### 4. Aggiungi una label a un'email
1. Seleziona un'email nella UI
2. Clicca sul menu "More Actions" (tre puntini)
3. Clicca "Add Labels"
4. Seleziona una label
5. Clicca "Save"

### 5. Osserva i log nella console
Dovresti vedere:
```
[WS] Email update: { ... }
📨 [MANUAL TEST] Received email:update event:
   Reason: labels-updated
   Email ID: abc123
   Has email object: true
   Email subject: Test Subject
   Has emailLabels: true
   EmailLabels count: 2
   📊 Email labels:
      - Important (label-id-1)
      - Work (label-id-2)
```

### 6. Verifica lo store
```javascript
// Get the email store
const emailStore = window.__ZUSTAND_STORES__?.email || useEmailStore?.getState();

if (emailStore) {
  console.log('📦 Current emails in store:', emailStore.emails.length);

  // Find the email you just updated
  const emailId = 'YOUR_EMAIL_ID_HERE'; // Replace with actual ID
  const email = emailStore.emails.find(e => e.id === emailId);

  if (email) {
    console.log('📧 Found email:', {
      id: email.id,
      subject: email.subject,
      emailLabels: email.emailLabels,
      labelsCount: email.emailLabels?.length || 0,
    });
  } else {
    console.log('❌ Email not found in store!');
  }
} else {
  console.log('❌ Email store not accessible from window');
}
```

## Cosa cercare:

### ✅ Se funziona correttamente:
- Vedi `[WS] Email update:` nei log
- `reason` è `labels-updated`
- `email` object è presente e contiene `emailLabels`
- `emailLabels` è un array con le label corrette
- L'email nello store si aggiorna immediatamente

### ❌ Problemi possibili:

#### Problema 1: Nessun evento WebSocket ricevuto
```
// Non vedi nessun log con [WS] o [MANUAL TEST]
```
**Causa**: Backend non sta emettendo eventi o WebSocket disconnesso
**Soluzione**: Verificare console del backend per errori

#### Problema 2: Evento ricevuto ma senza emailLabels
```
📨 [MANUAL TEST] Received email:update event:
   ...
   ⚠️  WARNING: emailLabels is empty or missing!
```
**Causa**: `getEmailsByIds()` non include emailLabels o problema nel backend
**Soluzione**: Verificare backend logs e query Prisma

#### Problema 3: Evento ricevuto con emailLabels ma store non si aggiorna
```
// Vedi i log correttamente ma l'email nello store non ha le label
```
**Causa**: Problema nello store `updateEmail()` function
**Soluzione**: Verificare che lo store stia usando il merge corretto

## Test rapido senza UI

Puoi anche testare programmaticamente:

```javascript
// Import the API
import { emailApi } from '@/lib/api/email';
import { useEmailStore } from '@/stores/email-store';

// Get an email ID and label ID
const emailId = 'YOUR_EMAIL_ID';
const labelId = 'YOUR_LABEL_ID';

// Add label
await emailApi.bulkAddLabels([emailId], [labelId]);

// Wait 1 second for WebSocket
await new Promise(resolve => setTimeout(resolve, 1000));

// Check store
const store = useEmailStore.getState();
const email = store.emails.find(e => e.id === emailId);
console.log('Email after add:', email.emailLabels);
```
