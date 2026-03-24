# Epic EP-03R: Contacts & Accounts — Gap Completion

## Metadata

| Campo          | Valore                                    |
| -------------- | ----------------------------------------- |
| **Epic ID**    | EP-03R                                    |
| **Fase**       | 1 — Sprint 1-2 (Accounts), Sprint 7 (Import/Export/Segmentation) |
| **SP Totali**  | ~65                                       |
| **Owner**      | Solo dev                                  |
| **Dipendenze** | PMSync Contact module (esistente)         |
| **Stato**      | Draft                                     |

---

## Overview

Completamento dei gap nel modulo contatti esistente di PMSync. Il modulo contatti copre già il CRUD base, deduplicazione fuzzy, ricerca e relationship scoring. Questo epic aggiunge il concetto di **Account** (azienda) con gerarchia holding/filiali, l'associazione contatti-account con ruoli, import/export massivo, campi custom configurabili, segmentazione dinamica e bulk actions.

---

## Cosa esiste già in PMSync

| Componente                  | Path                                              | Note                              |
| --------------------------- | ------------------------------------------------- | --------------------------------- |
| Contact CRUD (backend)      | `backend/src/modules/contacts/`                   | Controller + Service + Prisma     |
| Contact deduplication       | `backend/src/modules/contacts/`                   | Fuzzy matching su nome/email      |
| Contact search              | `backend/src/modules/contacts/`                   | Ricerca base per campo            |
| Relationship scoring        | `backend/src/modules/contacts/`                   | Score calcolato su interazioni    |
| Contact list UI             | `frontend/src/components/contacts/`               | Tabella MUI DataGrid              |
| Contact detail UI           | `frontend/src/components/contacts/`               | Dialog/page con dati contatto     |
| TanStack Query hooks        | `frontend/hooks/queries/`                          | Pattern queryOptions riutilizzabile |
| Tenant guard (backend)      | `backend/src/common/guards/`                      | Ogni query filtrata per tenantId  |
| BullMQ setup                | `backend/src/modules/queues/`                     | Redis queues per job asincroni    |

## Cosa manca (scope di questo epic)

- Modello Account con gerarchia parent-child
- Associazione contatto-account con ruolo
- Import/export massivo CSV/Excel
- Campi custom configurabili per entità
- Segmentazione dinamica con regole
- Framework bulk actions
- UI Account (list + detail)

---

## User Stories

### US-R001: CRUD Account con campi standard

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 1 | **Dipendenze:** Nessuna

**Come** utente CRM, **voglio** creare, leggere, aggiornare e cancellare account aziendali con campi standard, **in modo da** organizzare i contatti per azienda di appartenenza.

**Acceptance Criteria:**

```gherkin
Given l'utente è autenticato e ha accesso al modulo CRM
When crea un nuovo account compilando nome, dominio, settore (industry), dimensione (size) e fatturato (revenue)
Then l'account viene salvato nel database con tenantId dell'utente corrente
  And l'account appare nella lista account
  And i campi obbligatori sono: nome (unico per tenant)

Given un account esistente
When l'utente modifica un campo qualsiasi
Then le modifiche vengono salvate e il timestamp updatedAt aggiornato

Given un account senza contatti associati né deal attivi
When l'utente lo elimina (soft delete)
Then l'account viene marcato come deleted e non appare più nelle liste
  And un account con contatti associati non può essere eliminato senza conferma esplicita
```

---

### US-R002: Gerarchia account parent-child

**Priorità:** 🟡 Media | **SP:** 5 | **Sprint:** 2 | **Dipendenze:** US-R001

**Come** utente CRM, **voglio** definire relazioni gerarchiche tra account (holding → filiali), **in modo da** visualizzare la struttura societaria dei clienti.

**Acceptance Criteria:**

