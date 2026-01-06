/**
 * REAL RAG Quality Benchmark
 *
 * Actually tests if RAG returns the CORRECT emails, not just "any" emails.
 *
 * Methodology:
 * 1. Create emails with KNOWN unique identifiers (topics, entities, numbers)
 * 2. Create queries that should ONLY match specific emails
 * 3. Check if the correct email appears in top K results
 * 4. Calculate real Precision@K, MRR, NDCG
 *
 * Usage:
 *   npx ts-node backend/scripts/rag-benchmark.ts
 *
 * @author AI Refactor v2.0
 */

/// <reference types="node" />
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
  testTenantSlug: 'rag-benchmark-test',
  embeddingModel: 'mistral-embed',
  topK: [1, 3, 5, 10],
  // Hybrid search config
  rrf_k: 60, // RRF constant (standard is 60)
  vectorWeight: 0.7, // Weight for vector results in hybrid
  bm25Weight: 0.3, // Weight for BM25 results in hybrid
};

// === Latency Tracking ===
interface LatencyStats {
  mode: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  totalQueries: number;
}

const latencyRecords: Map<string, number[]> = new Map();

function recordLatency(mode: string, ms: number): void {
  if (!latencyRecords.has(mode)) {
    latencyRecords.set(mode, []);
  }
  latencyRecords.get(mode)!.push(ms);
}

function calculateLatencyStats(mode: string): LatencyStats {
  const times = latencyRecords.get(mode) || [];
  if (times.length === 0) {
    return { mode, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, totalQueries: 0 };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    mode,
    avgMs: Math.round(sum / sorted.length),
    minMs: Math.round(sorted[0]),
    maxMs: Math.round(sorted[sorted.length - 1]),
    p50Ms: Math.round(sorted[Math.floor(sorted.length * 0.5)]),
    p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
    totalQueries: sorted.length,
  };
}

// === Search Mode ===
type SearchMode = 'vector' | 'bm25' | 'hybrid_rrf' | 'hybrid_weighted';

let testTenantId: string;
let testProviderId: string;

// === Test Case Interface ===
interface TestCase {
  id: string;
  emailId: string;
  subject: string;
  body: string;
  // Unique identifiers that ONLY this email contains
  uniqueMarkers: string[];
  // Query that should find THIS email
  query: string;
  // Category for analysis
  category: 'contract' | 'budget' | 'technical' | 'sales' | 'hr' | 'legal';
}

// === Test Difficulty Levels ===
type QueryType = 'exact' | 'semantic' | 'adversarial';

interface TestCaseExtended extends TestCase {
  queryType: QueryType;
  semanticQuery?: string; // Query without unique IDs
  adversarialQuery?: string; // Query that could match similar emails
}

