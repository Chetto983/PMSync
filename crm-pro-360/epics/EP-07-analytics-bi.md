# Epic EP-07: Analytics & Business Intelligence

| Campo            | Valore                                                    |
| ---------------- | --------------------------------------------------------- |
| **Epic ID**      | EP-07                                                     |
| **Titolo**       | Analytics & Business Intelligence                         |
| **Fase**         | 3 (Sprint 15-16)                                          |
| **SP Stimati**   | ~89                                                       |
| **Personas**     | Marco (Sales Director), Laura (Marketing Manager), Chiara (CTO) |
| **Dipendenze**   | EP-01 (Data Model), EP-03 (Pipeline), EP-05 (Permissions) |

---

## Overview

Piattaforma completa di analytics e business intelligence integrata nel CRM. Include un dashboard builder drag-and-drop, 50+ template predefiniti per ruolo, report builder con filtri avanzati, cross-filtering tra widget, drill-down multi-livello, scheduling report (email/Slack), forecasting base integrato, cohort analysis, funnel visualization, export in PDF/Excel/PPT ed embedded analytics per condivisione esterna sicura.

---

## Personas & Motivazioni

- **Marco (Sales Director):** Vuole executive dashboard real-time con KPI di vendita, pipeline e forecast. Necessita drill-down per rep e territorio.
- **Laura (Marketing Manager):** Necessita funnel visualization per campagne, cohort analysis per retention e report schedulati settimanali al team.
- **Chiara (CTO):** Richiede embedded analytics per clienti enterprise, governance sui dati esposti e performance accettabile anche con dataset grandi.

---

## User Stories

### US-078: Dashboard Builder Drag-and-Drop con Widget Configurabili

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-078                        |
| **SP**         | 13                            |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 15                            |
| **Dipendenze** | EP-01 Data Model              |

**Come** Marco (Sales Director),
**voglio** costruire dashboard personalizzate trascinando widget da una libreria,
**così che** possa monitorare i KPI rilevanti per il mio ruolo senza dipendere dal team tecnico.

**Acceptance Criteria:**

```gherkin
Given che Marco è nella sezione "Dashboard" e ha permessi di creazione
When clicca "Nuova Dashboard" e trascina un widget "Bar Chart" nell'area di lavoro
Then il widget viene posizionato nella griglia e mostra il pannello di configurazione

Given che un widget è posizionato nella griglia
When Marco configura data source, metriche, dimensioni e filtri nel pannello laterale
Then il widget renderizza i dati in tempo reale con la visualizzazione scelta

Given che Marco ha posizionato 6 widget nella dashboard
When ridimensiona un widget trascinando il bordo inferiore destro
Then la griglia si riorganizza automaticamente senza sovrapposizioni

Given che Marco ha completato la dashboard
When clicca "Salva" e assegna nome e descrizione
Then la dashboard viene salvata e appare nella lista "Le mie Dashboard"

Given che Marco tenta di aggiungere un widget con data source a cui non ha accesso
When il sistema valida i permessi
Then il widget mostra un messaggio "Dati non disponibili" senza esporre informazioni protette
```

---

### US-079: 50+ Template Dashboard Predefiniti per Ruolo

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-079                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 15                            |
| **Dipendenze** | US-078                        |

**Come** Laura (Marketing Manager),
**voglio** scegliere da una galleria di template dashboard già configurati per il mio ruolo,
**così che** possa iniziare ad analizzare i dati immediatamente senza configurazione manuale.

**Acceptance Criteria:**

```gherkin
Given che Laura accede alla sezione "Template Gallery"
When filtra per ruolo "Marketing"
Then vengono mostrati almeno 8 template specifici per marketing (funnel, campagne, ROI, attribution, ecc.)

Given che Laura seleziona il template "Marketing Campaign Performance"
When clicca "Usa Template"
Then viene creata una copia della dashboard nel suo workspace con dati reali pre-popolati

Given che il template è stato applicato
When Laura modifica un widget (es. cambia il periodo da 30 a 90 giorni)
Then la modifica viene salvata solo nella sua copia, il template originale resta invariato

Given che un admin crea un nuovo template custom
When lo pubblica nella gallery con tag "Sales" e "Executive"
Then il template appare nella gallery filtrato per quei tag

Given che il sistema ha 50+ template
When Laura cerca "retention" nella barra di ricerca della gallery
Then vengono mostrati solo i template che contengono metriche o widget relativi alla retention
```

