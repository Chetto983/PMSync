# Epic EP-08: AI/ML Engine

| Campo            | Valore                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| **Epic ID**      | EP-08                                                                   |
| **Titolo**       | AI/ML Engine                                                            |
| **Fase**         | 2-3 (Sprint 13-14 setup + scoring, Sprint 15-16 modelli avanzati)       |
| **SP Stimati**   | ~110                                                                    |
| **Personas**     | Marco (Sales Director), Laura (Marketing Manager), Paolo (CS Lead), Chiara (CTO) |
| **Dipendenze**   | EP-01 (Data Model), EP-03 (Pipeline), EP-05 (Permissions), EP-07 (Analytics) |

---

## Overview

Motore AI/ML integrato nel CRM per lead scoring predittivo (50+ variabili), churn prediction con early warning system, next best action engine per sales rep, forecast intelligente con confidence intervals, email intelligence (sentiment analysis + entity extraction), conversation AI multilingua con NLU e accesso diretto ai dati CRM, data enrichment automatico da fonti esterne, model versioning con A/B testing, cost tracking per tenant e AI governance con explainability, bias detection e drift monitoring.

---

## Personas & Motivazioni

- **Marco (Sales Director):** Vuole lead scoring predittivo per prioritizzare il lavoro dei sales rep, next best action per guidare le attività quotidiane e forecast affidabili con confidence intervals per il board.
- **Laura (Marketing Manager):** Necessita email intelligence per analizzare sentiment delle campagne, entity extraction per arricchire i profili e churn prediction per attivare campagne di retention proattive.
- **Paolo (CS Lead):** Richiede churn early warning per intervento preventivo, conversation AI per risposte rapide ai clienti e NLU multilingua per gestire mercati IT/DE/FR.
- **Chiara (CTO):** Esige governance AI (bias, drift, accuracy), cost tracking granulare per tenant, model versioning con rollback e compliance con normative EU AI Act.

---

## User Stories

### US-090: Lead Scoring Predittivo con 50+ Variabili

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-090                        |
| **SP**         | 13                            |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 13                            |
| **Dipendenze** | EP-01 Data Model, EP-03 Pipeline |

**Come** Marco (Sales Director),
**voglio** che ogni lead riceva un punteggio predittivo calcolato su 50+ variabili comportamentali e demografiche,
**così che** i miei sales rep possano concentrarsi sui lead con maggiore probabilità di conversione.

**Acceptance Criteria:**

```gherkin
Given che un nuovo lead viene creato nel CRM con dati demografici (settore, dimensione azienda, ruolo)
When il sistema processa il lead attraverso il modello di scoring
Then un punteggio 0-100 viene assegnato entro 5 secondi e salvato nel profilo lead

Given che un lead compie un'azione (visita pricing page, apre email, scarica whitepaper)
When l'evento viene registrato
Then il punteggio viene ricalcolato incorporando il segnale comportamentale e il delta viene loggato

Given che il modello utilizza 50+ variabili
When l'admin accede alla configurazione del modello
Then ogni variabile è listata con peso relativo, categoria (demografica/comportamentale/firmografica) e flag attivo/disattivo

Given che un lead raggiunge score > 80
When il sistema valuta la soglia configurata
Then viene automaticamente creato un task per il sales rep assegnato con priorità alta e dettaglio "Hot Lead"

Given che il modello viene ricalcolato settimanalmente con nuovi dati
When il batch di re-scoring è completato
Then un report di distribuzione score (histogram) è disponibile con confronto vs settimana precedente
```

---

### US-091: Dashboard Lead Score con Explainability (Top Factors)

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-091                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 13                            |
| **Dipendenze** | US-090                        |

**Come** Marco (Sales Director),
**voglio** vedere una dashboard che spiega perché ogni lead ha ricevuto un determinato score,
**così che** i sales rep possano personalizzare l'approccio basandosi sui fattori più influenti.

**Acceptance Criteria:**

```gherkin
Given che Marco apre il profilo di un lead con score 85
When guarda la sezione "Score Breakdown"
Then vede i top 5 fattori positivi e top 3 fattori negativi con contributo percentuale (es. "Settore Tech: +12%", "Nessuna interazione 14gg: -8%")

Given che Marco accede alla dashboard "Lead Scoring Overview"
When la pagina si carica
Then vede: distribuzione score (histogram), trend score medio settimanale, top 10 lead per score, conversion rate per fascia di score

Given che Marco clicca su una fascia di score nell'histogram (es. 70-80)
When il drill-down si attiva
Then vede la lista dei lead in quella fascia con score, azienda, ultimo contatto e azione suggerita

Given che il modello ha bassa accuracy su un segmento specifico
When la dashboard mostra le performance per segmento
Then i segmenti con accuracy < 60% sono evidenziati in giallo con tooltip "Modello poco affidabile per questo segmento"

Given che Marco esporta la dashboard lead scoring
When seleziona formato PDF
Then il report include score breakdown, distribuzione, top factors e nota metodologica del modello
```

---

