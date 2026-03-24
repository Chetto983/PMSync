# Epic EP-04: Pipeline & Opportunity Management

| Campo            | Valore                                       |
|------------------|----------------------------------------------|
| **Epic ID**      | EP-04                                        |
| **Progetto**     | CRM Pro 360                                  |
| **Fase**         | 1 — Sprint 7-8                               |
| **Personas**     | Marco (Sales Director)                       |
| **SP Stimati**   | ~89 SP                                       |
| **Stato**        | 📋 Planned                                   |

---

## Overview

Pipeline commerciale visuale con drag-and-drop, supporto multi-pipeline per team/prodotti diversi, weighted pipeline con probabilità per stage, automazioni di stage (trigger su cambio stato), deal scoring, gestione prodotti e listini prezzi, preventivi e proposte commerciali, forecast manuale con override.

L'obiettivo è dare a Marco e al team commerciale uno strumento visuale e intuitivo per gestire l'intero ciclo di vendita: dalla qualificazione dell'opportunità alla chiusura del deal, con automazioni che riducono il lavoro manuale e metriche predittive che supportano il forecasting.

---

## User Stories

### US-042: Vista Kanban pipeline con drag-and-drop

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-042                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | EP-03 (Contacts & Accounts), EP-02 (Data Model) |

**Come** Marco (Sales Director),
**voglio** visualizzare la pipeline commerciale come board Kanban con colonne per ogni stage e spostare i deal tramite drag-and-drop,
**così da** avere una visione immediata dello stato di tutte le opportunità e aggiornare rapidamente il loro avanzamento.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alla sezione "Pipeline"
When la pagina carica
Then vede una board Kanban con colonne ordinate per stage (es. "Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost") e card deal in ciascuna colonna

Given che Marco trascina un deal dalla colonna "Qualified" a "Proposal"
When rilascia la card nella colonna di destinazione
Then il sistema aggiorna lo stage del deal, registra il cambio nel changelog con timestamp e utente, e la card si posiziona nella nuova colonna con animazione fluida

Given che Marco visualizza una card deal nella board
When guarda i dettagli visibili
Then vede: nome deal, nome azienda, valore (€), giorni nello stage corrente, avatar dell'owner, e badge priorità colorato

Given che la pipeline contiene più di 100 deal
When Marco visualizza la board
Then il sistema implementa virtualizzazione delle card (visible viewport rendering) per mantenere performance fluida (< 60ms frame time)

Given che Marco è su dispositivo tablet (viewport 768-1024px)
When visualizza la board Kanban
Then le colonne sono scrollabili orizzontalmente con swipe e le card mantengono leggibilità con layout adattivo
```

---

### US-043: CRUD deal con associazione contatto/account

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-043                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | US-042, EP-03 (US-028, US-037)          |

**Come** Marco (Sales Director),
**voglio** creare, modificare e chiudere deal associandoli a contatti e account esistenti,
**così da** tracciare ogni opportunità commerciale con il suo contesto relazionale completo.

**Acceptance Criteria:**

```gherkin
Given che Marco clicca "Nuovo Deal" nella pipeline
When compila il form con nome, valore (€), data chiusura prevista, stage iniziale, e cerca/seleziona un account e un contatto
Then il sistema salva il deal con le associazioni e lo mostra nella colonna Kanban dello stage selezionato

Given che Marco modifica un deal esistente
When cambia il valore da €50.000 a €75.000
Then il sistema aggiorna il valore, ricalcola il weighted value (valore × probabilità stage) e registra la modifica nel changelog

Given che Marco chiude un deal come "Won"
When seleziona "Closed Won" e inserisce la data di chiusura effettiva
Then il sistema registra il deal come vinto, aggiorna le metriche pipeline (win rate, velocity) e il deal appare nella colonna "Closed Won" con badge verde

Given che Marco chiude un deal come "Lost"
When seleziona "Closed Lost" e inserisce il motivo di perdita (obbligatorio: competitor, prezzo, tempistica, altro)
Then il sistema registra il motivo, il deal appare nella colonna "Closed Lost" con badge rosso e il motivo è visibile nella card

