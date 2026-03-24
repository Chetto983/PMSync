# Epic EP-10: Mobile Application

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-10 |
| **Titolo** | Mobile Application |
| **Progetto** | CRM Pro 360 |
| **Personas** | Marco (Sales Director) |
| **Phase** | 3 (Sprint 17) |
| **Story Points Totali** | ~85 SP |
| **Stato** | Draft |

## Overview

App mobile React Native + Expo con parità funzionale core (contatti, pipeline, notifiche), push notifications, offline mode con sync, autenticazione biometrica (Face ID, fingerprint), fotocamera per business card scan con OCR, layout responsive per tablet, deep linking.

L'obiettivo è fornire al team vendite uno strumento mobile che elimini la necessità di tornare alla scrivania per aggiornare il CRM. Ogni interazione con il cliente sul campo deve essere registrabile in tempo reale, anche senza connessione internet.

---

## User Stories

### US-118: Login mobile con biometria (Face ID, fingerprint)

**Come** Marco (Sales Director),
**voglio** accedere all'app mobile con Face ID o impronta digitale dopo il primo login,
**in modo da** consultare rapidamente il CRM tra un meeting e l'altro senza digitare credenziali ogni volta.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 17 |
| **Dipendenze** | EP-01 (autenticazione backend) |

**Acceptance Criteria:**

```gherkin
Given un utente che apre l'app per la prima volta
When inserisce email e password corrette
Then l'app propone "Vuoi abilitare l'accesso biometrico?" con opzioni Sì/No

Given un utente con biometria abilitata che apre l'app
When il sistema richiede Face ID o fingerprint
Then l'autenticazione biometrica sblocca l'accesso in meno di 2 secondi senza inserire credenziali

Given un utente che fallisce l'autenticazione biometrica 3 volte
When il terzo tentativo fallisce
Then l'app mostra il form di login con email/password come fallback

Given un utente con sessione scaduta (refresh token expired)
When tenta di accedere con biometria
Then l'app mostra "Sessione scaduta. Effettua nuovamente il login." con form email/password

Given un utente che cambia la password dal web
When apre l'app mobile con biometria
Then la biometria viene invalidata e deve eseguire un nuovo login completo

Given un utente con dispositivo senza sensore biometrico
When completa il login con credenziali
Then l'app non propone l'opzione biometrica e usa session token standard con auto-refresh
```

---

### US-119: Vista contatti mobile con ricerca e filtri

**Come** Marco (Sales Director),
**voglio** visualizzare e cercare i contatti dal telefono con filtri rapidi,
**in modo da** trovare il numero o l'email di un cliente in pochi secondi prima di una chiamata.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 17 |
| **Dipendenze** | US-118 (login mobile), EP-03 (API contatti) |

**Acceptance Criteria:**

```gherkin
Given un utente autenticato nella schermata contatti
When la lista viene caricata
Then mostra i contatti in ordine alfabetico con avatar, nome, azienda e ultimo contatto, con infinite scroll

Given un utente che digita nella barra di ricerca "Mar"
When il testo cambia
Then la lista si filtra in tempo reale (debounce 300ms) mostrando contatti il cui nome, cognome, email o azienda contiene "Mar"

Given un utente che applica il filtro "Azienda: Acme Corp"
When il filtro viene selezionato dal bottom sheet
Then la lista mostra solo i contatti associati ad Acme Corp con badge filtro attivo e conteggio risultati

Given un utente che tocca un contatto nella lista
When la scheda contatto si apre
Then mostra: foto, nome completo, ruolo, azienda, telefono (tap-to-call), email (tap-to-email), deal aperti, ultima attività

Given un utente offline che cerca un contatto
When non c'è connessione internet
Then la ricerca funziona sui dati locali con indicatore "Dati offline - ultimo sync: [timestamp]"
```

---

### US-120: Vista pipeline mobile con Kanban semplificato

**Come** Marco (Sales Director),
**voglio** visualizzare la pipeline deal in formato Kanban semplificato sul telefono,
**in modo da** avere una visione d'insieme dello stato dei deal e spostare rapidamente i deal tra le fasi.

| Campo | Valore |
|-------|--------|
| **Story Points** | 13 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 18 |
| **Dipendenze** | US-118 (login mobile), EP-04 (API pipeline) |