---

### US-080: Report Builder con Filtri Avanzati e Aggregazioni

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-080                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 15                            |
| **Dipendenze** | EP-01 Data Model              |

**Come** Marco (Sales Director),
**voglio** costruire report tabulari con filtri multipli, raggruppamenti e aggregazioni,
**così che** possa analizzare i dati di vendita in modo granulare e condividere insight con il management.

**Acceptance Criteria:**

```gherkin
Given che Marco accede al Report Builder
When seleziona l'entità "Deal" e aggiunge colonne (nome, valore, stage, owner, data chiusura)
Then la tabella mostra i dati con le colonne selezionate e paginazione

Given che Marco ha un report con 10.000 righe
When aggiunge un filtro "Stage = Negotiation AND Valore > 50.000 AND Data Chiusura < 30 giorni"
Then i risultati vengono filtrati in < 2 secondi e il conteggio si aggiorna

Given che Marco applica raggruppamento per "Owner"
When seleziona aggregazione "SUM(Valore)" e "COUNT(Deal)"
Then ogni gruppo mostra il totale valore e il numero di deal per sales rep

Given che Marco ha costruito il report
When clicca "Salva Report" e assegna nome, descrizione e cartella
Then il report viene salvato e appare nella lista con timestamp di ultimo aggiornamento

Given che Marco condivide il report con Laura
When Laura apre il report condiviso
Then Laura vede gli stessi dati filtrati dai suoi permessi di accesso (tenant + ruolo)
```

---

### US-081: Cross-Filtering tra Widget nella Stessa Dashboard

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-081                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 15                            |
| **Dipendenze** | US-078                        |

**Come** Marco (Sales Director),
**voglio** cliccare su un segmento di un grafico e vedere gli altri widget della dashboard filtrarsi automaticamente,
**così che** possa esplorare i dati in modo interattivo senza dover ricostruire filtri manuali.

**Acceptance Criteria:**

```gherkin
Given che Marco ha una dashboard con un pie chart "Deal per Stage" e una tabella "Deal recenti"
When clicca sul segmento "Negotiation" del pie chart
Then la tabella si filtra mostrando solo i deal in stage "Negotiation" e gli altri widget collegati si aggiornano

Given che Marco ha applicato un cross-filter sul pie chart
When clicca nuovamente sullo stesso segmento
Then il filtro viene rimosso e tutti i widget tornano allo stato originale

Given che Marco ha 3 cross-filter attivi su widget diversi
When guarda la barra dei filtri attivi in alto alla dashboard
Then ogni filtro attivo è visibile come chip rimovibile con il valore selezionato

Given che un widget non condivide dimensioni comuni con il widget cliccato
When il cross-filter viene applicato
Then il widget non correlato rimane invariato e mostra un indicatore "Non filtrato"

Given che Marco applica un cross-filter su un dataset con 100.000 righe
When i widget collegati si aggiornano
Then il re-render completo avviene in < 500ms
```

---

### US-082: Drill-Down Multi-Livello su Grafici e Tabelle

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-082                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 15                            |
| **Dipendenze** | US-078, US-081                |

**Come** Marco (Sales Director),
**voglio** fare drill-down da una vista aggregata a dettagli sempre più granulari,
**così che** possa investigare anomalie nei dati senza uscire dalla dashboard.

**Acceptance Criteria:**

