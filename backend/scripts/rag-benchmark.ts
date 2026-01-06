/**
 * RAG Quality Benchmark Script
 *
 * Tests the RAG system quality using synthetic Italian Enron-style emails.
 * Measures: Precision@K, Recall@K, MRR, NDCG
 *
 * Usage:
 *   npx ts-node backend/scripts/rag-benchmark.ts [--emails 1000] [--queries 50]
 *
 * @author AI Refactor v2.0
 */

import { PrismaClient } from '@prisma/client';
import { Mistral } from '@mistralai/mistralai';
import { nanoid } from 'nanoid';
import * as dotenv from 'dotenv';

dotenv.config();

// === Configuration ===
const CONFIG = {
  emails: parseInt(process.argv.find(a => a.startsWith('--emails'))?.split('=')[1] || '1000', 10),
  queries: parseInt(process.argv.find(a => a.startsWith('--queries'))?.split('=')[1] || '50', 10),
  topK: [1, 3, 5, 10],
  embeddingModel: 'mistral-embed',
  testTenantId: 'benchmark-tenant-001',
  batchSize: 50, // Embeddings batch size
};

const prisma = new PrismaClient();
let mistral: Mistral;

// === Italian Business Email Templates ===
const ITALIAN_TEMPLATES = {
  senders: [
    'Mario Rossi <mario.rossi@azienda.it>',
    'Giulia Bianchi <giulia.bianchi@consulting.it>',
    'Marco Ferrari <m.ferrari@legale.it>',
    'Anna Colombo <anna.colombo@vendite.it>',
    'Luca Ricci <l.ricci@finanza.it>',
    'Sofia Romano <s.romano@hr.it>',
    'Giuseppe Gallo <g.gallo@operations.it>',
    'Francesca Greco <f.greco@marketing.it>',
    'Andrea Marino <a.marino@tech.it>',
    'Valentina Costa <v.costa@executive.it>',
  ],

  topics: [
    { id: 'budget', keywords: ['budget', 'trimestre', 'spese', 'costi', 'previsione', 'Q1', 'Q2', 'Q3', 'Q4'] },
    { id: 'merger', keywords: ['fusione', 'acquisizione', 'integrazione', 'due diligence', 'trattativa'] },
    { id: 'contract', keywords: ['contratto', 'clausola', 'termini', 'accordo', 'firma', 'scadenza'] },
    { id: 'meeting', keywords: ['riunione', 'incontro', 'call', 'agenda', 'partecipanti', 'sala'] },
    { id: 'project', keywords: ['progetto', 'milestone', 'deadline', 'delivery', 'timeline', 'sprint'] },
    { id: 'client', keywords: ['cliente', 'Acme', 'Globex', 'proposta', 'offerta', 'preventivo'] },
    { id: 'legal', keywords: ['legale', 'compliance', 'GDPR', 'privacy', 'normativa', 'regolamento'] },
    { id: 'hr', keywords: ['assunzione', 'candidato', 'colloquio', 'stipendio', 'benefit', 'onboarding'] },
    { id: 'tech', keywords: ['sistema', 'server', 'migrazione', 'cloud', 'AWS', 'deployment'] },
    { id: 'sales', keywords: ['vendita', 'lead', 'pipeline', 'conversion', 'target', 'revenue'] },
  ],

  subjectTemplates: [
    'Re: {topic} - Aggiornamento {date}',
    '{topic} - Richiesta urgente',
    'Fwd: {topic} - Documentazione',
    '{topic} Q{quarter} - Analisi',
    'URGENTE: {topic} - Azione richiesta',
    '{topic} - Proposta per {client}',
    'Re: Re: {topic} - Follow-up',
    '{topic} - Scadenza {deadline}',
  ],

  bodyTemplates: [
    `Buongiorno,

Come discusso nella riunione di {day}, allego la documentazione relativa a {topic}.

I punti principali sono:
- {point1}
- {point2}
- {point3}

La deadline è fissata per il {deadline}. Per favore conferma la ricezione.

Cordiali saluti,
{sender}`,

    `Ciao,

Ti scrivo per aggiornarti sulla situazione {topic}. Abbiamo raggiunto i seguenti risultati:

{point1}
{point2}

Dobbiamo discutere i prossimi passi. Quando sei disponibile per una call?

Grazie,
{sender}`,

    `Gentile team,

In riferimento al progetto {topic}, vi informo che:

1. {point1}
2. {point2}
3. {point3}

Il budget attuale è di €{amount}. La scadenza del {deadline} rimane confermata.

Resto a disposizione per chiarimenti.

{sender}`,

    `Ciao a tutti,

Questa settimana abbiamo lavorato su {topic}. Ecco il riepilogo:

- Status: {status}
- Budget utilizzato: {percent}%
- Rischi identificati: {risk}

Il prossimo incontro è previsto per {nextMeeting}.

{sender}`,
  ],
};

