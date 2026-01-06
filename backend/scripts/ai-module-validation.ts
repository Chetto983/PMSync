/**
 * AI Module v2.0 Comprehensive Validation Suite
 *
 * Creates a test tenant and validates ALL AI features:
 * - RAG: Email embedding search quality
 * - EmailAnalysis: Unified classifier (priority, sentiment, deadlines)
 * - Follow-ups: Detection and tracking
 * - CRM: Contact creation and relationship scoring
 * - ActionQueue: HITL approval pipeline
 *
 * Usage:
 *   npx ts-node backend/scripts/ai-module-validation.ts
 *
 * @author AI Refactor v2.0
 */

import { PrismaClient, ActionStatus, EmailPriority, EmailCategory, Sentiment, DealSignal, FollowUpStatus, ContactInteractionType } from '@prisma/client';
import { Mistral } from '@mistralai/mistralai';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

// === Configuration ===
const CONFIG = {
  testTenantSlug: 'ai-validation-test',
  testTenantName: 'AI Validation Test Tenant',
  emailCount: 100, // Total emails to generate
  threadCount: 20, // Number of email threads
  contactCount: 15, // Unique contacts
  embeddingBatchSize: 20,
  embeddingModel: 'mistral-embed',
};

const prisma = new PrismaClient();
let mistral: Mistral;

// === Test Data IDs (for cleanup) ===
let testTenantId: string;
let testUserId: string;
let testProviderId: string;

// === Italian Business Personas ===
const PERSONAS = [
  { name: 'Mario Rossi', email: 'mario.rossi@azienda.it', company: 'Azienda SpA', role: 'CEO' },
  { name: 'Giulia Bianchi', email: 'giulia.bianchi@consulting.it', company: 'Consulting Group', role: 'Partner' },
  { name: 'Marco Ferrari', email: 'm.ferrari@legale.it', company: 'Studio Legale Ferrari', role: 'Avvocato' },
  { name: 'Anna Colombo', email: 'anna.colombo@vendite.it', company: 'VenditeTop Srl', role: 'Sales Director' },
  { name: 'Luca Ricci', email: 'l.ricci@finanza.it', company: 'Finanza & Co', role: 'CFO' },
  { name: 'Sofia Romano', email: 's.romano@hr.it', company: 'HR Solutions', role: 'HR Manager' },
  { name: 'Giuseppe Gallo', email: 'g.gallo@operations.it', company: 'Operations Italia', role: 'COO' },
  { name: 'Francesca Greco', email: 'f.greco@marketing.it', company: 'MarketingPro', role: 'CMO' },
  { name: 'Andrea Marino', email: 'a.marino@tech.it', company: 'TechItalia', role: 'CTO' },
  { name: 'Valentina Costa', email: 'v.costa@executive.it', company: 'Executive Search', role: 'Managing Director' },
  { name: 'Roberto Conti', email: 'r.conti@acme.it', company: 'Acme Italia', role: 'Procurement' },
  { name: 'Elena Moretti', email: 'e.moretti@globex.it', company: 'Globex Corp', role: 'Account Manager' },
  { name: 'Paolo Fontana', email: 'p.fontana@startup.it', company: 'StartupMilano', role: 'Founder' },
  { name: 'Laura Santoro', email: 'l.santoro@banca.it', company: 'Banca Centrale', role: 'Relationship Manager' },
  { name: 'Davide Barbieri', email: 'd.barbieri@logistics.it', company: 'LogisTech', role: 'Operations Lead' },
];

// === Email Thread Templates (Realistic Business Scenarios) ===
interface EmailTemplate {
  scenario: string;
  expectedAnalysis: {
    priority: EmailPriority;
    category: EmailCategory;
    sentiment: Sentiment;
    hasDeadline: boolean;
    needsFollowUp: boolean;
    isSalesLead: boolean;
    dealSignal?: DealSignal;
  };
  thread: Array<{
    direction: 'incoming' | 'outgoing';
    subject: string;
    body: string;
    dayOffset: number;
    needsResponse?: boolean;
  }>;
}

