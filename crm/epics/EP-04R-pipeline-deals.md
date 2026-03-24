# Epic EP-04R: Pipeline & Deal Management

## Metadata

| Campo          | Valore                                    |
| -------------- | ----------------------------------------- |
| **Epic ID**    | EP-04R                                    |
| **Fase**       | 1 — Sprint 3-8                            |
| **SP Totali**  | ~105                                      |
| **Owner**      | Solo dev                                  |
| **Dipendenze** | EP-03R (Account model, Contact-Account)   |
| **Stato**      | Draft                                     |

---

## Overview

Modulo pipeline commerciale completo per il CRM PMSync. Include pipeline visuali con Kanban drag-and-drop, gestione deal con associazione a contatti/account, supporto multi-pipeline, weighted pipeline con probabilità per stage, automazioni base su cambio stage, deal scoring rule-based, gestione prodotti e listini, preventivi base con generazione PDF, e dashboard pipeline con metriche chiave.

---

## Cosa esiste già in PMSync (riutilizzabile)

| Componente                  | Path                                              | Riutilizzo                        |
| --------------------------- | ------------------------------------------------- | --------------------------------- |
| Tenant/auth guards          | `backend/src/common/guards/`                      | Ogni query con tenantId           |
| MUI component library       | `frontend/src/components/`                         | DataGrid, Cards, Dialogs, Tabs    |
| TanStack Query patterns     | `frontend/hooks/queries/`                          | queryOptions factory pattern      |
| BullMQ setup                | `backend/src/modules/queues/`                     | Job queue per automazioni stage   |
| Socket.IO                   | `backend/src/modules/gateway/`                    | Real-time deal stage changes      |
| AI tool registry            | `backend/src/modules/ai/tools/`                   | Registrazione tool deal per AI    |
| Account model (EP-03R)      | `backend/src/modules/crm/accounts/`               | FK deal → account                 |
| Contact model               | `backend/src/modules/contacts/`                   | FK deal → contact                 |
| Traduzioni i18n             | `frontend/locales/`                                | Pattern IT/EN già in uso          |

## Cosa viene costruito (scope di questo epic)

- Pipeline model con configurazione stage
- Stage model con probabilità e ordinamento
- Deal model con lifecycle completo
- Kanban board con drag-and-drop
- Multi-pipeline support
- Weighted pipeline calculation
- Automazioni base su stage change
- Deal scoring rule-based
- Prodotti e listini prezzi
- Associazione prodotti-deal
- Preventivi/quote base (PDF)
- Dashboard pipeline con metriche
- Filtri avanzati e viste salvate
- Attività e note collegate ai deal

---

## User Stories

### US-R011: CRUD Pipeline con nome e configurazione

**Priorità:** 🔴 Alta | **SP:** 5 | **Sprint:** 3 | **Dipendenze:** Nessuna

**Come** utente CRM, **voglio** creare e configurare pipeline di vendita con nome e impostazioni base, **in modo da** organizzare i processi commerciali per tipo (vendita, partnership, rinnovi).

**Acceptance Criteria:**

```gherkin
Given l'utente accede alla sezione pipeline del CRM
When crea una nuova pipeline specificando: nome, descrizione, valuta default, isDefault (bool)
Then la pipeline viene salvata con tenantId
  And solo una pipeline per tenant può essere isDefault
  And la pipeline appare nella lista pipeline

Given una pipeline esistente senza deal attivi
When l'utente la elimina
Then la pipeline e tutti i suoi stage vengono soft-deleted
  And i deal conclusi (won/lost) rimangono accessibili in sola lettura

Given una pipeline con deal attivi
When l'utente tenta di eliminarla
Then il sistema blocca l'operazione con errore "Pipeline contiene N deal attivi"
```

---

### US-R012: CRUD Stage con posizione, probabilità, colore

**Priorità:** 🔴 Alta | **SP:** 5 | **Sprint:** 3 | **Dipendenze:** US-R011

**Come** utente CRM, **voglio** configurare gli stage di ogni pipeline con ordine, probabilità di chiusura e colore, **in modo da** modellare il funnel commerciale specifico del mio business.

**Acceptance Criteria:**

```gherkin
Given una pipeline esistente
When l'utente aggiunge uno stage con: nome, posizione (ordine), probabilità (0-100%), colore (hex), tipo (open/won/lost)
Then lo stage appare nel Kanban nella posizione corretta
  And ogni pipeline deve avere almeno uno stage di tipo "won" e uno "lost"

Given gli stage di una pipeline
When l'utente li riordina con drag-and-drop nella pagina di configurazione
Then le posizioni vengono aggiornate atomicamente (transazione Prisma)
  And la probabilità rimane invariata (non è legata alla posizione)

Given uno stage con deal associati
When l'utente lo elimina
Then il sistema chiede di spostare i deal a un altro stage prima di procedere
  And lo stage non può essere eliminato senza riassegnazione
```

---

### US-R013: CRUD Deal con associazione a pipeline, stage, contatto, account

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 3 | **Dipendenze:** US-R011, US-R012, EP-03R

**Come** utente CRM, **voglio** creare deal associandoli a una pipeline, uno stage, un contatto e un account, **in modo da** tracciare ogni opportunità commerciale nel suo contesto.

**Acceptance Criteria:**

```gherkin
Given l'utente crea un nuovo deal
When compila: titolo, valore (amount), valuta, pipeline, stage iniziale, contatto (opzionale), account (opzionale), data chiusura prevista (expectedCloseDate), proprietario (owner)
Then il deal viene salvato con tenantId
  And il deal appare nel Kanban dello stage selezionato
  And viene registrato un evento nella timeline del deal

Given un deal esistente
When l'utente modifica il valore o la data di chiusura
Then le modifiche vengono salvate
  And un evento "deal updated" viene aggiunto alla timeline

Given un deal
When l'utente lo sposta a uno stage di tipo "won"
Then il deal viene marcato come closedAt = now()
  And il weighted value diventa 100% del valore
  And viene triggerata l'eventuale automazione di stage

Given un deal
When l'utente lo sposta a uno stage di tipo "lost"
Then il deal viene marcato come closedAt = now() con lostReason obbligatorio
  And il weighted value diventa 0
```