```gherkin
Given un account esistente
When l'utente imposta un parentAccountId valido
Then l'account diventa figlio dell'account padre
  And la relazione è visibile nel detail view dell'account padre

Given un account padre con filiali
When l'utente visualizza il detail dell'account padre
Then vede la lista delle filiali con nome, settore e numero contatti

Given un tentativo di creare un ciclo (A padre di B, B padre di A)
Then il sistema rifiuta l'operazione con errore 400
  And la profondità massima della gerarchia è 5 livelli

Given un account padre
When l'utente lo elimina
Then il sistema chiede se spostare le filiali a livello root o bloccare l'operazione
```

---

### US-R003: Associazione contatto-account con ruolo

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 1 | **Dipendenze:** US-R001

**Come** utente CRM, **voglio** associare contatti ad account specificando il ruolo (Decision Maker, Influencer, User, Technical, Champion, Gatekeeper), **in modo da** mappare l'organigramma decisionale del cliente.

**Acceptance Criteria:**

```gherkin
Given un contatto e un account esistenti nello stesso tenant
When l'utente crea un'associazione specificando il ruolo
Then il contatto appare nella lista contatti dell'account con il ruolo indicato
  And l'account appare nel detail del contatto

Given un contatto già associato a un account
When l'utente modifica il ruolo
Then il ruolo viene aggiornato senza creare duplicati

Given un contatto
When l'utente lo associa a più account (es. consulente che lavora per più aziende)
Then tutte le associazioni sono visibili e gestibili indipendentemente
  And ogni associazione ha il proprio ruolo e flag isPrimary

Given l'utente cancella un'associazione
When conferma l'operazione
Then il contatto e l'account rimangono intatti, solo il legame viene rimosso
```

---

### US-R004: Account list view con filtri e ricerca

**Priorità:** 🔴 Alta | **SP:** 5 | **Sprint:** 2 | **Dipendenze:** US-R001

**Come** utente CRM, **voglio** visualizzare la lista account con filtri per settore, dimensione, fatturato e ricerca full-text, **in modo da** trovare rapidamente gli account di interesse.

**Acceptance Criteria:**

```gherkin
Given l'utente accede alla pagina account
When la pagina si carica
Then vede una MUI DataGrid con colonne: nome, dominio, settore, dimensione, fatturato, contatti count, createdAt
  And la tabella supporta ordinamento su tutte le colonne
  And la paginazione server-side è attiva con 25 righe per default

Given l'utente inserisce testo nella barra di ricerca
When digita almeno 2 caratteri
Then la lista si filtra per nome o dominio (debounce 300ms)

Given l'utente seleziona filtri dal pannello laterale
When applica filtro per settore = "Technology" e dimensione >= 50
Then la lista mostra solo gli account che soddisfano tutti i filtri
  And i filtri attivi sono visibili come chip rimovibili
```

---

### US-R005: Account detail view con contatti associati e timeline

**Priorità:** 🔴 Alta | **SP:** 8 | **Sprint:** 2 | **Dipendenze:** US-R001, US-R003

**Come** utente CRM, **voglio** una vista dettaglio account con informazioni complete, contatti associati e timeline delle attività, **in modo da** avere una visione a 360 gradi dell'account.

**Acceptance Criteria:**

```gherkin
Given l'utente clicca su un account nella lista
When si apre la pagina detail
Then vede le sezioni:
  - Header con nome, dominio, settore, badge dimensione
  - Tab "Contatti" con lista contatti associati e relativi ruoli
  - Tab "Timeline" con attività recenti (email, note, deal changes)
  - Tab "Filiali" (se account padre) con lista account figli
  - Sidebar con campi informativi (fatturato, data creazione, owner)

Given la tab contatti del detail view
When l'utente clicca "Aggiungi contatto"
Then si apre un dialog per cercare un contatto esistente o crearne uno nuovo
  And deve specificare il ruolo nell'associazione

Given il detail view
When l'utente clicca "Modifica"
Then i campi diventano editabili inline
  And il salvataggio avviene con PUT all'API
```

