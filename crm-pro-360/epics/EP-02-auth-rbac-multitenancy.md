# Epic EP-02: Authentication, RBAC & Multi-Tenancy

| Campo | Valore |
|---|---|
| **Epic ID** | EP-02 |
| **Titolo** | Authentication, RBAC & Multi-Tenancy |
| **Progetto** | CRM Pro 360 |
| **Personas** | Chiara (CTO), Marco (Sales Director) |
| **Fase** | 1 (Sprint 3-4) |
| **Story Points stimati** | 97 SP |
| **Dipendenze** | EP-01 (infrastruttura operativa) |

## Panoramica

Sistema completo di autenticazione con JWT access token + refresh token rotation, autenticazione multi-fattore con TOTP (Google Authenticator) e WebAuthn/FIDO2 (passkeys), Single Sign-On via SAML 2.0 e OpenID Connect per integrazione enterprise. Engine RBAC con permission model Resource x Action x Scope, field-level security per dati sensibili, Row-Level Security PostgreSQL per isolamento multi-tenant a livello database. Tenant provisioning e deprovisioning automatizzato, gerarchia Workspace/Organization/Team, audit log immutabile per compliance, consent management GDPR e password policy conforme a NIST 800-63B.

---

## User Stories

### US-013: Registrazione utente con email verification

| Campo | Valore |
|---|---|
| **ID** | US-013 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 5 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | EP-01 completato |
| **Assegnatario** | Backend Engineer |

**Come** Marco (Sales Director),
**voglio** registrare il mio account con email e password e ricevere un'email di verifica,
**in modo da** accedere alla piattaforma CRM con un account verificato e sicuro.

**Acceptance Criteria:**

```gherkin
Given un utente non registrato accede alla pagina di registrazione
When compila il form con nome, cognome, email aziendale e password valida
Then viene creato un account in stato "pending_verification"
  And viene inviata un'email con un link di verifica (token JWT, scadenza 24 ore)
  And l'utente viene reindirizzato a una pagina "Controlla la tua email"
  And il token di verifica è single-use e invalidato dopo il primo utilizzo

Given l'utente ha ricevuto l'email di verifica
When clicca sul link entro 24 ore
Then l'account passa a stato "active"
  And l'utente viene reindirizzato alla pagina di onboarding
  And il token viene invalidato nel database

Given l'utente tenta di registrarsi con un'email gia esistente
When invia il form di registrazione
Then viene mostrato un messaggio generico "Se l'email non è gia registrata, riceverai un link di verifica"
  And NON viene rivelata l'esistenza dell'account (prevenzione user enumeration)
  And viene inviata un'email all'indirizzo esistente informando del tentativo
```

---

### US-014: Login con JWT + refresh token rotation

| Campo | Valore |
|---|---|
| **ID** | US-014 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-013 |
| **Assegnatario** | Backend Engineer |

**Come** Marco (Sales Director),
**voglio** autenticarmi con email e password e ricevere token di sessione con refresh automatico,
**in modo da** avere una sessione sicura e persistente senza dovermi autenticare ripetutamente.

**Acceptance Criteria:**

```gherkin
Given un utente con account attivo
When invia credenziali valide all'endpoint POST /auth/login
Then riceve:
  - Access token JWT (scadenza 15 minuti, claims: userId, tenantId, roles, permissions)
  - Refresh token opaco (scadenza 7 giorni, salvato in httpOnly secure cookie)
  - Token fingerprint nel payload JWT per binding al client
  And il refresh token viene salvato nel database con hash bcrypt

Given l'access token è scaduto e il refresh token è valido
When il client invia POST /auth/refresh con il refresh token cookie
Then viene generata una nuova coppia access + refresh token (rotation)
  And il vecchio refresh token viene invalidato (single-use)
  And se il vecchio refresh token viene riutilizzato, TUTTI i refresh token della famiglia vengono invalidati (reuse detection)

Given un utente tenta il login con credenziali errate
When sbaglia 5 volte consecutive in 15 minuti
Then l'account viene bloccato temporaneamente per 30 minuti
  And viene inviata un'email di notifica di tentativi sospetti
  And il rate limiter blocca ulteriori tentativi dallo stesso IP
  And il messaggio di errore è generico "Credenziali non valide" (no leak)
```

---

### US-015: MFA con TOTP (Google Authenticator)

| Campo | Valore |
|---|---|
| **ID** | US-015 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 5 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-014 |
| **Assegnatario** | Backend Engineer |

**Come** Marco (Sales Director),
**voglio** attivare l'autenticazione a due fattori con Google Authenticator,
**in modo da** proteggere il mio account anche se la password viene compromessa.

**Acceptance Criteria:**

```gherkin
Given un utente autenticato accede alle impostazioni di sicurezza
When attiva MFA TOTP
Then il server genera un secret TOTP (RFC 6238) e lo mostra come QR code
  And l'utente scansiona il QR con Google Authenticator
  And il server richiede la verifica di un codice TOTP per confermare l'attivazione
  And vengono generati 10 recovery codes (monouso, mostrati una sola volta)
  And il secret TOTP viene salvato cifrato (AES-256-GCM) nel database

Given MFA TOTP è attivo sull'account
When l'utente esegue login con email/password corrette
Then viene presentato il challenge MFA (step 2)
  And l'utente inserisce il codice TOTP a 6 cifre
  And il server verifica il codice con finestra di tolleranza di 1 step (30 secondi)
  And solo dopo la verifica MFA vengono emessi access + refresh token

Given l'utente ha perso l'accesso all'app authenticator
When inserisce un recovery code valido al posto del TOTP
Then il login procede con successo
  And il recovery code usato viene invalidato
  And viene inviata un'email di notifica dell'uso del recovery code
  And all'utente viene suggerito di rigenerare i recovery codes
```

