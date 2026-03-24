# Epic EP-06R: Customer Service & Ticketing

| Campo        | Valore                                 |
|-------------|----------------------------------------|
| **Epic ID** | EP-06R                                  |
| **Fase**    | 3 (Sprint 15-18)                        |
| **SP Totali** | 70                                    |
| **Owner**   | Solo Dev                                |
| **Stato**   | 📋 Planned                              |

---

## Panoramica

Sistema di ticketing costruito sopra l'email engine esistente di PMSync. I ticket nascono da email (auto-parsing), con routing basato su regole, SLA management, dashboard agente. Knowledge base leggera con ricerca full-text PostgreSQL. Customer portal minimale self-service. Sondaggi CSAT post-risoluzione.

Non stiamo costruendo Zendesk. Stiamo costruendo un sistema di ticket che sfrutta al massimo ciò che PMSync già fa bene: gestire email, tracciare contatti, processare job asincroni.

---

## Infrastruttura PMSync Riutilizzabile

| Componente | Path | Cosa offre |
|---|---|---|
| Email module | `backend/src/modules/email/` | Email parsing, folder management, attachment handling |
| Email sync | Gmail/Outlook/IMAP drivers | Incoming email detection, thread tracking |
| Contact module | `backend/src/modules/contact/` | Customer identification, company lookup |
| BullMQ | `backend/src/modules/queue/` | Async job processing per SLA timers e escalation |
| Socket.IO | `backend/src/modules/socket/` | Real-time ticket updates push |
| MUI DataGrid | Frontend | Ticket list rendering con sort/filter/pagination |
| Audit log | `backend/src/modules/audit/` | Ticket action tracking per compliance |
| SendGrid HTTP API | `backend/src/modules/email/` | Invio email CSAT survey |

---

## Cosa Aggiungere

- **Ticket model** — linked a email thread, con status workflow
- **Email-to-ticket conversion** — service che converte email in arrivo su inbox dedicata in ticket
- **Routing rules engine** — assegnazione automatica basata su keyword, sender, priority
- **SLA definitions e timer** — response time e resolution time con escalation
- **Agent dashboard** — coda ticket con filtri e indicatori SLA
- **Knowledge base** — articoli con rich text, PostgreSQL full-text search
- **Customer portal** — pagina pubblica per submit ticket e tracking
- **CSAT survey** — sondaggio post-risoluzione via email

---

## User Stories

### US-R038: Creazione Ticket Automatica da Email 🔴 Alta

**SP:** 8 | **Sprint:** 15 | **Dipendenze:** Email module esistente, EP-01R (Contact)

**Come** utente CRM, **voglio** che le email in arrivo su un'inbox dedicata (es. support@) vengano automaticamente convertite in ticket, **così da** non dover creare ticket manualmente per ogni richiesta.

**Criteri di accettazione:**

```gherkin
Given una email in arrivo su un'inbox configurata come "support inbox"
When l'email sync la rileva
Then viene creato un Ticket con: subject come titolo, body come descrizione, sender come requester, priority "normal"

Given una email che è risposta a un thread con ticket esistente
When l'email sync la rileva
Then viene aggiunto un TicketComment al ticket esistente (non un nuovo ticket)

Given una email da un sender sconosciuto (non in contatti)
When il ticket viene creato
Then viene creato anche un contatto provvisorio con email e nome estratti dall'header

Given una email con allegati
When il ticket viene creato
Then gli allegati sono linkati al ticket tramite il sistema attachment esistente

Given che l'inbox non è configurata come "support inbox"
When arriva un'email
Then nessun ticket viene creato (comportamento email standard)
```

---

### US-R039: Ticket CRUD con Status Workflow 🔴 Alta

**SP:** 8 | **Sprint:** 15 | **Dipendenze:** US-R038

**Come** utente CRM, **voglio** gestire i ticket con un workflow di status chiaro (open → in_progress → waiting → resolved → closed), **così da** tracciare lo stato di ogni richiesta.

**Criteri di accettazione:**

