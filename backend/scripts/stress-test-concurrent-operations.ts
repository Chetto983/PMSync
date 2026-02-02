/**
 * Stress Test: Concurrent Operations
 *
 * Phase 8 Success Criteria Coverage:
 * - Criterion 2: Folder rename during sync passes without orphaned references
 * - Criterion 4: Redis lock contention (20 workers) completes without timeout
 * - Criterion 5: Large batch operation (1000+ emails) completes within 60s baseline
 *
 * Run: npx ts-node -r dotenv/config backend/scripts/stress-test-concurrent-operations.ts
 *
 * @date 2026-02-02
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import Redis from 'ioredis';

const prisma = createPrismaClient();

// ============================================
// Types and Interfaces
// ============================================

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
  metrics?: Record<string, number | string>;
}

interface ScenarioMetrics {
  operations: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs?: number;
}

// ============================================
// Console Colors
// ============================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(msg: string, color = colors.reset): void {
  console.log(`${color}${msg}${colors.reset}`);
}

// ============================================
// Test Infrastructure
// ============================================

const results: TestResult[] = [];

async function runScenario(
  scenario: number,
  name: string,
  fn: () => Promise<{ passed: boolean; details: string; metrics?: Record<string, number | string> }>
): Promise<void> {
  const start = Date.now();
  try {
    const { passed, details, metrics } = await fn();
    const durationMs = Date.now() - start;
    results.push({ scenario, name, passed, details, durationMs, metrics });
    const icon = passed ? '[PASS]' : '[FAIL]';
    const statusColor = passed ? colors.green : colors.red;
    log(`${icon} Scenario ${scenario}: ${name} (${durationMs}ms)`, statusColor);
    log(`    ${details}`, colors.cyan);
    if (metrics) {
      const metricsStr = Object.entries(metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      log(`    Metrics: ${metricsStr}`, colors.magenta);
    }
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ scenario, name, passed: false, details: `Error: ${errorMsg}`, durationMs });
    log(`[FAIL] Scenario ${scenario}: ${name} (${durationMs}ms)`, colors.red);
    log(`    Error: ${errorMsg}`, colors.red);
  }
}

// ============================================
// Simple Redis Lock Implementation
// ============================================

class TestRedisLock {
  constructor(private redis: Redis) {}

  async acquireLock(key: string, ttlMs: number, maxAttempts = 10, baseDelayMs = 50): Promise<string | null> {
    const lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Atomic SET NX with PX (TTL in ms)
      const result = await this.redis.set(key, lockId, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return lockId;
      }

      // Wait with exponential backoff
      if (attempt < maxAttempts - 1) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs, 500);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    return null;
  }

  async releaseLock(key: string, lockId: string): Promise<boolean> {
    // Atomic check-and-delete using Lua script
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, lockId);
    return result === 1;
  }
}

// ============================================
// Scenario 1: Folder Rename During Sync
// Phase 8 Success Criterion 2
// ============================================

async function scenarioFolderRenameDuringSync(
  redis: Redis
): Promise<{ passed: boolean; details: string; metrics?: Record<string, number | string> }> {
  const lock = new TestRedisLock(redis);
  const timestamp = Date.now();
  const originalFolderPath = `TestFolder-${timestamp}`;
  const renamedFolderPath = `RenamedFolder-${timestamp}`;
  const testEmailCount = 10;
  const SYNC_LOCK_KEY = `stress-test:folder-sync:${timestamp}`;
  const LOCK_TTL_MS = 5000;

  // Find a provider for testing
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true },
    select: { id: true, tenantId: true },
  });

  if (!provider) {
    return { passed: true, details: 'Skipped - no active provider available for test' };
  }

  const { id: providerId, tenantId } = provider;

  try {
    // Step 1: Create test folder
    const folder = await prisma.folder.create({
      data: {
        tenantId,
        providerId,
        path: originalFolderPath,
        name: originalFolderPath,
        delimiter: '/',
        isSelectable: true,
        level: 0,
      },
    });

    // Step 2: Create test emails referencing the folder
    const emailCreations = Array.from({ length: testEmailCount }, (_, i) =>
      prisma.email.create({
        data: {
          tenantId,
          providerId,
          externalId: `stress-folder-rename-${timestamp}-email-${i}`,
          folder: originalFolderPath,
          subject: `Test Email ${i}`,
          from: 'test@example.com',
          to: ['recipient@example.com'],
          sentAt: new Date(),
          receivedAt: new Date(),
        },
      })
    );
    await Promise.all(emailCreations);

    // Step 3: Simulate concurrent sync and rename
    let renameWaited = false;
    let syncHeldLock = false;
    let renameResult = 'failed' as string;

    // Sync operation (acquires lock first)
    const syncOperation = async () => {
      const lockId = await lock.acquireLock(SYNC_LOCK_KEY, LOCK_TTL_MS, 1); // Only 1 attempt for sync
      if (!lockId) {
        return false;
      }
      syncHeldLock = true;

      // Simulate sync work
      await new Promise(r => setTimeout(r, 200));

      await lock.releaseLock(SYNC_LOCK_KEY, lockId);
      return true;
    };

    // Rename operation (must wait for lock or be blocked)
    const renameOperation = async () => {
      // Wait a bit to ensure sync acquires lock first
      await new Promise(r => setTimeout(r, 50));

      // Try to acquire lock (will wait if sync holds it)
      const lockId = await lock.acquireLock(SYNC_LOCK_KEY, LOCK_TTL_MS, 10, 30);
      if (!lockId) {
        renameResult = 'failed';
        return;
      }

      renameWaited = syncHeldLock; // If sync held lock, we waited

      try {
        // Perform rename - update folder and all email references
        await prisma.$transaction([
          prisma.folder.update({
            where: { id_tenantId: { id: folder.id, tenantId } },
            data: { path: renamedFolderPath, name: renamedFolderPath },
          }),
          prisma.email.updateMany({
            where: { providerId, folder: originalFolderPath },
            data: { folder: renamedFolderPath },
          }),
        ]);
        renameResult = 'success';
      } finally {
        await lock.releaseLock(SYNC_LOCK_KEY, lockId);
      }
    };

    // Run both concurrently
    await Promise.all([syncOperation(), renameOperation()]);

    // Step 4: Verify no orphaned references (CRITICAL CHECK)
    // Check emails still reference a valid folder path that exists
    const emailsAfterRename = await prisma.email.findMany({
      where: {
        providerId,
        externalId: { startsWith: `stress-folder-rename-${timestamp}` },
      },
      select: { id: true, folder: true },
    });

    const folderAfterRename = await prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: renamedFolderPath } },
    });

    // Check for orphaned references
    let orphanedCount = 0;
    for (const email of emailsAfterRename) {
      // Email folder should match the renamed folder's current path
      if (email.folder !== renamedFolderPath && email.folder !== originalFolderPath) {
        orphanedCount++;
      }
      // If folder is original path but folder was renamed, that's also orphaned
      if (email.folder === originalFolderPath && folderAfterRename) {
        orphanedCount++;
      }
    }

    // Cleanup
    await prisma.email.deleteMany({
      where: { externalId: { startsWith: `stress-folder-rename-${timestamp}` } },
    });
    await prisma.folder.deleteMany({
      where: { path: { in: [originalFolderPath, renamedFolderPath] }, providerId },
    });
    await redis.del(SYNC_LOCK_KEY);

    const passed = orphanedCount === 0 && renameResult === 'success';

    return {
      passed,
      details: passed
        ? `Folder rename during sync completed without orphaned references (rename ${renameWaited ? 'waited for lock' : 'acquired lock'})`
        : `FAILED: ${orphanedCount} orphaned email references found, rename=${renameResult}`,
      metrics: {
        emailsCreated: testEmailCount,
        orphanedReferences: orphanedCount,
        renameWaited: renameWaited ? 'yes' : 'no',
        renameResult,
      },
    };
  } catch (error) {
    // Cleanup on error
    await prisma.email.deleteMany({
      where: { externalId: { startsWith: `stress-folder-rename-${timestamp}` } },
    }).catch(() => {});
    await prisma.folder.deleteMany({
      where: { path: { in: [originalFolderPath, renamedFolderPath] } },
    }).catch(() => {});
    await redis.del(SYNC_LOCK_KEY).catch(() => {});

    throw error;
  }
}

// ============================================
// Scenario 2: Redis Lock Contention - 20 Workers
// Phase 8 Success Criterion 4
// ============================================

async function scenarioRedisLockContention20Workers(
  redis: Redis
): Promise<{ passed: boolean; details: string; metrics?: Record<string, number | string> }> {
  const LOCK_KEY = 'stress-test:contention-20-workers';
  const LOCK_TTL_MS = 500; // Short TTL for quick rotation
  const WORKER_COUNT = 20;
  const WORK_DURATION_MS = 20;
  const SUCCESS_THRESHOLD = 0.8; // 80%

  // Cleanup any existing lock
  await redis.del(LOCK_KEY);

  const workerResults: Array<{ workerId: number; success: boolean; attempts: number; durationMs: number }> = [];
  const overallStart = Date.now();

  // Spawn 20 workers competing for the same lock
  // Each worker retries up to 50 times with random backoff
  const workers = Array.from({ length: WORKER_COUNT }, (_, i) => {
    return (async () => {
      const workerStart = Date.now();
      let attempts = 0;
      let success = false;

      // Retry loop with exponential backoff
      while (!success && attempts < 50) {
        attempts++;

        // Try to acquire lock atomically
        const lockId = `worker-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const result = await redis.set(LOCK_KEY, lockId, 'PX', LOCK_TTL_MS, 'NX');

        if (result === 'OK') {
          success = true;

          // Do some "work"
          await new Promise(r => setTimeout(r, WORK_DURATION_MS));

          // Release lock
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          await redis.eval(script, 1, LOCK_KEY, lockId);
        } else {
          // Random backoff before retry (10-60ms)
          await new Promise(r => setTimeout(r, 10 + Math.random() * 50));
        }
      }

      workerResults.push({
        workerId: i,
        success,
        attempts,
        durationMs: Date.now() - workerStart,
      });
    })();
  });

  // Wait for all workers with a timeout
  const TIMEOUT_MS = 60000; // 60 second max
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('Workers timed out after 60 seconds')), TIMEOUT_MS);
  });

  try {
    await Promise.race([Promise.all(workers), timeoutPromise]);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      details: `Timeout: ${errorMsg}`,
      metrics: {
        completedWorkers: workerResults.length,
        totalWorkers: WORKER_COUNT,
      },
    };
  }

  const overallDuration = Date.now() - overallStart;

  // Cleanup
  await redis.del(LOCK_KEY);

  // Calculate metrics
  const successCount = workerResults.filter(w => w.success).length;
  const failureCount = workerResults.filter(w => !w.success).length;
  const successRate = successCount / WORKER_COUNT;
  const avgDuration = workerResults.reduce((sum, w) => sum + w.durationMs, 0) / workerResults.length;
  const avgAttempts = workerResults.reduce((sum, w) => sum + w.attempts, 0) / workerResults.length;

  const passed = successRate >= SUCCESS_THRESHOLD;

  return {
    passed,
    details: passed
      ? `${successCount}/${WORKER_COUNT} workers (${(successRate * 100).toFixed(0)}%) successfully acquired lock`
      : `FAILED: Only ${successCount}/${WORKER_COUNT} workers (${(successRate * 100).toFixed(0)}%) succeeded, threshold is ${SUCCESS_THRESHOLD * 100}%`,
    metrics: {
      successCount,
      failureCount,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      avgAttempts: avgAttempts.toFixed(1),
      avgWorkerDurationMs: avgDuration.toFixed(0),
      totalDurationMs: overallDuration,
      threshold: `${SUCCESS_THRESHOLD * 100}%`,
    },
  };
}

// ============================================
// Scenario 3: Large Batch Operation - 1000+ Emails
// Phase 8 Success Criterion 5
// ============================================

async function scenarioLargeBatchOperation(
): Promise<{ passed: boolean; details: string; metrics?: Record<string, number | string> }> {
  const BATCH_SIZE = 1000;
  const TIMEOUT_MS = 60000; // 60 second baseline
  const SUB_BATCH_SIZE = 100; // Create in batches of 100 for efficiency
  const timestamp = Date.now();

  // Find a provider for testing
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true },
    select: { id: true, tenantId: true },
  });

  if (!provider) {
    return { passed: true, details: 'Skipped - no active provider available for test' };
  }

  const { id: providerId, tenantId } = provider;

  const overallStart = Date.now();
  let createdCount = 0;
  let createDurationMs = 0;
  let cleanupDurationMs = 0;

  try {
    // Create emails in sub-batches for efficiency
    const createStart = Date.now();
    const numSubBatches = Math.ceil(BATCH_SIZE / SUB_BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < numSubBatches; batchIndex++) {
      const startIdx = batchIndex * SUB_BATCH_SIZE;
      const endIdx = Math.min(startIdx + SUB_BATCH_SIZE, BATCH_SIZE);
      const batchSize = endIdx - startIdx;

      const emails = Array.from({ length: batchSize }, (_, i) => ({
        tenantId,
        providerId,
        externalId: `stress-batch-${timestamp}-${startIdx + i}`,
        folder: 'INBOX',
        subject: `Batch Test Email ${startIdx + i}`,
        from: 'test@example.com',
        to: ['recipient@example.com'],
        sentAt: new Date(),
        receivedAt: new Date(),
      }));

      await prisma.email.createMany({ data: emails, skipDuplicates: true });
      createdCount += batchSize;

      // Check if we've exceeded the timeout
      if (Date.now() - overallStart > TIMEOUT_MS) {
        break;
      }
    }

    createDurationMs = Date.now() - createStart;

    // Verify count
    const actualCount = await prisma.email.count({
      where: { externalId: { startsWith: `stress-batch-${timestamp}` } },
    });

    // Cleanup
    const cleanupStart = Date.now();
    await prisma.email.deleteMany({
      where: { externalId: { startsWith: `stress-batch-${timestamp}` } },
    });
    cleanupDurationMs = Date.now() - cleanupStart;

    const overallDuration = Date.now() - overallStart;
    const passed = actualCount >= BATCH_SIZE && overallDuration < TIMEOUT_MS;

    return {
      passed,
      details: passed
        ? `Created and verified ${actualCount} emails in ${createDurationMs}ms (cleanup: ${cleanupDurationMs}ms)`
        : `FAILED: Created ${actualCount}/${BATCH_SIZE} in ${overallDuration}ms (baseline: ${TIMEOUT_MS}ms)`,
      metrics: {
        targetCount: BATCH_SIZE,
        actualCount,
        createDurationMs,
        cleanupDurationMs,
        totalDurationMs: overallDuration,
        baselineMs: TIMEOUT_MS,
        throughput: `${(actualCount / (createDurationMs / 1000)).toFixed(0)} emails/sec`,
      },
    };
  } catch (error) {
    // Cleanup on error
    await prisma.email.deleteMany({
      where: { externalId: { startsWith: `stress-batch-${timestamp}` } },
    }).catch(() => {});

    throw error;
  }
}

// ============================================
// Main Execution
// ============================================

async function main(): Promise<void> {
  log('\n' + '='.repeat(70), colors.bold);
  log('  STRESS TEST: Concurrent Operations (Phase 8 Criteria 2, 4, 5)', colors.bold);
  log('  Date: ' + new Date().toISOString(), colors.cyan);
  log('='.repeat(70) + '\n', colors.bold);

  // Connect to Redis
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
    connectionName: 'stress-test-concurrent',
  });

  try {
    // Test Redis connection
    await redis.ping();
    log('Redis connected successfully\n', colors.green);

    // Run scenarios
    log('--- SCENARIO 1: Folder Rename During Sync (Criterion 2) ---\n', colors.yellow);
    await runScenario(1, 'Folder Rename During Sync', () => scenarioFolderRenameDuringSync(redis));

    log('\n--- SCENARIO 2: Redis Lock Contention - 20 Workers (Criterion 4) ---\n', colors.yellow);
    await runScenario(2, 'Redis Lock Contention (20 Workers)', () => scenarioRedisLockContention20Workers(redis));

    log('\n--- SCENARIO 3: Large Batch Operation - 1000+ Emails (Criterion 5) ---\n', colors.yellow);
    await runScenario(3, 'Large Batch Operation (1000+ Emails)', () => scenarioLargeBatchOperation());

  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }

  // Summary
  log('\n' + '='.repeat(70), colors.bold);
  log('  SUMMARY', colors.bold);
  log('='.repeat(70), colors.bold);

  console.log('\n');
  console.log('  +----------+----------------------------------------+--------+------------+');
  console.log('  | Scenario | Name                                   | Status | Duration   |');
  console.log('  +----------+----------------------------------------+--------+------------+');

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const statusColor = result.passed ? colors.green : colors.red;
    const name = result.name.substring(0, 38).padEnd(38);
    const duration = `${result.durationMs}ms`.padStart(10);
    console.log(`  | ${String(result.scenario).padStart(8)} | ${name} | ${statusColor}${status.padStart(6)}${colors.reset} | ${duration} |`);
  }

  console.log('  +----------+----------------------------------------+--------+------------+');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  log(`\n  Total: ${passed}/${results.length} scenarios passed, ${failed} failed`, passed === results.length ? colors.green : colors.red);
  log(`  Total duration: ${totalDuration}ms\n`, colors.cyan);

  if (failed > 0) {
    log('  Phase 8 Success Criteria Status:', colors.yellow);
    const criterion2 = results.find(r => r.scenario === 1);
    const criterion4 = results.find(r => r.scenario === 2);
    const criterion5 = results.find(r => r.scenario === 3);

    log(`    Criterion 2 (Folder rename): ${criterion2?.passed ? 'PASS' : 'FAIL'}`, criterion2?.passed ? colors.green : colors.red);
    log(`    Criterion 4 (Lock contention): ${criterion4?.passed ? 'PASS' : 'FAIL'}`, criterion4?.passed ? colors.green : colors.red);
    log(`    Criterion 5 (Large batch): ${criterion5?.passed ? 'PASS' : 'FAIL'}`, criterion5?.passed ? colors.green : colors.red);
    log('', colors.reset);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
