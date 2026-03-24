# Epic EP-03: Contacts & Account Management

| Campo            | Valore                                       |
|------------------|----------------------------------------------|
| **Epic ID**      | EP-03                                        |
| **Progetto**     | CRM Pro 360                                  |
| **Fase**         | 1 — Sprint 5-6                               |
| **Personas**     | Marco (Sales Director), Laura (Marketing Manager) |
| **SP Stimati**   | ~90 SP                                       |
| **Stato**        | 📋 Planned                                   |

---

## Overview

Anagrafica completa contatti e aziende con campi custom, validazione dati, de-duplicazione con fuzzy matching, timeline delle interazioni, segmentazione dinamica, import/export massivo (CSV/Excel), merge assistito di record duplicati, gerarchia account (holding/filiali), tag e categorizzazione.

L'obiettivo è fornire al team commerciale un registro centralizzato e sempre aggiornato di contatti e aziende, eliminando duplicati, abilitando ricerche avanzate e offrendo viste flessibili sui dati. Laura potrà segmentare dinamicamente i contatti per campagne mirate, mentre Marco avrà visibilità completa sulla timeline di ogni relazione commerciale.

---

## User Stories

### US-028: CRUD contatti con validazione campi

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-028                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | EP-01 (Auth & Tenant), EP-02 (Data Model base) |

**Come** Marco (Sales Director),
**voglio** creare, leggere, aggiornare e cancellare contatti con validazione automatica dei campi obbligatori,
**così da** mantenere un'anagrafica pulita e affidabile per il team commerciale.

**Acceptance Criteria:**

```gherkin
Given che Marco è autenticato e ha il ruolo "Sales" o superiore
When compila il form di creazione contatto con nome, cognome, email e telefono
Then il sistema valida il formato email (RFC 5322), il formato telefono (E.164), e salva il contatto con timestamp di creazione

Given che Marco inserisce un'email con formato non valido (es. "mario@")
When clicca "Salva"
Then il sistema mostra un errore inline "Formato email non valido" e non salva il record

Given che Marco visualizza un contatto esistente
When modifica il campo "telefono" e clicca "Aggiorna"
Then il sistema aggiorna il record, incrementa il campo `updatedAt` e mostra conferma toast

Given che Marco cancella un contatto
When conferma la cancellazione nel dialog modale
Then il sistema esegue soft-delete (flag `deletedAt`), il contatto scompare dalle liste ma resta nel database per 90 giorni

Given che un campo obbligatorio (nome, cognome) è vuoto
When Marco tenta il salvataggio
Then il form evidenzia i campi mancanti in rosso con messaggio "Campo obbligatorio"
```

---

### US-029: Campi custom configurabili per contatti

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-029                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | US-028                                  |

**Come** Marco (Sales Director),
**voglio** definire campi personalizzati (testo, numero, data, select, checkbox) per i contatti,
**così da** adattare l'anagrafica alle esigenze specifiche del mio settore senza intervento tecnico.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alle impostazioni "Campi Custom Contatti"
When aggiunge un campo di tipo "select" con nome "Settore Merceologico" e opzioni ["IT", "Finance", "Healthcare", "Manufacturing"]
Then il campo appare nel form di creazione/modifica contatto come dropdown con le opzioni specificate

Given che Marco definisce un campo custom come "obbligatorio"
When un utente tenta di salvare un contatto senza compilare quel campo
Then il sistema blocca il salvataggio e mostra errore di validazione

Given che esistono contatti creati prima dell'aggiunta del campo custom
When Marco visualizza quei contatti
Then il campo custom appare vuoto (non compilato) senza errori

Given che Marco elimina un campo custom
When conferma l'eliminazione
Then il campo scompare dal form e i dati precedentemente inseriti in quel campo vengono conservati in archivio JSONB per 180 giorni

Given che Marco crea un campo custom di tipo "data"
When un utente inserisce un valore nel formato errato
Then il sistema mostra il date picker e rifiuta input manuali con formato non ISO 8601
```

---

### US-030: Ricerca avanzata contatti con filtri multipli

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-030                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | US-028, Elasticsearch cluster attivo    |

**Come** Laura (Marketing Manager),
**voglio** cercare contatti combinando filtri su campi standard e custom con operatori logici (AND/OR),
**così da** individuare rapidamente segmenti specifici per campagne marketing.

**Acceptance Criteria:**

```gherkin
Given che Laura accede alla lista contatti
When digita "Mario Rossi" nella barra di ricerca globale
Then il sistema restituisce risultati in <300ms cercando su nome, cognome, email e azienda tramite Elasticsearch full-text

