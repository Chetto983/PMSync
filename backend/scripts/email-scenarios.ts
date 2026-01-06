/**
 * Realistic Italian Business Email Scenarios
 *
 * Based on:
 * - Enron Corpus patterns (CEO vs Manager vs Analyst communication styles)
 * - B2B Sales Pipeline stages (Prospecting → Closing)
 * - Italian business communication norms
 *
 * @see https://www.cs.cmu.edu/~enron/
 * @see https://martal.ca/b2b-sales-process-lb/
 */

import { EmailPriority, EmailCategory, Sentiment, DealSignal } from '@prisma/client';

// === Role-Based Communication Patterns (from Enron research) ===
export const ROLE_PATTERNS = {
  ceo: {
    // CEOs are "directive" - send more than receive
    sendReceiveRatio: 1.8,
    // Frequent use of "our company", "we", "vision", "strategy"
    keywords: ['nostra azienda', 'nostro gruppo', 'visione', 'strategia', 'leadership', 'crescita', 'board'],
    // Formal but inspiring tone
    style: 'formal_inspiring',
    avgEmailLength: 'medium', // Concise but authoritative
    responseTime: 'slow', // 24-48h (busy schedule)
  },
  salesDirector: {
    sendReceiveRatio: 1.5,
    keywords: ['pipeline', 'target', 'revenue', 'deal', 'cliente', 'proposta', 'chiusura', 'forecast'],
    style: 'persuasive',
    avgEmailLength: 'medium',
    responseTime: 'fast', // 2-4h
  },
  seller: {
    sendReceiveRatio: 2.0, // Heavy outbound
    keywords: ['proposta', 'preventivo', 'demo', 'call', 'sconto', 'offerta', 'valore', 'ROI'],
    style: 'persuasive',
    avgEmailLength: 'medium',
    responseTime: 'very_fast', // <2h
  },
  manager: {
    sendReceiveRatio: 1.0, // Balanced
    keywords: ['team', 'progetto', 'deadline', 'update', 'riunione', 'milestone', 'risorse'],
    style: 'balanced',
    avgEmailLength: 'medium',
    responseTime: 'medium', // 4-8h
  },
  analyst: {
    sendReceiveRatio: 0.6, // Receive more (requests for analysis)
    keywords: ['dati', 'report', 'analisi', 'trend', 'numeri', 'insight', 'metriche'],
    style: 'technical',
    avgEmailLength: 'long', // Detailed explanations
    responseTime: 'medium',
  },
};

// === B2B Sales Pipeline Stages ===
export enum SalesPipelineStage {
  PROSPECTING = 'prospecting',
  QUALIFICATION = 'qualification',
  NEEDS_ANALYSIS = 'needs_analysis',
  PROPOSAL = 'proposal',
  OBJECTION = 'objection',
  NEGOTIATION = 'negotiation',
  CLOSING = 'closing',
  POST_SALE = 'post_sale',
}

// === Comprehensive Email Thread Scenarios ===
export interface EmailScenario {
  id: string;
  title: string;
  description: string;
  pipelineStage?: SalesPipelineStage;
  actors: {
    sender: { name: string; email: string; role: keyof typeof ROLE_PATTERNS; company: string };
    recipient: { name: string; email: string; role: keyof typeof ROLE_PATTERNS; company: string };
  };
  expectedAnalysis: {
    priority: EmailPriority;
    category: EmailCategory;
    sentiment: Sentiment;
    hasDeadline: boolean;
    needsFollowUp: boolean;
    isSalesLead: boolean;
    dealSignal?: DealSignal;
    buyingIntent?: number; // 0-1
  };
  thread: Array<{
    direction: 'incoming' | 'outgoing';
    dayOffset: number;
    subject: string;
    body: string;
    metadata?: {
      hasAttachment?: boolean;
      calendarInvite?: boolean;
      urgentFlag?: boolean;
      needsResponse?: boolean;
    };
  }>;
}