```gherkin
Given che Marco visualizza un bar chart "Revenue per Regione"
When clicca sulla barra "Nord Italia"
Then il grafico drilla down mostrando "Revenue per Provincia" filtrato per Nord Italia

Given che Marco è al livello "Provincia"
When clicca sulla barra "Milano"
Then il grafico drilla down mostrando "Revenue per Sales Rep" filtrato per Milano

Given che Marco è al terzo livello di drill-down
When clicca sul breadcrumb "Regione" nella navigation bar del widget
Then il grafico torna al livello regionale mantenendo eventuali filtri globali

Given che Marco è in drill-down su una tabella raggruppata
When espande il gruppo "Enterprise" > "Q1 2026"
Then le righe di dettaglio (singoli deal) appaiono sotto il gruppo con animazione smooth

Given che la gerarchia di drill-down ha 4+ livelli configurati
When Marco raggiunge l'ultimo livello
Then il pulsante drill-down è disabilitato e viene mostrato un tooltip "Livello massimo raggiunto"
```

---

### US-083: Scheduling Automatico Report via Email/Slack

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-083                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-080, EP-04 (Email)         |

**Come** Laura (Marketing Manager),
**voglio** schedulare l'invio automatico di report e dashboard snapshot via email o Slack,
**così che** il mio team riceva aggiornamenti periodici senza dover accedere al CRM.

**Acceptance Criteria:**

```gherkin
Given che Laura ha un report "Weekly Campaign Performance"
When configura scheduling con frequenza "Ogni lunedì alle 9:00" e destinatari email
Then il sistema crea un job schedulato e mostra conferma con prossima esecuzione prevista

Given che il job schedulato si attiva alle 9:00 di lunedì
When il sistema genera il report
Then un'email con il report in PDF allegato viene inviata ai destinatari configurati entro 5 minuti

Given che Laura configura invio su Slack
When seleziona canale "#marketing-reports" e formato "Summary + Link"
Then il messaggio Slack contiene un riassunto con KPI principali e link diretto al report nel CRM

Given che un report schedulato fallisce (es. timeout query)
When il sistema rileva l'errore
Then Laura riceve una notifica con dettaglio errore e il job viene ritentato dopo 15 minuti (max 3 retry)

Given che Laura vuole modificare la schedulazione
When accede a "Report schedulati" e cambia frequenza da settimanale a giornaliera
Then il job viene aggiornato e la prossima esecuzione riflette la nuova frequenza
```

---

### US-084: Forecasting Base (Trend Line, Moving Average)

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-084                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-078                        |

**Come** Marco (Sales Director),
**voglio** abilitare trend line e moving average sui grafici temporali,
**così che** possa visualizzare l'andamento atteso e identificare deviazioni dal trend.

**Acceptance Criteria:**

```gherkin
Given che Marco ha un line chart "Revenue mensile" con 12 mesi di dati storici
When attiva "Trend Line" dal menu del widget
Then una linea tratteggiata di regressione lineare viene sovrapposta al grafico con R² visualizzato

Given che Marco attiva "Moving Average" con finestra 3 mesi
When il grafico si aggiorna
Then una linea smoothed appare mostrando la media mobile a 3 periodi

Given che Marco attiva "Forecast" per i prossimi 3 mesi
When il sistema calcola la proiezione basata sui dati storici
Then l'area di forecast appare con banda di confidenza (80%) in colore semitrasparente

Given che i dati storici hanno meno di 6 punti
When Marco attiva il forecasting
Then il sistema mostra un warning "Dati insufficienti per forecast affidabile (minimo 6 periodi)"

Given che Marco passa il mouse sulla linea di forecast
When il tooltip appare
Then mostra valore previsto, intervallo di confidenza e % variazione rispetto allo stesso periodo anno precedente
```

---

### US-085: Cohort Analysis per Retention e Comportamento

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-085                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-078, EP-01 Data Model      |

**Come** Laura (Marketing Manager),
**voglio** visualizzare cohort analysis basata su data di acquisizione dei clienti,
**così che** possa misurare la retention nel tempo e identificare i segmenti più performanti.

**Acceptance Criteria:**