Given che Marco apre il dettaglio di un deal
When visualizza la pagina
Then vede: informazioni deal, contatto/account associati con link cliccabili, timeline attività, prodotti/servizi inclusi, note e file allegati
```

---

### US-044: Multi-pipeline per team/prodotti

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-044                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | US-042                                  |

**Come** Marco (Sales Director),
**voglio** configurare pipeline multiple con stage personalizzati per team o linee di prodotto diverse,
**così da** gestire processi di vendita differenti (es. SaaS vs consulenza) con flussi adeguati a ciascuno.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alle impostazioni "Pipeline"
When clicca "Nuova Pipeline" e inserisce nome "Enterprise SaaS", tipo "SaaS" e definisce gli stage ["Discovery", "Demo", "POC", "Technical Review", "Procurement", "Closed Won", "Closed Lost"]
Then la nuova pipeline viene creata con gli stage ordinati e probabilità default per ciascuno (0%, 10%, 25%, 50%, 75%, 100%, 0%)

Given che Marco visualizza la sezione Pipeline
When seleziona la pipeline "Enterprise SaaS" dal dropdown in alto
Then la board Kanban mostra solo i deal appartenenti a quella pipeline con i relativi stage personalizzati

Given che Marco modifica gli stage di una pipeline esistente
When rinomina lo stage "Demo" in "Product Demo" e aggiunge uno stage "Security Review" tra "Technical Review" e "Procurement"
Then i deal esistenti mantengono il loro stage (anche se rinominato) e il nuovo stage appare vuoto nella board

Given che Marco tenta di eliminare una pipeline con deal attivi (non chiusi)
When clicca "Elimina pipeline"
Then il sistema blocca l'operazione con errore "Pipeline contiene N deal attivi. Sposta o chiudi i deal prima di eliminare."

Given che un utente crea un nuovo deal
When seleziona il campo "Pipeline"
Then vede la lista di tutte le pipeline attive del tenant con preview degli stage di ciascuna
```

---

### US-045: Weighted pipeline con probabilità per stage

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-045                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 5                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | US-042, US-044                          |

**Come** Marco (Sales Director),
**voglio** che ogni stage della pipeline abbia una probabilità di chiusura associata e che il valore pesato venga calcolato automaticamente,
**così da** avere una stima realistica del valore della pipeline basata sullo stadio di avanzamento.

**Acceptance Criteria:**

```gherkin
Given che Marco configura la pipeline con probabilità per stage: Lead (10%), Qualified (25%), Proposal (50%), Negotiation (75%), Closed Won (100%), Closed Lost (0%)
When un deal da €100.000 è nello stage "Proposal"
Then il sistema mostra il valore pesato (weighted value) = €50.000 nella card e negli aggregati pipeline

Given che Marco visualizza il riepilogo pipeline
When guarda l'header della board
Then vede: valore totale (somma dei deal value), valore pesato totale (somma dei weighted value), numero deal per stage

Given che un deal viene spostato da "Qualified" (25%) a "Proposal" (50%)
When il cambio di stage viene salvato
Then il weighted value del deal si aggiorna automaticamente da €25.000 a €50.000 e i totali pipeline vengono ricalcolati

Given che Marco personalizza la probabilità di uno stage specifico
When modifica "Negotiation" da 75% a 80%
Then tutti i deal in quello stage vedono il proprio weighted value ricalcolato immediatamente

Given che Marco visualizza l'header di una singola colonna Kanban
When guarda lo stage "Proposal"
Then vede: nome stage, conteggio deal (es. "8 deal"), valore totale colonna (es. "€450.000"), valore pesato colonna (es. "€225.000")
```

---

### US-046: Automazioni stage (email, task, notifica su cambio)

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-046                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 13                                      |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-042, US-044                          |

**Come** Marco (Sales Director),
**voglio** configurare automazioni che si attivano quando un deal cambia stage (invio email, creazione task, notifica team),
**così da** standardizzare il processo di vendita e ridurre le attività manuali ripetitive.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alle impostazioni automazioni di una pipeline
When crea una regola "Quando deal entra in stage 'Proposal' → Crea task 'Preparare preventivo' assegnato all'owner del deal, scadenza +3 giorni"
Then la regola viene salvata e da quel momento ogni deal che entra in "Proposal" genera automaticamente il task configurato

