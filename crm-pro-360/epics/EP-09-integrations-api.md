# Epic EP-09: Integrations & API Platform

## Metadata

| Campo | Valore |
|-------|--------|
| **Epic ID** | EP-09 |
| **Titolo** | Integrations & API Platform |
| **Progetto** | CRM Pro 360 |
| **Personas** | Chiara (CTO), Marco (Sales Director) |
| **Phase** | 2-5 (Sprint 12 SSO/basic, Sprint 22 API v2 + GraphQL, Sprint 23 full SDK) |
| **Story Points Totali** | ~105 SP |
| **Stato** | Draft |

## Overview

API RESTful v2 completa (OpenAPI 3.1), GraphQL API per query complesse, webhook bidirezionali con retry e firma, connettori nativi (Google Workspace, Microsoft 365, Slack, Zoom, Teams), connettori ERP (SAP, Oracle, Dynamics, Odoo), connettori marketing (Mailchimp, SendGrid, Google Analytics, Meta Pixel), supporto iPaaS (Zapier, Make, n8n), SDK ufficiali (TypeScript, Python, Java, .NET, Go).

L'obiettivo strategico è trasformare CRM Pro 360 da applicazione chiusa a piattaforma aperta, consentendo a partner e clienti enterprise di costruire integrazioni personalizzate senza dipendere dal team interno.

---

## User Stories

### US-105: API RESTful v2 con OpenAPI 3.1 spec auto-generata

**Come** Chiara (CTO),
**voglio** un'API RESTful v2 con specifica OpenAPI 3.1 generata automaticamente dal codice sorgente,
**in modo da** garantire che la documentazione sia sempre sincronizzata con l'implementazione e ridurre il time-to-integrate per i partner.

| Campo | Valore |
|-------|--------|
| **Story Points** | 13 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 22 |
| **Dipendenze** | EP-01 (autenticazione base), EP-03 (modello dati contatti/deal) |

**Acceptance Criteria:**

```gherkin
Given un endpoint API v2 decorato con metadata OpenAPI
When un client richiede GET /api/v2/openapi.json
Then riceve la specifica OpenAPI 3.1 completa con tutti gli endpoint, schemi, e risposte di errore

Given un developer autenticato con API key valida
When invia una richiesta GET /api/v2/contacts?page=1&limit=50
Then riceve una risposta paginata con header X-Total-Count, Link per navigazione, e dati conformi allo schema

Given un developer che invia una richiesta con parametri non validi
When il server processa la richiesta
Then restituisce un errore 422 con body conforme a RFC 7807 (Problem Details) includendo field-level errors

Given un endpoint che supporta versioning
When il client invia header Accept-Version: v2
Then il server instrada alla versione corretta del controller

Given rate limiting configurato a 1000 req/min per API key
When il client supera il limite
Then riceve 429 Too Many Requests con header Retry-After e X-RateLimit-Remaining: 0
```

---

### US-106: GraphQL API con query nestificate e filtri

**Come** Chiara (CTO),
**voglio** un endpoint GraphQL che permetta query nestificate con filtri, ordinamento e paginazione cursor-based,
**in modo da** consentire ai frontend avanzati e ai partner di recuperare esattamente i dati necessari in una singola richiesta.

| Campo | Valore |
|-------|--------|
| **Story Points** | 13 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 22 |
| **Dipendenze** | US-105 (API v2 base) |

**Acceptance Criteria:**

```gherkin
Given un utente autenticato con token OAuth2
When invia una query GraphQL per contatti con deal associati e attività recenti
Then riceve i dati nestificati in una singola risposta con tempo < 500ms per dataset < 1000 record

Given una query con filtro complesso (es. contatti con deal > €10k chiusi nell'ultimo mese)
When il resolver processa la query
Then applica i filtri al database senza N+1 query grazie a DataLoader

Given una query che richiede paginazione cursor-based
When il client invia first: 20, after: "cursor_abc"
Then riceve edges con cursor, pageInfo con hasNextPage e endCursor

Given una query con depth > 5 livelli di nesting
When il server valida la query
Then rifiuta con errore 400 "Query depth exceeds maximum allowed (5)"

Given una mutation GraphQL per aggiornare un contatto
When il campo email viene modificato con valore non valido
Then restituisce errore di validazione nel campo errors con path specifico
```

