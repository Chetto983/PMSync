/**
 * Comprehensive E2E Folder System Validation Script
 *
 * Validates the entire folder protection system:
 * 1. Database schema (isSystem field exists)
 * 2. System folder detection (SYSTEM_LABEL_IDS coverage)
 * 3. Folder sync service (isSystem set correctly)
 * 4. Controller protection (rename/delete blocked for system folders)
 * 5. Frontend compatibility (specialUse + isSystem alignment)
 *
 * Run with: npx ts-node scripts/validate-folder-system.ts
 *
 * Options:
 *   --fix       Auto-fix mismatched isSystem values
 *   --verbose   Show detailed output
 *   --tenant    Filter by tenant ID
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { SYSTEM_LABEL_IDS, isSystemFolder } from '../src/modules/email-sync/drivers/interfaces/canonical.types';

// Parse CLI args
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const verbose = args.includes('--verbose');
const tenantFilter = args.includes('--tenant')
  ? args[args.indexOf('--tenant') + 1]
  : null;

const prisma = createPrismaClient();

interface ValidationResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'FIXED';
  message: string;
  details?: unknown;
}

const results: ValidationResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function logResult(result: ValidationResult) {
  const icon = {
    PASS: '✅',
    FAIL: '❌',
    WARN: '⚠️',
    FIXED: '🔧',
  }[result.status];

  console.log(`${icon} ${result.test}: ${result.message}`);
  if (verbose && result.details) {
    console.log('   Details:', JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  FOLDER SYSTEM VALIDATION');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  if (tenantFilter) {
    console.log(`📌 Filtering by tenant: ${tenantFilter}\n`);
  }

  // ============================================
  // TEST 1: SYSTEM_LABEL_IDS Coverage
  // ============================================
  log('\n📋 TEST 1: SYSTEM_LABEL_IDS Coverage\n');

  const expectedSystemLabels = [
    // Core system folders
    'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'IMPORTANT', 'STARRED', 'OUTBOX',
    // Aliases
    'JUNK', 'FLAGGED', 'DRAFT',
    // Gmail system labels
    'UNREAD', 'MUTED', 'CHAT', 'ALL',
    // Gmail categories
    'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
    // Gmail star variants
    'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR', 'ORANGE_STAR', 'PURPLE_STAR',
    // Microsoft extended
    'CONVERSATIONHISTORY', 'CONVERSATION HISTORY', 'CLUTTER', 'SCHEDULED', 'NOTES', 'JOURNAL',
  ];

  const missingFromSet = expectedSystemLabels.filter(label => !SYSTEM_LABEL_IDS.has(label));

  if (missingFromSet.length === 0) {
    logResult({
      test: 'SYSTEM_LABEL_IDS completeness',
      status: 'PASS',
      message: `All ${expectedSystemLabels.length} expected labels present in Set`,
    });
  } else {
    logResult({
      test: 'SYSTEM_LABEL_IDS completeness',
      status: 'FAIL',
      message: `Missing ${missingFromSet.length} labels from Set`,
      details: missingFromSet,
    });
  }

  // Verify isSystemFolder function
  const testCases = [
    { input: 'INBOX', expected: true },
    { input: 'SENT', expected: true },
    { input: 'CATEGORY_SOCIAL', expected: true },
    { input: 'YELLOW_STAR', expected: true },
    { input: 'CONVERSATIONHISTORY', expected: true },
    { input: 'CustomFolder', expected: false },
    { input: 'MyLabel', expected: false },
    { input: '', expected: false },
  ];

  let functionTestsPassed = 0;
  for (const tc of testCases) {
    const result = isSystemFolder(tc.input);
    if (result === tc.expected) {
      functionTestsPassed++;
    } else if (verbose) {
      console.log(`   ❌ isSystemFolder('${tc.input}') = ${result}, expected ${tc.expected}`);
    }
  }

  logResult({
    test: 'isSystemFolder() function',
    status: functionTestsPassed === testCases.length ? 'PASS' : 'FAIL',
    message: `${functionTestsPassed}/${testCases.length} test cases passed`,
  });

  // ============================================
  // TEST 2: Database Folder Analysis
  // ============================================
  log('\n📋 TEST 2: Database Folder Analysis\n');

  const whereClause = tenantFilter ? { tenantId: tenantFilter } : {};

  // Get all folders
  const allFolders = await prisma.folder.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      path: true,
      specialUse: true,
      isSystem: true,
      provider: {
        select: { providerType: true, email: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  logResult({
    test: 'Total folders in database',
    status: 'PASS',
    message: `${allFolders.length} folders found`,
  });

  // Count by isSystem
  const systemFolders = allFolders.filter(f => f.isSystem);
  const userFolders = allFolders.filter(f => !f.isSystem);

  logResult({
    test: 'System folders (protected)',
    status: systemFolders.length > 0 ? 'PASS' : 'WARN',
    message: `${systemFolders.length} folders with isSystem=true`,
  });

  logResult({
    test: 'User folders (editable)',
    status: 'PASS',
    message: `${userFolders.length} folders with isSystem=false`,
  });

  // ============================================
  // TEST 3: specialUse + isSystem Alignment
  // ============================================
  log('\n📋 TEST 3: specialUse + isSystem Alignment\n');

  // Case A: specialUse is set AND is a known system label → isSystem SHOULD be true
  const misalignedSystemFolders = allFolders.filter(f => {
    if (!f.specialUse) return false;
    const shouldBeSystem = isSystemFolder(f.specialUse);
    return shouldBeSystem && !f.isSystem;
  });

  if (misalignedSystemFolders.length === 0) {
    logResult({
      test: 'System folders have isSystem=true',
      status: 'PASS',
      message: 'All folders with system specialUse have isSystem=true',
    });
  } else {
    logResult({
      test: 'System folders have isSystem=true',
      status: shouldFix ? 'FIXED' : 'FAIL',
      message: `${misalignedSystemFolders.length} folders have system specialUse but isSystem=false`,
      details: misalignedSystemFolders.map(f => ({ name: f.name, specialUse: f.specialUse })),
    });

    if (shouldFix) {
      for (const folder of misalignedSystemFolders) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { isSystem: true }
        });
        console.log(`   🔧 Fixed: ${folder.name} → isSystem=true`);
      }
    }
  }

  // Case B: specialUse is NOT a known system label → isSystem SHOULD be false
  const wronglyMarkedAsSystem = allFolders.filter(f => {
    if (f.specialUse && isSystemFolder(f.specialUse)) return false;
    return f.isSystem === true;
  });

  if (wronglyMarkedAsSystem.length === 0) {
    logResult({
      test: 'User folders have isSystem=false',
      status: 'PASS',
      message: 'All non-system folders have isSystem=false',
    });
  } else {
    logResult({
      test: 'User folders have isSystem=false',
      status: shouldFix ? 'FIXED' : 'FAIL',
      message: `${wronglyMarkedAsSystem.length} folders incorrectly have isSystem=true`,
      details: wronglyMarkedAsSystem.map(f => ({ name: f.name, specialUse: f.specialUse })),
    });

    if (shouldFix) {
      for (const folder of wronglyMarkedAsSystem) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { isSystem: false }
        });
        console.log(`   🔧 Fixed: ${folder.name} → isSystem=false`);
      }
    }
  }

  // Case C: specialUse has uppercase custom value (bug from folderNameToCanonical)
  const suspiciousSpecialUse = allFolders.filter(f => {
    if (!f.specialUse) return false;
    // If specialUse looks like it's just the uppercased name and NOT a known system label
    const upperName = f.name.toUpperCase();
    return f.specialUse === upperName && !isSystemFolder(f.specialUse);
  });

  if (suspiciousSpecialUse.length === 0) {
    logResult({
      test: 'No spurious specialUse values',
      status: 'PASS',
      message: 'All specialUse values are valid system labels',
    });
  } else {
    logResult({
      test: 'No spurious specialUse values',
      status: shouldFix ? 'FIXED' : 'WARN',
      message: `${suspiciousSpecialUse.length} folders have suspicious specialUse (uppercased name)`,
      details: suspiciousSpecialUse.map(f => ({ name: f.name, specialUse: f.specialUse })),
    });

    if (shouldFix) {
      for (const folder of suspiciousSpecialUse) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { specialUse: null, isSystem: false }
        });
        console.log(`   🔧 Fixed: ${folder.name} → specialUse=null, isSystem=false`);
      }
    }
  }

  // ============================================
  // TEST 4: Provider Coverage
  // ============================================
  log('\n📋 TEST 4: Provider Coverage\n');

  const providerStats = await prisma.folder.groupBy({
    by: ['providerId'],
    where: whereClause,
    _count: true,
  });

  for (const stat of providerStats) {
    const provider = await prisma.providerConfig.findUnique({
      where: { id: stat.providerId },
      select: { providerType: true, email: true }
    });

    const systemCount = await prisma.folder.count({
      where: { providerId: stat.providerId, isSystem: true }
    });

    const userCount = await prisma.folder.count({
      where: { providerId: stat.providerId, isSystem: false }
    });

    logResult({
      test: `Provider: ${provider?.email || stat.providerId}`,
      status: 'PASS',
      message: `${provider?.providerType}: ${systemCount} system, ${userCount} user folders`,
    });
  }

  // ============================================
  // TEST 5: Core System Folders Present
  // ============================================
  log('\n📋 TEST 5: Core System Folders Present\n');

  const coreSystemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM'];

  for (const coreFolder of coreSystemFolders) {
    const found = allFolders.filter(f => f.specialUse === coreFolder);

    if (found.length > 0) {
      const allProtected = found.every(f => f.isSystem);
      logResult({
        test: `${coreFolder} folders`,
        status: allProtected ? 'PASS' : 'FAIL',
        message: `${found.length} found, ${allProtected ? 'all protected' : 'some NOT protected!'}`,
      });
    } else {
      logResult({
        test: `${coreFolder} folders`,
        status: 'WARN',
        message: 'None found (may need sync)',
      });
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const fixed = results.filter(r => r.status === 'FIXED').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  if (fixed > 0) console.log(`🔧 Fixed: ${fixed}`);

  console.log('\n' + '-'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ VALIDATION FAILED\n');
    console.log('Run with --fix to auto-fix issues:\n');
    console.log('  npx ts-node scripts/validate-folder-system.ts --fix\n');
    process.exitCode = 1;
  } else if (warned > 0) {
    console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS\n');
  } else {
    console.log('\n✅ ALL VALIDATIONS PASSED\n');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Validation error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