Given che Marco configura un'automazione "Quando deal entra in 'Negotiation' → Invia email notifica al Sales Director"
When un deal viene spostato in "Negotiation"
Then il sistema invia l'email usando il template configurato con i dati del deal (nome, valore, account, owner)

Given che Marco configura un'automazione "Quando deal entra in 'Closed Won' → Invia notifica in-app a tutto il team"
When un deal viene chiuso come Won
Then tutti i membri del team ricevono una notifica in-app con messaggio celebrativo e dettagli del deal

Given che un'automazione fallisce (es. invio email non riuscito)
When il sistema rileva il fallimento
Then registra l'errore nel log automazioni, ritenta 2 volte con backoff, e se fallisce definitivamente notifica l'admin

Given che Marco disabilita temporaneamente un'automazione senza eliminarla
When togga lo switch "Attiva" a off
Then l'automazione resta configurata ma non viene eseguita; un badge "Disabilitata" appare nella lista automazioni

Given che un deal viene spostato di 2 stage in un singolo aggiornamento (es. da Lead a Proposal via API)
When il sistema processa il cambio
Then esegue le automazioni di TUTTI gli stage attraversati (Lead→Qualified e Qualified→Proposal) nell'ordine corretto
```

---

### US-047: Deal scoring basato su regole

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-047                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-043                                  |

**Come** Marco (Sales Director),
**voglio** assegnare automaticamente un punteggio ai deal basato su regole configurabili (valore, settore account, engagement del contatto, giorni in pipeline),
**così da** prioritizzare l'attenzione del team sui deal con maggiore probabilità di chiusura.

**Acceptance Criteria:**

```gherkin
Given che Marco configura le regole di scoring: "Valore > €50K" (+20 punti), "Settore = IT" (+10 punti), "Decision Maker identificato" (+15 punti), "Giorni in pipeline > 60" (-10 punti)
When un deal soddisfa "Valore = €80K", "Settore = IT", "Decision Maker = sì", "Giorni = 45"
Then il sistema calcola score = 20 + 10 + 15 + 0 = 45 punti e lo mostra nella card deal con indicatore visuale (barra colorata)

Given che Marco visualizza la lista deal ordinata per score
When guarda la colonna "Score"
Then vede il punteggio numerico con colore: verde (≥ 40), giallo (20-39), rosso (< 20)

Given che un deal cambia stato (es. Decision Maker aggiunto)
When il sistema ricalcola lo score
Then il nuovo score viene aggiornato in real-time e la posizione nella lista ordinata cambia di conseguenza

Given che Marco clicca sullo score di un deal
When si apre il dettaglio scoring
Then vede il breakdown di ogni regola con il contributo al punteggio totale (es. "Valore > €50K: +20", "Settore IT: +10")

Given che nessuna regola di scoring è configurata
When Marco visualizza i deal
Then la colonna score mostra "—" e un banner suggerisce "Configura le regole di scoring nelle impostazioni pipeline"
```

---

### US-048: Gestione prodotti e listini prezzi

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-048                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | US-043                                  |

**Come** Marco (Sales Director),
**voglio** gestire un catalogo prodotti/servizi con prezzi base e listini differenziati, e associarli ai deal con quantità e sconti,
**così da** calcolare automaticamente il valore del deal e standardizzare l'offerta commerciale.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alla sezione "Prodotti"
When crea un prodotto con nome "CRM Pro License", codice "CRM-LIC-001", prezzo base €1.200/anno, categoria "Software"
Then il prodotto viene salvato nel catalogo con stato "Attivo" e appare nella lista prodotti

Given che Marco crea un listino "Enterprise" con prezzo €1.000/anno per "CRM Pro License" (sconto 16.7% sul prezzo base)
When un deal usa il listino "Enterprise"
Then il prezzo proposto per quel prodotto è €1.000 anziché €1.200

Given che Marco aggiunge prodotti a un deal
When seleziona "CRM Pro License" × 50 licenze con sconto addizionale 10%
Then il sistema calcola: (€1.200 × 50) - 10% = €54.000 e aggiorna il valore totale del deal

Given che Marco visualizza il dettaglio di un deal con prodotti
When guarda la sezione "Prodotti"
Then vede una tabella con: prodotto, quantità, prezzo unitario, sconto, totale riga e totale deal complessivo

Given che Marco modifica il prezzo base di un prodotto nel catalogo
When salva la modifica
Then i deal esistenti con quel prodotto NON vengono modificati (il prezzo è snapshotted al momento dell'aggiunta); solo i nuovi deal useranno il prezzo aggiornato
```