### US-092: Churn Prediction con Early Warning System

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-092                        |
| **SP**         | 13                            |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 14                            |
| **Dipendenze** | US-090, EP-01 Data Model      |

**Come** Paolo (CS Lead),
**voglio** che il sistema identifichi i clienti a rischio churn con almeno 30 giorni di anticipo,
**così che** il mio team possa intervenire proattivamente prima della cancellazione.

**Acceptance Criteria:**

```gherkin
Given che il modello di churn prediction è attivo
When un cliente mostra segnali di disengagement (calo utilizzo 40%, nessun login 14gg, ticket non risolti)
Then il sistema assegna un churn risk score (0-100) e lo aggiorna giornalmente

Given che un cliente supera la soglia churn risk > 70
When il sistema valuta le soglie configurate
Then viene generato un alert "Early Warning" visibile nella dashboard CS con dettaglio fattori di rischio

Given che Paolo riceve un early warning per il cliente "Acme Corp"
When apre il dettaglio dell'alert
Then vede: churn probability %, data stimata di churn, top 5 fattori di rischio, azioni suggerite (call, sconto, training)

Given che il team CS interviene su un cliente a rischio (registra attività "Retention Call")
When l'attività viene salvata
Then il sistema ricalcola il churn score incorporando l'intervento e mostra l'impatto stimato dell'azione

Given che il modello di churn ha 30 giorni di storico
When il sistema calcola le metriche di performance
Then la dashboard mostra: precision, recall, F1-score e lista dei "saves" (clienti a rischio recuperati)
```

---

### US-093: Next Best Action Engine per Sales Rep

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-093                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 14                            |
| **Dipendenze** | US-090, US-092                |

**Come** Marco (Sales Director),
**voglio** che ogni sales rep riceva suggerimenti giornalieri sulle azioni migliori da compiere per ogni deal,
**così che** il team ottimizzi il proprio tempo sulle attività a maggiore impatto.

**Acceptance Criteria:**

```gherkin
Given che un sales rep apre la sua homepage nel CRM
When la sezione "Azioni Suggerite" si carica
Then mostra una lista prioritizzata di max 10 azioni con: tipo (call, email, demo), deal/lead, reason, impatto stimato

Given che il sistema suggerisce "Invia follow-up a Acme Corp" con reason "Deal fermo da 7 giorni in Proposal"
When il sales rep clicca "Esegui"
Then si apre il composer email pre-compilato con template contestualizzato e il suggerimento si marca come "In corso"

Given che il sales rep ignora un suggerimento per 3 giorni consecutivi
When il sistema rivaluta la priorità
Then il suggerimento viene escalato con label "Urgente" o rimosso se non più rilevante (es. deal perso)

Given che il next best action engine genera suggerimenti
When il sistema valuta le azioni possibili
Then considera: lead score, deal stage duration, ultimo contatto, pattern di successo da deal simili chiusi

Given che Marco vuole vedere l'efficacia dei suggerimenti
When accede alla dashboard "NBA Performance"
Then vede: % suggerimenti accettati, conversion rate deal con/senza NBA, tempo medio risposta ai suggerimenti
```

---

### US-094: Forecast Intelligente con Confidence Intervals

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-094                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 14                            |
| **Dipendenze** | US-090, EP-07 (Analytics)     |

**Come** Marco (Sales Director),
**voglio** un forecast di revenue con intervalli di confidenza calcolati sui dati storici e pipeline attuale,
**così che** possa dare previsioni affidabili al board con margine di errore dichiarato.

**Acceptance Criteria:**

```gherkin
Given che Marco accede alla sezione "Forecast" con pipeline attiva e 12+ mesi di dati storici
When il modello di forecast si esegue
Then mostra: forecast best case, expected e worst case con banda di confidenza 80% e 95%

Given che il forecast è calcolato per Q2 2026
When Marco guarda il dettaglio
Then vede: contributo pipeline (deal pesati per probabilità), contributo storico (pattern stagionali), delta vs target assegnato

Given che un deal da 100K passa da "Proposal" a "Negotiation"
When il forecast viene ricalcolato
Then il valore expected si aggiorna in tempo reale e il delta rispetto alla versione precedente è evidenziato

Given che Marco confronta forecast AI vs forecast manuale dei sales rep
When attiva la vista "AI vs Rep Forecast"
Then un grafico mostra entrambe le previsioni con accuracy storica di ciascun metodo (MAE, MAPE)

Given che i dati storici mostrano stagionalità (es. calo estivo)
When il modello genera il forecast per luglio-agosto
Then la stagionalità è incorporata e un tooltip spiega "Aggiustamento stagionale: -15% basato su pattern 2024-2025"
```

---

### US-095: Email Intelligence - Sentiment Analysis

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-095                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 14                            |
| **Dipendenze** | EP-04 (Email Module)          |

**Come** Laura (Marketing Manager),
**voglio** che il sistema analizzi automaticamente il sentiment delle email ricevute dai clienti,
**così che** possa identificare clienti insoddisfatti prima che diventino churn.

**Acceptance Criteria:**