**Acceptance Criteria:**

```gherkin
Given un utente nella schermata pipeline
When la vista Kanban viene caricata
Then mostra le colonne stage con scroll orizzontale, ogni card mostra nome deal, valore, azienda e giorni nello stage

Given un utente che esegue long press su una deal card
When il menu azioni appare
Then può selezionare "Sposta a..." con lista degli stage disponibili e il deal viene aggiornato immediatamente

Given un utente che esegue drag-and-drop su una deal card (tablet)
When trascina la card da uno stage all'altro
Then la card si sposta con animazione fluida e il backend viene aggiornato con feedback haptic di conferma

Given un utente che tocca una deal card
When la scheda deal si apre
Then mostra: valore, stage, probabilità, contatto principale, prossima attività, timeline recente, e pulsanti azione rapida (Chiama, Email, Nota)

Given un utente che applica il filtro "I miei deal"
When il filtro è attivo
Then la pipeline mostra solo i deal assegnati all'utente con totale valore per stage aggiornato

Given un utente con molti deal (>100 per stage)
When scrolla verticalmente all'interno di uno stage
Then i deal vengono caricati con virtual scroll per mantenere performance fluide (60fps)
```

---

### US-121: Push notifications per deal, task, menzioni

**Come** Marco (Sales Director),
**voglio** ricevere push notification per aggiornamenti importanti su deal, task e menzioni,
**in modo da** non perdere nessun evento critico anche quando non sto usando attivamente il CRM.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 18 |
| **Dipendenze** | US-118 (login mobile) |

**Acceptance Criteria:**

```gherkin
Given un utente con notifiche push abilitate
When un deal assegnato a lui cambia stage
Then riceve una push notification con titolo "Deal [nome]" e body "Spostato a [nuovo stage] da [utente]"

Given un utente menzionato in una nota (@marco)
When la nota viene salvata
Then riceve una push notification con titolo "Menzionato da [autore]" e body con anteprima della nota (max 100 caratteri)

Given un utente con un task in scadenza oggi
When mancano 2 ore alla deadline
Then riceve una push notification con titolo "Task in scadenza" e body "[nome task] - scade alle [ora]"

Given un utente che tocca una push notification
When l'app si apre
Then naviga direttamente alla risorsa collegata (deal, contatto, task) tramite deep link

Given un utente nelle impostazioni notifiche
When configura le preferenze
Then può abilitare/disabilitare per categoria: Deal updates, Task reminders, Menzioni, Nuovi lead, con orari di quiete (es. 22:00-08:00)

Given un utente con orario di quiete attivo
When un evento trigger arriva durante le ore silenziose
Then la notifica viene accodata e consegnata silenziosamente (senza suono/vibrazione) o ritardata alla fine dell'orario di quiete
```

---

### US-122: Offline mode con sync automatico al rientro

**Come** Marco (Sales Director),
**voglio** poter visualizzare e modificare dati CRM anche senza connessione internet,
**in modo da** aggiornare il CRM durante visite clienti in zone con scarsa copertura senza perdere le modifiche.

| Campo | Valore |
|-------|--------|
| **Story Points** | 13 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 19 |
| **Dipendenze** | US-119 (vista contatti), US-120 (vista pipeline) |

**Acceptance Criteria:**

```gherkin
Given un utente che perde la connessione internet
When continua a usare l'app
Then vede un banner non intrusivo "Modalità offline" in alto e può navigare tutti i dati scaricati localmente

Given un utente offline che modifica un contatto (es. aggiorna il numero di telefono)
When salva la modifica
Then la modifica viene salvata localmente in WatermelonDB con timestamp e marcata come "pending sync"

Given un utente offline che crea una nuova nota su un deal
When scrive e salva la nota
Then la nota viene salvata localmente con UUID generato client-side e icona "sync pending"

Given un utente che torna online dopo aver fatto 5 modifiche offline
When la connessione viene ristabilita
Then il sync engine invia le modifiche in ordine cronologico, mostra progress "Sincronizzazione 3/5..." e conferma "Tutto sincronizzato"

Given un conflitto di sync (campo modificato sia offline che online da altro utente)
When il sync engine rileva il conflitto
Then mostra un dialog con "Versione locale: [valore]" vs "Versione server: [valore]" con opzioni "Mantieni la mia" / "Usa versione server"

Given un utente che ha l'app in background per 24h senza connessione
When riapre l'app e torna online
Then il sync completo riprende automaticamente senza intervento, e i dati locali vengono aggiornati con le modifiche server
```