---

### US-049: Creazione preventivi PDF

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-049                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-048, US-043                          |

**Come** Marco (Sales Director),
**voglio** generare preventivi in formato PDF a partire dai prodotti associati a un deal, con template personalizzabile,
**così da** inviare proposte commerciali professionali ai clienti senza usare strumenti esterni.

**Acceptance Criteria:**

```gherkin
Given che Marco apre un deal con prodotti associati
When clicca "Genera Preventivo"
Then il sistema apre una preview del PDF con: header aziendale, dati cliente (da account/contatto associato), tabella prodotti con quantità/prezzo/sconto, totale, condizioni di pagamento e validità

Given che Marco personalizza il template preventivo
When modifica il logo, i colori, il testo delle condizioni e il footer
Then le modifiche vengono salvate come template del tenant e usate per tutti i preventivi futuri

Given che Marco conferma la generazione
When il PDF viene creato
Then il sistema salva il file nel storage, lo associa al deal nella timeline e offre le opzioni "Scarica" e "Invia via email al contatto"

Given che Marco seleziona "Invia via email"
When conferma l'invio
Then il sistema invia l'email con il PDF allegato al contatto principale del deal, usando il template email "Invio Preventivo", e registra l'invio nella timeline del deal

Given che Marco genera un secondo preventivo per lo stesso deal (revisione)
When il nuovo PDF viene creato
Then viene salvato come "Preventivo v2" con numerazione incrementale; le versioni precedenti restano accessibili nella timeline
```

---

### US-050: Forecast manuale con aggregazione per team/periodo

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-050                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-045 (weighted pipeline)              |

**Come** Marco (Sales Director),
**voglio** visualizzare il forecast della pipeline con possibilità di override manuale e aggregazione per team member e periodo temporale,
**così da** fornire previsioni accurate alla direzione e pianificare le risorse del team.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alla sezione "Forecast"
When seleziona il trimestre Q2 2026
Then vede una tabella con righe per ogni sales rep, colonne per mese (aprile, maggio, giugno) e colonna totale, con valori calcolati dalla weighted pipeline (somma dei deal × probabilità stage per data chiusura prevista)

Given che Marco ritiene che il forecast automatico di un sales rep sia troppo ottimistico
When modifica manualmente il valore di "Laura - Giugno" da €120.000 a €90.000
Then il sistema salva l'override con nota obbligatoria (es. "Deal Acme posticipato a Q3"), il valore originale resta visibile in grigio e il totale si aggiorna

Given che Marco visualizza il riepilogo forecast
When guarda la riga "Totale Team"
Then vede: forecast automatico (pipeline weighted), forecast con override, delta (differenza), e target trimestrale se configurato con progress bar

Given che un deal viene chiuso come Won durante il periodo di forecast
When il valore effettivo viene registrato
Then il forecast mostra una colonna "Actual" con i valori reali affiancati al forecast, e calcola l'accuratezza (forecast vs actual) in percentuale

Given che Marco esporta il forecast
When clicca "Esporta"
Then scarica un file Excel con tutte le righe (per rep), colonne (per mese), valori auto/override/actual e una tab "Storico" con i forecast dei trimestri precedenti
```

---

### US-051: Dashboard pipeline (conversion rate, velocity, win rate)

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-051                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-042, US-043, US-045                  |

**Come** Marco (Sales Director),
**voglio** una dashboard con metriche chiave della pipeline (conversion rate per stage, sales velocity, win rate, average deal size, pipeline coverage),
**così da** identificare colli di bottiglia e misurare le performance del team.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alla Dashboard Pipeline
When la pagina carica
Then vede 5 KPI card in alto: Win Rate (%), Avg Deal Size (€), Sales Velocity (€/giorno), Pipeline Coverage (x volte il target), Conversion Rate Lead→Won (%)

Given che Marco visualizza il grafico "Conversion Funnel"
When guarda il funnel
Then vede le barre per ogni stage con: numero deal entrati, numero deal usciti (avanzati o persi), tasso di conversione tra stage adiacenti (es. Lead→Qualified: 45%)

Given che Marco seleziona il periodo "Ultimi 90 giorni" dal date picker
When i dati vengono ricalcolati
Then tutte le metriche e i grafici si aggiornano per il periodo selezionato, con comparazione vs periodo precedente (es. "+5% vs 90 giorni precedenti")

Given che Marco filtra la dashboard per pipeline "Enterprise SaaS"
When il filtro viene applicato
Then tutte le metriche mostrano solo dati relativi a quella pipeline specifica

Given che Marco clicca su una KPI card (es. "Win Rate: 32%")
When il drill-down si apre
Then vede il dettaglio: win rate per sales rep, win rate per source/canale, trend mensile win rate con grafico a linee, lista dei deal won nel periodo
```