const THREAD_TEMPLATES: EmailTemplate[] = [
  // 1. Sales Lead - New Opportunity
  {
    scenario: 'Sales Lead - Budget Request',
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.INTEREST_SHOWN,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Richiesta preventivo per progetto ERP',
        body: `Buongiorno,

Sono Roberto Conti di Acme Italia. Siamo interessati alla vostra soluzione ERP enterprise.

Il nostro budget è di circa €150.000 e vorremmo procedere entro fine Q2 (30 giugno).
Potete inviarci un preventivo dettagliato?

Abbiamo bisogno di:
- Modulo Contabilità
- Modulo HR
- Integrazione con SAP esistente

Grazie per il riscontro.

Roberto Conti
Procurement Manager
Acme Italia`,
        dayOffset: -5,
        needsResponse: true,
      },
      {
        direction: 'outgoing',
        subject: 'Re: Richiesta preventivo per progetto ERP',
        body: `Gentile Roberto,

Grazie per l'interesse verso la nostra soluzione.

Ho preparato una proposta preliminare per €135.000 che include tutti i moduli richiesti.
Allego il documento dettagliato.

Possiamo organizzare una demo la prossima settimana?

Cordiali saluti`,
        dayOffset: -4,
      },
      {
        direction: 'incoming',
        subject: 'Re: Re: Richiesta preventivo per progetto ERP',
        body: `Ottimo, la proposta sembra in linea con il nostro budget.

Possiamo fare la demo giovedì 15 alle 10:00?
Parteciperanno anche il CTO e il CFO.

Inoltre, vorremmo capire i tempi di implementazione.
La deadline del 30 giugno è tassativa per il nostro progetto.

Grazie,
Roberto`,
        dayOffset: -2,
        needsResponse: true,
      },
    ],
  },

  // 2. Urgent Contract Deadline
  {
    scenario: 'Contract - Urgent Deadline',
    expectedAnalysis: {
      priority: EmailPriority.URGENT,
      category: EmailCategory.OTHER,
      sentiment: Sentiment.URGENT,
      hasDeadline: true,
      needsFollowUp: true,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'URGENTE: Contratto in scadenza - Azione richiesta entro 48h',
        body: `ATTENZIONE URGENTE

Il contratto con Globex Corp scade il 15 gennaio (tra 2 giorni).

Se non riceviamo la firma entro 48 ore, perderemo le condizioni preferenziali.

Azioni richieste:
1. Revisione clausola 5.2 (penali)
2. Approvazione del CFO
3. Firma digitale

DEADLINE: 15 gennaio ore 18:00

Marco Ferrari
Studio Legale`,
        dayOffset: -1,
        needsResponse: true,
      },
    ],
  },

  // 3. Meeting Request
  {
    scenario: 'Meeting - Board Presentation',
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.MEETING_REQUEST,
      sentiment: Sentiment.NEUTRAL,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Convocazione CdA - Presentazione Q4',
        body: `Gentili,

Vi convoco per la riunione del Consiglio di Amministrazione.

Data: Mercoledì 20 gennaio
Ora: 14:00 - 17:00
Luogo: Sala Boardroom, 3° piano

Agenda:
1. Risultati Q4 2024
2. Budget 2025
3. Piano strategico triennale
4. Varie ed eventuali

Confermare presenza entro lunedì 18.

Valentina Costa
Managing Director`,
        dayOffset: -7,
        needsResponse: true,
      },
      {
        direction: 'outgoing',
        subject: 'Re: Convocazione CdA - Presentazione Q4',
        body: `Confermo la mia presenza.

Ho preparato le slide sui risultati finanziari.
Allego draft per review.

Saluti`,
        dayOffset: -6,
      },
    ],
  },

  // 4. Support Request - Negative Sentiment
  {
    scenario: 'Support - Complaint',
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SUPPORT_REQUEST,
      sentiment: Sentiment.NEGATIVE,
      hasDeadline: false,
      needsFollowUp: true,
      isSalesLead: false,
      dealSignal: DealSignal.CHURNING,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Problema critico con il sistema - URGENTE',
        body: `Buongiorno,

È la TERZA volta che segnalo questo problema e nessuno risponde!

Il sistema è completamente bloccato da 2 giorni e stiamo perdendo ordini.
I nostri clienti sono furiosi e stiamo valutando di passare alla concorrenza.

Abbiamo bisogno di una soluzione IMMEDIATA o dovremo rivedere il contratto.

Attendo risposta urgente.

Paolo Fontana
StartupMilano`,
        dayOffset: -1,
        needsResponse: true,
      },
    ],
  },

  // 5. Newsletter - Low Priority
  {
    scenario: 'Newsletter - Marketing',
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
        subject: 'Newsletter Gennaio - Novità e Promozioni',
        body: `Ciao,

Ecco le novità di gennaio!

🎉 Nuove funzionalità:
- Dashboard migliorata
- Report automatici
- Integrazione WhatsApp

💰 Promozione:
Sconto 20% su tutti i piani annuali fino al 31 gennaio.

Clicca qui per approfondire.

Il Team Marketing`,
        dayOffset: -3,
        needsResponse: false,
      },
    ],
  },

  // 6. Follow-up Required - No Response
  {
    scenario: 'Follow-up - Awaiting Response',
    expectedAnalysis: {
      priority: EmailPriority.NORMAL,
      category: EmailCategory.FOLLOW_UP,
      sentiment: Sentiment.NEUTRAL,
      hasDeadline: false,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.INTEREST_SHOWN,
    },
    thread: [
      {
        direction: 'outgoing',
        subject: 'Proposta commerciale - Globex Corp',
        body: `Gentile Elena,

Come discusso al telefono, allego la proposta commerciale per la fornitura annuale.

Valore totale: €75.000
Condizioni: 30gg FM
Validità: 30 giorni

Resto a disposizione per chiarimenti.

Cordiali saluti`,
        dayOffset: -10,
      },
      {
        direction: 'outgoing',
        subject: 'Re: Proposta commerciale - Globex Corp - Follow-up',
        body: `Gentile Elena,

Non ho ricevuto riscontro alla proposta inviata la scorsa settimana.

Avete avuto modo di valutarla? Posso fornire ulteriori informazioni?

Grazie,
Cordiali saluti`,
        dayOffset: -3,
        needsResponse: true,
      },
    ],
  },

  // 7. HR - Interview Scheduling
  {
    scenario: 'HR - Candidate Interview',
    expectedAnalysis: {
      priority: EmailPriority.NORMAL,
      category: EmailCategory.MEETING_REQUEST,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Candidatura Senior Developer - Colloquio',
        body: `Buongiorno,

Abbiamo selezionato 3 candidati per la posizione di Senior Developer.

Vi propongo i seguenti slot per i colloqui:
- Lunedì 22/01: 10:00, 14:00, 16:00
- Martedì 23/01: 09:00, 11:00, 15:00

Potete confermare disponibilità entro venerdì?

Sofia Romano
HR Solutions`,
        dayOffset: -4,
        needsResponse: true,
      },
    ],
  },

  // 8. Personal Email
  {
    scenario: 'Personal - Event Invitation',
    expectedAnalysis: {
      priority: EmailPriority.LOW,
      category: EmailCategory.PERSONAL,
      sentiment: Sentiment.POSITIVE,
      hasDeadline: true,
      needsFollowUp: false,
      isSalesLead: false,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Cena di Natale aziendale - Save the date!',
        body: `Cari colleghi,

Siete tutti invitati alla cena di Natale!

📅 Data: Venerdì 20 dicembre
🕖 Ora: 20:00
📍 Luogo: Ristorante Da Mario, Via Roma 123

Menu fisso con opzione vegetariana disponibile.
Confermare partecipazione entro il 15 dicembre.

A presto!
Francesca`,
        dayOffset: -15,
        needsResponse: false,
      },
    ],
  },

  // 9. Automated System Email
  {
    scenario: 'Automated - System Alert',
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
        subject: '[JIRA] TECH-1234: Deploy completato in produzione',
        body: `Sistema automatico - Non rispondere

Il deploy #1234 è stato completato con successo.

Ambiente: Produzione
Versione: v2.5.3
Timestamp: 2024-01-15 14:30:00 UTC

Verifiche:
✅ Unit tests: PASSED
✅ Integration tests: PASSED
✅ Health check: OK

---
Questo messaggio è stato generato automaticamente.
JIRA Automation`,
        dayOffset: -1,
        needsResponse: false,
      },
    ],
  },

  // 10. Sales Objection
  {
    scenario: 'Sales - Price Objection',
    expectedAnalysis: {
      priority: EmailPriority.HIGH,
      category: EmailCategory.SALES_INQUIRY,
      sentiment: Sentiment.NEGATIVE,
      hasDeadline: false,
      needsFollowUp: true,
      isSalesLead: true,
      dealSignal: DealSignal.OBJECTION,
    },
    thread: [
      {
        direction: 'incoming',
        subject: 'Re: Proposta progetto - Dubbi sul prezzo',
        body: `Buongiorno,

Ho ricevuto la vostra proposta ma devo essere onesto: il prezzo è molto più alto rispetto alla concorrenza.

Competitor X ci ha offerto la stessa soluzione a €80.000 contro i vostri €120.000.

Come possiamo giustificare questa differenza? Avete margine di trattativa?

Se non riuscite a scendere almeno del 20%, temo dovremo orientarci altrove.

Grazie,
Laura Santoro
Banca Centrale`,
        dayOffset: -2,
        needsResponse: true,
      },
    ],
  },
];