---

### US-R006: Import massivo contatti da CSV/Excel

**Priorità:** 🟡 Media | **SP:** 10 | **Sprint:** 7 | **Dipendenze:** US-R001, US-R003

**Come** utente CRM, **voglio** importare contatti e account da file CSV o Excel con mapping dei campi, **in modo da** migrare dati da altri sistemi senza inserimento manuale.

**Acceptance Criteria:**

```gherkin
Given l'utente carica un file CSV o Excel (.xlsx) con max 10.000 righe
When seleziona il tipo di import (contatti, account, o contatti+account)
Then il sistema mostra un'anteprima delle prime 5 righe
  And propone un mapping automatico header → campi CRM
  And l'utente può correggere il mapping manualmente

Given il mapping è confermato
When l'utente avvia l'import
Then il job viene accodato in BullMQ
  And l'utente vede una progress bar con stato (pending, processing, completed, failed)
  And i duplicati vengono rilevati (fuzzy match su email/nome) e l'utente sceglie: skip, update, create duplicate

Given l'import è completato
When l'utente visualizza il report
Then vede: righe importate, righe saltate, righe con errore e dettaglio errori
  And può scaricare un file CSV con le sole righe fallite per correzione e re-import

Given un file con formato non valido o colonne mancanti obbligatorie
When l'utente tenta l'import
Then il sistema rifiuta con messaggio di errore chiaro prima di accodare il job
```

---

### US-R007: Export contatti/account in CSV/Excel

**Priorità:** 🟡 Media | **SP:** 5 | **Sprint:** 7 | **Dipendenze:** US-R001

**Come** utente CRM, **voglio** esportare la lista contatti o account filtrata in formato CSV o Excel, **in modo da** condividere dati con colleghi o importarli in altri sistemi.

**Acceptance Criteria:**

```gherkin
Given l'utente è nella lista contatti o account con filtri attivi
When clicca "Esporta" e sceglie il formato (CSV o XLSX)
Then il sistema genera il file con le colonne visibili nella tabella
  And applica gli stessi filtri attivi nella vista corrente
  And il download parte automaticamente nel browser

Given più di 5.000 righe da esportare
When l'utente avvia l'export
Then il job viene accodato in BullMQ
  And l'utente riceve una notifica quando il file è pronto per il download
  And il file è disponibile per 24 ore

Given l'export include campi custom
When il file viene generato
Then i campi custom sono inclusi come colonne aggiuntive con header = nome campo
```

---

### US-R008: Campi custom configurabili

**Priorità:** 🟡 Media | **SP:** 8 | **Sprint:** 7 | **Dipendenze:** US-R001

**Come** admin del tenant, **voglio** definire campi personalizzati per contatti e account (text, number, date, select, multi-select), **in modo da** adattare il CRM alle esigenze specifiche del business senza modifiche al codice.

**Acceptance Criteria:**

```gherkin
Given l'utente con ruolo admin accede alle impostazioni CRM
When crea un nuovo campo custom specificando: nome, tipo, entità (contact/account), obbligatorio (sì/no), opzioni (per select/multi-select)
Then il campo appare nei form di creazione/modifica dell'entità scelta
  And il campo è filtrabile nella lista
  And il campo è esportabile

Given un campo custom di tipo select con opzioni ["Hot", "Warm", "Cold"]
When l'utente compila il campo su un contatto
Then può selezionare solo tra le opzioni definite
  And il valore viene salvato in CustomFieldValue con riferimento a CustomFieldDefinition

Given un campo custom obbligatorio
When l'utente tenta di salvare un contatto/account senza compilarlo
Then la validazione frontend blocca il salvataggio con messaggio di errore

Given l'admin elimina un campo custom
When conferma l'operazione
Then il campo e tutti i valori associati vengono soft-deleted
  And i dati storici rimangono accessibili via API per reporting
```