---

### US-R014: Vista Kanban pipeline con drag-and-drop tra stage

**Priorità:** 🔴 Alta | **SP:** 10 | **Sprint:** 4 | **Dipendenze:** US-R013

**Come** utente CRM, **voglio** visualizzare i deal in una board Kanban con colonne per ogni stage e spostare i deal trascinandoli, **in modo da** avere una vista immediata del funnel e aggiornare lo stato con un gesto.

**Acceptance Criteria:**

```gherkin
Given l'utente seleziona una pipeline
When la vista Kanban si carica
Then ogni stage è una colonna con header: nome stage, conteggio deal, valore totale
  And i deal sono card con: titolo, valore, contatto, account, data chiusura prevista
  And le colonne sono ordinate per posizione dello stage

Given l'utente trascina un deal card da uno stage a un altro
When rilascia la card sulla colonna di destinazione
Then il deal viene aggiornato con il nuovo stageId via API PATCH
  And la probabilità del deal si aggiorna alla probabilità del nuovo stage
  And un evento "stage changed" viene registrato nella timeline
  And una notifica Socket.IO aggiorna gli altri utenti connessi in real-time

Given la board Kanban con molti deal per stage
When uno stage ha più di 10 deal
Then le card sono scrollabili verticalmente nella colonna
  And un indicatore mostra "+N altri" se i deal non sono tutti visibili

Given l'utente è su mobile o viewport < 1024px
When visualizza la pipeline
Then la vista Kanban si trasforma in una lista raggruppata per stage (no drag-and-drop)
  And il cambio stage avviene tramite select nel detail del deal
```

---

### US-R015: Deal detail view con timeline attività

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 4 | **Dipendenze:** US-R013

**Come** utente CRM, **voglio** una vista dettaglio deal con tutte le informazioni, contatto/account associati e timeline completa, **in modo da** avere il contesto completo di ogni opportunità.

**Acceptance Criteria:**

```gherkin
Given l'utente clicca su un deal card nel Kanban o nella lista
When si apre la pagina detail
Then vede le sezioni:
  - Header: titolo, valore, stage attuale (badge colorato), probabilità
  - Info: pipeline, contatto, account, owner, data creazione, data chiusura prevista
  - Progress bar: posizione nello stage rispetto al funnel totale
  - Tab "Timeline": eventi ordinati cronologicamente (stage changes, note, email, attività)
  - Tab "Prodotti": prodotti associati al deal con quantità e subtotale
  - Tab "Note": note testuali con timestamp e autore
  - Sidebar: campi quick-edit (stage select, valore, data chiusura)

Given la timeline del deal
When un evento viene aggiunto (nota, cambio stage, email collegata)
Then appare in cima alla timeline con icona, timestamp e dettaglio

Given il detail view
When l'utente modifica lo stage dalla sidebar
Then il Kanban si aggiorna in background (invalidazione TanStack Query)
  And la timeline registra il cambio
```

---

### US-R016: Multi-pipeline

**Priorità:** 🟡 Media | **SP:** 3 | **Sprint:** 4 | **Dipendenze:** US-R011, US-R014

**Come** utente CRM, **voglio** gestire più pipeline contemporaneamente (es. "Sales", "Partnership", "Renewal"), **in modo da** separare processi commerciali con stage e probabilità diverse.

**Acceptance Criteria:**

```gherkin
Given il tenant ha più pipeline configurate
When l'utente accede alla sezione pipeline
Then vede un selettore pipeline (tabs o dropdown) per passare da una all'altra
  And la pipeline di default è preselezionata

Given l'utente crea un nuovo deal
When seleziona la pipeline
Then gli stage disponibili si aggiornano in base alla pipeline scelta
  And il deal viene associato alla pipeline selezionata

Given la dashboard pipeline
When l'utente seleziona "Tutte le pipeline"
Then le metriche aggregate includono tutte le pipeline
  And un breakdown per pipeline è visibile sotto le metriche aggregate
```

---

### US-R017: Weighted pipeline (valore deal x probabilità stage)

**Priorità:** 🟡 Media | **SP:** 5 | **Sprint:** 5 | **Dipendenze:** US-R012, US-R013

**Come** utente CRM, **voglio** vedere il valore pesato della pipeline (valore deal moltiplicato per la probabilità dello stage), **in modo da** avere una previsione realistica del revenue atteso.

**Acceptance Criteria:**

```gherkin
Given un deal con valore 100.000€ nello stage "Proposal" con probabilità 60%
When l'utente visualizza il Kanban o la dashboard
Then il weighted value mostrato è 60.000€
  And il valore non pesato (100.000€) è visibile accanto come riferimento

Given l'utente sposta un deal da uno stage con probabilità 30% a uno con 70%
When il drag-and-drop è completato
Then il weighted value si aggiorna immediatamente nella UI
  And il totale della colonna stage si aggiorna

Given la dashboard pipeline
When mostra il "Pipeline Value"
Then distingue tra: Total Value (somma valori nominali), Weighted Value (somma valori pesati), Closed Won (100%)
  And i valori sono formattati con valuta del tenant
```

---

### US-R018: Automazioni base su cambio stage

**Priorità:** 🟡 Media | **SP:** 8 | **Sprint:** 5 | **Dipendenze:** US-R013