```gherkin
Given che creo un ticket manualmente
When compilo titolo, descrizione, priority e opzionalmente assignee
Then il ticket viene creato con status "open" e timestamp di creazione

Given un ticket in status "open"
When un agente lo prende in carico
Then lo status passa a "in_progress" e l'agente diventa assignee

Given un ticket in status "in_progress"
When l'agente risponde e attende feedback dal cliente
Then lo status passa a "waiting" e il SLA timer si mette in pausa

Given un ticket in status "waiting"
When il cliente risponde (nuova email nel thread)
Then lo status torna a "in_progress" e il SLA timer riparte

Given un ticket in status "in_progress"
When l'agente segna come risolto
Then lo status passa a "resolved" e il CSAT survey viene schedulato

Given un ticket "resolved" senza risposta dal cliente per 72h
When il cron job verifica
Then lo status passa automaticamente a "closed"

Given un ticket "closed"
When il cliente risponde via email
Then il ticket viene riaperto con status "open"
```

**Transizioni valide:**
```
open → in_progress → waiting → in_progress (loop)
                   → resolved → closed
closed → open (reopen on customer reply)
```

---

### US-R040: Routing Ticket Basato su Regole 🟡 Media

**SP:** 5 | **Sprint:** 16 | **Dipendenze:** US-R039

**Come** amministratore, **voglio** configurare regole di routing automatico dei ticket (per keyword, dominio sender, priority), **così da** assegnare automaticamente i ticket all'agente o team giusto.

**Criteri di accettazione:**

```gherkin
Given una regola di routing: "Se subject contiene 'fattura' → assegna a agente X"
When arriva un ticket con subject "Problema con fattura #123"
Then il ticket viene automaticamente assegnato ad agente X

Given una regola: "Se sender domain è 'enterprise.com' → priority 'high'"
When arriva un ticket da user@enterprise.com
Then il ticket viene creato con priority "high"

Given più regole che matchano lo stesso ticket
When il routing engine processa
Then viene applicata la regola con priorità più alta (ordine definito dall'admin)

Given nessuna regola matcha il ticket
When il routing engine processa
Then il ticket resta unassigned con priority "normal"

Given che l'admin modifica una regola di routing
When salva le modifiche
Then le nuove regole si applicano solo ai ticket futuri (no retroattivo)
```

**Struttura regola (JSON in DB):**
```json
{
  "name": "Enterprise priority",
  "conditions": [
    { "field": "senderDomain", "operator": "equals", "value": "enterprise.com" }
  ],
  "actions": [
    { "type": "setPriority", "value": "high" },
    { "type": "assignTo", "value": "user-uuid" }
  ],
  "priority": 10,
  "enabled": true
}
```

---

### US-R041: SLA Management con Timer e Escalation 🔴 Alta

**SP:** 10 | **Sprint:** 16 | **Dipendenze:** US-R039, BullMQ

**Come** utente CRM, **voglio** che ogni ticket abbia SLA definiti (response time, resolution time) con timer e escalation automatica, **così da** garantire tempi di risposta ai clienti.

**Criteri di accettazione:**

```gherkin
Given una SLA policy definita: "Priority high → first response 2h, resolution 8h"
When un ticket high priority viene creato
Then i timer SLA partono: first response countdown 2h, resolution countdown 8h

Given un ticket con SLA first response di 2h
When un agente risponde entro 1h
Then il SLA first response è marcato "met" con tempo residuo registrato

Given un ticket con SLA first response di 2h
When nessuno risponde entro 1h 45min (75% del tempo)
Then viene inviata una notifica "SLA at risk" via Socket.IO all'agente assegnato

Given un ticket con SLA first response di 2h
When nessuno risponde entro 2h
Then il SLA è marcato "breached", viene inviata escalation al manager, il ticket appare in rosso nella dashboard

Given un ticket in status "waiting" (attesa risposta cliente)
When lo status passa a "waiting"
Then il SLA resolution timer si mette in pausa

Given un ticket che torna a "in_progress" dopo "waiting"
When lo status cambia
Then il SLA resolution timer riparte dal punto in cui era stato pausato
```

**SLA policies di default:**

| Priority | First Response | Resolution |
|---|---|---|
| Critical | 30 min | 4h |
| High | 2h | 8h |
| Normal | 8h | 24h |
| Low | 24h | 72h |

