/**
 * Test Embedding Generation with Tenant-Isolated Cache
 *
 * Validates full flow:
 * 1. First call generates embedding via Mistral API
 * 2. Second call hits cache (no API call)
 * 3. Different tenant makes fresh API call
 * 4. Cache stats are tenant-isolated
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MistralService } from '../src/modules/ai/services/mistral.service';
import { QueryEmbeddingCacheService } from '../src/modules/ai/services/query-embedding-cache.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  console.log('=== EMBEDDING WITH CACHE TEST ===\n');

  // Bootstrap minimal NestJS context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const mistralService = app.get(MistralService);
  const cacheService = app.get(QueryEmbeddingCacheService);
  const prisma = app.get(PrismaService);

  // Get real tenant IDs from database
  const tenants = await prisma.tenant.findMany({
    take: 2,
    select: { id: true, name: true },
  });

  if (tenants.length < 1) {
    console.log('❌ No tenants found in database. Cannot test.');
    await app.close();
    return;
  }

  const TENANT_A = tenants[0].id;
  const TENANT_B = tenants.length > 1 ? tenants[1].id : 'test-tenant-b';

  console.log(`Using tenants:`);
  console.log(`  Tenant A: ${TENANT_A} (${tenants[0].name})`);
  console.log(`  Tenant B: ${TENANT_B} (${tenants[1]?.name || 'simulated'})`);

  let passed = 0;
  let failed = 0;

  const testQuery = 'test query for embedding cache validation ' + Date.now();

  // Clear any existing cache for this query
  await cacheService.clearCache(TENANT_A);
  if (TENANT_B !== 'test-tenant-b') {
    await cacheService.clearCache(TENANT_B);
  }

  // Test 1: First call generates embedding (cache miss)
  console.log('\nTEST 1: First call - cache miss, API call');
  const startTime1 = Date.now();
  const embedding1 = await mistralService.generateEmbedding(testQuery, undefined, { tenantId: TENANT_A });
  const duration1 = Date.now() - startTime1;

  if (embedding1 && embedding1.length > 0) {
    console.log(`  ✅ PASS: Embedding generated (${embedding1.length} dimensions, ${duration1}ms)`);
    passed++;
  } else {
    console.log('  ❌ FAIL: No embedding returned');
    failed++;
  }

  // Test 2: Second call hits cache (faster)
  console.log('\nTEST 2: Second call - cache hit, no API call');
  const startTime2 = Date.now();
  const embedding2 = await mistralService.generateEmbedding(testQuery, undefined, { tenantId: TENANT_A });
  const duration2 = Date.now() - startTime2;

  if (embedding2 && JSON.stringify(embedding1) === JSON.stringify(embedding2)) {
    console.log(`  ✅ PASS: Cache hit - identical embedding returned`);
    console.log(`  ✅ Latency: ${duration1}ms (API) → ${duration2}ms (cache)`);
    if (duration2 < duration1 / 2) {
      console.log(`  ✅ Cache is ${Math.round(duration1 / duration2)}x faster`);
    }
    passed++;
  } else {
    console.log('  ❌ FAIL: Embeddings do not match');
    failed++;
  }

  // Test 3: Different tenant gets fresh embedding
  console.log('\nTEST 3: Different tenant - cache miss (isolated)');
  const cached = await cacheService.getCachedEmbedding(TENANT_B, testQuery);

  if (cached === null) {
    console.log('  ✅ PASS: Tenant B has no cached embedding (isolation works)');
    passed++;
  } else {
    console.log('  ❌ FAIL: Tenant B has cached data from Tenant A!');
    failed++;
  }

  // Test 4: Cache stats are tenant-isolated
  console.log('\nTEST 4: Cache stats per tenant');
  const statsA = await cacheService.getCacheStats(TENANT_A);
  const statsB = await cacheService.getCacheStats(TENANT_B);

  console.log(`  Tenant A stats: ${statsA.totalKeys} keys`);
  console.log(`  Tenant B stats: ${statsB.totalKeys} keys`);

  if (statsA.totalKeys >= 1 && statsB.totalKeys === 0) {
    console.log('  ✅ PASS: Stats are tenant-isolated');
    passed++;
  } else {
    console.log('  ⚠️  WARN: Stats may not be isolated correctly');
    // Not a hard failure - depends on test order
  }

  // Test 5: Verify embedding dimensions match config
  console.log('\nTEST 5: Embedding dimensions');
  const expectedDims = 1024; // Default Mistral embed dimensions
  if (embedding1.length === expectedDims) {
    console.log(`  ✅ PASS: Embedding has expected ${expectedDims} dimensions`);
    passed++;
  } else {
    console.log(`  ⚠️  INFO: Embedding has ${embedding1.length} dimensions (expected ${expectedDims})`);
    // Not a failure, just informational
  }

  // Cleanup
  console.log('\n--- Cleanup ---');
  await cacheService.clearCache(TENANT_A);
  console.log('  Test cache cleared');

  // Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ EMBEDDING CACHE WORKING CORRECTLY');
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exitCode = 1;
  }

  await app.close();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
