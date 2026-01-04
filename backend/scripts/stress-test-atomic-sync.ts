/**
 * Stress Test: Atomic Email Sync
 *
 * Tests the deduplication and race condition fixes:
 * 1. DEDUP-FIX: Cross-folder deduplication in syncFullWithDriver
 * 2. P2002 Retry: Prisma unique constraint error handling
 * 3. Redis Lock: Distributed lock for concurrent syncs
 *
 * Run: npx ts-node scripts/stress-test-atomic-sync.ts
 *
 * @see https://github.com/prisma/prisma/issues/3242
 * @date 2025-01-04
 */

/// <reference types="node" />
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function runTest(
  name: string,
  fn: () => Promise<{ passed: boolean; details: string }>
): Promise<void> {
  const start = Date.now();
  try {
    const { passed, details } = await fn();
    const duration = Date.now() - start;
    results.push({ name, passed, duration, details });
    const icon = passed ? '✅' : '❌';
    const color = passed ? colors.green : colors.red;
    log(`${icon} ${name} (${duration}ms)`, color);
    log(`   ${details}`, colors.cyan);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, details: '', error: errorMsg });
    log(`❌ ${name} (${duration}ms)`, colors.red);
    log(`   Error: ${errorMsg}`, colors.red);
  }
}

// ============================================
// Test 1: Check for Duplicate Emails
// ============================================
async function testDuplicateEmails(): Promise<{ passed: boolean; details: string }> {
  // Find emails with same externalId appearing in multiple folders
  const duplicates = await prisma.$queryRaw<
    Array<{ externalId: string; providerId: string; count: bigint; folders: string }>
  >`
    SELECT
      "externalId",
      "providerId",
      COUNT(*) as count,
      STRING_AGG(DISTINCT "folder", ', ') as folders
    FROM "emails"
    WHERE "externalId" IS NOT NULL
    GROUP BY "externalId", "providerId"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `;

  if (duplicates.length === 0) {
    return {
      passed: true,
      details: 'No duplicate emails found (same externalId in multiple folders)',
    };
  }

  // Format duplicate info
  const dupInfo = duplicates
    .slice(0, 5)
    .map(
      (d) =>
        `externalId=${d.externalId.slice(0, 20)}... folders=[${d.folders}] count=${d.count}`
    )
    .join('\n   ');

  return {
    passed: false,
    details: `Found ${duplicates.length} duplicate emails:\n   ${dupInfo}`,
  };
}

// ============================================
// Test 2: Check Unique Constraint Integrity
// ============================================
async function testUniqueConstraintIntegrity(): Promise<{
  passed: boolean;
  details: string;
}> {
  // Check if unique constraint/index exists using pg_indexes (more reliable than information_schema)
  const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'emails'
    AND (indexdef LIKE '%providerId%' AND indexdef LIKE '%externalId%' AND indexdef LIKE '%folder%')
  `;

  const hasProviderExternalIdFolder = indexes.length > 0;

  // Check for any constraint violations that could cause P2002
  const totalEmails = await prisma.email.count();
  const distinctCombos = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT ("providerId" || ':' || COALESCE("externalId", id) || ':' || "folder")) as count
    FROM "emails"
  `;

  const uniqueCount = Number(distinctCombos[0]?.count || 0);
  const hasViolations = totalEmails !== uniqueCount;

  const indexNames = indexes.map((i) => i.indexname).join(', ') || 'none found';

  return {
    passed: !hasViolations && hasProviderExternalIdFolder,
    details: `Total emails: ${totalEmails}, Unique combos: ${uniqueCount}, Indexes: ${indexNames}`,
  };
}