// === CEO Communication Scenarios ===
export const CEO_SCENARIOS: EmailScenario[] = [
  {
    id: 'ceo-strategy-update',
    title: 'CEO Strategic Update to Leadership',
    description: 'CEO communicates Q1 strategic priorities to leadership team',
    actors: {
      sender: { name: 'Valentina Costa', email: 'v.costa@techitalia.it', role: 'ceo', company: 'TechItalia SpA' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'manager', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.OTHER,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -3,
        subject: 'Priorità Strategiche Q1 2025 - Comunicazione al Leadership Team',
        body: `Cari membri del Leadership Team,

Con l'inizio del nuovo anno, desidero condividere con voi la nostra visione strategica per Q1 2025.

**Obiettivi Chiave:**
1. Espansione mercato DACH: +25% revenue
2. Lancio piattaforma AI Assistant: 15 Febbraio
3. Consolidamento partnership strategiche

**Budget allocato:** €2.5M per iniziative di crescita

Mi aspetto che ogni Business Unit presenti il proprio piano operativo entro il 20 gennaio.

La nostra azienda ha dimostrato resilienza nel 2024. Quest'anno, dobbiamo accelerare.

Vi convoco per un Town Hall lunedì 13 gennaio alle 10:00.

Un caro saluto,
Valentina Costa
CEO, TechItalia SpA`,
        metadata: { calendarInvite: true },
      },
    ],
  },
  {
    id: 'ceo-acquisition-discussion',
    title: 'CEO M&A Discussion',
    description: 'CEO discusses potential acquisition with board member',
    actors: {
      sender: { name: 'Giuseppe Gallo', email: 'g.gallo@investment.it', role: 'ceo', company: 'Investment Partners' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'ceo', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.URGENT,
      category: EmailCategory.OTHER,
      sentiment: Sentiment.NEUTRAL,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -1,
        subject: 'CONFIDENZIALE: Proposta Acquisizione DataFlow Srl',
        body: `Caro collega,

Come discusso nella nostra ultima board call, abbiamo identificato DataFlow Srl come target strategico per la nostra espansione nel settore data analytics.

**Valutazione preliminare:**
- Enterprise Value: €45M
- EBITDA margin: 22%
- Revenue growth: 35% YoY
- Team: 85 dipendenti (di cui 60 engineers)

**Punti critici:**
- Due diligence tecnica richiesta
- Esclusiva fino al 31 gennaio
- Competitor interessato: DataTech AG

Ti chiedo di autorizzare il mandato per la due diligence entro domani sera.

Il nostro advisor legale è già stato informato.

Cordialmente,
Giuseppe Gallo
Managing Partner`,
        metadata: { urgentFlag: true, needsResponse: true },
      },
      {
        direction: 'outgoing',
        dayOffset: 0,
        subject: 'Re: CONFIDENZIALE: Proposta Acquisizione DataFlow Srl',
        body: `Giuseppe,

Autorizzazione concessa per la due diligence. Procedete.

Ho alcune riserve sul pricing che discuteremo nel board di giovedì.

Manteniamo la massima riservatezza.

Saluti`,
      },
    ],
  },
];

