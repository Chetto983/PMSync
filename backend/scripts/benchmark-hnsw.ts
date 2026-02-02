/**
 * HNSW Index Performance Benchmark
 *
 * Validates HNSW index exists and measures similarity search latency.
 * Exit codes:
 *   0 - Success (index exists, p99 < 50ms or no embeddings to test)
 *   1 - Failure (index missing or p99 >= 50ms)
 *
 * Usage:
 *   npx ts-node backend/scripts/benchmark-hnsw.ts
 *
 * @author PERF-01 Phase 01
 */

/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Constants
const P99_THRESHOLD_MS = 50;
const SEARCH_ITERATIONS = 10;
const VECTOR_DIMENSIONS = 1024; // Mistral-embed dimensions

// Create standalone Prisma client (not NestJS DI)
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

// Generate a random 1024-dimension vector for testing
function generateRandomVector(): number[] {
  const vector: number[] = [];
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    vector.push(Math.random() * 2 - 1); // Random value between -1 and 1
  }
  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map((val) => val / magnitude);
}

// Calculate percentiles from sorted array
function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

interface BenchmarkResult {
  indexExists: boolean;
  embeddingCount: number;
  latencies?: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  };
  tenantId?: string;
  passed: boolean;
  message: string;
}

async function runBenchmark(): Promise<BenchmarkResult> {
  const prisma = createPrismaClient();

  try {
    // Step 1: Check if HNSW index exists
    console.log('\n[1/4] Checking HNSW index...');
    const indexResult = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'embeddings_vector_hnsw_idx'`
    );

    const indexExists = indexResult.length > 0;
    console.log(`  HNSW index: ${indexExists ? 'EXISTS' : 'MISSING'}`);

    if (!indexExists) {
      return {
        indexExists: false,
        embeddingCount: 0,
        passed: false,
        message: 'HNSW index does not exist. Run migration 20250106_hnsw_vector_index.',
      };
    }

    // Step 2: Count embeddings
    console.log('\n[2/4] Counting embeddings...');
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM embeddings WHERE vector IS NOT NULL`
    );
    const embeddingCount = Number(countResult[0]?.count ?? 0);
    console.log(`  Total embeddings with vectors: ${embeddingCount.toLocaleString()}`);

    if (embeddingCount === 0) {
      return {
        indexExists: true,
        embeddingCount: 0,
        passed: true,
        message: 'HNSW index exists. No embeddings to benchmark (empty table).',
      };
    }

    // Step 3: Get a sample tenant for testing
    console.log('\n[3/4] Finding sample tenant...');
    const tenantResult = await prisma.$queryRawUnsafe<Array<{ tenantId: string; cnt: bigint }>>(
      `SELECT "tenantId", COUNT(*) as cnt FROM embeddings
       WHERE vector IS NOT NULL
       GROUP BY "tenantId"
       ORDER BY cnt DESC
       LIMIT 1`
    );

    if (tenantResult.length === 0) {
      return {
        indexExists: true,
        embeddingCount,
        passed: true,
        message: 'HNSW index exists. No tenant data available for latency benchmark.',
      };
    }

    const tenantId = tenantResult[0].tenantId;
    const tenantEmbeddingCount = Number(tenantResult[0].cnt);
    console.log(`  Using tenant: ${tenantId} (${tenantEmbeddingCount.toLocaleString()} embeddings)`);

    // Step 4: Run similarity searches and measure latency
    console.log(`\n[4/4] Running ${SEARCH_ITERATIONS} similarity searches...`);
    const latencies: number[] = [];

    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const queryVector = generateRandomVector();
      const vectorLiteral = `'[${queryVector.join(',')}]'::vector`;

      const startTime = performance.now();

      // Set ef_search for production-quality recall
      await prisma.$executeRawUnsafe(`SET hnsw.ef_search = 100`);

      // Run similarity search
      await prisma.$queryRawUnsafe(
        `SELECT id, 1 - (vector <=> ${vectorLiteral}) as similarity
         FROM embeddings
         WHERE "tenantId" = $1
         ORDER BY vector <=> ${vectorLiteral}
         LIMIT 10`,
        tenantId
      );

      const endTime = performance.now();
      const latencyMs = endTime - startTime;
      latencies.push(latencyMs);

      process.stdout.write(`  Query ${i + 1}/${SEARCH_ITERATIONS}: ${latencyMs.toFixed(2)}ms\n`);
    }

    // Calculate statistics
    const sorted = [...latencies].sort((a, b) => a - b);
    const stats = {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    };

    const passed = stats.p99 < P99_THRESHOLD_MS;

    return {
      indexExists: true,
      embeddingCount,
      latencies: stats,
      tenantId,
      passed,
      message: passed
        ? `HNSW index performing well. p99=${stats.p99.toFixed(2)}ms < ${P99_THRESHOLD_MS}ms threshold.`
        : `HNSW search too slow. p99=${stats.p99.toFixed(2)}ms >= ${P99_THRESHOLD_MS}ms threshold.`,
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main(): Promise<void> {
  console.log('========================================');
  console.log('    HNSW Index Performance Benchmark');
  console.log('========================================');
  console.log(`  Threshold: p99 < ${P99_THRESHOLD_MS}ms`);
  console.log(`  Iterations: ${SEARCH_ITERATIONS}`);
  console.log(`  Vector dims: ${VECTOR_DIMENSIONS}`);

  try {
    const result = await runBenchmark();

    console.log('\n========================================');
    console.log('              RESULTS');
    console.log('========================================');
    console.log(`  HNSW Index:     ${result.indexExists ? 'EXISTS' : 'MISSING'}`);
    console.log(`  Embeddings:     ${result.embeddingCount.toLocaleString()}`);

    if (result.latencies) {
      console.log('\n  Latency Statistics:');
      console.log(`    Min:  ${result.latencies.min.toFixed(2)}ms`);
      console.log(`    Avg:  ${result.latencies.avg.toFixed(2)}ms`);
      console.log(`    P50:  ${result.latencies.p50.toFixed(2)}ms`);
      console.log(`    P95:  ${result.latencies.p95.toFixed(2)}ms`);
      console.log(`    P99:  ${result.latencies.p99.toFixed(2)}ms`);
      console.log(`    Max:  ${result.latencies.max.toFixed(2)}ms`);
    }

    console.log('\n========================================');
    console.log(`  Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  ${result.message}`);
    console.log('========================================\n');

    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error('\n========================================');
    console.error('              ERROR');
    console.error('========================================');
    console.error(`  ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('========================================\n');
    process.exit(1);
  }
}

main();