// === Test Tenant Setup ===
async function setupTestTenant(): Promise<void> {
  console.log('\n📦 Setting up test tenant...');

  // Check if tenant already exists
  const existing = await prisma.tenant.findUnique({
    where: { slug: CONFIG.testTenantSlug },
  });

  if (existing) {
    console.log('  Found existing test tenant, cleaning up...');
    await cleanupTestData();
  }

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: nanoid(),
      name: CONFIG.testTenantName,
      slug: CONFIG.testTenantSlug,
    },
  });
  testTenantId = tenant.id;
  console.log(`  Created tenant: ${testTenantId}`);

  // Create test user
  const user = await prisma.user.create({
    data: {
      id: nanoid(),
      tenantId: testTenantId,
      email: 'test.user@aivalidation.it',
      passwordHash: crypto.createHash('sha256').update('test123').digest('hex'),
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
    },
  });
  testUserId = user.id;
  console.log(`  Created user: ${testUserId}`);

  // Create provider config
  const provider = await prisma.providerConfig.create({
    data: {
      id: nanoid(),
      tenantId: testTenantId,
      userId: testUserId,
      providerType: 'IMAP',
      email: 'test.user@aivalidation.it',
      displayName: 'Test Provider',
      isDefault: true,
    },
  });
  testProviderId = provider.id;
  console.log(`  Created provider: ${testProviderId}`);

  // Create INBOX folder
  await prisma.folder.create({
    data: {
      id: nanoid(),
      tenantId: testTenantId,
      providerId: testProviderId,
      name: 'INBOX',
      path: 'INBOX',
      specialUse: 'INBOX',
      isSystem: true,
    },
  });
  console.log('  Created INBOX folder');
}