// === Sales Pipeline Scenarios (Complete B2B Journey) ===
export const SALES_PIPELINE_SCENARIOS: EmailScenario[] = [
  // Stage 1: Prospecting
  {
    id: 'sales-1-prospecting',
    title: 'Initial Cold Outreach',
    description: 'Seller initiates contact with potential client',
    pipelineStage: SalesPipelineStage.PROSPECTING,
    actors: {
      sender: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
      recipient: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
    },
    expectedAnalysis: {
      priority: EmailPriority.NORMAL,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: false,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.NEW_LEAD,
      buyingIntent: 0.2,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: -14,
        subject: 'Ottimizzazione processi IT per Acme Italia',
        body: `Gentile Dott. Conti,

Mi permetto di contattarLa perché ho notato che Acme Italia sta espandendo le proprie operazioni nel Nord Italia.

Presso TechSolutions aiutiamo aziende come la Sua a:
- Ridurre i costi IT del 30%
- Automatizzare i processi manuali
- Migliorare la sicurezza dei dati

Aziende simili come Globex e TechCorp hanno ottenuto ROI del 250% nel primo anno.

Sarebbe disponibile per una breve call di 15 minuti la prossima settimana?

Cordiali saluti,
[Test User]
Account Executive`,
        metadata: { needsResponse: true },
      },
    ],
  },

  // Stage 2: Qualification (Lead responds with interest)
  {
    id: 'sales-2-qualification',
    title: 'Lead Qualification Response',
    description: 'Prospect responds with initial interest and questions',
    pipelineStage: SalesPipelineStage.QUALIFICATION,
    actors: {
      sender: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: false,
      needsFollowUp: false,
      isSalesLead: true,
      dealSignal: DealSignal.INTEREST_SHOWN,
      buyingIntent: 0.4,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: -14,
        subject: 'Ottimizzazione processi IT per Acme Italia',
        body: `[Previous cold email]`,
      },
      {
        direction: 'incoming',
        dayOffset: -12,
        subject: 'Re: Ottimizzazione processi IT per Acme Italia',
        body: `Buongiorno,

La sua email è arrivata al momento giusto. Stiamo effettivamente valutando soluzioni per modernizzare la nostra infrastruttura IT.

Alcune domande iniziali:
1. Quali settori servite principalmente?
2. Il vostro sistema si integra con SAP?
3. Quali sono i tempi medi di implementazione?

Il nostro budget indicativo è di €100-150K per il 2025.

Possiamo organizzare una call giovedì alle 11:00?

Roberto Conti
IT Manager, Acme Italia`,
        metadata: { needsResponse: true },
      },
    ],
  },

  // Stage 3: Needs Analysis (Discovery call follow-up)
  {
    id: 'sales-3-needs-analysis',
    title: 'Discovery Call Summary',
    description: 'Seller summarizes needs analysis call',
    pipelineStage: SalesPipelineStage.NEEDS_ANALYSIS,
    actors: {
      sender: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
      recipient: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
    },
    expectedAnalysis: {
      priority: EmailPriority.NORMAL,
      category: EmailCategory.FOLLOW_UP,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.INTEREST_SHOWN,
      buyingIntent: 0.5,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: -10,
        subject: 'Riepilogo Discovery Call - Acme Italia x TechSolutions',
        body: `Gentile Roberto,

Grazie per il tempo dedicato alla nostra discovery call di oggi.

**Riepilogo delle vostre esigenze:**

1. **Pain Points identificati:**
   - Processi manuali di data entry (8h/giorno)
   - Integrazione frammentata tra SAP e sistemi legacy
   - Costi di manutenzione IT in crescita (+15% YoY)

2. **Obiettivi Q2 2025:**
   - Automazione processi core (-50% tempo)
   - Migrazione cloud per scalabilità
   - Dashboard real-time per management

3. **Stakeholder coinvolti:**
   - Roberto Conti (IT Manager) - Decision Maker Tecnico
   - Laura Santoro (CFO) - Budget Authority
   - Marco Ferrari (COO) - Sponsor Esecutivo

**Prossimi passi:**
- Invio proposta tecnica entro venerdì 17
- Demo personalizzata il 22 gennaio
- Proposta commerciale entro fine mese

Confermami se ho catturato correttamente le vostre priorità.

Cordiali saluti`,
        metadata: { hasAttachment: true },
      },
    ],
  },

  // Stage 4: Proposal
  {
    id: 'sales-4-proposal',
    title: 'Commercial Proposal',
    description: 'Seller sends formal proposal',
    pipelineStage: SalesPipelineStage.PROPOSAL,
    actors: {
      sender: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
      recipient: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.INTEREST_SHOWN,
      buyingIntent: 0.6,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: -7,
        subject: 'Proposta Commerciale TechSolutions per Acme Italia - €125.000',
        body: `Gentile Roberto,

Come promesso, allego la proposta commerciale personalizzata per Acme Italia.

**Executive Summary:**

| Componente | Valore |
|------------|--------|
| Licenze Enterprise (3 anni) | €75.000 |
| Implementazione & Setup | €35.000 |
| Training & Onboarding | €10.000 |
| Support Premium (anno 1) | €5.000 |
| **TOTALE** | **€125.000** |

**ROI Atteso:**
- Risparmio annuo stimato: €85.000
- Payback period: 18 mesi
- ROI a 3 anni: 320%

**Validità offerta:** 30 giorni (scade 15 febbraio)

**Condizioni speciali:**
- Sconto 10% per firma entro il 31 gennaio
- Payment plan: 40% anticipo, 60% a 30gg dal go-live

Resto a disposizione per discutere i dettagli.

Cordiali saluti`,
        metadata: { hasAttachment: true, needsResponse: true },
      },
    ],
  },

  // Stage 5: Objection Handling
  {
    id: 'sales-5-objection',
    title: 'Price Objection',
    description: 'Client raises price objection, mentions competitor',
    pipelineStage: SalesPipelineStage.OBJECTION,
    actors: {
      sender: { name: 'Laura Santoro', email: 'l.santoro@acme.it', role: 'analyst', company: 'Acme Italia' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.NEGATIVE,
      hasDeadline: false,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.OBJECTION,
      buyingIntent: 0.4,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -5,
        subject: 'Re: Proposta Commerciale TechSolutions per Acme Italia - Dubbi sul pricing',
        body: `Buongiorno,

Ho ricevuto la proposta da Roberto e devo essere diretta: il prezzo è significativamente più alto rispetto alle alternative che stiamo valutando.

**Situazione attuale:**
- DataTech AG ha proposto €85.000 per una soluzione simile
- SoftwareItalia offre €95.000 con supporto incluso
- La vostra proposta è €125.000 (+47% rispetto alla più economica)

**Le nostre preoccupazioni:**
1. Differenza di prezzo difficile da giustificare al board
2. Rischio implementazione su timeline stretta
3. Lock-in tecnologico a 3 anni

**Domanda diretta:**
Avete margine per ridurre il prezzo almeno del 20-25%? Altrimenti dovremo considerare seriamente le alternative.

Attendo riscontro.

Laura Santoro
CFO, Acme Italia`,
        metadata: { urgentFlag: true, needsResponse: true },
      },
    ],
  },

  // Stage 6: Negotiation (Objection Response)
  {
    id: 'sales-6-negotiation',
    title: 'Objection Response & Counter-Offer',
    description: 'Seller addresses objections with value justification',
    pipelineStage: SalesPipelineStage.NEGOTIATION,
    actors: {
      sender: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
      recipient: { name: 'Laura Santoro', email: 'l.santoro@acme.it', role: 'analyst', company: 'Acme Italia' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.NEGOTIATION,
      buyingIntent: 0.5,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: -4,
        subject: 'Re: Proposta Commerciale - Chiarimenti e proposta rivista',
        body: `Gentile Dott.ssa Santoro,

Apprezzo la sua trasparenza. Mi permetta di contestualizzare la differenza di prezzo.

**Perché il nostro pricing è diverso:**

| Caratteristica | TechSolutions | DataTech AG | SoftwareItalia |
|---------------|---------------|-------------|----------------|
| Integrazione SAP nativa | ✅ | ❌ | Limitata |
| SLA uptime | 99.9% | 99.5% | 99% |
| Support 24/7 | ✅ | Solo business hours | ❌ |
| AI-powered automation | ✅ | ❌ | ❌ |

**Costo nascosto competitor:**
- DataTech AG: +€25K/anno per integrazione SAP custom
- SoftwareItalia: +€15K per formazione aggiuntiva

**Proposta rivista (sconto speciale CEO):**

| Voce | Originale | Rivisto |
|------|-----------|---------|
| Licenze | €75.000 | €65.000 (-13%) |
| Implementazione | €35.000 | €32.000 |
| Training | €10.000 | INCLUSO |
| **NUOVO TOTALE** | €125.000 | **€97.000** (-22%) |

**Condizioni:**
- Firma entro 31 gennaio
- Pagamento: 50% anticipo, 50% a go-live
- SLA garantito contrattualmente

Possiamo organizzare una call con il nostro CEO per finalizzare?

Cordiali saluti`,
        metadata: { hasAttachment: true, needsResponse: true },
      },
    ],
  },

  // Stage 7: Closing
  {
    id: 'sales-7-closing',
    title: 'Deal Closing',
    description: 'Client accepts proposal and requests contract',
    pipelineStage: SalesPipelineStage.CLOSING,
    actors: {
      sender: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.URGENT,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: true,
      dealSignal: DealSignal.READY_TO_BUY,
      buyingIntent: 0.95,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -2,
        subject: 'Accettazione Proposta TechSolutions - Richiesta Contratto',
        body: `Buongiorno,

Ottime notizie! Dopo il meeting di ieri con il board, abbiamo deciso di procedere con TechSolutions.

**Decisione:**
✅ Proposta rivista di €97.000 approvata
✅ Budget allocato per Q1
✅ Kickoff previsto per 1 febbraio

**Prossimi passi:**
1. Inviateci il contratto definitivo entro domani
2. Il nostro legale effettuerà una review di 48h
3. Firma prevista entro il 30 gennaio

**Contatti per la firma:**
- Legale: avv.ferrari@acme.it
- Procurement: procurement@acme.it

Congratulazioni, è stata una trattativa costruttiva!

Roberto Conti
IT Manager, Acme Italia`,
        metadata: { urgentFlag: true },
      },
    ],
  },

  // Stage 8: Post-Sale (Implementation kick-off)
  {
    id: 'sales-8-postsale',
    title: 'Implementation Kick-off',
    description: 'Post-sale project kick-off email',
    pipelineStage: SalesPipelineStage.POST_SALE,
    actors: {
      sender: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
      recipient: { name: 'Roberto Conti', email: 'r.conti@acme.it', role: 'manager', company: 'Acme Italia' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.MEETING_REQUEST,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'outgoing',
        dayOffset: 0,
        subject: 'Benvenuto in TechSolutions! 🎉 Kick-off Meeting - 3 Febbraio',
        body: `Gentile Roberto,

È un piacere darti ufficialmente il benvenuto come cliente TechSolutions!

**Il tuo team di progetto:**
- Project Manager: Alessandro Verdi (a.verdi@techsolutions.it)
- Technical Lead: Maria Bianchi (m.bianchi@techsolutions.it)
- Support: support@techsolutions.it (24/7)

**Kick-off Meeting:**
📅 Data: Lunedì 3 Febbraio
🕙 Ora: 10:00 - 12:00
📍 Luogo: Call Zoom (link allegato)

**Agenda:**
1. Presentazione team
2. Review scope progetto
3. Timeline implementazione
4. Setup ambiente development
5. Q&A

**Da preparare:**
- Accessi ambiente SAP test
- Elenco stakeholder coinvolti
- Documentazione AS-IS processi

Allego il project charter e la timeline dettagliata.

Non vediamo l'ora di iniziare!

Cordiali saluti`,
        metadata: { calendarInvite: true, hasAttachment: true },
      },
    ],
  },
];

