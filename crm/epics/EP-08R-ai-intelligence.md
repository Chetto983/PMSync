# Epic EP-08R: AI Intelligence Layer

| Campo        | Valore                                 |
|-------------|----------------------------------------|
| **Epic ID** | EP-08R                                  |
| **Fase**    | 2 (Sprint 9-14)                         |
| **SP Totali** | 90                                    |
| **Owner**   | Solo Dev                                |
| **Stato**   | 📋 Planned                              |

---

## Panoramica

Estensione del motore AI esistente di PMSync con funzionalità CRM-specifiche: lead scoring predittivo, deal scoring avanzato, forecasting base, churn prediction, next best action, estensione AI chat con tool CRM. Riutilizza l'infrastruttura AI esistente (Mistral, pgvector, tool registry, HITL).

L'obiettivo non è costruire un motore ML enterprise. È ottenere il massimo valore predittivo con modelli semplici, dati già presenti nel sistema e zero infrastruttura aggiuntiva.

---

## Infrastruttura PMSync Riutilizzabile

| Componente | Path | Cosa offre |
|---|---|---|
| AI Chat SSE streaming | `backend/src/modules/ai-chat/` | Pipeline completa chat → tool → response |
| Tool Registry | `backend/src/modules/ai-chat/tools/` | 15 tool services registrati, pattern consolidato |
| pgvector embeddings | 1024-dim Mistral | Embedding storage + similarity search |
| RAG pipeline | AI chat module | Retrieval-augmented generation su email/contatti |
| HITL approval | Phase 108 (pending) | Framework approvazione azioni mutative AI |
| AiRunLedger | `backend/src/modules/ai-chat/` | Cost tracking per run AI |
| PII tokenization | AI chat module | Protezione dati sensibili nei prompt |

---

## Cosa Aggiungere

- **Lead scoring model** — feature engineering da contacts/emails/activities
- **Deal scoring ML** — estensione rule-based di EP-04R con features comportamentali
- **Revenue forecasting** — time series su storico deal chiusi
- **Churn prediction** — pattern di disengagement da usage/email/ticket
- **Next best action engine** — suggerimenti contestuali per sales workflow
- **CRM AI chat tools** — deal lookup, pipeline actions, forecast queries
- **AI governance dashboard** — accuracy tracking, cost, drift monitoring

---

## User Stories

### US-R026: Lead Scoring Predittivo 🔴 Alta

**SP:** 13 | **Sprint:** 9-10 | **Dipendenze:** EP-01R (Contact model), EP-03R (Activity tracking)

**Come** utente CRM, **voglio** che ogni lead riceva un punteggio predittivo (0-100) basato sull'engagement reale, **così da** concentrare il mio tempo sui lead con maggiore probabilità di conversione.

**Criteri di accettazione:**

```gherkin
Given un contatto con almeno 5 interazioni registrate (email, meeting, note)
When il lead scoring engine processa il contatto
Then viene generato un score 0-100 con i top 3 fattori contribuenti

Given un nuovo contatto senza storico
When il lead scoring engine processa il contatto
Then viene assegnato uno score di default (30) con label "Dati insufficienti"

Given un contatto il cui engagement cambia (nuova email aperta, meeting schedulato)
When il BullMQ job di ricalcolo viene triggerato
Then lo score viene aggiornato entro 5 minuti
```

**Features per il modello:**
- Email open rate (30 giorni)
- Frequenza risposte email
- Numero meeting schedulati/completati
- Deal stage progression velocity
- Recency dell'ultima interazione
- Numero touchpoint totali
- Domain authority (company size proxy)

---

### US-R027: Lead Score UI Widget 🔴 Alta

**SP:** 5 | **Sprint:** 10 | **Dipendenze:** US-R026

**Come** utente CRM, **voglio** vedere il lead score direttamente nel contact detail, **così da** avere un feedback immediato sulla qualità del lead.

**Criteri di accettazione:**