Given che Laura apre il pannello "Filtri avanzati"
When seleziona "Città = Milano" AND "Settore = IT" AND "Ultimo contatto > 30 giorni fa"
Then la lista mostra solo i contatti che soddisfano TUTTI i criteri simultaneamente

Given che Laura applica filtri su un campo custom di tipo select
When seleziona "Settore Merceologico = Healthcare"
Then il filtro funziona identicamente ai campi standard, con la stessa velocità di risposta

Given che Laura combina filtri con operatore OR
When imposta "Città = Milano OR Città = Roma"
Then la lista mostra contatti di entrambe le città

Given che la ricerca restituisce 0 risultati
When Laura visualizza la pagina
Then il sistema mostra un empty state con suggerimento "Prova a rimuovere alcuni filtri" e un link per resettare tutti i filtri
```

---

### US-031: De-duplicazione contatti con fuzzy matching

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-031                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 13                                      |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-028, US-036 (merge)                  |

**Come** Marco (Sales Director),
**voglio** che il sistema identifichi automaticamente contatti potenzialmente duplicati usando fuzzy matching su nome, email e telefono,
**così da** evitare record ridondanti che generano confusione nel team commerciale.

**Acceptance Criteria:**

```gherkin
Given che Marco crea un nuovo contatto "Mario Rosi" con email "mario.rossi@acme.it"
When il sistema confronta il record con quelli esistenti
Then identifica "Mario Rossi" (Levenshtein distance ≤ 2 su nome) e "m.rossi@acme.it" (match dominio + iniziale) come potenziali duplicati

Given che il sistema trova potenziali duplicati
When mostra il dialog di avviso a Marco
Then presenta una tabella comparativa con score di similarità (0-100%), campi divergenti evidenziati e opzioni "Crea comunque", "Merge", "Annulla"

Given che un job batch di de-duplicazione viene lanciato dall'admin
When il job analizza l'intero database contatti del tenant
Then produce un report con tutti i cluster di duplicati (soglia similarità ≥ 75%), ordinati per confidence score decrescente

Given che due contatti hanno email identica ma nomi diversi (es. "Mario Rossi" vs "M. Rossi")
When il sistema calcola la similarità
Then assegna score ≥ 90% perché l'email è un identificatore forte

Given che il fuzzy matching confronta contatti con solo il nome simile ma email e telefono completamente diversi
When il sistema calcola la similarità
Then assegna score < 50% e non li segnala come duplicati nella vista standard (visibili solo con soglia abbassata)
```

---

### US-032: Timeline interazioni per contatto

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-032                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 5                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | US-028, EP-02 (Activity Log)            |

**Come** Marco (Sales Director),
**voglio** visualizzare una timeline cronologica di tutte le interazioni con un contatto (email, chiamate, note, deal, task),
**così da** avere contesto completo prima di ogni conversazione commerciale.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il dettaglio di un contatto
When visualizza la sezione "Timeline"
Then il sistema mostra tutte le interazioni ordinate cronologicamente (più recente in alto) con icona tipo, data/ora, breve descrizione e autore

Given che il contatto ha più di 50 interazioni
When Marco scorre la timeline
Then il sistema carica le interazioni con infinite scroll (batch da 20), senza reload della pagina

Given che Marco filtra la timeline per tipo "Solo email"
When il filtro viene applicato
Then la timeline mostra solo le interazioni di tipo email, con conteggio aggiornato "(12 di 47 interazioni)"

Given che un collega aggiunge una nota al contatto mentre Marco sta visualizzando la timeline
When la nota viene salvata
Then la timeline di Marco si aggiorna in real-time via WebSocket senza refresh manuale

Given che Marco clicca su un'interazione nella timeline
When l'interazione è un'email
Then il sistema apre il dettaglio email in un side panel senza navigare fuori dal contatto
```

---