// === Ground Truth Queries with Expected Topics ===
const GROUND_TRUTH_QUERIES = [
  { query: 'Qual è il budget del Q4?', expectedTopics: ['budget'], minRelevance: 3 },
  { query: 'Aggiornamento sulla fusione con Globex', expectedTopics: ['merger', 'client'], minRelevance: 2 },
  { query: 'Scadenza del contratto con Acme', expectedTopics: ['contract', 'client'], minRelevance: 2 },
  { query: 'Quando è la prossima riunione?', expectedTopics: ['meeting'], minRelevance: 3 },
  { query: 'Status del progetto di migrazione cloud', expectedTopics: ['project', 'tech'], minRelevance: 2 },
  { query: 'Email di Mario Rossi sul budget', expectedTopics: ['budget'], minRelevance: 2, sender: 'Mario Rossi' },
  { query: 'Problemi legali GDPR', expectedTopics: ['legal'], minRelevance: 2 },
  { query: 'Nuove assunzioni nel team tech', expectedTopics: ['hr', 'tech'], minRelevance: 1 },
  { query: 'Pipeline vendite Q3', expectedTopics: ['sales', 'budget'], minRelevance: 2 },
  { query: 'Deadline progetto Acme', expectedTopics: ['project', 'client'], minRelevance: 2 },
  { query: 'Costi del progetto di integrazione', expectedTopics: ['budget', 'project'], minRelevance: 2 },
  { query: 'Documenti per la due diligence', expectedTopics: ['merger', 'legal'], minRelevance: 2 },
  { query: 'Proposta commerciale per cliente', expectedTopics: ['client', 'sales'], minRelevance: 2 },
  { query: 'Analisi trimestrale spese', expectedTopics: ['budget'], minRelevance: 3 },
  { query: 'Compliance normativa privacy', expectedTopics: ['legal'], minRelevance: 2 },
];

// === Email Generation ===
interface GeneratedEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  topics: string[];
  receivedAt: Date;
}

