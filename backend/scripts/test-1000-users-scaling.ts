/**
 * 1000 User Scaling Test
 *
 * Simulates RAG query load for 1000 concurrent users:
 * - Tests query embedding cache effectiveness
 * - Measures vector search latency at scale
 * - Identifies bottlenecks under load
 *
 * Expected results with optimizations:
 * - Cache hit: 5-10ms per query
 * - Cache miss: 300-400ms per query (Mistral API)
 * - Vector search: O(log n) with HNSW ~50ms
 * - Target: 95th percentile < 500ms
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';
import Redis from 'ioredis';
import { createHash } from 'crypto';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace

// Simulated user queries (mix of common and unique)
const QUERY_POOL = [
  // High frequency (will hit cache)
  'inbox', 'sent', 'drafts', 'urgent', 'important', 'meeting', 'invoice',
  'payment', 'newsletter', 'calendar', 'today', 'this week',
  // Medium frequency
  'project update', 'quarterly report', 'team meeting', 'client feedback',
  'budget approval', 'contract review', 'delivery confirmation',
  // Italian
  'fattura', 'pagamento', 'riunione', 'conferma ordine', 'progetto',
  // Low frequency (unique queries - cache misses)
  'specific client name', 'order #12345', 'meeting on January 15th',
];

interface QueryResult {
  query: string;
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
}

interface ScalingMetrics {
  totalQueries: number;
  successRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  cacheHitRate: number;
  queriesPerSecond: number;
  estimatedMonthlyCost: number;
}

async function simulateUserQuery(
  mistral: Mistral,
  redis: Redis,
  queryText: string,
): Promise<QueryResult> {
  const start = Date.now();
  let cacheHit = false;

  try {
    // Check cache first
    const cacheKey = `qemb:${createHash('sha256').update(queryText.toLowerCase().trim()).digest('hex')}`;
    const cached = await redis.get(cacheKey);

    let queryVector: number[];
    if (cached) {
      cacheHit = true;
      queryVector = JSON.parse(cached);
    } else {
      // Generate embedding via Mistral API
      const embResponse = await mistral.embeddings.create({
        model: 'mistral-embed',
        inputs: [queryText],
      });
      queryVector = embResponse.data?.[0]?.embedding ?? [];

      // Cache for next time
      if (queryVector.length > 0) {
        await redis.setex(cacheKey, 3600, JSON.stringify(queryVector));
      }
    }

    // Vector search (always happens)
    if (queryVector.length > 0) {
      await prisma.$queryRaw`
        SELECT id, content, vector <=> ${`[${queryVector.join(',')}]`}::vector AS distance
        FROM embeddings
        WHERE "tenantId" = ${TENANT_ID}
        ORDER BY distance ASC
        LIMIT 5
      `;
    }

    return {
      query: queryText,
      latencyMs: Date.now() - start,
      cacheHit,
      success: true,
    };
  } catch (error) {
    return {
      query: queryText,
      latencyMs: Date.now() - start,
      cacheHit,
      success: false,
    };
  }
}

function calculateMetrics(results: QueryResult[], durationMs: number): ScalingMetrics {
  const successful = results.filter(r => r.success);
  const latencies = successful.map(r => r.latencyMs).sort((a, b) => a - b);
  const cacheHits = successful.filter(r => r.cacheHit).length;

  const percentile = (arr: number[], p: number) => {
    const idx = Math.ceil(arr.length * (p / 100)) - 1;
    return arr[Math.max(0, idx)] || 0;
  };

  // Cost estimation: Mistral embed = $0.1/1M tokens, avg query = 10 tokens
  const cacheMisses = successful.length - cacheHits;
  const tokensUsed = cacheMisses * 10;
  const costPerQuery = (tokensUsed / 1_000_000) * 0.1;

  // Extrapolate to monthly (assuming 8hr workday, 22 days)
  const queriesPerDay = (successful.length / (durationMs / 1000)) * 8 * 3600;
  const monthlyQueries = queriesPerDay * 22;
  const monthlyCost = (monthlyQueries * costPerQuery) / successful.length * cacheMisses;

  return {
    totalQueries: results.length,
    successRate: (successful.length / results.length) * 100,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    cacheHitRate: (cacheHits / successful.length) * 100,
    queriesPerSecond: successful.length / (durationMs / 1000),
    estimatedMonthlyCost: monthlyCost,
  };
}

async function runScalingTest(concurrentUsers: number, queriesPerUser: number) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`🚀 SCALING TEST: ${concurrentUsers} users × ${queriesPerUser} queries`);
  console.log(`${'━'.repeat(60)}\n`);

  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_QUERY_CACHE_DB || '0'),
  });

  // Check prerequisites
  const embeddingCount = await prisma.embedding.count({ where: { tenantId: TENANT_ID } });
  console.log(`📊 Embeddings in database: ${embeddingCount}`);

  if (embeddingCount < 100) {
    console.log('⚠️  Low embedding count. Run backfill-embeddings.ts first for realistic test.');
  }

  const cacheKeys = await redis.keys('qemb:*');
  console.log(`💾 Cache entries: ${cacheKeys.length}`);

  // Warm up cache with common queries first
  console.log('\n🔥 Warming cache with common queries...');
  for (const query of QUERY_POOL.slice(0, 12)) {
    await simulateUserQuery(mistral, redis, query);
    await new Promise(r => setTimeout(r, 50));
  }

  const warmCacheKeys = await redis.keys('qemb:*');
  console.log(`💾 Cache after warmup: ${warmCacheKeys.length}\n`);

  // Run scaling test
  console.log(`🧪 Running ${concurrentUsers * queriesPerUser} total queries...\n`);
  const startTime = Date.now();
  const results: QueryResult[] = [];

  // Simulate users in batches to avoid overwhelming the system
  const batchSize = Math.min(concurrentUsers, 50);
  const batches = Math.ceil(concurrentUsers / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, concurrentUsers);
    const batchUsers = batchEnd - batchStart;

    const batchPromises: Promise<QueryResult[]>[] = [];

    for (let user = 0; user < batchUsers; user++) {
      const userQueries = async () => {
        const userResults: QueryResult[] = [];
        for (let q = 0; q < queriesPerUser; q++) {
          // Random query from pool (weighted towards common queries)
          const queryIdx = Math.floor(Math.random() * Math.random() * QUERY_POOL.length);
          const query = QUERY_POOL[queryIdx];
          const result = await simulateUserQuery(mistral, redis, query);
          userResults.push(result);

          // Small delay between queries (realistic user behavior)
          await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
        }
        return userResults;
      };
      batchPromises.push(userQueries());
    }

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.flat());

    // Progress update
    const progress = ((batch + 1) / batches * 100).toFixed(0);
    process.stdout.write(`\r  Progress: ${progress}% (${results.length}/${concurrentUsers * queriesPerUser} queries)`);
  }

  const duration = Date.now() - startTime;
  console.log('\n');

  // Calculate and display metrics
  const metrics = calculateMetrics(results, duration);

  console.log(`${'━'.repeat(60)}`);
  console.log(`📈 SCALING TEST RESULTS`);
  console.log(`${'━'.repeat(60)}`);
  console.log(`  Total queries:     ${metrics.totalQueries}`);
  console.log(`  Success rate:      ${metrics.successRate.toFixed(1)}%`);
  console.log(`  Cache hit rate:    ${metrics.cacheHitRate.toFixed(1)}%`);
  console.log(`  Queries/second:    ${metrics.queriesPerSecond.toFixed(1)}`);
  console.log();
  console.log(`  Latency (avg):     ${metrics.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  Latency (p50):     ${metrics.p50LatencyMs.toFixed(0)}ms`);
  console.log(`  Latency (p95):     ${metrics.p95LatencyMs.toFixed(0)}ms`);
  console.log(`  Latency (p99):     ${metrics.p99LatencyMs.toFixed(0)}ms`);
  console.log();
  console.log(`  Est. monthly cost: $${metrics.estimatedMonthlyCost.toFixed(2)}`);
  console.log(`${'━'.repeat(60)}`);

  // Evaluation
  console.log('\n📋 EVALUATION:');
  if (metrics.p95LatencyMs < 500) {
    console.log('  ✅ p95 latency < 500ms - PASS');
  } else {
    console.log(`  ❌ p95 latency ${metrics.p95LatencyMs.toFixed(0)}ms > 500ms - NEEDS OPTIMIZATION`);
  }

  if (metrics.cacheHitRate > 50) {
    console.log(`  ✅ Cache hit rate ${metrics.cacheHitRate.toFixed(0)}% > 50% - EFFICIENT`);
  } else {
    console.log(`  ⚠️  Cache hit rate ${metrics.cacheHitRate.toFixed(0)}% < 50% - Consider more pre-warming`);
  }

  if (metrics.successRate > 99) {
    console.log('  ✅ Success rate > 99% - STABLE');
  } else {
    console.log(`  ❌ Success rate ${metrics.successRate.toFixed(1)}% - CHECK ERRORS`);
  }

  await redis.quit();
  await prisma.$disconnect();

  return metrics;
}

async function main() {
  console.log('🔍 1000 User RAG Scaling Test\n');

  // Test scenarios
  const scenarios = [
    { users: 10, queriesPerUser: 5 },   // Light load baseline
    { users: 100, queriesPerUser: 3 },  // Medium load
    { users: 500, queriesPerUser: 2 },  // Heavy load
    // { users: 1000, queriesPerUser: 1 }, // Peak load (uncomment for full test)
  ];

  const allMetrics: { scenario: string; metrics: ScalingMetrics }[] = [];

  for (const scenario of scenarios) {
    const metrics = await runScalingTest(scenario.users, scenario.queriesPerUser);
    allMetrics.push({
      scenario: `${scenario.users}u × ${scenario.queriesPerUser}q`,
      metrics,
    });
  }

  // Summary
  console.log(`\n${'━'.repeat(60)}`);
  console.log('📊 SUMMARY COMPARISON');
  console.log(`${'━'.repeat(60)}`);
  console.log('Scenario        | QPS    | p95(ms) | Cache% | Cost/mo');
  console.log('----------------|--------|---------|--------|--------');
  for (const { scenario, metrics } of allMetrics) {
    console.log(
      `${scenario.padEnd(15)} | ${metrics.queriesPerSecond.toFixed(1).padStart(6)} | ` +
      `${metrics.p95LatencyMs.toFixed(0).padStart(7)} | ${metrics.cacheHitRate.toFixed(0).padStart(6)}% | ` +
      `$${metrics.estimatedMonthlyCost.toFixed(2)}`
    );
  }
  console.log(`${'━'.repeat(60)}`);

  console.log('\n💡 Recommendations:');
  console.log('   1. Enable cache pre-warming at startup');
  console.log('   2. Use batch API for initial corpus indexing');
  console.log('   3. Monitor cache hit rate in production');
  console.log('   4. Scale Redis if cache memory > 1GB');
}

main().catch(console.error);