---

### US-R042: Dashboard Agente 🔴 Alta

**SP:** 8 | **Sprint:** 16-17 | **Dipendenze:** US-R039, US-R041

**Come** agente di supporto, **voglio** una dashboard con la mia coda ticket (assigned, unassigned, SLA at risk), **così da** gestire il mio carico di lavoro e rispettare gli SLA.

**Criteri di accettazione:**

```gherkin
Given che accedo alla agent dashboard
When i ticket sono presenti
Then vedo tre sezioni: "I miei ticket" (assigned a me), "Non assegnati" (unassigned), "SLA a rischio" (< 25% tempo residuo)

Given la sezione "I miei ticket"
When visualizzo la lista
Then ogni ticket mostra: titolo, requester, priority badge, status chip, SLA countdown timer, tempo trascorso

Given un ticket il cui SLA è at risk (< 25% tempo)
When la dashboard è aperta
Then il ticket appare con background ambra e icona warning nella sezione "SLA a rischio"

Given un ticket il cui SLA è breached
When la dashboard è aperta
Then il ticket appare con background rosso nella sezione "SLA a rischio" con label "BREACHED"

Given che clicco su un ticket nella dashboard
When il detail si apre
Then vedo: conversazione email thread, timeline azioni, SLA status, campo note interne

Given che un nuovo ticket arriva in real-time
When sono sulla dashboard
Then il ticket appare nella sezione corretta via Socket.IO update senza refresh
```

---

### US-R043: Knowledge Base — CRUD Articoli 🟡 Media

**SP:** 5 | **Sprint:** 17 | **Dipendenze:** Nessuna

**Come** agente di supporto, **voglio** creare e gestire articoli nella knowledge base, **così da** documentare soluzioni ricorrenti e ridurre i ticket ripetitivi.

**Criteri di accettazione:**

```gherkin
Given che creo un nuovo articolo KB
When compilo titolo, categoria, contenuto (rich text) e status (draft/published)
Then l'articolo viene salvato con slug auto-generato e timestamp

Given che modifico un articolo esistente
When salvo le modifiche
Then la versione precedente non viene sovrascritta (soft versioning tramite updatedAt)

Given che cerco un articolo dal pannello agente
When digito nel search box
Then i risultati appaiono filtrati per full-text search su titolo + contenuto

Given un articolo in status "draft"
When un utente del customer portal cerca
Then l'articolo non appare nei risultati (solo "published" visibili al pubblico)

Given che elimino un articolo
When confermo la cancellazione
Then l'articolo viene soft-deleted (non visibile ma recuperabile)
```

---

### US-R044: KB Search con PostgreSQL Full-Text Search 🟡 Media

**SP:** 5 | **Sprint:** 17 | **Dipendenze:** US-R043

**Come** utente (agente o cliente nel portal), **voglio** cercare articoli nella knowledge base con ricerca full-text, **così da** trovare rapidamente soluzioni ai problemi.

**Criteri di accettazione:**

```gherkin
Given che cerco "problema configurazione email"
When il search engine processa la query
Then i risultati sono ordinati per rilevanza (ts_rank) con snippet evidenziato

Given che cerco con un termine in italiano
When il search engine processa
Then la ricerca usa il dizionario italiano per stemming (configurazione → configur*)

Given che cerco un termine che non matcha nessun articolo
When nessun risultato viene trovato
Then vedo un empty state "Nessun articolo trovato" con suggerimento di riformulare

Given che un articolo viene aggiornato
When il contenuto cambia
Then il tsvector viene ricalcolato automaticamente (trigger PostgreSQL)

Given una ricerca con più termini
When cerco "reset password outlook"
Then gli articoli che contengono tutti i termini hanno rank più alto di quelli parziali
```

**Implementazione tecnica:**
```sql
-- Colonna tsvector sulla tabella KBArticle
ALTER TABLE "KBArticle" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('italian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('italian', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX idx_kb_search ON "KBArticle" USING GIN (search_vector);
```

---

### US-R045: Customer Portal — Submit e Track Ticket 🟡 Media

