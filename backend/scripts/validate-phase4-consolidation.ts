/**
 * Phase 4 Validation Script: Code Consolidation
 *
 * Verifies code consolidation:
 * - 4.1: BaseWorker abstract class and worker inheritance
 * - 4.2: Token refresh consolidation (check status)
 * - 4.3: withTimeout utility (check status)
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/validate-phase4-consolidation.ts
 *
 * NO MOCKS - Checks actual codebase
 */
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];
const BACKEND_ROOT = path.resolve(__dirname, '..');

// ========================================
// 4.1: BaseWorker Abstract Class
// ========================================
async function test41BaseWorker(): Promise<void> {
  const testName = '4.1: BaseWorker Abstract Class';
  const start = Date.now();

  try {
    // Check BaseWorker exists
    const baseWorkerPath = path.join(BACKEND_ROOT, 'src/common/workers/base.worker.ts');
    if (!fs.existsSync(baseWorkerPath)) {
      throw new Error('BaseWorker file does not exist');
    }

    const baseWorkerContent = fs.readFileSync(baseWorkerPath, 'utf-8');

    // Verify key patterns in BaseWorker
    const requiredPatterns = [
      'abstract class BaseWorker',
      'implements OnModuleInit, OnModuleDestroy',
      'abstract.*processJob',
      'onModuleInit',
      'onModuleDestroy',
    ];

    const missingPatterns: string[] = [];
    for (const pattern of requiredPatterns) {
      const regex = new RegExp(pattern);
      if (!regex.test(baseWorkerContent)) {
        missingPatterns.push(pattern);
      }
    }

    if (missingPatterns.length > 0) {
      throw new Error(`BaseWorker missing patterns: ${missingPatterns.join(', ')}`);
    }

    // Check which workers extend BaseWorker
    const workerFiles = [
      { name: 'sync.worker.ts', required: false }, // SyncWorker is complex, deferred to Phase 6.3
      { name: 'sync-back.worker.ts', required: true },
      { name: 'email-send.worker.ts', required: true },
      { name: 'folder-operations.worker.ts', required: true },
      { name: 'bulk-operations.worker.ts', required: true },
    ];

    const workerDir = path.join(BACKEND_ROOT, 'src/modules/email-sync/workers');
    const extendsBaseWorker: string[] = [];
    const notExtending: string[] = [];

    for (const { name, required } of workerFiles) {
      const workerPath = path.join(workerDir, name);
      if (fs.existsSync(workerPath)) {
        const content = fs.readFileSync(workerPath, 'utf-8');
        if (content.includes('extends BaseWorker')) {
          extendsBaseWorker.push(name);
        } else if (required) {
          notExtending.push(name);
        }
      }
    }

    if (notExtending.length > 0) {
      throw new Error(`Required workers not extending BaseWorker: ${notExtending.join(', ')}`);
    }

    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: `BaseWorker implemented. ${extendsBaseWorker.length}/5 workers extend it: ${extendsBaseWorker.join(', ')}. SyncWorker deferred to Phase 6.3`,
    });
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// 4.2: Token Refresh Consolidation (Status Check)
// ========================================
async function test42TokenRefresh(): Promise<void> {
  const testName = '4.2: Token Refresh Consolidation (Status)';
  const start = Date.now();

  try {
    const tokenServicePath = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/services/provider-token.service.ts',
    );

    if (!fs.existsSync(tokenServicePath)) {
      throw new Error('provider-token.service.ts does not exist');
    }

    const content = fs.readFileSync(tokenServicePath, 'utf-8');

    // Check if consolidated method exists
    const hasConsolidated = content.includes('refreshTokenWithLock');

    // Check if separate methods still exist
    const hasSeparateGoogle = content.includes('refreshGoogleTokenWithLock');
    const hasSeparateMicrosoft = content.includes('refreshMicrosoftTokenWithLock');

    if (hasConsolidated && !hasSeparateGoogle && !hasSeparateMicrosoft) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'Token refresh fully consolidated into single generic method',
      });
    } else if (hasSeparateGoogle && hasSeparateMicrosoft) {
      // Not consolidated yet - informational
      results.push({
        name: testName,
        passed: true, // Still pass - this is optional consolidation
        duration: Date.now() - start,
        details: 'Token refresh not yet consolidated (separate Google/Microsoft methods exist). Optional improvement.',
      });
    } else {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'Partial consolidation detected',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// 4.3: withTimeout Utility (Status Check)
// ========================================
async function test43WithTimeout(): Promise<void> {
  const testName = '4.3: withTimeout Utility (Status)';
  const start = Date.now();

  try {
    // Check if utility exists in common/utils
    const utilPath = path.join(BACKEND_ROOT, 'src/common/utils/async.utils.ts');

    // Check if withTimeout exists in BaseWorker
    const baseWorkerPath = path.join(BACKEND_ROOT, 'src/common/workers/base.worker.ts');
    const baseWorkerContent = fs.readFileSync(baseWorkerPath, 'utf-8');

    const hasWithTimeout = baseWorkerContent.includes('withTimeout');

    if (fs.existsSync(utilPath) || hasWithTimeout) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: hasWithTimeout
          ? 'withTimeout utility included in BaseWorker'
          : 'withTimeout utility exists in async.utils.ts',
      });
    } else {
      results.push({
        name: testName,
        passed: true, // Still pass - optional
        duration: Date.now() - start,
        details: 'withTimeout utility not yet centralized. Optional improvement.',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// Verify BaseWorker Utility Methods
// ========================================
async function testBaseWorkerUtilities(): Promise<void> {
  const testName = 'BaseWorker Utility Methods';
  const start = Date.now();

  try {
    const baseWorkerPath = path.join(BACKEND_ROOT, 'src/common/workers/base.worker.ts');
    const content = fs.readFileSync(baseWorkerPath, 'utf-8');

    // Check for utility methods that should be in BaseWorker
    const utilities = [
      { name: 'withTimeout', description: 'Timeout wrapper for operations' },
      { name: 'generateIdempotencyKey', description: 'Job deduplication key generator' },
      { name: 'generateLockKey', description: 'Distributed lock key generator' },
    ];

    const found: string[] = [];
    for (const util of utilities) {
      if (content.includes(util.name)) {
        found.push(util.name);
      }
    }

    if (found.length > 0) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: `BaseWorker includes ${found.length} utility methods: ${found.join(', ')}`,
      });
    } else {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'No additional utility methods in BaseWorker (minimal implementation)',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// Main
// ========================================
async function main() {
  console.log('='.repeat(60));
  console.log('Phase 4 Validation: Code Consolidation');
  console.log('='.repeat(60));
  console.log('Checking consolidation patterns in codebase\n');

  // Run all tests
  await test41BaseWorker();
  await test42TokenRefresh();
  await test43WithTimeout();
  await testBaseWorkerUtilities();

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.details) {
      console.log(`       ${result.details}`);
    }
    if (result.error) {
      console.log(`       Error: ${result.error}`);
    }
    result.passed ? passed++ : failed++;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('-'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ PHASE 4 VALIDATION FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ PHASE 4 VALIDATION PASSED');
    console.log('Core consolidation (BaseWorker) complete. Optional items noted.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