```gherkin
Given che un'email viene ricevuta e processata dal sistema
When il modulo email intelligence la analizza
Then un sentiment score (-1.0 a +1.0) viene assegnato con label (Positivo/Neutro/Negativo) e salvato nei metadati

Given che Laura apre la vista email di un contatto
When guarda la timeline delle email
Then ogni email mostra un badge colorato con il sentiment (verde/grigio/rosso) e tooltip con score numerico

Given che un contatto invia 3+ email consecutive con sentiment negativo (< -0.3)
When il sistema rileva il pattern
Then genera un alert "Sentiment Trend Negativo" visibile al sales rep e al CS team assegnato

Given che Laura accede alla dashboard "Email Sentiment"
When filtra per periodo Q1 2026
Then vede: sentiment medio per segmento, trend sentiment nel tempo, word cloud dei temi negativi più frequenti

Given che il modello di sentiment analizza un'email con sarcasmo o linguaggio ambiguo
When il confidence score è < 0.6
Then l'email viene marcata come "Sentiment incerto" con flag per review manuale
```

---

### US-096: Email Intelligence - Entity Extraction + Intent Classification

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-096                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 15                            |
| **Dipendenze** | US-095                        |

**Come** Laura (Marketing Manager),
**voglio** che il sistema estragga automaticamente entità (nomi, aziende, date, importi) e classifichi l'intento delle email,
**così che** i dati CRM si arricchiscano automaticamente senza data entry manuale.

**Acceptance Criteria:**

```gherkin
Given che un'email contiene "Vorremmo schedulare una demo il 15 aprile per il team di 20 persone"
When il modulo di entity extraction la analizza
Then vengono estratti: intent=DEMO_REQUEST, date=2026-04-15, team_size=20 e salvati come structured data

Given che un'email menziona un'azienda non presente nel CRM
When il sistema estrae l'entità "Globex Corporation"
Then viene suggerita la creazione di un nuovo account con nome pre-compilato e l'utente conferma/rifiuta

Given che un'email contiene un importo "budget di circa 50.000 EUR per il progetto"
When il sistema estrae l'entità monetaria
Then il valore viene associato al deal collegato e il campo "Expected Revenue" viene aggiornato con flag "AI-extracted"

Given che l'email è classificata come intent "COMPLAINT"
When il sistema valuta il routing
Then viene automaticamente creato un ticket di supporto con priorità alta e assegnato al CS lead

Given che il sistema processa email in italiano e tedesco
When l'entity extraction viene eseguita
Then le entità vengono estratte correttamente indipendentemente dalla lingua con confidence score per ciascuna
```

---

### US-097: Conversation AI con Accesso a Dati CRM

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-097                        |
| **SP**         | 13                            |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 15                            |
| **Dipendenze** | EP-01, EP-05 Permissions      |

**Come** Marco (Sales Director),
**voglio** interagire con un assistente AI conversazionale che accede ai dati CRM in tempo reale,
**così che** possa ottenere risposte immediate su pipeline, clienti e metriche senza costruire report.

**Acceptance Criteria:**

```gherkin
Given che Marco apre la chat AI nel CRM
When scrive "Qual è il valore totale della pipeline Q2?"
Then l'AI interroga i dati CRM in tempo reale e risponde con valore, numero di deal e breakdown per stage

Given che Marco chiede "Mostrami i deal di Luca che sono fermi da più di 2 settimane"
When l'AI esegue la query
Then restituisce una lista formattata con: nome deal, valore, stage, giorni nello stage e link diretto al deal

Given che Marco chiede "Crea un task per chiamare Acme Corp domani alle 10"
When l'AI interpreta l'azione mutativa
Then mostra un riepilogo dell'azione e richiede conferma esplicita prima di creare il task (Human-in-the-Loop)

Given che Marco chiede informazioni su un cliente a cui non ha accesso (altro tenant)
When l'AI valida i permessi
Then risponde "Non ho accesso ai dati richiesti" senza rivelare l'esistenza del record

Given che la conversazione ha 20+ messaggi di contesto
When Marco continua a fare domande
Then l'AI mantiene il contesto della conversazione e risolve pronomi e riferimenti impliciti ("quell'azienda", "lo stesso periodo")
```

---

### US-098: NLU Multilingua (IT, EN, DE, FR, ES)

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-098                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 15                            |
| **Dipendenze** | US-097                        |

**Come** Paolo (CS Lead),
**voglio** che la conversation AI e l'email intelligence funzionino in 5 lingue (IT, EN, DE, FR, ES),
**così che** i team nei diversi mercati possano usare il sistema nella loro lingua madre.

**Acceptance Criteria:**