---

### US-107: Webhook bidirezionali con retry exponential e HMAC signature

**Come** Chiara (CTO),
**voglio** un sistema di webhook bidirezionali con retry exponential backoff e firma HMAC-SHA256,
**in modo da** notificare sistemi esterni degli eventi CRM in tempo reale con garanzia di consegna e sicurezza.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 22 |
| **Dipendenze** | US-105 (API v2 base) |

**Acceptance Criteria:**

```gherkin
Given un webhook registrato per l'evento "deal.stage_changed"
When un deal cambia stage nella pipeline
Then il sistema invia un POST HTTPS al URL configurato entro 5 secondi con payload JSON firmato HMAC-SHA256

Given un webhook endpoint che risponde con HTTP 500
When il delivery engine riceve l'errore
Then ritenta con backoff esponenziale (10s, 30s, 90s, 270s, 810s) fino a 5 tentativi totali

Given un webhook endpoint che non risponde entro 10 secondi
When il timeout scade
Then segna il tentativo come fallito e schedula il retry successivo

Given un amministratore nella sezione webhook settings
When visualizza la lista webhook
Then vede per ogni webhook: URL, eventi sottoscritti, stato (attivo/disabilitato), ultimi 10 delivery con status code e latenza

Given un webhook endpoint che fallisce 5 tentativi consecutivi
When tutti i retry sono esauriti
Then il webhook viene marcato come "failing", l'admin riceve notifica email, e il delivery log mostra tutti i tentativi con timestamp e errore

Given un sistema esterno che invia un webhook in ingresso (inbound)
When il payload arriva con header X-Webhook-Signature
Then il server verifica la firma HMAC-SHA256 e rifiuta con 401 se non valida
```

---

### US-108: Connettore Google Workspace (Calendar, Drive, Gmail)

**Come** Marco (Sales Director),
**voglio** un connettore nativo con Google Workspace che sincronizzi calendario, drive e email,
**in modo da** avere una visione unificata di tutti gli eventi, documenti e comunicazioni legati ai deal senza dover cambiare applicazione.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 12 |
| **Dipendenze** | EP-01 (OAuth2 framework) |

**Acceptance Criteria:**

```gherkin
Given un utente che clicca "Connetti Google Workspace" nelle impostazioni
When completa il flusso OAuth2 con consent screen Google
Then il sistema salva il refresh token crittografato e mostra lo stato "Connesso" con l'email dell'account

Given la sincronizzazione Google Calendar attiva
When un evento viene creato/modificato/cancellato in Google Calendar
Then il CRM riflette la modifica entro 60 secondi tramite push notification (webhook Google) o polling fallback ogni 5 minuti

Given un deal aperto con un contatto
When l'utente visita la timeline del deal
Then vede gli eventi Google Calendar correlati (match per email partecipanti) ordinati cronologicamente

Given un file Google Drive allegato a un deal
When l'utente clicca il link nella scheda deal
Then il file si apre in una nuova tab in Google Drive con i permessi corretti

Given la sincronizzazione Gmail attiva
When arriva un'email da un contatto presente nel CRM
Then l'email viene associata automaticamente al contatto e ai deal aperti relativi
```

---

### US-109: Connettore Microsoft 365 (Outlook, Teams, OneDrive)

**Come** Marco (Sales Director),
**voglio** un connettore nativo con Microsoft 365 che sincronizzi Outlook, Teams e OneDrive,
**in modo da** supportare i clienti enterprise che utilizzano l'ecosistema Microsoft senza forzare il cambio a Google.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 12 |
| **Dipendenze** | EP-01 (OAuth2 framework) |

**Acceptance Criteria:**

```gherkin
Given un utente che clicca "Connetti Microsoft 365" nelle impostazioni
When completa il flusso OAuth2 con Azure AD consent
Then il sistema salva il refresh token crittografato e mostra lo stato "Connesso" con l'email aziendale

Given la sincronizzazione Outlook Calendar attiva
When un meeting viene creato in Outlook
Then appare nel CRM entro 60 secondi associato ai contatti corrispondenti (match per email partecipanti)

Given un canale Teams associato a un deal
When un membro del team invia un messaggio nel canale
Then la timeline del deal mostra un riferimento al messaggio con link diretto a Teams

Given un file OneDrive allegato a un deal
When l'utente visita la scheda documenti del deal
Then vede il file con nome, dimensione, ultima modifica, e link per apertura in OneDrive

Given il token Microsoft 365 in scadenza
When il sistema rileva che il token scade entro 5 minuti
Then esegue il refresh automatico senza interruzione del servizio e senza intervento utente
```