### US-033: Segmentazione dinamica contatti

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-033                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-030 (Ricerca avanzata)               |

**Come** Laura (Marketing Manager),
**voglio** creare segmenti dinamici basati su regole (filtri salvati) che si aggiornano automaticamente,
**così da** avere liste sempre aggiornate per campagne email e analisi senza manutenzione manuale.

**Acceptance Criteria:**

```gherkin
Given che Laura accede alla sezione "Segmenti"
When crea un nuovo segmento con regole "Città = Milano AND Ultimo acquisto < 6 mesi AND Tag contiene 'premium'"
Then il sistema salva il segmento e calcola immediatamente il conteggio dei contatti che soddisfano le regole

Given che un nuovo contatto viene creato che soddisfa le regole di un segmento esistente
When il conteggio del segmento viene ricalcolato (ogni 15 minuti o su richiesta manuale)
Then il nuovo contatto appare nel segmento senza intervento manuale

Given che Laura visualizza un segmento
When clicca "Esporta segmento"
Then può scaricare i contatti del segmento in formato CSV con tutti i campi visibili nella vista corrente

Given che Laura modifica le regole di un segmento
When salva le modifiche
Then il conteggio viene ricalcolato in background e una notifica toast conferma "Segmento aggiornato: 234 contatti"

Given che Laura duplica un segmento esistente
When modifica il nome e aggiunge una regola aggiuntiva
Then il sistema crea un nuovo segmento indipendente con le regole modificate
```

---

### US-034: Import massivo contatti da CSV/Excel

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-034                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 8                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | US-028, US-031 (de-dup check)           |

**Come** Marco (Sales Director),
**voglio** importare contatti in blocco da file CSV e Excel con mapping colonne e preview dei dati,
**così da** migrare rapidamente dati da altri sistemi senza inserimento manuale.

**Acceptance Criteria:**

```gherkin
Given che Marco carica un file CSV con 5000 contatti
When il sistema analizza il file
Then mostra un'anteprima delle prime 10 righe con mapping automatico delle colonne (es. "First Name" → "Nome") e possibilità di correzione manuale

Given che Marco conferma il mapping e avvia l'import
When il job di import processa i record
Then mostra una progress bar in tempo reale e al termine un report con: N importati, N duplicati trovati, N errori di validazione

Given che una riga del CSV ha un'email malformata
When il sistema la processa
Then la riga viene saltata e aggiunta al report errori con numero riga e motivo ("Riga 47: formato email non valido"), gli altri record vengono importati normalmente

Given che Marco carica un file Excel (.xlsx) con più fogli
When il sistema analizza il file
Then mostra un selettore per scegliere quale foglio importare

Given che il file contiene contatti già presenti nel sistema (match per email)
When il sistema li rileva tramite de-duplicazione
Then chiede a Marco di scegliere: "Salta duplicati", "Aggiorna campi esistenti" o "Crea comunque come nuovi"

Given che l'import supera i 10.000 record
When Marco avvia l'operazione
Then il sistema processa in background via BullMQ e invia notifica email/in-app al completamento
```

---

### US-035: Export contatti in CSV/Excel/JSON

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-035                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 5                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-028, US-030 (filtri)                 |

**Come** Laura (Marketing Manager),
**voglio** esportare contatti filtrati in formato CSV, Excel o JSON,
**così da** utilizzare i dati in strumenti esterni (mailchimp, fogli di calcolo, BI tools).

**Acceptance Criteria:**

```gherkin
Given che Laura ha applicato filtri alla lista contatti (es. "Città = Roma")
When clicca "Esporta" e seleziona formato CSV
Then il sistema genera un file CSV UTF-8 con BOM contenente solo i contatti filtrati e le colonne visibili nella vista corrente

Given che Laura seleziona formato Excel
When il file viene generato
Then il file .xlsx include un foglio "Contatti" con header formattati in grassetto e colonne auto-sized

Given che Laura seleziona formato JSON
When il file viene generato
Then il file contiene un array JSON con oggetti che rispettano lo schema API, inclusi campi custom come proprietà nested

Given che l'export supera 50.000 record
When Laura avvia l'operazione
Then il sistema processa in background e invia link di download via notifica in-app (link valido 24 ore)

Given che Laura esporta contatti con campi custom
When il file viene generato
Then i campi custom appaiono come colonne aggiuntive con il nome del campo come header
```