```gherkin
Given che Paolo scrive nella chat AI in tedesco "Zeig mir alle offenen Tickets für Kunde Müller"
When l'NLU processa la richiesta
Then l'intent viene correttamente classificato come QUERY_TICKETS e le entità estratte (cliente=Müller, stato=aperto)

Given che un'email arriva in francese con sentiment negativo
When il modulo di email intelligence la analizza
Then sentiment, entità e intent vengono estratti con la stessa accuracy delle email in italiano (delta max 5%)

Given che un utente cambia lingua mid-conversation (inizia in IT, continua in EN)
When l'AI processa il messaggio in inglese
Then risponde in inglese mantenendo il contesto della conversazione precedente in italiano

Given che una query contiene nomi propri o termini tecnici non traducibili
When l'NLU processa "Mostrami i deal con status Won nel Q2"
Then i termini inglesi ("Won", "Q2") vengono correttamente interpretati nel contesto italiano

Given che l'admin configura le lingue supportate per il tenant
When disabilita il tedesco
Then la chat AI in tedesco restituisce "Lingua non supportata per il tuo piano. Lingue disponibili: IT, EN, FR, ES"
```

---

### US-099: Data Enrichment Automatico (Clearbit, LinkedIn)

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-099                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 14                            |
| **Dipendenze** | EP-01 Data Model              |

**Come** Laura (Marketing Manager),
**voglio** che i profili contatti e aziende vengano arricchiti automaticamente con dati da fonti esterne,
**così che** il CRM contenga dati completi senza data entry manuale.

**Acceptance Criteria:**

```gherkin
Given che un nuovo contatto viene creato con solo email "mario.rossi@acme.it"
When il sistema esegue l'enrichment automatico via Clearbit API
Then i campi nome, cognome, ruolo, azienda, settore, dimensione e LinkedIn URL vengono popolati automaticamente

Given che l'enrichment arricchisce un campo già compilato manualmente
When il sistema confronta i dati
Then il valore manuale viene preservato e il valore suggerito appare come "Suggerimento AI" modificabile

Given che il contatto non viene trovato nelle fonti esterne
When l'enrichment fallisce
Then il profilo resta invariato e il campo "Enrichment Status" segna "Non trovato" con data ultimo tentativo

Given che il tenant ha un budget mensile di 1.000 enrichment calls
When il contatore raggiunge 900
Then l'admin riceve una notifica "90% budget enrichment utilizzato" e a 1.000 le chiamate vengono bloccate

Given che Laura vuole arricchire in bulk 500 contatti esistenti
When avvia il "Bulk Enrichment" dalla lista contatti
Then il sistema processa i contatti in background con progress bar e report finale (arricchiti/non trovati/errori)
```

---

### US-100: Model Versioning e Registry

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-100                        |
| **SP**         | 5                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 15                            |
| **Dipendenze** | US-090, US-092                |

**Come** Chiara (CTO),
**voglio** un registry centralizzato per tutte le versioni dei modelli ML con metadati di performance,
**così che** possa tracciare l'evoluzione dei modelli, fare rollback e garantire riproducibilità.

**Acceptance Criteria:**

```gherkin
Given che un data scientist pubblica una nuova versione del modello lead scoring (v2.3)
When il modello viene registrato nel registry
Then vengono salvati: artifact path, metriche (accuracy, precision, recall, F1), dataset di training hash, hyperparameters, timestamp

Given che Chiara accede al Model Registry
When visualizza la lista dei modelli
Then vede tutti i modelli con: nome, versione attiva, ultima versione, metriche confronto, stato (active/staging/archived)

Given che il modello v2.3 mostra performance degradate in produzione
When Chiara esegue rollback alla v2.2
Then il sistema switcha il modello attivo alla v2.2 entro 60 secondi senza downtime (blue-green)

Given che un modello viene registrato senza metriche di validazione
When il sistema valida la submission
Then la registrazione viene rifiutata con errore "Metriche di validazione obbligatorie: accuracy, precision, recall"

Given che il registry contiene 20+ versioni di un modello
When Chiara filtra per "performance > baseline"
Then vengono mostrate solo le versioni che superano le metriche baseline con highlight delle migliori
```

---

### US-101: A/B Testing tra Versioni Modello

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-101                        |
| **SP**         | 8                             |
| **Priorità**   | 🟡 Media                      |
| **Sprint**     | 16                            |
| **Dipendenze** | US-100                        |

**Come** Chiara (CTO),
**voglio** eseguire A/B test tra due versioni di un modello ML su traffico reale,
**così che** possa validare miglioramenti prima di promuovere una nuova versione a produzione.

**Acceptance Criteria:**

```gherkin
Given che Chiara vuole testare il modello lead scoring v2.3 vs v2.2
When configura un A/B test con split 80/20 (v2.2: 80%, v2.3: 20%) e durata 14 giorni
Then il sistema inizia a routare le richieste di scoring secondo lo split configurato

Given che l'A/B test è attivo da 7 giorni
When Chiara accede alla dashboard A/B test
Then vede: metriche per variante (accuracy, conversion rate, latency), statistical significance (p-value), sample size

Given che il p-value raggiunge < 0.05 con variante v2.3 superiore
When il sistema rileva significatività statistica
Then Chiara riceve una notifica "A/B test conclusivo: v2.3 superiore con 95% confidence" con opzione "Promuovi a produzione"

Given che la variante v2.3 mostra latency 3x superiore alla v2.2
When il guardrail di latency viene superato (> 2 secondi)
Then l'A/B test viene automaticamente interrotto e tutto il traffico torna alla v2.2 con alert a Chiara

Given che Chiara promuove la variante vincente
When clicca "Deploy to Production"
Then il traffic split passa a 100% per la versione vincente con gradual rollout (10% > 50% > 100% in 1 ora)
```