**SP:** 8 | **Sprint:** 17-18 | **Dipendenze:** US-R039, US-R044

**Come** cliente, **voglio** una pagina pubblica dove posso aprire un ticket e tracciare lo stato dei miei ticket, **così da** non dover inviare email e avere visibilità sullo stato delle mie richieste.

**Criteri di accettazione:**

```gherkin
Given che accedo al customer portal (/portal)
When la pagina carica
Then vedo: form di submit ticket, search bar per knowledge base, link "Traccia il tuo ticket"

Given che compilo il form di submit ticket (nome, email, subject, descrizione, allegati opzionali)
When invio il form
Then viene creato un ticket, ricevo un'email di conferma con ticket ID e tracking link

Given che clicco sul tracking link nell'email
When la pagina carica
Then vedo: status attuale del ticket, storico messaggi (solo quelli pubblici, no note interne), form per aggiungere risposta

Given che aggiungo una risposta dal portal
When invio il messaggio
Then viene creato un TicketComment, l'agente riceve notifica, se il ticket era "waiting" torna a "in_progress"

Given che non ho il tracking link
When inserisco email + ticket ID nella pagina "Traccia il tuo ticket"
Then ricevo un'email con il tracking link (no accesso diretto, per sicurezza)

Given che il ticket è "closed"
When accedo al tracking link
Then vedo lo status finale e il messaggio di risoluzione, senza possibilità di rispondere
```

**Autenticazione portal:**
- Nessun account richiesto
- Accesso via ticket token univoco (UUID) nell'URL
- Token generato alla creazione del ticket, incluso nell'email di conferma
- Rate limiting su submit form (max 5 ticket/ora per IP)

---

### US-R046: Survey CSAT Post-Risoluzione 🟢 Bassa

**SP:** 5 | **Sprint:** 18 | **Dipendenze:** US-R039, SendGrid

**Come** utente CRM, **voglio** che dopo la risoluzione di un ticket venga inviato automaticamente un sondaggio di soddisfazione (CSAT), **così da** misurare la qualità del supporto.

**Criteri di accettazione:**

```gherkin
Given un ticket che passa a status "resolved"
When il BullMQ job di CSAT si attiva (delay 1h dopo risoluzione)
Then viene inviata un'email al requester con link al survey CSAT

Given che il cliente clicca il link del survey
When la pagina carica
Then vede: rating 1-5 stelle, campo commento opzionale, pulsante "Invia"

Given che il cliente invia il survey
When il form viene processato
Then la risposta CSAT viene salvata e associata al ticket

Given che il ticket viene riaperto prima dell'invio del survey
When lo status torna a "open"
Then il job di invio CSAT viene cancellato

Given che il cliente non risponde al survey
When passano 7 giorni
Then nessun reminder viene inviato (una sola email, no spam)

Given che un survey è già stato compilato per un ticket
When il cliente clicca di nuovo il link
Then vede un messaggio "Hai già risposto a questo sondaggio. Grazie!"
```

---

### US-R047: Report SLA e Performance 🟢 Bassa

**SP:** 8 | **Sprint:** 18 | **Dipendenze:** US-R041, US-R046

**Come** manager, **voglio** un report che mostri le metriche di performance del supporto (SLA compliance, resolution time, CSAT score), **così da** identificare aree di miglioramento.

**Criteri di accettazione:**

```gherkin
Given che accedo al report SLA & Performance
When seleziono un periodo (ultima settimana, mese, quarter)
Then vedo le metriche aggregate: SLA compliance %, avg first response time, avg resolution time, avg CSAT score

Given che visualizzo il breakdown per agente
When i dati sono disponibili
Then vedo per ogni agente: ticket chiusi, SLA compliance %, avg resolution time, avg CSAT

Given che visualizzo il breakdown per priority
When i dati sono disponibili
Then vedo per ogni priority level: count ticket, SLA met vs breached, avg times

Given che il periodo selezionato non ha dati
When la query ritorna vuota
Then vedo un empty state "Nessun dato per il periodo selezionato"

Given che esporto il report
When clicco "Esporta CSV"
Then viene scaricato un file CSV con tutte le metriche del periodo selezionato
```

---

## Task Breakdown