```gherkin
Given che sto visualizzando il detail di un contatto con score calcolato
When la pagina viene renderizzata
Then vedo un widget con: score numerico, gauge visuale, top 3 fattori, trend (↑↓→)

Given che il contatto ha score < 30
When visualizzo il widget
Then il gauge è rosso con label "Freddo"

Given che il contatto ha score 30-70
When visualizzo il widget
Then il gauge è arancione con label "Tiepido"

Given che il contatto ha score > 70
When visualizzo il widget
Then il gauge è verde con label "Caldo"
```

---

### US-R028: Deal Scoring ML 🟡 Media

**SP:** 10 | **Sprint:** 10-11 | **Dipendenze:** EP-04R (Deal pipeline), US-R026

**Come** utente CRM, **voglio** che ogni deal abbia un win probability score basato su features comportamentali e non solo regole statiche, **così da** avere previsioni più accurate sulla chiusura.

**Criteri di accettazione:**

```gherkin
Given un deal con almeno 3 attività associate e un lead score calcolato
When il deal scoring engine processa il deal
Then viene generato un win probability % con confidence level (low/medium/high)

Given un deal che è fermo nella stessa stage da più di 2x la media di stage duration
When il ricalcolo avviene
Then il win probability cala e il fattore "Stage stagnation" appare nei top risk factors

Given un deal con rule-based score e ML score divergenti (>20% differenza)
When visualizzo il deal detail
Then entrambi gli score sono visibili con nota "Discrepanza tra modelli"
```

---

### US-R029: Revenue Forecasting Base 🟡 Media

**SP:** 10 | **Sprint:** 11-12 | **Dipendenze:** EP-04R (Deal close history)

**Come** utente CRM, **voglio** una previsione di revenue per quarter basata sullo storico dei deal chiusi, **così da** pianificare le risorse e comunicare target realistici.

**Criteri di accettazione:**

```gherkin
Given almeno 6 mesi di storico deal chiusi (minimo 20 deal)
When richiedo il forecast per il prossimo quarter
Then ricevo: revenue previsto, banda di confidenza (80%), trend direction

Given meno di 6 mesi di storico
When richiedo il forecast
Then ricevo un messaggio "Dati insufficienti per forecast affidabile" con proiezione lineare semplice

Given un forecast generato
When un nuovo deal viene chiuso
Then il forecast viene ricalcolato nel batch notturno successivo
```

---

### US-R030: Forecast Dashboard 🟡 Media

**SP:** 8 | **Sprint:** 12 | **Dipendenze:** US-R029

**Come** utente CRM, **voglio** una dashboard visuale con il forecast di revenue, **così da** confrontare previsioni vs. attuale e identificare gap.

**Criteri di accettazione:**

```gherkin
Given che accedo alla forecast dashboard
When i dati sono disponibili
Then vedo: grafico linea revenue previsto vs attuale (ultimi 4 quarter), bande di confidenza, pipeline weighted value

Given che seleziono un quarter specifico
When clicco sul data point
Then vedo il breakdown: deal chiusi, deal in pipeline con probabilità, gap to target

Given che non ci sono dati sufficienti
When accedo alla dashboard
Then vedo un empty state con spiegazione e requisiti minimi di dati
```

---

### US-R031: Churn Prediction 🟡 Media

**SP:** 10 | **Sprint:** 12-13 | **Dipendenze:** EP-01R (Contact), EP-06R (Ticket data opzionale)

**Come** utente CRM, **voglio** che il sistema identifichi contatti/account a rischio churn, **così da** intervenire proattivamente prima di perdere il cliente.

**Criteri di accettazione:**

```gherkin
Given un contatto con storico di engagement di almeno 3 mesi
When il churn prediction engine rileva un calo di engagement >40% rispetto alla media
Then il contatto viene flaggato come "A rischio" con churn probability % e segnali chiave

Given un contatto con ticket aperti non risolti da >7 giorni e sentiment negativo nelle email
When il ricalcolo avviene
Then il churn risk aumenta e i fattori "Ticket irrisolti" e "Sentiment negativo" appaiono

Given un contatto flaggato "A rischio" che riprende engagement (nuova email, meeting)
When il ricalcolo avviene
Then il churn risk viene ridotto e il flag aggiornato
```

**Segnali di churn:**
- Calo frequenza email response
- Aumento ticket frequency / severity
- Nessun meeting negli ultimi 30 giorni
- Late payment (se dati disponibili)
- Sentiment trend negativo nelle email
- Login frequency drop (se tracciato)