---

### US-110: Connettore Slack (notifiche, comandi slash)

**Come** Marco (Sales Director),
**voglio** un connettore Slack che invii notifiche deal e supporti comandi slash per query rapide,
**in modo da** ricevere aggiornamenti CRM nel canale dove il team comunica quotidianamente senza dover aprire il CRM.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 15 |
| **Dipendenze** | EP-03 (pipeline deal), US-107 (webhook engine) |

**Acceptance Criteria:**

```gherkin
Given l'integrazione Slack configurata con un canale #sales-updates
When un deal cambia stage o supera un valore soglia configurabile
Then il bot CRM Pro 360 invia un messaggio formattato (rich block) nel canale con nome deal, valore, nuovo stage e link diretto

Given un utente Slack che digita /crm deal "Acme Corp"
When il comando viene processato
Then Slack mostra un messaggio ephemerally con: nome deal, valore, stage corrente, owner, e prossima attività pianificata

Given un utente Slack che digita /crm contact "Mario Rossi"
When il contatto esiste nel CRM
Then mostra nome, azienda, email, telefono, ultimo contatto, e deal aperti con link

Given un utente non autorizzato nel CRM che usa un comando slash
When il sistema verifica l'associazione Slack user -> CRM user
Then risponde con "Non sei autorizzato. Collega il tuo account CRM nelle impostazioni."

Given il canale Slack configurato per menzioni deal
When un utente menziona @crm-deal-nome nel messaggio
Then il bot arricchisce la menzione con un thread contenente dettagli sintetici del deal
```

---

### US-111: Connettore Zoom/Teams per videoconferenze

**Come** Marco (Sales Director),
**voglio** creare videoconferenze Zoom o Teams direttamente dal CRM e registrare automaticamente i meeting nella timeline,
**in modo da** eliminare il passaggio manuale di copiare link e annotare note post-call.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 16 |
| **Dipendenze** | US-108 o US-109 (almeno un connettore calendar) |

**Acceptance Criteria:**

```gherkin
Given un utente che crea un'attività di tipo "Meeting" su un deal
When seleziona "Crea link Zoom" o "Crea link Teams" dal dropdown
Then il sistema genera il meeting tramite API, inserisce il link nella descrizione e invia l'invito ai partecipanti

Given un meeting Zoom completato e registrato
When la registrazione è disponibile (webhook Zoom "recording.completed")
Then il CRM salva il link alla registrazione nella timeline del deal con durata e partecipanti

Given un meeting Teams in corso
When un partecipante si unisce o lascia la call
Then il CRM aggiorna in tempo reale il conteggio partecipanti nella timeline

Given un utente senza licenza Zoom Pro
When tenta di creare un meeting Zoom dal CRM
Then riceve un messaggio "Il tuo account Zoom non supporta la creazione di meeting via API. Aggiorna a Zoom Pro."

Given un meeting schedulato con link Zoom
When il meeting viene cancellato nel CRM
Then il meeting viene cancellato anche su Zoom e l'invito aggiornato ai partecipanti
```

---

### US-112: Connettore ERP (SAP Business One, Odoo)

**Come** Chiara (CTO),
**voglio** connettori ERP per sincronizzare anagrafiche clienti, ordini e fatture tra CRM e gestionale,
**in modo da** eliminare il doppio data entry e garantire che il team vendite veda lo stato finanziario aggiornato dei clienti.

| Campo | Valore |
|-------|--------|
| **Story Points** | 13 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 20 |
| **Dipendenze** | US-105 (API v2), EP-03 (modello contatti/aziende) |

**Acceptance Criteria:**