---

### US-036: Merge assistito record duplicati

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-036                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 8                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-031 (de-duplicazione)                |

**Come** Marco (Sales Director),
**voglio** unire due o più contatti duplicati scegliendo per ogni campo quale valore mantenere,
**così da** consolidare le informazioni senza perdere dati.

**Acceptance Criteria:**

```gherkin
Given che Marco seleziona 2 contatti duplicati dalla lista duplicati
When clicca "Merge"
Then il sistema mostra un'interfaccia side-by-side con tutti i campi, evidenziando le differenze e pre-selezionando il valore più recente per ogni campo

Given che Marco seleziona manualmente i valori da mantenere per ogni campo
When clicca "Conferma merge"
Then il sistema crea un record consolidato, trasferisce tutte le interazioni/note/deal al record sopravvissuto e soft-delete i record di origine

Given che i contatti da unire hanno ciascuno deal attivi
When il merge viene eseguito
Then tutti i deal vengono ri-associati al contatto sopravvissuto senza perdita di dati

Given che Marco tenta di fare merge di 3 contatti contemporaneamente
When seleziona i 3 contatti e clicca "Merge"
Then l'interfaccia mostra 3 colonne affiancate con la stessa logica di selezione campo per campo

Given che Marco si accorge di un merge errato entro 24 ore
When accede alla sezione "Operazioni recenti"
Then può eseguire "Undo merge" che ripristina i record originali con tutti i dati e associazioni precedenti
```

---

### US-037: CRUD aziende/account con campi standard

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-037                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 5                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | EP-01 (Auth & Tenant)                   |

**Come** Marco (Sales Director),
**voglio** gestire un'anagrafica aziende con campi standard (ragione sociale, P.IVA, settore, dimensione, indirizzo, sito web, fatturato),
**così da** avere un registro strutturato dei clienti e prospect aziendali.

**Acceptance Criteria:**

```gherkin
Given che Marco è autenticato con ruolo "Sales"
When compila il form di creazione account con ragione sociale, P.IVA e settore
Then il sistema valida il formato P.IVA (11 cifre per Italia, check digit corretto) e salva l'account

Given che Marco inserisce una P.IVA già presente nel sistema
When tenta il salvataggio
Then il sistema mostra errore "P.IVA già registrata" con link al record esistente

Given che Marco modifica un account esistente
When cambia il campo "Dimensione" da "PMI" a "Enterprise"
Then il sistema registra la modifica nel changelog dell'account con utente, timestamp e valori prima/dopo

Given che Marco cancella un account con contatti associati
When conferma la cancellazione
Then il sistema esegue soft-delete dell'account; i contatti associati rimangono attivi ma perdono l'associazione (con warning preventivo)

Given che Marco visualizza il dettaglio di un account
When guarda la sezione riassuntiva
Then vede: conteggio contatti associati, deal attivi, valore totale pipeline, ultima interazione
```

---

### US-038: Gerarchia account (holding → filiali)

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-038                                  |
| **Priorità**   | 🟢 Bassa                               |
| **SP**         | 5                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-037                                  |

**Come** Marco (Sales Director),
**voglio** definire relazioni gerarchiche tra account (holding → filiali → business unit),
**così da** avere una visione consolidata dei gruppi aziendali e del loro valore complessivo.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il dettaglio dell'account "Acme Corp"
When imposta "Acme Holding SpA" come account padre
Then "Acme Corp" appare come filiale nella vista gerarchica di "Acme Holding SpA"

Given che Marco visualizza "Acme Holding SpA"
When espande l'albero gerarchico
Then vede tutte le filiali con: nome, città, contatti associati, valore pipeline aggregato per ciascuna

Given che Marco tenta di creare una gerarchia circolare (A → B → A)
When salva la relazione
Then il sistema rifiuta con errore "Relazione circolare non consentita"

Given che Marco visualizza il riepilogo di un account holding
When guarda le metriche aggregate
Then vede il fatturato totale, numero contatti totale e valore pipeline sommato di tutte le filiali