---

### US-016: MFA con WebAuthn/FIDO2 (passkeys)

| Campo | Valore |
|---|---|
| **ID** | US-016 |
| **Priorita** | 🟡 Media |
| **Story Points** | 8 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-014 |
| **Assegnatario** | Full-Stack Engineer |

**Come** Marco (Sales Director),
**voglio** utilizzare una passkey (biometrica o security key) come secondo fattore o come login passwordless,
**in modo da** avere un'esperienza di login piu rapida e resistente al phishing.

**Acceptance Criteria:**

```gherkin
Given un utente autenticato accede alle impostazioni di sicurezza
When registra una nuova passkey WebAuthn
Then il server genera una challenge con opzioni di registrazione (Relying Party ID = crmpro360.io)
  And il browser richiede la verifica biometrica (fingerprint, face) o security key
  And la credential public key viene salvata nel database con attestation metadata
  And l'utente puo registrare fino a 5 passkeys con nomi personalizzati

Given un utente ha una passkey registrata
When accede alla pagina di login e seleziona "Accedi con passkey"
Then il server genera una challenge di autenticazione
  And il browser presenta il prompt biometrico/security key
  And dopo la verifica, l'utente è autenticato senza inserire email o password
  And vengono emessi access + refresh token come nel flusso standard

Given un utente ha sia TOTP che WebAuthn configurati
When esegue il login con email/password
Then puo scegliere tra TOTP e WebAuthn come secondo fattore
  And il metodo preferito (ultimo usato) è pre-selezionato
  And WebAuthn ha priorita visiva come opzione consigliata (resistenza phishing)
```

---

### US-017: SSO con SAML 2.0

| Campo | Valore |
|---|---|
| **ID** | US-017 |
| **Priorita** | 🟡 Media |
| **Story Points** | 8 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-014 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** configurare SAML 2.0 SSO con il nostro Identity Provider aziendale (Okta/Azure AD),
**in modo da** permettere ai dipendenti di accedere a CRM Pro 360 con le credenziali aziendali esistenti senza gestire password separate.

**Acceptance Criteria:**

```gherkin
Given un admin tenant accede alle impostazioni SSO
When configura un provider SAML 2.0 caricando il metadata XML dell'IdP
Then il sistema salva la configurazione con:
  - EntityID, SSO URL, SLO URL, certificato X.509 dell'IdP
  - Mapping degli attributi SAML ai campi utente (email, nome, cognome, ruolo)
  - ACS URL del CRM generato automaticamente
  And il metadata XML del Service Provider è scaricabile per l'importazione nell'IdP

Given SAML SSO è configurato per il tenant
When un utente non autenticato accede a crmpro360.io/login?tenant=acme
Then viene mostrato il pulsante "Accedi con SSO aziendale"
  And cliccando, viene reindirizzato all'IdP con AuthnRequest firmata
  And dopo l'autenticazione sull'IdP, l'utente torna al CRM con SAMLResponse
  And il sistema valida la firma, estrae gli attributi e crea/aggiorna l'utente
  And vengono emessi JWT access + refresh token

Given un utente SSO non esiste ancora nel CRM
When arriva la SAMLResponse con attributi validi
Then viene eseguito Just-In-Time (JIT) provisioning:
  - L'utente viene creato con ruolo di default del tenant
  - Il profilo viene popolato con attributi SAML mappati
  - L'utente viene aggiunto all'organizzazione del tenant
  And l'evento viene registrato nell'audit log
```

---

### US-018: SSO con OpenID Connect

| Campo | Valore |
|---|---|
| **ID** | US-018 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-014 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** supportare OpenID Connect come alternativa a SAML per SSO con provider moderni (Google Workspace, Microsoft Entra),
**in modo da** offrire flessibilita nella scelta del protocollo SSO in base all'IdP del cliente.

**Acceptance Criteria:**

```gherkin
Given un admin tenant accede alle impostazioni SSO
When configura un provider OIDC inserendo issuer URL, client_id e client_secret
Then il sistema recupera la configurazione dal well-known endpoint (.well-known/openid-configuration)
  And salva: authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri
  And configura i redirect URI per il tenant

Given OIDC è configurato
When un utente clicca "Accedi con SSO" e viene reindirizzato all'IdP OIDC
Then il flusso Authorization Code + PKCE viene eseguito:
  - Redirect all'authorization endpoint con code_challenge
  - L'utente si autentica sull'IdP
  - Callback con authorization code
  - Scambio code per id_token + access_token con code_verifier
  And l'id_token viene validato (firma, issuer, audience, expiry, nonce)
  And il profilo utente viene estratto dai claims standard (sub, email, name)

Given un tenant ha sia SAML che OIDC configurati
When un utente accede alla pagina di login del tenant
Then vengono mostrati entrambi i provider SSO con nomi personalizzati
  And il domain-based routing associa il dominio email al provider corretto
  And l'utente puo sempre tornare al login email/password se SSO non funziona
```