```gherkin
Given il connettore SAP Business One configurato con credenziali Service Layer
When la sync iniziale viene avviata
Then il sistema importa tutti i Business Partner con mapping automatico ai contatti CRM (match per P.IVA o nome azienda)

Given un nuovo ordine creato in SAP
When il sync incrementale processa l'evento
Then il CRM aggiorna la scheda azienda con: ultimo ordine, valore totale ordini, stato pagamenti

Given il connettore Odoo configurato via XML-RPC
When un contatto viene modificato nel CRM
Then la modifica viene propagata ad Odoo entro 5 minuti con conflict resolution (last-write-wins con audit log)

Given un conflitto di sincronizzazione (stesso campo modificato in entrambi i sistemi)
When il sync engine rileva il conflitto
Then registra entrambe le versioni nel log, applica la regola configurata (CRM-wins o ERP-wins), e notifica l'admin

Given un errore di connessione all'ERP
When il sistema non riesce a contattare SAP/Odoo per 3 tentativi
Then mette in coda le modifiche pendenti, mostra banner "Sync ERP sospesa" nella dashboard, e riprova ogni 15 minuti
```

---

### US-113: Connettore marketing (Mailchimp, SendGrid)

**Come** Marco (Sales Director),
**voglio** connettori con le piattaforme marketing per sincronizzare contatti e tracciare engagement delle campagne,
**in modo da** avere un lead scoring basato anche sull'interazione con le campagne email.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 18 |
| **Dipendenze** | EP-03 (modello contatti), US-107 (webhook engine) |

**Acceptance Criteria:**

```gherkin
Given il connettore Mailchimp configurato con API key
When un contatto CRM viene creato o aggiornato
Then viene sincronizzato come membro della lista Mailchimp corrispondente con tag e campi custom mappati

Given una campagna Mailchimp inviata
When un contatto apre l'email o clicca un link (webhook Mailchimp)
Then il CRM registra l'evento nella timeline del contatto e incrementa il lead score di +5 (open) o +10 (click)

Given il connettore SendGrid configurato
When un'email transazionale viene inviata tramite SendGrid
Then il CRM traccia delivery, open, click, bounce, e spam report per ogni contatto

Given un contatto che si disiscrive dalla mailing list Mailchimp
When il webhook "unsubscribe" viene ricevuto
Then il CRM aggiorna il flag "email_opt_out" del contatto e impedisce l'invio di future campagne

Given un admin che configura il mapping dei campi
When seleziona "CRM Company → Mailchimp MERGE field COMPANY"
Then il sistema valida il tipo di campo e mostra anteprima della sincronizzazione per i primi 10 contatti
```

---

### US-114: Supporto iPaaS (Zapier triggers/actions, Make modules)

**Come** Chiara (CTO),
**voglio** esporre trigger e action su piattaforme iPaaS (Zapier, Make, n8n),
**in modo da** consentire ai clienti di creare automazioni personalizzate senza scrivere codice.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 21 |
| **Dipendenze** | US-105 (API v2), US-107 (webhook engine) |

**Acceptance Criteria:**

```gherkin
Given un utente Zapier che cerca "CRM Pro 360" nello Zap editor
When seleziona l'app dalla directory
Then vede i trigger disponibili: New Contact, New Deal, Deal Stage Changed, New Activity, Form Submitted

Given un utente che crea un Zap con trigger "Deal Stage Changed"
When un deal nel CRM cambia stage
Then Zapier riceve l'evento entro 10 secondi e processa lo Zap con il payload del deal

Given un utente Make che aggiunge il modulo "CRM Pro 360 - Create Contact"
When configura i campi (nome, email, azienda) e esegue lo scenario
Then il contatto viene creato nel CRM con tutti i campi mappati e lo scenario restituisce il contact ID

Given un utente n8n che usa il nodo HTTP Request con API v2
When configura l'autenticazione con API key
Then riesce a eseguire qualsiasi operazione CRUD disponibile nell'API v2

Given il webhook Zapier che riceve 1000+ eventi al minuto durante un import massivo
When il rate limit Zapier viene raggiunto
Then il sistema accoda gli eventi e li consegna in ordine con backpressure senza perdere nessun evento
```

---

### US-115: SDK TypeScript/JavaScript con npm package

**Come** Chiara (CTO),
**voglio** un SDK TypeScript pubblicato su npm con tipi completi generati dalla specifica OpenAPI,
**in modo da** permettere agli sviluppatori JavaScript/TypeScript di integrare il CRM in minuti anziché ore.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🔴 Alta |
| **Sprint Target** | Sprint 23 |
| **Dipendenze** | US-105 (API v2 con OpenAPI spec) |

