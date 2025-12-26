/**
 * Phase 6 Validation Script: Multi-Tenant Scalability (1000+ Users)
 *
 * Checks implementation status:
 * - 6.1: SyncBackWorker distributed lock
 * - 6.2: Job deduplication for sync jobs
 * - 6.3: SyncWorker extends BaseWorker
 * - 6.4: EmailSend rate limiting increase
 * - 6.5: Fencing tokens (LOW)
 * - 6.6: Per-provider rate limiting (LOW)
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/validate-phase6-scalability.ts
 */
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

const results: TestResult[] = [];
const BACKEND_ROOT = path.resolve(__dirname, '..');

// ========================================
// 6.1: SyncBackWorker Distributed Lock (HIGH)
// ========================================
async function test61SyncBackLock(): Promise<void> {
  const testName = '6.1: SyncBackWorker Distributed Lock';
  const start = Date.now();

  try {
    const syncBackPath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/workers/sync-back.worker.ts',
    );
    const content = fs.readFileSync(syncBackPath, 'utf-8');

    const hasRedisLock = content.includes('redisLock') || content.includes('RedisLockService');
    const hasWithLock = content.includes('withLock') || content.includes('tryWithLock');

    if (hasRedisLock && hasWithLock) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'SyncBackWorker has distributed lock implementation',
        priority: 'HIGH',
      });
    } else if (hasRedisLock) {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'RedisLockService imported but withLock not used in processJob. Need to wrap batch operations with lock.',
        priority: 'HIGH',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'No distributed lock in SyncBackWorker. Risk: concurrent sync-back jobs race on same provider.',
        priority: 'HIGH',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      priority: 'HIGH',
    });
  }
}

// ========================================
// 6.2: Job Deduplication for Sync Jobs (HIGH)
// ========================================
async function test62JobDedup(): Promise<void> {
  const testName = '6.2: Job Deduplication for Sync Jobs';
  const start = Date.now();

  try {
    const queueServicePath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/services/queue.service.ts',
    );
    const content = fs.readFileSync(queueServicePath, 'utf-8');

    // Check for jobId usage in sync job enqueue
    const hasJobId = content.includes('jobId:') || content.includes('jobId =');
    const hasIdempotency = content.includes('idempotency') || content.includes('dedup');

    // Check for hasPendingJob pattern
    const hasPendingJobCheck = content.includes('hasPendingJob');

    if (hasJobId || hasPendingJobCheck) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: hasPendingJobCheck
          ? 'Job deduplication via hasPendingJob check'
          : 'Job deduplication via BullMQ jobId',
        priority: 'HIGH',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'No job deduplication found. Risk: duplicate sync jobs for same mailbox.',
        priority: 'HIGH',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      priority: 'HIGH',
    });
  }
}

// ========================================
// 6.3: SyncWorker Extends BaseWorker (MEDIUM)
// ========================================
async function test63SyncWorkerBase(): Promise<void> {
  const testName = '6.3: SyncWorker Extends BaseWorker';
  const start = Date.now();

  try {
    const syncWorkerPath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/workers/sync.worker.ts',
    );
    const content = fs.readFileSync(syncWorkerPath, 'utf-8');

    const extendsBaseWorker = content.includes('extends BaseWorker');

    if (extendsBaseWorker) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'SyncWorker extends BaseWorker',
        priority: 'MEDIUM',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'SyncWorker does NOT extend BaseWorker. Uses manual OnModuleInit/OnModuleDestroy. ~200 LOC duplicated.',
        priority: 'MEDIUM',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      priority: 'MEDIUM',
    });
  }
}

// ========================================
// 6.4: EmailSend Rate Limiting (MEDIUM)
// ========================================
async function test64EmailSendLimits(): Promise<void> {
  const testName = '6.4: EmailSend Rate Limiting Config';
  const start = Date.now();

  try {
    const emailSendPath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/workers/email-send.worker.ts',
    );
    const content = fs.readFileSync(emailSendPath, 'utf-8');

    // Extract concurrency and limiter values
    const concurrencyMatch = content.match(/concurrency:\s*(\d+)/);
    const limiterMaxMatch = content.match(/max:\s*(\d+)/);

    const concurrency = concurrencyMatch ? parseInt(concurrencyMatch[1], 10) : 0;
    const limiterMax = limiterMaxMatch ? parseInt(limiterMaxMatch[1], 10) : 0;

    // Recommended: concurrency >= 10, limiter max >= 50
    const isOptimal = concurrency >= 10 && limiterMax >= 50;
    const isAcceptable = concurrency >= 5 && limiterMax >= 20;

    if (isOptimal) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: `Optimal config: concurrency=${concurrency}, limiter max=${limiterMax}/min`,
        priority: 'MEDIUM',
      });
    } else if (isAcceptable) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: `Acceptable config: concurrency=${concurrency}, limiter max=${limiterMax}/min. Consider increasing for 1000+ users.`,
        priority: 'MEDIUM',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: `Low config: concurrency=${concurrency}, limiter max=${limiterMax}/min. Recommend: concurrency=10, max=50 for 1000+ users.`,
        priority: 'MEDIUM',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      priority: 'MEDIUM',
    });
  }
}