Given che Marco rimuove la relazione padre-figlio
When conferma la rimozione
Then l'account figlio diventa indipendente senza perdita di dati, e la metrica aggregata del padre viene ricalcolata
```

---

### US-039: Associazione contatti-account con ruoli

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-039                                  |
| **Priorità**   | 🔴 Alta                                |
| **SP**         | 5                                       |
| **Sprint**     | 5                                       |
| **Dipendenze** | US-028, US-037                          |

**Come** Marco (Sales Director),
**voglio** associare contatti ad account specificando il ruolo (Decision Maker, Influencer, Champion, End User, Gatekeeper),
**così da** mappare la struttura decisionale di ogni azienda target.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il dettaglio di un contatto
When clicca "Associa ad account", cerca "Acme Corp" e seleziona ruolo "Decision Maker"
Then il contatto viene associato all'account con il ruolo specificato, visibile sia dal contatto che dall'account

Given che Marco associa lo stesso contatto a più account
When aggiunge "Acme Corp" (Decision Maker) e "Beta Srl" (Influencer)
Then entrambe le associazioni sono visibili nel profilo contatto, ciascuna con il proprio ruolo

Given che Marco visualizza un account
When guarda la sezione "Contatti"
Then vede la lista dei contatti associati raggruppati per ruolo, con badge colorati (es. Decision Maker in rosso, Influencer in blu)

Given che Marco rimuove l'associazione contatto-account
When conferma la rimozione
Then l'associazione viene eliminata ma sia il contatto che l'account restano intatti

Given che Marco cerca contatti con ruolo "Decision Maker" su tutti gli account
When applica il filtro globale
Then il sistema restituisce tutti i contatti con quel ruolo, con indicazione dell'account associato
```

---

### US-040: Tag e categorizzazione contatti/account

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-040                                  |
| **Priorità**   | 🟡 Media                               |
| **SP**         | 5                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-028, US-037                          |

**Come** Laura (Marketing Manager),
**voglio** applicare tag liberi e categorie predefinite a contatti e account,
**così da** organizzare e filtrare i dati secondo tassonomie personalizzate.

**Acceptance Criteria:**

```gherkin
Given che Laura visualizza un contatto
When aggiunge i tag "premium", "webinar-2026", "tech-buyer"
Then i tag appaiono come chip colorati nel profilo contatto e sono ricercabili dal filtro globale

Given che Laura digita un tag nel campo di input
When inizia a scrivere "prem"
Then il sistema suggerisce tag esistenti ("premium", "pre-meeting") con autocomplete per evitare duplicati

Given che Laura applica tag in bulk selezionando 50 contatti dalla lista
When sceglie "Aggiungi tag: evento-q2"
Then il tag viene aggiunto a tutti i 50 contatti e una conferma toast mostra "Tag aggiunto a 50 contatti"

Given che Laura cerca contatti con un tag specifico
When seleziona il filtro "Tag = premium"
Then la lista mostra solo contatti con quel tag, con conteggio totale nell'header

Given che un admin elimina un tag dalla gestione tag globale
When conferma l'eliminazione
Then il tag viene rimosso da tutti i contatti/account che lo avevano, con log dell'operazione
```

---

### US-041: Vista lista, tabella e Kanban per contatti

| Campo          | Valore                                  |
|----------------|-----------------------------------------|
| **ID**         | US-041                                  |
| **Priorità**   | 🟢 Bassa                               |
| **SP**         | 5                                       |
| **Sprint**     | 6                                       |
| **Dipendenze** | US-028, US-030                          |

**Come** Laura (Marketing Manager),
**voglio** visualizzare i contatti in modalità lista compatta, tabella con colonne configurabili o Kanban per status/segmento,
**così da** scegliere la vista più adatta al mio workflow corrente.

**Acceptance Criteria:**