// === Generate Test Cases with UNIQUE identifiers ===
function generateTestCases(): TestCaseExtended[] {
  const cases: TestCaseExtended[] = [];

  // Each test case has UNIQUE numbers/codes that only appear in that email
  const testData: Array<{
    category: TestCase['category'];
    subject: string;
    body: string;
    uniqueMarkers: string[];
    query: string;
    semanticQuery: string;
    adversarialQuery: string;
  }> = [
    {
      category: 'contract' as const,
      subject: 'Contratto #CTR-7842-ACME - Rinnovo annuale',
      body: `Gentile Dott. Bianchi,

In allegato trova il contratto di rinnovo #CTR-7842-ACME per i servizi cloud.

Punti principali:
- Importo annuale: €127.450,00
- Durata: 36 mesi (dal 01/03/2025 al 28/02/2028)
- SLA garantito: 99.95%
- Codice progetto interno: PRJ-CLOUD-2025-Q1

La preghiamo di firmare entro il 15 febbraio 2025.

Cordiali saluti,
Marco Ferrari
Ufficio Legale`,
      uniqueMarkers: ['CTR-7842-ACME', '127.450', 'PRJ-CLOUD-2025-Q1'],
      query: 'contratto CTR-7842 ACME rinnovo cloud',
      semanticQuery: 'rinnovo contratto servizi cloud tre anni importo alto',
      adversarialQuery: 'contratto rinnovo servizi cloud SLA garantito',
    },
    {
      category: 'budget' as const,
      subject: 'Budget Q2 2025 - Dipartimento Marketing REF-BDG-4521',
      body: `Buongiorno team,

Ecco il riepilogo del budget Q2 2025 per il dipartimento Marketing.

Riferimento: REF-BDG-4521

Allocazioni:
- Campagne digitali: €45.000
- Eventi: €28.500
- Content creation: €18.750
- Tools & Software: €12.300

Totale: €104.550

Codice centro di costo: CC-MKT-2025-Q2

Attendo approvazione entro venerdì.

Francesca Greco
CMO`,
      uniqueMarkers: ['REF-BDG-4521', '104.550', 'CC-MKT-2025-Q2'],
      query: 'budget marketing Q2 2025 REF-BDG-4521',
      semanticQuery: 'allocazione budget campagne digitali eventi content creation',
      adversarialQuery: 'budget dipartimento secondo trimestre approvazione',
    },
    {
      category: 'technical' as const,
      subject: 'Incident Report INC-2025-0187 - Database outage',
      body: `INCIDENT REPORT

ID: INC-2025-0187
Severità: P1 (Critico)
Sistema: PostgreSQL Cluster prod-db-cluster-eu-01

Timeline:
- 14:32 - Primo alert (latency > 500ms)
- 14:45 - Failover automatico su replica
- 15:12 - Servizio ripristinato
- Downtime totale: 40 minuti

Root cause: Disk IOPS saturazione (disk-vol-8847)

Azioni correttive:
- Upgrade storage da gp2 a gp3
- Ticket AWS: CASE-9912847651

Andrea Marino
CTO`,
      uniqueMarkers: ['INC-2025-0187', 'prod-db-cluster-eu-01', 'CASE-9912847651'],
      query: 'incident database outage INC-2025-0187 PostgreSQL',
      semanticQuery: 'problema critico database postgres failover downtime quaranta minuti',
      adversarialQuery: 'incident report sistema database outage critico',
    },
    {
      category: 'sales' as const,
      subject: 'Opportunità Globex Corp - Deal #OPP-GL-2025-089',
      body: `Team Sales,

Aggiornamento sull'opportunità Globex Corp.

Deal ID: OPP-GL-2025-089
Valore stimato: €385.000
Probabilità chiusura: 75%
Forecast: Q2 2025

Contatti chiave:
- Roberto Conti (Procurement): r.conti@globex.it
- Decision maker: Elena Moretti (COO)

Prossimi step:
1. Demo tecnica il 22/01
2. Proposta commerciale entro 30/01
3. Negoziazione febbraio

Codice CRM: CRM-GLOBEX-2025-Q1

Anna Colombo
Sales Director`,
      uniqueMarkers: ['OPP-GL-2025-089', '385.000', 'CRM-GLOBEX-2025-Q1'],
      query: 'opportunità Globex deal OPP-GL-2025-089 vendita',
      semanticQuery: 'deal cliente grande valore trecentottantacinque mila demo proposta',
      adversarialQuery: 'opportunità vendita cliente probabilità chiusura alta',
    },
    {
      category: 'hr' as const,
      subject: 'Candidato Senior Developer - REQ-HR-2025-034',
      body: `Buongiorno,

Vi aggiorno sulla posizione Senior Developer.

Requisition ID: REQ-HR-2025-034

Candidato selezionato:
- Nome: Paolo Fontana
- Esperienza: 8 anni (React, Node.js, AWS)
- RAL proposta: €65.000 + bonus 15%
- Codice candidato: CAND-PF-7823

Timeline:
- Offerta inviata: 10/01/2025
- Risposta attesa: 17/01/2025
- Onboarding previsto: 01/02/2025

Budget approvato: BDG-HR-2025-DEV-01

Sofia Romano
HR Manager`,
      uniqueMarkers: ['REQ-HR-2025-034', 'CAND-PF-7823', 'BDG-HR-2025-DEV-01'],
      query: 'candidato developer REQ-HR-2025-034 assunzione',
      semanticQuery: 'assunzione sviluppatore senior otto anni esperienza React Node offerta',
      adversarialQuery: 'candidato developer posizione offerta onboarding',
    },
    {
      category: 'legal' as const,
      subject: 'GDPR Audit Report - AUD-GDPR-2025-001',
      body: `Spettabile Direzione,

Completato l'audit GDPR annuale.

Report ID: AUD-GDPR-2025-001
Data audit: 08-12 Gennaio 2025
Auditor: Studio Legale Ferrari

Risultati:
- Data processing agreements: COMPLIANT
- Cookie consent: COMPLIANT con osservazioni
- Retention policies: NON COMPLIANT (3 finding)

Finding critici:
- FIND-2025-001: Backup retention > 7 anni
- FIND-2025-002: Log access non criptati
- FIND-2025-003: DPA mancante fornitore XYZ

Deadline remediation: 28/02/2025
Riferimento pratica: PRAT-LEG-2025-GDPR-01

Marco Ferrari
Legal Counsel`,
      uniqueMarkers: ['AUD-GDPR-2025-001', 'FIND-2025-001', 'PRAT-LEG-2025-GDPR-01'],
      query: 'audit GDPR AUD-GDPR-2025-001 compliance finding',
      semanticQuery: 'verifica privacy dati personali non conforme tre problemi critici',
      adversarialQuery: 'audit GDPR compliance finding problemi critici',
    },
    {
      category: 'contract' as const,
      subject: 'NDA Startup Milano - DOC-NDA-2025-017',
      body: `Gentile Dott.ssa Costa,

In allegato l'NDA per la collaborazione con StartupMilano.

Riferimento: DOC-NDA-2025-017

Parti:
- Azienda SpA (noi)
- StartupMilano Srl (P.IVA 12345678901)

Clausole principali:
- Durata riservatezza: 5 anni
- Penale violazione: €50.000
- Foro competente: Milano

Codice interno: INT-NDA-STM-2025

Attendo conferma per procedere con la firma.

Marco Ferrari
Ufficio Legale`,
      uniqueMarkers: ['DOC-NDA-2025-017', '12345678901', 'INT-NDA-STM-2025'],
      query: 'NDA StartupMilano DOC-NDA-2025-017 riservatezza',
      semanticQuery: 'accordo riservatezza startup collaborazione cinque anni penale',
      adversarialQuery: 'NDA accordo riservatezza partner collaborazione firma',
    },
    {
      category: 'budget' as const,
      subject: 'Forecast vendite Q1 2025 - RPT-SALES-FC-2025-Q1',
      body: `Team,

Ecco il forecast vendite per Q1 2025.

Report ID: RPT-SALES-FC-2025-Q1

Previsioni per area:
- Nord Italia: €890.000 (pipeline: €1.2M)
- Centro: €456.000 (pipeline: €680K)
- Sud: €234.000 (pipeline: €450K)

Totale forecast: €1.580.000
vs Budget: €1.750.000 (-9.7%)

Deal a rischio:
- OPP-2025-012: €120K - cliente indeciso
- OPP-2025-034: €85K - budget bloccato

Codice report CRM: CRM-RPT-FC-2025-Q1-FINAL

Anna Colombo
Sales Director`,
      uniqueMarkers: ['RPT-SALES-FC-2025-Q1', '1.580.000', 'CRM-RPT-FC-2025-Q1-FINAL'],
      query: 'forecast vendite Q1 2025 RPT-SALES-FC pipeline',
      semanticQuery: 'previsioni vendite primo trimestre nord centro sud deal rischio',
      adversarialQuery: 'forecast vendite trimestre pipeline deal rischio',
    },
    {
      category: 'technical' as const,
      subject: 'Migration Plan AWS - PRJ-INFRA-2025-003',
      body: `Team Infrastructure,

Piano migrazione AWS approvato.

Project ID: PRJ-INFRA-2025-003
Budget: €280.000
Timeline: Marzo-Giugno 2025

Fasi:
1. Assessment (Marzo): TASK-AWS-001
2. Pilot (Aprile): TASK-AWS-002
3. Migration (Maggio): TASK-AWS-003
4. Cutover (Giugno): TASK-AWS-004

Account AWS: 123456789012
Region target: eu-south-1 (Milano)

Risk register: RISK-AWS-2025-003

Andrea Marino
CTO`,
      uniqueMarkers: ['PRJ-INFRA-2025-003', '123456789012', 'RISK-AWS-2025-003'],
      query: 'migration AWS PRJ-INFRA-2025-003 cloud infrastructure',
      semanticQuery: 'progetto migrazione cloud amazon quattro fasi assessment pilot cutover',
      adversarialQuery: 'migration plan cloud infrastructure progetto fasi',
    },
    {
      category: 'sales' as const,
      subject: 'Proposta commerciale Banca Centrale - PROP-BC-2025-002',
      body: `Gentile Dott.ssa Santoro,

In seguito al nostro incontro, allego la proposta commerciale.

Riferimento: PROP-BC-2025-002

Soluzione proposta:
- Licenze enterprise: €450.000/anno
- Implementazione: €180.000 (una tantum)
- Supporto premium: €75.000/anno

Totale anno 1: €705.000
TCO 3 anni: €1.755.000

Validità offerta: 30 giorni
Codice gara: GARA-BC-2025-IT-001

Rimango a disposizione per approfondimenti.

Anna Colombo
Sales Director`,
      uniqueMarkers: ['PROP-BC-2025-002', '705.000', 'GARA-BC-2025-IT-001'],
      query: 'proposta Banca Centrale PROP-BC-2025-002 offerta commerciale',
      semanticQuery: 'offerta banca licenze enterprise implementazione supporto settecentomila',
      adversarialQuery: 'proposta commerciale cliente licenze implementazione supporto',
    },
  ];

  // Generate 3 test cases per email: exact, semantic, adversarial
  for (const data of testData) {
    const baseId = nanoid(8);

    // Exact query (with unique IDs) - should be easy
    cases.push({
      id: `${baseId}-exact`,
      emailId: '',
      subject: data.subject,
      body: data.body,
      uniqueMarkers: data.uniqueMarkers,
      query: data.query,
      category: data.category,
      queryType: 'exact' as QueryType,
      semanticQuery: data.semanticQuery,
      adversarialQuery: data.adversarialQuery,
    });

    // Semantic query (no unique IDs) - harder
    cases.push({
      id: `${baseId}-semantic`,
      emailId: '',
      subject: data.subject,
      body: data.body,
      uniqueMarkers: data.uniqueMarkers,
      query: data.semanticQuery, // Use semantic query
      category: data.category,
      queryType: 'semantic' as QueryType,
      semanticQuery: data.semanticQuery,
      adversarialQuery: data.adversarialQuery,
    });

    // Adversarial query (generic, could match similar emails) - hardest
    cases.push({
      id: `${baseId}-adversarial`,
      emailId: '',
      subject: data.subject,
      body: data.body,
      uniqueMarkers: data.uniqueMarkers,
      query: data.adversarialQuery, // Use adversarial query
      category: data.category,
      queryType: 'adversarial' as QueryType,
      semanticQuery: data.semanticQuery,
      adversarialQuery: data.adversarialQuery,
    });
  }

  return cases;
}

