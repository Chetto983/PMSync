/**
 * Test RAG on Real User Data
 * Uses Davide's Workspace with 3 providers
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace

async function main() {
  console.log('🔍 Real Email RAG Test\n');

  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  // Check current state
  const [emailCount, embeddingCount, providers] = await Promise.all([
    prisma.email.count({ where: { tenantId: TENANT_ID } }),
    prisma.embedding.count({ where: { tenantId: TENANT_ID } }),
    prisma.providerConfig.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, email: true, providerType: true },
    }),
  ]);

  console.log(`📊 Dataset Stats:`);
  console.log(`   Emails:     ${emailCount}`);
  console.log(`   Embeddings: ${embeddingCount}`);
  console.log(`   Providers:  ${providers.length}`);
  for (const p of providers) {
    console.log(`     - ${p.email} (${p.providerType})`);
  }
  console.log();

  if (embeddingCount === 0) {
    console.log('⚠️  No embeddings found. Need to generate embeddings first.');
    console.log('   Run: npx ts-node scripts/backfill-embeddings.ts');

    // Show sample emails that need embedding
    const sampleEmails = await prisma.email.findMany({
      where: { tenantId: TENANT_ID },
      take: 5,
      select: { subject: true, from: true },
      orderBy: { receivedAt: 'desc' },
    });
    console.log('\n📧 Recent emails without embeddings:');
    for (const e of sampleEmails) {
      console.log(`   "${e.subject}" from ${e.from}`);
    }
    return;
  }

  // Test queries - mix of Italian and English
  const TEST_QUERIES = [
    'fattura pagamento',
    'riunione meeting',
    'progetto deadline',
    'conferma ordine',
    'newsletter',
    'invoice payment',
    'calendar event',
  ];

  console.log('🧪 Testing RAG queries...\n');

  const results: { query: string; latencyMs: number; topResult: string }[] = [];

  for (const query of TEST_QUERIES) {
    const start = Date.now();

    // Generate query embedding
    const embResponse = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: [query],
    });
    const queryVector = embResponse.data?.[0]?.embedding;
    if (!queryVector) {
      console.log(`❌ Failed to embed: "${query}"`);
      continue;
    }

    // Vector search
    const searchResults = await prisma.$queryRaw<{ id: string; content: string; distance: number; emailId: string | null }[]>`
      SELECT id, content, "emailId", vector <=> ${`[${queryVector.join(',')}]`}::vector AS distance
      FROM embeddings
      WHERE "tenantId" = ${TENANT_ID}
      ORDER BY distance ASC
      LIMIT 3
    `;

    const latencyMs = Date.now() - start;
    const topResult = searchResults[0]?.content?.substring(0, 80) || 'No result';
    const distance = searchResults[0]?.distance?.toFixed(3) || 'N/A';

    results.push({ query, latencyMs, topResult });
    console.log(`✓ "${query}" - ${latencyMs}ms (dist: ${distance})`);
    console.log(`  → ${topResult}...`);
    console.log();
  }

  // Summary
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 PERFORMANCE SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`  Emails:      ${emailCount}`);
  console.log(`  Embeddings:  ${embeddingCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