---

### US-123: Business card scan con OCR e creazione contatto

**Come** Marco (Sales Director),
**voglio** fotografare un biglietto da visita e creare automaticamente un contatto nel CRM,
**in modo da** eliminare il data entry manuale dopo ogni evento di networking o fiera.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 20 |
| **Dipendenze** | US-119 (vista contatti) |

**Acceptance Criteria:**

```gherkin
Given un utente nella schermata contatti che tocca il pulsante "+" e seleziona "Scansiona biglietto"
When la fotocamera si apre con guida di inquadratura
Then il sistema scatta la foto e avvia l'elaborazione OCR con indicatore di caricamento

Given una foto di biglietto da visita elaborata con successo
When l'OCR estrae i campi
Then mostra un form pre-compilato con: nome, cognome, azienda, ruolo, email, telefono, indirizzo, con possibilità di correzione manuale prima del salvataggio

Given un biglietto da visita con testo in italiano
When l'OCR processa l'immagine
Then riconosce correttamente campi comuni italiani (P.IVA, Cod. Fiscale, Via/Piazza, Cap, Provincia) con accuratezza > 85%

Given un biglietto con qualità foto scarsa (sfocato, buio)
When l'OCR non riesce a estrarre campi con confidenza > 60%
Then mostra messaggio "Qualità insufficiente. Riprova con luce migliore." e offre retry senza uscire dalla fotocamera

Given un biglietto il cui email corrisponde a un contatto esistente
When l'OCR estrae l'email e trova un match
Then mostra "Contatto esistente trovato: [nome]. Vuoi aggiornare i dati?" con diff delle differenze
```

---

### US-124: Attività e task management mobile

**Come** Marco (Sales Director),
**voglio** visualizzare, creare e completare task e attività dal telefono,
**in modo da** tenere traccia delle azioni da fare e spuntare i follow-up subito dopo un meeting.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 19 |
| **Dipendenze** | US-118 (login mobile), EP-05 (API attività) |

**Acceptance Criteria:**

```gherkin
Given un utente nella schermata "Le mie attività"
When la lista viene caricata
Then mostra le attività raggruppate per: Scadute (rosso), Oggi (arancione), Prossimi 7 giorni (neutro), con conteggio per gruppo

Given un utente che tocca il FAB "+" nella schermata attività
When compila il form rapido (titolo, tipo, data scadenza, deal/contatto collegato)
Then l'attività viene creata e appare immediatamente nella lista nella posizione corretta

Given un utente che esegue swipe-right su un'attività
When lo swipe viene completato
Then l'attività viene marcata come completata con animazione check, haptic feedback e scompare dalla lista attiva

Given un utente che esegue swipe-left su un'attività
When lo swipe viene completato
Then appare un menu con opzioni: Posticipa (domani, prossima settimana, data custom), Modifica, Elimina

Given un utente che tocca un'attività di tipo "Chiamata"
When la scheda attività si apre
Then mostra un pulsante "Chiama ora" che avvia la chiamata telefonica e al rientro chiede "Esito chiamata: Risposto / Non risposto / Segreteria"

Given un utente che completa un'attività collegata a un deal
When l'attività viene chiusa
Then il sistema suggerisce "Vuoi creare un follow-up?" con tipo e data pre-compilati basati sul tipo di attività completata
```

---

### US-125: Layout responsive tablet (split view)

**Come** Marco (Sales Director),
**voglio** un layout ottimizzato per tablet con split view (lista + dettaglio),
**in modo da** sfruttare lo schermo più grande per lavorare più efficientemente durante le trasferte.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 20 |
| **Dipendenze** | US-119 (contatti), US-120 (pipeline), US-124 (attività) |

**Acceptance Criteria:**