---

### US-019: Engine RBAC con ruoli gerarchici

| Campo | Valore |
|---|---|
| **ID** | US-019 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-014 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** un engine RBAC con ruoli gerarchici dove i ruoli superiori ereditano automaticamente i permessi dei ruoli inferiori,
**in modo da** gestire le autorizzazioni in modo scalabile senza duplicare permessi tra ruoli.

**Acceptance Criteria:**

```gherkin
Given il sistema definisce una gerarchia di ruoli di default
When l'engine RBAC viene inizializzato per un nuovo tenant
Then vengono creati i ruoli gerarchici:
  - SuperAdmin > Admin > Manager > Member > Viewer (gerarchia fissa)
  - Ogni ruolo eredita tutti i permessi dei ruoli inferiori
  - I ruoli custom possono essere creati come figli di qualsiasi livello
  And la gerarchia è rappresentata come DAG (no cicli) nel database

Given un Admin assegna un ruolo "Manager" a un utente
When il sistema verifica i permessi dell'utente
Then l'utente ha:
  - Tutti i permessi espliciti del ruolo Manager
  - Tutti i permessi ereditati da Member e Viewer
  - Nessun permesso di Admin o SuperAdmin
  And la risoluzione dei permessi è cached in Redis con TTL 5 minuti
  And la modifica di un ruolo invalida la cache di tutti gli utenti con quel ruolo

Given un Admin tenta di assegnare un ruolo superiore al proprio
When prova ad assegnare il ruolo "SuperAdmin" a un utente
Then l'operazione viene rifiutata con errore 403
  And il tentativo viene registrato nell'audit log come security event
  And nessun utente puo elevarsi oltre il proprio livello gerarchico
```

---

### US-020: Permission model Resource x Action x Scope

| Campo | Valore |
|---|---|
| **ID** | US-020 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-019 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** un modello di permessi granulare basato su Resource (contatto, deal, email), Action (create, read, update, delete) e Scope (own, team, org, all),
**in modo da** controllare esattamente chi puo fare cosa su quali dati in base al contesto organizzativo.

**Acceptance Criteria:**

```gherkin
Given il sistema ha il permission model R x A x S configurato
When definisco un permesso "contacts:read:team"
Then l'utente con questo permesso puo:
  - Leggere tutti i contatti assegnati ai membri del suo team
  - NON leggere contatti di altri team (scope "team" limita)
  And il permesso è rappresentato come stringa "resource:action:scope"
  And le resource supportate sono: contacts, deals, emails, tasks, reports, settings
  And le action supportate sono: create, read, update, delete, export, import, assign
  And gli scope supportati sono: own, team, organization, all

Given un ruolo "Sales Rep" ha permessi contacts:read:team, contacts:update:own, deals:create:own
When un utente con ruolo "Sales Rep" tenta di aggiornare un contatto di un collega
Then la richiesta viene rifiutata (scope "own" non include contatti altrui)
  And il response è 403 con messaggio "Permesso insufficiente: contacts:update richiede scope >= team"

Given un Admin modifica i permessi di un ruolo
When aggiunge "contacts:update:team" al ruolo "Sales Rep"
Then la cache dei permessi viene invalidata per tutti gli utenti con quel ruolo
  And le richieste successive usano i nuovi permessi entro 5 secondi
  And la modifica viene registrata nell'audit log con before/after diff
```

---

### US-021: Field-level security

| Campo | Valore |
|---|---|
| **ID** | US-021 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-020 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** nascondere o mascherare campi sensibili (telefono, email, revenue, note private) in base al ruolo dell'utente,
**in modo da** proteggere i dati sensibili anche all'interno dell'organizzazione, rispettando il principio del minimo privilegio.

**Acceptance Criteria:**

```gherkin
Given il sistema ha una configurazione field-level security per risorsa
When un utente con ruolo "Viewer" richiede GET /api/contacts/:id
Then la response include tutti i campi consentiti per il ruolo
  And i campi restricted (telefono, email personale, revenue) sono:
    - Omessi completamente (campo assente dal JSON) per livello "hidden"
    - Mascherati (es. "***@email.com", "+39 ***") per livello "masked"
  And il campo `_fieldAccess` nella response indica i campi nascosti/mascherati

Given un Admin configura le regole field-level per il ruolo "Viewer"
When imposta il campo "contact.phone" come "masked" e "contact.privateNotes" come "hidden"
Then le regole vengono salvate nella tabella `field_security_rules`
  And le query API per utenti Viewer applicano automaticamente le trasformazioni
  And le regole sono valutate lato server (mai lato client)
  And le ricerche full-text NON includono il contenuto dei campi hidden

Given un utente con permessi insufficienti tenta di aggiornare un campo restricted
When invia PATCH /api/contacts/:id con `{ "privateNotes": "nuova nota" }`
Then la richiesta viene rifiutata con 403
  And il campo non viene modificato
  And il tentativo viene registrato nell'audit log
```

---

### US-022: Row-Level Security con PostgreSQL RLS

| Campo | Valore |
|---|---|
| **ID** | US-022 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-013, EP-01 (PostgreSQL) |
| **Assegnatario** | DBA / Backend Engineer |