```gherkin
Given che Laura è nella pagina contatti
When seleziona la vista "Tabella"
Then il sistema mostra una tabella con colonne ordinabili, ridimensionabili e riordinabili tramite drag-and-drop delle intestazioni

Given che Laura seleziona la vista "Lista"
When visualizza i contatti
Then vede card compatte con avatar, nome, azienda, ultimo contatto e tag principali (max 3 visibili + badge "+N")

Given che Laura seleziona la vista "Kanban"
When sceglie il raggruppamento per "Status" (Prospect, Qualified, Customer, Churned)
Then vede le colonne Kanban con i contatti raggruppati, e può trascinare un contatto da una colonna all'altra per cambiarne lo status

Given che Laura configura le colonne visibili nella vista tabella
When deseleziona "Telefono" e aggiunge "Settore Merceologico" (campo custom)
Then la configurazione viene salvata per utente e persiste tra le sessioni

Given che Laura cambia vista da Tabella a Lista
When i filtri sono attivi
Then i filtri restano applicati e la vista cambia mantenendo lo stesso dataset filtrato
```

---

## Task Breakdown

### Backend Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0100 | Definire schema Prisma per `Contact` con campi standard, soft-delete, tenant isolation | US-028 | 4h | Backend |
| T-0101 | Implementare ContactsController (CRUD endpoints) con validazione DTO (class-validator) | US-028 | 6h | Backend |
| T-0102 | Implementare ContactsService con business logic, validazione email RFC 5322 e telefono E.164 | US-028 | 6h | Backend |
| T-0103 | Definire schema Prisma per `CustomField` con storage JSONB e relazione tenant | US-029 | 4h | Backend |
| T-0104 | Implementare CustomFieldsService con CRUD e validazione tipo/valore | US-029 | 6h | Backend |
| T-0105 | Configurare indice Elasticsearch per contatti con mapping full-text e keyword fields | US-030 | 6h | Backend |
| T-0106 | Implementare SearchService con query builder per filtri multipli AND/OR | US-030 | 8h | Backend |
| T-0107 | Implementare ElasticsearchSyncService per sincronizzazione Prisma → ES via hook | US-030 | 4h | Backend |
| T-0108 | Implementare DuplicateDetectionService con algoritmo Levenshtein + Jaro-Winkler | US-031 | 10h | Backend |
| T-0109 | Creare BullMQ job `batch-dedup` per scansione periodica tenant-wide | US-031 | 6h | Backend |
| T-0110 | Implementare TimelineService con aggregazione multi-entity (email, note, deal, task) | US-032 | 6h | Backend |
| T-0111 | Implementare endpoint WebSocket per timeline real-time updates | US-032 | 4h | Backend |
| T-0112 | Implementare SegmentService con engine di valutazione regole e caching risultati | US-033 | 8h | Backend |
| T-0113 | Creare BullMQ job `segment-refresh` per ricalcolo periodico (ogni 15 min) | US-033 | 4h | Backend |
| T-0114 | Implementare ImportService con parsing CSV (papaparse) e Excel (exceljs) | US-034 | 8h | Backend |
| T-0115 | Creare BullMQ job `contact-import` con progress tracking e report errori | US-034 | 6h | Backend |
| T-0116 | Implementare ExportService con generazione CSV, Excel e JSON in streaming | US-035 | 6h | Backend |
| T-0117 | Creare BullMQ job `contact-export` per export > 50K record | US-035 | 4h | Backend |
| T-0118 | Implementare MergeService con conflict resolution e undo capability (snapshot pre-merge) | US-036 | 8h | Backend |
| T-0119 | Definire schema Prisma per `Account` con campi standard e validazione P.IVA | US-037 | 4h | Backend |
| T-0120 | Implementare AccountsController e AccountsService (CRUD + changelog) | US-037 | 6h | Backend |
| T-0121 | Implementare relazione gerarchica account con closure table e check circolarità | US-038 | 6h | Backend |
| T-0122 | Implementare ContactAccountRole junction table e relativo service | US-039 | 4h | Backend |
| T-0123 | Implementare TagService con CRUD tag, associazione polimorfica e autocomplete endpoint | US-040 | 4h | Backend |