// === Support & Churn Scenarios ===
export const SUPPORT_SCENARIOS: EmailScenario[] = [
  {
    id: 'support-escalation',
    title: 'Critical System Down - Escalation',
    description: 'Angry customer escalating critical issue',
    actors: {
      sender: { name: 'Paolo Fontana', email: 'p.fontana@startup.it', role: 'ceo', company: 'StartupMilano' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'manager', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.URGENT,
      category: EmailCategory.SUPPORT_REQUEST,
      sentiment: Sentiment.NEGATIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: false,
      dealSignal: DealSignal.CHURNING,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: 0,
        subject: 'URGENTISSIMO: Sistema completamente bloccato da 6 ore!!!',
        body: `QUESTO È INACCETTABILE!

Sono il CEO di StartupMilano e il vostro sistema è DOWN da 6 ore!

Ho già contattato il support 3 VOLTE senza risposta!

IMPATTO:
- 50 ordini persi (€15.000 di revenue)
- 200 clienti che non possono accedere
- Il nostro team è completamente fermo
- La stampa ci sta contattando per commenti

Se non risolviamo entro 2 ore, saremo COSTRETTI a:
1. Richiedere rimborso completo dell'abbonamento
2. Consultare il nostro legale per danni
3. Migrare a un competitor

VOGLIO UNA CHIAMATA DAL VOSTRO CEO ENTRO 30 MINUTI!

Paolo Fontana
CEO, StartupMilano
+39 XXX XXX XXXX`,
        metadata: { urgentFlag: true, needsResponse: true },
      },
    ],
  },
  {
    id: 'support-churn-signal',
    title: 'Churn Warning - Contract Review Request',
    description: 'Customer signals potential churn',
    actors: {
      sender: { name: 'Elena Moretti', email: 'e.moretti@globex.it', role: 'manager', company: 'Globex Corp' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'seller', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.OTHER,
      sentiment: Sentiment.NEGATIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: false,
      dealSignal: DealSignal.CHURNING,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -3,
        subject: 'Revisione contratto in scadenza - Globex Corp',
        body: `Buongiorno,

Il nostro contratto scade il 28 febbraio e devo informarvi che stiamo valutando alternative.

**Motivi della revisione:**
- Negli ultimi 6 mesi abbiamo riscontrato 4 downtime significativi
- Il supporto non risponde nei tempi concordati (SLA violato 12 volte)
- Funzionalità promesse mai implementate
- Il prezzo è aumentato del 15% senza miglioramenti visibili

**Cosa ci aspettiamo per rinnovare:**
1. Sconto del 20% sul nuovo canone
2. SLA migliorato con penali automatiche
3. Account manager dedicato
4. Roadmap scritta delle funzionalità mancanti

Se non possiamo trovare un accordo, abbiamo già un preventivo da DataTech AG.

Attendo proposta entro il 15 febbraio.

Elena Moretti
Account Manager, Globex Corp`,
        metadata: { needsResponse: true },
      },
    ],
  },
];

