# Sprint 17 — Mobile Application

## Fase: Phase 3 — AI Governance & Scale

## Date: M9-W1 → M9-W2

## Obiettivo Sprint

App mobile React Native + Expo con login biometrico, gestione contatti, pipeline Kanban semplificata, push notifications via FCM, offline mode con sync engine, scansione biglietti da visita con OCR.

## Capacità Team

| Story Points | Ruoli |
|---|---|
| 85 SP | 3 Frontend (mobile), 1 Backend, 1 QA, 1 UX |

## Sprint Backlog

| # | Task | SP | Ruolo | Stato |
|---|---|---|---|---|
| 1 | T-1701 — React Native + Expo project setup (monorepo integration, config) | 3 | Frontend | 📋 TODO |
| 2 | T-1702 — Navigation architecture con React Navigation (stack + tab + drawer) | 4 | Frontend | 📋 TODO |
| 3 | T-1703 — Autenticazione biometrica con Expo LocalAuthentication (Face ID, fingerprint) | 4 | Frontend | 📋 TODO |
| 4 | T-1704 — Login screen con email/password e biometric unlock | 4 | Frontend | 📋 TODO |
| 5 | T-1705 — Secure token storage (expo-secure-store) e refresh token flow | 3 | Frontend | 📋 TODO |
| 6 | T-1706 — Contact list screen con ricerca, avatar e infinite scroll | 5 | Frontend | 📋 TODO |
| 7 | T-1707 — Contact detail screen (info, attività recenti, azioni rapide) | 4 | Frontend | 📋 TODO |
| 8 | T-1708 — Contact search con filtri (nome, azienda, tag, ultimo contatto) | 3 | Frontend | 📋 TODO |
| 9 | T-1709 — Pipeline Kanban screen semplificata (colonne draggabili, card deal) | 5 | Frontend | 📋 TODO |
| 10 | T-1710 — Deal detail screen (valore, stage, attività, note) | 4 | Frontend | 📋 TODO |
| 11 | T-1711 — Push notification setup con Firebase Cloud Messaging (FCM) | 5 | Backend | 📋 TODO |
| 12 | T-1712 — Backend endpoint registrazione device token per push notifications | 3 | Backend | 📋 TODO |
| 13 | T-1713 — Notification preferences screen (per tipo: deal, task, email, menzione) | 3 | Frontend | 📋 TODO |
| 14 | T-1714 — Offline database con WatermelonDB (schema, modelli, migrazioni) | 5 | Frontend | 📋 TODO |
| 15 | T-1715 — Sync engine: coda operazioni offline, replay al ripristino connessione | 5 | Frontend | 📋 TODO |
| 16 | T-1716 — Conflict resolution strategy per sync (last-write-wins con timestamp) | 3 | Backend | 📋 TODO |
| 17 | T-1717 — Business card scan: cattura immagine con camera (expo-camera) | 4 | Frontend | 📋 TODO |
| 18 | T-1718 — OCR processing business card con ML Kit (estrazione nome, email, telefono, azienda) | 5 | Frontend | 📋 TODO |
| 19 | T-1719 — OCR → contact creation flow (review dati estratti, conferma, salvataggio) | 4 | Frontend | 📋 TODO |
| 20 | T-1720 — Task list screen con filtri (scadenza, priorità, assegnato a me) | 4 | Frontend | 📋 TODO |
| 21 | T-1721 — Tablet split-view layout (master-detail per contatti e deal) | 3 | UX | 📋 TODO |
| 22 | T-1722 — Deep linking configuration (apertura diretta contatto/deal da notifica) | 3 | Frontend | 📋 TODO |
| 23 | T-1723 — App icon, splash screen e branding assets | 2 | UX | 📋 TODO |
| 24 | T-1724 — iOS TestFlight setup e primo build distribuibile | 3 | Frontend | 📋 TODO |
| 25 | T-1725 — Android internal testing track su Google Play Console | 3 | Frontend | 📋 TODO |
| 26 | T-1726 — E2E tests con Detox (login, lista contatti, creazione deal) | 5 | QA | 📋 TODO |