**Come** utente CRM, **voglio** configurare automazioni che si attivano quando un deal cambia stage (invio email, creazione task, notifica), **in modo da** standardizzare i processi e non dimenticare follow-up.

**Acceptance Criteria:**

```gherkin
Given l'admin accede alla configurazione pipeline
When seleziona uno stage e clicca "Aggiungi automazione"
Then può configurare: trigger (entrata nello stage), azione (send_email, create_task, notify), parametri
  And le azioni disponibili sono:
    - send_email: template email, destinatario (owner, contatto deal, email specifica)
    - create_task: titolo, descrizione, assegnatario, scadenza relativa (+N giorni)
    - notify: messaggio, destinatario (owner, tutti gli admin)

Given un deal che viene spostato in uno stage con automazione configurata
When il cambio stage è confermato
Then il job di automazione viene accodato in BullMQ
  And l'automazione viene eseguita in background
  And un log dell'automazione è visibile nella timeline del deal

Given un'automazione che fallisce (es. email non inviata)
When il job fallisce
Then viene registrato un errore nel log
  And il deal rimane nello stage di destinazione (l'automazione non blocca il flusso)
  And l'owner del deal riceve una notifica dell'errore

Given la configurazione automazioni
When l'utente attiva/disattiva un'automazione
Then il toggle è immediato e non richiede salvataggio esplicito
  And le automazioni disattivate sono visibili ma grigie
```

---

### US-R019: Deal scoring rule-based

**Priorità:** 🟢 Bassa | **SP:** 5 | **Sprint:** 6 | **Dipendenze:** US-R013

**Come** utente CRM, **voglio** un sistema di scoring rule-based per i deal che assegna un punteggio in base a regole configurabili, **in modo da** prioritizzare i deal con maggiore probabilità di successo.

**Acceptance Criteria:**

```gherkin
Given l'admin accede alla configurazione deal scoring
When crea regole di scoring:
  - amount >= 50000 → +20 punti
  - stage = "Proposal" → +15 punti
  - hasAccount = true → +10 punti
  - daysSinceLastActivity <= 7 → +10 punti
  - contactRole = "DECISION_MAKER" → +15 punti
Then ogni regola ha: condizione (campo, operatore, valore), punti (positivi o negativi), peso

Given un deal
When le sue proprietà cambiano (stage, valore, attività)
Then il punteggio viene ricalcolato come somma dei punti delle regole soddisfatte
  And il punteggio è visibile nel deal card (Kanban) e nel detail view
  And il punteggio è aggiornato lazy (non real-time, al prossimo load)

Given la lista deal
When l'utente ordina per score
Then i deal con punteggio più alto appaiono in cima
  And un indicatore visivo (colore/icona) distingue High (>70), Medium (40-70), Low (<40)
```

---

### US-R020: Gestione prodotti e listini prezzi

**Priorità:** 🟡 Media | **SP:** 8 | **Sprint:** 6 | **Dipendenze:** Nessuna

**Come** utente CRM, **voglio** gestire un catalogo prodotti con listini prezzi, **in modo da** associarli ai deal e generare preventivi accurati.

**Acceptance Criteria:**

```gherkin
Given l'utente accede alla sezione prodotti del CRM
When crea un nuovo prodotto specificando: nome, codice (SKU), descrizione, unità, categoria
Then il prodotto viene salvato con tenantId
  And il prodotto appare nel catalogo

Given un prodotto esistente
When l'utente accede al tab "Listini" del prodotto
Then può creare/modificare price list entries: listino (nome), prezzo unitario, valuta, data inizio validità, data fine validità
  And un prodotto può avere prezzi diversi per listino diverso

Given un listino prezzi
When l'utente lo configura come "default"
Then il prezzo di quel listino è usato automaticamente quando il prodotto viene aggiunto a un deal
  And l'utente può sovrascrivere il prezzo nel deal

Given la lista prodotti
When l'utente cerca o filtra per nome, SKU, categoria
Then i risultati si aggiornano con debounce 300ms
  And la paginazione server-side è attiva
```

---

### US-R021: Associazione prodotti a deal con quantità e sconto

**Priorità:** 🟡 Media | **SP:** 5 | **Sprint:** 6 | **Dipendenze:** US-R013, US-R020

**Come** utente CRM, **voglio** aggiungere prodotti a un deal specificando quantità, prezzo e sconto, **in modo da** dettagliare la composizione economica dell'opportunità.

**Acceptance Criteria:**

```gherkin
Given il detail view di un deal, tab "Prodotti"
When l'utente clicca "Aggiungi prodotto"
Then si apre un dialog con ricerca prodotto dal catalogo
  And selezionando un prodotto, il prezzo del listino default viene pre-compilato

Given un prodotto aggiunto al deal
When l'utente specifica: quantità, prezzo unitario (sovrascrivibile), sconto percentuale
Then il subtotale riga viene calcolato: quantità × prezzo × (1 - sconto/100)
  And il totale deal si aggiorna automaticamente come somma dei subtotali

Given il deal ha prodotti associati
When l'utente modifica il valore (amount) del deal manualmente
Then il sistema avvisa che il valore manuale sovrascrive il totale calcolato dai prodotti
  And l'utente può scegliere: "Usa totale prodotti" o "Mantieni valore manuale"

Given l'utente rimuove un prodotto dal deal
When conferma la rimozione
Then il prodotto viene rimosso dalla lista e il totale deal ricalcolato
```

---

### US-R022: Preventivo/quota base (generazione PDF)

**Priorità:** 🟢 Bassa | **SP:** 8 | **Sprint:** 8 | **Dipendenze:** US-R021

**Come** utente CRM, **voglio** generare un preventivo PDF dal deal con i prodotti associati, **in modo da** inviare un documento professionale al cliente.

**Acceptance Criteria:**