### Frontend Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0124 | Creare ContactForm component con validazione MUI + react-hook-form | US-028 | 6h | Frontend |
| T-0125 | Creare ContactList page con data table MUI DataGrid | US-028 | 4h | Frontend |
| T-0126 | Creare CustomFieldConfigurator component con drag-and-drop ordering | US-029 | 6h | Frontend |
| T-0127 | Integrare campi custom nel ContactForm con rendering dinamico per tipo | US-029 | 4h | Frontend |
| T-0128 | Creare SearchPanel component con filter builder (AND/OR gruppi) | US-030 | 8h | Frontend |
| T-0129 | Creare DuplicateReview component con tabella comparativa side-by-side | US-031 | 6h | Frontend |
| T-0130 | Creare ContactTimeline component con infinite scroll e filtri tipo | US-032 | 6h | Frontend |
| T-0131 | Creare SegmentBuilder component con rule editor visuale | US-033 | 8h | Frontend |
| T-0132 | Creare ImportWizard component (upload → mapping → preview → progress → report) | US-034 | 8h | Frontend |
| T-0133 | Creare ExportDialog component con selezione formato e colonne | US-035 | 4h | Frontend |
| T-0134 | Creare MergeWizard component con selezione campo per campo e undo UI | US-036 | 6h | Frontend |
| T-0135 | Creare AccountForm e AccountDetail page con sezione gerarchica | US-037, US-038 | 6h | Frontend |
| T-0136 | Creare AccountHierarchyTree component con vista ad albero espandibile | US-038 | 4h | Frontend |
| T-0137 | Creare ContactRoleAssignment component con search account + role picker | US-039 | 4h | Frontend |
| T-0138 | Creare TagInput component con autocomplete e bulk-tag dialog | US-040 | 4h | Frontend |
| T-0139 | Implementare vista switcher (Lista/Tabella/Kanban) con persistenza preferenza utente | US-041 | 6h | Frontend |
| T-0140 | Creare KanbanBoard component per contatti con drag-and-drop (dnd-kit) | US-041 | 6h | Frontend |

### QA Tasks

| Task ID | Descrizione | Story | Ore | Ruolo |
|---------|-------------|-------|-----|-------|
| T-0141 | Test E2E CRUD contatti: creazione, modifica, cancellazione, validazione campi | US-028 | 4h | QA |
| T-0142 | Test E2E campi custom: creazione, utilizzo nel form, eliminazione | US-029 | 3h | QA |
| T-0143 | Test E2E ricerca avanzata: filtri AND/OR, campi custom, performance < 300ms | US-030 | 4h | QA |
| T-0144 | Test fuzzy matching: edge cases Levenshtein, email match, bulk dedup report | US-031 | 4h | QA |
| T-0145 | Test timeline: ordinamento, infinite scroll, filtri tipo, WebSocket update | US-032 | 3h | QA |
| T-0146 | Test segmentazione: creazione regole, ricalcolo automatico, export segmento | US-033 | 3h | QA |
| T-0147 | Test import: CSV, Excel, file malformati, duplicati, > 10K record | US-034 | 4h | QA |
| T-0148 | Test export: CSV/Excel/JSON, filtri applicati, file > 50K, UTF-8 BOM | US-035 | 3h | QA |
| T-0149 | Test merge: selezione campi, undo, 3-way merge, re-associazione deal | US-036 | 4h | QA |
| T-0150 | Test account: CRUD, gerarchia, circolarità, metriche aggregate | US-037, US-038 | 4h | QA |
| T-0151 | Test associazione contatti-account: ruoli, multi-account, filtro globale | US-039 | 3h | QA |
| T-0152 | Test tag: autocomplete, bulk-tag, eliminazione globale, filtro | US-040 | 3h | QA |
| T-0153 | Test viste: switch lista/tabella/kanban, persistenza colonne, drag-and-drop | US-041 | 3h | QA |

**Totale ore stimate:** Backend ~140h | Frontend ~94h | QA ~45h | **Totale: ~279h**

---

## Technical Design Notes

### Elasticsearch Integration

- **Indice:** `crm_contacts_{tenantId}` — un indice per tenant per isolamento dati.
- **Mapping:** campi `name`, `email`, `company` come tipo `text` con analyzer `standard` + `edge_ngram` per autocomplete. Campi `city`, `tags` come `keyword` per filtri esatti.
- **Sync:** ogni operazione CRUD su Prisma emette un evento via `EventEmitter2` che il `ElasticsearchSyncService` intercetta e replica sull'indice ES. Retry con exponential backoff su failure.
- **Fallback:** se ES non è raggiungibile, la ricerca esegue fallback su query Prisma con `ILIKE` (più lento ma funzionante).

### Fuzzy Matching Algorithm