### Modelli Prisma e Infrastruttura (Sprint 15)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-060 | Definire Prisma models: `Ticket`, `TicketComment`, `SLAPolicy`, `TicketSLA`, `RoutingRule`, `KBArticle`, `KBCategory`, `CSATSurvey`, `CSATResponse` | 3 | Infra | 🔴 |
| T-061 | Creare migration Prisma per tutte le tabelle ticketing | 1 | Infra | 🔴 |
| T-062 | Creare `backend/src/modules/ticket/` NestJS module con controller, service, DTOs | 2 | US-R039 | 🔴 |
| T-063 | Seed data: SLA policies di default (critical/high/normal/low) | 1 | US-R041 | 🔴 |

### Email-to-Ticket (Sprint 15)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-064 | Creare `EmailToTicketService` — intercetta email su inbox configurate e crea ticket | 3 | US-R038 | 🔴 |
| T-065 | Logica thread detection: se email reply a thread con ticket → aggiunge comment, altrimenti → nuovo ticket | 2 | US-R038 | 🔴 |
| T-066 | Configurazione inbox: flag `isSupportInbox` su `EmailAccount` o tabella `SupportInbox` | 1 | US-R038 | 🔴 |
| T-067 | Auto-creazione contatto provvisorio se sender sconosciuto | 1 | US-R038 | 🟡 |

### Ticket CRUD e Workflow (Sprint 15)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-068 | Implementare `TicketService` con CRUD + status transition validation | 3 | US-R039 | 🔴 |
| T-069 | Creare endpoints: `POST /tickets`, `GET /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id`, `DELETE /tickets/:id` | 2 | US-R039 | 🔴 |
| T-070 | Status transition state machine con validazione (no salti illegali) | 2 | US-R039 | 🔴 |
| T-071 | Auto-close cron job: ticket "resolved" da 72h → "closed" | 1 | US-R039 | 🟡 |
| T-072 | Auto-reopen: email reply su ticket "closed" → status "open" | 1 | US-R039 | 🟡 |

### Routing Rules (Sprint 16)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-073 | Creare `RoutingRuleService` — rule engine che valuta condizioni JSON | 2 | US-R040 | 🟡 |
| T-074 | Creare endpoints CRUD per routing rules: `GET/POST/PATCH/DELETE /tickets/routing-rules` | 1 | US-R040 | 🟡 |
| T-075 | Integrare routing nel flusso di creazione ticket (post-create hook) | 1 | US-R040 | 🟡 |
| T-076 | Frontend: pagina admin per gestione regole di routing (CRUD form + drag-and-drop priority) | 2 | US-R040 | 🟡 |

### SLA Management (Sprint 16)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-077 | Creare `SLAService` — calcolo deadline, tracking met/breached, pause/resume | 3 | US-R041 | 🔴 |
| T-078 | BullMQ delayed jobs per SLA warnings (75% tempo) e breach notifications | 2 | US-R041 | 🔴 |
| T-079 | Socket.IO events per SLA at risk e breach (push real-time) | 1 | US-R041 | 🔴 |
| T-080 | Creare endpoints: `GET /tickets/sla-policies`, `POST /tickets/sla-policies` | 1 | US-R041 | 🟡 |
| T-081 | SLA timer pause su status "waiting", resume su "in_progress" | 2 | US-R041 | 🔴 |

### Agent Dashboard (Sprint 16-17)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-082 | Frontend: `useTickets(filters)` query hook con polling o Socket.IO invalidation | 2 | US-R042 | 🔴 |
| T-083 | Frontend: `AgentDashboard` page con tre sezioni (my tickets, unassigned, SLA at risk) | 3 | US-R042 | 🔴 |
| T-084 | Frontend: `TicketDetailView` con email thread view, note interne, SLA status, actions | 3 | US-R042 | 🔴 |
| T-085 | Frontend: real-time ticket updates via Socket.IO (new ticket, status change, SLA alert) | 2 | US-R042 | 🟡 |
| T-086 | Frontend: ticket list con MUI DataGrid (sort, filter per status/priority/assignee) | 2 | US-R042 | 🔴 |

