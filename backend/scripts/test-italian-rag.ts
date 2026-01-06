/**
 * Quick RAG Test for Italian Dataset
 * Tests vector search performance on 1000 Italian emails
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

const ITALIAN_QUERIES = [
  'contratto rinnovo servizi',
  'fattura pagamento scadenza',
  'progetto deadline consegna',
  'riunione appuntamento call',
  'preventivo offerta commerciale',
  'supporto tecnico problema',
  'assunzione candidato colloquio',
  'ordine spedizione consegna',
  'budget trimestre report',
  'partnership collaborazione accordo',
];

async function main() {
  console.log('🇮🇹 Italian RAG Performance Test\n');

  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  // Find Italian test tenant
  const tenant = await prisma.tenant.findFirst({
    where: { name: 'Italian RAG Test' },
  });

  if (!tenant) {
    console.log('❌ Italian test tenant not found. Run generate-italian-dataset.ts first.');
    return;
  }

  // Count embeddings
  const embeddingCount = await prisma.embedding.count({
    where: { tenantId: tenant.id },
  });
  console.log(`📊 Dataset: ${embeddingCount} embeddings\n`);

  // Test queries
  const results: { query: string; latencyMs: number; topResult: string }[] = [];

  for (const query of ITALIAN_QUERIES) {
    const start = Date.now();

    // Generate query embedding
    const embResponse = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: [query],
    });
    const queryVector = embResponse.data?.[0]?.embedding;
    if (!queryVector) continue;

    // Vector search with HNSW
    const searchResults = await prisma.$queryRaw<{ id: string; content: string; distance: number }[]>`
      SELECT id, content, vector <=> ${`[${queryVector.join(',')}]`}::vector AS distance
      FROM embeddings
      WHERE "tenantId" = ${tenant.id}
      ORDER BY distance ASC
      LIMIT 3
    `;

    const latencyMs = Date.now() - start;
    const topResult = searchResults[0]?.content?.substring(0, 60) || 'No result';

    results.push({ query, latencyMs, topResult });
    console.log(`✓ "${query}" - ${latencyMs}ms`);
  }

  // Summary
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const minLatency = Math.min(...results.map(r => r.latencyMs));
  const maxLatency = Math.max(...results.map(r => r.latencyMs));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 PERFORMANCE SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`  Min latency: ${minLatency}ms`);
  console.log(`  Max latency: ${maxLatency}ms`);
  console.log(`  Embeddings:  ${embeddingCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Show sample results
  console.log('📝 Sample Results:');
  for (const r of results.slice(0, 3)) {
    console.log(`  "${r.query}"`);
    console.log(`    → ${r.topResult}...`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