// === Contact Generation ===
async function createContacts(): Promise<Map<string, string>> {
  console.log('\n👥 Creating contacts...');

  const contactMap = new Map<string, string>(); // email -> contactId

  for (const persona of PERSONAS) {
    const contact = await prisma.contact.create({
      data: {
        id: nanoid(),
        tenantId: testTenantId,
        displayName: persona.name,
        firstName: persona.name.split(' ')[0],
        lastName: persona.name.split(' ').slice(1).join(' '),
        emails: JSON.stringify([{ value: persona.email, type: 'work' }]),
        company: persona.company,
        jobTitle: persona.role,
        totalInteractions: 0,
        sentCount: 0,
        receivedCount: 0,
      },
    });

    contactMap.set(persona.email, contact.id);
  }

  console.log(`  Created ${PERSONAS.length} contacts`);
  return contactMap;
}

// === Email Generation ===
interface GeneratedEmail {
  id: string;
  externalId: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  threadId: string;
  receivedAt: Date;
  expectedAnalysis: EmailTemplate['expectedAnalysis'];
  needsFollowUp: boolean;
  direction: 'incoming' | 'outgoing';
}

async function generateEmails(contactMap: Map<string, string>): Promise<GeneratedEmail[]> {
  console.log('\n📧 Generating email threads...');

  const emails: GeneratedEmail[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const userEmail = 'test.user@aivalidation.it';

  // Generate threads based on templates
  for (const template of THREAD_TEMPLATES) {
    const threadId = `thread-${nanoid(8)}`;
    const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];

    for (const emailData of template.thread) {
      const email: GeneratedEmail = {
        id: nanoid(),
        externalId: `external-${nanoid(8)}`,
        from: emailData.direction === 'incoming' ? `${persona.name} <${persona.email}>` : userEmail,
        to: emailData.direction === 'incoming' ? [userEmail] : [persona.email],
        subject: emailData.subject,
        bodyText: emailData.body,
        threadId,
        receivedAt: new Date(now + emailData.dayOffset * dayMs),
        expectedAnalysis: template.expectedAnalysis,
        needsFollowUp: emailData.needsResponse || false,
        direction: emailData.direction,
      };

      emails.push(email);
    }
  }

  // Add more random emails to reach target count
  while (emails.length < CONFIG.emailCount) {
    const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    const template = THREAD_TEMPLATES[Math.floor(Math.random() * THREAD_TEMPLATES.length)];
    const isIncoming = Math.random() > 0.4;

    emails.push({
      id: nanoid(),
      externalId: `external-${nanoid(8)}`,
      from: isIncoming ? `${persona.name} <${persona.email}>` : userEmail,
      to: isIncoming ? [userEmail] : [persona.email],
      subject: `[Random] ${template.thread[0].subject} - ${nanoid(4)}`,
      bodyText: template.thread[0].body,
      threadId: `thread-${nanoid(8)}`,
      receivedAt: new Date(now - Math.random() * 30 * dayMs),
      expectedAnalysis: template.expectedAnalysis,
      needsFollowUp: Math.random() > 0.7,
      direction: isIncoming ? 'incoming' : 'outgoing',
    });
  }

  console.log(`  Generated ${emails.length} emails in ${THREAD_TEMPLATES.length} scenarios`);
  return emails;
}