```gherkin
Given un utente su tablet in orientamento landscape (larghezza > 768px)
When apre la lista contatti
Then vede un layout split view: lista contatti a sinistra (1/3) e dettaglio contatto selezionato a destra (2/3)

Given un utente su tablet che seleziona un contatto dalla lista
When tocca il nome del contatto
Then il dettaglio si aggiorna a destra con animazione slide-in senza navigazione full-screen

Given un utente su tablet in orientamento portrait
When ruota il dispositivo da landscape a portrait
Then il layout passa automaticamente a navigazione stack (full-screen) con animazione fluida e stato preservato

Given un utente su tablet nella vista pipeline
When apre un deal dalla board Kanban
Then il dettaglio deal appare in un panel laterale scorrevole (drawer) senza abbandonare la vista board

Given un utente su tablet con split view attivo
When naviga tra sezioni diverse (contatti → deal → attività)
Then il layout split view viene mantenuto in tutte le sezioni con memoria dell'ultimo elemento selezionato per sezione
```

---

### US-126: Deep linking per navigazione da notifica

**Come** Marco (Sales Director),
**voglio** che le notifiche push e i link condivisi aprano direttamente la risorsa corretta nell'app,
**in modo da** raggiungere un deal o contatto specifico con un solo tocco senza navigare manualmente.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 19 |
| **Dipendenze** | US-118 (login), US-121 (push notification) |

**Acceptance Criteria:**

```gherkin
Given un utente che tocca una push notification relativa a un deal
When l'app si apre (o torna in foreground)
Then naviga direttamente alla scheda deal con i dati aggiornati, skippando la schermata home

Given un utente non autenticato che tocca un deep link
When l'app si apre sulla schermata di login
Then dopo il login viene rediretto automaticamente alla risorsa originale del deep link

Given un utente che riceve un link crmpro360://contacts/abc-123 via chat
When tocca il link su un dispositivo con l'app installata
Then l'app si apre direttamente sulla scheda del contatto abc-123

Given un utente che riceve un link crmpro360://contacts/abc-123
When tocca il link su un dispositivo senza l'app installata
Then viene rediretto alla pagina App Store / Google Play per il download con banner "Scarica CRM Pro 360"

Given un utente che riceve un Universal Link https://app.crmpro360.com/deals/xyz-789
When tocca il link in Safari/Chrome
Then l'app si apre (se installata) o il browser mostra la versione web con banner smart app
```

---

### US-127: Widget home screen (deal in scadenza, task oggi)

**Come** Marco (Sales Director),
**voglio** widget per la home screen che mostrino deal in scadenza e task di oggi,
**in modo da** avere un colpo d'occhio sulle priorità senza aprire l'app.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🟢 Bassa |
| **Sprint Target** | Sprint 21 |
| **Dipendenze** | US-119 (contatti), US-120 (pipeline), US-124 (attività) |

**Acceptance Criteria:**

```gherkin
Given un utente iOS che aggiunge il widget "Task Oggi" alla home screen
When il widget viene renderizzato
Then mostra le prime 5 attività di oggi con titolo, orario e tipo (icona), con aggiornamento automatico ogni 15 minuti

Given un utente Android che aggiunge il widget "Pipeline Summary" alla home screen
When il widget viene renderizzato
Then mostra il totale valore pipeline, numero deal per stage (compact bar chart), e deal closing questa settimana

Given un utente che tocca un task nel widget
When il tocco viene registrato
Then l'app si apre direttamente sulla scheda dell'attività toccata tramite deep link

Given un utente con widget attivo che non ha effettuato login
When il widget tenta di aggiornare i dati
Then mostra "Accedi a CRM Pro 360" come placeholder con link al login

Given un utente iOS con widget in formato small (2x2)
When il widget viene renderizzato
Then mostra solo il conteggio: "3 task oggi, 2 deal in scadenza" con icone e colori semantici

Given un utente con widget in formato large
When il widget viene renderizzato
Then mostra lista task con checkbox interattiva (completamento rapido senza aprire l'app) e deal summary con valore
```

---

## Task Breakdown

### Infrastruttura Mobile (US-118)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0800 | Setup progetto Expo managed workflow con struttura cartelle e navigazione React Navigation | 10h | Mobile Dev | - |
| T-0801 | Implementare schermata login con form email/password e validazione | 6h | Mobile Dev | T-0800 |
| T-0802 | Implementare autenticazione biometrica con expo-local-authentication e SecureStore | 8h | Mobile Dev | T-0801 |
| T-0803 | Implementare session management con refresh token auto-renewal | 6h | Mobile Dev | T-0801 |
| T-0804 | Configurare theme provider MUI-compatible con design system mobile | 6h | Mobile Dev | T-0800 |
| T-0805 | Implementare fallback login e invalidazione biometria su password change | 4h | Mobile Dev | T-0802 |