**Come** Chiara (CTO),
**voglio** Row-Level Security PostgreSQL attiva su tutte le tabelle multi-tenant,
**in modo da** avere isolamento dei dati a livello database, rendendo impossibile l'accesso cross-tenant anche in caso di bug applicativi.

**Acceptance Criteria:**

```gherkin
Given le tabelle multi-tenant hanno la colonna `tenant_id` NOT NULL
When RLS è abilitato con `ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`
Then vengono create policy RLS per ogni tabella:
  - Policy SELECT: `WHERE tenant_id = current_setting('app.tenant_id')::uuid`
  - Policy INSERT: `WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)`
  - Policy UPDATE: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
  - Policy DELETE: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
  And il superuser è escluso dalle policy (FORCE ROW LEVEL SECURITY su ruoli applicativi)

Given un'applicazione si connette con ruolo `app_user`
When esegue SET app.tenant_id = '<tenant_uuid>' all'inizio di ogni transazione
Then tutte le query successive vedono solo i dati del tenant specificato
  And un tentativo di SELECT con tenant_id diverso restituisce 0 righe
  And un tentativo di INSERT con tenant_id diverso fallisce con policy violation

Given un nuovo microservizio viene deployato con una nuova tabella
When la migrazione Prisma crea la tabella con colonna `tenant_id`
Then la migrazione include automaticamente:
  - RLS enabled sulla tabella
  - Le 4 policy (SELECT, INSERT, UPDATE, DELETE)
  - Indice su `tenant_id`
  And un test automatico verifica che l'isolamento funziona per la nuova tabella
```

---

### US-023: Tenant provisioning automatico

| Campo | Valore |
|---|---|
| **ID** | US-023 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-022 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** un sistema di provisioning automatico che crei tutto il necessario per un nuovo tenant in meno di 30 secondi,
**in modo da** supportare onboarding self-service senza intervento manuale del team infrastruttura.

**Acceptance Criteria:**

```gherkin
Given un nuovo cliente completa la registrazione
When il sistema avvia il tenant provisioning
Then vengono eseguiti in sequenza (saga pattern):
  1. Creazione record tenant con UUID, piano, configurazione
  2. Creazione organizzazione di default e team "General"
  3. Creazione utente owner con ruolo SuperAdmin
  4. Setup Citus: distribuzione dati per il nuovo tenant_id
  5. Creazione indici Elasticsearch dedicati (prefisso tenant)
  6. Creazione namespace Redis per cache del tenant
  7. Invio email di benvenuto con link di attivazione
  And l'intero processo completa in meno di 30 secondi
  And ogni step ha compensazione in caso di fallimento (saga rollback)

Given il provisioning fallisce allo step 5 (Elasticsearch)
When il saga orchestrator rileva l'errore
Then vengono eseguiti i compensating actions in ordine inverso:
  - Rimozione namespace Redis (step 6 non eseguito, skip)
  - Cleanup dati Citus per il tenant
  - Eliminazione utente, team, organizzazione, tenant
  And l'admin riceve notifica del provisioning fallito con dettagli dell'errore
  And il cliente vede un messaggio "Setup in corso, riprova tra qualche minuto"

Given un tenant viene disattivato (deprovisioning)
When l'admin esegue il deprovisioning dal pannello di controllo
Then i dati vengono soft-deleted (flag `deactivated_at`, retention 90 giorni)
  And gli utenti del tenant non possono piu autenticarsi
  And le API restituiscono 403 per il tenant disattivato
  And dopo 90 giorni, un job schedulato esegue hard-delete irreversibile
  And l'intero ciclo è tracciato nell'audit log
```

---

### US-024: Workspace/Organization/Team hierarchy

| Campo | Valore |
|---|---|
| **ID** | US-024 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-019, US-022 |
| **Assegnatario** | Backend Engineer |

**Come** Marco (Sales Director),
**voglio** organizzare gli utenti in una gerarchia Workspace > Organization > Team,
**in modo da** riflettere la struttura aziendale reale e applicare permessi basati sul contesto organizzativo.

**Acceptance Criteria:**

```gherkin
Given il sistema supporta la gerarchia Workspace > Organization > Team
When un SuperAdmin crea la struttura:
  - Workspace: "Acme Corp" (livello tenant)
  - Organization: "Sales Division", "Support Division"
  - Team: "Enterprise Sales", "SMB Sales" (sotto Sales Division)
Then la struttura è rappresentata con relazioni parent-child nel database
  And ogni entita ha: id, name, parent_id, tenant_id, created_at, updated_at
  And un utente puo appartenere a piu team ma a una sola organizzazione

Given un utente è membro del team "Enterprise Sales"
When ha il permesso contacts:read:team
Then vede i contatti assegnati a tutti i membri di "Enterprise Sales"
  And NON vede i contatti del team "SMB Sales"
  And un utente con scope "organization" vede i contatti di tutti i team di "Sales Division"

Given un Manager del team viene rimosso
When l'admin rimuove l'utente dal team "Enterprise Sales"
Then i contatti assegnati all'utente rimosso vengono riassegnati al team lead
  And le attivita in corso vengono trasferite con notifica ai colleghi
  And l'utente perde immediatamente i permessi legati al team
```

---

### US-025: Audit log immutabile