**Acceptance Criteria:**

```gherkin
Given uno sviluppatore che installa il pacchetto con npm install @crm-pro-360/sdk
When importa il client e lo inizializza con API key
Then ottiene autocompletamento TypeScript per tutti gli endpoint, parametri e tipi di risposta

Given uno sviluppatore che chiama sdk.contacts.list({ filter: { company: "Acme" }, page: 1 })
When la richiesta viene processata
Then riceve una risposta tipizzata ContactListResponse con paginazione e dati conformi allo schema

Given una nuova versione dell'API v2 rilasciata
When la CI/CD esegue la pipeline di generazione SDK
Then un nuovo pacchetto npm viene pubblicato automaticamente con tipi aggiornati e changelog generato

Given uno sviluppatore che gestisce gli errori
When una richiesta fallisce con 422 Validation Error
Then l'SDK lancia un'eccezione tipizzata CrmValidationError con accesso a fieldErrors[].field e fieldErrors[].message

Given uno sviluppatore che usa l'SDK in un ambiente Node.js
When esegue operazioni in batch (es. creare 100 contatti)
Then l'SDK gestisce automaticamente rate limiting con retry e backoff, e offre progress callback
```

---

### US-116: SDK Python con PyPI package

**Come** Chiara (CTO),
**voglio** un SDK Python pubblicato su PyPI con type hints e supporto async,
**in modo da** servire il segmento data science/analytics che utilizza Python per analisi e automazione.

| Campo | Valore |
|-------|--------|
| **Story Points** | 5 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 23 |
| **Dipendenze** | US-105 (API v2 con OpenAPI spec) |

**Acceptance Criteria:**

```gherkin
Given uno sviluppatore che installa il pacchetto con pip install crm-pro-360
When importa il client e lo inizializza con API key
Then ottiene type hints completi per tutti i metodi e modelli di dati

Given uno sviluppatore che chiama client.contacts.list(filter={"company": "Acme"})
When la richiesta viene processata
Then riceve un oggetto ContactListResponse con attributi tipizzati e paginazione

Given uno sviluppatore che usa async/await
When chiama async with CrmClient(api_key="...") as client: await client.deals.get(id="123")
Then la richiesta viene eseguita con httpx asincrono senza bloccare l'event loop

Given uno sviluppatore che genera un report con pandas
When chiama contacts_df = client.contacts.to_dataframe(filter={...})
Then riceve un pandas DataFrame con colonne tipizzate correttamente

Given un errore di rete durante una richiesta
When il timeout di connessione scade
Then l'SDK esegue fino a 3 retry con backoff e lancia CrmConnectionError con dettagli diagnostici
```

---

### US-117: Developer portal con documentazione interattiva

**Come** Chiara (CTO),
**voglio** un portale sviluppatori con documentazione interattiva, playground API e guide getting-started,
**in modo da** ridurre il tempo di onboarding dei partner tecnici e il carico sul team di supporto.

| Campo | Valore |
|-------|--------|
| **Story Points** | 8 |
| **Priorità** | 🟡 Media |
| **Sprint Target** | Sprint 23 |
| **Dipendenze** | US-105 (OpenAPI spec), US-115 (SDK TypeScript), US-116 (SDK Python) |

**Acceptance Criteria:**

```gherkin
Given un developer che visita developers.crmpro360.com
When accede alla sezione API Reference
Then vede tutti gli endpoint raggruppati per risorsa (Contacts, Deals, Activities, Webhooks) con try-it-out interattivo

Given un developer autenticato nel portale
When clicca "Try it" su GET /api/v2/contacts
Then può eseguire la richiesta con i propri dati sandbox e vedere request/response formattati con syntax highlighting

Given un developer che cerca "webhook" nella barra di ricerca
When digita la query
Then vede risultati istantanei da API reference, guide, changelog e code samples

Given un developer che visita la sezione "Getting Started"
When segue la guida step-by-step
Then riesce a creare un API key, fare la prima chiamata API, e ricevere un webhook in meno di 10 minuti

Given un aggiornamento alla specifica OpenAPI
When la CI/CD pubblica una nuova versione
Then il portale si aggiorna automaticamente entro 5 minuti con le nuove definizioni e changelog
```

---

## Task Breakdown