```gherkin
Given un deal con almeno un prodotto associato
When l'utente clicca "Genera preventivo"
Then il sistema genera un PDF con:
  - Header: logo tenant (se configurato), dati azienda
  - Destinatario: nome contatto, nome account, indirizzo
  - Tabella prodotti: nome, quantità, prezzo unitario, sconto, subtotale
  - Totale: subtotale, IVA (configurabile), totale finale
  - Condizioni: testo libero configurabile, validità preventivo
  - Footer: data, numero preventivo progressivo

Given il PDF generato
When l'utente lo visualizza in anteprima
Then può scaricarlo o inviarlo via email al contatto del deal
  And il preventivo viene salvato come allegato nella timeline del deal

Given la generazione del preventivo
When il deal non ha prodotti associati
Then il pulsante "Genera preventivo" è disabilitato con tooltip esplicativo

Given il template del preventivo
When l'admin accede alle impostazioni CRM
Then può personalizzare: logo, dati azienda, testo condizioni, aliquota IVA default
```

---

### US-R023: Dashboard pipeline (conversion rate, velocity, win rate, weighted value)

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 5 | **Dipendenze:** US-R013, US-R017

**Come** utente CRM, **voglio** una dashboard con metriche chiave della pipeline (conversion rate, velocity, win rate, weighted value), **in modo da** monitorare le performance commerciali e identificare colli di bottiglia.

**Acceptance Criteria:**

```gherkin
Given l'utente accede alla dashboard pipeline
When la pagina si carica
Then vede le KPI cards:
  - Total Pipeline Value: somma valori nominali deal aperti
  - Weighted Pipeline Value: somma valori pesati per probabilità
  - Win Rate: deal won / (deal won + deal lost) nel periodo
  - Average Deal Size: media valore deal won nel periodo
  - Sales Velocity: (n. deal × avg value × win rate) / avg days in pipeline
  - Conversion Rate per stage: % deal che passano da uno stage al successivo

Given la dashboard
When l'utente seleziona un periodo (questo mese, trimestre, anno, custom)
Then tutte le metriche si ricalcolano per il periodo selezionato

Given la dashboard
When mostra il grafico "Pipeline Funnel"
Then visualizza un funnel chart con: stage name, numero deal, valore, drop-off % tra stage

Given la dashboard
When mostra il grafico "Deal Velocity"
Then visualizza il tempo medio (giorni) trascorso in ogni stage come bar chart orizzontale
  And evidenzia gli stage dove i deal restano bloccati più a lungo
```

---

### US-R024: Filtri avanzati e viste salvate per pipeline

**Priorità:** 🟢 Bassa | **SP:** 5 | **Sprint:** 8 | **Dipendenze:** US-R014

**Come** utente CRM, **voglio** filtrare i deal nella pipeline per owner, valore, data, account e salvare le combinazioni di filtri come viste, **in modo da** accedere rapidamente alle viste che uso più spesso.

**Acceptance Criteria:**

```gherkin
Given la vista Kanban o lista deal
When l'utente apre il pannello filtri
Then può filtrare per: owner, valore min/max, data chiusura prevista, account, contatto, tag, score range
  And i filtri sono combinabili (AND) e mostrati come chip rimovibili

Given l'utente ha configurato un set di filtri
When clicca "Salva vista" e assegna un nome
Then la vista viene salvata nel database (modello DealView) con tenantId e userId
  And la vista appare nel selettore viste come opzione rapida

Given una vista salvata
When l'utente la seleziona
Then i filtri vengono applicati automaticamente alla pipeline
  And l'utente può modificare i filtri e aggiornare la vista salvata

Given le viste salvate
When l'utente ne elimina una
Then la vista viene rimossa dal database
  And i deal non vengono modificati
```

---

### US-R025: Attività e note collegate ai deal

**Priorità:** 🟡 Media | **SP:** 5 | **Sprint:** 4 | **Dipendenze:** US-R013

**Come** utente CRM, **voglio** aggiungere note testuali e attività (call, meeting, task) ai deal, **in modo da** tracciare tutte le interazioni legate all'opportunità.

**Acceptance Criteria:**

```gherkin
Given il detail view di un deal
When l'utente clicca "Aggiungi nota"
Then può scrivere una nota testuale (rich text base: bold, italic, bullet list)
  And la nota appare nella timeline con timestamp e autore

Given il detail view di un deal
When l'utente clicca "Aggiungi attività"
Then può scegliere il tipo (call, meeting, email, task) e compilare: titolo, descrizione, data/ora, durata, stato (planned, completed, cancelled)
  And l'attività appare nella timeline e nella sezione attività

Given un deal con attività pianificate
When un'attività viene marcata come "completed"
Then il campo lastActivityDate del deal si aggiorna
  And il deal scoring tiene conto dell'attività recente

Given il deal detail
When l'utente filtra la timeline per tipo (solo note, solo attività, solo stage changes)
Then la timeline mostra solo gli eventi del tipo selezionato
```

---

## Task Breakdown