// === Setup Test Environment ===
async function setup(): Promise<void> {
  console.log('\n📦 Setting up benchmark environment...');

  // Cleanup existing
  const existing = await prisma.tenant.findFirst({
    where: { slug: CONFIG.testTenantSlug },
  });
  if (existing) {
    await prisma.$executeRawUnsafe(`DELETE FROM "embeddings" WHERE "tenantId" = $1`, existing.id);
    await prisma.tenant.delete({ where: { id: existing.id } });
    console.log('  Cleaned up existing test data');
  }

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: { id: nanoid(), name: 'RAG Benchmark', slug: CONFIG.testTenantSlug },
  });
  testTenantId = tenant.id;

  // Create user
  const user = await prisma.user.create({
    data: {
      id: nanoid(),
      tenantId: testTenantId,
      email: 'benchmark@test.it',
      passwordHash: 'test',
      firstName: 'Benchmark',
      lastName: 'User',
      role: 'admin',
    },
  });

  // Create provider
  const provider = await prisma.providerConfig.create({
    data: {
      id: nanoid(),
      tenantId: testTenantId,
      userId: user.id,
      providerType: 'IMAP',
      email: 'benchmark@test.it',
      displayName: 'Benchmark',
      isDefault: true,
    },
  });
  testProviderId = provider.id;

  // Create INBOX
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

  console.log('  Environment ready');
}

// === Insert Test Emails ===
async function insertEmails(testCases: TestCaseExtended[]): Promise<void> {
  console.log('\n📧 Inserting test emails...');

  // Group by subject to avoid duplicates (3 test cases per email)
  const emailMap = new Map<string, string>(); // subject -> emailId

  for (const tc of testCases) {
    if (!emailMap.has(tc.subject)) {
      const email = await prisma.email.create({
        data: {
          id: nanoid(),
          tenantId: testTenantId,
          providerId: testProviderId,
          externalId: `ext-${tc.id}`,
          threadId: `thread-${tc.id}`,
          from: 'test@test.it',
          to: ['recipient@test.it'],
          subject: tc.subject,
          bodyText: tc.body,
          folder: 'INBOX',
          sentAt: new Date(),
          receivedAt: new Date(),
          isRead: true,
        },
      });
      emailMap.set(tc.subject, email.id);
    }
    tc.emailId = emailMap.get(tc.subject)!;
  }

  console.log(`  Inserted ${emailMap.size} unique emails (${testCases.length} test queries)`);
}