---

### US-052: Filtri avanzati e viste salvate pipeline

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-052                                  |
| **Priorità**   | 🟢 Bassa                               |
| **SP**         | 5                                       |
| **Sprint**     | 8                                       |
| **Dipendenze** | US-042                                  |

**Come** Marco (Sales Director),
**voglio** filtrare i deal nella pipeline per owner, valore, data chiusura, tag e altri criteri, e salvare le combinazioni di filtri come viste personalizzate,
**così da** accedere rapidamente a sottoinsiemi specifici senza riapplicare filtri ogni volta.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il pannello filtri nella vista pipeline
When seleziona "Owner = Laura" AND "Valore > €30.000" AND "Data chiusura = Q2 2026"
Then la board Kanban mostra solo i deal che soddisfano tutti i criteri, con conteggio aggiornato per colonna

Given che Marco clicca "Salva vista" e inserisce il nome "Deal Laura Q2 Alto Valore"
When salva la vista
Then la vista appare nel menu laterale sotto "Viste salvate" e può essere richiamata con un click

Given che Marco seleziona una vista salvata
When la vista viene caricata
Then i filtri vengono ripristinati e la board mostra i dati filtrati; un badge nell'header indica "Vista: Deal Laura Q2 Alto Valore"

Given che Marco condivide una vista salvata con il team
When clicca "Condividi" e seleziona "Tutto il team"
Then la vista appare nelle "Viste condivise" per tutti i membri del team, in sola lettura (solo il creatore può modificarla)

Given che Marco modifica i filtri di una vista salvata
When clicca "Aggiorna vista"
Then i nuovi filtri sovrascrivono quelli precedenti e la vista aggiornata è disponibile per tutti gli utenti con cui è condivisa
```

---

### US-053: Attività e note collegate ai deal

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-053                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 5                                       |
| **Sprint**     | 7                                       |
| **Dipendenze** | US-043                                  |

**Come** Marco (Sales Director),
**voglio** aggiungere note, task e registrare attività (chiamate, meeting, email) direttamente dal deal,
**così da** avere uno storico completo di ogni interazione legata all'opportunità commerciale.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il dettaglio di un deal
When clicca "Aggiungi Nota" e scrive un testo con formattazione rich-text (grassetto, liste, link)
Then la nota viene salvata con timestamp e autore, e appare nella timeline del deal

Given che Marco clicca "Registra Attività" e seleziona tipo "Chiamata"
When inserisce data/ora, durata, esito ("Positivo", "Neutro", "Negativo") e note
Then l'attività viene registrata nella timeline del deal E nella timeline del contatto/account associato

Given che Marco crea un task dal deal
When inserisce titolo "Inviare contratto", scadenza e assegna a un collega
Then il task appare nella timeline del deal, nella lista task personale dell'assegnatario e invia notifica in-app

Given che un task legato al deal scade senza essere completato
When la scadenza passa
Then il sistema invia notifica all'assegnatario e all'owner del deal, e il task appare in rosso nella timeline

Given che Marco filtra la timeline del deal per tipo "Solo task"
When il filtro viene applicato
Then la timeline mostra solo i task con stato (aperto/completato/scaduto), ordinati per data scadenza
```

---

## Task Breakdown