---

### US-R009: Segmentazione dinamica con regole

**Priorità:** 🟢 Bassa | **SP:** 5 | **Sprint:** 7 | **Dipendenze:** US-R008

**Come** utente CRM, **voglio** creare segmenti dinamici di contatti/account basati su regole (campo, operatore, valore), **in modo da** targetizzare comunicazioni e analisi su gruppi specifici.

**Acceptance Criteria:**

```gherkin
Given l'utente accede alla sezione segmenti
When crea un nuovo segmento con regole:
  - industry = "Technology" AND size >= 100
  - OR customField("Lead Score") >= 80
Then il sistema calcola il conteggio dei record che soddisfano le regole
  And il segmento è accessibile come filtro predefinito nelle liste

Given un segmento salvato
When nuovi contatti/account vengono creati o modificati
Then l'appartenenza al segmento viene ricalcolata (lazy, alla prossima visualizzazione)

Given le regole di un segmento
When l'utente le modifica
Then il conteggio viene aggiornato in tempo reale nell'editor
  And i risultati si aggiornano alla prossima apertura del segmento

Given un segmento
When l'utente lo apre
Then vede la lista dei record che lo compongono come una vista filtrata standard
  And può applicare bulk actions sui risultati
```

---

### US-R010: Bulk actions su contatti/account

**Priorità:** 🟡 Media | **SP:** 3 | **Sprint:** 7 | **Dipendenze:** US-R001

**Come** utente CRM, **voglio** eseguire azioni massive su contatti/account selezionati (tag, assign, delete, export), **in modo da** gestire grandi volumi di dati senza operazioni manuali ripetitive.

**Acceptance Criteria:**

```gherkin
Given l'utente seleziona più record nella lista (checkbox)
When clicca il menu "Azioni bulk"
Then vede le opzioni: Aggiungi tag, Rimuovi tag, Assegna owner, Elimina, Esporta selezione

Given l'utente seleziona 50 contatti e sceglie "Aggiungi tag: VIP"
When conferma l'operazione
Then tutti i 50 contatti ricevono il tag "VIP"
  And un toast conferma "50 contatti aggiornati"

Given l'utente seleziona record e sceglie "Elimina"
When conferma con dialog di conferma che mostra il conteggio esatto
Then i record vengono soft-deleted
  And un toast conferma con opzione "Annulla" per 10 secondi (undo)

Given più di 200 record selezionati per un'azione bulk
When l'utente avvia l'azione
Then il job viene accodato in BullMQ
  And l'utente vede una notifica di progresso
```

---

## Task Breakdown

### Sprint 1 — Account Model & Base CRUD (US-R001, US-R003)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T01 | Prisma schema: modello `Account` (name, domain, industry, size, revenue, tenantId, parentAccountId, deletedAt) | US-R001 | 2h   |
| T02 | Prisma schema: modello `AccountContact` (accountId, contactId, role enum, isPrimary, tenantId) | US-R003 | 1.5h |
| T03 | Migration Prisma + seed dati demo                           | US-R001 | 1h   |
| T04 | NestJS module `backend/src/modules/crm/accounts/` — Controller, Service, DTOs (CreateAccountDto, UpdateAccountDto) | US-R001 | 4h   |
| T05 | Account Service: CRUD con tenant guard, soft delete, validazione nome univoco per tenant | US-R001 | 3h   |
| T06 | NestJS AccountContact endpoints: POST /accounts/:id/contacts, DELETE, PATCH role | US-R003 | 3h   |
| T07 | AccountContact Service: validazione ciclo, max associazioni, ruolo enum | US-R003 | 2h   |
| T08 | Unit test backend: Account CRUD + AccountContact            | US-R001/R003 | 3h   |
| T09 | Frontend: API module `frontend/lib/api/accounts.ts`         | US-R001 | 1.5h |
| T10 | Frontend: TanStack Query hooks `frontend/hooks/queries/use-accounts.ts` (useAccounts, useAccount, useAccountContacts) | US-R001 | 2h   |