### Knowledge Base (Sprint 17)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-087 | Creare `KBService` con CRUD articoli + soft delete | 2 | US-R043 | 🟡 |
| T-088 | Creare endpoints: `GET/POST/PATCH/DELETE /kb/articles`, `GET /kb/categories` | 1 | US-R043 | 🟡 |
| T-089 | Aggiungere colonna `search_vector` tsvector + GIN index via raw SQL migration | 2 | US-R044 | 🟡 |
| T-090 | Implementare `KBSearchService` con `ts_rank` e snippet extraction | 2 | US-R044 | 🟡 |
| T-091 | Creare endpoint: `GET /kb/search?q=...` | 1 | US-R044 | 🟡 |
| T-092 | Frontend: `KBEditor` page con rich text editor (MUI + TipTap o similar) | 3 | US-R043 | 🟡 |
| T-093 | Frontend: `KBSearchResults` component con snippet highlight | 2 | US-R044 | 🟡 |

### Customer Portal (Sprint 17-18)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-094 | Creare route group `frontend/app/portal/` con layout minimale (no sidebar, no auth) | 1 | US-R045 | 🟡 |
| T-095 | Frontend: `PortalSubmitTicket` page con form (nome, email, subject, descrizione, allegati) | 3 | US-R045 | 🟡 |
| T-096 | Backend: endpoint pubblico `POST /portal/tickets` con rate limiting (5/h per IP) | 2 | US-R045 | 🟡 |
| T-097 | Generazione ticket token (UUID) e inclusione in email di conferma | 1 | US-R045 | 🟡 |
| T-098 | Frontend: `PortalTrackTicket` page con status timeline e form risposta | 3 | US-R045 | 🟡 |
| T-099 | Backend: endpoint pubblico `GET /portal/tickets/:token` e `POST /portal/tickets/:token/reply` | 2 | US-R045 | 🟡 |

### CSAT Survey (Sprint 18)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-100 | BullMQ delayed job: invio email CSAT 1h dopo risoluzione ticket | 1 | US-R046 | 🟢 |
| T-101 | Email template CSAT con link univoco al survey | 1 | US-R046 | 🟢 |
| T-102 | Frontend: `SurveyPage` (/portal/survey/:token) con rating 1-5 + commento | 2 | US-R046 | 🟢 |
| T-103 | Backend: endpoint `POST /portal/survey/:token` per salvare risposta | 1 | US-R046 | 🟢 |
| T-104 | Cancellazione job CSAT se ticket riaperto prima dell'invio | 1 | US-R046 | 🟢 |

### Report SLA & Performance (Sprint 18)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-105 | Creare `TicketReportService` con query aggregate (SLA compliance, avg times, CSAT avg) | 3 | US-R047 | 🟢 |
| T-106 | Creare endpoint: `GET /tickets/reports?period=...&groupBy=agent|priority` | 1 | US-R047 | 🟢 |
| T-107 | Frontend: `SLAReportDashboard` page con metriche aggregate e breakdown tables | 3 | US-R047 | 🟢 |
| T-108 | Export CSV delle metriche | 1 | US-R047 | 🟢 |

---

## Note di Design Tecnico

### Schema Prisma (nuovi modelli)