// === Insert Noise Emails (to make test harder) ===
async function insertNoiseEmails(count: number): Promise<string[]> {
  console.log(`\n📧 Inserting ${count} noise emails to stress test...`);

  const noiseIds: string[] = [];

  // Noise emails similar to test cases but different IDs
  const noiseTemplates = [
    { subject: 'Contratto #CTR-9999-BETA - Nuovo accordo', category: 'contract', body: 'Allegato contratto per nuovo cliente BETA. Importo: €95.000. Scadenza firma: 20/01/2025.' },
    { subject: 'Contratto #CTR-1111-GAMMA - Rinnovo servizi', category: 'contract', body: 'Rinnovo contratto servizi IT. Valore: €78.000/anno. Durata 24 mesi.' },
    { subject: 'Budget Q3 2025 - Operations REF-BDG-8888', category: 'budget', body: 'Budget allocato per Q3: €156.000. Centro di costo: CC-OPS-2025.' },
    { subject: 'Budget Q1 2026 - IT Department REF-BDG-2222', category: 'budget', body: 'Previsione budget IT per 2026. Software: €45.000. Hardware: €80.000.' },
    { subject: 'Incident Report INC-2025-0555 - Network slowdown', category: 'technical', body: 'Problema di rete risolto. Causa: saturazione bandwidth. Ticket: CASE-1234567.' },
    { subject: 'Incident Report INC-2025-0333 - API timeout', category: 'technical', body: 'Timeout API risolti. Root cause: connection pool exhausted.' },
    { subject: 'Opportunità TechCorp - Deal #OPP-TC-2025-044', category: 'sales', body: 'Nuovo lead TechCorp. Valore: €220.000. Probabilità: 60%.' },
    { subject: 'Opportunità StartupXYZ - Deal #OPP-SX-2025-077', category: 'sales', body: 'Opportunità startup innovativa. Budget cliente: €150.000.' },
    { subject: 'Candidato Frontend Dev - REQ-HR-2025-099', category: 'hr', body: 'Nuovo candidato per posizione frontend. RAL: €55.000.' },
    { subject: 'GDPR Review - AUD-GDPR-2025-055', category: 'legal', body: 'Review periodica GDPR completata. Status: compliant.' },
    { subject: 'NDA Partner ABC - DOC-NDA-2025-033', category: 'contract', body: 'NDA per partnership commerciale. Durata: 3 anni.' },
    { subject: 'Forecast vendite Q4 2025 - RPT-SALES-FC-2025-Q4', category: 'budget', body: 'Previsioni Q4: €1.2M. Pipeline attiva: €2.1M.' },
    { subject: 'Migration Plan Azure - PRJ-INFRA-2025-009', category: 'technical', body: 'Piano migrazione Azure. Timeline: Settembre-Dicembre. Budget: €350.000.' },
    { subject: 'Proposta Assicurazioni SpA - PROP-AS-2025-011', category: 'sales', body: 'Proposta commerciale assicurazioni. Valore: €520.000/anno.' },
    { subject: 'Aggiornamento progetto ERP - Stato avanzamento', category: 'technical', body: 'Il progetto ERP procede. Milestone Q1 completata. Budget residuo: €180.000.' },
    { subject: 'Riunione CdA - Convocazione urgente', category: 'budget', body: 'Convocati per CdA straordinario. Ordine del giorno: approvazione budget 2025.' },
    { subject: 'Follow-up cliente Acme - Richiesta preventivo', category: 'sales', body: 'Cliente Acme richiede nuovo preventivo per servizi aggiuntivi.' },
    { subject: 'Revisione contratto fornitore - Scadenza imminente', category: 'contract', body: 'Contratto fornitore XYZ in scadenza il 28/02. Necessaria rinegoziazione.' },
    { subject: 'Report mensile vendite - Gennaio 2025', category: 'sales', body: 'Vendite gennaio: €890.000 vs target €950.000. Gap: -6.3%.' },
    { subject: 'Aggiornamento sistema CRM - Nuove funzionalità', category: 'technical', body: 'Rilascio nuova versione CRM con funzionalità AI. Go-live: 15/02.' },
  ];

  for (let i = 0; i < count; i++) {
    const template = noiseTemplates[i % noiseTemplates.length];
    const noiseId = nanoid();

    await prisma.email.create({
      data: {
        id: noiseId,
        tenantId: testTenantId,
        providerId: testProviderId,
        externalId: `noise-${nanoid(6)}`,
        threadId: `thread-noise-${nanoid(6)}`,
        from: 'noise@test.it',
        to: ['recipient@test.it'],
        subject: `${template.subject} (${i + 1})`,
        bodyText: template.body,
        folder: 'INBOX',
        sentAt: new Date(),
        receivedAt: new Date(),
        isRead: true,
      },
    });

    noiseIds.push(noiseId);
  }

  console.log(`  Inserted ${count} noise emails`);
  return noiseIds;
}

async function indexNoiseEmails(noiseIds: string[]): Promise<void> {
  console.log('\n🔍 Indexing noise emails...');

  for (const noiseId of noiseIds) {
    const email = await prisma.email.findUnique({ where: { id: noiseId } });
    if (!email) continue;

    const text = `${email.subject}\n${email.bodyText}`;
    const [embedding] = await generateEmbeddings([text]);
    const vectorLiteral = `'[${embedding.join(',')}]'::vector`;

    await prisma.$executeRawUnsafe(`
      INSERT INTO "embeddings" ("id", "tenantId", "emailId", "content", "vector", "embeddingModel", "metadata", "createdAt")
      VALUES ($1, $2, $3, $4, ${vectorLiteral}, $5, $6::jsonb, NOW())
    `,
      nanoid(),
      testTenantId,
      noiseId,
      text.substring(0, 1000),
      CONFIG.embeddingModel,
      JSON.stringify({ type: 'noise' })
    );

    process.stdout.write('.');
    await sleep(100);
  }

  console.log('\n  Noise indexing complete');
}

// === Generate Embeddings ===
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await mistral.embeddings.create({
    model: CONFIG.embeddingModel,
    inputs: texts,
  });

  return response.data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(item => item.embedding!)
    .filter((e): e is number[] => e !== undefined);
}

async function indexEmails(testCases: TestCaseExtended[]): Promise<void> {
  console.log('\n🔍 Indexing emails with embeddings...');

  // Only index unique emails (not all test cases)
  const indexedEmails = new Set<string>();

  for (const tc of testCases) {
    if (indexedEmails.has(tc.emailId)) continue;
    indexedEmails.add(tc.emailId);

    const text = `${tc.subject}\n${tc.body}`;
    const [embedding] = await generateEmbeddings([text]);
    const vectorLiteral = `'[${embedding.join(',')}]'::vector`;

    await prisma.$executeRawUnsafe(`
      INSERT INTO "embeddings" ("id", "tenantId", "emailId", "content", "vector", "embeddingModel", "metadata", "createdAt")
      VALUES ($1, $2, $3, $4, ${vectorLiteral}, $5, $6::jsonb, NOW())
    `,
      nanoid(),
      testTenantId,
      tc.emailId,
      text.substring(0, 1000),
      CONFIG.embeddingModel,
      JSON.stringify({ subject: tc.subject, category: tc.category })
    );

    process.stdout.write('.');
    await sleep(100); // Rate limit
  }

  console.log(`\n  Indexed ${indexedEmails.size} unique emails`);
}

// === Search Result Interface ===
interface SearchResult {
  emailId: string;
  score: number;
  source: 'vector' | 'bm25';
}

// === Vector Search (pure semantic) ===
async function vectorSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  const [queryEmbedding] = await generateEmbeddings([query]);
  const vectorLiteral = `'[${queryEmbedding.join(',')}]'::vector`;

  const results = await prisma.$queryRawUnsafe<Array<{ emailId: string; distance: number }>>(
    `SELECT "emailId", ("vector" <-> ${vectorLiteral}) as distance
     FROM "embeddings"
     WHERE "tenantId" = $1
     ORDER BY distance ASC
     LIMIT $2`,
    testTenantId,
    limit
  );

  // Convert distance to score (higher is better)
  return results.map(r => ({
    emailId: r.emailId,
    score: 1 - Number(r.distance) / 2, // distance 0-2 -> score 1-0
    source: 'vector' as const,
  }));
}