---

### US-102: Cost Tracking e Budget per Tenant

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-102                        |
| **SP**         | 5                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 13                            |
| **Dipendenze** | Nessuna                       |

**Come** Chiara (CTO),
**voglio** tracciare i costi AI per tenant con budget configurabili e alert,
**così che** possa controllare la spesa e prevenire costi inaspettati.

**Acceptance Criteria:**

```gherkin
Given che ogni chiamata AI (scoring, NLU, enrichment, chat) viene eseguita
When il sistema la registra
Then salva: tenant_id, model_name, input_tokens, output_tokens, costo calcolato, timestamp, tipo operazione

Given che Chiara accede alla dashboard "AI Costs"
When filtra per tenant "Acme Corp" e periodo "Marzo 2026"
Then vede: costo totale, breakdown per tipo operazione (scoring 40%, chat 35%, enrichment 25%), trend giornaliero

Given che il budget mensile per un tenant è configurato a 500 EUR
When il consumo raggiunge l'80% (400 EUR)
Then l'admin del tenant riceve una notifica email "Budget AI al 80% - 100 EUR rimanenti"

Given che il consumo raggiunge il 100% del budget
When una nuova richiesta AI viene effettuata
Then la richiesta viene bloccata con errore "Budget AI esaurito" (configurabile: block vs warn-only)

Given che Chiara vuole confrontare i costi tra tenant
When accede alla vista "Cross-Tenant Costs"
Then un grafico mostra i top 10 tenant per consumo AI con drill-down per tipo operazione
```

---

### US-103: AI Governance Dashboard (Bias, Drift, Accuracy)

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-103                        |
| **SP**         | 8                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 16                            |
| **Dipendenze** | US-090, US-092, US-100        |

**Come** Chiara (CTO),
**voglio** una dashboard di governance AI che monitori bias, drift e accuracy di tutti i modelli in produzione,
**così che** possa garantire compliance EU AI Act e affidabilità delle predizioni.

**Acceptance Criteria:**

```gherkin
Given che il modello lead scoring è in produzione da 30+ giorni
When Chiara accede alla governance dashboard
Then vede per ogni modello: accuracy trend, data drift score (PSI), concept drift indicator, fairness metrics

Given che il Population Stability Index (PSI) del modello di churn supera 0.2
When il sistema rileva il drift
Then viene generato un alert "Data Drift Significativo" con dettaglio: feature driftate, PSI per feature, raccomandazione "Re-training consigliato"

Given che Chiara analizza le fairness metrics del lead scoring
When il sistema calcola le metriche per gruppo demografico (settore, dimensione azienda)
Then mostra: equal opportunity ratio, demographic parity, disparate impact ratio per ciascun gruppo

Given che un modello mostra bias (disparate impact ratio < 0.8 per un segmento)
When il sistema rileva la violazione
Then il modello viene flaggato con warning "Bias Detected" e l'alert include raccomandazioni di mitigazione

Given che Chiara genera il report di compliance trimestrale
When clicca "Genera Report Governance"
Then viene prodotto un PDF con: inventario modelli, metriche performance, fairness assessment, drift analysis, incidenti e azioni correttive
```

---

### US-104: Human-in-the-Loop per Azioni AI Mutative

| Campo          | Valore                        |
| -------------- | ----------------------------- |
| **Story ID**   | US-104                        |
| **SP**         | 5                             |
| **Priorità**   | 🔴 Alta                       |
| **Sprint**     | 13                            |
| **Dipendenze** | US-097                        |

**Come** Chiara (CTO),
**voglio** che tutte le azioni mutative suggerite dall'AI richiedano approvazione umana esplicita,
**così che** l'AI non possa modificare dati CRM senza supervisione.

**Acceptance Criteria:**

```gherkin
Given che l'AI suggerisce di creare un task "Follow-up call con Acme Corp"
When il suggerimento viene generato
Then viene mostrato un pannello di conferma con dettagli dell'azione, campi modificabili e pulsanti "Approva" / "Rifiuta"

Given che l'utente approva l'azione
When clicca "Approva"
Then l'azione viene eseguita, loggata nell'audit trail con "Approved by: Marco, AI-suggested" e confermata in chat

Given che l'utente rifiuta l'azione con motivazione "Non appropriato in questo momento"
When il feedback viene registrato
Then l'azione non viene eseguita, il feedback viene salvato per miglioramento del modello e l'AI conferma la cancellazione

Given che un admin configura le policy HITL per il tenant
When imposta "Auto-approve: read-only queries, Require approval: create/update/delete"
Then le query di lettura vengono eseguite immediatamente, le azioni mutative mostrano il pannello di approvazione

Given che un'azione approvata fallisce durante l'esecuzione (es. errore database)
When il sistema rileva l'errore
Then l'utente riceve notifica con dettaglio errore e opzione "Riprova" senza dover riapprovare
```