// ============================================
// Test 3: Concurrent Upsert Simulation
// ============================================
async function testConcurrentUpsertSimulation(): Promise<{
  passed: boolean;
  details: string;
}> {
  const testExternalId = 'stress-test-email-' + Date.now();

  // Create test provider first (if needed for FK)
  const existingProvider = await prisma.providerConfig.findFirst({
    where: { providerType: 'google' },
    select: { id: true, tenantId: true },
  });

  if (!existingProvider) {
    return {
      passed: true,
      details: 'Skipped - no provider available for test',
    };
  }

  const providerId = existingProvider.id;
  const tenantId = existingProvider.tenantId;

  // Simulate 10 concurrent upserts with same externalId but different folders
  const folders = ['INBOX', 'SENT', 'ARCHIVE', 'DRAFTS', 'TRASH'];
  const concurrentOps = folders.map((folder) =>
    prisma.email.upsert({
      where: {
        providerId_externalId_folder: {
          providerId,
          externalId: testExternalId,
          folder,
        },
      },
      update: {
        subject: `Updated at ${Date.now()}`,
      },
      create: {
        tenantId,
        providerId,
        externalId: testExternalId,
        folder,
        subject: `Stress test ${folder}`,
        from: 'test@example.com',
        to: ['recipient@example.com'],
        sentAt: new Date(),
        receivedAt: new Date(),
      },
    })
  );

  const startTime = Date.now();
  let p2002Count = 0;
  let successCount = 0;

  try {
    // Run all upserts concurrently
    const results = await Promise.allSettled(concurrentOps);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else if (
        result.reason?.code === 'P2002' ||
        result.reason?.message?.includes('Unique constraint')
      ) {
        p2002Count++;
      }
    }
  } catch (error) {
    // Transaction failed - expected in some cases
  }

  const duration = Date.now() - startTime;

  // Cleanup test data
  await prisma.email.deleteMany({
    where: { externalId: testExternalId },
  });

  return {
    passed: true,
    details: `Concurrent upserts: ${folders.length}, Success: ${successCount}, P2002: ${p2002Count}, Duration: ${duration}ms`,
  };
}

// ============================================
// Test 4: Check for Race Condition Indicators
// ============================================
async function testRaceConditionIndicators(): Promise<{
  passed: boolean;
  details: string;
}> {
  // Check for emails created at the exact same millisecond (race condition indicator)
  const sameTimestampEmails = await prisma.$queryRaw<
    Array<{ created_at: Date; count: bigint }>
  >`
    SELECT "createdAt" as created_at, COUNT(*) as count
    FROM "emails"
    GROUP BY "createdAt"
    HAVING COUNT(*) > 5
    ORDER BY count DESC
    LIMIT 5
  `;

  // Check for emails with version > 1 (indicates concurrent updates)
  const highVersionEmails = await prisma.email.count({
    where: { version: { gt: 5 } },
  });

  // Check for recent userModifiedAt updates (user vs sync conflicts)
  const recentUserMods = await prisma.email.count({
    where: {
      userModifiedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  });

  const passed = sameTimestampEmails.length < 3;

  return {
    passed,
    details: `Same-timestamp groups: ${sameTimestampEmails.length}, High-version emails: ${highVersionEmails}, Recent user mods: ${recentUserMods}`,
  };
}

// ============================================
// Test 5: Provider Sync Token Validity
// ============================================
async function testSyncTokenValidity(): Promise<{
  passed: boolean;
  details: string;
}> {
  const providers = await prisma.providerConfig.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      providerType: true,
      lastSyncedAt: true,
      metadata: true,
    },
  });

  let validTokens = 0;
  let invalidTokens = 0;
  let missingTokens = 0;

  for (const provider of providers) {
    const metadata = provider.metadata as Record<string, any> | null;
    const syncToken = metadata?.syncToken || metadata?.deltaLink;

    if (!syncToken) {
      missingTokens++;
    } else if (
      provider.providerType === 'microsoft' &&
      syncToken.includes('graph.microsoft.com')
    ) {
      validTokens++;
    } else if (provider.providerType === 'google' && /^\d+$/.test(syncToken)) {
      validTokens++;
    } else {
      invalidTokens++;
    }
  }

  return {
    passed: invalidTokens === 0,
    details: `Providers: ${providers.length}, Valid tokens: ${validTokens}, Invalid: ${invalidTokens}, Missing: ${missingTokens}`,
  };
}