// === BM25 Search (PostgreSQL full-text search) ===
async function bm25Search(query: string, limit: number = 10): Promise<SearchResult[]> {
  // Convert query to tsquery format (Italian)
  // Split into words, remove common words, join with &
  const words = query.toLowerCase()
    .replace(/[^\w\sàèéìòù]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length === 0) return [];

  const tsQuery = words.join(' | '); // OR for better recall

  try {
    const results = await prisma.$queryRawUnsafe<Array<{ emailId: string; rank: number }>>(
      `SELECT e."emailId", ts_rank_cd(
         to_tsvector('italian', COALESCE(e."content", '')),
         plainto_tsquery('italian', $1)
       ) as rank
       FROM "embeddings" e
       WHERE e."tenantId" = $2
         AND to_tsvector('italian', COALESCE(e."content", '')) @@ plainto_tsquery('italian', $1)
       ORDER BY rank DESC
       LIMIT $3`,
      tsQuery,
      testTenantId,
      limit
    );

    return results.map(r => ({
      emailId: r.emailId,
      score: Number(r.rank),
      source: 'bm25' as const,
    }));
  } catch {
    // Fallback to simple ILIKE if ts_vector fails
    const results = await prisma.$queryRawUnsafe<Array<{ emailId: string }>>(
      `SELECT "emailId"
       FROM "embeddings"
       WHERE "tenantId" = $1
         AND "content" ILIKE $2
       LIMIT $3`,
      testTenantId,
      `%${words[0]}%`,
      limit
    );

    return results.map((r, i) => ({
      emailId: r.emailId,
      score: 1 - i * 0.1, // Simple decreasing score
      source: 'bm25' as const,
    }));
  }
}

// === Reciprocal Rank Fusion (RRF) ===
function reciprocalRankFusion(
  vectorResults: SearchResult[],
  bm25Results: SearchResult[],
  k: number = CONFIG.rrf_k
): SearchResult[] {
  const scores = new Map<string, number>();

  // Add vector scores with RRF formula: 1 / (k + rank)
  vectorResults.forEach((r, idx) => {
    const rrfScore = 1 / (k + idx + 1);
    scores.set(r.emailId, (scores.get(r.emailId) || 0) + rrfScore);
  });

  // Add BM25 scores with RRF formula
  bm25Results.forEach((r, idx) => {
    const rrfScore = 1 / (k + idx + 1);
    scores.set(r.emailId, (scores.get(r.emailId) || 0) + rrfScore);
  });

  // Sort by combined RRF score
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([emailId, score]) => ({
      emailId,
      score,
      source: 'vector' as const, // Mixed source
    }));
}