---

## Task Breakdown

### Infrastruttura ML

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0600  | Progettare architettura ML pipeline: feature store, training, inference, serving | 8   | AI-ML    | Tutte     |
| T-0601  | Implementare feature store con 50+ variabili per lead scoring (Prisma + Redis cache) | 12  | AI-ML    | US-090    |
| T-0602  | Creare servizio inference con model loading, batching e timeout | 8   | Backend  | US-090    |
| T-0603  | Implementare model registry database schema (versioni, metriche, artifacts) | 6   | Backend  | US-100    |
| T-0604  | Creare API `/models` CRUD per registry con validazione metriche obbligatorie | 4   | Backend  | US-100    |
| T-0605  | Implementare blue-green model deployment con rollback < 60s | 8   | Backend  | US-100    |

### Lead Scoring

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0606  | Definire e implementare 50+ feature (demografiche, comportamentali, firmografiche) | 12  | AI-ML    | US-090    |
| T-0607  | Trainare modello lead scoring baseline (XGBoost/LightGBM) con cross-validation | 10  | AI-ML    | US-090    |
| T-0608  | Implementare scoring real-time: event-driven re-scoring su azione lead | 6   | Backend  | US-090    |
| T-0609  | Creare endpoint `/leads/:id/score` con breakdown SHAP values | 4   | Backend  | US-091    |
| T-0610  | Implementare batch re-scoring settimanale (BullMQ scheduled job) | 4   | Backend  | US-090    |
| T-0611  | Creare dashboard lead scoring UI: histogram, trend, top leads, breakdown | 8   | Frontend | US-091    |
| T-0612  | Implementare score threshold automation (auto-create task per hot leads) | 4   | Backend  | US-090    |

### Churn Prediction

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0613  | Definire feature set per churn: usage metrics, engagement, support tickets, payment | 8   | AI-ML    | US-092    |
| T-0614  | Trainare modello churn prediction (survival analysis + gradient boosting) | 10  | AI-ML    | US-092    |
| T-0615  | Implementare daily churn scoring job con update incrementale | 6   | Backend  | US-092    |
| T-0616  | Creare early warning system: alert generation, notification routing, escalation | 6   | Backend  | US-092    |
| T-0617  | Implementare UI churn dashboard: risk heatmap, alert list, intervention tracking | 8   | Frontend | US-092    |

### Next Best Action

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0618  | Progettare NBA engine: rule-based + ML ranking degli action candidates | 8   | AI-ML    | US-093    |
| T-0619  | Implementare action candidate generation (deal stage rules, timing, pattern matching) | 8   | Backend  | US-093    |
| T-0620  | Creare NBA ranking model basato su historical win patterns | 6   | AI-ML    | US-093    |
| T-0621  | Implementare UI "Azioni Suggerite" con quick actions (call, email, demo) | 6   | Frontend | US-093    |
| T-0622  | Creare feedback loop: track acceptance/rejection per model improvement | 4   | Backend  | US-093    |

### Forecast

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0623  | Implementare forecast engine: weighted pipeline + seasonal decomposition | 8   | AI-ML    | US-094    |
| T-0624  | Calcolare confidence intervals (Monte Carlo simulation o bootstrap) | 6   | AI-ML    | US-094    |
| T-0625  | Creare UI forecast: best/expected/worst case con banda di confidenza | 6   | Frontend | US-094    |
| T-0626  | Implementare confronto AI forecast vs manual forecast con accuracy tracking | 4   | Backend  | US-094    |

### Email Intelligence

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0627  | Implementare sentiment analysis pipeline (Mistral fine-tuned o API) | 8   | AI-ML    | US-095    |
| T-0628  | Implementare entity extraction con NER (nomi, aziende, date, importi) | 8   | AI-ML    | US-096    |
| T-0629  | Implementare intent classification (DEMO_REQUEST, COMPLAINT, PRICING, INFO, etc.) | 6   | AI-ML    | US-096    |
| T-0630  | Creare email processing pipeline: ingest > sentiment > NER > intent > persist | 6   | Backend  | US-095,096|
| T-0631  | Implementare sentiment trend detection (3+ negative → alert) | 4   | Backend  | US-095    |
| T-0632  | Creare UI email intelligence: sentiment badge, entity cards, intent routing | 6   | Frontend | US-095,096|

### Conversation AI & NLU

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0633  | Implementare CRM tool functions per conversation AI (query deals, contacts, tasks) | 10  | Backend  | US-097    |
| T-0634  | Creare permission-aware query layer per AI (tenantId + role check su ogni query) | 6   | Backend  | US-097    |
| T-0635  | Implementare HITL approval flow per azioni mutative (create, update, delete) | 8   | Backend  | US-104    |
| T-0636  | Creare UI pannello approvazione HITL con preview azione e campi editabili | 6   | Frontend | US-104    |
| T-0637  | Configurare NLU multilingua: prompt engineering per IT, EN, DE, FR, ES | 8   | AI-ML    | US-098    |
| T-0638  | Testare accuracy NLU per ciascuna lingua con test suite dedicato (min 100 esempi per lingua) | 6   | QA       | US-098    |