### Sprint 3 — Pipeline & Stage Model, Deal CRUD (US-R011, US-R012, US-R013)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T01 | Prisma schema: modello `Pipeline` (name, description, currency, isDefault, tenantId, deletedAt) | US-R011 | 1h   |
| T02 | Prisma schema: modello `Stage` (name, position, probability, color, type enum, pipelineId, tenantId) | US-R012 | 1h   |
| T03 | Prisma schema: modello `Deal` (title, amount, currency, pipelineId, stageId, contactId, accountId, ownerId, expectedCloseDate, closedAt, lostReason, tenantId, deletedAt) | US-R013 | 1.5h |
| T04 | Migration Prisma + seed dati demo (1 pipeline "Sales" con 6 stage standard) | tutti  | 1.5h |
| T05 | NestJS module `backend/src/modules/crm/pipelines/` — Controller, Service, DTOs | US-R011 | 3h   |
| T06 | Pipeline Service: CRUD con validazione isDefault (unique per tenant), protezione delete con deal attivi | US-R011 | 2h   |
| T07 | Stage Service: CRUD con riordino atomico (transazione Prisma), validazione won/lost obbligatori | US-R012 | 3h   |
| T08 | NestJS module `backend/src/modules/crm/deals/` — Controller, Service, DTOs | US-R013 | 4h   |
| T09 | Deal Service: CRUD con logica stage change (update probability, closedAt per won/lost, lostReason) | US-R013 | 3h   |
| T10 | Deal Service: emissione evento Socket.IO su stage change | US-R013 | 1.5h |
| T11 | Frontend: API modules `frontend/lib/api/pipelines.ts`, `frontend/lib/api/deals.ts` | tutti  | 2h   |
| T12 | Frontend: TanStack Query hooks `use-pipelines.ts`, `use-deals.ts` | tutti  | 2h   |
| T13 | Unit test backend: Pipeline/Stage CRUD, Deal CRUD, stage change logic | tutti  | 4h   |

**Subtotale Sprint 3:** 29.5h

### Sprint 4 — Kanban, Deal Detail, Attività/Note (US-R014, US-R015, US-R016, US-R025)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T14 | Installare e configurare `@hello-pangea/dnd` nel frontend   | US-R014 | 1h   |
| T15 | Frontend: componente `KanbanBoard` con colonne stage, header con conteggio e valore | US-R014 | 5h   |
| T16 | Frontend: componente `DealCard` per Kanban (titolo, valore, contatto, account, data) | US-R014 | 2h   |
| T17 | Frontend: logica drag-and-drop con API call su drop + Socket.IO listener per sync | US-R014 | 4h   |
| T18 | Frontend: fallback mobile lista raggruppata per stage (viewport < 1024px) | US-R014 | 2h   |
| T19 | Frontend: pagina `frontend/src/pages/dashboard/crm/pipeline/index.tsx` con selettore pipeline | US-R016 | 2h   |
| T20 | Frontend: pagina `frontend/src/pages/dashboard/crm/deals/[id].tsx` — detail view | US-R015 | 5h   |
| T21 | Frontend: tabs "Timeline", "Prodotti", "Note" nel deal detail | US-R015 | 3h   |
| T22 | Frontend: sidebar quick-edit (stage select, valore, data chiusura) nel deal detail | US-R015 | 2h   |
| T23 | Prisma schema: `DealActivity` (type enum, title, description, dealId, date, duration, status, tenantId) e `DealNote` (content, dealId, authorId, tenantId) | US-R025 | 1.5h |
| T24 | Backend: endpoints CRUD per DealActivity e DealNote sotto /deals/:id/activities e /deals/:id/notes | US-R025 | 3h   |
| T25 | Frontend: componenti AddNote dialog e AddActivity dialog nel deal detail | US-R025 | 2h   |
| T26 | Frontend: timeline component con filtro per tipo evento | US-R025 | 2h   |
| T27 | Traduzioni IT/EN per pipeline, deal, Kanban, attività, note | tutti  | 1.5h |

**Subtotale Sprint 4:** 36h

### Sprint 5 — Weighted Pipeline, Dashboard, Automazioni (US-R017, US-R018, US-R023)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T28 | Backend: computed field weightedValue nel Deal Service (amount × stage.probability / 100) | US-R017 | 1.5h |
| T29 | Frontend: display weighted value nel Kanban header, deal card e detail | US-R017 | 2h   |
| T30 | Prisma schema: `StageAutomation` (stageId, trigger enum, actionType enum, config JSONB, isActive, tenantId) | US-R018 | 1h   |
| T31 | Backend: AutomationService con handler per send_email, create_task, notify | US-R018 | 4h   |
| T32 | Backend: BullMQ job `stage-automation` con retry policy e error logging | US-R018 | 3h   |
| T33 | Backend: hook nel Deal Service — al cambio stage, accodare automazioni attive | US-R018 | 2h   |
| T34 | Frontend: configurazione automazioni nella pagina pipeline settings | US-R018 | 3h   |
| T35 | Backend: DashboardService con calcoli: total value, weighted value, win rate, avg deal size, velocity, conversion rate per stage | US-R023 | 5h   |
| T36 | Backend: endpoint GET /crm/dashboard/pipeline con parametri periodo | US-R023 | 1.5h |
| T37 | Frontend: pagina `frontend/src/pages/dashboard/crm/pipeline/dashboard.tsx` | US-R023 | 3h   |
| T38 | Frontend: KPI cards (total value, weighted, win rate, avg size, velocity) | US-R023 | 2h   |
| T39 | Frontend: funnel chart (MUI/recharts) per conversion rate per stage | US-R023 | 3h   |
| T40 | Frontend: bar chart orizzontale per deal velocity per stage | US-R023 | 2h   |

**Subtotale Sprint 5:** 33h