**Subtotale Sprint 1:** 23h

### Sprint 2 — Gerarchia & UI Account (US-R002, US-R004, US-R005)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T11 | Account Service: logica gerarchia parent-child, validazione cicli, max depth 5 | US-R002 | 3h   |
| T12 | API endpoint GET /accounts/:id/children (ricorsivo con max depth) | US-R002 | 1.5h |
| T13 | Frontend: pagina `frontend/src/pages/dashboard/crm/accounts/index.tsx` — lista account con MUI DataGrid | US-R004 | 4h   |
| T14 | Frontend: pannello filtri laterale (industry, size, revenue range) + ricerca full-text | US-R004 | 3h   |
| T15 | Frontend: pagina `frontend/src/pages/dashboard/crm/accounts/[id].tsx` — detail view | US-R005 | 5h   |
| T16 | Frontend: tab "Contatti" nel detail con lista associazioni + dialog aggiungi contatto | US-R005 | 3h   |
| T17 | Frontend: tab "Timeline" nel detail con attività recenti    | US-R005 | 3h   |
| T18 | Frontend: tab "Filiali" nel detail con tree view (se parent) | US-R002 | 2h   |
| T19 | Traduzioni IT/EN per tutte le stringhe account              | US-R004/R005 | 1h   |
| T20 | Estendere Contact detail UI con sezione "Account associati" | US-R003 | 2h   |

**Subtotale Sprint 2:** 27.5h

### Sprint 7 — Import/Export, Custom Fields, Segmentazione, Bulk (US-R006-R010)

| #   | Task                                                        | Story   | Ore  |
| --- | ----------------------------------------------------------- | ------- | ---- |
| T21 | Backend: modulo `backend/src/modules/crm/import-export/` — ImportService con parsing CSV (`csv-parse`) e Excel (`xlsx`) | US-R006 | 4h   |
| T22 | Backend: BullMQ job `import-contacts` con progress tracking e dedup | US-R006 | 4h   |
| T23 | Backend: endpoint POST /crm/import (upload + mapping), GET /crm/import/:jobId (status) | US-R006 | 2h   |
| T24 | Frontend: dialog import multi-step (upload → anteprima → mapping → conferma → progress) | US-R006 | 5h   |
| T25 | Backend: ExportService con generazione CSV/XLSX, BullMQ per export > 5000 righe | US-R007 | 3h   |
| T26 | Frontend: bottone export nella toolbar lista con scelta formato | US-R007 | 1.5h |
| T27 | Prisma schema: `CustomFieldDefinition` (name, type enum, entityType, isRequired, options JSONB, tenantId) e `CustomFieldValue` (definitionId, entityId, entityType, value, tenantId) | US-R008 | 2h   |
| T28 | Backend: modulo `backend/src/modules/crm/custom-fields/` — CRUD definition + value get/set | US-R008 | 4h   |
| T29 | Frontend: settings page per gestione custom fields + render dinamico nei form contatto/account | US-R008 | 4h   |
| T30 | Prisma schema: `Segment` (name, entityType, tenantId) e `SegmentRule` (segmentId, field, operator, value, logicOp) | US-R009 | 1.5h |
| T31 | Backend: modulo `backend/src/modules/crm/segments/` — CRUD + query builder da regole | US-R009 | 4h   |
| T32 | Frontend: segment editor con regole drag-and-drop e conteggio live | US-R009 | 3h   |
| T33 | Backend: BulkActionService con supporto tag/assign/delete, BullMQ per > 200 record | US-R010 | 3h   |
| T34 | Frontend: toolbar bulk actions con dialog conferma, progress, undo | US-R010 | 2h   |
| T35 | Traduzioni IT/EN per import/export, custom fields, segmenti, bulk actions | tutti  | 1.5h |