| Campo | Valore |
|---|---|
| **ID** | US-025 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 8 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-014, US-022 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** un audit log immutabile che registri ogni azione critica (login, modifica dati, cambio permessi, accesso API),
**in modo da** garantire compliance normativa (GDPR, SOC 2) e supportare indagini di sicurezza.

**Acceptance Criteria:**

```gherkin
Given il sistema di audit log è attivo
When un utente esegue un'azione auditabile (login, CRUD su risorse, cambio permessi)
Then viene creato un record audit con:
  - ID univoco (UUID v7, ordinabile temporalmente)
  - Timestamp con precisione al microsecondo (UTC)
  - Actor: userId, tenantId, ruolo, IP address, User-Agent
  - Action: tipo di operazione (CREATE, READ, UPDATE, DELETE, LOGIN, PERMISSION_CHANGE)
  - Resource: tipo e ID della risorsa interessata
  - Changes: diff before/after per UPDATE (serializzato JSON)
  - Result: SUCCESS o FAILURE con codice errore
  And il record viene scritto in append-only (no UPDATE, no DELETE sulla tabella)

Given la tabella audit_logs è configurata
When qualsiasi utente o processo tenta UPDATE o DELETE
Then PostgreSQL rifiuta l'operazione tramite trigger BEFORE UPDATE/DELETE
  And il tentativo viene loggato come security incident
  And la tabella è partizionata per mese per performance

Given un compliance officer cerca eventi di audit
When esegue una query su GET /api/admin/audit-logs con filtri (data, utente, azione, risorsa)
Then i risultati sono paginati (max 100 per pagina) e ordinati per timestamp desc
  And la query è ottimizzata con indici su (tenant_id, timestamp), (tenant_id, actor_id), (tenant_id, resource_type)
  And i log sono esportabili in CSV con firma HMAC per integrita
```

---

### US-026: Consent management GDPR

| Campo | Valore |
|---|---|
| **ID** | US-026 |
| **Priorita** | 🟡 Media |
| **Story Points** | 5 |
| **Sprint** | Sprint 4 |
| **Dipendenze** | US-025 |
| **Assegnatario** | Backend Engineer |

**Come** Marco (Sales Director),
**voglio** registrare e gestire il consenso GDPR dei contatti per ogni tipo di comunicazione (email marketing, profilazione, terze parti),
**in modo da** rispettare la normativa europea sulla protezione dei dati e dimostrare la compliance in caso di audit.

**Acceptance Criteria:**

```gherkin
Given un contatto viene aggiunto al CRM
When l'operatore inserisce le informazioni di consenso
Then il sistema registra per ogni tipo di consenso:
  - Tipo: marketing_email, marketing_sms, profiling, third_party_sharing
  - Stato: granted, denied, withdrawn
  - Data e ora della raccolta del consenso
  - Metodo di raccolta (web form, email, verbal, paper)
  - Versione della privacy policy accettata
  - IP address e user-agent (se raccolta digitale)
  And ogni cambio di stato crea un nuovo record (storico immutabile, mai overwrite)

Given un contatto richiede il ritiro del consenso (diritto di revoca)
When l'operatore registra il ritiro del consenso marketing
Then il consenso passa a stato "withdrawn" con timestamp
  And il contatto viene automaticamente escluso dalle liste di email marketing
  And l'esclusione è effettiva entro 24 ore su tutti i canali
  And il ritiro viene registrato nell'audit log
  And il contatto resta nel CRM (solo il consenso viene revocato, non i dati)

Given un responsabile privacy richiede un report di consenso
When accede a GET /api/admin/gdpr/consent-report con filtri
Then il report mostra:
  - Numero di contatti per stato di consenso per ogni tipo
  - Trend temporale delle variazioni di consenso
  - Lista contatti senza consenso valido per tipo specifico
  And il report è esportabile in formato PDF e CSV
```

---

### US-027: Password policy NIST 800-63B

| Campo | Valore |
|---|---|
| **ID** | US-027 |
| **Priorita** | 🔴 Alta |
| **Story Points** | 3 |
| **Sprint** | Sprint 3 |
| **Dipendenze** | US-013 |
| **Assegnatario** | Backend Engineer |

**Come** Chiara (CTO),
**voglio** una password policy conforme alle linee guida NIST 800-63B,
**in modo da** garantire che le password degli utenti siano robuste senza imporre regole arbitrarie che peggiorano la user experience.

**Acceptance Criteria:**

```gherkin
Given un utente sta impostando o cambiando la password
When inserisce una password
Then il sistema valida:
  - Lunghezza minima: 12 caratteri (NIST raccomanda minimo 8, noi alziamo a 12)
  - Lunghezza massima: 128 caratteri (no limiti arbitrari bassi)
  - Nessuna regola di composizione obbligatoria (no "deve contenere maiuscola+numero+simbolo")
  - Verifica contro lista di password compromesse (Have I Been Pwned API, k-anonymity)
  - Verifica contro dizionario di password comuni (top 100k)
  - Verifica che non contenga email, nome o cognome dell'utente
  And il feedback è in tempo reale durante la digitazione (strength meter)

Given la password supera la validazione
When viene salvata nel database
Then viene hashata con Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
  And il salt è generato casualmente (16 byte) per ogni password
  And la password in chiaro non viene mai loggata o memorizzata

Given un utente cambia password
When la nuova password è identica a una delle ultime 5 password usate
Then il cambio viene rifiutato con messaggio "Password gia utilizzata di recente"
  And le ultime 5 password sono confrontate tramite hash (no plaintext storage)
  And NON c'è scadenza periodica obbligatoria della password (NIST la sconsiglia)
```