```gherkin
Given che Laura accede al widget "Cohort Analysis"
When seleziona dimensione "Mese di acquisizione" e metrica "Retention Rate"
Then viene renderizzata una heatmap triangolare con le coorti sulle righe e i periodi sulle colonne

Given che la heatmap è visualizzata
When Laura passa il mouse sulla cella "Coorte Gennaio, Mese 3"
Then il tooltip mostra: retention % assoluta, numero clienti attivi, variazione vs coorte precedente

Given che Laura vuole confrontare coorti per canale di acquisizione
When filtra per "Canale = Organic" e poi per "Canale = Paid"
Then le due heatmap possono essere visualizzate side-by-side per confronto diretto

Given che Laura cambia metrica da "Retention Rate" a "Revenue per Cohort"
When la heatmap si aggiorna
Then i valori nelle celle mostrano il revenue cumulativo con color scale (verde = alto, rosso = basso)

Given che una coorte ha meno di 10 clienti
When la heatmap la visualizza
Then la cella mostra un asterisco (*) con tooltip "Campione statisticamente non significativo"
```

---

### US-086: Funnel Visualization per Pipeline e Marketing

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-086                        |
| **SP**         | 5                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 16                            |
| **Dipendenze** | US-078, EP-03 Pipeline        |

**Come** Marco (Sales Director),
**voglio** visualizzare la pipeline come funnel con tassi di conversione tra stage,
**così che** possa identificare i colli di bottiglia nel processo di vendita.

**Acceptance Criteria:**

```gherkin
Given che Marco seleziona il widget "Sales Funnel"
When configura la pipeline "Enterprise Sales" come data source
Then il funnel mostra ogni stage come segmento con larghezza proporzionale al numero di deal

Given che il funnel è renderizzato
When Marco guarda le etichette tra gli stage
Then ogni transizione mostra: tasso di conversione %, numero deal persi, tempo medio nello stage

Given che Marco clicca sullo stage "Proposal Sent"
When il pannello di dettaglio si apre
Then mostra la lista dei deal in quello stage con valore, owner e giorni nello stage corrente

Given che Laura configura un funnel marketing "Lead > MQL > SQL > Opportunity > Won"
When i dati vengono caricati
Then ogni stage mostra il volume e il tasso di conversione cumulativo dall'inizio del funnel

Given che Marco confronta il funnel Q1 vs Q2
When attiva la vista "Confronto Periodo"
Then due funnel appaiono affiancati con delta % evidenziati in verde (miglioramento) o rosso (peggioramento)
```

---

### US-087: Export Dashboard/Report in PDF, Excel, PPT

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-087                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-078, US-080                |

**Come** Marco (Sales Director),
**voglio** esportare dashboard e report in PDF, Excel e PowerPoint,
**così che** possa condividerli con stakeholder esterni che non hanno accesso al CRM.

**Acceptance Criteria:**

```gherkin
Given che Marco ha una dashboard aperta
When clicca "Esporta" e seleziona "PDF"
Then il sistema genera un PDF con layout fedele alla dashboard, una pagina per sezione, con header e timestamp

Given che Marco esporta in Excel
When il file viene generato
Then ogni widget tabellare diventa un foglio Excel con dati raw, formule di aggregazione mantenute e formattazione condizionale

Given che Marco esporta in PowerPoint
When il file viene generato
Then ogni widget diventa una slide con grafico nativo PPT (non immagine) editabile dal destinatario

Given che la dashboard contiene 20 widget e il dataset è di 50.000 righe
When Marco avvia l'export PDF
Then il sistema mostra una progress bar e il download inizia entro 30 secondi

Given che un widget contiene dati che Marco non ha permesso di esportare
When il PDF viene generato
Then il widget mostra "[Dati riservati]" al posto dei valori, e un footer spiega la restrizione
```

---

### US-088: Embedded Analytics con Link Condivisibile

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-088                        |
| **SP**         | 8                             |
| **Priorità**   | 🟢 Bassa                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-078, EP-05 Permissions     |

**Come** Chiara (CTO),
**voglio** generare link embeddabili per dashboard specifiche con controllo accesso granulare,
**così che** i clienti enterprise possano visualizzare analytics nel loro portale senza accesso al CRM.

**Acceptance Criteria:**