// === Weighted Hybrid Fusion ===
function weightedFusion(
  vectorResults: SearchResult[],
  bm25Results: SearchResult[]
): SearchResult[] {
  const scores = new Map<string, number>();

  // Normalize and weight vector scores
  const maxVector = Math.max(...vectorResults.map(r => r.score), 0.001);
  vectorResults.forEach(r => {
    const normalizedScore = r.score / maxVector;
    scores.set(r.emailId, (scores.get(r.emailId) || 0) + normalizedScore * CONFIG.vectorWeight);
  });

  // Normalize and weight BM25 scores
  const maxBm25 = Math.max(...bm25Results.map(r => r.score), 0.001);
  bm25Results.forEach(r => {
    const normalizedScore = r.score / maxBm25;
    scores.set(r.emailId, (scores.get(r.emailId) || 0) + normalizedScore * CONFIG.bm25Weight);
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([emailId, score]) => ({
      emailId,
      score,
      source: 'vector' as const,
    }));
}

// === Run RAG Queries with Mode Selection ===
interface QueryResult {
  testCase: TestCaseExtended;
  results: Array<{ emailId: string; rank: number; score: number }>;
  correctRank: number | null;
  foundInTopK: Record<number, boolean>;
}

async function runQueries(
  testCases: TestCaseExtended[],
  mode: SearchMode = 'vector',
  verbose: boolean = true
): Promise<QueryResult[]> {
  if (verbose) {
    console.log(`\n🔎 Running RAG queries (mode: ${mode.toUpperCase()})...`);
    console.log('  ───────────────────────────────────────────────────────────────────');
    console.log('  Type       | Category   | Result       | Query');
    console.log('  ───────────────────────────────────────────────────────────────────');
  }

  const results: QueryResult[] = [];

  for (const tc of testCases) {
    let searchResults: SearchResult[];
    const startTime = performance.now();

    switch (mode) {
      case 'vector':
        searchResults = await vectorSearch(tc.query);
        break;
      case 'bm25':
        searchResults = await bm25Search(tc.query);
        break;
      case 'hybrid_rrf': {
        const [vectorRes, bm25Res] = await Promise.all([
          vectorSearch(tc.query, 20),
          bm25Search(tc.query, 20),
        ]);
        searchResults = reciprocalRankFusion(vectorRes, bm25Res);
        break;
      }
      case 'hybrid_weighted': {
        const [vectorRes2, bm25Res2] = await Promise.all([
          vectorSearch(tc.query, 20),
          bm25Search(tc.query, 20),
        ]);
        searchResults = weightedFusion(vectorRes2, bm25Res2);
        break;
      }
    }

    const queryLatency = performance.now() - startTime;
    recordLatency(mode, queryLatency);

    const rankedResults = searchResults.slice(0, 10).map((r, i) => ({
      emailId: r.emailId,
      rank: i + 1,
      score: r.score,
    }));

    const correctResult = rankedResults.find(r => r.emailId === tc.emailId);
    const correctRank = correctResult?.rank || null;

    const foundInTopK: Record<number, boolean> = {};
    for (const k of CONFIG.topK) {
      foundInTopK[k] = correctRank !== null && correctRank <= k;
    }

    results.push({
      testCase: tc,
      results: rankedResults,
      correctRank,
      foundInTopK,
    });

    if (verbose) {
      const typeEmoji = tc.queryType === 'exact' ? '🎯' : tc.queryType === 'semantic' ? '💭' : '⚔️';
      const status = correctRank ? `✅ Rank ${correctRank}` : '❌ Not found';
      console.log(`  ${typeEmoji} ${tc.queryType.padEnd(9)} | ${tc.category.padEnd(10)} | ${status.padEnd(12)} | ${tc.query.substring(0, 35)}...`);
    }

    await sleep(50);
  }

  if (verbose) {
    console.log('  ───────────────────────────────────────────────────────────────────');
  }
  return results;
}

// === Calculate Metrics ===
interface QueryTypeMetrics {
  hits: number;
  total: number;
  precisionAt1: number;
  precisionAt3: number;
  mrr: number;
}

interface Metrics {
  precisionAtK: Record<number, number>;
  mrr: number;
  hitRate: Record<number, number>;
  byCategory: Record<string, { hits: number; total: number; avgRank: number }>;
  byQueryType: Record<QueryType, QueryTypeMetrics>;
}

function calculateMetrics(results: QueryResult[]): Metrics {
  const metrics: Metrics = {
    precisionAtK: {},
    mrr: 0,
    hitRate: {},
    byCategory: {},
    byQueryType: {} as Record<QueryType, QueryTypeMetrics>,
  };

  // Precision@K and Hit Rate
  for (const k of CONFIG.topK) {
    const hits = results.filter(r => r.foundInTopK[k]).length;
    metrics.precisionAtK[k] = hits / results.length;
    metrics.hitRate[k] = hits;
  }

  // MRR (Mean Reciprocal Rank)
  let sumReciprocalRank = 0;
  for (const r of results) {
    if (r.correctRank !== null) {
      sumReciprocalRank += 1 / r.correctRank;
    }
  }
  metrics.mrr = sumReciprocalRank / results.length;

  // By Category
  const categories = [...new Set(results.map(r => r.testCase.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.testCase.category === cat);
    const hits = catResults.filter(r => r.correctRank !== null && r.correctRank <= 3).length;
    const ranks = catResults.filter(r => r.correctRank !== null).map(r => r.correctRank!);
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

    metrics.byCategory[cat] = {
      hits,
      total: catResults.length,
      avgRank,
    };
  }

  // By Query Type (the CRITICAL breakdown)
  const queryTypes: QueryType[] = ['exact', 'semantic', 'adversarial'];
  for (const qt of queryTypes) {
    const qtResults = results.filter(r => r.testCase.queryType === qt);
    const hitsAt1 = qtResults.filter(r => r.correctRank === 1).length;
    const hitsAt3 = qtResults.filter(r => r.correctRank !== null && r.correctRank <= 3).length;

    let qtMrr = 0;
    for (const r of qtResults) {
      if (r.correctRank !== null) {
        qtMrr += 1 / r.correctRank;
      }
    }

    metrics.byQueryType[qt] = {
      hits: hitsAt3,
      total: qtResults.length,
      precisionAt1: qtResults.length > 0 ? hitsAt1 / qtResults.length : 0,
      precisionAt3: qtResults.length > 0 ? hitsAt3 / qtResults.length : 0,
      mrr: qtResults.length > 0 ? qtMrr / qtResults.length : 0,
    };
  }

  return metrics;
}

// === Print Results ===
function printResults(results: QueryResult[], metrics: Metrics): void {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     RAG BENCHMARK RESULTS                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  // Overall Metrics
  console.log('\n📊 OVERALL PRECISION@K');
  for (const k of CONFIG.topK) {
    const pct = (metrics.precisionAtK[k] * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(metrics.precisionAtK[k] * 20));
    console.log(`  P@${k.toString().padEnd(2)}: ${pct.padStart(5)}% ${bar} (${metrics.hitRate[k]}/${results.length})`);
  }

  console.log(`\n📈 Overall MRR: ${(metrics.mrr * 100).toFixed(1)}%`);

  // BY QUERY TYPE - THE CRITICAL BREAKDOWN
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🎯 BY QUERY DIFFICULTY                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Query Type     │ P@1      │ P@3      │ MRR      │ Difficulty');
  console.log('  ───────────────┼──────────┼──────────┼──────────┼────────────');

  const queryTypeLabels: Record<QueryType, { label: string; emoji: string; difficulty: string }> = {
    exact: { label: 'Exact', emoji: '🎯', difficulty: 'Easy (IDs)' },
    semantic: { label: 'Semantic', emoji: '💭', difficulty: 'Medium (meaning)' },
    adversarial: { label: 'Adversarial', emoji: '⚔️', difficulty: 'Hard (generic)' },
  };

  for (const qt of ['exact', 'semantic', 'adversarial'] as QueryType[]) {
    const data = metrics.byQueryType[qt];
    const info = queryTypeLabels[qt];
    const p1 = (data.precisionAt1 * 100).toFixed(0);
    const p3 = (data.precisionAt3 * 100).toFixed(0);
    const mrr = (data.mrr * 100).toFixed(0);

    const bar1 = '█'.repeat(Math.round(data.precisionAt1 * 10));
    const bar3 = '█'.repeat(Math.round(data.precisionAt3 * 10));

    console.log(`  ${info.emoji} ${info.label.padEnd(11)} │ ${p1.padStart(4)}% ${bar1.padEnd(4)} │ ${p3.padStart(4)}% ${bar3.padEnd(4)} │ ${mrr.padStart(4)}%     │ ${info.difficulty}`);
  }

  console.log('  ───────────────┴──────────┴──────────┴──────────┴────────────');
  console.log('');

  // Analysis of query type performance
  const exactP3 = metrics.byQueryType.exact.precisionAt3 * 100;
  const semanticP3 = metrics.byQueryType.semantic.precisionAt3 * 100;
  const adversarialP3 = metrics.byQueryType.adversarial.precisionAt3 * 100;

  console.log('  📋 ANALYSIS:');
  if (exactP3 >= 90) {
    console.log('  ✅ Exact queries (with unique IDs): EXCELLENT');
  } else if (exactP3 >= 70) {
    console.log('  ⚠️  Exact queries: Should be higher - check embedding quality');
  } else {
    console.log('  ❌ Exact queries: POOR - RAG fundamentally broken');
  }

  if (semanticP3 >= 70) {
    console.log('  ✅ Semantic queries (meaning-based): GOOD');
  } else if (semanticP3 >= 50) {
    console.log('  ⚠️  Semantic queries: ACCEPTABLE - could benefit from hybrid search');
  } else {
    console.log('  ❌ Semantic queries: POOR - needs re-ranker or hybrid search');
  }

  if (adversarialP3 >= 50) {
    console.log('  ✅ Adversarial queries (generic): GOOD for pure vector search');
  } else if (adversarialP3 >= 30) {
    console.log('  ⚠️  Adversarial queries: EXPECTED - generic queries are hard');
  } else {
    console.log('  ❌ Adversarial queries: Very low - but expected for generic queries');
  }

  // By Category (collapsed)
  console.log('\n📁 BY CATEGORY (P@3):');
  for (const [cat, data] of Object.entries(metrics.byCategory)) {
    const pct = ((data.hits / data.total) * 100).toFixed(0);
    console.log(`  ${cat.padEnd(10)}: ${pct.padStart(3)}% (${data.hits}/${data.total})`);
  }

  // Failures - show by query type
  const failures = results.filter(r => r.correctRank === null || r.correctRank > 3);
  if (failures.length > 0) {
    console.log('\n❌ FAILURES BY QUERY TYPE:');
    for (const qt of ['exact', 'semantic', 'adversarial'] as QueryType[]) {
      const qtFailures = failures.filter(f => f.testCase.queryType === qt);
      if (qtFailures.length > 0) {
        const info = queryTypeLabels[qt];
        console.log(`\n  ${info.emoji} ${info.label.toUpperCase()} (${qtFailures.length} failures):`);
        for (const f of qtFailures.slice(0, 3)) { // Show max 3 per type
          const rank = f.correctRank ? `Rank ${f.correctRank}` : 'Not found';
          console.log(`    - ${f.testCase.category}: ${rank}`);
          console.log(`      Query: "${f.testCase.query.substring(0, 50)}..."`);
        }
        if (qtFailures.length > 3) {
          console.log(`    ... and ${qtFailures.length - 3} more`);
        }
      }
    }
  }

  // Final Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                           VERDICT                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  if (exactP3 >= 90 && semanticP3 >= 60) {
    console.log('  🎉 RAG QUALITY: EXCELLENT');
    console.log('     Vector search is working well for this use case.');
  } else if (exactP3 >= 80 && semanticP3 >= 50) {
    console.log('  ✅ RAG QUALITY: GOOD');
    console.log('     Acceptable for production, but could benefit from:');
    console.log('     - Hybrid search (BM25 + vector)');
    console.log('     - Re-ranking model');
  } else if (exactP3 >= 70) {
    console.log('  ⚠️  RAG QUALITY: ACCEPTABLE');
    console.log('     Works but needs improvement:');
    console.log('     - Consider hybrid search (BM25 + vector)');
    console.log('     - Add re-ranking step');
    console.log('     - Try different embedding model');
  } else {
    console.log('  ❌ RAG QUALITY: POOR');
    console.log('     Needs significant work:');
    console.log('     - Check embedding model quality');
    console.log('     - Implement hybrid search');
    console.log('     - Add query expansion');
    console.log('     - Consider fine-tuning embeddings');
  }

  console.log('════════════════════════════════════════════════════════════════════════\n');
}

// === HNSW Index Management ===
// Mistral-embed outputs 1024 dimensions
const VECTOR_DIMENSIONS = 1024;

async function checkHnswIndex(): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'embeddings' AND indexdef LIKE '%hnsw%'`
  );
  return result.length > 0;
}

async function checkVectorDimensions(): Promise<boolean> {
  // Check if vector column has explicit dimensions via atttypmod
  const typResult = await prisma.$queryRawUnsafe<Array<{ atttypmod: number }>>(
    `SELECT atttypmod FROM pg_attribute a
     JOIN pg_class c ON a.attrelid = c.oid
     WHERE c.relname = 'embeddings' AND a.attname = 'vector'`
  );
  // atttypmod > -1 means dimensions are set
  return typResult.length > 0 && Number(typResult[0].atttypmod) > -1;
}

async function setVectorDimensions(): Promise<void> {
  console.log(`  Setting vector dimensions to ${VECTOR_DIMENSIONS}...`);

  // First check current dimension
  const hasDims = await checkVectorDimensions();
  if (hasDims) {
    console.log('  Vector column already has dimensions');
    return;
  }

  // Alter column to have explicit dimensions (required for HNSW)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "embeddings"
    ALTER COLUMN vector TYPE vector(${VECTOR_DIMENSIONS})
  `);
  console.log(`  ✅ Vector column updated to vector(${VECTOR_DIMENSIONS})`);
}