### Data Enrichment

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0639  | Implementare integrazione Clearbit API: lookup per email, domain enrichment | 6   | Backend  | US-099    |
| T-0640  | Implementare integrazione LinkedIn (People API o scraping compliance) | 8   | Backend  | US-099    |
| T-0641  | Creare enrichment orchestrator: merge strategy, conflict resolution, rate limiting | 6   | Backend  | US-099    |
| T-0642  | Implementare bulk enrichment job con progress tracking e budget enforcement | 6   | Backend  | US-099    |
| T-0643  | Creare UI enrichment: suggerimenti AI, bulk import progress, budget widget | 6   | Frontend | US-099    |

### A/B Testing

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0644  | Implementare traffic splitter per A/B test modelli (consistent hashing per user) | 6   | Backend  | US-101    |
| T-0645  | Creare metrics collector per varianti A/B (accuracy, latency, conversion per variante) | 6   | Backend  | US-101    |
| T-0646  | Implementare statistical significance calculator (Chi-squared / Bayesian) | 4   | AI-ML    | US-101    |
| T-0647  | Creare UI A/B test dashboard: config, metriche live, significance, promote/rollback | 8   | Frontend | US-101    |
| T-0648  | Implementare guardrail automatici (auto-stop se latency o error rate eccessivi) | 4   | Backend  | US-101    |

### Cost Tracking & Governance

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0649  | Creare schema cost tracking: call log con tokens, costo, tenant, tipo operazione | 4   | Backend  | US-102    |
| T-0650  | Implementare cost aggregation service con budget enforcement e alert soglia | 6   | Backend  | US-102    |
| T-0651  | Creare UI cost dashboard: breakdown per tipo, trend giornaliero, budget progress | 6   | Frontend | US-102    |
| T-0652  | Implementare drift detection: PSI calculation per feature, scheduled job giornaliero | 8   | AI-ML    | US-103    |
| T-0653  | Implementare fairness metrics calculator (demographic parity, equal opportunity) | 6   | AI-ML    | US-103    |
| T-0654  | Creare UI governance dashboard: drift alerts, fairness metrics, accuracy trend, model inventory | 8   | Frontend | US-103    |
| T-0655  | Implementare compliance report generator (PDF con inventario modelli, metriche, azioni) | 6   | Backend  | US-103    |

### QA & Testing

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0656  | Test E2E lead scoring: creazione lead → scoring → threshold → task automation | 8   | QA       | US-090,091|
| T-0657  | Test E2E churn prediction: simulare disengagement → alert → intervention → re-score | 6   | QA       | US-092    |
| T-0658  | Test integrazione conversation AI: query CRM, azioni mutative, HITL approval | 8   | QA       | US-097,104|
| T-0659  | Test email intelligence: sentiment accuracy, entity extraction precision/recall | 6   | QA       | US-095,096|
| T-0660  | Test A/B testing: traffic split, metrics collection, auto-stop guardrails | 6   | QA       | US-101    |
| T-0661  | Performance test: scoring latency < 5s, chat response < 3s, enrichment < 10s | 6   | QA       | Tutte     |
| T-0662  | Security test: tenant isolation AI queries, HITL bypass attempts, cost manipulation | 6   | QA       | US-097,102|

### DevOps

| Task ID | Descrizione                                              | Ore | Ruolo    | Story Ref |
| ------- | -------------------------------------------------------- | --- | -------- | --------- |
| T-0663  | Configurare model artifact storage (S3/MinIO) con versioning | 4   | DevOps   | US-100    |
| T-0664  | Setup GPU inference endpoint (o serverless GPU per scoring batch) | 6   | DevOps   | US-090    |
| T-0665  | Configurare monitoring ML: latency, error rate, model performance degradation alerts | 4   | DevOps   | Tutte     |
| T-0666  | Setup CI/CD per model training pipeline (automated re-training trigger) | 6   | DevOps   | US-100    |

---

## Technical Design Notes

### Model Training Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Feature Store │────▶│   Training   │────▶│  Validation  │────▶│   Registry   │
│ (Prisma+Redis)│     │ (Python/ONNX)│     │ (Metrics +   │     │ (Postgres +  │
│              │     │              │     │  Bias Check) │     │  S3 Artifacts)│
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
                                                               ┌──────▼───────┐
                                                               │   Inference  │
                                                               │   Service    │
                                                               │ (NestJS +    │
                                                               │  ONNX Runtime)│
                                                               └──────────────┘
