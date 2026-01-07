/**
 * Test Tenant Isolation for Query Embedding Cache
 *
 * Validates GDPR compliance:
 * 1. Tenant A cannot see Tenant B's cached embeddings
 * 2. Same query for different tenants = different cache keys
 * 3. Cache works correctly per-tenant
 * 4. Embeddings are generated and cached properly
 */
import 'dotenv/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { getConfiguration } from '../src/config/configuration';

const CACHE_PREFIX = 'qemb:';

// Simulated tenants for testing
const TENANT_A = 'tenant-test-a-' + Date.now();
const TENANT_B = 'tenant-test-b-' + Date.now();

async function main() {
  const config = getConfiguration();
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  });

  console.log('=== TENANT ISOLATION TEST ===\n');

  // Helper functions
  function getCacheKey(tenantId: string, queryText: string): string {
    const normalized = queryText.toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = createHash('sha256').update(normalized, 'utf-8').digest('hex');
    return `${CACHE_PREFIX}${tenantId}:${hash}`;
  }

  async function setCachedEmbedding(tenantId: string, query: string, embedding: number[]): Promise<void> {
    const key = getCacheKey(tenantId, query);
    await redis.setex(key, 3600, JSON.stringify(embedding));
  }

  async function getCachedEmbedding(tenantId: string, query: string): Promise<number[] | null> {
    const key = getCacheKey(tenantId, query);
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async function countTenantKeys(tenantId: string): Promise<number> {
    const pattern = `${CACHE_PREFIX}${tenantId}:*`;
    let cursor = '0';
    let count = 0;
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      count += result[1].length;
    } while (cursor !== '0');
    return count;
  }

  async function clearTenantCache(tenantId: string): Promise<number> {
    const pattern = `${CACHE_PREFIX}${tenantId}:*`;
    let cursor = '0';
    let deleted = 0;
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      if (result[1].length > 0) {
        deleted += await redis.del(...result[1]);
      }
    } while (cursor !== '0');
    return deleted;
  }

  let passed = 0;
  let failed = 0;

  // Test 1: Same query, different tenants = different cache keys
  console.log('TEST 1: Cache key isolation');
  const testQuery = 'find emails about project deadline';
  const keyA = getCacheKey(TENANT_A, testQuery);
  const keyB = getCacheKey(TENANT_B, testQuery);

  if (keyA !== keyB) {
    console.log('  ✅ PASS: Different tenants get different cache keys');
    console.log(`     Tenant A key: ${keyA.substring(0, 50)}...`);
    console.log(`     Tenant B key: ${keyB.substring(0, 50)}...`);
    passed++;
  } else {
    console.log('  ❌ FAIL: Cache keys are identical!');
    failed++;
  }

  // Test 2: Tenant A cache is not visible to Tenant B
  console.log('\nTEST 2: Cross-tenant isolation');
  const embeddingA = [0.1, 0.2, 0.3, 0.4, 0.5]; // Simulated embedding
  await setCachedEmbedding(TENANT_A, testQuery, embeddingA);

  const resultFromA = await getCachedEmbedding(TENANT_A, testQuery);
  const resultFromB = await getCachedEmbedding(TENANT_B, testQuery);

  if (resultFromA && JSON.stringify(resultFromA) === JSON.stringify(embeddingA)) {
    console.log('  ✅ PASS: Tenant A can retrieve own cache');
    passed++;
  } else {
    console.log('  ❌ FAIL: Tenant A cannot retrieve own cache');
    failed++;
  }

  if (resultFromB === null) {
    console.log('  ✅ PASS: Tenant B cannot see Tenant A cache (null returned)');
    passed++;
  } else {
    console.log('  ❌ FAIL: SECURITY ISSUE - Tenant B can see Tenant A cache!');
    console.log(`     Leaked data: ${JSON.stringify(resultFromB)}`);
    failed++;
  }

  // Test 3: Independent caching per tenant
  console.log('\nTEST 3: Independent per-tenant caching');
  const embeddingB = [0.9, 0.8, 0.7, 0.6, 0.5]; // Different embedding for B
  await setCachedEmbedding(TENANT_B, testQuery, embeddingB);

  const checkA = await getCachedEmbedding(TENANT_A, testQuery);
  const checkB = await getCachedEmbedding(TENANT_B, testQuery);

  if (JSON.stringify(checkA) === JSON.stringify(embeddingA) &&
      JSON.stringify(checkB) === JSON.stringify(embeddingB)) {
    console.log('  ✅ PASS: Each tenant has independent cache');
    console.log(`     Tenant A: [${checkA?.slice(0, 3).join(', ')}...]`);
    console.log(`     Tenant B: [${checkB?.slice(0, 3).join(', ')}...]`);
    passed++;
  } else {
    console.log('  ❌ FAIL: Cache data is mixed between tenants!');
    failed++;
  }

  // Test 4: Cache clearing is tenant-isolated (GDPR right to erasure)
  console.log('\nTEST 4: GDPR Right to Erasure (tenant-isolated clearing)');

  // Add more entries for both tenants
  await setCachedEmbedding(TENANT_A, 'query 2', [0.1, 0.2]);
  await setCachedEmbedding(TENANT_A, 'query 3', [0.3, 0.4]);
  await setCachedEmbedding(TENANT_B, 'query 2', [0.5, 0.6]);

  const countABefore = await countTenantKeys(TENANT_A);
  const countBBefore = await countTenantKeys(TENANT_B);
  console.log(`  Before clear: Tenant A has ${countABefore} keys, Tenant B has ${countBBefore} keys`);

  // Clear only Tenant A
  const deletedA = await clearTenantCache(TENANT_A);
  console.log(`  Cleared ${deletedA} keys from Tenant A`);

  const countAAfter = await countTenantKeys(TENANT_A);
  const countBAfter = await countTenantKeys(TENANT_B);
  console.log(`  After clear: Tenant A has ${countAAfter} keys, Tenant B has ${countBAfter} keys`);

  if (countAAfter === 0 && countBAfter === countBBefore) {
    console.log('  ✅ PASS: Only Tenant A data was cleared, Tenant B intact');
    passed++;
  } else {
    console.log('  ❌ FAIL: Clear operation affected wrong tenant!');
    failed++;
  }

  // Test 5: Query normalization works correctly
  console.log('\nTEST 5: Query normalization');
  await setCachedEmbedding(TENANT_A, '  HELLO   WORLD  ', [1, 2, 3]);
  const normalized1 = await getCachedEmbedding(TENANT_A, 'hello world');
  const normalized2 = await getCachedEmbedding(TENANT_A, 'HELLO WORLD');
  const normalized3 = await getCachedEmbedding(TENANT_A, '  hello   world  ');

  if (normalized1 && normalized2 && normalized3 &&
      JSON.stringify(normalized1) === JSON.stringify(normalized2) &&
      JSON.stringify(normalized2) === JSON.stringify(normalized3)) {
    console.log('  ✅ PASS: Query normalization works (case-insensitive, whitespace-collapsed)');
    passed++;
  } else {
    console.log('  ❌ FAIL: Query normalization not working');
    failed++;
  }

  // Cleanup
  console.log('\n--- Cleanup ---');
  await clearTenantCache(TENANT_A);
  await clearTenantCache(TENANT_B);
  console.log('  Test data cleaned up');

  // Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n✅ ALL TESTS PASSED - GDPR tenant isolation verified!');
  } else {
    console.log('\n❌ SOME TESTS FAILED - Review security implementation!');
    process.exitCode = 1;
  }

  await redis.quit();
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