---

### US-R032: Early Warning UI 🟡 Media

**SP:** 5 | **Sprint:** 13 | **Dipendenze:** US-R031

**Come** utente CRM, **voglio** una lista dedicata dei contatti/account a rischio churn ordinata per urgenza, **così da** prioritizzare le azioni di retention.

**Criteri di accettazione:**

```gherkin
Given che accedo alla sezione Early Warning
When ci sono contatti a rischio
Then vedo una lista ordinata per churn probability (desc) con: nome, score, top segnale, giorni dal flag

Given che clicco su un contatto a rischio
When il detail si apre
Then vedo: timeline dei segnali di churn, suggested actions, storico engagement

Given che non ci sono contatti a rischio
When accedo alla sezione
Then vedo un empty state positivo "Nessun cliente a rischio al momento"
```

---

### US-R033: Next Best Action Engine 🟡 Media

**SP:** 10 | **Sprint:** 13-14 | **Dipendenze:** US-R026, US-R028, US-R031

**Come** utente CRM, **voglio** ricevere suggerimenti contestuali su quale azione compiere per ogni deal/contatto, **così da** non dover decidere manualmente il next step.

**Criteri di accettazione:**

```gherkin
Given un deal in stage "Proposal" con lead score > 60 e nessun follow-up da 3 giorni
When il NBA engine processa il deal
Then suggerisce "Invia follow-up email al decision maker" con priorità alta

Given un contatto a rischio churn con ticket aperto
When il NBA engine processa il contatto
Then suggerisce "Escalare ticket + schedulare call di retention" con priorità critica

Given un deal appena creato senza attività
When il NBA engine processa il deal
Then suggerisce "Schedulare discovery call" come prima azione

Given che un suggerimento NBA viene completato dall'utente
When l'azione è tracciata nel sistema
Then il suggerimento scompare e un nuovo NBA viene generato
```

**Regole NBA (rule-based per MVP):**
- Deal senza follow-up > 3gg → "Invia follow-up"
- Lead score > 70 senza deal → "Crea opportunità"
- Deal in stage > 2x media duration → "Rivedi strategy / escalate"
- Churn risk > 60% → "Azione di retention"
- Deal > €10k senza meeting recente → "Schedula meeting"
- Contatto senza interazione > 14gg → "Riattiva contatto"

---

### US-R034: NBA Suggestion Cards 🟢 Bassa

**SP:** 5 | **Sprint:** 14 | **Dipendenze:** US-R033

**Come** utente CRM, **voglio** vedere i suggerimenti NBA come card nel deal detail e contact detail, **così da** agire direttamente dalla pagina corrente.

**Criteri di accettazione:**

```gherkin
Given che visualizzo un deal con suggerimenti NBA attivi
When la pagina viene renderizzata
Then vedo max 3 suggestion cards ordinate per priorità con: azione suggerita, motivo, CTA button

Given che clicco "Esegui" su una suggestion card
When l'azione è di tipo email
Then si apre il composer email pre-compilato con il contatto corretto

Given che clicco "Ignora" su una suggestion card
When confermo
Then la card scompare con feedback "Suggerimento ignorato" e non riappare per 7 giorni
```

---

### US-R035: AI Chat Tools CRM 🔴 Alta

**SP:** 8 | **Sprint:** 9 | **Dipendenze:** AI chat esistente, EP-04R (Deal model)

**Come** utente CRM, **voglio** poter interagire con i dati CRM via AI chat (cercare deal, muovere stage, chiedere forecast), **così da** operare con linguaggio naturale senza navigare l'interfaccia.

**Criteri di accettazione:**

```gherkin
Given che scrivo in chat "mostrami i deal in pipeline sopra 5000 euro"
When l'AI processa la richiesta
Then chiama il tool searchDeals con filtri appropriati e mostra risultati formattati

Given che scrivo "sposta il deal Acme Corp a Negotiation"
When l'AI processa la richiesta
Then chiama moveDealStage, il HITL approval viene richiesto, e dopo approvazione lo stage cambia

Given che scrivo "qual è il forecast per Q2?"
When l'AI processa la richiesta
Then chiama forecastRevenue e mostra revenue previsto con bande di confidenza

Given che scrivo "chi sono i lead più caldi?"
When l'AI processa la richiesta
Then chiama getTopLeads e mostra top 10 lead per score con fattori principali
```