### Sprint 6 — Deal Scoring, Prodotti, Listini (US-R019, US-R020, US-R021)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T41 | Prisma schema: `DealScoringRule` (field, operator, value, points, weight, tenantId) e campo `score` su Deal | US-R019 | 1h   |
| T42 | Backend: DealScoringService con rule engine e ricalcolo lazy | US-R019 | 3h   |
| T43 | Frontend: pagina configurazione scoring rules + display score nel deal card/detail | US-R019 | 3h   |
| T44 | Prisma schema: `Product` (name, sku, description, unit, category, tenantId, deletedAt) | US-R020 | 1h   |
| T45 | Prisma schema: `PriceList` (name, isDefault, tenantId) e `PriceListEntry` (productId, priceListId, unitPrice, currency, validFrom, validTo) | US-R020 | 1h   |
| T46 | NestJS module `backend/src/modules/crm/products/` — Controller, Service, DTOs | US-R020 | 3h   |
| T47 | Frontend: pagina catalogo prodotti con lista, ricerca, CRUD | US-R020 | 4h   |
| T48 | Frontend: gestione listini nel product detail | US-R020 | 2h   |
| T49 | Prisma schema: `DealProduct` (dealId, productId, quantity, unitPrice, discountPercent, tenantId) | US-R021 | 1h   |
| T50 | Backend: DealProduct endpoints sotto /deals/:id/products CRUD | US-R021 | 2h   |
| T51 | Frontend: tab "Prodotti" nel deal detail con aggiunta prodotto, quantità, sconto, calcolo totale | US-R021 | 3h   |
| T52 | Backend: logica sync deal.amount con somma DealProduct subtotals (opzionale, con override manuale) | US-R021 | 1.5h |

**Subtotale Sprint 6:** 25.5h

### Sprint 8 — Preventivi, Viste Salvate, Polish (US-R022, US-R024)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T53 | Installare e configurare `pdfmake` nel backend per generazione PDF server-side | US-R022 | 1.5h |
| T54 | Backend: QuoteService — generazione PDF con header, destinatario, tabella prodotti, totali, condizioni | US-R022 | 5h   |
| T55 | Backend: endpoint POST /deals/:id/quote (genera PDF), GET /deals/:id/quotes (lista preventivi) | US-R022 | 2h   |
| T56 | Backend: modello `Quote` (dealId, number progressivo, pdfUrl, totalAmount, validUntil, tenantId) | US-R022 | 1h   |
| T57 | Frontend: bottone "Genera preventivo" nel deal detail + anteprima PDF + download | US-R022 | 3h   |
| T58 | Frontend: settings tenant per template preventivo (logo, dati azienda, condizioni, IVA) | US-R022 | 2h   |
| T59 | Prisma schema: `DealView` (name, filters JSONB, userId, tenantId) | US-R024 | 0.5h |
| T60 | Backend: CRUD DealView endpoints | US-R024 | 2h   |
| T61 | Frontend: pannello filtri avanzati nella pipeline (owner, valore, data, account, score) | US-R024 | 3h   |
| T62 | Frontend: salva/carica/elimina viste con selettore nel toolbar | US-R024 | 2h   |
| T63 | AI tool registration: `getDeal`, `listDeals`, `moveDealStage`, `createDealNote` nel ToolRegistry | tutti  | 3h   |
| T64 | Traduzioni IT/EN per prodotti, preventivi, scoring, viste salvate | tutti  | 1.5h |

**Subtotale Sprint 8:** 26.5h

**Totale ore stimate:** ~150.5h (~19 giorni lavorativi full-time)

---

## Technical Design Notes

### Nuovi modelli Prisma

```prisma
model Pipeline {
  id          String   @id @default(uuid())
  tenantId    String
  name        String
  description String?
  currency    String   @default("EUR")
  isDefault   Boolean  @default(false)
  stages      Stage[]
  deals       Deal[]
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
}

model Stage {
  id          String       @id @default(uuid())
  tenantId    String
  pipelineId  String
  name        String
  position    Int
  probability Int          @default(0) // 0-100
  color       String       @default("#6B7280")
  type        StageType    @default(OPEN)
  pipeline    Pipeline     @relation(fields: [pipelineId], references: [id])
  deals       Deal[]
  automations StageAutomation[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([pipelineId, position])
  @@unique([pipelineId, name])
  @@index([tenantId])
}

enum StageType {
  OPEN
  WON
  LOST
}

model Deal {
  id                String        @id @default(uuid())
  tenantId          String
  title             String
  amount            Decimal       @db.Decimal(15, 2)
  currency          String        @default("EUR")
  pipelineId        String
  stageId           String
  contactId         String?
  accountId         String?
  ownerId           String
  expectedCloseDate DateTime?
  closedAt          DateTime?
  lostReason        String?
  score             Int           @default(0)
  pipeline          Pipeline      @relation(fields: [pipelineId], references: [id])
  stage             Stage         @relation(fields: [stageId], references: [id])
  contact           Contact?      @relation(fields: [contactId], references: [id])
  account           Account?      @relation(fields: [accountId], references: [id])
  products          DealProduct[]
  activities        DealActivity[]
  notes             DealNote[]
  quotes            Quote[]
  deletedAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([tenantId])
  @@index([pipelineId, stageId])
  @@index([contactId])
  @@index([accountId])
  @@index([ownerId])
}

model DealProduct {
  id              String  @id @default(uuid())
  tenantId        String
  dealId          String
  productId       String
  quantity        Int     @default(1)
  unitPrice       Decimal @db.Decimal(15, 2)
  discountPercent Decimal @default(0) @db.Decimal(5, 2)
  deal            Deal    @relation(fields: [dealId], references: [id], onDelete: Cascade)
  product         Product @relation(fields: [productId], references: [id])
  createdAt       DateTime @default(now())

  @@unique([dealId, productId])
  @@index([tenantId])
}

model Product {
  id          String          @id @default(uuid())
  tenantId    String
  name        String
  sku         String?
  description String?
  unit        String          @default("pz")
  category    String?
  prices      PriceListEntry[]
  dealProducts DealProduct[]
  deletedAt   DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@unique([tenantId, sku])
  @@index([tenantId])
}

model PriceList {
  id        String           @id @default(uuid())
  tenantId  String
  name      String
  isDefault Boolean          @default(false)
  entries   PriceListEntry[]
  createdAt DateTime         @default(now())

  @@unique([tenantId, name])
  @@index([tenantId])
}

model PriceListEntry {
  id          String    @id @default(uuid())
  productId   String
  priceListId String
  unitPrice   Decimal   @db.Decimal(15, 2)
  currency    String    @default("EUR")
  validFrom   DateTime  @default(now())
  validTo     DateTime?
  product     Product   @relation(fields: [productId], references: [id])
  priceList   PriceList @relation(fields: [priceListId], references: [id])

  @@unique([productId, priceListId, validFrom])
}

model DealActivity {
  id          String             @id @default(uuid())
  tenantId    String
  dealId      String
  type        DealActivityType
  title       String
  description String?
  date        DateTime
  duration    Int?               // minuti
  status      DealActivityStatus @default(PLANNED)
  deal        Deal               @relation(fields: [dealId], references: [id], onDelete: Cascade)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  @@index([tenantId])
  @@index([dealId])
}

enum DealActivityType {
  CALL
  MEETING
  EMAIL
  TASK
}

enum DealActivityStatus {
  PLANNED
  COMPLETED
  CANCELLED
}

model DealNote {
  id        String   @id @default(uuid())
  tenantId  String
  dealId    String
  authorId  String
  content   String
  deal      Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([dealId])
}

model StageAutomation {
  id         String              @id @default(uuid())
  tenantId   String
  stageId    String
  trigger    AutomationTrigger   @default(ON_ENTER)
  actionType AutomationAction
  config     Json                // parametri azione (templateId, assignee, message, etc.)
  isActive   Boolean             @default(true)
  stage      Stage               @relation(fields: [stageId], references: [id], onDelete: Cascade)
  createdAt  DateTime            @default(now())

  @@index([tenantId])
  @@index([stageId])
}

enum AutomationTrigger {
  ON_ENTER
  ON_EXIT
}

enum AutomationAction {
  SEND_EMAIL
  CREATE_TASK
  NOTIFY
}

model DealScoringRule {
  id       String @id @default(uuid())
  tenantId String
  field    String
  operator String // eq, neq, gt, gte, lt, lte, contains
  value    String
  points   Int
  weight   Float  @default(1.0)
  createdAt DateTime @default(now())

  @@index([tenantId])
}

model Quote {
  id          String   @id @default(uuid())
  tenantId    String
  dealId      String
  number      Int      // progressivo per tenant
  pdfUrl      String?
  totalAmount Decimal  @db.Decimal(15, 2)
  validUntil  DateTime?
  deal        Deal     @relation(fields: [dealId], references: [id])
  createdAt   DateTime @default(now())

  @@unique([tenantId, number])
  @@index([dealId])
}

model DealView {
  id       String @id @default(uuid())
  tenantId String
  userId   String
  name     String
  filters  Json   // { owner, amountMin, amountMax, dateFrom, dateTo, accountId, scoreMin, ... }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, userId, name])
  @@index([tenantId, userId])
}
```