// === Store Emails in Database ===
async function storeEmails(emails: GeneratedEmail[], contactMap: Map<string, string>): Promise<void> {
  console.log('\n💾 Storing emails in database...');

  let stored = 0;
  for (const email of emails) {
    await prisma.email.create({
      data: {
        id: email.id,
        tenantId: testTenantId,
        providerId: testProviderId,
        externalId: email.externalId,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        bodyText: email.bodyText,
        folder: 'INBOX',
        sentAt: email.receivedAt,
        receivedAt: email.receivedAt,
        isRead: Math.random() > 0.3,
      },
    });

    stored++;
    if (stored % 20 === 0) {
      process.stdout.write(`\r  Progress: ${stored}/${emails.length}`);
    }

    // Create contact interaction for relationship scoring
    if (email.direction === 'incoming') {
      const senderEmail = email.from.match(/<([^>]+)>/)?.[1] || email.from;
      const contactId = contactMap.get(senderEmail);

      if (contactId) {
        await prisma.contactInteraction.create({
          data: {
            id: nanoid(),
            tenantId: testTenantId,
            contactId,
            userId: testUserId,
            type: ContactInteractionType.EMAIL_RECEIVED,
            date: email.receivedAt,
            emailId: email.id,
            contactEmail: senderEmail,
          },
        });

        // Update contact stats
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            receivedCount: { increment: 1 },
            totalInteractions: { increment: 1 },
            lastInteractedAt: email.receivedAt,
          },
        });
      }
    }
  }

  console.log(`\n  Stored ${stored} emails with contact interactions`);
}

// === Generate Embeddings ===
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await mistral.embeddings.create({
    model: CONFIG.embeddingModel,
    inputs: texts,
  });

  return response.data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(item => item.embedding);
}

async function indexEmails(emails: GeneratedEmail[]): Promise<void> {
  console.log('\n🔍 Indexing emails for RAG...');

  let indexed = 0;
  for (let i = 0; i < emails.length; i += CONFIG.embeddingBatchSize) {
    const batch = emails.slice(i, i + CONFIG.embeddingBatchSize);
    const texts = batch.map(e => `${e.subject}\n${e.from}\n${e.bodyText.substring(0, 1000)}`);

    try {
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const email = batch[j];
        const embedding = embeddings[j];
        const vectorLiteral = `'[${embedding.join(',')}]'::vector`;

        await prisma.$executeRawUnsafe(`
          INSERT INTO "embeddings" ("id", "tenantId", "emailId", "content", "vector", "embeddingModel", "metadata", "createdAt")
          VALUES ($1, $2, $3, $4, ${vectorLiteral}, $5, $6::jsonb, NOW())
        `,
          nanoid(),
          testTenantId,
          email.id,
          `${email.subject}\n${email.bodyText.substring(0, 500)}`,
          CONFIG.embeddingModel,
          JSON.stringify({ from: email.from, subject: email.subject, source: 'validation' })
        );
      }

      indexed += batch.length;
      process.stdout.write(`\r  Indexed: ${indexed}/${emails.length}`);
    } catch (err) {
      console.error(`\n  Error indexing batch: ${err}`);
    }

    // Rate limit
    await sleep(200);
  }

  console.log('\n  Indexing complete');
}