**Nuovi tool da registrare nel ToolRegistry:**
- `getDeal` — recupera deal per ID o nome
- `searchDeals` — cerca deal con filtri (stage, amount, owner)
- `moveDealStage` — muta stage (richiede HITL)
- `forecastRevenue` — query forecast per periodo
- `getTopLeads` — top N lead per score
- `getChurnRisks` — contatti a rischio churn

---

### US-R036: AI Governance Dashboard 🟢 Bassa

**SP:** 8 | **Sprint:** 14 | **Dipendenze:** US-R026, US-R028, US-R031, AiRunLedger

**Come** amministratore, **voglio** una dashboard di governance AI che mostri accuratezza modelli, costo per predizione e drift, **così da** monitorare la qualità e il costo dell'AI.

**Criteri di accettazione:**

```gherkin
Given che accedo alla AI governance dashboard
When i modelli hanno almeno 30 giorni di predizioni
Then vedo: accuracy per modello (lead/deal/churn), precision/recall, costo medio per predizione

Given che l'accuracy di un modello scende sotto il 60%
When la dashboard viene aggiornata
Then appare un alert "Model drift detected" con raccomandazione di retrain

Given che seleziono un periodo specifico
When filtro per date range
Then tutte le metriche si aggiornano per il periodo selezionato

Given che voglio confrontare costi AI
When visualizzo la sezione costi
Then vedo breakdown per: feature (scoring, forecast, chat), per tenant, trend mensile
```

---

### US-R037: Cost Tracking per Tenant per AI Feature 🟢 Bassa

**SP:** 3 | **Sprint:** 14 | **Dipendenze:** AiRunLedger esistente

**Come** amministratore, **voglio** che ogni chiamata AI (scoring, forecast, chat tool) sia tracciata per tenant e feature type, **così da** gestire i costi e impostare limiti.

**Criteri di accettazione:**

```gherkin
Given che un lead scoring viene calcolato per un contatto del tenant X
When il calcolo completa
Then un record AiRunLedger viene creato con: tenantId, featureType="lead_scoring", tokens, cost, duration

Given che un admin vuole vedere i costi AI per tenant
When accede al report costi
Then vede totale per tenant, breakdown per feature, trend ultimi 3 mesi

Given che un tenant supera il budget mensile AI configurato
When viene superata la soglia
Then le predizioni non-critiche vengono sospese e un alert viene inviato all'admin
```

---

## Task Breakdown

### Infrastruttura ML (Sprint 9)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-081 | Creare `backend/src/modules/ai-intelligence/` module con NestJS structure | 2 | Infra | 🔴 |
| T-082 | Definire Prisma models: `LeadScore`, `DealScore`, `ChurnSignal`, `NBAAction`, `ForecastSnapshot` | 3 | Infra | 🔴 |
| T-083 | Creare `FeatureEngineeringService` — estrazione features da Prisma queries aggregate | 3 | US-R026 | 🔴 |
| T-084 | Implementare `ScoringModelService` — wrapper per modelli ML (gradient boosting via ml.js) | 3 | US-R026 | 🔴 |
| T-085 | Setup BullMQ queue `ai-scoring` per batch scoring jobs | 1 | US-R026 | 🔴 |
| T-086 | Creare migration Prisma per tabelle scoring/forecast | 1 | Infra | 🔴 |

### Lead Scoring (Sprint 9-10)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-087 | Implementare `LeadScoringService.calculateScore()` con feature vector | 3 | US-R026 | 🔴 |
| T-088 | Creare BullMQ processor per ricalcolo batch (cron notturno + event-driven) | 2 | US-R026 | 🔴 |
| T-089 | Creare endpoint `GET /crm/contacts/:id/lead-score` | 1 | US-R026 | 🔴 |
| T-090 | Creare endpoint `GET /crm/lead-scores/top?limit=N` | 1 | US-R035 | 🔴 |
| T-091 | Frontend: `useLeadScore(contactId)` query hook | 1 | US-R027 | 🔴 |
| T-092 | Frontend: `LeadScoreWidget` component (gauge + factors + trend) | 3 | US-R027 | 🔴 |
| T-093 | Frontend: integrare `LeadScoreWidget` nel contact detail page | 1 | US-R027 | 🔴 |