- **Fase 1 (blocking):** raggruppamento per primi 3 caratteri del cognome normalizzato + dominio email per ridurre le coppie da confrontare (O(n) → O(n/k)).
- **Fase 2 (scoring):** combinazione pesata di:
  - Jaro-Winkler su nome+cognome (peso 0.3)
  - Match esatto email (peso 0.4)
  - Match esatto telefono normalizzato (peso 0.2)
  - Match dominio email (peso 0.1)
- **Soglia default:** 75% per segnalazione duplicato, 95% per auto-merge suggerito.
- **Libreria:** `fuzzball` (wrapper JavaScript per fuzzywuzzy).

### Custom Field JSONB Strategy

- Tabella `CustomFieldDefinition`: `id`, `tenantId`, `entityType` (contact/account), `name`, `type` (text/number/date/select/checkbox), `options` (JSONB per select), `required`, `sortOrder`.
- I valori dei campi custom vengono salvati nella colonna JSONB `customFields` dell'entità (Contact/Account).
- **Validazione:** il backend valida ogni campo custom contro la sua definizione prima del salvataggio.
- **Indexing:** per campi custom frequentemente filtrati, si crea un indice GIN su `customFields` per query `@>` (containment).

### Account Hierarchy

- **Strategia:** Closure Table (`AccountClosure`: `ancestorId`, `descendantId`, `depth`) per query efficienti su tutti i discendenti e antenati.
- **Check circolarità:** prima di inserire una relazione, verificare che il `childId` non sia già antenato del `parentId` nella closure table.
- **Aggregazione:** query ricorsiva sulla closure table per sommare metriche (pipeline value, contatti) di tutti i discendenti.

---

## Rischi

| ID | Rischio | Probabilità | Impatto | P × I | Mitigazione |
|----|---------|-------------|---------|-------|-------------|
| R-01 | Elasticsearch non disponibile in ambiente di staging, blocca test ricerca avanzata | Alta (70%) | Alto | 🔴 | Implementare fallback su Prisma `ILIKE`; usare container Docker ES per staging |
| R-02 | Fuzzy matching con dataset > 100K contatti rallenta il batch job oltre i 30 minuti | Media (50%) | Medio | 🟡 | Applicare blocking strategy per ridurre coppie; impostare timeout job a 60 min con resume |
| R-03 | Import CSV con encoding non-UTF8 (es. Windows-1252) produce caratteri corrotti | Alta (70%) | Medio | 🟡 | Usare `chardet` per auto-detect encoding; offrire selettore encoding nel wizard |
| R-04 | Merge contatti con relazioni complesse (deal multi-contatto) causa inconsistenze FK | Media (40%) | Alto | 🟡 | Eseguire merge in transazione Prisma; validare integrità referenziale post-merge |
| R-05 | Custom fields JSONB senza schema validation porta a dati inconsistenti nel tempo | Media (50%) | Alto | 🟡 | Validazione strict lato backend per ogni write; migration script per cleanup periodico |
| R-06 | Gerarchia account con profondità > 5 livelli rallenta le query aggregate ricorsive | Bassa (20%) | Medio | 🟢 | Limite hard a 5 livelli; cache materialized aggregates con refresh ogni 15 min |

---

## Definition of Done

1. Tutti gli acceptance criteria delle user story sono verificati e superano test E2E
2. Coverage test unitari ≥ 80% per tutti i service backend
3. Nessun errore TypeScript (`npx tsc --noEmit` passa su backend e frontend)
4. Lint passa senza warning (`npm run lint:win`)
5. Tutte le query includono filtro `tenantId` (multi-tenant compliance)
6. API endpoints documentati in Swagger con schema request/response
7. Traduzioni complete in `en.ts` e `it.ts` per tutti i nuovi componenti
8. Performance: ricerca contatti < 300ms per dataset ≤ 50K record
9. Import/Export gestisce file fino a 100K record senza timeout
10. Soft-delete implementato per contatti e account (no hard delete)
11. Changelog/audit log per tutte le operazioni di modifica su contatti e account
12. Responsive: tutte le viste funzionano su viewport ≥ 768px
13. Nessun dato sensibile (password, token) esposto nelle API response
14. Code review approvata da almeno 1 sviluppatore senior