```gherkin
Given che Chiara ha una dashboard "Client Portal Analytics"
When clicca "Genera Link Embed" e configura permessi (sola lettura, scadenza 30 giorni, IP whitelist)
Then il sistema genera un URL firmato con token JWT e un codice iframe copiabile

Given che un utente esterno accede al link embed
When la pagina si carica
Then la dashboard è visualizzata in modalità read-only senza header CRM, con branding personalizzabile

Given che il link embed ha scadenza configurata a 30 giorni
When un utente accede dopo 31 giorni
Then viene mostrata una pagina "Link scaduto - Contatta l'amministratore"

Given che Chiara vuole revocare un link embed attivo
When accede alla gestione link e clicca "Revoca"
Then il link diventa immediatamente inaccessibile e tutti gli iframe attivi mostrano "Accesso revocato"

Given che il link embed è aperto da un IP non nella whitelist
When il server valida la richiesta
Then restituisce 403 Forbidden con messaggio "Accesso non autorizzato dalla tua posizione"
```

---

### US-089: KPI Cards Real-Time per Executive Dashboard

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-089                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 15                            |
| **Dipendenze** | US-078, EP-01 Data Model      |

**Come** Marco (Sales Director),
**voglio** KPI cards aggiornate in tempo reale sulla mia executive dashboard,
**così che** possa monitorare le metriche critiche senza refresh manuale.

**Acceptance Criteria:**

```gherkin
Given che Marco apre la executive dashboard
When le KPI cards si caricano
Then ogni card mostra: valore attuale, variazione % vs periodo precedente (con freccia e colore), sparkline trend

Given che un nuovo deal viene chiuso da un sales rep
When il dato viene persistito nel database
Then la KPI card "Revenue MTD" si aggiorna entro 10 secondi via WebSocket senza refresh pagina

Given che Marco configura una KPI card personalizzata
When imposta metrica "Win Rate", periodo "Q1 2026", e target "35%"
Then la card mostra il valore attuale con progress bar verso il target e colore (verde se > 90% target, giallo 70-90%, rosso < 70%)

Given che il WebSocket si disconnette
When il sistema rileva la disconnessione
Then le KPI cards mostrano un badge "Aggiornamento sospeso" e tentano riconnessione ogni 5 secondi

Given che Marco ha 12 KPI cards nella dashboard
When la pagina si carica su un dispositivo mobile
Then le cards si riorganizzano in layout responsive (2 colonne su tablet, 1 su mobile) senza perdita di informazioni
```

---

## Task Breakdown

### Infrastruttura & Query Engine

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0500  | Progettare schema analytics query engine (query builder, aggregazioni, filtri) | 6   | Backend  | US-080    |
| T-0501  | Implementare query engine con supporto multi-entity join | 12  | Backend  | US-080    |
| T-0502  | Aggiungere caching layer per query analytics (Redis, TTL configurabile) | 6   | Backend  | US-080    |
| T-0503  | Implementare query optimization: indici materializzati per metriche frequenti | 8   | Backend  | US-080    |
| T-0504  | Creare endpoint REST `/analytics/query` con validazione input e rate limiting | 4   | Backend  | US-080    |
| T-0505  | Implementare WebSocket channel per real-time KPI updates | 6   | Backend  | US-089    |

### Dashboard Builder

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0506  | Implementare grid layout engine con drag-and-drop (react-grid-layout) | 10  | Frontend | US-078    |
| T-0507  | Creare pannello widget library con categorie e ricerca   | 6   | Frontend | US-078    |
| T-0508  | Implementare widget configuration panel (data source, metriche, dimensioni) | 8   | Frontend | US-078    |
| T-0509  | Creare componente widget resize con snap-to-grid         | 4   | Frontend | US-078    |
| T-0510  | Implementare salvataggio/caricamento layout dashboard (API + state) | 6   | Frontend | US-078    |
| T-0511  | Creare endpoint CRUD `/dashboards` con permessi tenant   | 6   | Backend  | US-078    |
| T-0512  | Implementare dashboard versioning (auto-save ogni 30s)   | 4   | Backend  | US-078    |