### API v2 & OpenAPI (US-105)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0700 | Configurare OpenAPI 3.1 con decoratori NestJS/Swagger | 8h | Backend Dev | - |
| T-0701 | Implementare controller API v2 per Contacts CRUD | 12h | Backend Dev | T-0700 |
| T-0702 | Implementare controller API v2 per Deals CRUD | 12h | Backend Dev | T-0700 |
| T-0703 | Implementare controller API v2 per Activities CRUD | 8h | Backend Dev | T-0700 |
| T-0704 | Implementare versioning strategy con header Accept-Version | 6h | Backend Dev | T-0700 |
| T-0705 | Implementare rate limiting per API key con Redis sliding window | 8h | Backend Dev | T-0700 |
| T-0706 | Implementare error response RFC 7807 (Problem Details) | 4h | Backend Dev | T-0700 |
| T-0707 | Scrivere test e2e per tutti gli endpoint API v2 | 12h | QA Engineer | T-0701, T-0702, T-0703 |

### GraphQL API (US-106)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0708 | Setup Apollo Server con NestJS GraphQL module | 6h | Backend Dev | T-0700 |
| T-0709 | Implementare schema e resolver per Contacts con DataLoader | 10h | Backend Dev | T-0708 |
| T-0710 | Implementare schema e resolver per Deals con relazioni nestificate | 10h | Backend Dev | T-0708 |
| T-0711 | Implementare paginazione cursor-based (Relay-style) | 6h | Backend Dev | T-0709 |
| T-0712 | Implementare query depth limiter e complexity analysis | 4h | Backend Dev | T-0708 |
| T-0713 | Scrivere test per GraphQL query complesse e edge case | 8h | QA Engineer | T-0709, T-0710 |

### Webhook Engine (US-107)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0714 | Implementare webhook registration API (CRUD) | 6h | Backend Dev | T-0700 |
| T-0715 | Implementare delivery engine con BullMQ e retry exponential | 10h | Backend Dev | T-0714 |
| T-0716 | Implementare HMAC-SHA256 signing per outbound webhook | 4h | Backend Dev | T-0715 |
| T-0717 | Implementare HMAC verification per inbound webhook | 4h | Backend Dev | T-0714 |
| T-0718 | Implementare dashboard delivery log con filtri e retry manuale | 8h | Frontend Dev | T-0715 |
| T-0719 | Implementare notifica admin per webhook in stato "failing" | 4h | Backend Dev | T-0715 |

### Connettori Nativi (US-108, US-109, US-110, US-111)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0720 | Implementare OAuth2 flow generico per connettori (factory pattern) | 8h | Backend Dev | - |
| T-0721 | Implementare Google Calendar sync (push notification + polling fallback) | 12h | Backend Dev | T-0720 |
| T-0722 | Implementare Google Drive file linking per deal | 6h | Backend Dev | T-0720 |
| T-0723 | Implementare Gmail sync con associazione automatica contatti | 10h | Backend Dev | T-0720 |
| T-0724 | Implementare Microsoft 365 OAuth2 con Azure AD | 8h | Backend Dev | T-0720 |
| T-0725 | Implementare Outlook Calendar sync via Microsoft Graph API | 10h | Backend Dev | T-0724 |
| T-0726 | Implementare OneDrive file linking per deal | 6h | Backend Dev | T-0724 |
| T-0727 | Implementare Teams channel linking e message references | 8h | Backend Dev | T-0724 |
| T-0728 | Implementare Slack bot con rich block notifications | 8h | Backend Dev | T-0720 |
| T-0729 | Implementare Slack slash commands (/crm deal, /crm contact) | 6h | Backend Dev | T-0728 |
| T-0730 | Implementare Zoom meeting creation e recording webhook | 8h | Backend Dev | T-0720 |
| T-0731 | Implementare Teams meeting creation via Microsoft Graph | 6h | Backend Dev | T-0724 |
| T-0732 | UI impostazioni connettori con stato connessione e mapping campi | 12h | Frontend Dev | T-0720 |

### Connettore ERP (US-112)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0733 | Implementare adapter SAP Business One Service Layer | 12h | Backend Dev | T-0720 |
| T-0734 | Implementare adapter Odoo XML-RPC | 10h | Backend Dev | T-0720 |
| T-0735 | Implementare sync engine bidirezionale con conflict resolution | 12h | Backend Dev | T-0733 |
| T-0736 | Implementare coda sync con retry e monitoring | 6h | Backend Dev | T-0735 |
| T-0737 | Implementare UI mapping campi ERP <-> CRM con anteprima | 8h | Frontend Dev | T-0733, T-0734 |