### Contatti Mobile (US-119)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0806 | Implementare lista contatti con FlatList, infinite scroll e avatar | 8h | Mobile Dev | T-0800 |
| T-0807 | Implementare barra di ricerca con debounce e filtro locale/remoto | 6h | Mobile Dev | T-0806 |
| T-0808 | Implementare bottom sheet filtri (azienda, tag, ultimo contatto) | 6h | Mobile Dev | T-0807 |
| T-0809 | Implementare scheda dettaglio contatto con tap-to-call e tap-to-email | 8h | Mobile Dev | T-0806 |
| T-0810 | Implementare ricerca offline su dati locali WatermelonDB | 6h | Mobile Dev | T-0807, T-0825 |

### Pipeline Mobile (US-120)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0811 | Implementare vista Kanban con scroll orizzontale e card deal | 12h | Mobile Dev | T-0800 |
| T-0812 | Implementare long press con menu azione "Sposta a..." | 6h | Mobile Dev | T-0811 |
| T-0813 | Implementare drag-and-drop per tablet con react-native-gesture-handler | 8h | Mobile Dev | T-0811 |
| T-0814 | Implementare scheda dettaglio deal con azioni rapide (Chiama, Email, Nota) | 8h | Mobile Dev | T-0811 |
| T-0815 | Implementare virtual scroll per stage con molti deal (>100) | 4h | Mobile Dev | T-0811 |

### Push Notifications (US-121)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0816 | Configurare Firebase Cloud Messaging (FCM) per iOS e Android | 6h | Mobile Dev | T-0800 |
| T-0817 | Implementare backend push notification service con registrazione device token | 8h | Backend Dev | - |
| T-0818 | Implementare notification handler con routing a deep link | 6h | Mobile Dev | T-0816 |
| T-0819 | Implementare schermata impostazioni notifiche con toggle per categoria e orari di quiete | 6h | Mobile Dev | T-0816 |
| T-0820 | Implementare coda notifiche con orario di quiete e consegna ritardata | 4h | Backend Dev | T-0817 |

### Offline Mode (US-122)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0821 | Setup WatermelonDB con schema per contatti, deal, attività | 10h | Mobile Dev | T-0800 |
| T-0822 | Implementare sync engine client con conflict detection | 12h | Mobile Dev | T-0821 |
| T-0823 | Implementare sync API backend con delta sync e conflict resolution | 10h | Backend Dev | - |
| T-0824 | Implementare UI indicatore offline e stato sync (banner, progress) | 4h | Mobile Dev | T-0822 |
| T-0825 | Implementare conflict resolution dialog (versione locale vs server) | 6h | Mobile Dev | T-0822 |
| T-0826 | Test offline: simulare disconnessione, modifiche offline, reconnessione e sync | 8h | QA Engineer | T-0822 |

### Business Card OCR (US-123)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0827 | Implementare camera view con guida inquadratura (expo-camera) | 6h | Mobile Dev | T-0800 |
| T-0828 | Integrare OCR engine (Google ML Kit on-device o Cloud Vision API) | 8h | Mobile Dev | T-0827 |
| T-0829 | Implementare parser campi biglietto da visita (nome, email, telefono, azienda, P.IVA) | 8h | Backend Dev | - |
| T-0830 | Implementare form pre-compilato con correzione manuale e duplicate detection | 6h | Mobile Dev | T-0828 |
| T-0831 | Test OCR con dataset 50+ biglietti italiani/inglesi per validare accuratezza > 85% | 6h | QA Engineer | T-0829 |

### Task Management Mobile (US-124)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0832 | Implementare lista attività raggruppate per scadenza con contatori | 8h | Mobile Dev | T-0800 |
| T-0833 | Implementare form creazione rapida attività con collegamento deal/contatto | 6h | Mobile Dev | T-0832 |
| T-0834 | Implementare swipe-right per completamento e swipe-left per menu azioni | 6h | Mobile Dev | T-0832 |
| T-0835 | Implementare flusso post-chiamata (esito chiamata + suggerimento follow-up) | 6h | Mobile Dev | T-0834 |