```prisma
model Ticket {
  id            String   @id @default(uuid())
  tenantId      String
  number        Int      // auto-increment per tenant (display: TK-0001)
  title         String
  description   String
  status        String   @default("open") // open | in_progress | waiting | resolved | closed
  priority      String   @default("normal") // critical | high | normal | low
  requesterId   String   // Contact ID
  assigneeId    String?  // User ID (agente)
  emailThreadId String?  // Link al thread email originale
  portalToken   String   @unique @default(uuid()) // accesso portal senza auth
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  resolvedAt    DateTime?
  closedAt      DateTime?

  tenant    Tenant     @relation(fields: [tenantId], references: [id])
  requester Contact    @relation(fields: [requesterId], references: [id])
  assignee  User?      @relation(fields: [assigneeId], references: [id])
  comments  TicketComment[]
  sla       TicketSLA?
  csat      CSATSurvey?

  @@index([tenantId, status])
  @@index([tenantId, assigneeId])
  @@index([tenantId, priority])
  @@unique([tenantId, number])
}

model TicketComment {
  id        String   @id @default(uuid())
  tenantId  String
  ticketId  String
  authorId  String?  // null se dal portal (cliente)
  body      String
  isInternal Boolean @default(false) // note interne non visibili al cliente
  source    String   @default("agent") // agent | customer_email | customer_portal
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  ticket Ticket @relation(fields: [ticketId], references: [id])

  @@index([ticketId, createdAt])
}

model SLAPolicy {
  id                String @id @default(uuid())
  tenantId          String
  name              String
  priority          String // critical | high | normal | low
  firstResponseMin  Int    // minuti
  resolutionMin     Int    // minuti
  isDefault         Boolean @default(false)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, priority])
}

model TicketSLA {
  id                    String    @id @default(uuid())
  tenantId              String
  ticketId              String    @unique
  policyId              String
  firstResponseDue      DateTime
  resolutionDue         DateTime
  firstResponseMet      Boolean?  // null = pending, true = met, false = breached
  resolutionMet         Boolean?
  firstResponseAt       DateTime?
  resolvedAt            DateTime?
  pausedDurationMin     Int       @default(0) // tempo totale in pausa (status "waiting")
  lastPausedAt          DateTime?

  tenant  Tenant    @relation(fields: [tenantId], references: [id])
  ticket  Ticket    @relation(fields: [ticketId], references: [id])
  policy  SLAPolicy @relation(fields: [policyId], references: [id])
}

model RoutingRule {
  id         String  @id @default(uuid())
  tenantId   String
  name       String
  conditions Json    // [{ field, operator, value }]
  actions    Json    // [{ type, value }]
  priority   Int     @default(0) // ordine di valutazione
  enabled    Boolean @default(true)
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, enabled])
}

model KBCategory {
  id       String @id @default(uuid())
  tenantId String
  name     String
  slug     String
  parentId String?

  tenant   Tenant      @relation(fields: [tenantId], references: [id])
  parent   KBCategory? @relation("KBCategoryTree", fields: [parentId], references: [id])
  children KBCategory[] @relation("KBCategoryTree")
  articles KBArticle[]

  @@unique([tenantId, slug])
}

model KBArticle {
  id          String   @id @default(uuid())
  tenantId    String
  categoryId  String?
  title       String
  slug        String
  content     String   // rich text (HTML)
  status      String   @default("draft") // draft | published
  authorId    String
  deletedAt   DateTime? // soft delete
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  // search_vector tsvector generato via raw SQL migration

  tenant   Tenant      @relation(fields: [tenantId], references: [id])
  category KBCategory? @relation(fields: [categoryId], references: [id])

  @@unique([tenantId, slug])
  @@index([tenantId, status])
}

model CSATSurvey {
  id        String   @id @default(uuid())
  tenantId  String
  ticketId  String   @unique
  token     String   @unique @default(uuid())
  sentAt    DateTime?

  tenant   Tenant        @relation(fields: [tenantId], references: [id])
  ticket   Ticket        @relation(fields: [ticketId], references: [id])
  response CSATResponse?
}

model CSATResponse {
  id        String   @id @default(uuid())
  surveyId  String   @unique
  rating    Int      // 1-5
  comment   String?
  createdAt DateTime @default(now())

  survey CSATSurvey @relation(fields: [surveyId], references: [id])
}
```

### Architecture Decisions

**Ticket ↔ Email thread linkage:**
- `Ticket.emailThreadId` punta al thread email originale
- La conversazione del ticket riusa la vista thread email per i messaggi via email
- I `TicketComment` con `source: "agent"` sono messaggi dall'agente (non necessariamente email)
- Quando l'agente risponde da ticket, l'email viene inviata al requester E il comment viene salvato

**Customer portal auth:**
- Zero account. Accesso via `portalToken` nell'URL
- Token UUID v4 generato alla creazione del ticket
- Rate limiting su endpoint pubblici: 5 submit/h per IP, 30 view/h per IP
- No session, no cookie — stateless