### Connettore Marketing (US-113)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0738 | Implementare Mailchimp API integration (liste, membri, campagne) | 8h | Backend Dev | T-0720 |
| T-0739 | Implementare webhook Mailchimp per tracking open/click/unsubscribe | 6h | Backend Dev | T-0717 |
| T-0740 | Implementare SendGrid integration per email transazionali | 6h | Backend Dev | T-0720 |
| T-0741 | Implementare lead score adjustment da engagement marketing | 4h | Backend Dev | T-0738 |

### iPaaS Support (US-114)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0742 | Sviluppare Zapier app con trigger (polling + webhook) | 10h | Backend Dev | T-0714 |
| T-0743 | Sviluppare Zapier app con action (create/update contact, deal) | 8h | Backend Dev | T-0742 |
| T-0744 | Sviluppare Make (Integromat) modules | 8h | Backend Dev | T-0714 |
| T-0745 | Documentare setup n8n con HTTP Request node | 4h | Technical Writer | T-0700 |

### SDK (US-115, US-116)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0746 | Configurare openapi-generator per TypeScript SDK | 6h | Backend Dev | T-0700 |
| T-0747 | Personalizzare template SDK TS con error handling e retry | 8h | Backend Dev | T-0746 |
| T-0748 | Pubblicare @crm-pro-360/sdk su npm con CI/CD | 4h | DevOps | T-0747 |
| T-0749 | Configurare openapi-generator per Python SDK | 6h | Backend Dev | T-0700 |
| T-0750 | Personalizzare template SDK Python con async support e pandas integration | 8h | Backend Dev | T-0749 |
| T-0751 | Pubblicare crm-pro-360 su PyPI con CI/CD | 4h | DevOps | T-0750 |

### Developer Portal (US-117)

| Task ID | Descrizione | Ore | Ruolo | Dipendenze |
|---------|-------------|-----|-------|------------|
| T-0752 | Setup portale con Docusaurus + Redocly per API reference | 10h | Frontend Dev | T-0700 |
| T-0753 | Implementare playground API con autenticazione sandbox | 8h | Frontend Dev | T-0752 |
| T-0754 | Scrivere guide "Getting Started" per TypeScript e Python | 8h | Technical Writer | T-0747, T-0750 |
| T-0755 | Implementare search full-text con Algolia DocSearch | 4h | Frontend Dev | T-0752 |
| T-0756 | Configurare auto-deploy portale da CI/CD su spec change | 4h | DevOps | T-0752 |

---

## Technical Design Notes

### OAuth2 Connector Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  CRM Frontend │────▶│  OAuth2 Gateway  │────▶│  Provider (Google │
│  (Settings)   │◀────│  /connectors/    │◀────│  / Microsoft /   │
└──────────────┘     │  auth/callback   │     │  Slack / Zoom)   │
                     └────────┬────────┘     └──────────────────┘
                              │
                     ┌────────▼────────┐
                     │  Token Store     │
                     │  (encrypted,     │
                     │  per-tenant)     │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │  Sync Engine     │
                     │  (BullMQ jobs)   │
                     └─────────────────┘
```

- **Factory Pattern**: `IConnectorDriver` interface con implementazioni per ogni provider. `ConnectorDriverFactory.create(provider)` restituisce il driver appropriato.
- **Token Management**: Refresh token crittografato con AES-256-GCM. Auto-refresh 5 minuti prima della scadenza. Fallback a re-authorization se refresh fallisce.
- **Sync Strategy**: Push notifications (webhook dal provider) come canale primario. Polling a intervalli configurabili come fallback. Deduplicazione eventi tramite idempotency key.

### Webhook Delivery Engine

```
Event Bus ──▶ Webhook Matcher ──▶ BullMQ Queue ──▶ Delivery Worker
                                       │
                                       ▼
                                  Retry Policy
                                  (exponential backoff)
                                       │
                                       ▼
                                  Delivery Log
                                  (PostgreSQL)