### Visualizzazioni & Chart

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0513  | Integrare Recharts con wrapper components (BarChart, LineChart, PieChart, AreaChart) | 8   | Frontend | US-078    |
| T-0514  | Implementare KPI card component con sparkline, trend arrow e progress bar | 6   | Frontend | US-089    |
| T-0515  | Creare funnel chart component con conversion rate labels | 6   | Frontend | US-086    |
| T-0516  | Implementare cohort heatmap component con color scale e tooltips | 8   | Frontend | US-085    |
| T-0517  | Creare tabella report con sorting, filtering inline e paginazione server-side | 8   | Frontend | US-080    |

### Interattività

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0518  | Implementare cross-filter engine (pub/sub tra widget con shared filter state) | 8   | Frontend | US-081    |
| T-0519  | Creare filter bar component con chip rimovibili          | 4   | Frontend | US-081    |
| T-0520  | Implementare drill-down navigation con breadcrumb e stato multi-livello | 8   | Frontend | US-082    |
| T-0521  | Creare drill-down hierarchy configuration nel widget settings | 4   | Frontend | US-082    |

### Template Gallery

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0522  | Progettare e creare 50+ template JSON (schema, layout, query) suddivisi per ruolo | 16  | Frontend | US-079    |
| T-0523  | Implementare template gallery UI con filtri per ruolo, ricerca e preview | 6   | Frontend | US-079    |
| T-0524  | Creare endpoint `/dashboard-templates` con CRUD per admin e read per utenti | 4   | Backend  | US-079    |

### Forecasting & Analytics Avanzati

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0525  | Implementare modulo forecasting: regressione lineare, moving average, banda di confidenza | 8   | Backend  | US-084    |
| T-0526  | Creare forecast overlay component per line chart con area semitrasparente | 4   | Frontend | US-084    |
| T-0527  | Implementare cohort query builder con supporto multi-dimensione e multi-metrica | 8   | Backend  | US-085    |

### Scheduling & Export

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0528  | Implementare job scheduler per report (BullMQ cron jobs con retry) | 8   | Backend  | US-083    |
| T-0529  | Creare servizio generazione PDF da dashboard (Puppeteer/Playwright headless) | 8   | Backend  | US-087    |
| T-0530  | Implementare export Excel con multi-sheet e formattazione (ExcelJS) | 6   | Backend  | US-087    |
| T-0531  | Implementare export PowerPoint con grafici nativi (PptxGenJS) | 6   | Backend  | US-087    |
| T-0532  | Creare UI scheduling: configurazione frequenza, destinatari, formato | 6   | Frontend | US-083    |
| T-0533  | Integrare invio report via Slack (Slack Web API, channel picker) | 4   | Backend  | US-083    |

### Embedded Analytics

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0534  | Implementare generazione token JWT per embed con scadenza e IP whitelist | 6   | Backend  | US-088    |
| T-0535  | Creare viewer embed read-only con branding personalizzabile | 6   | Frontend | US-088    |
| T-0536  | Implementare gestione link embed (lista, revoca, rigenera) | 4   | Backend  | US-088    |

### QA & Performance

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0537  | Scrivere test E2E per dashboard builder (drag, resize, save, load) | 8   | QA       | US-078    |
| T-0538  | Scrivere test E2E per cross-filter e drill-down          | 6   | QA       | US-081,082|
| T-0539  | Performance testing: query engine con dataset 1M+ righe  | 6   | QA       | US-080    |
| T-0540  | Scrivere test integrazione per scheduling e export       | 6   | QA       | US-083,087|
| T-0541  | Security audit: embedded analytics token, permessi export, data leakage | 4   | QA       | US-088    |

### DevOps

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0542  | Configurare Redis caching dedicato per analytics queries | 3   | DevOps   | US-080    |
| T-0543  | Setup monitoring dashboard per query performance e cache hit rate | 3   | DevOps   | US-080    |
| T-0544  | Configurare Puppeteer/Playwright in container per PDF generation | 4   | DevOps   | US-087    |

---

## Technical Design Notes

### Chart Library