### Nuovi moduli NestJS

| Modulo                                        | Responsabilità                              |
| --------------------------------------------- | ------------------------------------------- |
| `backend/src/modules/crm/pipelines/`          | CRUD Pipeline + Stage, riordino, validazione |
| `backend/src/modules/crm/deals/`              | CRUD Deal, stage change logic, timeline, scoring |
| `backend/src/modules/crm/products/`           | CRUD Product, PriceList, DealProduct        |
| `backend/src/modules/crm/automations/`        | StageAutomation config, BullMQ execution    |
| `backend/src/modules/crm/quotes/`             | Generazione PDF, gestione preventivi        |
| `backend/src/modules/crm/dashboard/`          | Aggregazioni pipeline, metriche KPI         |

### Frontend — Nuove pagine e componenti

| Path                                                          | Componente                              |
| ------------------------------------------------------------- | --------------------------------------- |
| `frontend/src/pages/dashboard/crm/pipeline/index.tsx`         | Kanban board con selettore pipeline     |
| `frontend/src/pages/dashboard/crm/pipeline/dashboard.tsx`     | Dashboard metriche pipeline             |
| `frontend/src/pages/dashboard/crm/pipeline/settings.tsx`      | Configurazione stage, automazioni       |
| `frontend/src/pages/dashboard/crm/deals/[id].tsx`             | Deal detail con tabs                    |
| `frontend/src/pages/dashboard/crm/products/index.tsx`         | Catalogo prodotti                       |
| `frontend/src/pages/dashboard/crm/products/[id].tsx`          | Product detail con listini              |
| `frontend/src/components/crm/kanban-board.tsx`                 | Board Kanban con `@hello-pangea/dnd`    |
| `frontend/src/components/crm/deal-card.tsx`                    | Card deal per Kanban                    |
| `frontend/src/components/crm/deal-form.tsx`                    | Form creazione/modifica deal            |
| `frontend/src/components/crm/deal-timeline.tsx`                | Timeline con filtri per tipo evento     |
| `frontend/src/components/crm/deal-products-tab.tsx`            | Tab prodotti nel deal detail            |
| `frontend/src/components/crm/pipeline-funnel-chart.tsx`        | Funnel chart per dashboard              |
| `frontend/src/components/crm/pipeline-kpi-cards.tsx`           | KPI cards per dashboard                 |
| `frontend/src/components/crm/quote-preview.tsx`                | Anteprima PDF preventivo                |
| `frontend/src/components/crm/scoring-config.tsx`               | Editor regole scoring                   |
| `frontend/src/components/crm/automation-config.tsx`            | Editor automazioni stage                |
| `frontend/src/components/crm/deal-filters.tsx`                 | Pannello filtri avanzati + viste salvate |
| `frontend/lib/api/pipelines.ts`                                | API module pipelines                    |
| `frontend/lib/api/deals.ts`                                    | API module deals                        |
| `frontend/lib/api/products.ts`                                 | API module products                     |
| `frontend/hooks/queries/use-pipelines.ts`                      | TanStack Query hooks pipeline/stage     |
| `frontend/hooks/queries/use-deals.ts`                          | TanStack Query hooks deal               |
| `frontend/hooks/queries/use-products.ts`                       | TanStack Query hooks products           |
| `frontend/hooks/queries/use-pipeline-dashboard.ts`             | TanStack Query hooks metriche           |