---

## Task Breakdown

### Registrazione e Verifica Email (US-013)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1001 | Creare schema Prisma per tabelle User, EmailVerificationToken | 2h | Backend | TODO |
| T-1002 | Implementare endpoint POST /auth/register con validazione input | 3h | Backend | TODO |
| T-1003 | Implementare servizio di invio email verifica con template HTML | 2h | Backend | TODO |
| T-1004 | Implementare endpoint GET /auth/verify-email/:token con token validation | 2h | Backend | TODO |
| T-1005 | Implementare protezione user enumeration (response generiche) | 1h | Backend | TODO |
| T-1006 | Creare componente React per form di registrazione con validazione client | 3h | Frontend | TODO |
| T-1007 | Scrivere test e2e per flusso completo registrazione + verifica | 2h | QA | TODO |

### JWT + Refresh Token Rotation (US-014)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1008 | Creare schema Prisma per RefreshToken con famiglia e hash | 2h | Backend | TODO |
| T-1009 | Implementare endpoint POST /auth/login con rate limiting | 3h | Backend | TODO |
| T-1010 | Implementare generazione JWT con claims (userId, tenantId, roles, permissions) | 3h | Backend | TODO |
| T-1011 | Implementare endpoint POST /auth/refresh con token rotation e reuse detection | 4h | Backend | TODO |
| T-1012 | Implementare account lockout dopo 5 tentativi falliti | 2h | Backend | TODO |
| T-1013 | Creare middleware NestJS AuthGuard per validazione JWT su ogni richiesta | 3h | Backend | TODO |
| T-1014 | Creare componente React per form di login | 2h | Frontend | TODO |
| T-1015 | Implementare interceptor Axios per refresh automatico su 401 | 2h | Frontend | TODO |

### MFA TOTP (US-015)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1016 | Aggiungere campi MFA a schema User (totpSecret encrypted, recoveryCodesHash) | 2h | Backend | TODO |
| T-1017 | Implementare endpoint POST /auth/mfa/totp/setup con generazione secret e QR | 3h | Backend | TODO |
| T-1018 | Implementare endpoint POST /auth/mfa/totp/verify per challenge MFA al login | 2h | Backend | TODO |
| T-1019 | Implementare recovery codes (generazione, hashing, verifica, invalidazione) | 2h | Backend | TODO |
| T-1020 | Creare UI per setup MFA con QR scanner e input codice | 3h | Frontend | TODO |

### MFA WebAuthn (US-016)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1021 | Creare schema Prisma per WebAuthnCredential (publicKey, counter, transports) | 2h | Backend | TODO |
| T-1022 | Implementare registration ceremony (challenge generation, attestation verification) | 4h | Backend | TODO |
| T-1023 | Implementare authentication ceremony (challenge, assertion verification) | 4h | Backend | TODO |
| T-1024 | Creare UI per registrazione e gestione passkeys | 3h | Frontend | TODO |
| T-1025 | Integrare WebAuthn come opzione nel flusso MFA esistente | 2h | Full-Stack | TODO |

### SSO SAML 2.0 (US-017)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1026 | Creare schema Prisma per SSOConfiguration (entityId, certificates, mappings) | 2h | Backend | TODO |
| T-1027 | Implementare endpoint per metadata SP XML generation | 2h | Backend | TODO |
| T-1028 | Implementare AuthnRequest signing e SAMLResponse validation | 4h | Backend | TODO |
| T-1029 | Implementare JIT user provisioning da attributi SAML | 3h | Backend | TODO |
| T-1030 | Creare UI admin per configurazione SSO SAML (upload metadata, mapping campi) | 3h | Frontend | TODO |
| T-1031 | Integrare pulsante SSO nella pagina di login con tenant routing | 2h | Frontend | TODO |

### SSO OIDC (US-018)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1032 | Estendere SSOConfiguration per supportare OIDC provider | 2h | Backend | TODO |
| T-1033 | Implementare Authorization Code + PKCE flow | 3h | Backend | TODO |
| T-1034 | Implementare id_token validation (JWT signature, claims) | 2h | Backend | TODO |
| T-1035 | Implementare domain-based provider routing | 2h | Backend | TODO |

### Engine RBAC (US-019)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1036 | Creare schema Prisma per Role, Permission, RoleHierarchy (DAG) | 3h | Backend | TODO |
| T-1037 | Implementare servizio di risoluzione permessi con ereditarieta gerarchica | 4h | Backend | TODO |
| T-1038 | Implementare caching permessi in Redis con invalidazione su role change | 2h | Backend | TODO |
| T-1039 | Creare NestJS decorator @RequirePermission('resource:action:scope') | 2h | Backend | TODO |
| T-1040 | Seed data: ruoli default (SuperAdmin, Admin, Manager, Member, Viewer) | 1h | Backend | TODO |
| T-1041 | Test: verifica gerarchia ereditarieta e prevenzione privilege escalation | 2h | QA | TODO |