// === Newsletter & Automated Scenarios ===
export const AUTOMATED_SCENARIOS: EmailScenario[] = [
  {
    id: 'newsletter-marketing',
    title: 'Marketing Newsletter',
    description: 'Monthly marketing newsletter',
    actors: {
      sender: { name: 'TechNews', email: 'newsletter@technews.it', role: 'manager', company: 'TechNews' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'manager', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.LOW,
      category: EmailCategory.NEWSLETTER,
      sentiment: Sentiment.NEUTRAL,
      hasDeadline: false,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -2,
        subject: '🚀 TechNews Gennaio 2025: AI Trends, Cloud, e molto altro!',
        body: `Ciao!

Ecco le notizie tech più importanti di gennaio 2025:

📰 TOP STORIES:
• OpenAI lancia GPT-5: cosa cambia per le aziende
• AWS riduce i prezzi del 30% sui servizi AI
• L'Italia stanzia €1.5B per la digitalizzazione PA

💡 TIPS & TRICKS:
• Come ottimizzare i costi cloud nel 2025
• 5 tool AI per la produttività

📅 EVENTI:
• 15-17 Marzo: Web Summit Lisbona
• 22 Marzo: AI Italy Conference Milano

---
Per disiscriverti: click qui
TechNews Srl | Via Roma 123, Milano`,
      },
    ],
  },
  {
    id: 'automated-system-alert',
    title: 'System Alert - Automated',
    description: 'Automated system notification',
    actors: {
      sender: { name: 'JIRA Automation', email: 'noreply@jira.company.it', role: 'analyst', company: 'JIRA' },
      recipient: { name: 'Test User', email: 'test.user@aivalidation.it', role: 'manager', company: 'Our Company' },
    },
    expectedAnalysis: {
      priority: EmailPriority.NORMAL,
      category: EmailCategory.AUTOMATED,
      sentiment: Sentiment.NEUTRAL,
      hasDeadline: false,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        dayOffset: -1,
        subject: '[JIRA] PROD-4521: Deploy v2.8.0 completato',
        body: `Questo è un messaggio automatico. Non rispondere.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPLOYMENT REPORT - PROD-4521
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: ✅ SUCCESS
Version: v2.8.0
Environment: Production
Timestamp: 2025-01-10 14:30:00 UTC
Duration: 12 minutes

Changes:
• FEAT-1234: New dashboard widgets
• FIX-5678: Memory leak in sync service
• PERF-9012: 40% faster API response

Tests:
✅ Unit Tests: 1,234 passed
✅ Integration: 456 passed
✅ E2E: 89 passed
✅ Performance: Within threshold

Rollback: Not required

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JIRA Automation | Do not reply`,
      },
    ],
  },
];

// === Export All Scenarios ===
export const ALL_SCENARIOS: EmailScenario[] = [
  ...CEO_SCENARIOS,
  ...SALES_PIPELINE_SCENARIOS,
  ...SUPPORT_SCENARIOS,
  ...AUTOMATED_SCENARIOS,
];

// === Helper: Generate emails from scenarios ===
export function generateEmailsFromScenarios(count: number): EmailScenario[] {
  const emails: EmailScenario[] = [];

  // First, include all predefined scenarios
  emails.push(...ALL_SCENARIOS);

  // Then, randomly duplicate scenarios to reach target count
  while (emails.length < count) {
    const randomScenario = ALL_SCENARIOS[Math.floor(Math.random() * ALL_SCENARIOS.length)];
    const cloned = JSON.parse(JSON.stringify(randomScenario)) as EmailScenario;
    cloned.id = `${cloned.id}-${emails.length}`;

    // Randomize dates
    for (const email of cloned.thread) {
      email.dayOffset = -Math.floor(Math.random() * 30);
    }

    emails.push(cloned);
  }

  return emails.slice(0, count);
}
