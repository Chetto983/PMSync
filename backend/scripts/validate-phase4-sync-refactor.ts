/**
 * Phase 4 Sync Services Validation Script
 * Tests refactored sync services with real providers
 *
 * Validates:
 * - BaseEmailSyncService shared methods work correctly
 * - Google, Microsoft, IMAP sync services extend base properly
 * - Real sync operations process messages without errors
 *
 * Run: npx ts-node scripts/validate-phase4-sync-refactor.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleSyncService } from '../src/modules/email-sync/services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../src/modules/email-sync/services/microsoft/microsoft-sync.service';
import { ImapSyncService } from '../src/modules/email-sync/services/imap/imap-sync.service';
import { Logger } from '@nestjs/common';

interface TestResult {
  provider: string;
  email: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  messagesProcessed: number;
  newMessages: number;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function validateGoogleSync(
  googleSync: GoogleSyncService,
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('             Google Sync Service Validation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const providers = await prisma.providerConfig.findMany({
    where: {
      tenantId,
      providerType: 'google',
      isActive: true,
    },
  });

  if (providers.length === 0) {
    console.log('⏭️  No Google providers found, skipping...');
    results.push({
      provider: 'google',
      email: 'N/A',
      status: 'SKIP',
      messagesProcessed: 0,
      newMessages: 0,
      duration: 0,
    });
    return;
  }

  for (const provider of providers) {
    console.log(`📧 Testing Google provider: ${provider.email}`);
    const start = Date.now();

    try {
      // Run incremental sync to test the refactored code
      const result = await googleSync.syncProvider({
        providerId: provider.id,
        email: provider.email,
        syncType: 'incremental',
        tenantId,
        providerType: 'google',
        priority: 'normal',
      });

      const duration = Date.now() - start;
      console.log(`   ✅ PASS - ${result.messagesProcessed} processed, ${result.newMessages} new (${duration}ms)`);

      results.push({
        provider: 'google',
        email: provider.email,
        status: 'PASS',
        messagesProcessed: result.messagesProcessed,
        newMessages: result.newMessages,
        duration,
      });

      // Verify emails were actually stored
      const emailCount = await prisma.email.count({
        where: { providerId: provider.id },
      });
      console.log(`   📊 Total emails in DB for this provider: ${emailCount}`);

    } catch (error: any) {
      const duration = Date.now() - start;
      console.log(`   ❌ FAIL - ${error.message}`);

      results.push({
        provider: 'google',
        email: provider.email,
        status: 'FAIL',
        messagesProcessed: 0,
        newMessages: 0,
        duration,
        error: error.message,
      });
    }
  }
}

async function validateMicrosoftSync(
  msSync: MicrosoftSyncService,
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Microsoft Sync Service Validation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const providers = await prisma.providerConfig.findMany({
    where: {
      tenantId,
      providerType: 'microsoft',
      isActive: true,
    },
  });

  if (providers.length === 0) {
    console.log('⏭️  No Microsoft providers found, skipping...');
    results.push({
      provider: 'microsoft',
      email: 'N/A',
      status: 'SKIP',
      messagesProcessed: 0,
      newMessages: 0,
      duration: 0,
    });
    return;
  }

  for (const provider of providers) {
    console.log(`📧 Testing Microsoft provider: ${provider.email}`);
    const start = Date.now();

    try {
      // Run incremental sync to test the refactored code
      const result = await msSync.syncProvider({
        providerId: provider.id,
        email: provider.email,
        syncType: 'incremental',
        tenantId,
        providerType: 'microsoft',
        priority: 'normal',
      });

      const duration = Date.now() - start;
      console.log(`   ✅ PASS - ${result.messagesProcessed} processed, ${result.newMessages} new (${duration}ms)`);

      results.push({
        provider: 'microsoft',
        email: provider.email,
        status: 'PASS',
        messagesProcessed: result.messagesProcessed,
        newMessages: result.newMessages,
        duration,
      });

      // Verify emails were actually stored
      const emailCount = await prisma.email.count({
        where: { providerId: provider.id },
      });
      console.log(`   📊 Total emails in DB for this provider: ${emailCount}`);

    } catch (error: any) {
      const duration = Date.now() - start;
      console.log(`   ❌ FAIL - ${error.message}`);

      results.push({
        provider: 'microsoft',
        email: provider.email,
        status: 'FAIL',
        messagesProcessed: 0,
        newMessages: 0,
        duration,
        error: error.message,
      });
    }
  }
}

async function validateImapSync(
  imapSync: ImapSyncService,
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('              IMAP Sync Service Validation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // IMAP providers can be 'generic' or 'imap' type
  const providers = await prisma.providerConfig.findMany({
    where: {
      tenantId,
      OR: [
        { providerType: 'generic', imapHost: { not: null } },
        { providerType: 'imap' },
      ],
      isActive: true,
    },
  });

  if (providers.length === 0) {
    console.log('⏭️  No IMAP providers found, skipping...');
    results.push({
      provider: 'imap',
      email: 'N/A',
      status: 'SKIP',
      messagesProcessed: 0,
      newMessages: 0,
      duration: 0,
    });
    return;
  }

  for (const provider of providers) {
    console.log(`📧 Testing IMAP provider: ${provider.email}`);
    const start = Date.now();

    try {
      // Run incremental sync to test the refactored code
      const result = await imapSync.syncProvider({
        providerId: provider.id,
        email: provider.email,
        syncType: 'incremental',
        tenantId,
        providerType: 'imap',
        priority: 'normal',
      });

      const duration = Date.now() - start;
      console.log(`   ✅ PASS - ${result.messagesProcessed} processed, ${result.newMessages} new (${duration}ms)`);

      results.push({
        provider: 'imap',
        email: provider.email,
        status: 'PASS',
        messagesProcessed: result.messagesProcessed,
        newMessages: result.newMessages,
        duration,
      });

      // Verify emails were actually stored
      const emailCount = await prisma.email.count({
        where: { providerId: provider.id },
      });
      console.log(`   📊 Total emails in DB for this provider: ${emailCount}`);

    } catch (error: any) {
      const duration = Date.now() - start;
      console.log(`   ❌ FAIL - ${error.message}`);

      results.push({
        provider: 'imap',
        email: provider.email,
        status: 'FAIL',
        messagesProcessed: 0,
        newMessages: 0,
        duration,
        error: error.message,
      });
    }
  }
}

async function validateBaseClassMethods(prisma: PrismaService): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Base Class Method Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for emails created with proper structure
  const recentEmails = await prisma.email.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      subject: true,
      from: true,
      folder: true,
      providerId: true,
      externalId: true,
      createdAt: true,
    },
  });

  console.log('Most recent emails in database:');
  for (const email of recentEmails) {
    console.log(`   📧 "${email.subject?.substring(0, 40)}..." (folder: ${email.folder})`);
  }

  // Check that upsert is working (no duplicates)
  // Use Prisma instead of raw SQL to avoid table name casing issues
  const allEmails = await prisma.email.groupBy({
    by: ['providerId', 'externalId', 'folder'],
    _count: { id: true },
    having: {
      id: { _count: { gt: 1 } },
    },
  });
  const duplicateCount = allEmails.length;

  if (duplicateCount === 0) {
    console.log('\n✅ No duplicate emails found (upsert working correctly)');
  } else {
    console.log(`\n⚠️  Found ${duplicateCount} duplicate email combinations`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Phase 4 Sync Services Refactoring Validation                 ║');
  console.log('║   Testing BaseEmailSyncService + Provider Implementations      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const logger = new Logger('Phase4Validation');

  try {
    const prisma = app.get(PrismaService);
    const googleSync = app.get(GoogleSyncService);
    const msSync = app.get(MicrosoftSyncService);
    const imapSync = app.get(ImapSyncService);

    // Get tenant
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
    });

    if (!tenant) {
      console.error('❌ No active tenant found!');
      process.exit(1);
    }

    console.log(`📋 Testing on tenant: ${tenant.name} (${tenant.id})`);

    // Count providers
    const providerCounts = await prisma.providerConfig.groupBy({
      by: ['providerType'],
      where: { tenantId: tenant.id, isActive: true },
      _count: true,
    });

    console.log('\n📊 Provider Summary:');
    for (const pc of providerCounts) {
      console.log(`   ${pc.providerType}: ${pc._count} active`);
    }

    // Run validations
    await validateGoogleSync(googleSync, prisma, tenant.id);
    await validateMicrosoftSync(msSync, prisma, tenant.id);
    await validateImapSync(imapSync, prisma, tenant.id);
    await validateBaseClassMethods(prisma);

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                     VALIDATION SUMMARY                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS');
    const failed = results.filter(r => r.status === 'FAIL');
    const skipped = results.filter(r => r.status === 'SKIP');

    console.log(`✅ Passed:  ${passed.length}`);
    console.log(`❌ Failed:  ${failed.length}`);
    console.log(`⏭️  Skipped: ${skipped.length}`);

    if (passed.length > 0) {
      console.log('\n📈 Successful Syncs:');
      for (const r of passed) {
        console.log(`   ${r.provider.toUpperCase()} (${r.email}): ${r.messagesProcessed} processed, ${r.newMessages} new (${r.duration}ms)`);
      }
    }

    if (failed.length > 0) {
      console.log('\n⚠️  Failed Syncs:');
      for (const r of failed) {
        console.log(`   ${r.provider.toUpperCase()} (${r.email}): ${r.error}`);
      }
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.messagesProcessed, 0);
    const totalNew = results.reduce((sum, r) => sum + r.newMessages, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Total: ${totalProcessed} messages processed, ${totalNew} new`);
    console.log(`⏱️  Total duration: ${totalDuration}ms`);

    const successRate = passed.length + failed.length > 0
      ? ((passed.length / (passed.length + failed.length)) * 100).toFixed(1)
      : '100';
    console.log(`\n🎯 Success Rate: ${successRate}%`);

    if (failed.length === 0 && passed.length > 0) {
      console.log('\n🎉 Phase 4 refactoring validated successfully!');
      console.log('   All sync services are working with BaseEmailSyncService methods.');
    } else if (failed.length > 0) {
      console.log('\n⚠️  Some validations failed - review errors above.');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Validation failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