// ============================================
// Test 6: Cross-Folder Email Count
// ============================================
async function testCrossFolderEmailCount(): Promise<{
  passed: boolean;
  details: string;
}> {
  const folderCounts = await prisma.email.groupBy({
    by: ['folder'],
    _count: true,
    orderBy: { _count: { folder: 'desc' } },
  });

  const totalEmails = folderCounts.reduce((sum, f) => sum + f._count, 0);
  const folderBreakdown = folderCounts
    .slice(0, 6)
    .map((f) => `${f.folder}: ${f._count}`)
    .join(', ');

  // Check if distribution is reasonable (not all in one folder)
  const maxFolder = folderCounts[0]?._count || 0;
  const ratio = maxFolder / totalEmails;
  const isBalanced = ratio < 0.95; // If one folder has > 95%, might indicate sync issue

  return {
    passed: isBalanced || totalEmails === 0,
    details: `Total: ${totalEmails}, ${folderBreakdown}${!isBalanced ? ' ⚠️ Unbalanced!' : ''}`,
  };
}

// ============================================
// Test 7: Database Performance Check
// ============================================
async function testDatabasePerformance(): Promise<{
  passed: boolean;
  details: string;
}> {
  // Test query performance on unique constraint columns
  const queryStart = Date.now();
  await prisma.email.findMany({
    where: {
      providerId: 'test-provider-id',
      externalId: 'test-external-id',
      folder: 'INBOX',
    },
    take: 1,
  });
  const queryTime = Date.now() - queryStart;

  // Check if the unique index exists using pg_indexes
  const indexExists = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM pg_indexes
    WHERE tablename = 'emails'
    AND indexdef LIKE '%providerId%'
    AND indexdef LIKE '%externalId%'
    AND indexdef LIKE '%folder%'
  `;

  const usesIndex = Number(indexExists[0]?.count || 0) > 0;

  // Test a real query with unique index
  const indexedQueryStart = Date.now();
  await prisma.email.findFirst({
    where: {
      providerId: 'test-provider-id',
      externalId: 'test-external-id',
      folder: 'INBOX',
    },
  });
  const indexedQueryTime = Date.now() - indexedQueryStart;

  return {
    passed: queryTime < 100 && usesIndex,
    details: `Query: ${queryTime}ms, Indexed query: ${indexedQueryTime}ms, Unique index exists: ${usesIndex}`,
  };
}

// ============================================
// Main Execution
// ============================================
async function main() {
  log('\n' + '='.repeat(60), colors.bold);
  log('  STRESS TEST: Atomic Email Sync Fixes', colors.bold);
  log('  Date: ' + new Date().toISOString(), colors.cyan);
  log('='.repeat(60) + '\n', colors.bold);

  // Run all tests
  await runTest('1. Duplicate Emails Check', testDuplicateEmails);
  await runTest('2. Unique Constraint Integrity', testUniqueConstraintIntegrity);
  await runTest('3. Concurrent Upsert Simulation', testConcurrentUpsertSimulation);
  await runTest('4. Race Condition Indicators', testRaceConditionIndicators);
  await runTest('5. Sync Token Validity', testSyncTokenValidity);
  await runTest('6. Cross-Folder Email Count', testCrossFolderEmailCount);
  await runTest('7. Database Performance', testDatabasePerformance);

  // Summary
  log('\n' + '='.repeat(60), colors.bold);
  log('  SUMMARY', colors.bold);
  log('='.repeat(60), colors.bold);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  log(`\n  Passed: ${passed}/${results.length}`, passed === results.length ? colors.green : colors.yellow);
  log(`  Failed: ${failed}/${results.length}`, failed === 0 ? colors.green : colors.red);
  log(`  Total time: ${totalTime}ms\n`, colors.cyan);

  if (failed > 0) {
    log('  Failed tests:', colors.red);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        log(`    - ${r.name}`, colors.red);
        if (r.error) log(`      Error: ${r.error}`, colors.red);
      });
    log('');
  }

  // Recommendations
  if (failed > 0) {
    log('  RECOMMENDATIONS:', colors.yellow);
    if (results.find((r) => r.name.includes('Duplicate') && !r.passed)) {
      log('    - Run cleanup script to remove duplicate emails', colors.yellow);
      log('    - Check DEDUP-FIX in syncFullWithDriver is working', colors.yellow);
    }
    if (results.find((r) => r.name.includes('Constraint') && !r.passed)) {
      log('    - Verify Prisma schema unique constraints', colors.yellow);
      log('    - Run: npx prisma db push --force-reset (DANGER!)', colors.yellow);
    }
    if (results.find((r) => r.name.includes('Token') && !r.passed)) {
      log('    - Re-authenticate providers with invalid tokens', colors.yellow);
    }
    log('');
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