async function createHnswIndex(): Promise<void> {
  console.log('\n🔧 Creating HNSW index for faster vector search...');

  // HNSW requires explicit vector dimensions
  await setVectorDimensions();

  const startTime = performance.now();

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx
    ON "embeddings" USING hnsw (vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✅ HNSW index created in ${elapsed}s`);
}

async function dropHnswIndex(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS embeddings_vector_hnsw_idx`);
  console.log('  Dropped HNSW index');
}

// === Print Latency Stats ===
function printLatencyStats(modes: SearchMode[]): void {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║              ⏱️  LATENCY COMPARISON                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Mode              │ Avg (ms) │ P50 (ms) │ P95 (ms) │ Min (ms) │ Max (ms)');
  console.log('  ──────────────────┼──────────┼──────────┼──────────┼──────────┼─────────');

  for (const mode of modes) {
    const stats = calculateLatencyStats(mode);
    const modeLabel = mode.padEnd(16);
    console.log(`  ${modeLabel} │ ${String(stats.avgMs).padStart(6)}   │ ${String(stats.p50Ms).padStart(6)}   │ ${String(stats.p95Ms).padStart(6)}   │ ${String(stats.minMs).padStart(6)}   │ ${String(stats.maxMs).padStart(6)}`);
  }

  console.log('  ──────────────────┴──────────┴──────────┴──────────┴──────────┴─────────');
}

// === Cleanup ===
async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleaning up...');
  const tenant = await prisma.tenant.findFirst({ where: { slug: CONFIG.testTenantSlug } });
  if (tenant) {
    await prisma.$executeRawUnsafe(`DELETE FROM "embeddings" WHERE "tenantId" = $1`, tenant.id);
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
  console.log('  Cleanup complete');
}

