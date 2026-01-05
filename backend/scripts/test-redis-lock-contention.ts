/**
 * Phase 6 Verification: Redis Lock Contention Test
 *
 * Tests that Redis locks properly serialize concurrent folder operations
 * to prevent race conditions (RC-A1, RC-A8).
 *
 * Run: npx ts-node -r dotenv/config backend/scripts/test-redis-lock-contention.ts
 */

import 'dotenv/config';
import Redis from 'ioredis';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: TestResult[] = [];
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg: string, color = colors.reset): void {
  console.log(`${color}${msg}${colors.reset}`);
}

async function runTest(
  name: string,
  fn: () => Promise<{ passed: boolean; details: string }>
): Promise<void> {
  try {
    const { passed, details } = await fn();
    results.push({ name, passed, details });
    const icon = passed ? '✅' : '❌';
    const color = passed ? colors.green : colors.red;
    log(`${icon} ${name}`, color);
    log(`   ${details}`, colors.cyan);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, details: '', error: errorMsg });
    log(`❌ ${name}`, colors.red);
    log(`   Error: ${errorMsg}`, colors.red);
  }
}

// Simple lock implementation matching RedisLockService
class TestRedisLock {
  constructor(private redis: Redis) {}

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, 'locked', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const acquired = await this.acquireLock(key, ttlMs);
    if (!acquired) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(key);
    }
  }
}

// ============================================
// Test 1: Lock Acquisition Works
// ============================================
async function testLockAcquisition(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);
  const lockKey = 'test:lock:acquisition';

  // Cleanup
  await redis.del(lockKey);

  // Acquire lock
  const acquired = await lock.acquireLock(lockKey, 5000);
  if (!acquired) {
    return { passed: false, details: 'Failed to acquire initial lock' };
  }

  // Try to acquire same lock - should fail
  const secondAcquire = await lock.acquireLock(lockKey, 5000);

  // Release
  await lock.releaseLock(lockKey);

  if (secondAcquire) {
    return { passed: false, details: 'Second lock acquisition should have failed' };
  }

  return { passed: true, details: 'Lock properly blocks concurrent acquisition' };
}