function generateEmails(count: number): GeneratedEmail[] {
  const emails: GeneratedEmail[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Pick random topic(s)
    const numTopics = Math.random() > 0.7 ? 2 : 1;
    const selectedTopics: typeof ITALIAN_TEMPLATES.topics[number][] = [];

    for (let t = 0; t < numTopics; t++) {
      const topic = ITALIAN_TEMPLATES.topics[Math.floor(Math.random() * ITALIAN_TEMPLATES.topics.length)];
      if (!selectedTopics.find(st => st.id === topic.id)) {
        selectedTopics.push(topic);
      }
    }

    // Pick sender
    const sender = ITALIAN_TEMPLATES.senders[Math.floor(Math.random() * ITALIAN_TEMPLATES.senders.length)];
    const senderName = sender.split('<')[0].trim();

    // Generate subject
    const subjectTemplate = ITALIAN_TEMPLATES.subjectTemplates[Math.floor(Math.random() * ITALIAN_TEMPLATES.subjectTemplates.length)];
    const subject = subjectTemplate
      .replace('{topic}', capitalize(selectedTopics[0].keywords[0]))
      .replace('{date}', formatItalianDate(new Date(now - Math.random() * 30 * dayMs)))
      .replace('{quarter}', String(Math.floor(Math.random() * 4) + 1))
      .replace('{client}', ['Acme', 'Globex', 'TechCorp'][Math.floor(Math.random() * 3)])
      .replace('{deadline}', formatItalianDate(new Date(now + Math.random() * 60 * dayMs)));

    // Generate body
    const bodyTemplate = ITALIAN_TEMPLATES.bodyTemplates[Math.floor(Math.random() * ITALIAN_TEMPLATES.bodyTemplates.length)];
    const body = bodyTemplate
      .replace('{day}', ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'][Math.floor(Math.random() * 5)])
      .replace('{topic}', selectedTopics.map(t => t.keywords[0]).join(' e '))
      .replace('{point1}', generatePoint(selectedTopics[0]))
      .replace('{point2}', generatePoint(selectedTopics[0]))
      .replace('{point3}', generatePoint(selectedTopics[numTopics > 1 ? 1 : 0] || selectedTopics[0]))
      .replace('{deadline}', formatItalianDate(new Date(now + Math.random() * 30 * dayMs)))
      .replace('{sender}', senderName)
      .replace('{amount}', String(Math.floor(Math.random() * 500000) + 10000))
      .replace('{status}', ['In corso', 'Completato', 'In attesa', 'Bloccato'][Math.floor(Math.random() * 4)])
      .replace('{percent}', String(Math.floor(Math.random() * 100)))
      .replace('{risk}', ['Nessuno', 'Basso', 'Medio', 'Alto'][Math.floor(Math.random() * 4)])
      .replace('{nextMeeting}', formatItalianDate(new Date(now + Math.random() * 14 * dayMs)));

    emails.push({
      id: nanoid(),
      from: sender,
      subject,
      body,
      topics: selectedTopics.map(t => t.id),
      receivedAt: new Date(now - Math.random() * 90 * dayMs),
    });
  }

  return emails;
}

function generatePoint(topic: typeof ITALIAN_TEMPLATES.topics[number]): string {
  const points: Record<string, string[]> = {
    budget: ['Riduzione costi del 15%', 'Superato target Q3', 'Necessari €50K aggiuntivi', 'ROI positivo'],
    merger: ['Due diligence completata', 'Valutazione €10M', 'Trattativa in corso', 'Antitrust approvato'],
    contract: ['Clausola 5.2 rivista', 'Termini accettati', 'Firma prevista venerdì', 'Durata 24 mesi'],
    meeting: ['Confermata sala B', 'Partecipanti: 12', 'Agenda inviata', 'Call zoom alle 15'],
    project: ['Sprint 3 completato', 'Delivery on-time', '80% completamento', 'Testing in corso'],
    client: ['Cliente soddisfatto', 'Nuova richiesta', 'Proposta inviata', 'Feedback positivo'],
    legal: ['GDPR compliant', 'Audit superato', 'Policy aggiornata', 'Formazione completata'],
    hr: ['3 candidati selezionati', 'Colloqui la prossima settimana', 'Offerta inviata', 'Onboarding lunedì'],
    tech: ['Server migrati', 'Zero downtime', 'Performance +40%', 'Backup verificato'],
    sales: ['Pipeline €2M', '15 nuovi lead', 'Conversion 25%', 'Target raggiunto'],
  };

  const topicPoints = points[topic.id] || ['Punto completato'];
  return topicPoints[Math.floor(Math.random() * topicPoints.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatItalianDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// === Embedding Generation ===
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await mistral.embeddings.create({
    model: CONFIG.embeddingModel,
    inputs: texts,
  });

  return response.data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(item => item.embedding);
}

// === Store Emails and Embeddings ===
async function indexEmails(emails: GeneratedEmail[]): Promise<void> {
  console.log(`\n📧 Indexing ${emails.length} emails in batches of ${CONFIG.batchSize}...`);

  let indexed = 0;

  for (let i = 0; i < emails.length; i += CONFIG.batchSize) {
    const batch = emails.slice(i, i + CONFIG.batchSize);

    // Generate embeddings for batch
    const texts = batch.map(e => `${e.subject}\n${e.from}\n${e.body}`);
    const embeddings = await generateEmbeddings(texts);

    // Store in database
    for (let j = 0; j < batch.length; j++) {
      const email = batch[j];
      const embedding = embeddings[j];

      // Insert embedding with metadata
      const vectorLiteral = `'[${embedding.join(',')}]'::vector`;
      const metadata = JSON.stringify({
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        topics: email.topics,
        source: 'benchmark',
      });

      await prisma.$executeRawUnsafe(`
        INSERT INTO "embeddings" ("id", "tenantId", "documentName", "content", "vector", "embeddingModel", "metadata", "createdAt")
        VALUES ($1, $2, $3, $4, ${vectorLiteral}, $5, $6::jsonb, NOW())
        ON CONFLICT DO NOTHING
      `, nanoid(), CONFIG.testTenantId, email.subject, `${email.subject}\n${email.body}`, CONFIG.embeddingModel, metadata);
    }

    indexed += batch.length;
    process.stdout.write(`\r  Progress: ${indexed}/${emails.length} (${Math.round(indexed/emails.length*100)}%)`);

    // Rate limiting delay
    await sleep(200);
  }

  console.log('\n  Done indexing!');
}

// === Search & Evaluation ===
interface SearchResult {
  id: string;
  content: string;
  metadata: { topics?: string[]; from?: string };
  distance: number;
}

async function searchEmails(query: string, limit: number): Promise<SearchResult[]> {
  const [queryEmbedding] = await generateEmbeddings([query]);
  const vectorLiteral = `'[${queryEmbedding.join(',')}]'::vector`;

  const results = await prisma.$queryRawUnsafe<Array<{
    id: string;
    content: string;
    metadata: string;
    distance: number;
  }>>(`
    WITH tenant_embeddings AS (
      SELECT "id", "content", "metadata", "vector"
      FROM "embeddings"
      WHERE "tenantId" = $1
    )
    SELECT "id", "content", "metadata"::text, ("vector" <-> ${vectorLiteral}) AS "distance"
    FROM tenant_embeddings
    ORDER BY "vector" <-> ${vectorLiteral}
    LIMIT $2
  `, CONFIG.testTenantId, limit);

  return results.map(r => ({
    id: r.id,
    content: r.content,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    distance: r.distance,
  }));
}

// === Metrics Calculation ===
interface EvaluationResult {
  query: string;
  expectedTopics: string[];
  results: { id: string; topics: string[]; relevant: boolean }[];
  precision: Record<number, number>;
  recall: Record<number, number>;
  mrr: number;
  ndcg: Record<number, number>;
}

function isRelevant(resultTopics: string[], expectedTopics: string[], expectedSender?: string, resultFrom?: string): boolean {
  const topicMatch = expectedTopics.some(et => resultTopics.includes(et));
  const senderMatch = expectedSender ? resultFrom?.includes(expectedSender) : true;
  return topicMatch && senderMatch;
}

function evaluateResults(
  results: SearchResult[],
  groundTruth: typeof GROUND_TRUTH_QUERIES[number],
): EvaluationResult {
  const relevantResults = results.map(r => ({
    id: r.id,
    topics: r.metadata?.topics || [],
    relevant: isRelevant(r.metadata?.topics || [], groundTruth.expectedTopics, groundTruth.sender, r.metadata?.from),
  }));

  // Calculate metrics for each K
  const precision: Record<number, number> = {};
  const recall: Record<number, number> = {};
  const ndcg: Record<number, number> = {};

  // Total relevant in corpus (estimated)
  const totalRelevant = Math.max(groundTruth.minRelevance, relevantResults.filter(r => r.relevant).length);

  for (const k of CONFIG.topK) {
    const topK = relevantResults.slice(0, k);
    const relevantInTopK = topK.filter(r => r.relevant).length;

    // Precision@K: relevant in top K / K
    precision[k] = relevantInTopK / k;

    // Recall@K: relevant in top K / total relevant
    recall[k] = totalRelevant > 0 ? relevantInTopK / totalRelevant : 0;

    // NDCG@K
    const dcg = topK.reduce((sum, r, i) => sum + (r.relevant ? 1 / Math.log2(i + 2) : 0), 0);
    const idealDcg = Array(Math.min(k, totalRelevant)).fill(0).reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
    ndcg[k] = idealDcg > 0 ? dcg / idealDcg : 0;
  }

  // MRR: 1 / rank of first relevant result
  const firstRelevantIdx = relevantResults.findIndex(r => r.relevant);
  const mrr = firstRelevantIdx >= 0 ? 1 / (firstRelevantIdx + 1) : 0;

  return {
    query: groundTruth.query,
    expectedTopics: groundTruth.expectedTopics,
    results: relevantResults,
    precision,
    recall,
    mrr,
    ndcg,
  };
}

// === Main Benchmark ===
async function runBenchmark(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           RAG Quality Benchmark - Italian Emails           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Initialize Mistral
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }
  mistral = new Mistral({ apiKey });

  // Clean up previous benchmark data
  console.log('\n🧹 Cleaning up previous benchmark data...');
  await prisma.$executeRawUnsafe(`DELETE FROM "embeddings" WHERE "tenantId" = $1`, CONFIG.testTenantId);

  // Generate emails
  console.log(`\n📝 Generating ${CONFIG.emails} Italian business emails...`);
  const emails = generateEmails(CONFIG.emails);

  // Topic distribution
  const topicCounts: Record<string, number> = {};
  for (const email of emails) {
    for (const topic of email.topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }
  console.log('  Topic distribution:');
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${topic}: ${count} emails`);
  }

  // Index emails
  await indexEmails(emails);

  // Run evaluation queries
  console.log(`\n🔍 Running ${GROUND_TRUTH_QUERIES.length} evaluation queries...`);
  const evaluations: EvaluationResult[] = [];

  for (const gt of GROUND_TRUTH_QUERIES) {
    const results = await searchEmails(gt.query, Math.max(...CONFIG.topK));
    const evaluation = evaluateResults(results, gt);
    evaluations.push(evaluation);

    console.log(`\n  Query: "${gt.query}"`);
    console.log(`    Expected topics: ${gt.expectedTopics.join(', ')}`);
    console.log(`    MRR: ${evaluation.mrr.toFixed(3)}`);
    console.log(`    P@5: ${evaluation.precision[5]?.toFixed(3) || 'N/A'}, R@5: ${evaluation.recall[5]?.toFixed(3) || 'N/A'}`);

    // Rate limiting
    await sleep(100);
  }

  // Aggregate metrics
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                    AGGREGATE RESULTS                       ');
  console.log('════════════════════════════════════════════════════════════');

  for (const k of CONFIG.topK) {
    const avgPrecision = evaluations.reduce((sum, e) => sum + (e.precision[k] || 0), 0) / evaluations.length;
    const avgRecall = evaluations.reduce((sum, e) => sum + (e.recall[k] || 0), 0) / evaluations.length;
    const avgNDCG = evaluations.reduce((sum, e) => sum + (e.ndcg[k] || 0), 0) / evaluations.length;

    console.log(`\n  @${k}:`);
    console.log(`    Precision: ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`    Recall:    ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`    NDCG:      ${(avgNDCG * 100).toFixed(1)}%`);
  }

  const avgMRR = evaluations.reduce((sum, e) => sum + e.mrr, 0) / evaluations.length;
  console.log(`\n  Mean Reciprocal Rank (MRR): ${(avgMRR * 100).toFixed(1)}%`);

  // Quality assessment
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                    QUALITY ASSESSMENT                      ');
  console.log('════════════════════════════════════════════════════════════');

  const p5 = evaluations.reduce((sum, e) => sum + (e.precision[5] || 0), 0) / evaluations.length;

  if (p5 >= 0.7) {
    console.log('  ✅ EXCELLENT - RAG quality is excellent (P@5 ≥ 70%)');
  } else if (p5 >= 0.5) {
    console.log('  ⚠️  GOOD - RAG quality is acceptable (P@5 ≥ 50%)');
  } else if (p5 >= 0.3) {
    console.log('  🔶 FAIR - RAG quality needs improvement (P@5 ≥ 30%)');
  } else {
    console.log('  ❌ POOR - RAG quality is below acceptable (P@5 < 30%)');
  }

  // Cleanup
  console.log('\n🧹 Cleaning up benchmark data...');
  await prisma.$executeRawUnsafe(`DELETE FROM "embeddings" WHERE "tenantId" = $1`, CONFIG.testTenantId);

  console.log('\n✅ Benchmark complete!\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
runBenchmark()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