### Tablet Layout (US-125)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0836 | Implementare split view container responsive con breakpoint 768px | 8h | Mobile Dev | T-0806, T-0811 |
| T-0837 | Adattare navigazione per split view (lista + dettaglio side-by-side) | 6h | Mobile Dev | T-0836 |
| T-0838 | Implementare drawer panel per dettaglio deal su pipeline tablet | 4h | Mobile Dev | T-0836 |
| T-0839 | Test layout rotation landscape/portrait con stato preservato | 4h | QA Engineer | T-0836 |

### Deep Linking (US-126)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0840 | Configurare expo-linking con schema URL crmpro360:// | 4h | Mobile Dev | T-0800 |
| T-0841 | Configurare Universal Links (iOS) e App Links (Android) | 6h | Mobile Dev | T-0840 |
| T-0842 | Implementare deferred deep link (redirect post-login) | 4h | Mobile Dev | T-0840 |
| T-0843 | Implementare fallback web per utenti senza app installata | 4h | Frontend Dev | - |

### Home Screen Widget (US-127)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0844 | Implementare widget iOS con WidgetKit via expo-widget | 10h | Mobile Dev | T-0832 |
| T-0845 | Implementare widget Android con Glance Compose via expo-widget | 10h | Mobile Dev | T-0832 |
| T-0846 | Implementare data provider per widget con cache locale e refresh periodico | 6h | Mobile Dev | T-0844 |
| T-0847 | Implementare checkbox interattiva nel widget large per completamento task | 4h | Mobile Dev | T-0844, T-0845 |

---

## Technical Design Notes

### Architettura Mobile

```
┌─────────────────────────────────────────────────────┐
│                    React Native + Expo               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Screens  │  │  Hooks   │  │  Navigation      │  │
│  │  (UI)     │──│  (Logic) │  │  (React Nav 7)   │  │
│  └──────────┘  └────┬─────┘  └──────────────────┘  │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐    │
│  │           State Management                    │    │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────┐ │    │
│  │  │  Zustand  │  │  TanStack │  │  Watermelon│ │    │
│  │  │  (UI)     │  │  Query    │  │  DB (local)│ │    │
│  │  └──────────┘  └───────────┘  └───────────┘ │    │
│  └──────────────────────────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐    │
│  │           Sync Engine                         │    │
│  │  Online: API calls via TanStack Query         │    │
│  │  Offline: WatermelonDB queue + delta sync     │    │
│  └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Offline-First con WatermelonDB

- **Local-first**: Tutte le letture da WatermelonDB. TanStack Query sincronizza WatermelonDB con il server.
- **Write queue**: Le modifiche offline vengono salvate in una coda locale con timestamp e operation type (create/update/delete).
- **Delta sync**: Al ritorno online, il client invia `GET /sync?lastSyncAt=<timestamp>` per ricevere solo le modifiche server successive all'ultimo sync.
- **Conflict resolution**: Strategia last-write-wins con override manuale per campi critici (valore deal, stage). Il dialog mostra entrambe le versioni con diff visuale.
- **Schema migration**: WatermelonDB supporta migrazioni schema locali per aggiornamenti app senza perdere dati offline.

### Push Notification Architecture

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐
│  Backend  │────▶│  Push Service│────▶│  FCM / APNs │
│  Event    │     │  (BullMQ)   │     └──────┬──────┘
│  Bus      │     └─────────────┘            │
└──────────┘                                 ▼
                                    ┌──────────────┐
                                    │  Mobile App   │
                                    │  Notification │
                                    │  Handler      │
                                    └──────┬───────┘
                                           │
                                    ┌──────▼───────┐
                                    │  Deep Link    │
                                    │  Router       │
                                    └──────────────┘
```

- **Firebase Cloud Messaging (FCM)**: Canale unificato per iOS e Android via Expo Notifications.
- **Device token**: Salvato nel backend associato a user + tenant. Supporta multi-device per utente.
- **Quiet hours**: Il backend controlla le preferenze utente prima di inviare. Durante le ore di quiete, le notifiche vengono accodate e consegnate in batch alla fine.
- **Notification grouping**: Android notification channels per categoria (deals, tasks, mentions). iOS notification categories con azioni rapide.

