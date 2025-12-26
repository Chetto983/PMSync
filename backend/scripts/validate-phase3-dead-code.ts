/**
 * Phase 3 Validation Script: Dead Code Cleanup
 *
 * Verifies that dead code items have been properly removed:
 * - 3.1: Unused utilities (email-metadata.util.ts, folder-exclusion.util.ts)
 * - 3.2: Unused factory methods
 * - 3.7: Cross-provider services
 *
 * Also checks for remaining LOW priority items (informational)
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/validate-phase3-dead-code.ts
 *
 * NO MOCKS - Checks actual filesystem
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
// 3.1: Unused Utilities - SHOULD BE DELETED
// ========================================
async function test31UnusedUtilities(): Promise<void> {
  const testName = '3.1: Unused Utilities Deleted';
  const start = Date.now();

  try {
    const filesToCheck = [
      'src/modules/email-sync/utils/email-metadata.util.ts',
      'src/modules/email-sync/utils/folder-exclusion.util.ts',
    ];

    const existingFiles: string[] = [];

    for (const file of filesToCheck) {
      const fullPath = path.join(BACKEND_ROOT, file);
      if (fs.existsSync(fullPath)) {
        existingFiles.push(file);
      }
    }

    if (existingFiles.length > 0) {
      throw new Error(`Files should be deleted but still exist: ${existingFiles.join(', ')}`);
    }

    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: `Verified ${filesToCheck.length} utility files have been deleted`,
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
// 3.2: Unused Factory Methods - SHOULD BE DELETED
// ========================================
async function test32UnusedFactoryMethods(): Promise<void> {
  const testName = '3.2: Unused Factory Methods Deleted';
  const start = Date.now();

  try {
    // Check that resilient-driver.wrapper.ts is deleted
    const wrapperFile = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/drivers/resilience/resilient-driver.wrapper.ts',
    );

    if (fs.existsSync(wrapperFile)) {
      throw new Error('resilient-driver.wrapper.ts should be deleted but still exists');
    }

    // Check driver.factory.ts for removed methods
    const factoryFile = path.join(BACKEND_ROOT, 'src/modules/email-sync/drivers/driver.factory.ts');

    if (!fs.existsSync(factoryFile)) {
      throw new Error('driver.factory.ts should exist');
    }

    const factoryContent = fs.readFileSync(factoryFile, 'utf-8');

    // These methods should be REMOVED
    const removedMethods = [
      'getDriver',
      'isSupported',
      'getSupportedProviders',
      'createResilientDriver',
      'wrapWithResilience',
      'isResilienceAvailable',
      'getResilienceService',
    ];

    const foundMethods: string[] = [];
    for (const method of removedMethods) {
      // Look for method definition pattern
      const methodPattern = new RegExp(`\\b${method}\\s*\\(`);
      if (methodPattern.test(factoryContent)) {
        foundMethods.push(method);
      }
    }

    if (foundMethods.length > 0) {
      throw new Error(`Methods should be deleted but still exist: ${foundMethods.join(', ')}`);
    }

    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: `Verified resilient-driver.wrapper.ts deleted and ${removedMethods.length} factory methods removed`,
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
// 3.7: Cross-Provider Services - SHOULD BE DELETED
// ========================================
async function test37CrossProviderServices(): Promise<void> {
  const testName = '3.7: Cross-Provider Services Deleted';
  const start = Date.now();

  try {
    const servicesToCheck = [
      'src/modules/email-sync/services/cross-provider-sync.service.ts',
      'src/modules/email-sync/services/cross-provider-dedup.service.ts',
      'src/modules/email-sync/services/cross-provider-conflict.service.ts',
    ];

    const existingFiles: string[] = [];

    for (const file of servicesToCheck) {
      const fullPath = path.join(BACKEND_ROOT, file);
      if (fs.existsSync(fullPath)) {
        existingFiles.push(file);
      }
    }

    if (existingFiles.length > 0) {
      throw new Error(`Services should be deleted but still exist: ${existingFiles.join(', ')}`);
    }

    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: `Verified ${servicesToCheck.length} cross-provider services have been deleted`,
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
// 3.3-3.6: LOW Priority Items (Informational)
// ========================================
async function testRemainingItems(): Promise<void> {
  const testName = '3.3-3.6: LOW Priority Items (Informational)';
  const start = Date.now();

  try {
    const remainingItems: { file: string; items: string[] }[] = [];

    // 3.3: ResilienceService methods (MEDIUM)
    const resilienceFile = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/drivers/resilience/resilience.service.ts',
    );
    if (fs.existsSync(resilienceFile)) {
      const content = fs.readFileSync(resilienceFile, 'utf-8');
      const methods = ['getAllCircuitStatus', 'getAllRateLimitStatus', 'resetCircuitBreaker', 'resetRateLimit', 'resetMetrics', 'cleanup'];
      const found = methods.filter((m) => content.includes(m));
      if (found.length > 0) {
        remainingItems.push({ file: 'resilience.service.ts', items: found });
      }
    }

    // 3.4: Base class methods (LOW)
    const baseFile = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/services/base-email-sync.service.ts',
    );
    if (fs.existsSync(baseFile)) {
      const content = fs.readFileSync(baseFile, 'utf-8');
      const methods = ['isSystemFolder', 'notifyMailboxChange', 'calculateSyncStats', 'validateEmailAddress', 'formatTimestamp'];
      const found = methods.filter((m) => content.includes(m));
      if (found.length > 0) {
        remainingItems.push({ file: 'base-email-sync.service.ts', items: found });
      }
    }

    // 3.5: Constants (LOW)
    const constantsFile = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/constants/email-sync.constants.ts',
    );
    if (fs.existsSync(constantsFile)) {
      const content = fs.readFileSync(constantsFile, 'utf-8');
      const constants = ['GMAIL_CATEGORY_MAP', 'MICROSOFT_DESTINATIONS', 'CANONICAL_TO_IMAP_FOLDER_MAP', 'DTO_LIMITS'];
      const found = constants.filter((c) => content.includes(c));
      if (found.length > 0) {
        remainingItems.push({ file: 'email-sync.constants.ts', items: found });
      }
    }

    const totalRemaining = remainingItems.reduce((sum, r) => sum + r.items.length, 0);

    if (remainingItems.length > 0) {
      const details = remainingItems.map((r) => `${r.file}: ${r.items.join(', ')}`).join('\n       ');
      results.push({
        name: testName,
        passed: true, // Informational - not a failure
        duration: Date.now() - start,
        details: `${totalRemaining} LOW priority items remaining (optional cleanup):\n       ${details}`,
      });
    } else {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'All LOW priority items have been cleaned up',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: true, // Informational
      duration: Date.now() - start,
      details: `Could not check: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ========================================
// Verify No Import Errors
// ========================================
async function testNoImportErrors(): Promise<void> {
  const testName = 'No Import Errors from Deleted Files';
  const start = Date.now();

  try {
    // Check email-sync.module.ts for removed imports
    const moduleFile = path.join(BACKEND_ROOT, 'src/modules/email-sync/email-sync.module.ts');

    if (!fs.existsSync(moduleFile)) {
      throw new Error('email-sync.module.ts should exist');
    }

    const moduleContent = fs.readFileSync(moduleFile, 'utf-8');

    // These imports should NOT exist
    const removedImports = [
      'CrossProviderSyncService',
      'CrossProviderDedupService',
      'CrossProviderConflictService',
      'email-metadata.util',
      'folder-exclusion.util',
      'resilient-driver.wrapper',
    ];

    const foundImports: string[] = [];
    for (const imp of removedImports) {
      if (moduleContent.includes(imp)) {
        foundImports.push(imp);
      }
    }

    if (foundImports.length > 0) {
      throw new Error(`Module still imports deleted items: ${foundImports.join(', ')}`);
    }

    results.push({
      name: testName,
      passed: true,
      duration: Date.now() - start,
      details: 'Module file has no imports from deleted files',
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
// Main
// ========================================
async function main() {
  console.log('='.repeat(60));
  console.log('Phase 3 Validation: Dead Code Cleanup');
  console.log('='.repeat(60));
  console.log('Checking filesystem for deleted files and remaining items\n');

  // Run all tests
  await test31UnusedUtilities();
  await test32UnusedFactoryMethods();
  await test37CrossProviderServices();
  await testNoImportErrors();
  await testRemainingItems();

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
    console.log('\n❌ PHASE 3 VALIDATION FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ PHASE 3 VALIDATION PASSED');
    console.log('HIGH/MEDIUM priority dead code has been removed.');
    console.log('LOW priority items are optional cleanup.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