### Backend Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0200 | Definire schema Prisma per `Deal`, `DealStage`, `Pipeline` con relazioni e tenant isolation | US-042, US-043, US-044 | 6h | Backend |
| T-0201 | Implementare PipelineController e PipelineService (CRUD pipeline + stage management) | US-044 | 6h | Backend |
| T-0202 | Implementare DealsController (CRUD deal, cambio stage, close won/lost) | US-043 | 8h | Backend |
| T-0203 | Implementare DealsService con business logic, weighted value calculation e changelog | US-043, US-045 | 6h | Backend |
| T-0204 | Implementare StageTransitionService con validazione flusso e trigger eventi | US-042, US-046 | 6h | Backend |
| T-0205 | Implementare StageAutomationEngine con rule evaluation e action executor | US-046 | 10h | Backend |
| T-0206 | Definire schema Prisma per `StageAutomation` (trigger, condition, action) | US-046 | 3h | Backend |
| T-0207 | Implementare azioni automazione: CreateTask, SendEmail, SendNotification | US-046 | 8h | Backend |
| T-0208 | Creare BullMQ job `automation-executor` con retry e failure logging | US-046 | 4h | Backend |
| T-0209 | Implementare DealScoringService con rule engine configurabile | US-047 | 8h | Backend |
| T-0210 | Definire schema Prisma per `Product`, `PriceList`, `PriceListItem` | US-048 | 4h | Backend |
| T-0211 | Implementare ProductsController e ProductsService (CRUD catalogo + listini) | US-048 | 6h | Backend |
| T-0212 | Implementare DealProductService (associazione prodotti a deal con snapshot prezzo) | US-048 | 4h | Backend |
| T-0213 | Implementare QuoteGenerationService con Puppeteer/Playwright per PDF rendering | US-049 | 8h | Backend |
| T-0214 | Implementare QuoteTemplateService con storage template HTML + merge dati | US-049 | 4h | Backend |
| T-0215 | Implementare ForecastService con calcolo auto (weighted pipeline per periodo) | US-050 | 6h | Backend |
| T-0216 | Implementare ForecastOverrideService con CRUD override e note | US-050 | 4h | Backend |
| T-0217 | Implementare PipelineAnalyticsService con metriche: win rate, velocity, conversion funnel | US-051 | 8h | Backend |
| T-0218 | Implementare endpoint aggregazione dashboard con caching Redis (TTL 5 min) | US-051 | 4h | Backend |
| T-0219 | Implementare SavedViewService con CRUD viste, filtri serializzati, sharing | US-052 | 4h | Backend |
| T-0220 | Implementare DealActivityService (note, attività, task con timeline aggregata) | US-053 | 6h | Backend |
| T-0221 | Implementare WebSocket events per aggiornamento board real-time (deal moved, deal created) | US-042 | 4h | Backend |

### Frontend Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0222 | Creare PipelineBoard component con dnd-kit (colonne, card, drag-and-drop) | US-042 | 10h | Frontend |
| T-0223 | Creare DealCard component con info compatte (valore, azienda, owner, score, giorni) | US-042 | 4h | Frontend |
| T-0224 | Implementare virtualizzazione card nelle colonne Kanban per performance > 100 deal | US-042 | 4h | Frontend |
| T-0225 | Creare DealForm component con associazione contatto/account (autocomplete search) | US-043 | 6h | Frontend |
| T-0226 | Creare DealDetail page con tabs: Info, Prodotti, Timeline, Preventivi | US-043 | 6h | Frontend |
| T-0227 | Creare PipelineConfigurator component per CRUD pipeline e stage | US-044 | 6h | Frontend |
| T-0228 | Creare WeightedPipelineSummary component (header board con totali pesati) | US-045 | 3h | Frontend |
| T-0229 | Creare AutomationBuilder component con form trigger/condition/action | US-046 | 8h | Frontend |
| T-0230 | Creare DealScoreIndicator component (barra colorata + breakdown popover) | US-047 | 3h | Frontend |
| T-0231 | Creare ScoringRuleEditor component per configurazione regole scoring | US-047 | 4h | Frontend |
| T-0232 | Creare ProductCatalog page con CRUD prodotti e listini in DataGrid | US-048 | 6h | Frontend |
| T-0233 | Creare DealProductSelector component con ricerca prodotto, quantità, sconto | US-048 | 4h | Frontend |
| T-0234 | Creare QuotePreview component con rendering HTML template e azioni genera/invia | US-049 | 6h | Frontend |
| T-0235 | Creare ForecastTable component con griglia editable (inline edit per override) | US-050 | 8h | Frontend |
| T-0236 | Creare PipelineDashboard page con KPI cards, funnel chart, trend charts (recharts) | US-051 | 8h | Frontend |
| T-0237 | Creare FilterPanel component per deal con saved views dropdown | US-052 | 4h | Frontend |
| T-0238 | Creare DealTimeline component con note rich-text (tiptap), attività form, task form | US-053 | 6h | Frontend |