### OCR Pipeline

```
Camera ──▶ Image Preprocessing ──▶ ML Kit (on-device) ──▶ Field Parser ──▶ Duplicate Check ──▶ Contact Form
              (crop, contrast,        (text recognition)     (regex + NLP       (email match)
               deskew)                                        field extraction)
```

- **On-device first**: Google ML Kit per OCR on-device (nessun costo API, funziona offline).
- **Cloud fallback**: Se la confidenza on-device < 70%, invio a Cloud Vision API per elaborazione migliore.
- **Field extraction**: Regex patterns per email, telefono (formato italiano +39), P.IVA (IT + 11 cifre), CAP (5 cifre). NLP leggero per distinguere nome/cognome/ruolo.

---

## Rischi

| ID | Rischio | Probabilità | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-10-01 | Complessità del sync offline causa inconsistenze dati e conflitti non gestiti | Alta | Alto | Test estensivo con scenari offline complessi, conflict resolution UI chiara, audit log di tutte le sync operations, possibilità di rollback manuale |
| R-10-02 | Performance degradata su dispositivi Android low-end con liste lunghe | Media | Medio | Virtual scroll per liste > 50 items, lazy loading immagini, profilazione performance su device reali (non solo emulatore), benchmark 60fps su device di fascia bassa |
| R-10-03 | Accuratezza OCR insufficiente per biglietti da visita con design creativi o multilingue | Media | Basso | Dataset di test diversificato (50+ biglietti), fallback a Cloud Vision, form di correzione sempre disponibile, feedback loop per migliorare il parser |
| R-10-04 | Push notification non consegnate su iOS per restrizioni sistema (Background App Refresh disabilitato, modalità Focus) | Alta | Medio | Documentazione chiara per utenti su come configurare le notifiche, fallback a email per notifiche critiche, in-app notification center come backup |
| R-10-05 | Frammentazione Android causa problemi di compatibilità widget su diverse versioni OS e launcher | Media | Medio | Supportare solo Android 12+ per widget (Glance), test su top 5 dispositivi per market share, design semplice che funzioni su tutti i launcher |
| R-10-06 | Dimensione dell'app eccessiva (> 100MB) per inclusione di ML Kit e WatermelonDB native modules | Bassa | Medio | Lazy download del modello ML Kit, analisi bundle size con expo-bundle-analyzer, splitting assets per piattaforma |
| R-10-07 | Ritardi nell'approvazione Apple App Store per uso di background sync e notifiche | Media | Alto | Preparare documentazione dettagliata per App Store Review, implementare privacy manifest iOS 17+, sottomettere versione beta almeno 4 settimane prima del rilascio target |

---

## Definition of Done

- [ ] Login mobile funzionante con email/password e biometria (Face ID + fingerprint) su iOS e Android
- [ ] Biometria invalidata automaticamente su cambio password, con fallback login completo
- [ ] Vista contatti mobile con ricerca, filtri e scheda dettaglio con tap-to-call/email
- [ ] Vista pipeline Kanban con scroll orizzontale, spostamento deal tra stage, e dettaglio deal
- [ ] Push notification configurate e funzionanti per deal, task e menzioni con deep link
- [ ] Impostazioni notifiche con toggle per categoria e orari di quiete
- [ ] Offline mode funzionante: navigazione dati locali, creazione/modifica offline, sync automatico al rientro
- [ ] Conflict resolution UI per risolvere conflitti sync con scelta manuale
- [ ] Business card scan con OCR e creazione contatto pre-compilata, accuratezza > 85% su dataset test
- [ ] Task management mobile con lista raggruppata, creazione rapida, swipe per completamento
- [ ] Layout tablet split view per contatti, deal e attività con rotazione fluida
- [ ] Deep linking funzionante da notifiche, URL scheme e Universal Links con deferred redirect post-login
- [ ] Widget home screen per iOS (WidgetKit) e Android (Glance) con task oggi e pipeline summary
- [ ] App size < 80MB per download iniziale (esclusi asset on-demand)
- [ ] Performance: 60fps su scroll liste, < 2s cold start su device mid-range (es. Pixel 6a, iPhone 12)
- [ ] Test su almeno 5 dispositivi reali (3 Android + 2 iOS) per ogni feature critica