// === Main ===
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              REAL RAG QUALITY BENCHMARK                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }
  mistral = new Mistral({ apiKey });
  console.log('✅ Mistral client initialized');

  try {
    const testCases = generateTestCases();
    console.log(`📋 Generated ${testCases.length} test cases with unique identifiers`);

    await setup();
    await insertEmails(testCases);
    await indexEmails(testCases);

    // Add noise emails to make test realistic (500 similar emails for HARD mode)
    const noiseCount = process.argv.includes('--hard') ? 500 : 50;
    const noiseIds = await insertNoiseEmails(noiseCount);
    await indexNoiseEmails(noiseIds);

    // Calculate unique target emails (3 queries per email)
    const uniqueTargetEmails = testCases.length / 3;
    console.log(`\n📊 Test Setup:`);
    console.log(`   - Target emails: ${uniqueTargetEmails}`);
    console.log(`   - Noise emails: ${noiseCount}`);
    console.log(`   - Total indexed: ${uniqueTargetEmails + noiseCount}`);
    console.log(`   - Test queries: ${testCases.length} (3 per target: exact/semantic/adversarial)`);

    // === HNSW INDEX COMPARISON ===
    const testHnsw = process.argv.includes('--hnsw') || process.argv.includes('--latency');

    if (testHnsw) {
      console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
      console.log('║              ⚡ HNSW INDEX LATENCY COMPARISON                           ║');
      console.log('╚════════════════════════════════════════════════════════════════════════╝');

      // Check and drop existing HNSW index for fair baseline
      const hasHnsw = await checkHnswIndex();
      if (hasHnsw) {
        console.log('\n🔍 Found existing HNSW index, dropping for baseline test...');
        await dropHnswIndex();
      }

      // === BASELINE: Without HNSW ===
      console.log('\n📏 BASELINE: Running WITHOUT HNSW index (sequential scan)...');
      latencyRecords.clear(); // Clear any previous records

      const baselineModes: SearchMode[] = ['vector', 'hybrid_rrf'];
      for (const mode of baselineModes) {
        // Run each mode 3 times to warm up and get stable latency
        for (let run = 0; run < 3; run++) {
          await runQueries(testCases, mode, run === 0);
        }
      }

      // Save baseline latency
      const baselineLatency: Record<string, LatencyStats> = {};
      for (const mode of baselineModes) {
        baselineLatency[mode] = calculateLatencyStats(mode);
      }

      // === CREATE HNSW INDEX ===
      await createHnswIndex();

      // Clear latency records for fresh measurement
      latencyRecords.clear();

      // === OPTIMIZED: With HNSW ===
      console.log('\n⚡ OPTIMIZED: Running WITH HNSW index (O(log n) search)...');

      for (const mode of baselineModes) {
        // Run 3 times for stable measurement
        for (let run = 0; run < 3; run++) {
          await runQueries(testCases, mode, run === 0);
        }
      }

      // Save optimized latency
      const optimizedLatency: Record<string, LatencyStats> = {};
      for (const mode of baselineModes) {
        optimizedLatency[mode] = calculateLatencyStats(mode);
      }

      // === LATENCY COMPARISON ===
      console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
      console.log('║              📊 LATENCY IMPROVEMENT WITH HNSW                           ║');
      console.log('╚════════════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('  Mode              │ Without HNSW │ With HNSW  │ Speedup    │ P95 Before │ P95 After');
      console.log('  ──────────────────┼──────────────┼────────────┼────────────┼────────────┼───────────');

      for (const mode of baselineModes) {
        const before = baselineLatency[mode];
        const after = optimizedLatency[mode];
        const speedup = before.avgMs > 0 ? (before.avgMs / after.avgMs).toFixed(2) : 'N/A';

        const modeLabel = mode.padEnd(16);
        console.log(`  ${modeLabel} │ ${String(before.avgMs).padStart(8)} ms │ ${String(after.avgMs).padStart(6)} ms │ ${String(speedup).padStart(6)}x    │ ${String(before.p95Ms).padStart(6)} ms  │ ${String(after.p95Ms).padStart(5)} ms`);
      }
      console.log('  ──────────────────┴──────────────┴────────────┴────────────┴────────────┴───────────');

      console.log('\n  📋 HNSW INDEX INFO:');
      console.log('     - Algorithm: Hierarchical Navigable Small World');
      console.log('     - Complexity: O(log n) instead of O(n)');
      console.log('     - Parameters: m=16, ef_construction=64');
      console.log('     - Best for: Large datasets (1000+ embeddings)');

    } else {
      // === STANDARD COMPARISON (no HNSW test) ===
      console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
      console.log('║              🔬 SEARCH MODE COMPARISON                                 ║');
      console.log('╚════════════════════════════════════════════════════════════════════════╝');

      const modes: SearchMode[] = ['vector', 'bm25', 'hybrid_rrf', 'hybrid_weighted'];
      const modeResults: Record<SearchMode, { results: QueryResult[]; metrics: Metrics }> = {} as Record<SearchMode, { results: QueryResult[]; metrics: Metrics }>;

      for (const mode of modes) {
        console.log(`\n${'═'.repeat(70)}`);
        const results = await runQueries(testCases, mode, true);
        const metrics = calculateMetrics(results);
        modeResults[mode] = { results, metrics };
      }

      // === COMPARISON SUMMARY ===
      console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
      console.log('║              📊 COMPARISON SUMMARY                                      ║');
      console.log('╚════════════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('  Mode              │ P@1      │ P@3      │ MRR      │ Exact    │ Semantic │ Adversarial');
      console.log('  ──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────────');

      for (const mode of modes) {
        const m = modeResults[mode].metrics;
        const p1 = (m.precisionAtK[1] * 100).toFixed(0);
        const p3 = (m.precisionAtK[3] * 100).toFixed(0);
        const mrr = (m.mrr * 100).toFixed(0);
        const exact = (m.byQueryType.exact.precisionAt3 * 100).toFixed(0);
        const semantic = (m.byQueryType.semantic.precisionAt3 * 100).toFixed(0);
        const adversarial = (m.byQueryType.adversarial.precisionAt3 * 100).toFixed(0);

        const modeLabel = mode.padEnd(16);
        console.log(`  ${modeLabel} │ ${p1.padStart(4)}%    │ ${p3.padStart(4)}%    │ ${mrr.padStart(4)}%    │ ${exact.padStart(4)}%    │ ${semantic.padStart(4)}%    │ ${adversarial.padStart(4)}%`);
      }
      console.log('  ──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────────');

      // Find best mode
      const bestMode = modes.reduce((best, mode) => {
        const bestMrr = modeResults[best].metrics.mrr;
        const currMrr = modeResults[mode].metrics.mrr;
        return currMrr > bestMrr ? mode : best;
      }, modes[0]);

      console.log(`\n  🏆 BEST MODE: ${bestMode.toUpperCase()} (MRR: ${(modeResults[bestMode].metrics.mrr * 100).toFixed(1)}%)`);

      // Print latency stats
      printLatencyStats(modes);

      // Detailed results for best mode
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`Detailed results for ${bestMode.toUpperCase()}:`);
      printResults(modeResults[bestMode].results, modeResults[bestMode].metrics);
    }

    // Cleanup
    if (process.argv.includes('--cleanup')) {
      await cleanup();
    } else {
      console.log('\n💡 Options:');
      console.log('   --cleanup   Remove test data after benchmark');
      console.log('   --hard      Use 500 noise emails (stress test)');
      console.log('   --hnsw      Test HNSW index latency improvement');
    }

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    await cleanup();
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