```

- **Signing**: Ogni webhook outbound include header `X-CRM-Signature: sha256=<hmac>` calcolato su `timestamp.payload` con secret per-webhook.
- **Retry Schedule**: 10s, 30s, 90s, 270s, 810s (5 tentativi, ~20 minuti totali).
- **Circuit Breaker**: Dopo 50 failure consecutive in 1h, il webhook viene disabilitato con notifica admin.

### SDK Code Generation Pipeline

```
OpenAPI 3.1 Spec ──▶ openapi-generator ──▶ TypeScript SDK ──▶ npm publish
                  │                     └──▶ Python SDK    ──▶ PyPI publish
                  │
                  ▼
              Customized templates (error handling, retry, auth)
```

- **Generazione automatica**: CI/CD trigger su modifica dello schema OpenAPI.
- **Customizzazione**: Template Mustache personalizzati per aggiungere retry logic, typed errors, e helper methods.
- **Versioning**: SDK version segue API version. Breaking changes = major version bump.

---

## Rischi

| ID | Rischio | Probabilità | Impatto | Mitigazione |
|----|---------|-------------|---------|-------------|
| R-09-01 | API provider (Google, Microsoft) modificano le API senza preavviso, rompendo i connettori | Media | Alto | Monitoraggio changelog provider, test di regressione automatici settimanali, abstraction layer per isolare le breaking change |
| R-09-02 | Rate limiting dei provider esterni causa fallimenti nella sincronizzazione | Alta | Medio | Implementare adaptive rate limiting con backoff rispettando i limiti del provider, coda di priorità per operazioni critiche |
| R-09-03 | Token OAuth2 scaduti o revocati dall'utente senza notifica al CRM | Media | Medio | Health check periodico dei token (ogni 1h), notifica proattiva all'utente 7 giorni prima della scadenza del refresh token (per provider che lo supportano) |
| R-09-04 | Conflitti di sincronizzazione bidirezionale con ERP causano dati inconsistenti | Alta | Alto | Conflict resolution configurabile (CRM-wins / ERP-wins), audit log completo di ogni modifica, UI per risolvere conflitti manualmente |
| R-09-05 | Costi elevati per API di terze parti (Zoom, SAP) che impattano il pricing del prodotto | Media | Medio | Analisi costi pre-implementazione per ogni connettore, tier pricing basato su numero di connettori attivi |
| R-09-06 | Complessità nella manutenzione di SDK multi-linguaggio causa regressioni | Media | Medio | Generazione automatica da OpenAPI, test suite per ogni SDK nella CI/CD, versioning rigoroso |
| R-09-07 | Webhook delivery failure in caso di downtime del sistema destinatario | Alta | Alto | Retry con backoff, dead letter queue, dashboard di monitoring, notifica admin per webhook in stato critico |

---

## Definition of Done

- [ ] API v2 espone tutti gli endpoint CRUD per risorse principali (Contacts, Deals, Activities, Companies) con specifica OpenAPI 3.1 validata
- [ ] GraphQL API supporta query nestificate fino a depth 5, paginazione cursor-based e rate limiting
- [ ] Webhook engine consegna eventi con latenza < 5s nel 95th percentile e supporta retry fino a 5 tentativi
- [ ] Connettore Google Workspace sincronizza Calendar, Drive e Gmail con latenza < 60s
- [ ] Connettore Microsoft 365 sincronizza Outlook, Teams e OneDrive con auto-refresh token
- [ ] Connettore Slack invia notifiche rich-block e risponde a slash commands in < 3s
- [ ] Connettore Zoom/Teams crea meeting e registra nella timeline automaticamente
- [ ] Connettore ERP sincronizza anagrafiche con conflict resolution e audit log
- [ ] Connettore marketing traccia engagement e aggiorna lead score in tempo reale
- [ ] Zapier app pubblicata con almeno 5 trigger e 5 action
- [ ] SDK TypeScript pubblicato su npm con 100% type coverage e test automatici
- [ ] SDK Python pubblicato su PyPI con type hints, async support e pandas integration
- [ ] Developer portal live con API reference interattiva, playground e search
- [ ] Test di integrazione per ogni connettore con mock dei provider esterni
- [ ] Documentazione di ogni endpoint con almeno 2 esempi (success e error)
- [ ] Performance: API v2 risponde in < 200ms per GET singolo, < 500ms per liste paginate (P95)