```

### Feature Store

- **Storage:** PostgreSQL per feature definitions + valori calcolati; Redis per feature cache (hot features).
- **Feature types:** Real-time (evento → ricalcolo immediato), Batch (ricalcolo notturno), Static (demografiche).
- **Schema:** `feature_values(tenant_id, entity_type, entity_id, feature_name, value, computed_at)` con indice composito.

### Inference Service Architecture

- **Modelli piccoli (scoring, sentiment):** ONNX Runtime in-process nel servizio NestJS. Latency target < 100ms.
- **Modelli grandi (conversation AI, NLU):** API call a Mistral/provider configurato. Latency target < 3s.
- **Batching:** Per re-scoring periodico, batch di 100 lead per request con parallelismo configurabile.
- **Fallback:** Se il modello ML fallisce, fallback a rule-based scoring con flag "Degraded Mode".

### LangChain Agent Tools

```typescript
// CRM Tools per Conversation AI
const tools = [
  queryDealsTool,       // Read: search/filter deals
  queryContactsTool,    // Read: search/filter contacts
  queryTasksTool,       // Read: search/filter tasks
  getMetricsTool,       // Read: aggregate metrics (revenue, count, avg)
  createTaskTool,       // Write: create task (requires HITL approval)
  updateDealStageTool,  // Write: update deal (requires HITL approval)
  sendEmailTool,        // Write: draft email (requires HITL approval)
];
```

- Ogni tool con `tenantId` injected dal middleware auth.
- Write tools wrappati in HITL approval flow (SDK-native, vedi `memory/reference_ai_sdk_hitl.md`).
- Context window management: ultimi 20 messaggi + system prompt con CRM schema summary.

### Cost Calculation

```
cost = (input_tokens * model_input_price + output_tokens * model_output_price)
```

- Prezzi per modello configurati in tabella `model_pricing(model_name, input_price_per_1k, output_price_per_1k)`.
- Aggregazione in `ai_cost_log(tenant_id, model_name, operation_type, input_tokens, output_tokens, cost_eur, created_at)`.
- Budget enforcement via Redis counter con TTL mensile.

---

## Rischi

| ID    | Rischio                                                   | Probabilità | Impatto | Mitigazione                                                |
| ----- | --------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------- |
| R-081 | Accuracy modello lead scoring < 70% per dati insufficienti | Alta        | Alto    | Richiedere minimo 1.000 deal chiusi per training; fallback rule-based; cold-start con industry benchmarks |
| R-082 | Costi AI eccessivi per tenant ad alto volume               | Alta        | Alto    | Budget enforcement hard, alert soglia 80%, ottimizzazione prompt (shorter context), caching risposte frequenti |
| R-083 | Bias nel lead scoring (es. penalizza PMI vs Enterprise)    | Media       | Alto    | Fairness metrics in governance dashboard, audit trimestrale, rebalancing dataset di training |
| R-084 | Latency inference inaccettabile per real-time scoring      | Media       | Alto    | ONNX Runtime in-process, feature pre-computation, circuit breaker con fallback rule-based |
| R-085 | Data quality scarsa compromette accuracy dei modelli       | Alta        | Alto    | Data validation pipeline pre-training, missing value handling, outlier detection, data quality score per tenant |
| R-086 | Compliance EU AI Act: trasparenza e explainability carenti | Media       | Alto    | SHAP values per explainability, governance dashboard, audit trail completo, report compliance automatico |
| R-087 | Model drift non rilevato per settimane                     | Media       | Medio   | PSI monitoring giornaliero, alert automatico su drift > 0.2, re-training trigger automatico |
| R-088 | Conversation AI hallucina dati CRM inesistenti             | Media       | Alto    | Grounding esclusivo su tool output, no generazione dati, response validation pre-display |

---

## Definition of Done (DoD)

- [ ] Tutti i 15 acceptance criteria delle user story passano in ambiente staging
- [ ] Lead scoring assegna punteggio a ogni nuovo lead entro 5 secondi
- [ ] Churn prediction genera early warning con almeno 30 giorni di anticipo (validato su dati storici)
- [ ] Next best action genera almeno 3 suggerimenti per sales rep al giorno con acceptance rate > 30%
- [ ] Forecast mostra confidence intervals calibrati (80% CI contiene il valore reale nell'80% dei casi su backtest)
- [ ] Email intelligence processa 5 lingue con accuracy sentiment > 85% e entity extraction F1 > 0.8
- [ ] Conversation AI risponde a query CRM in < 3 secondi con 0% data leakage cross-tenant
- [ ] HITL approval richiesto per il 100% delle azioni mutative AI (zero bypass)
- [ ] Model registry traccia tutte le versioni con metriche e supporta rollback in < 60 secondi
- [ ] A/B testing esegue split corretto (varianza < 2% dal target) e calcola significance
- [ ] Cost tracking registra il 100% delle chiamate AI con accuracy costo +/- 1%
- [ ] Governance dashboard mostra drift, bias e accuracy per tutti i modelli in produzione
- [ ] Performance test: scoring < 5s, chat < 3s, enrichment < 10s per il 95° percentile
- [ ] Security audit completato: tenant isolation, HITL integrity, cost manipulation prevention
- [ ] Documentazione tecnica: pipeline architecture, feature catalog, model card per ogni modello
- [ ] Zero vulnerabilità critiche nel security scan