### Permission Model R x A x S (US-020)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1042 | Definire enum per Resources, Actions, Scopes nel codebase | 2h | Backend | TODO |
| T-1043 | Implementare scope resolver (own -> team -> org -> all) con context utente | 4h | Backend | TODO |
| T-1044 | Integrare scope filtering nelle query Prisma (middleware o extension) | 3h | Backend | TODO |
| T-1045 | Creare UI admin per gestione permessi per ruolo (matrice R x A x S) | 4h | Frontend | TODO |
| T-1046 | Test: verifica corretta applicazione di ogni scope su ogni resource | 3h | QA | TODO |

### Field-Level Security (US-021)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1047 | Creare schema Prisma per FieldSecurityRule (resource, field, role, level) | 2h | Backend | TODO |
| T-1048 | Implementare middleware di trasformazione response (omit/mask fields) | 3h | Backend | TODO |
| T-1049 | Implementare guard su operazioni di scrittura per campi restricted | 2h | Backend | TODO |
| T-1050 | Creare UI admin per configurazione field-level security per ruolo | 3h | Frontend | TODO |

### Row-Level Security (US-022)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1051 | Creare migrazione SQL per abilitare RLS su tutte le tabelle multi-tenant | 3h | DBA | TODO |
| T-1052 | Implementare Prisma middleware per SET app.tenant_id su ogni transazione | 2h | Backend | TODO |
| T-1053 | Creare ruolo PostgreSQL `app_user` con permessi limitati (no superuser bypass) | 1h | DBA | TODO |
| T-1054 | Creare test automatico che verifica isolamento RLS per ogni tabella | 3h | QA | TODO |
| T-1055 | Creare template migrazione con RLS auto-incluso per nuove tabelle | 2h | DBA | TODO |

### Tenant Provisioning (US-023)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1056 | Creare schema Prisma per Tenant con piani e configurazione | 2h | Backend | TODO |
| T-1057 | Implementare saga orchestrator per provisioning (7 step + compensazione) | 6h | Backend | TODO |
| T-1058 | Implementare deprovisioning con soft-delete e hard-delete schedulato | 3h | Backend | TODO |
| T-1059 | Creare endpoint admin POST /api/admin/tenants per provisioning manuale | 2h | Backend | TODO |
| T-1060 | Test: provisioning completo + rollback su failure a ogni step | 3h | QA | TODO |

### Workspace/Organization/Team (US-024)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1061 | Creare schema Prisma per Workspace, Organization, Team con relazioni gerarchiche | 2h | Backend | TODO |
| T-1062 | Implementare CRUD API per gestione gerarchia organizzativa | 3h | Backend | TODO |
| T-1063 | Integrare team membership nel scope resolver dei permessi | 2h | Backend | TODO |
| T-1064 | Creare UI per gestione struttura organizzativa (tree view) | 3h | Frontend | TODO |

### Audit Log (US-025)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1065 | Creare schema per tabella audit_logs (append-only, partizionata per mese) | 2h | DBA | TODO |
| T-1066 | Creare trigger PostgreSQL per bloccare UPDATE/DELETE sulla tabella | 1h | DBA | TODO |
| T-1067 | Implementare NestJS interceptor per audit logging automatico su azioni CRUD | 3h | Backend | TODO |
| T-1068 | Implementare audit logging per eventi di sicurezza (login, MFA, permission change) | 2h | Backend | TODO |
| T-1069 | Creare endpoint GET /api/admin/audit-logs con filtri, paginazione, export CSV | 3h | Backend | TODO |
| T-1070 | Implementare firma HMAC su export CSV per verifica integrita | 2h | Backend | TODO |

### Consent Management GDPR (US-026)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1071 | Creare schema Prisma per ConsentRecord (append-only, storico completo) | 2h | Backend | TODO |
| T-1072 | Implementare API per registrazione e revoca consenso per contatto | 3h | Backend | TODO |
| T-1073 | Implementare esclusione automatica da liste marketing su revoca consenso | 2h | Backend | TODO |
| T-1074 | Creare endpoint per report GDPR con aggregazioni e export | 3h | Backend | TODO |
| T-1075 | Creare UI per gestione consenso nel profilo contatto | 2h | Frontend | TODO |

### Password Policy NIST 800-63B (US-027)

| Task ID | Descrizione | Ore | Ruolo | Stato |
|---|---|---|---|---|
| T-1076 | Implementare validazione password (lunghezza, HIBP check, dizionario, contesto utente) | 3h | Backend | TODO |
| T-1077 | Configurare Argon2id con parametri raccomandati per hashing | 1h | Backend | TODO |
| T-1078 | Implementare storico ultime 5 password con confronto hash | 2h | Backend | TODO |
| T-1079 | Creare componente React password strength meter con feedback real-time | 2h | Frontend | TODO |

---

## Technical Design Notes

### Decisioni architetturali chiave

1. **JWT + Refresh Token Rotation vs Session-based auth:** JWT scelto per la natura stateless che scala orizzontalmente senza session store condiviso. Il refresh token rotation con reuse detection mitiga il rischio di token theft. Il refresh token è opaco (non JWT) e salvato nel DB per permettere revoca esplicita.

2. **Argon2id vs bcrypt vs scrypt:** Argon2id scelto come vincitore della Password Hashing Competition. Offre resistenza sia a GPU attacks (memory-hard) che a side-channel attacks (data-independent). Parametri calibrati per ~500ms di hashing su hardware server.