### Deal Scoring ML (Sprint 10-11)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-094 | Implementare `DealScoringService.calculateWinProbability()` | 3 | US-R028 | 🟡 |
| T-095 | Feature engineering per deal: stage velocity, contact score, activity density, amount percentile | 2 | US-R028 | 🟡 |
| T-096 | Creare endpoint `GET /crm/deals/:id/score` | 1 | US-R028 | 🟡 |
| T-097 | Frontend: `DealScoreWidget` component nel deal detail | 2 | US-R028 | 🟡 |
| T-098 | Logica confronto rule-based vs ML score con nota discrepanza | 2 | US-R028 | 🟡 |

### Revenue Forecasting (Sprint 11-12)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-099 | Implementare `ForecastService` — moving average + linear trend in TypeScript | 3 | US-R029 | 🟡 |
| T-100 | Calcolo bande di confidenza (bootstrap o deviation-based) | 2 | US-R029 | 🟡 |
| T-101 | Creare endpoint `GET /crm/forecast?period=Q2-2026` | 1 | US-R029 | 🟡 |
| T-102 | BullMQ job per ricalcolo forecast notturno | 1 | US-R029 | 🟡 |
| T-103 | Frontend: `useForecast(period)` query hook | 1 | US-R030 | 🟡 |
| T-104 | Frontend: `ForecastDashboard` page con MUI X Charts (LineChart + area bands) | 5 | US-R030 | 🟡 |
| T-105 | Frontend: drill-down quarter con deal breakdown | 2 | US-R030 | 🟡 |

### Churn Prediction (Sprint 12-13)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-106 | Implementare `ChurnPredictionService` — logistic regression su engagement features | 3 | US-R031 | 🟡 |
| T-107 | Feature extraction: email response frequency, ticket count, meeting recency, sentiment proxy | 3 | US-R031 | 🟡 |
| T-108 | Creare endpoint `GET /crm/churn-risks?threshold=0.5` | 1 | US-R031 | 🟡 |
| T-109 | BullMQ job per ricalcolo churn scores (batch notturno) | 1 | US-R031 | 🟡 |
| T-110 | Frontend: `EarlyWarningList` page con MUI DataGrid | 3 | US-R032 | 🟡 |
| T-111 | Frontend: churn signal timeline nel contact detail | 2 | US-R032 | 🟡 |

### Next Best Action (Sprint 13-14)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-112 | Implementare `NBAService` — rule engine con regole configurabili in DB | 3 | US-R033 | 🟡 |
| T-113 | Definire regole NBA iniziali (6 regole base) come seed data | 1 | US-R033 | 🟡 |
| T-114 | Creare endpoint `GET /crm/nba/:entityType/:entityId` | 1 | US-R033 | 🟡 |
| T-115 | Logica "ignora suggerimento" con cooldown 7 giorni | 1 | US-R033 | 🟡 |
| T-116 | Frontend: `NBASuggestionCard` component | 2 | US-R034 | 🟢 |
| T-117 | Frontend: integrare NBA cards in deal detail e contact detail | 2 | US-R034 | 🟢 |

### AI Chat Tools CRM (Sprint 9)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-118 | Creare `GetDealTool` service seguendo ToolRegistry pattern | 1 | US-R035 | 🔴 |
| T-119 | Creare `SearchDealsTool` service con filtri | 2 | US-R035 | 🔴 |
| T-120 | Creare `MoveDealStageTool` service con HITL requirement | 2 | US-R035 | 🔴 |
| T-121 | Creare `ForecastRevenueTool` service | 1 | US-R035 | 🟡 |
| T-122 | Creare `GetTopLeadsTool` e `GetChurnRisksTool` services | 2 | US-R035 | 🟡 |
| T-123 | Registrare tutti i nuovi tool nel ToolRegistry | 1 | US-R035 | 🔴 |