**SLA timer con BullMQ:**
```typescript
// Alla creazione ticket
await this.slaQueue.add('sla-warning', { ticketId, type: 'firstResponse' }, {
  delay: firstResponseMin * 0.75 * 60 * 1000, // 75% del tempo
  jobId: `sla-warn-${ticketId}-firstResponse`,
});
await this.slaQueue.add('sla-breach', { ticketId, type: 'firstResponse' }, {
  delay: firstResponseMin * 60 * 1000,
  jobId: `sla-breach-${ticketId}-firstResponse`,
});

// Su status "waiting" → cancella job attivi, salva tempo residuo
// Su status "in_progress" (da waiting) → ri-crea job con tempo residuo
```

**Knowledge base search — PostgreSQL tsvector:**
- Nessun Elasticsearch. Per un MVP il full-text search nativo è più che sufficiente
- Dizionario italiano per stemming
- Peso: titolo (A) > contenuto (B)
- GIN index per performance su volumi medio-piccoli

**Ticket number auto-increment per tenant:**
- Usare `SELECT COALESCE(MAX(number), 0) + 1 FROM "Ticket" WHERE "tenantId" = $1` con lock
- Oppure PostgreSQL sequence per tenant (più robusto sotto concorrenza)
- Display format: `TK-0001`

---

## Rischi

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|---|
| R1 | **SLA timer drift** — BullMQ delayed jobs possono avere ritardi sotto carico o dopo restart Redis | Media | Alto | Cron job di recovery ogni 5 minuti che verifica SLA scaduti non processati. Idempotent breach handler |
| R2 | **Email thread matching inaccurato** — risposte email non vengono associate al ticket corretto | Media | Alto | Usare `In-Reply-To` e `References` header per matching. Fallback su subject line parsing. Log unmatched per review manuale |
| R3 | **Customer portal abuse** — form pubblico esposto a spam e bot | Alta | Medio | Rate limiting IP-based (5/h). Honeypot field nel form. Opzionale: CAPTCHA se spam elevato |
| R4 | **SLA pause/resume complessità** — edge case quando ticket cambia status rapidamente | Media | Medio | State machine rigorosa con validazione transizioni. Unit test su tutti i path. `pausedDurationMin` come contatore cumulativo |
| R5 | **Knowledge base content quality** — senza processo editoriale gli articoli saranno di scarsa qualità | Alta | Basso | Draft/published workflow. Per MVP basta. Review process è un miglioramento futuro |
| R6 | **Portal token security** — UUID prevedibile o link condiviso impropriamente | Bassa | Medio | UUID v4 (122 bit di entropia). Token monouso per survey. Accesso in sola lettura dal portal (no dati sensibili esposti) |

---

## Definition of Done

- [ ] Email in arrivo su support inbox creano automaticamente ticket
- [ ] Reply a thread esistente aggiungono comment al ticket (non nuovo ticket)
- [ ] Status workflow completo con transizioni validate (no salti illegali)
- [ ] Auto-close ticket "resolved" dopo 72h senza risposta
- [ ] Auto-reopen ticket "closed" su email reply
- [ ] Routing rules engine funzionante con regole JSON configurabili
- [ ] SLA timer con pause/resume su status "waiting"
- [ ] SLA warning a 75% del tempo e breach notification funzionanti
- [ ] Agent dashboard con tre sezioni e real-time updates via Socket.IO
- [ ] Ticket detail con conversazione email thread + note interne
- [ ] KB CRUD con rich text editor e status draft/published
- [ ] KB full-text search con PostgreSQL tsvector + GIN index
- [ ] Customer portal accessibile senza autenticazione (via ticket token)
- [ ] Portal: submit ticket + track status + reply funzionanti
- [ ] Rate limiting su endpoint pubblici del portal
- [ ] CSAT survey inviato 1h dopo risoluzione ticket
- [ ] CSAT survey cancellato se ticket riaperto
- [ ] Report SLA con metriche aggregate e breakdown per agente/priority
- [ ] Export CSV dei report
- [ ] Tutti gli endpoint rispettano multi-tenant (`tenantId` obbligatorio)
- [ ] Frontend type-check passa (`npx tsc --noEmit`)
- [ ] Backend type-check passa (`npx tsc --noEmit`)