**Subtotale Sprint 7:** 45h

**Totale ore stimate:** ~95.5h (~12 giorni lavorativi full-time)

---

## Technical Design Notes

### Nuovi modelli Prisma

```prisma
model Account {
  id              String           @id @default(uuid())
  tenantId        String
  name            String
  domain          String?
  industry        String?
  size            Int?             // numero dipendenti
  revenue         Decimal?         @db.Decimal(15, 2)
  parentAccountId String?
  parent          Account?         @relation("AccountHierarchy", fields: [parentAccountId], references: [id])
  children        Account[]        @relation("AccountHierarchy")
  contacts        AccountContact[]
  deletedAt       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([parentAccountId])
}

model AccountContact {
  id         String   @id @default(uuid())
  tenantId   String
  accountId  String
  contactId  String
  role       AccountContactRole
  isPrimary  Boolean  @default(false)
  account    Account  @relation(fields: [accountId], references: [id])
  contact    Contact  @relation(fields: [contactId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([accountId, contactId])
  @@index([tenantId])
  @@index([contactId])
}

enum AccountContactRole {
  DECISION_MAKER
  INFLUENCER
  USER
  TECHNICAL
  CHAMPION
  GATEKEEPER
  OTHER
}

model CustomFieldDefinition {
  id         String              @id @default(uuid())
  tenantId   String
  name       String
  type       CustomFieldType
  entityType CustomFieldEntity
  isRequired Boolean             @default(false)
  options    Json?               // per select/multi-select
  position   Int                 @default(0)
  deletedAt  DateTime?
  values     CustomFieldValue[]
  createdAt  DateTime            @default(now())

  @@unique([tenantId, entityType, name])
  @@index([tenantId, entityType])
}

enum CustomFieldType {
  TEXT
  NUMBER
  DATE
  SELECT
  MULTI_SELECT
}

enum CustomFieldEntity {
  CONTACT
  ACCOUNT
}

model CustomFieldValue {
  id           String                @id @default(uuid())
  tenantId     String
  definitionId String
  entityId     String
  entityType   CustomFieldEntity
  value        String                // serializzato come stringa
  definition   CustomFieldDefinition @relation(fields: [definitionId], references: [id])
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt

  @@unique([definitionId, entityId])
  @@index([tenantId, entityType, entityId])
}

model Segment {
  id         String        @id @default(uuid())
  tenantId   String
  name       String
  entityType CustomFieldEntity
  rules      SegmentRule[]
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
}

model SegmentRule {
  id        String  @id @default(uuid())
  segmentId String
  field     String  // nome campo (built-in o custom:fieldId)
  operator  String  // eq, neq, gt, gte, lt, lte, contains, in
  value     String  // valore serializzato
  logicOp   String  @default("AND") // AND, OR
  position  Int     @default(0)
  segment   Segment @relation(fields: [segmentId], references: [id], onDelete: Cascade)
}
```

### Nuovi moduli NestJS

| Modulo                                        | Responsabilità                              |
| --------------------------------------------- | ------------------------------------------- |
| `backend/src/modules/crm/accounts/`           | CRUD Account, gerarchia, associazioni       |
| `backend/src/modules/crm/custom-fields/`      | Definizioni e valori campi custom           |
| `backend/src/modules/crm/segments/`           | CRUD Segmenti, query builder                |
| `backend/src/modules/crm/import-export/`      | Import CSV/Excel, export, BullMQ jobs       |

### Frontend — Nuove pagine e componenti