### AI Governance (Sprint 14)

| # | Task | SP | Story | Priorità |
|---|---|---|---|---|
| T-124 | Estendere `AiRunLedger` con `featureType` enum e query aggregate | 2 | US-R037 | 🟢 |
| T-125 | Implementare accuracy tracking: prediction vs. outcome comparison service | 3 | US-R036 | 🟢 |
| T-126 | Creare endpoint `GET /crm/ai-governance/metrics` | 1 | US-R036 | 🟢 |
| T-127 | Frontend: `AIGovernanceDashboard` page | 5 | US-R036 | 🟢 |
| T-128 | Budget threshold check + alert per tenant | 2 | US-R037 | 🟢 |

---

## Note di Design Tecnico

### Approccio ML per Solo Dev

**MVP: zero Python dependency.** Usare librerie JavaScript per evitare la complessità di un subprocess Python.

| Modello | Libreria | Motivazione |
|---|---|---|
| Lead scoring | `ml-logistic-regression` o `ml.js` gradient boosting | Feature vector numerico, output 0-1 |
| Deal scoring | Same as above + rule-based blend | Combinazione regole + ML |
| Forecasting | TypeScript puro (moving average + linear trend) | Semplice, nessuna dipendenza |
| Churn | `ml-logistic-regression` | Binary classification |

**Se ml.js non basta:** fallback a Python subprocess con `child_process.execFile()` verso script standalone. Ma solo se i modelli JS hanno accuracy < 55%.

### Schema Prisma (nuovi modelli)

```prisma
model LeadScore {
  id          String   @id @default(uuid())
  tenantId    String
  contactId   String
  score       Float    // 0-100
  confidence  String   // low | medium | high
  factors     Json     // [{ factor: string, weight: float, value: float }]
  calculatedAt DateTime @default(now())

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  contact Contact @relation(fields: [contactId], references: [id])

  @@index([tenantId, contactId])
  @@index([tenantId, score(sort: Desc)])
}

model DealScore {
  id              String   @id @default(uuid())
  tenantId        String
  dealId          String
  winProbability  Float    // 0-1
  confidence      String
  ruleBasedScore  Float?   // per confronto
  mlScore         Float
  riskFactors     Json
  calculatedAt    DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  deal   Deal   @relation(fields: [dealId], references: [id])

  @@index([tenantId, dealId])
}

model ForecastSnapshot {
  id              String   @id @default(uuid())
  tenantId        String
  period          String   // "Q2-2026"
  predictedRevenue Float
  confidenceLow   Float
  confidenceHigh  Float
  actualRevenue   Float?   // populated when quarter closes
  modelVersion    String
  calculatedAt    DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, period])
}

model ChurnSignal {
  id          String   @id @default(uuid())
  tenantId    String
  contactId   String
  churnRisk   Float    // 0-1
  signals     Json     // [{ signal: string, severity: float }]
  status      String   // active | resolved | dismissed
  flaggedAt   DateTime @default(now())
  resolvedAt  DateTime?

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  contact Contact @relation(fields: [contactId], references: [id])

  @@index([tenantId, status])
  @@index([tenantId, churnRisk(sort: Desc)])
}

model NBAAction {
  id          String   @id @default(uuid())
  tenantId    String
  entityType  String   // "deal" | "contact"
  entityId    String
  actionType  String   // "send_followup" | "schedule_call" | etc.
  reason      String
  priority    String   // "critical" | "high" | "medium" | "low"
  status      String   // "pending" | "completed" | "dismissed"
  dismissedUntil DateTime?
  createdAt   DateTime @default(now())
  completedAt DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, status, priority])
}
```

### Feature Engineering Pipeline

```
Contact + Email + Deal + Activity data
          ↓
  FeatureEngineeringService.extractFeatures(contactId)
          ↓
  Feature Vector: [emailOpenRate, responseFreq, meetingCount, dealVelocity, recency, ...]
          ↓
  ScoringModelService.predict(featureVector, modelType)
          ↓
  Score + Factors → persist to LeadScore/DealScore/ChurnSignal
```

### BullMQ Job Architecture

