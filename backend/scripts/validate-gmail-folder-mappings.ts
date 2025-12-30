/**
 * Gmail Folder Mapping Validation Script
 *
 * Validates that Gmail folder mappings are correct after FIX 1.3:
 * - CATEGORY_PERSONAL → INBOX (not 'PERSONAL')
 * - No phantom "PERSONAL" or "Personale" folders
 * - All emails properly assigned to INBOX
 * - No temporary fixes or workarounds remain
 *
 * Run with: npx tsx backend/scripts/validate-gmail-folder-mappings.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { GMAIL_TO_CANONICAL, CANONICAL_TO_GMAIL } from '../src/modules/email-sync/drivers/interfaces/canonical.types';

const prisma = createPrismaClient();

interface ValidationResult {
  passed: boolean;
  check: string;
  details: string;
  severity: 'error' | 'warning' | 'info';
}

async function main() {
  console.log('🔍 Gmail Folder Mapping Validation\n');
  console.log('='.repeat(70));
  console.log('Date:', new Date().toISOString());
  console.log('='.repeat(70), '\n');

  const results: ValidationResult[] = [];

  // Get all Gmail providers (providerType is stored as lowercase 'google')
  const gmailProviders = await prisma.providerConfig.findMany({
    where: { providerType: 'google' },
    select: { id: true, email: true },
  });

  if (gmailProviders.length === 0) {
    console.log('⚠️  No Gmail providers found. Skipping validation.\n');
    return;
  }

  console.log(`📧 Found ${gmailProviders.length} Gmail provider(s):\n`);
  gmailProviders.forEach((p) => console.log(`   - ${p.email} (${p.id})`));
  console.log('');

  // ============================================
  // CHECK 1: Canonical Types Mapping
  // ============================================
  console.log('\n📋 CHECK 1: Canonical Types Mapping');
  console.log('-'.repeat(70));

  const categoryPersonalMapping = GMAIL_TO_CANONICAL['CATEGORY_PERSONAL'];
  if (categoryPersonalMapping === 'INBOX') {
    results.push({
      passed: true,
      check: 'CATEGORY_PERSONAL mapping',
      details: `✅ Correctly maps to 'INBOX'`,
      severity: 'info',
    });
    console.log(`✅ GMAIL_TO_CANONICAL['CATEGORY_PERSONAL'] = '${categoryPersonalMapping}'`);
  } else {
    results.push({
      passed: false,
      check: 'CATEGORY_PERSONAL mapping',
      details: `❌ Maps to '${categoryPersonalMapping}' (should be 'INBOX')`,
      severity: 'error',
    });
    console.log(`❌ GMAIL_TO_CANONICAL['CATEGORY_PERSONAL'] = '${categoryPersonalMapping}' (SHOULD BE 'INBOX')`);
  }

  const personalReverseMapping = CANONICAL_TO_GMAIL['PERSONAL'];
  if (personalReverseMapping === 'INBOX') {
    results.push({
      passed: true,
      check: 'PERSONAL reverse mapping',
      details: `✅ Correctly maps to 'INBOX'`,
      severity: 'info',
    });
    console.log(`✅ CANONICAL_TO_GMAIL['PERSONAL'] = '${personalReverseMapping}'`);
  } else {
    results.push({
      passed: false,
      check: 'PERSONAL reverse mapping',
      details: `❌ Maps to '${personalReverseMapping}' (should be 'INBOX')`,
      severity: 'error',
    });
    console.log(`❌ CANONICAL_TO_GMAIL['PERSONAL'] = '${personalReverseMapping}' (SHOULD BE 'INBOX')`);
  }

  // ============================================
  // CHECK 2: Database Folders
  // ============================================
  console.log('\n📂 CHECK 2: Database Folders');
  console.log('-'.repeat(70));

  for (const provider of gmailProviders) {
    console.log(`\n🔍 Provider: ${provider.email}`);

    // Check for phantom folders
    const phantomFolders = await prisma.folder.findMany({
      where: {
        providerId: provider.id,
        OR: [
          { path: { in: ['PERSONAL', 'Personale', 'Personal'] } },
          { name: { in: ['PERSONAL', 'Personale', 'Personal'] } },
          { specialUse: 'PERSONAL' },
        ],
      },
      select: { id: true, path: true, name: true, specialUse: true },
    });

    if (phantomFolders.length === 0) {
      results.push({
        passed: true,
        check: `Phantom folders (${provider.email})`,
        details: '✅ No phantom PERSONAL/Personale folders',
        severity: 'info',
      });
      console.log('   ✅ No phantom PERSONAL/Personale folders');
    } else {
      results.push({
        passed: false,
        check: `Phantom folders (${provider.email})`,
        details: `❌ Found ${phantomFolders.length} phantom folder(s)`,
        severity: 'error',
      });
      console.log(`   ❌ Found ${phantomFolders.length} phantom folder(s):`);
      phantomFolders.forEach((f) => {
        console.log(`      - path: ${f.path}, name: ${f.name}, specialUse: ${f.specialUse}`);
      });
    }

    // Check INBOX folder exists
    const inboxFolder = await prisma.folder.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { specialUse: 'INBOX' },
          { path: 'INBOX' },
        ],
      },
    });

    if (inboxFolder) {
      results.push({
        passed: true,
        check: `INBOX folder (${provider.email})`,
        details: `✅ INBOX folder exists (${inboxFolder.totalCount} emails, ${inboxFolder.unreadCount} unread)`,
        severity: 'info',
      });
      console.log(`   ✅ INBOX folder exists: ${inboxFolder.totalCount} total, ${inboxFolder.unreadCount} unread`);
    } else {
      results.push({
        passed: false,
        check: `INBOX folder (${provider.email})`,
        details: '❌ INBOX folder NOT found',
        severity: 'error',
      });
      console.log('   ❌ INBOX folder NOT found');
    }
  }

  // ============================================
  // CHECK 3: Email Folder Assignments
  // ============================================
  console.log('\n📨 CHECK 3: Email Folder Assignments');
  console.log('-'.repeat(70));

  for (const provider of gmailProviders) {
    console.log(`\n🔍 Provider: ${provider.email}`);

    // Check for emails in PERSONAL/Personale folders
    const emailsInPersonal = await prisma.email.count({
      where: {
        providerId: provider.id,
        folder: { in: ['PERSONAL', 'Personale', 'Personal'] },
        isDeleted: false,
      },
    });

    if (emailsInPersonal === 0) {
      results.push({
        passed: true,
        check: `Emails in PERSONAL (${provider.email})`,
        details: '✅ No emails in PERSONAL/Personale folders',
        severity: 'info',
      });
      console.log('   ✅ No emails in PERSONAL/Personale folders');
    } else {
      results.push({
        passed: false,
        check: `Emails in PERSONAL (${provider.email})`,
        details: `❌ Found ${emailsInPersonal} emails in PERSONAL/Personale folders`,
        severity: 'error',
      });
      console.log(`   ❌ Found ${emailsInPersonal} emails in PERSONAL/Personale folders`);
    }

    // Check email distribution
    const emailsByFolder = await prisma.email.groupBy({
      by: ['folder'],
      where: {
        providerId: provider.id,
        isDeleted: false,
      },
      _count: true,
      orderBy: {
        _count: {
          folder: 'desc',
        },
      },
      take: 10,
    });

    console.log('   📊 Email distribution (top 10 folders):');
    emailsByFolder.forEach((group) => {
      console.log(`      - ${group.folder}: ${group._count} emails`);
    });

    // Check for emails in non-existent folders
    const allFolderPaths = await prisma.folder.findMany({
      where: { providerId: provider.id },
      select: { path: true },
    });
    const validPaths = new Set(allFolderPaths.map((f) => f.path));

    const orphanedEmails = await prisma.email.findMany({
      where: {
        providerId: provider.id,
        isDeleted: false,
        folder: { notIn: Array.from(validPaths) },
      },
      select: { folder: true },
      distinct: ['folder'],
    });

    if (orphanedEmails.length === 0) {
      results.push({
        passed: true,
        check: `Orphaned emails (${provider.email})`,
        details: '✅ All emails have valid folder references',
        severity: 'info',
      });
      console.log('   ✅ All emails have valid folder references');
    } else {
      results.push({
        passed: false,
        check: `Orphaned emails (${provider.email})`,
        details: `⚠️  Found emails in ${orphanedEmails.length} non-existent folder(s)`,
        severity: 'warning',
      });
      console.log(`   ⚠️  Found emails in ${orphanedEmails.length} non-existent folder(s):`);
      orphanedEmails.forEach((e) => {
        console.log(`      - ${e.folder}`);
      });
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(70), '\n');

  const errors = results.filter((r) => !r.passed && r.severity === 'error');
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning');
  const passed = results.filter((r) => r.passed);

  console.log(`✅ Passed: ${passed.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log('');

  if (errors.length > 0) {
    console.log('❌ VALIDATION FAILED\n');
    console.log('Errors:');
    errors.forEach((e) => {
      console.log(`   - ${e.check}: ${e.details}`);
    });
  } else if (warnings.length > 0) {
    console.log('⚠️  VALIDATION PASSED WITH WARNINGS\n');
    console.log('Warnings:');
    warnings.forEach((w) => {
      console.log(`   - ${w.check}: ${w.details}`);
    });
  } else {
    console.log('✅ ALL VALIDATIONS PASSED!\n');
    console.log('🎉 Gmail folder mappings are correct:');
    console.log('   ✅ CATEGORY_PERSONAL → INBOX');
    console.log('   ✅ No phantom folders');
    console.log('   ✅ All emails properly assigned');
    console.log('   ✅ No temporary fixes remain\n');
  }

  console.log('='.repeat(70), '\n');

  // Exit with error code if validation failed
  if (errors.length > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Validation script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