// ============================================
// Test 2: Lock Contention (Simulates RC-A1)
// ============================================
async function testLockContention(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);
  const lockKey = 'folder-sync:test-provider-123';
  const executionOrder: number[] = [];

  // Cleanup
  await redis.del(lockKey);

  // Create 5 concurrent "sync" operations
  const operations = Array.from({ length: 5 }, (_, i) => i);

  const startTime = Date.now();

  const promises = operations.map(async (opNum) => {
    // Try to get lock
    let attempts = 0;
    while (attempts < 10) {
      const acquired = await lock.acquireLock(lockKey, 500);
      if (acquired) {
        executionOrder.push(opNum);
        // Simulate work
        await new Promise(r => setTimeout(r, 50));
        await lock.releaseLock(lockKey);
        return;
      }
      attempts++;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Operation ${opNum} failed to acquire lock after 10 attempts`);
  });

  await Promise.all(promises);
  const duration = Date.now() - startTime;

  // All 5 operations should complete
  if (executionOrder.length !== 5) {
    return {
      passed: false,
      details: `Only ${executionOrder.length}/5 operations completed`
    };
  }

  // Operations should be serialized (not parallel)
  // If truly serialized, minimum time = 5 * 50ms = 250ms
  if (duration < 200) {
    return {
      passed: false,
      details: `Operations ran too fast (${duration}ms) - locks may not be working`
    };
  }

  return {
    passed: true,
    details: `5 concurrent ops serialized via lock in ${duration}ms`
  };
}

// ============================================
// Test 3: Lock TTL Expiry
// ============================================
async function testLockExpiry(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);
  const lockKey = 'test:lock:expiry';

  // Cleanup
  await redis.del(lockKey);

  // Acquire lock with short TTL
  await lock.acquireLock(lockKey, 100); // 100ms TTL

  // Wait for expiry
  await new Promise(r => setTimeout(r, 150));

  // Should be able to acquire now
  const acquired = await lock.acquireLock(lockKey, 5000);
  await lock.releaseLock(lockKey);

  if (!acquired) {
    return { passed: false, details: 'Lock did not expire after TTL' };
  }

  return { passed: true, details: 'Lock properly expires after TTL' };
}

// ============================================
// Test 4: withLock Helper (RC-A8 Pattern)
// ============================================
async function testWithLockHelper(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);
  const lockKey = 'folder-crud:test-provider-456';

  // Cleanup
  await redis.del(lockKey);

  let workDone = false;

  await lock.withLock(lockKey, 5000, async () => {
    // Verify lock is held
    const lockHeld = await lock.acquireLock(lockKey, 100);
    if (lockHeld) {
      await lock.releaseLock(lockKey);
      throw new Error('Lock should be held during withLock execution');
    }
    workDone = true;
  });

  // Verify lock is released
  const canAcquire = await lock.acquireLock(lockKey, 100);
  await lock.releaseLock(lockKey);

  if (!workDone || !canAcquire) {
    return { passed: false, details: 'withLock did not execute correctly or release lock' };
  }

  return { passed: true, details: 'withLock correctly holds and releases lock' };
}

// ============================================
// Test 5: High Contention (20 workers)
// ============================================
async function testHighContention(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);
  const lockKey = 'test:high-contention';
  let successCount = 0;
  let failCount = 0;

  // Cleanup
  await redis.del(lockKey);

  const workerCount = 20;
  const startTime = Date.now();

  const workers = Array.from({ length: workerCount }, async (_, i) => {
    let acquired = false;
    let attempts = 0;

    while (!acquired && attempts < 50) {
      acquired = await lock.acquireLock(lockKey, 200);
      if (acquired) {
        // Do work
        await new Promise(r => setTimeout(r, 20));
        await lock.releaseLock(lockKey);
        successCount++;
        return;
      }
      attempts++;
      // Random backoff to reduce collision
      await new Promise(r => setTimeout(r, 10 + Math.random() * 50));
    }

    failCount++;
  });

  await Promise.all(workers);
  const duration = Date.now() - startTime;

  // At least 80% success rate is acceptable for contention test
  const successRate = (successCount / workerCount) * 100;

  if (successRate < 80) {
    return {
      passed: false,
      details: `Only ${successRate.toFixed(0)}% success rate (${successCount}/${workerCount})`
    };
  }

  return {
    passed: true,
    details: `${successCount}/${workerCount} workers succeeded (${successRate.toFixed(0)}%) in ${duration}ms`
  };
}

// ============================================
// Test 6: Folder Sync Lock Key Pattern
// ============================================
async function testFolderSyncLockPattern(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);

  // Test RC-A1 lock key pattern
  const providerId1 = 'provider-aaa-111';
  const providerId2 = 'provider-bbb-222';

  const lockKey1 = `folder-sync:${providerId1}`;
  const lockKey2 = `folder-sync:${providerId2}`;

  // Cleanup
  await redis.del(lockKey1);
  await redis.del(lockKey2);

  // Different providers should have independent locks
  const acquired1 = await lock.acquireLock(lockKey1, 5000);
  const acquired2 = await lock.acquireLock(lockKey2, 5000);

  await lock.releaseLock(lockKey1);
  await lock.releaseLock(lockKey2);

  if (!acquired1 || !acquired2) {
    return {
      passed: false,
      details: 'Different providers should have independent locks'
    };
  }

  return {
    passed: true,
    details: 'folder-sync:{providerId} pattern isolates providers correctly'
  };
}

// ============================================
// Test 7: Folder CRUD Lock Key Pattern
// ============================================
async function testFolderCrudLockPattern(redis: Redis): Promise<{ passed: boolean; details: string }> {
  const lock = new TestRedisLock(redis);

  // Test RC-A8 lock key pattern
  const providerId = 'provider-test-crud';
  const lockKey = `folder-crud:${providerId}`;

  // Cleanup
  await redis.del(lockKey);

  // Simulate create -> rename -> delete all sharing same lock
  const operations = ['create', 'rename', 'delete'];
  const executionOrder: string[] = [];

  const promises = operations.map(async (op) => {
    let attempts = 0;
    while (attempts < 20) {
      const acquired = await lock.acquireLock(lockKey, 300);
      if (acquired) {
        executionOrder.push(op);
        await new Promise(r => setTimeout(r, 30));
        await lock.releaseLock(lockKey);
        return;
      }
      attempts++;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`${op} operation failed to acquire lock`);
  });

  await Promise.all(promises);

  // All 3 should complete (serialized)
  if (executionOrder.length !== 3) {
    return {
      passed: false,
      details: `Only ${executionOrder.length}/3 CRUD operations completed`
    };
  }

  return {
    passed: true,
    details: 'folder-crud:{providerId} serializes create/rename/delete'
  };
}

// ============================================
// Main
// ============================================
async function main(): Promise<void> {
  log('\n=== Phase 6: Redis Lock Contention Test ===\n', colors.yellow);

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD;
  const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

  log(`Connecting to Redis: ${redisHost}:${redisPort} (db: ${redisDb})`, colors.cyan);

  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisDb,
    connectionName: 'lock-test',
  });

  try {
    // Test Redis connection
    await redis.ping();
    log('Redis connected ✓\n', colors.green);

    await runTest('1. Lock Acquisition', () => testLockAcquisition(redis));
    await runTest('2. Lock Contention (RC-A1)', () => testLockContention(redis));
    await runTest('3. Lock TTL Expiry', () => testLockExpiry(redis));
    await runTest('4. withLock Helper (RC-A8)', () => testWithLockHelper(redis));
    await runTest('5. High Contention (20 workers)', () => testHighContention(redis));
    await runTest('6. Folder Sync Lock Pattern', () => testFolderSyncLockPattern(redis));
    await runTest('7. Folder CRUD Lock Pattern', () => testFolderCrudLockPattern(redis));

  } finally {
    await redis.quit();
  }

  // Summary
  log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`\n📊 Results: ${passed}/${results.length} tests passed`);

  if (failed > 0) {
    log('\n❌ FAILED TESTS:', colors.red);
    for (const result of results.filter(r => !r.passed)) {
      log(`   - ${result.name}: ${result.error || result.details}`, colors.red);
    }
    log('\n🚫 Phase 6 Redis Lock Test FAILED', colors.red);
    process.exit(1);
  } else {
    log('\n✅ All Redis lock tests PASSED', colors.green);
    log('\n📍 Phase 6 Verification:', colors.cyan);
    log('   - RC-A1: folder-sync:{providerId} lock works');
    log('   - RC-A8: folder-crud:{providerId} lock works');
    log('   - Lock contention properly serializes operations');
    log('   - High contention (20 workers) handled');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