### QA Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0239 | Test E2E Kanban: drag-and-drop, cambio stage, animazioni, performance > 100 deal | US-042 | 4h | QA |
| T-0240 | Test E2E deal CRUD: creazione, modifica valore, close won/lost, associazioni | US-043 | 4h | QA |
| T-0241 | Test multi-pipeline: creazione, switch, modifica stage, eliminazione con deal attivi | US-044 | 3h | QA |
| T-0242 | Test weighted pipeline: calcolo probabilità, ricalcolo su cambio stage, totali header | US-045 | 3h | QA |
| T-0243 | Test automazioni: trigger su cambio stage, email/task/notifica, multi-stage skip, failure retry | US-046 | 5h | QA |
| T-0244 | Test deal scoring: calcolo punteggio, breakdown, ricalcolo real-time, no regole configurate | US-047 | 3h | QA |
| T-0245 | Test prodotti: CRUD catalogo, listini, associazione deal, snapshot prezzo, calcolo totale | US-048 | 4h | QA |
| T-0246 | Test preventivi PDF: generazione, template custom, versionamento, invio email | US-049 | 4h | QA |
| T-0247 | Test forecast: calcolo auto, override manuale, export Excel, comparazione actual | US-050 | 4h | QA |
| T-0248 | Test dashboard: KPI accuracy, funnel chart, filtro pipeline, drill-down, periodo custom | US-051 | 4h | QA |
| T-0249 | Test filtri e viste: salva/carica/condividi vista, filtri combinati | US-052 | 3h | QA |
| T-0250 | Test attività deal: note rich-text, registra chiamata, task con scadenza, filtro timeline | US-053 | 3h | QA |

**Totale ore stimate:** Backend ~134h | Frontend ~96h | QA ~44h | **Totale: ~274h**

---

## Technical Design Notes

### Drag-and-Drop Library

- **Libreria scelta:** `@dnd-kit/core` + `@dnd-kit/sortable` — framework-agnostic, ottimizzato per React 19, supporto nativo per virtualizzazione e accessibilità (keyboard navigation, screen reader).
- **Architettura:** ogni colonna è un `SortableContext` con `DragOverlay` per ghost card durante il trascinamento. Il cambio stage viene committato solo al `onDragEnd` con optimistic update (TanStack Query `onMutate` → rollback su errore).
- **Performance:** le card nelle colonne usano `react-window` (virtualizzazione) quando il conteggio supera 30 elementi per colonna.

### Stage Automation Engine

- **Modello dati:** `StageAutomation` ha 3 componenti:
  - `trigger`: `{ type: 'STAGE_ENTER' | 'STAGE_EXIT', stageId: string }`
  - `conditions`: `{ field: string, operator: 'eq' | 'gt' | 'lt' | 'contains', value: any }[]` (opzionale, filtra su proprietà del deal)
  - `actions`: `{ type: 'CREATE_TASK' | 'SEND_EMAIL' | 'SEND_NOTIFICATION', config: object }[]`
- **Esecuzione:** il `StageTransitionService` emette evento `deal.stage.changed` via `EventEmitter2`. Il `StageAutomationEngine` ascolta, valuta le condizioni e accoda le azioni come job BullMQ con priorità e retry.
- **Multi-stage skip:** se un deal salta stage (es. Lead → Proposal), il sistema genera eventi sintetici per ogni stage intermedio, eseguendo le automazioni in sequenza.

### PDF Generation

- **Strategia:** template HTML/CSS salvati nel database (`QuoteTemplate`), renderizzati con Handlebars per merge dati, convertiti in PDF via Puppeteer in modalità headless.
- **Deployment concern:** Puppeteer richiede Chromium headless. Alternativa per ambienti senza Chromium: `@react-pdf/renderer` lato backend con layout React-to-PDF (nessuna dipendenza browser).
- **Template storage:** HTML + CSS salvato come testo nel DB, con upload logo in S3/storage. Il merge usa Handlebars helpers per formattazione valuta (`{{currency value}}`) e date (`{{dateFormat date 'DD/MM/YYYY'}}`).