3. **RLS PostgreSQL vs filtering applicativo:** RLS fornisce defense-in-depth a livello database. Anche se un bug applicativo bypassa i filtri, PostgreSQL impedisce l'accesso cross-tenant. Il costo è la complessita nelle migrazioni e il requirement di settare `app.tenant_id` per ogni connessione.

4. **Saga pattern per provisioning vs transazione distribuita:** Saga con compensating actions scelto perche il provisioning tocca sistemi eterogenei (PostgreSQL, Elasticsearch, Redis) che non supportano transazioni distribuite 2PC. Ogni step ha un compensating action definito per il rollback.

5. **Permission model R x A x S vs ABAC puro:** Il modello Resource x Action x Scope offre un buon equilibrio tra granularita e complessita. ABAC puro (attribute-based) sarebbe piu potente ma introduce complessita nella definizione e debug delle policy. Il modello scelto copre il 95% dei use case CRM.

6. **WebAuthn come opzione vs obbligo:** WebAuthn offerto come opzione MFA e come login passwordless, ma non obbligatorio. Non tutti i dispositivi/browser supportano WebAuthn uniformemente. Il TOTP resta il fallback universale.

7. **Audit log append-only vs event sourcing completo:** Append-only audit log con trigger PostgreSQL che bloccano UPDATE/DELETE. Non event sourcing completo (troppo overhead per un CRM). Partizionamento mensile per performance e retention management.

---

## Rischi

| # | Rischio | Probabilita | Impatto | Mitigazione |
|---|---|---|---|---|
| R1 | Token JWT rubato permette accesso fino alla scadenza (15 min) | Media | Alto | Access token con TTL breve (15 min). Fingerprint binding al client. Blacklist token su logout esplicito (Redis). Monitoring anomalie (login da IP/paese diverso). |
| R2 | RLS bypassed da query con ruolo superuser o da migrazioni | Bassa | Critico | Applicazione connessa con ruolo `app_user` (mai superuser). FORCE ROW LEVEL SECURITY attivo. Test automatici di isolamento in CI. Audit trimestrale delle policy RLS. |
| R3 | SAML XML signature wrapping attack | Media | Critico | Usare libreria SAML mantenuta e testata (passport-saml/samlify). Validazione rigorosa della firma XML. Test con SAML attack vectors noti (OWASP). Penetration test specifico per SSO. |
| R4 | Provisioning saga lascia tenant in stato inconsistente dopo failure | Media | Alto | Ogni step idempotente e con compensating action testato. Health check post-provisioning verifica tutti i componenti. Admin puo ri-triggerare provisioning. Alert su provisioning falliti. |
| R5 | Password breach check (HIBP) introduce dipendenza esterna nel flusso di registrazione | Alta | Medio | HIBP usa k-anonymity (non invia la password). Fallback: se HIBP non raggiungibile, accetta la password con warning. Cache locale delle query HIBP con TTL 24h. Circuit breaker sul client HIBP. |
| R6 | Complessita MFA riduce adoption e genera ticket di supporto | Alta | Medio | MFA non obbligatorio al primo login, raccomandato con prompt periodici. Recovery codes come safety net. Documentazione e UX chiara per setup. Supporto per reset MFA da admin. |
| R7 | Audit log table cresce indefinitamente e impatta performance | Media | Medio | Partizionamento mensile con pg_partman. ILM: archivio su S3 dopo 12 mesi, delete dopo 7 anni. Indici solo sui campi filtrabili. Monitoraggio dimensione tabella con alert. |

---

## Definition of Done

- [ ] Registrazione utente funzionante con email verification end-to-end
- [ ] Login con JWT + refresh token rotation testato con reuse detection
- [ ] MFA TOTP attivabile, verificabile al login, recovery codes funzionanti
- [ ] MFA WebAuthn registrazione e autenticazione funzionanti su Chrome, Safari, Firefox
- [ ] SSO SAML 2.0 testato con almeno un IdP (Okta o Azure AD)
- [ ] SSO OIDC testato con Google Workspace e Microsoft Entra
- [ ] Engine RBAC con gerarchia ruoli e ereditarieta permessi verificata
- [ ] Permission model R x A x S applicato su tutti gli endpoint API esistenti
- [ ] Field-level security funzionante con masking e hiding per ruolo
- [ ] RLS PostgreSQL attivo su TUTTE le tabelle multi-tenant con test di isolamento
- [ ] Tenant provisioning completa in < 30 secondi con rollback testato
- [ ] Gerarchia Workspace/Organization/Team funzionante con scope resolver
- [ ] Audit log immutabile con trigger anti-modifica e query API funzionante
- [ ] Consent management GDPR con registrazione, revoca e report
- [ ] Password policy NIST 800-63B implementata con HIBP check e Argon2id
- [ ] Tutti gli endpoint di autenticazione protetti da rate limiting
- [ ] Zero secrets hardcodati nel codice (tutti gestiti via Vault, EP-01)
- [ ] Coverage test > 85% su moduli auth, rbac, tenant
- [ ] Penetration test di base superato (OWASP Top 10) sui flussi di auth
- [ ] Documentazione API Swagger aggiornata per tutti gli endpoint auth/rbac