- **Recharts** come libreria primaria per grafici standard (bar, line, pie, area, scatter).
- **D3.js** diretto solo per visualizzazioni custom non coperte da Recharts (cohort heatmap, funnel avanzato).
- Tutti i chart wrappati in componenti React con interfaccia uniforme (`DataVisualization<T>`).

### Query Engine

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Widget      │────▶│ Query Engine  │────▶│  PostgreSQL  │
│  Config      │     │ (NestJS)      │     │  + Indices   │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────▼───────┐
                    │  Redis Cache  │
                    │  (TTL: 5min)  │
                    └──────────────┘
```

- Query engine accetta una struttura dichiarativa: `{ entity, columns, filters, groupBy, aggregations, orderBy, limit }`.
- Traduzione in Prisma query con validazione tenantId obbligatorio.
- Cache key basata su hash della query + tenantId. TTL configurabile per tipo di metrica (real-time: 30s, standard: 5min, storico: 30min).

### Caching Strategy

| Tipo Dato         | TTL Cache | Invalidazione          |
| ------------------ | --------- | ---------------------- |
| KPI real-time      | 30s       | WebSocket push         |
| Report standard    | 5 min     | On-demand + TTL        |
| Dati storici       | 30 min    | Solo TTL               |
| Template gallery   | 24h       | Admin action           |
| Cohort/Forecast    | 15 min    | Solo TTL               |

### Dashboard Layout Persistence

- Layout salvato come JSON: `{ widgets: [{ id, type, position: {x,y,w,h}, config: {...} }] }`.
- Auto-save ogni 30 secondi con debounce.
- Versioning con soft-delete per undo (ultime 10 versioni).

---

## Rischi

| ID    | Rischio                                                   | Probabilità | Impatto | Mitigazione                                                |
| ----- | --------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------- |
| R-071 | Query analytics lente su dataset grandi (>1M righe)       | Alta        | Alto    | Indici materializzati, pre-aggregazione notturna, query timeout 30s |
| R-072 | Drag-and-drop non fluido su dispositivi touch/mobile      | Media       | Medio   | Fallback a UI form-based su mobile, test su dispositivi reali |
| R-073 | Export PDF/PPT lento per dashboard con molti widget        | Media       | Medio   | Generazione asincrona con notifica, limite 30 widget per export |
| R-074 | Embedded analytics espone dati sensibili                   | Bassa       | Alto    | Token JWT con scadenza breve, IP whitelist, audit log accessi |
| R-075 | Template predefiniti non coprono le esigenze reali         | Media       | Basso   | Beta testing con 5 utenti pilota, iterazione rapida sui template |
| R-076 | WebSocket instabile causa KPI cards non aggiornate         | Media       | Medio   | Reconnect automatico con backoff, fallback polling ogni 30s |
| R-077 | Costi Redis elevati per cache analytics ad alto volume     | Bassa       | Medio   | Monitoraggio hit rate, eviction policy LRU, TTL aggressivi per dati non critici |

---

## Definition of Done (DoD)

- [ ] Tutti i 12 acceptance criteria delle user story passano in ambiente staging
- [ ] Dashboard builder funziona con almeno 15 widget simultanei senza degrado performance
- [ ] Query engine risponde in < 2s per dataset fino a 500.000 righe
- [ ] Cross-filtering aggiorna tutti i widget collegati in < 500ms
- [ ] Drill-down supporta almeno 4 livelli di profondità
- [ ] 50+ template pubblicati e validati con dati reali per ogni ruolo
- [ ] Export PDF/Excel/PPT genera file validi e apribili senza errori
- [ ] Scheduling invia report con successo via email e Slack
- [ ] Embedded analytics accessibile solo con token valido, non scaduto e da IP autorizzato
- [ ] KPI cards si aggiornano in real-time entro 10 secondi dall'evento
- [ ] Test E2E copertura > 80% per dashboard builder e interattività
- [ ] Performance test superato con dataset 1M+ righe
- [ ] Security review completata per embedded analytics e export
- [ ] Documentazione API per query engine e endpoint analytics pubblicata
- [ ] Zero vulnerabilità critiche o alte nel security scan