### Pipeline Analytics

- **Metriche calcolate:**
  - **Win Rate:** `COUNT(Closed Won) / COUNT(Closed Won + Closed Lost)` per periodo
  - **Sales Velocity:** `(N deal × Avg deal size × Win rate) / Avg sales cycle days`
  - **Conversion Rate per stage:** `COUNT(deal usciti verso stage successivo) / COUNT(deal entrati nello stage)`
  - **Pipeline Coverage:** `Weighted pipeline value / Revenue target`
- **Caching:** le metriche aggregate vengono calcolate e cachate in Redis con TTL 5 minuti. Invalidazione su ogni evento `deal.stage.changed` o `deal.closed`.
- **Charting:** frontend usa `recharts` per funnel chart, line chart (trend), bar chart (comparazione per rep).

### Deal Scoring Engine

- **Modello regole:** array di `ScoringRule` con `{ field: string, operator: string, value: any, points: number }`.
- **Valutazione:** per ogni deal, il sistema valuta tutte le regole attive e somma i punti. Le regole possono dare punti positivi (incentivi) o negativi (penalità).
- **Ricalcolo:** score ricalcolato su ogni modifica del deal o delle sue associazioni. Per evitare overhead, il ricalcolo batch (tutti i deal) avviene ogni 30 minuti via cron BullMQ.

---

## Rischi

| ID | Rischio | Probabilità | Impatto | P × I | Mitigazione |
|----|---------|-------------|---------|-------|-------------|
| R-01 | Drag-and-drop non performante con > 200 deal nella board (browser lag su colonne piene) | Media (50%) | Alto | 🟡 | Virtualizzazione card con react-window; lazy loading deal per colonna; paginazione colonne |
| R-02 | Automazioni stage creano loop infiniti (automazione A cambia stage → trigger automazione B → ricambia stage) | Bassa (20%) | Critico | 🟡 | Limite hard a 5 automazioni per singola transizione; detection loop con depth counter; kill dopo 3 iterazioni |
| R-03 | PDF generation con Puppeteer fallisce in ambiente containerizzato (manca Chromium/fonts) | Alta (70%) | Alto | 🔴 | Usare immagine Docker con Chromium pre-installato; fallback su @react-pdf/renderer se Puppeteer non disponibile |
| R-04 | Forecast override manuale crea confusione se i deal sottostanti cambiano significativamente | Media (40%) | Medio | 🟡 | Mostrare delta tra forecast auto e override; notifica quando delta supera ±20%; suggerire aggiornamento override |
| R-05 | Multi-pipeline con stage diversi complica le query analytics aggregate (comparazione cross-pipeline) | Media (50%) | Medio | 🟡 | Standardizzare stage canonici (Lead, Active, Won, Lost) per metriche cross-pipeline; mapping custom stage → canonical stage |
| R-06 | Deal scoring con troppe regole (> 50) rallenta il ricalcolo real-time | Bassa (30%) | Basso | 🟢 | Limite a 30 regole per tenant; caching score con invalidazione selettiva; ricalcolo batch per operazioni bulk |

---

## Definition of Done

1. Tutti gli acceptance criteria delle user story sono verificati e superano test E2E
2. Coverage test unitari ≥ 80% per tutti i service backend (Deal, Pipeline, Automation, Scoring, Forecast)
3. Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
4. Lint passa senza warning (`npm run lint:win`)
5. Tutte le query includono filtro `tenantId` (multi-tenant compliance)
6. API endpoints documentati in Swagger con schema request/response
7. Traduzioni complete in `en.ts` e `it.ts` per tutti i nuovi componenti
8. Drag-and-drop funziona su Chrome, Firefox, Safari, Edge (ultimi 2 major versions)
9. Board Kanban mantiene < 60ms frame time con 200 deal
10. Automazioni stage eseguono entro 5 secondi dal trigger
11. PDF preventivi generati entro 10 secondi con template standard
12. Dashboard metriche caricano entro 2 secondi (con cache calda)
13. Changelog/audit log per tutte le modifiche su deal, stage e forecast override
14. Code review approvata da almeno 1 sviluppatore senior