### Dipendenze npm da aggiungere

- **Frontend:** `@hello-pangea/dnd` (drag-and-drop Kanban), `recharts` (charts dashboard, se non già presente)
- **Backend:** `pdfmake` + `@types/pdfmake` (generazione PDF preventivi)

### AI Tool Integration

Registrare nel ToolRegistry (`backend/src/modules/ai/tools/`):

| Tool Name         | Descrizione                                     | Parametri                          |
| ----------------- | ----------------------------------------------- | ---------------------------------- |
| `getDeal`         | Recupera dettagli di un deal per ID              | `dealId: string`                   |
| `listDeals`       | Lista deal con filtri                            | `pipelineId?, stageId?, ownerId?`  |
| `moveDealStage`   | Sposta un deal a un nuovo stage                  | `dealId, targetStageId`            |
| `createDealNote`  | Aggiunge una nota a un deal                      | `dealId, content`                  |
| `getDealSummary`  | Riassunto pipeline (totale, weighted, win rate)  | `pipelineId?, period?`            |

### Socket.IO Events

| Evento                | Payload                                          | Direzione   |
| --------------------- | ------------------------------------------------ | ----------- |
| `deal:stage-changed`  | `{ dealId, fromStageId, toStageId, pipelineId }` | Server → Client |
| `deal:created`        | `{ dealId, pipelineId, stageId }`                | Server → Client |
| `deal:updated`        | `{ dealId, changes }`                            | Server → Client |
| `deal:deleted`        | `{ dealId, pipelineId }`                         | Server → Client |

---

## Rischi

| #   | Rischio                                                     | Probabilità | Impatto | Mitigazione                                                |
| --- | ----------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------- |
| R1  | **Performance Kanban con molti deal:** 100+ deal per pipeline con drag-and-drop potrebbe rallentare il rendering | Media       | 🟡 Medio | Virtualizzazione colonne con scroll lazy. Paginazione server-side per stage con più di 20 deal. Ottimistic update locale + sync API. |
| R2  | **Race condition su stage change concorrente:** due utenti spostano lo stesso deal contemporaneamente | Bassa       | 🔴 Alto  | Prisma `@updatedAt` come versioning ottimistico. Se `updatedAt` nel PATCH non corrisponde, 409 Conflict. Frontend mostra dialog "Deal modificato da altro utente, ricaricare?". |
| R3  | **Automazioni a catena:** un'automazione che crea un task potrebbe triggerare un'altra automazione in loop | Bassa       | 🔴 Alto  | Flag `triggeredByAutomation` nel job context. Le automazioni non si triggerano ricorsivamente (max depth 1). Rate limit: max 10 automazioni per deal per minuto. |
| R4  | **Generazione PDF pesante:** template complessi o molti prodotti possono rallentare la risposta API | Media       | 🟡 Medio | Generazione PDF asincrona via BullMQ. Endpoint restituisce jobId, il client fa polling. Timeout di 30 secondi con fallback a "generazione in corso". |
| R5  | **Calcolo metriche dashboard su grandi volumi:** aggregazioni su migliaia di deal possono essere lente | Media       | 🟡 Medio | Query aggregate Prisma con `groupBy`. Caching Redis delle metriche (TTL 5 min). Indici composti su (tenantId, pipelineId, stageId, closedAt). Pre-calcolo notturno per metriche storiche. |
| R6  | **Complessità drag-and-drop cross-browser:** `@hello-pangea/dnd` potrebbe avere bug su Safari/mobile | Bassa       | 🟡 Medio | Fallback a vista lista su mobile (< 1024px). Test su Chrome, Firefox, Safari, Edge. Stage change anche da select nel deal detail come alternativa. |
| R7  | **Consistenza weighted value con probabilità custom:** se l'admin cambia la probabilità di uno stage, i deal esistenti non si aggiornano automaticamente | Media       | 🟢 Basso | Il weighted value è calcolato on-the-fly (non stored). Quando la probabilità dello stage cambia, il weighted si aggiorna alla prossima lettura. Notifica admin che il cambio impatta N deal. |

---

## Definition of Done (DoD)

1. Tutti i test unitari backend passano (`npm run test` nei moduli CRM)
2. Type-check backend e frontend senza errori (`npx tsc --noEmit`)
3. Lint pulito (`npm run lint:win`)
4. Ogni query Prisma include filtro `tenantId` — nessuna eccezione
5. Soft delete implementato per Pipeline, Deal, Product
6. Validazione DTO con `class-validator` su tutti gli endpoint
7. Traduzioni IT e EN complete per tutte le stringhe UI
8. Loading state (Skeleton), error state (Alert), empty state per ogni componente
9. Kanban drag-and-drop funzionante su Chrome, Firefox, Edge (desktop)
10. Fallback mobile funzionante su viewport < 1024px
11. Stage change con ottimistic update + rollback su errore API
12. Socket.IO events emessi e consumati per deal stage changes
13. Automazioni eseguite via BullMQ con logging nella timeline
14. Dashboard metriche corrette e verificate con dati di test
15. PDF preventivo generato correttamente con dati reali
16. AI tools registrati e funzionanti nel chat
17. API documentata in Swagger con decoratori `@ApiTags`, `@ApiOperation`, `@ApiResponse`
18. Responsive: pipeline dashboard e deal detail funzionano su viewport 1024px+