| Path                                                      | Componente                          |
| --------------------------------------------------------- | ----------------------------------- |
| `frontend/src/pages/dashboard/crm/accounts/index.tsx`     | Account list con DataGrid + filtri  |
| `frontend/src/pages/dashboard/crm/accounts/[id].tsx`      | Account detail con tabs             |
| `frontend/src/components/crm/account-form.tsx`             | Form creazione/modifica account     |
| `frontend/src/components/crm/account-contact-dialog.tsx`   | Dialog associazione contatto        |
| `frontend/src/components/crm/import-dialog.tsx`            | Dialog import multi-step            |
| `frontend/src/components/crm/segment-editor.tsx`           | Editor regole segmentazione         |
| `frontend/src/components/crm/bulk-action-toolbar.tsx`      | Toolbar azioni massive              |
| `frontend/lib/api/accounts.ts`                             | API module account                  |
| `frontend/lib/api/custom-fields.ts`                        | API module custom fields            |
| `frontend/lib/api/segments.ts`                             | API module segmenti                 |
| `frontend/hooks/queries/use-accounts.ts`                   | TanStack Query hooks account        |
| `frontend/hooks/queries/use-custom-fields.ts`              | TanStack Query hooks custom fields  |

### Dipendenze npm da aggiungere

- **Backend:** `xlsx` (parsing Excel), `csv-parse` (parsing CSV), `csv-stringify` (generazione CSV)
- **Frontend:** nessuna nuova dipendenza (MUI DataGrid già presente)

---

## Rischi

| #   | Rischio                                                     | Probabilità | Impatto | Mitigazione                                                |
| --- | ----------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------- |
| R1  | **Performance import massivo:** file con 10.000+ righe possono saturare memoria e bloccare il processo Node | Media       | 🔴 Alto  | Streaming parsing con `csv-parse` (non caricare tutto in RAM). BullMQ con batch di 100 righe per job. Limite hard a 10.000 righe per file. |
| R2  | **Cicli nella gerarchia account:** un bug nella validazione potrebbe creare loop infiniti nelle query ricorsive | Bassa       | 🔴 Alto  | Validazione preventiva con CTE ricorsiva (max depth 5). Query ricorsive con LIMIT di sicurezza. Test dedicato per scenari ciclici. |
| R3  | **Custom fields query performance:** query su CustomFieldValue con JOIN dinamici possono degradare su volumi alti | Media       | 🟡 Medio | Indici su (definitionId, entityId). Segmenti con lazy evaluation (non ricalcolo in real-time). Limit di 20 custom fields per entità per tenant. |
| R4  | **Mapping import ambiguo:** header CSV non standard rendono il mapping automatico inaffidabile | Alta        | 🟡 Medio | Fuzzy matching su header → campo con score di confidenza. L'utente conferma sempre il mapping prima dell'import. Fallback a mapping manuale. |
| R5  | **Bulk delete accidentale:** un utente potrebbe selezionare e cancellare centinaia di record per errore | Bassa       | 🔴 Alto  | Soft delete obbligatorio. Dialog di conferma con conteggio esatto e campo di testo per conferma ("digita DELETE per confermare" sopra 50 record). Undo window di 10 secondi. |

---

## Definition of Done (DoD)

1. Tutti i test unitari backend passano (`npm run test` nel modulo)
2. Type-check backend e frontend senza errori (`npx tsc --noEmit`)
3. Lint pulito (`npm run lint:win`)
4. Ogni query Prisma include filtro `tenantId` — nessuna eccezione
5. Soft delete implementato per Account e CustomFieldDefinition
6. Validazione DTO con `class-validator` su tutti gli endpoint
7. Traduzioni IT e EN complete per tutte le stringhe UI
8. Loading state (Skeleton), error state (Alert), empty state per ogni componente
9. Import/export testato con file reali (CSV con 1.000 righe, Excel con 5.000 righe)
10. Gerarchia account: test per cicli, max depth, delete con filiali
11. Custom fields: test per tutti e 5 i tipi (text, number, date, select, multi-select)
12. Bulk actions: test per operazioni su > 200 record (BullMQ path)
13. Responsive: account list e detail funzionano su viewport 1024px+
14. API documentata in Swagger con decoratori `@ApiTags`, `@ApiOperation`, `@ApiResponse`