| Queue | Job | Schedule | Trigger |
|---|---|---|---|
| `ai-scoring` | `batch-lead-score` | Cron 02:00 UTC | Nightly batch |
| `ai-scoring` | `single-lead-score` | On demand | Email received, meeting created |
| `ai-scoring` | `batch-deal-score` | Cron 02:30 UTC | Nightly batch |
| `ai-scoring` | `batch-churn` | Cron 03:00 UTC | Nightly batch |
| `ai-scoring` | `batch-nba` | Cron 03:30 UTC | Nightly batch |
| `ai-forecast` | `forecast-recalc` | Cron 04:00 UTC | Nightly |

### AI Chat Tool Pattern

Seguire esattamente il pattern dei 15 tool esistenti:

```typescript
// backend/src/modules/ai-chat/tools/crm/get-deal.tool.ts
@Injectable()
export class GetDealTool implements IAiTool {
  name = 'getDeal';
  description = 'Recupera informazioni su un deal CRM per ID o nome';
  parameters = z.object({
    dealId: z.string().optional(),
    dealName: z.string().optional(),
  });
  requiresApproval = false;

  async execute(params, context: ToolContext) {
    // Query con tenantId dal context
  }
}
```

### Frontend Chart Library

Usare **MUI X Charts** (già disponibile con MUI license) per:
- `LineChart` — forecast con bande di confidenza
- `GaugeChart` — lead score widget
- `BarChart` — AI governance metriche

Se MUI X Charts non copre gauge, usare `recharts` RadialBarChart come fallback.

---

## Rischi

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|---|
| R1 | **Accuracy modelli insufficiente** — con poco training data i modelli ML saranno poco accurati | Alta | Alto | MVP con regole + ML blend. Mostrare confidence level. Fallback a rule-based se accuracy < 55% |
| R2 | **Volume training data** — serve uno storico minimo per ogni modello | Alta | Medio | Definire soglie minime (20 deal chiusi, 5 interazioni per lead). Mostrare "Dati insufficienti" quando sotto soglia |
| R3 | **ML expertise solo dev** — debugging modelli ML richiede competenze specifiche | Media | Alto | Usare modelli semplici (logistic regression, not deep learning). Logging estensivo delle features. Evitare black box |
| R4 | **Costo computazionale** — batch scoring notturno su molti contatti potrebbe essere lento | Media | Medio | Batch processing con chunk di 100. Rate limiting. Skip contatti senza cambiamenti |
| R5 | **Overfitting su dataset piccoli** — modelli memorizzano noise invece di pattern | Alta | Alto | Cross-validation anche su dataset piccoli. Regularization forte. Preferire modelli con pochi parametri |
| R6 | **Scope creep ML** — tentazione di aggiungere feature AI complesse | Media | Medio | Hard stop: MVP usa solo modelli JS. Nessun fine-tuning di LLM. Nessun neural network |
| R7 | **Model drift non rilevato** — accuracy degrada senza che nessuno se ne accorga | Media | Alto | US-R036 governance dashboard. Alert automatico quando accuracy < 60% |

---

## Definition of Done

- [ ] Tutti i modelli ML hanno accuracy > 55% su cross-validation (o fallback a rule-based)
- [ ] Lead scoring calcolato per ogni contatto con >= 5 interazioni
- [ ] Deal scoring combina rule-based + ML con confidence level visibile
- [ ] Forecast genera previsioni con bande di confidenza per quarter
- [ ] Churn prediction flagga contatti a rischio con segnali spiegabili
- [ ] NBA suggerisce azioni contestuali per deal e contatti
- [ ] 6 nuovi AI chat tool registrati e funzionanti
- [ ] Governance dashboard mostra accuracy, costi e drift alert
- [ ] Ogni predizione AI tracciata in AiRunLedger con tenantId e featureType
- [ ] Tutti gli endpoint rispettano multi-tenant (tenantId obbligatorio)
- [ ] Nessuna dipendenza Python nel MVP (solo librerie JS)
- [ ] Score widgets integrati in contact detail e deal detail
- [ ] Batch jobs BullMQ configurati con retry e error handling
- [ ] Frontend type-check passa (`npx tsc --noEmit`)
- [ ] Backend type-check passa (`npx tsc --noEmit`)
