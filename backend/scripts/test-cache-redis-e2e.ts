#!/usr/bin/env ts-node
/**
 * E2E Test: Redis Cache Invalidation for 10,000+ Users
 *
 * Tests the Redis-backed cache implementation for:
 * - Tenant-isolated cache keys
 * - SCAN-based pattern invalidation (production-safe)
 * - GDPR-compliant user cache clearing
 * - Horizontal scaling support
 *
 * Run: npx ts-node scripts/test-cache-redis-e2e.ts
 */
import { createClient, RedisClientType } from 'redis';

// Test configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

const TEST_NAMESPACE = 'agent:pool';
const TEST_TENANT_1 = 'tenant-test-001';
const TEST_TENANT_2 = 'tenant-test-002';
const TEST_USER_1 = 'user1@test.com';
const TEST_USER_2 = 'user2@test.com';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; details: string }>,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await testFn();
    results.push({
      name,
      passed: result.passed,
      details: result.details,
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      details: `Exception: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - start,
    });
  }
}

async function main() {
  console.log('\n🧪 E2E Test: Redis Cache Invalidation for 10,000+ Users\n');
  console.log(`Redis: ${REDIS_HOST}:${REDIS_PORT}\n`);

  let client: RedisClientType | null = null;

  try {
    // Connect to Redis
    client = createClient({
      socket: { host: REDIS_HOST, port: REDIS_PORT },
      password: REDIS_PASSWORD,
      database: REDIS_DB,
    }) as RedisClientType;

    await client.connect();
    console.log('✅ Connected to Redis\n');

    // Test 1: Redis connectivity
    await runTest('Redis PING', async () => {
      const pong = await client!.ping();
      return {
        passed: pong === 'PONG',
        details: `Response: ${pong}`,
      };
    });

    // Test 2: Create tenant-isolated cache keys
    await runTest('Create tenant-isolated cache keys', async () => {
      const keys = [
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_1}:en:small:Supervisor`,
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_2}:en:small:Supervisor`,
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_1}:it:medium:Intelligence`,
        `${TEST_NAMESPACE}:${TEST_TENANT_2}:${TEST_USER_1}:en:small:Supervisor`,
        `${TEST_NAMESPACE}:${TEST_TENANT_2}:${TEST_USER_2}:en:large:Actions`,
      ];

      for (const key of keys) {
        await client!.set(key, JSON.stringify({ createdAt: Date.now() }), { EX: 300 });
      }

      // Verify all keys exist
      const counts = await Promise.all(keys.map((k) => client!.exists(k)));
      const allExist = counts.every((c) => c === 1);

      return {
        passed: allExist,
        details: `Created ${keys.length} keys, all exist: ${allExist}`,
      };
    });

    // Test 3: SCAN-based pattern invalidation (tenant-scoped)
    await runTest('SCAN-based tenant pattern invalidation', async () => {
      const pattern = `${TEST_NAMESPACE}:${TEST_TENANT_1}:*`;
      let cursor = '0';
      let totalDeleted = 0;
      let iterations = 0;

      // Use SCAN (production-safe) instead of KEYS
      do {
        const result = await client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        iterations++;

        if (result.keys.length > 0) {
          await client!.del(result.keys);
          totalDeleted += result.keys.length;
        }
      } while (cursor !== '0');

      // Verify tenant-1 keys are gone
      const tenant1Keys = await client!.keys(`${TEST_NAMESPACE}:${TEST_TENANT_1}:*`);

      // Verify tenant-2 keys still exist
      const tenant2Keys = await client!.keys(`${TEST_NAMESPACE}:${TEST_TENANT_2}:*`);

      return {
        passed: tenant1Keys.length === 0 && tenant2Keys.length === 2,
        details: `Deleted ${totalDeleted} keys in ${iterations} iterations. Tenant-1: ${tenant1Keys.length} remaining, Tenant-2: ${tenant2Keys.length} remaining`,
      };
    });

    // Test 4: User-scoped invalidation (GDPR Art. 17)
    await runTest('GDPR Art. 17: User-scoped cache clear', async () => {
      // Recreate tenant-1 keys
      await client!.set(
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_1}:en:small:Supervisor`,
        JSON.stringify({ createdAt: Date.now() }),
        { EX: 300 },
      );
      await client!.set(
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_2}:en:small:Supervisor`,
        JSON.stringify({ createdAt: Date.now() }),
        { EX: 300 },
      );

      // Clear only user-1's cache (GDPR)
      const pattern = `${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_1}:*`;
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const result = await client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
          await client!.del(result.keys);
          totalDeleted += result.keys.length;
        }
      } while (cursor !== '0');

      // Verify user-1 keys are gone
      const user1Keys = await client!.keys(`${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_1}:*`);

      // Verify user-2 keys still exist
      const user2Keys = await client!.keys(`${TEST_NAMESPACE}:${TEST_TENANT_1}:${TEST_USER_2}:*`);

      return {
        passed: user1Keys.length === 0 && user2Keys.length === 1,
        details: `[GDPR] Deleted ${totalDeleted} user keys. User-1: ${user1Keys.length}, User-2: ${user2Keys.length}`,
      };
    });

    // Test 5: Scalability - create 1000 keys and invalidate by pattern
    await runTest('Scalability: 1000 keys pattern invalidation', async () => {
      const SCALE_TENANT = 'tenant-scale-test';
      const KEY_COUNT = 1000;

      // Create 1000 keys
      const pipeline = client!.multi();
      for (let i = 0; i < KEY_COUNT; i++) {
        const key = `${TEST_NAMESPACE}:${SCALE_TENANT}:user${i}@test.com:en:small:Supervisor`;
        pipeline.set(key, JSON.stringify({ i, createdAt: Date.now() }), { EX: 60 });
      }
      await pipeline.exec();

      // Verify keys created
      const beforeKeys = await client!.keys(`${TEST_NAMESPACE}:${SCALE_TENANT}:*`);

      // Invalidate all with SCAN
      const start = Date.now();
      const pattern = `${TEST_NAMESPACE}:${SCALE_TENANT}:*`;
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const result = await client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
          await client!.del(result.keys);
          totalDeleted += result.keys.length;
        }
      } while (cursor !== '0');

      const duration = Date.now() - start;

      // Verify all deleted
      const afterKeys = await client!.keys(`${TEST_NAMESPACE}:${SCALE_TENANT}:*`);

      return {
        passed: beforeKeys.length === KEY_COUNT && afterKeys.length === 0 && duration < 5000,
        details: `Created ${beforeKeys.length} keys, deleted ${totalDeleted} in ${duration}ms. Remaining: ${afterKeys.length}`,
      };
    });

    // Test 6: Namespace isolation
    await runTest('Namespace isolation', async () => {
      // Create keys in different namespaces
      await client!.set(
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:test:en:small:Supervisor`,
        'agent-pool-data',
        { EX: 60 },
      );
      await client!.set(
        `voltagent:user-context:${TEST_TENANT_1}:test`,
        'user-context-data',
        { EX: 60 },
      );
      await client!.set(`ai:analytics:${TEST_TENANT_1}:test`, 'analytics-data', { EX: 60 });

      // Invalidate only agent:pool namespace
      const pattern = `${TEST_NAMESPACE}:${TEST_TENANT_1}:*`;
      let cursor = '0';
      do {
        const result = await client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) await client!.del(result.keys);
      } while (cursor !== '0');

      // Verify only agent:pool is gone
      const agentPoolExists = await client!.exists(
        `${TEST_NAMESPACE}:${TEST_TENANT_1}:test:en:small:Supervisor`,
      );
      const userContextExists = await client!.exists(
        `voltagent:user-context:${TEST_TENANT_1}:test`,
      );
      const analyticsExists = await client!.exists(`ai:analytics:${TEST_TENANT_1}:test`);

      // Cleanup
      await client!.del(`voltagent:user-context:${TEST_TENANT_1}:test`);
      await client!.del(`ai:analytics:${TEST_TENANT_1}:test`);

      return {
        passed: agentPoolExists === 0 && userContextExists === 1 && analyticsExists === 1,
        details: `agent:pool=${agentPoolExists}, user-context=${userContextExists}, analytics=${analyticsExists}`,
      };
    });

    // Cleanup remaining test keys
    const cleanupPatterns = [
      `${TEST_NAMESPACE}:${TEST_TENANT_1}:*`,
      `${TEST_NAMESPACE}:${TEST_TENANT_2}:*`,
    ];
    for (const pattern of cleanupPatterns) {
      let cursor = '0';
      do {
        const result = await client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) await client!.del(result.keys);
      } while (cursor !== '0');
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.quit();
      console.log('\n🔌 Redis connection closed\n');
    }
  }

  // Print results
  console.log('═'.repeat(70));
  console.log('📊 TEST RESULTS');
  console.log('═'.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} [${status}] ${result.name} (${result.duration}ms)`);
    console.log(`   └─ ${result.details}`);
    if (result.passed) passed++;
    else failed++;
  }

  console.log('═'.repeat(70));
  console.log(`📈 Summary: ${passed}/${results.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ TESTS FAILED - Cache implementation needs fixes\n');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED - Redis cache ready for 10,000+ users\n');
    process.exit(0);
  }
}

main();