**Totale: 85 SP** (26 item)

## Dipendenze Esterne

- **Apple Developer Account** — necessario per TestFlight e provisioning profiles
- **Google Play Console** — necessario per internal testing track Android
- **Firebase project** — per FCM push notifications, deve essere configurato con server key
- **ML Kit OCR** — SDK Google per riconoscimento testo, richiede accettazione ToS
- **WatermelonDB** — compatibilità con Expo managed workflow da verificare (potrebbe richiedere bare workflow)
- **Backend API** — endpoint esistenti devono supportare paginazione e delta sync per offline mode

## Rischi Sprint

1. **Expo managed vs bare workflow** — WatermelonDB e ML Kit potrebbero richiedere bare workflow, aumentando complessità build e manutenzione. Mitigazione: valutare alternative Expo-native (SQLite per offline, expo-ml-kit se disponibile) nella W1.
2. **Sync conflicts** — last-write-wins può causare perdita dati in scenari multi-device. Mitigazione: logging dettagliato dei conflitti, possibilità di rollback manuale, notifica utente su conflitto.
3. **OCR accuracy** — riconoscimento testo su biglietti da visita con layout non standard può avere bassa accuracy. Mitigazione: step di review manuale obbligatorio, suggerimenti intelligenti per campi non riconosciuti.
4. **Performance Kanban mobile** — drag-and-drop su dispositivi touch con molte card può essere lento. Mitigazione: virtualizzazione colonne, limite card visibili per colonna, lazy loading.

## Definition of Done Sprint

1. [ ] Tutti i 26 item hanno stato completato o giustificazione per rinvio
2. [ ] Login con biometria funziona su iOS (Face ID) e Android (fingerprint)
3. [ ] Lista contatti carica e mostra almeno 1000 contatti senza crash
4. [ ] Pipeline Kanban permette drag-and-drop deal tra stage
5. [ ] Push notification ricevuta su device reale entro 5 secondi dall'evento
6. [ ] Offline mode: creazione contatto offline, sync automatico al ripristino rete
7. [ ] Business card scan estrae correttamente nome e email in > 80% dei casi di test
8. [ ] Deep linking apre direttamente il contatto/deal corretto dalla notifica
9. [ ] App installabile via TestFlight (iOS) e internal testing (Android)
10. [ ] Tablet split-view layout funziona su iPad e tablet Android > 10"
11. [ ] E2E tests Detox passano su iOS simulator e Android emulator
12. [ ] Nessun crash rilevato durante 30 minuti di utilizzo continuo

## Deliverable Attesi

- App React Native + Expo installabile su iOS e Android
- Autenticazione biometrica (Face ID, fingerprint)
- Gestione contatti con ricerca e dettaglio
- Pipeline Kanban semplificata con drag-and-drop
- Push notifications per eventi CRM
- Offline mode con sync automatico
- Scansione biglietti da visita con OCR
- Build distribuite su TestFlight e Google Play internal track

## Demo/Review Notes

| Campo | Valore |
|---|---|
| **Data Demo** | _da definire_ |
| **Partecipanti** | _da definire_ |
| **Scenario Demo 1** | Login biometrico su iPhone, navigazione contatti, apertura dettaglio |
| **Scenario Demo 2** | Offline mode: disattivare rete, creare contatto, riattivare rete, verificare sync |
| **Scenario Demo 3** | Business card scan: scansionare biglietto reale, verificare dati estratti, creare contatto |
| **Scenario Demo 4** | Push notification: assegnare deal in web app, ricevere notifica su mobile, aprire deal |
| **Feedback Ricevuto** | _da compilare post-review_ |
| **Action Items** | _da compilare post-review_ |
| **Velocity Effettiva** | ___ SP / 85 SP pianificati |
