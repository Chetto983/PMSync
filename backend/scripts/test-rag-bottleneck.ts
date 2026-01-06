/**
 * RAG Pipeline Bottleneck Analysis
 * Measures each step of the VoltAgent RAG pipeline
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
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

interface TimingResult {
  step: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  samples: number[];
}

const TEST_QUERIES = [
  'fattura pagamento',
  'riunione meeting',
  'progetto deadline',
  'conferma ordine',
  'newsletter',
];

async function measureStep<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { result, ms };
}

async function main() {
  console.log('🔬 RAG Pipeline Bottleneck Analysis\n');
  console.log('━'.repeat(50));

  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  const timings: Record<string, number[]> = {
    'Mistral Embedding API': [],
    'Vector Search (HNSW)': [],
    'Keyword Search (Prisma)': [],
    'RRF Fusion': [],
    'Total Pipeline': [],
  };

  // Run multiple iterations for accurate measurement
  console.log(`\nRunning ${TEST_QUERIES.length} queries x 2 iterations...\n`);

  for (let iter = 0; iter < 2; iter++) {
    for (const query of TEST_QUERIES) {
      const totalStart = performance.now();

      // Step 1: Mistral Embedding Generation
      const { result: embResponse, ms: embeddingMs } = await measureStep(
        'Mistral Embedding',
        () => mistral.embeddings.create({
          model: 'mistral-embed',
          inputs: [query],
        })
      );
      timings['Mistral Embedding API'].push(embeddingMs);

      const queryVector = embResponse.data?.[0]?.embedding;
      if (!queryVector) {
        console.log(`❌ Failed to embed: "${query}"`);
        continue;
      }

      // Step 2: Vector Search (HNSW)
      const { result: vectorResults, ms: vectorMs } = await measureStep(
        'Vector Search',
        () => prisma.$queryRaw<{ id: string; content: string; distance: number }[]>`
          SELECT id, content, vector <=> ${`[${queryVector.join(',')}]`}::vector AS distance
          FROM embeddings
          WHERE "tenantId" = ${TENANT_ID}
          ORDER BY distance ASC
          LIMIT 10
        `
      );
      timings['Vector Search (HNSW)'].push(vectorMs);

      // Step 3: Keyword Search (simulating the Prisma query)
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const { result: keywordResults, ms: keywordMs } = await measureStep(
        'Keyword Search',
        () => prisma.email.findMany({
          where: {
            tenantId: TENANT_ID,
            folder: { notIn: ['TRASH', 'SPAM', 'JUNK'] },
            OR: [
              { subject: { contains: query, mode: 'insensitive' } },
              { snippet: { contains: query, mode: 'insensitive' } },
              { from: { contains: query, mode: 'insensitive' } },
              ...keywords.slice(0, 3).map(kw => ({ subject: { contains: kw, mode: 'insensitive' as const } })),
            ],
          },
          take: 20,
          orderBy: { receivedAt: 'desc' },
          select: { id: true, subject: true, snippet: true, from: true },
        })
      );
      timings['Keyword Search (Prisma)'].push(keywordMs);

      // Step 4: RRF Fusion (simulated)
      const { ms: fusionMs } = await measureStep(
        'RRF Fusion',
        async () => {
          const RRF_K = 60;
          const scores = new Map<string, number>();

          // Vector results
          vectorResults.forEach((r, idx) => {
            const rrfScore = 1 / (RRF_K + idx + 1);
            scores.set(r.id, (scores.get(r.id) || 0) + rrfScore);
          });

          // Keyword results
          keywordResults.forEach((r, idx) => {
            const rrfScore = 1 / (RRF_K + idx + 1);
            scores.set(r.id, (scores.get(r.id) || 0) + rrfScore);
          });

          // Sort by score
          return Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        }
      );
      timings['RRF Fusion'].push(fusionMs);

      const totalMs = performance.now() - totalStart;
      timings['Total Pipeline'].push(totalMs);

      if (iter === 0) {
        console.log(`  "${query}" - ${totalMs.toFixed(0)}ms`);
      }
    }
  }

  // Calculate statistics
  console.log('\n' + '━'.repeat(50));
  console.log('📊 BOTTLENECK ANALYSIS\n');

  const results: TimingResult[] = [];
  for (const [step, samples] of Object.entries(timings)) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    results.push({ step, avgMs: avg, minMs: min, maxMs: max, samples });
  }

  // Sort by average time (descending)
  results.sort((a, b) => b.avgMs - a.avgMs);

  // Display as table
  console.log('Step                      | Avg (ms) | Min (ms) | Max (ms) | % of Total');
  console.log('-'.repeat(70));

  const totalAvg = results.find(r => r.step === 'Total Pipeline')?.avgMs || 1;
  for (const r of results) {
    const pct = ((r.avgMs / totalAvg) * 100).toFixed(1);
    console.log(
      `${r.step.padEnd(25)} | ${r.avgMs.toFixed(0).padStart(8)} | ${r.minMs.toFixed(0).padStart(8)} | ${r.maxMs.toFixed(0).padStart(8)} | ${pct.padStart(6)}%`
    );
  }

  // Identify bottleneck
  const bottleneck = results.filter(r => r.step !== 'Total Pipeline')[0];
  console.log('\n' + '━'.repeat(50));
  console.log(`🎯 BOTTLENECK: ${bottleneck.step}`);
  console.log(`   Avg: ${bottleneck.avgMs.toFixed(0)}ms (${((bottleneck.avgMs / totalAvg) * 100).toFixed(0)}% of total)`);

  // Recommendations
  console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:');
  if (bottleneck.step.includes('Mistral')) {
    console.log('   1. Cache query embeddings in Redis (50-70% reduction)');
    console.log('   2. Use Batch API for bulk operations');
    console.log('   3. Consider local embedding model (Ollama) for lower latency');
  } else if (bottleneck.step.includes('Vector')) {
    console.log('   1. Increase HNSW ef_search parameter for speed');
    console.log('   2. Reduce embedding dimensions if possible');
    console.log('   3. Use IVFFlat index for larger datasets');
  } else if (bottleneck.step.includes('Keyword')) {
    console.log('   1. Add GIN trigram indexes');
    console.log('   2. Use full-text search with ts_vector');
    console.log('   3. Limit search to recent emails');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