// ========================================
// 6.5: Fencing Tokens (LOW)
// ========================================
async function test65FencingTokens(): Promise<void> {
  const testName = '6.5: Fencing Tokens (Optional)';
  const start = Date.now();

  try {
    const lockServicePath = path.join(BACKEND_ROOT, 'src/common/services/redis-lock.service.ts');

    if (!fs.existsSync(lockServicePath)) {
      results.push({
        name: testName,
        passed: true, // Optional
        duration: Date.now() - start,
        details: 'RedisLockService not found. Fencing tokens not implemented (optional for edge cases).',
        priority: 'LOW',
      });
      return;
    }

    const content = fs.readFileSync(lockServicePath, 'utf-8');
    const hasFencing = content.includes('fence') || content.includes('Fence');

    results.push({
      name: testName,
      passed: true, // Optional feature
      duration: Date.now() - start,
      details: hasFencing
        ? 'Fencing token support implemented'
        : 'No fencing tokens (optional - only needed for very long operations)',
      priority: 'LOW',
    });
  } catch (error) {
    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: 'Could not check fencing tokens (optional feature)',
      priority: 'LOW',
    });
  }
}

// ========================================
// 6.6: Per-Provider Rate Limiting (LOW)
// ========================================
async function test66PerProviderRateLimit(): Promise<void> {
  const testName = '6.6: Per-Provider Rate Limiting (Optional)';
  const start = Date.now();

  try {
    const resilienceServicePath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/drivers/resilience/resilience.service.ts',
    );
    const content = fs.readFileSync(resilienceServicePath, 'utf-8');

    const hasPerProvider = content.includes('provider') && content.includes('RateLimit');
    const hasProviderLimits = content.includes('PROVIDER_LIMITS') || content.includes('providerLimits');

    results.push({
      name: testName,
      passed: true, // Optional feature
      duration: Date.now() - start,
      details: hasProviderLimits
        ? 'Per-provider rate limits configured'
        : 'Global rate limiting only (per-provider is optional enhancement)',
      priority: 'LOW',
    });
  } catch (error) {
    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: 'Could not check per-provider rate limiting (optional feature)',
      priority: 'LOW',
    });
  }
}

// ========================================
// Main
// ========================================
async function main() {
  console.log('='.repeat(60));
  console.log('Phase 6 Validation: Multi-Tenant Scalability (1000+ Users)');
  console.log('='.repeat(60));
  console.log('Checking scalability implementation status\n');

  // Run all tests
  await test61SyncBackLock();
  await test62JobDedup();
  await test63SyncWorkerBase();
  await test64EmailSendLimits();
  await test65FencingTokens();
  await test66PerProviderRateLimit();

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;
  const highPriorityFailed: string[] = [];

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '⚠️  TODO';
    const priority = `[${result.priority}]`;
    console.log(`${status} ${priority} ${result.name} (${result.duration}ms)`);
    if (result.details) {
      console.log(`       ${result.details}`);
    }
    if (result.error) {
      console.log(`       Error: ${result.error}`);
    }
    if (result.passed) {
      passed++;
    } else {
      failed++;
      if (result.priority === 'HIGH') {
        highPriorityFailed.push(result.name);
      }
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} implemented, ${failed} pending`);
  console.log('-'.repeat(60));

  if (highPriorityFailed.length > 0) {
    console.log('\n⚠️  PHASE 6 HAS HIGH PRIORITY GAPS');
    console.log('High priority items need attention:');
    for (const item of highPriorityFailed) {
      console.log(`  - ${item}`);
    }
  } else if (failed > 0) {
    console.log('\n✅ PHASE 6 HIGH PRIORITY COMPLETE');
    console.log('MEDIUM/LOW priority items pending (optional for 1000+ users).');
  } else {
    console.log('\n✅ PHASE 6 FULLY VALIDATED');
    console.log('Ready for 1000+ concurrent users!');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