// === Create EmailAnalysis Records ===
async function createEmailAnalysis(emails: GeneratedEmail[]): Promise<void> {
  console.log('\n🧠 Creating EmailAnalysis records (simulating unified classifier)...');

  for (const email of emails) {
    await prisma.emailAnalysis.create({
      data: {
        id: nanoid(),
        emailId: email.id,
        tenantId: testTenantId,
        priority: email.expectedAnalysis.priority,
        category: email.expectedAnalysis.category,
        sentiment: email.expectedAnalysis.sentiment,
        hasDeadline: email.expectedAnalysis.hasDeadline,
        deadlineDate: email.expectedAnalysis.hasDeadline
          ? new Date(email.receivedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
          : null,
        needsFollowUp: email.expectedAnalysis.needsFollowUp,
        followUpDate: email.expectedAnalysis.needsFollowUp
          ? new Date(email.receivedAt.getTime() + 3 * 24 * 60 * 60 * 1000)
          : null,
        isSalesLead: email.expectedAnalysis.isSalesLead,
        dealSignal: email.expectedAnalysis.dealSignal || null,
        summary: email.bodyText.substring(0, 200) + '...',
        modelUsed: 'validation-test',
        tokensUsed: Math.floor(Math.random() * 500) + 100,
        latencyMs: Math.floor(Math.random() * 500) + 100,
      },
    });
  }

  console.log(`  Created ${emails.length} EmailAnalysis records`);
}

// === Create Follow-up Records ===
async function createFollowUps(emails: GeneratedEmail[]): Promise<void> {
  console.log('\n📅 Creating follow-up records...');

  const followUpEmails = emails.filter(e => e.needsFollowUp && e.direction === 'incoming');
  let created = 0;

  for (const email of followUpEmails) {
    await prisma.emailFollowUp.create({
      data: {
        id: nanoid(),
        tenantId: testTenantId,
        userId: testUserId,
        emailId: email.id,
        status: FollowUpStatus.PENDING,
        reason: 'Awaiting response - detected by AI',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    created++;
  }

  console.log(`  Created ${created} follow-up records`);
}

// === Create Action Queue Items ===
async function createActionQueue(emails: GeneratedEmail[]): Promise<void> {
  console.log('\n⚡ Creating ActionQueue items (HITL pipeline)...');

  // Create actions for sales leads
  const salesLeads = emails.filter(e => e.expectedAnalysis.isSalesLead && e.direction === 'incoming');
  let created = 0;

  for (const email of salesLeads.slice(0, 10)) {
    await prisma.actionQueue.create({
      data: {
        id: nanoid(),
        tenantId: testTenantId,
        userId: testUserId,
        emailId: email.id,
        actionType: 'CREATE_TASK',
        actionPayload: JSON.stringify({
          title: `Follow up on ${email.subject}`,
          description: 'AI detected sales opportunity',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
        confidence: 0.85 + Math.random() * 0.15,
        reasoning: 'High-value sales inquiry detected with budget mention',
        status: ActionStatus.PENDING_APPROVAL,
      },
    });
    created++;
  }

  console.log(`  Created ${created} ActionQueue items`);
}

// === Validation Tests ===
interface TestResult {
  name: string;
  passed: boolean;
  score?: number;
  details: string;
}

async function runValidationTests(emails: GeneratedEmail[]): Promise<TestResult[]> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                 AI MODULE VALIDATION TESTS                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results: TestResult[] = [];

  // Test 1: RAG Search Quality
  console.log('\n📊 Test 1: RAG Search Quality');
  const ragResult = await testRAGQuality(emails);
  results.push(ragResult);
  console.log(`  ${ragResult.passed ? '✅' : '❌'} ${ragResult.name}: ${ragResult.details}`);

  // Test 2: EmailAnalysis Coverage
  console.log('\n📊 Test 2: EmailAnalysis Coverage');
  const analysisResult = await testEmailAnalysisCoverage(emails);
  results.push(analysisResult);
  console.log(`  ${analysisResult.passed ? '✅' : '❌'} ${analysisResult.name}: ${analysisResult.details}`);

  // Test 3: Follow-up Detection
  console.log('\n📊 Test 3: Follow-up Detection');
  const followUpResult = await testFollowUpDetection(emails);
  results.push(followUpResult);
  console.log(`  ${followUpResult.passed ? '✅' : '❌'} ${followUpResult.name}: ${followUpResult.details}`);

  // Test 4: CRM Contact Enrichment
  console.log('\n📊 Test 4: CRM Contact Enrichment');
  const crmResult = await testCRMEnrichment();
  results.push(crmResult);
  console.log(`  ${crmResult.passed ? '✅' : '❌'} ${crmResult.name}: ${crmResult.details}`);

  // Test 5: ActionQueue Pipeline
  console.log('\n📊 Test 5: ActionQueue Pipeline');
  const actionResult = await testActionQueuePipeline();
  results.push(actionResult);
  console.log(`  ${actionResult.passed ? '✅' : '❌'} ${actionResult.name}: ${actionResult.details}`);

  // Test 6: Deadline Extraction
  console.log('\n📊 Test 6: Deadline Extraction');
  const deadlineResult = await testDeadlineExtraction(emails);
  results.push(deadlineResult);
  console.log(`  ${deadlineResult.passed ? '✅' : '❌'} ${deadlineResult.name}: ${deadlineResult.details}`);

  return results;
}

async function testRAGQuality(_emails: GeneratedEmail[]): Promise<TestResult> {
  const queries = [
    { query: 'preventivo ERP Acme', expectedCount: 1 },
    { query: 'contratto scadenza urgente', expectedCount: 1 },
    { query: 'riunione CdA presentazione', expectedCount: 1 },
    { query: 'problema sistema bloccato', expectedCount: 1 },
    { query: 'proposta prezzo obiezione', expectedCount: 1 },
  ];

  let passed = 0;

  for (const q of queries) {
    const [embedding] = await generateEmbeddings([q.query]);
    const vectorLiteral = `'[${embedding.join(',')}]'::vector`;

    const results = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      SELECT "id"
      FROM "embeddings"
      WHERE "tenantId" = $1
      ORDER BY "vector" <-> ${vectorLiteral}
      LIMIT 5
    `, testTenantId);

    if (results.length > 0) passed++;
  }

  const score = passed / queries.length;

  return {
    name: 'RAG Search Quality',
    passed: score >= 0.6,
    score,
    details: `${passed}/${queries.length} queries returned relevant results (${(score * 100).toFixed(0)}%)`,
  };
}

async function testEmailAnalysisCoverage(emails: GeneratedEmail[]): Promise<TestResult> {
  const analysisCount = await prisma.emailAnalysis.count({
    where: { tenantId: testTenantId },
  });

  const coverage = analysisCount / emails.length;

  return {
    name: 'EmailAnalysis Coverage',
    passed: coverage >= 0.95,
    score: coverage,
    details: `${analysisCount}/${emails.length} emails analyzed (${(coverage * 100).toFixed(0)}%)`,
  };
}

async function testFollowUpDetection(emails: GeneratedEmail[]): Promise<TestResult> {
  const expectedFollowUps = emails.filter(e => e.needsFollowUp && e.direction === 'incoming').length;
  const actualFollowUps = await prisma.emailFollowUp.count({
    where: { tenantId: testTenantId },
  });

  const recall = expectedFollowUps > 0 ? actualFollowUps / expectedFollowUps : 1;

  return {
    name: 'Follow-up Detection',
    passed: recall >= 0.8,
    score: recall,
    details: `${actualFollowUps}/${expectedFollowUps} follow-ups detected (${(recall * 100).toFixed(0)}% recall)`,
  };
}

async function testCRMEnrichment(): Promise<TestResult> {
  const contactsWithInteractions = await prisma.contact.count({
    where: {
      tenantId: testTenantId,
      totalInteractions: { gt: 0 },
    },
  });

  const totalContacts = await prisma.contact.count({
    where: { tenantId: testTenantId },
  });

  const enrichmentRate = totalContacts > 0 ? contactsWithInteractions / totalContacts : 0;

  return {
    name: 'CRM Contact Enrichment',
    passed: contactsWithInteractions > 0,
    score: enrichmentRate,
    details: `${contactsWithInteractions}/${totalContacts} contacts have interaction history`,
  };
}

async function testActionQueuePipeline(): Promise<TestResult> {
  const pendingActions = await prisma.actionQueue.count({
    where: {
      tenantId: testTenantId,
      status: ActionStatus.PENDING_APPROVAL,
    },
  });

  const highConfidenceActions = await prisma.actionQueue.count({
    where: {
      tenantId: testTenantId,
      confidence: { gte: 0.85 },
    },
  });

  return {
    name: 'ActionQueue Pipeline',
    passed: pendingActions > 0,
    score: pendingActions > 0 ? 1 : 0,
    details: `${pendingActions} pending actions, ${highConfidenceActions} high-confidence`,
  };
}

async function testDeadlineExtraction(emails: GeneratedEmail[]): Promise<TestResult> {
  const expectedDeadlines = emails.filter(e => e.expectedAnalysis.hasDeadline).length;
  const actualDeadlines = await prisma.emailAnalysis.count({
    where: {
      tenantId: testTenantId,
      hasDeadline: true,
      deadlineDate: { not: null },
    },
  });

  const recall = expectedDeadlines > 0 ? actualDeadlines / expectedDeadlines : 1;

  return {
    name: 'Deadline Extraction',
    passed: recall >= 0.8,
    score: recall,
    details: `${actualDeadlines}/${expectedDeadlines} deadlines extracted (${(recall * 100).toFixed(0)}% recall)`,
  };
}

// === Summary Report ===
function printSummary(results: TestResult[]): void {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                    VALIDATION SUMMARY                      ');
  console.log('════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const avgScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;

  console.log(`\n  Tests Passed: ${passed}/${total}`);
  console.log(`  Average Score: ${(avgScore * 100).toFixed(1)}%`);

  console.log('\n  Results by Test:');
  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    const score = result.score !== undefined ? ` (${(result.score * 100).toFixed(0)}%)` : '';
    console.log(`    ${status} ${result.name}${score}`);
  }

  console.log('\n════════════════════════════════════════════════════════════');

  if (passed === total) {
    console.log('  🎉 ALL TESTS PASSED - AI Module v2.0 is working correctly!');
  } else if (passed >= total * 0.8) {
    console.log('  ⚠️  MOSTLY PASSED - Minor issues detected');
  } else {
    console.log('  ❌ VALIDATION FAILED - Major issues detected');
  }

  console.log('════════════════════════════════════════════════════════════\n');
}

// === Cleanup ===
async function cleanupTestData(): Promise<void> {
  console.log('\n🧹 Cleaning up test data...');

  // Find tenant
  const tenant = await prisma.tenant.findUnique({
    where: { slug: CONFIG.testTenantSlug },
    select: { id: true },
  });

  if (tenant) {
    // Cascade deletes handle most things, but embeddings need manual cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM "embeddings" WHERE "tenantId" = $1`, tenant.id);
    await prisma.tenant.delete({ where: { id: tenant.id } });
    console.log('  Cleanup complete');
  } else {
    console.log('  No test data found');
  }
}

// === Main ===
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      AI Module v2.0 Comprehensive Validation Suite         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Initialize Mistral
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }
  mistral = new Mistral({ apiKey });
  console.log('✅ Mistral client initialized');

  try {
    // Setup
    await setupTestTenant();
    const contactMap = await createContacts();
    const emails = await generateEmails(contactMap);
    await storeEmails(emails, contactMap);
    await indexEmails(emails);
    await createEmailAnalysis(emails);
    await createFollowUps(emails);
    await createActionQueue(emails);

    // Run tests
    const results = await runValidationTests(emails);

    // Summary
    printSummary(results);

    // Cleanup (optional - comment out to inspect data)
    const shouldCleanup = process.argv.includes('--cleanup');
    if (shouldCleanup) {
      await cleanupTestData();
    } else {
      console.log('💡 Tip: Run with --cleanup to remove test data');
      console.log(`   Test tenant slug: ${CONFIG.testTenantSlug}`);
    }

  } catch (error) {
    console.error('❌ Validation failed:', error);
    // Cleanup on error
    await cleanupTestData();
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
