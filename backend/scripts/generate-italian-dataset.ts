/**
 * Italian Email Dataset Generator for RAG Testing
 *
 * Generates 1000 realistic Italian business emails with:
 * - Thread structure (conversations with replies)
 * - Contacts
 * - Realistic business scenarios
 * - Embeddings for RAG testing
 *
 * Usage:
 *   npx ts-node backend/scripts/generate-italian-dataset.ts
 *   npx ts-node backend/scripts/generate-italian-dataset.ts --cleanup
 *
 * @author MailAgent RAG Testing
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';
import { nanoid } from 'nanoid';

// === Prisma Client Factory ===
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();
let mistral: Mistral;

// === Configuration ===
const CONFIG = {
  testTenantSlug: 'italian-rag-test',
  testTenantName: 'Italian RAG Test',
  totalEmails: 1000,
  threadsCount: 200, // ~5 emails per thread average
  contactsCount: 100,
  embeddingModel: 'mistral-embed',
  batchSize: 10, // Embedding batch size
};

// === Italian Business Domains ===
const ITALIAN_COMPANIES = [
  'acme-italia.it', 'globex-srl.it', 'techsolutions.it', 'innovatech.it',
  'consulenza-pro.it', 'digitalfuture.it', 'sistemiweb.it', 'datacloud.it',
  'softwarehouse.it', 'greentech.it', 'finanzaconsulting.it', 'legalpartners.it',
  'marketingpro.it', 'hrservices.it', 'logisticaitalia.it', 'costruzionispa.it',
];

const ITALIAN_NAMES = [
  { first: 'Marco', last: 'Rossi' }, { first: 'Giulia', last: 'Bianchi' },
  { first: 'Alessandro', last: 'Romano' }, { first: 'Francesca', last: 'Colombo' },
  { first: 'Luca', last: 'Ferrari' }, { first: 'Valentina', last: 'Ricci' },
  { first: 'Andrea', last: 'Marino' }, { first: 'Chiara', last: 'Greco' },
  { first: 'Matteo', last: 'Bruno' }, { first: 'Sara', last: 'Gallo' },
  { first: 'Davide', last: 'Conti' }, { first: 'Elena', last: 'De Luca' },
  { first: 'Simone', last: 'Mancini' }, { first: 'Laura', last: 'Rizzo' },
  { first: 'Giuseppe', last: 'Lombardi' }, { first: 'Anna', last: 'Moretti' },
  { first: 'Federico', last: 'Barbieri' }, { first: 'Martina', last: 'Fontana' },
  { first: 'Roberto', last: 'Santoro' }, { first: 'Silvia', last: 'Mariani' },
  { first: 'Paolo', last: 'Costa' }, { first: 'Elisa', last: 'Giordano' },
  { first: 'Stefano', last: 'Rinaldi' }, { first: 'Alessia', last: 'Caruso' },
  { first: 'Giovanni', last: 'Esposito' }, { first: 'Claudia', last: 'Ferrara' },
];

const JOB_TITLES = [
  'Amministratore Delegato', 'Direttore Commerciale', 'Responsabile Marketing',
  'Project Manager', 'Developer Senior', 'HR Manager', 'CFO', 'CTO',
  'Account Manager', 'Business Analyst', 'Consulente', 'Avvocato',
  'Responsabile Acquisti', 'Direttore Operativo', 'Sales Manager',
];

// === Email Scenario Templates ===
interface EmailScenario {
  category: string;
  subject: string;
  body: string;
  replyTemplates?: string[];
}

const EMAIL_SCENARIOS: EmailScenario[] = [
  // Contratti e Accordi
  {
    category: 'contratto',
    subject: 'Rinnovo contratto servizi {YEAR} - {COMPANY}',
    body: `Gentile {NAME},

in riferimento al contratto n. {CONTRACT_ID} attualmente in essere con la Vostra azienda, siamo lieti di comunicarVi la nostra intenzione di procedere con il rinnovo per l'anno {YEAR}.

Le condizioni proposte prevedono:
- Importo annuale: €{AMOUNT}
- Durata: 12 mesi con rinnovo tacito
- SLA garantito: {SLA}%

Restiamo in attesa di un Vostro cortese riscontro.

Cordiali saluti`,
    replyTemplates: [
      `Grazie per la proposta. Abbiamo analizzato le condizioni e vorremmo discutere alcuni punti:
- L'importo proposto è superiore al budget previsto
- Chiediamo una revisione dello SLA
Possiamo organizzare una call?`,
      `Confermo ricezione della proposta. Procediamo pure con il rinnovo alle condizioni indicate.
Allego firma digitale del contratto.`,
    ],
  },
  // Budget e Finanza
  {
    category: 'budget',
    subject: 'Approvazione budget Q{QUARTER} {YEAR} - {DEPARTMENT}',
    body: `Buongiorno {NAME},

si richiede approvazione per il budget del {DEPARTMENT} relativo al Q{QUARTER} {YEAR}.

Dettaglio richiesta:
- Marketing: €{MARKETING_BUDGET}
- Personale: €{HR_BUDGET}
- Tecnologia: €{TECH_BUDGET}
- Totale: €{TOTAL_BUDGET}

Allegati: analisi comparativa anno precedente, forecast vendite.

Resto a disposizione per chiarimenti.`,
    replyTemplates: [
      `Budget approvato. Procedi con l'allocazione delle risorse come da piano presentato.`,
      `Prima di approvare necessito di ulteriori dettagli sulla voce "Tecnologia". Puoi fornire breakdown?`,
    ],
  },
  // Progetto Tecnico
  {
    category: 'tecnico',
    subject: 'Aggiornamento progetto {PROJECT_NAME} - Sprint {SPRINT}',
    body: `Ciao team,

aggiornamento sullo stato del progetto {PROJECT_NAME}:

Sprint {SPRINT} completato:
- Feature implementate: {FEATURES}
- Bug risolti: {BUGS}
- Velocity: {VELOCITY} story points

Prossimi passi:
- Release pianificata: {RELEASE_DATE}
- Demo cliente: {DEMO_DATE}

Criticità:
{ISSUES}

Restiamo allineati nella daily di domani.`,
    replyTemplates: [
      `Ottimo lavoro! Per la criticità segnalata, propongo di coinvolgere il team infrastruttura.`,
      `Ho notato che la velocity è in calo. Organizziamo una retrospective per capire le cause?`,
    ],
  },
  // HR e Assunzioni
  {
    category: 'hr',
    subject: 'Candidatura {POSITION} - {CANDIDATE_NAME}',
    body: `Gentile {NAME},

Le scrivo in merito alla posizione aperta di {POSITION} (Ref: {JOB_REF}).

Il candidato {CANDIDATE_NAME} ha sostenuto il colloquio in data {INTERVIEW_DATE}.

Valutazione:
- Competenze tecniche: {TECH_SCORE}/5
- Soft skills: {SOFT_SCORE}/5
- Fit culturale: {FIT_SCORE}/5

Esperienza rilevante:
{EXPERIENCE}

RAL richiesta: €{SALARY}

In attesa di feedback per procedere.`,
    replyTemplates: [
      `Candidato interessante. Fissiamo secondo colloquio con il CTO per valutazione tecnica approfondita.`,
      `La RAL richiesta è fuori budget. Possiamo proporre €{COUNTER_OFFER} + bonus variabile?`,
    ],
  },
  // Vendite e Opportunità
  {
    category: 'vendite',
    subject: 'Opportunità {CLIENT} - €{DEAL_VALUE} - {STAGE}',
    body: `Buongiorno,

aggiornamento sull'opportunità commerciale:

Cliente: {CLIENT}
Valore deal: €{DEAL_VALUE}
Probabilità: {PROBABILITY}%
Stage: {STAGE}
Closing previsto: {EXPECTED_CLOSE}

Dettaglio prodotti/servizi:
{PRODUCTS}

Competitor in gara: {COMPETITORS}

Prossimi step:
{NEXT_STEPS}`,
    replyTemplates: [
      `Ottimo lavoro! Per aumentare la probabilità di chiusura, propongo di coinvolgere il CEO nel prossimo incontro.`,
      `Il deal sembra interessante. Assicurati di avere i margini corretti prima di presentare l'offerta finale.`,
    ],
  },
  // Legal e Compliance
  {
    category: 'legale',
    subject: 'Revisione clausole {DOCUMENT_TYPE} - {COUNTERPART}',
    body: `Gentile Avv. {NAME},

in allegato troverà il {DOCUMENT_TYPE} relativo alla collaborazione con {COUNTERPART}.

Si richiede revisione delle seguenti clausole:
- Clausola {CLAUSE_1}: {ISSUE_1}
- Clausola {CLAUSE_2}: {ISSUE_2}

Scadenza per feedback: {DEADLINE}

Cordiali saluti`,
    replyTemplates: [
      `Ho esaminato il documento. Le clausole evidenziate presentano criticità. Allego versione modificata.`,
      `Confermo che le clausole sono conformi alla normativa vigente. Si può procedere con la firma.`,
    ],
  },
  // Meeting e Organizzazione
  {
    category: 'meeting',
    subject: 'Convocazione riunione {MEETING_TYPE} - {DATE}',
    body: `Buongiorno a tutti,

siete convocati per la riunione {MEETING_TYPE}.

Data: {DATE}
Ora: {TIME}
Luogo: {LOCATION}

Ordine del giorno:
1. {AGENDA_1}
2. {AGENDA_2}
3. {AGENDA_3}
4. Varie ed eventuali

Si prega di confermare la propria presenza.`,
    replyTemplates: [
      `Confermo la mia presenza. Suggerisco di aggiungere all'OdG anche il punto relativo al nuovo progetto.`,
      `Mi scuso ma non potrò partecipare per impegni pregressi. Chiedo di essere aggiornato successivamente.`,
    ],
  },
  // Supporto e Incident
  {
    category: 'supporto',
    subject: 'Ticket #{TICKET_ID} - {PRIORITY} - {ISSUE_TITLE}',
    body: `Segnalazione problema:

Ticket: #{TICKET_ID}
Priorità: {PRIORITY}
Cliente: {CLIENT}
Ambiente: {ENVIRONMENT}

Descrizione:
{ISSUE_DESCRIPTION}

Impatto:
{IMPACT}

Azioni intraprese:
{ACTIONS}

Escalation richiesta: {ESCALATION}`,
    replyTemplates: [
      `Ticket preso in carico. Root cause identificata: {ROOT_CAUSE}. Soluzione in corso di implementazione.`,
      `Problema risolto. Causa: {ROOT_CAUSE}. Applicato workaround. Patch definitiva in release {VERSION}.`,
    ],
  },
  // Formazione
  {
    category: 'formazione',
    subject: 'Piano formativo {YEAR} - {TEAM}',
    body: `Gentile {NAME},

in allegato il piano formativo proposto per il team {TEAM} anno {YEAR}.

Corsi pianificati:
1. {COURSE_1} - {HOURS_1}h - €{COST_1}
2. {COURSE_2} - {HOURS_2}h - €{COST_2}
3. {COURSE_3} - {HOURS_3}h - €{COST_3}

Budget totale richiesto: €{TOTAL_COST}
ROI atteso: miglioramento produttività {ROI}%

In attesa di approvazione.`,
  },
  // Fornitori
  {
    category: 'fornitori',
    subject: 'Ordine #{ORDER_ID} - {SUPPLIER} - Consegna {DELIVERY_DATE}',
    body: `Gentile {NAME},

confermiamo ordine n. {ORDER_ID}.

Dettaglio:
{ORDER_DETAILS}

Totale: €{ORDER_TOTAL}
Pagamento: {PAYMENT_TERMS}
Consegna: {DELIVERY_DATE}
Indirizzo: {DELIVERY_ADDRESS}

Si prega di confermare ricezione ordine e data consegna.`,
    replyTemplates: [
      `Ordine confermato. Consegna prevista per il {DELIVERY_DATE} come richiesto.`,
      `Gentile cliente, segnalo ritardo di 3 giorni sulla consegna causa problemi logistici. Nuova data: {NEW_DATE}.`,
    ],
  },
];

// === Helper Functions ===
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateUniqueId(prefix: string): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

function generateDate(daysBack: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  date.setHours(randomInt(8, 18), randomInt(0, 59), randomInt(0, 59));
  return date;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('it-IT');
}

// === Contact Generator ===
interface GeneratedContact {
  email: string;
  displayName: string;
  company: string;
  jobTitle: string;
}

function generateContacts(count: number): GeneratedContact[] {
  const contacts: GeneratedContact[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < count; i++) {
    const name = randomChoice(ITALIAN_NAMES);
    const company = randomChoice(ITALIAN_COMPANIES);
    const jobTitle = randomChoice(JOB_TITLES);

    let email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}@${company}`;
    let counter = 1;
    while (usedEmails.has(email)) {
      email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}${counter}@${company}`;
      counter++;
    }
    usedEmails.add(email);

    contacts.push({
      email,
      displayName: `${name.first} ${name.last}`,
      company,
      jobTitle,
    });
  }

  return contacts;
}

// === Email Generator ===
interface GeneratedEmail {
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc?: string[];
  date: Date;
  threadId: string;
  category: string;
  isReply: boolean;
  replyToId?: string;
}

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

function generateEmailContent(scenario: EmailScenario, contacts: GeneratedContact[], isReply: boolean = false): { subject: string; body: string } {
  const year = randomInt(2024, 2025);
  const quarter = randomInt(1, 4);
  const contact = randomChoice(contacts);

  const vars: Record<string, string | number> = {
    YEAR: year,
    QUARTER: quarter,
    NAME: contact.displayName.split(' ')[0],
    COMPANY: contact.company.replace('.it', '').toUpperCase(),
    CONTRACT_ID: generateUniqueId('CTR'),
    AMOUNT: formatCurrency(randomInt(5000, 500000)),
    SLA: randomInt(95, 99.9),
    DEPARTMENT: randomChoice(['Marketing', 'IT', 'HR', 'Sales', 'Operations']),
    MARKETING_BUDGET: formatCurrency(randomInt(10000, 100000)),
    HR_BUDGET: formatCurrency(randomInt(20000, 150000)),
    TECH_BUDGET: formatCurrency(randomInt(30000, 200000)),
    TOTAL_BUDGET: formatCurrency(randomInt(60000, 450000)),
    PROJECT_NAME: randomChoice(['Migrazione Cloud', 'Nuovo CRM', 'App Mobile', 'Data Platform', 'Integrazione API']),
    SPRINT: randomInt(1, 20),
    FEATURES: randomInt(3, 8),
    BUGS: randomInt(1, 5),
    VELOCITY: randomInt(20, 45),
    RELEASE_DATE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    DEMO_DATE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    ISSUES: randomChoice(['Dipendenza da API esterna', 'Performance database', 'Debito tecnico', 'Nessuna criticità']),
    POSITION: randomChoice(['Developer Senior', 'Project Manager', 'Data Analyst', 'DevOps Engineer', 'UX Designer']),
    CANDIDATE_NAME: randomChoice(ITALIAN_NAMES).first + ' ' + randomChoice(ITALIAN_NAMES).last,
    JOB_REF: generateUniqueId('JOB'),
    INTERVIEW_DATE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    TECH_SCORE: randomInt(3, 5),
    SOFT_SCORE: randomInt(3, 5),
    FIT_SCORE: randomInt(3, 5),
    EXPERIENCE: randomChoice(['5 anni in ambito enterprise', '3 anni startup', '10 anni consulenza', '7 anni industry']),
    SALARY: formatCurrency(randomInt(35000, 80000)),
    CLIENT: randomChoice(ITALIAN_COMPANIES).replace('.it', ' S.r.l.'),
    DEAL_VALUE: formatCurrency(randomInt(10000, 1000000)),
    PROBABILITY: randomInt(20, 95),
    STAGE: randomChoice(['Prospecting', 'Qualificazione', 'Proposta', 'Negoziazione', 'Closing']),
    EXPECTED_CLOSE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    PRODUCTS: randomChoice(['Licenze SaaS', 'Consulenza', 'Sviluppo custom', 'Supporto enterprise']),
    COMPETITORS: randomChoice(['Microsoft', 'SAP', 'Oracle', 'Nessuno', 'Startup locale']),
    NEXT_STEPS: randomChoice(['Demo tecnica', 'POC', 'Incontro C-level', 'Proposta finale']),
    DOCUMENT_TYPE: randomChoice(['NDA', 'Contratto quadro', 'Partnership agreement', 'SLA']),
    COUNTERPART: randomChoice(ITALIAN_COMPANIES).replace('.it', ''),
    CLAUSE_1: randomInt(3, 8),
    CLAUSE_2: randomInt(9, 15),
    ISSUE_1: randomChoice(['Penali eccessive', 'Termini pagamento', 'IP ownership']),
    ISSUE_2: randomChoice(['Limitazione responsabilità', 'Foro competente', 'Durata']),
    DEADLINE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    MEETING_TYPE: randomChoice(['Board', 'Steering committee', 'All hands', 'Team building']),
    DATE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    TIME: `${randomInt(9, 17)}:00`,
    LOCATION: randomChoice(['Sala riunioni A', 'Microsoft Teams', 'Google Meet', 'Sede cliente']),
    AGENDA_1: randomChoice(['Approvazione budget', 'Review Q' + quarter, 'Piano strategico']),
    AGENDA_2: randomChoice(['Nuove assunzioni', 'Stato progetti', 'KPI performance']),
    AGENDA_3: randomChoice(['Prossimi passi', 'Action items', 'Decisioni da prendere']),
    TICKET_ID: randomInt(10000, 99999),
    PRIORITY: randomChoice(['P1 - Critico', 'P2 - Alto', 'P3 - Medio', 'P4 - Basso']),
    ISSUE_TITLE: randomChoice(['Sistema non raggiungibile', 'Errore login', 'Performance degradate', 'Dati mancanti']),
    ENVIRONMENT: randomChoice(['Produzione', 'Staging', 'UAT', 'Development']),
    ISSUE_DESCRIPTION: randomChoice(['Il sistema non risponde alle richieste HTTP', 'Utenti impossibilitati ad accedere', 'Timeout frequenti sulle query']),
    IMPACT: randomChoice(['100 utenti bloccati', 'Fatturato a rischio', 'Demo cliente compromessa']),
    ACTIONS: randomChoice(['Riavvio servizio', 'Analisi log', 'Rollback versione']),
    ESCALATION: randomChoice(['Sì', 'No']),
    TEAM: randomChoice(['Sviluppo', 'Marketing', 'Sales', 'Customer Success']),
    COURSE_1: randomChoice(['AWS Solutions Architect', 'Scrum Master', 'Leadership']),
    COURSE_2: randomChoice(['Data Analytics', 'Project Management', 'Comunicazione efficace']),
    COURSE_3: randomChoice(['Machine Learning', 'DevOps', 'Negoziazione']),
    HOURS_1: randomInt(16, 40),
    HOURS_2: randomInt(8, 24),
    HOURS_3: randomInt(8, 16),
    COST_1: formatCurrency(randomInt(500, 3000)),
    COST_2: formatCurrency(randomInt(300, 1500)),
    COST_3: formatCurrency(randomInt(200, 1000)),
    TOTAL_COST: formatCurrency(randomInt(1000, 5000)),
    ROI: randomInt(10, 30),
    ORDER_ID: generateUniqueId('ORD'),
    SUPPLIER: randomChoice(ITALIAN_COMPANIES).replace('.it', ' S.p.A.'),
    ORDER_DETAILS: randomChoice(['10x Server HP', '50x Licenze Office', '100x Monitor Dell']),
    ORDER_TOTAL: formatCurrency(randomInt(5000, 100000)),
    PAYMENT_TERMS: randomChoice(['30gg DFFM', '60gg DFFM', 'Bonifico anticipato']),
    DELIVERY_DATE: `${randomInt(1, 28)}/${randomInt(1, 12)}/${year}`,
    DELIVERY_ADDRESS: randomChoice(['Via Roma 123, Milano', 'Viale Europa 45, Roma', 'Corso Italia 78, Torino']),
  };

  let body = isReply && scenario.replyTemplates?.length
    ? randomChoice(scenario.replyTemplates)
    : scenario.body;

  return {
    subject: fillTemplate(scenario.subject, vars),
    body: fillTemplate(body, vars),
  };
}

function generateThread(contacts: GeneratedContact[], threadId: string, startDaysBack: number): GeneratedEmail[] {
  const emails: GeneratedEmail[] = [];
  const scenario = randomChoice(EMAIL_SCENARIOS);
  const threadParticipants = [randomChoice(contacts), randomChoice(contacts), randomChoice(contacts)];

  // Initial email
  const { subject, body } = generateEmailContent(scenario, contacts, false);
  const initialEmail: GeneratedEmail = {
    subject,
    body,
    from: threadParticipants[0].email,
    to: [threadParticipants[1].email],
    cc: Math.random() > 0.5 ? [threadParticipants[2].email] : undefined,
    date: generateDate(startDaysBack),
    threadId,
    category: scenario.category,
    isReply: false,
  };
  emails.push(initialEmail);

  // Replies (1-8 per thread)
  const replyCount = randomInt(1, 8);
  for (let i = 0; i < replyCount; i++) {
    const isFromOriginal = i % 2 === 0;
    const replyContent = generateEmailContent(scenario, contacts, true);

    emails.push({
      subject: (i === 0 ? 'Re: ' : '') + subject,
      body: replyContent.body,
      from: isFromOriginal ? threadParticipants[1].email : threadParticipants[0].email,
      to: [isFromOriginal ? threadParticipants[0].email : threadParticipants[1].email],
      cc: initialEmail.cc,
      date: generateDate(startDaysBack - i - 1),
      threadId,
      category: scenario.category,
      isReply: true,
      replyToId: emails[emails.length - 1].threadId,
    });
  }

  return emails;
}

// === Main Generation Logic ===
async function main() {
  const isCleanup = process.argv.includes('--cleanup');

  console.log('🇮🇹 Italian RAG Dataset Generator');
  console.log('================================\n');

  try {
    // Initialize Mistral
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY not set');
    mistral = new Mistral({ apiKey });

    // Find or create test tenant
    const existingTenant = await prisma.tenant.findFirst({
      where: { name: CONFIG.testTenantName },
      include: { users: true, providerConfigs: true },
    });

    if (isCleanup && existingTenant) {
      console.log('🧹 Cleaning up existing data...');
      await prisma.embedding.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.email.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.contact.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.providerConfig.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.user.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.tenant.delete({ where: { id: existingTenant.id } });
      console.log('✅ Cleanup complete!\n');
      return;
    }

    let tenantId: string;
    let userId: string;
    let providerId: string;

    if (existingTenant) {
      tenantId = existingTenant.id;
      userId = existingTenant.users[0]?.id ?? '';
      providerId = existingTenant.providerConfigs[0]?.id ?? '';

      if (!userId) throw new Error('No user found in existing tenant');

      // Create provider if missing
      if (!providerId) {
        const newProvider = await prisma.providerConfig.create({
          data: {
            tenantId,
            userId,
            providerType: 'GOOGLE',
            email: 'test@italian-rag.local',
            isActive: true,
            accessToken: 'fake-token-for-testing',
            tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
        providerId = newProvider.id;
      }
    } else {
      console.log('📝 Creating test tenant...');
      const newTenant = await prisma.tenant.create({
        data: {
          name: CONFIG.testTenantName,
          slug: CONFIG.testTenantSlug,
        },
      });

      // Create user separately
      const newUser = await prisma.user.create({
        data: {
          tenantId: newTenant.id,
          email: 'test@italian-rag.local',
          passwordHash: 'test-hash-not-for-login',
          firstName: 'Test',
          lastName: 'User',
        },
      });

      tenantId = newTenant.id;
      userId = newUser.id;
      if (!userId) throw new Error('Failed to create user');

      const newProvider = await prisma.providerConfig.create({
        data: {
          tenantId,
          userId,
          providerType: 'GOOGLE',
          email: 'test@italian-rag.local',
          isActive: true,
          accessToken: 'fake-token-for-testing',
          tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      providerId = newProvider.id;
    }

    console.log(`📊 Tenant: ${CONFIG.testTenantName} (${tenantId})`);
    console.log(`👤 User: ${userId}`);
    console.log(`📧 Provider: ${providerId}\n`);

    // Generate contacts
    console.log(`👥 Generating ${CONFIG.contactsCount} contacts...`);
    const contacts = generateContacts(CONFIG.contactsCount);

    // Delete existing contacts for this tenant first
    await prisma.contact.deleteMany({ where: { tenantId } });

    for (const contact of contacts) {
      await prisma.contact.create({
        data: {
          tenantId,
          displayName: contact.displayName,
          emails: [{ value: contact.email, type: 'work' }], // JSON array format
          company: contact.company,
          jobTitle: contact.jobTitle,
          lastInteractedAt: new Date(),
        },
      });
    }
    console.log(`✅ Created ${CONFIG.contactsCount} contacts\n`);

    // Generate threads with emails
    console.log(`📬 Generating ${CONFIG.totalEmails} emails in ${CONFIG.threadsCount} threads...`);
    const allEmails: GeneratedEmail[] = [];

    for (let t = 0; t < CONFIG.threadsCount; t++) {
      const threadId = generateUniqueId('THR');
      const daysBack = randomInt(1, 180);
      const threadEmails = generateThread(contacts, threadId, daysBack);
      allEmails.push(...threadEmails);

      if ((t + 1) % 50 === 0) {
        console.log(`  Generated ${t + 1}/${CONFIG.threadsCount} threads (${allEmails.length} emails so far)...`);
      }
    }

    // Trim to exact count if needed
    const finalEmails = allEmails.slice(0, CONFIG.totalEmails);
    console.log(`\n📨 Inserting ${finalEmails.length} emails into database...`);

    // Insert emails
    let inserted = 0;
    for (const email of finalEmails) {
      await prisma.email.create({
        data: {
          tenantId,
          providerId,
          externalId: generateUniqueId('MSG'),
          threadId: email.threadId,
          subject: email.subject,
          snippet: email.body.substring(0, 200),
          from: email.from,
          to: email.to,
          cc: email.cc || [],
          folder: 'INBOX',
          isRead: Math.random() > 0.3,
          isStarred: Math.random() > 0.9,
          sentAt: email.date,
          receivedAt: email.date,
          bodyText: email.body,
        },
      });
      inserted++;

      if (inserted % 100 === 0) {
        console.log(`  Inserted ${inserted}/${finalEmails.length} emails...`);
      }
    }
    console.log(`✅ Inserted ${inserted} emails\n`);

    // Generate embeddings
    console.log('🧠 Generating embeddings...');
    const emailsForEmbedding = await prisma.email.findMany({
      where: { tenantId },
      select: { id: true, subject: true, snippet: true, from: true },
    });

    let embedded = 0;
    for (let i = 0; i < emailsForEmbedding.length; i += CONFIG.batchSize) {
      const batch = emailsForEmbedding.slice(i, i + CONFIG.batchSize);
      const texts = batch.map(e => `${e.subject}\n${e.snippet}\nDa: ${e.from}`);

      const response = await mistral.embeddings.create({
        model: CONFIG.embeddingModel,
        inputs: texts,
      });

      for (let j = 0; j < batch.length; j++) {
        const embedding = response.data?.[j]?.embedding;
        if (embedding) {
          await prisma.$executeRawUnsafe(`
            INSERT INTO embeddings (id, "tenantId", content, vector, "embeddingModel", "emailId", "createdAt")
            VALUES ($1, $2, $3, $4::vector, $5, $6, NOW())
          `,
            nanoid(),
            tenantId,
            texts[j],
            `[${embedding.join(',')}]`,
            CONFIG.embeddingModel,
            batch[j].id,
          );
          embedded++;
        }
      }

      if ((i + CONFIG.batchSize) % 100 === 0 || i + CONFIG.batchSize >= emailsForEmbedding.length) {
        console.log(`  Embedded ${Math.min(i + CONFIG.batchSize, emailsForEmbedding.length)}/${emailsForEmbedding.length} emails...`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n✅ DATASET GENERATION COMPLETE!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Tenant:     ${CONFIG.testTenantName} (${tenantId})`);
    console.log(`  Contacts:   ${CONFIG.contactsCount}`);
    console.log(`  Emails:     ${inserted}`);
    console.log(`  Embeddings: ${embedded}`);
    console.log(`  Threads:    ${CONFIG.threadsCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`📝 To test RAG: npx ts-node scripts/rag-benchmark.ts`);
    console.log(`🧹 To cleanup:  npx ts-node scripts/generate-italian-dataset.ts --cleanup`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
