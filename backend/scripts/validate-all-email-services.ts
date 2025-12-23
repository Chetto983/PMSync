/**
 * Comprehensive Email Services Validation Script
 * Tests all email module functionality with real providers
 *
 * Run: npx ts-node scripts/validate-all-email-services.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailSyncBackService } from '../src/modules/email/services/email-sync-back.service';
import { QueueService } from '../src/modules/email-sync/services/queue.service';
import { Logger } from '@nestjs/common';

interface TestResult {
  category: string;
  test: string;
  provider?: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(category: string, test: string, status: 'PASS' | 'FAIL' | 'SKIP', details: string, provider?: string, duration?: number) {
  results.push({ category, test, provider, status, details, duration });
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  const providerStr = provider ? ` [${provider}]` : '';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${emoji}${providerStr} ${test}: ${details}${durationStr}`);
}

async function testSyncBackService(syncBackService: EmailSyncBackService, prisma: PrismaService, tenantId: string) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           EmailSyncBackService Validation Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test validation errors
  console.log('>>> Validation Tests');

  // Test empty externalId
  const start1 = Date.now();
  try {
    await syncBackService.syncOperationToProvider({
      emailId: 'test-email-id',
      externalId: '',
      providerId: 'fake-provider',
      tenantId,
      operation: 'markRead',
    });
    log('SyncBack', 'Empty externalId rejected', 'FAIL', 'Should have thrown error');
  } catch (err: any) {
    if (err.message.includes('Invalid externalId') || err.message.includes('empty')) {
      log('SyncBack', 'Empty externalId rejected', 'PASS', 'Validation works', undefined, Date.now() - start1);
    } else {
      log('SyncBack', 'Empty externalId rejected', 'FAIL', err.message);
    }
  }

  // Test missing providerId
  const start2 = Date.now();
  try {
    await syncBackService.syncOperationToProvider({
      emailId: 'test-email-id',
      externalId: 'valid-external-id',
      providerId: '',
      tenantId,
      operation: 'markRead',
    });
    log('SyncBack', 'Missing providerId rejected', 'FAIL', 'Should have thrown error');
  } catch (err: any) {
    if (err.message.includes('Missing providerId') || err.message.includes('providerId')) {
      log('SyncBack', 'Missing providerId rejected', 'PASS', 'Validation works', undefined, Date.now() - start2);
    } else {
      log('SyncBack', 'Missing providerId rejected', 'FAIL', err.message);
    }
  }

  // Test provider not found
  const start3 = Date.now();
  try {
    await syncBackService.syncOperationToProvider({
      emailId: 'test-email-id',
      externalId: 'valid-external-id',
      providerId: 'non-existent-provider-id',
      tenantId,
      operation: 'markRead',
    });
    log('SyncBack', 'Non-existent provider rejected', 'FAIL', 'Should have thrown error');
  } catch (err: any) {
    if (err.message.includes('Provider not found')) {
      log('SyncBack', 'Non-existent provider rejected', 'PASS', 'Clear error message', undefined, Date.now() - start3);
    } else {
      log('SyncBack', 'Non-existent provider rejected', 'FAIL', err.message);
    }
  }
}

async function testProviderOperations(
  syncBackService: EmailSyncBackService,
  prisma: PrismaService,
  tenantId: string,
  providers: any[]
) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Live Provider Operations Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const provider of providers) {
    const providerType = provider.providerType?.toUpperCase() || 'UNKNOWN';
    console.log(`\n>>> Testing ${providerType} provider: ${provider.email}`);

    // Find a test email for this provider
    const testEmail = await prisma.email.findFirst({
      where: {
        providerId: provider.id,
        externalId: { not: '' },
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        subject: true,
        isRead: true,
        isStarred: true,
      },
    });

    if (!testEmail || !testEmail.externalId) {
      log('LiveTest', 'Provider has emails', 'SKIP', 'No emails with externalId found', providerType);
      continue;
    }

    console.log(`   Testing with: "${testEmail.subject?.substring(0, 40)}..."`);

    // Test mark read/unread operation
    const originalReadStatus = testEmail.isRead;
    const targetReadStatus = !originalReadStatus;

    const start1 = Date.now();
    try {
      await syncBackService.syncOperationToProvider({
        emailId: testEmail.id,
        externalId: testEmail.externalId,
        providerId: provider.id,
        tenantId,
        operation: targetReadStatus ? 'markRead' : 'markUnread',
      });
      log('LiveTest', 'Mark read/unread', 'PASS', `Changed to ${targetReadStatus ? 'read' : 'unread'}`, providerType, Date.now() - start1);

      // Revert
      const start2 = Date.now();
      await syncBackService.syncOperationToProvider({
        emailId: testEmail.id,
        externalId: testEmail.externalId,
        providerId: provider.id,
        tenantId,
        operation: originalReadStatus ? 'markRead' : 'markUnread',
      });
      log('LiveTest', 'Revert read status', 'PASS', 'Reverted successfully', providerType, Date.now() - start2);
    } catch (err: any) {
      log('LiveTest', 'Mark read/unread', 'FAIL', err.message, providerType);
    }

    // Test star/unstar operation
    const originalStarred = testEmail.isStarred;
    const start3 = Date.now();
    try {
      await syncBackService.syncOperationToProvider({
        emailId: testEmail.id,
        externalId: testEmail.externalId,
        providerId: provider.id,
        tenantId,
        operation: originalStarred ? 'unstar' : 'star',
      });
      log('LiveTest', 'Star/unstar', 'PASS', `Changed to ${originalStarred ? 'unstarred' : 'starred'}`, providerType, Date.now() - start3);

      // Revert
      const start4 = Date.now();
      await syncBackService.syncOperationToProvider({
        emailId: testEmail.id,
        externalId: testEmail.externalId,
        providerId: provider.id,
        tenantId,
        operation: originalStarred ? 'star' : 'unstar',
      });
      log('LiveTest', 'Revert star status', 'PASS', 'Reverted successfully', providerType, Date.now() - start4);
    } catch (err: any) {
      log('LiveTest', 'Star/unstar', 'FAIL', err.message, providerType);
    }
  }
}

async function testFolderResolution(prisma: PrismaService, providers: any[]) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Folder Localization Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const provider of providers) {
    const providerType = provider.providerType?.toUpperCase() || 'UNKNOWN';

    // Find trash folder
    const trashFolder = await prisma.folder.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { specialUse: { in: ['TRASH', 'trash'] } },
          { name: { contains: 'trash', mode: 'insensitive' } },
          { name: { contains: 'elimin', mode: 'insensitive' } }, // Italian
          { name: { contains: 'Cestino', mode: 'insensitive' } }, // Italian
          { name: { contains: 'deleted', mode: 'insensitive' } },
        ],
      },
    });

    if (trashFolder) {
      log('Folders', 'TRASH folder found', 'PASS', `${trashFolder.name} (path: ${trashFolder.path})`, providerType);
    } else {
      log('Folders', 'TRASH folder found', 'SKIP', 'No trash folder synced', providerType);
    }

    // Find sent folder
    const sentFolder = await prisma.folder.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { specialUse: { in: ['SENT', 'sent'] } },
          { name: { contains: 'sent', mode: 'insensitive' } },
          { name: { contains: 'inviat', mode: 'insensitive' } }, // Italian
        ],
      },
    });

    if (sentFolder) {
      log('Folders', 'SENT folder found', 'PASS', `${sentFolder.name} (path: ${sentFolder.path})`, providerType);
    } else {
      log('Folders', 'SENT folder found', 'SKIP', 'No sent folder synced', providerType);
    }
  }
}

async function testQueueService(queueService: QueueService) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Queue Service Tests');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get health summary
  try {
    const health = await queueService.getHealthSummary();
    log('Queue', 'Get health summary', 'PASS', `redis=${health.redisConnected ? 'connected' : 'disconnected'}, queues=${health.queues?.length || 0}`);
    console.log(`   Redis status: ${health.redisStatus}`);
    if (health.metrics) {
      for (const m of health.metrics) {
        console.log(`   ${m.queue}: completed=${m.completed}, failed=${m.failed}, avgDuration=${m.averageDurationMs}ms`);
      }
    }
  } catch (err: any) {
    log('Queue', 'Get health summary', 'FAIL', err.message);
  }

  // Get queue status
  try {
    const status = await queueService.getQueueStatus();
    log('Queue', 'Get status', 'PASS', `${status.length} statuses`);
  } catch (err: any) {
    log('Queue', 'Get status', 'FAIL', err.message);
  }
}

async function testCodePatterns() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Code Pattern Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const fs = require('fs');
  const path = require('path');

  // Check email-sync-back.service.ts
  const syncBackPath = path.join(__dirname, '../src/modules/email/services/email-sync-back.service.ts');
  const syncBackCode = fs.readFileSync(syncBackPath, 'utf-8');

  // Check patterns
  const patterns = [
    { name: 'Gmail delete separated', check: syncBackCode.includes("case 'delete':") && syncBackCode.includes("deleteLabelsToRemove") },
    { name: 'Gmail moveToFolder removes labels', check: syncBackCode.includes("labelsToRemove") && syncBackCode.includes("removeLabelIds") },
    { name: 'Token refresh error handling', check: syncBackCode.includes("catch (refreshError)") },
    { name: 'MS batch response validation', check: syncBackCode.includes("res.status >= 400") && syncBackCode.includes("batch operation failed") },
    { name: 'Timeout protection', check: syncBackCode.includes("OPERATION_TIMEOUT_MS") && syncBackCode.includes("withTimeout") },
    { name: 'IMAP connection cleanup', check: syncBackCode.includes("let client: ImapFlow | null = null") && syncBackCode.includes("await client.logout()") },
    { name: 'ExternalId validation', check: syncBackCode.includes("Invalid externalId") },
    { name: 'Provider not found error', check: syncBackCode.includes("Provider not found") },
  ];

  for (const pattern of patterns) {
    if (pattern.check) {
      log('CodePattern', pattern.name, 'PASS', 'Pattern found in code');
    } else {
      log('CodePattern', pattern.name, 'FAIL', 'Pattern NOT found');
    }
  }

  // Check attachment-on-demand.service.ts for IMAP UID parsing
  const attachmentPath = path.join(__dirname, '../src/modules/email/services/attachment-on-demand.service.ts');
  const attachmentCode = fs.readFileSync(attachmentPath, 'utf-8');

  if (attachmentCode.includes("rawUid.includes(':')") && attachmentCode.includes("rawUid.split(':').pop()")) {
    log('CodePattern', 'IMAP UID parsing in attachment service', 'PASS', 'Handles folder:uid format');
  } else {
    log('CodePattern', 'IMAP UID parsing in attachment service', 'FAIL', 'Missing folder:uid parsing');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Comprehensive Email Services Validation - All Providers      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const logger = new Logger('EmailServicesTest');
  const prisma = app.get(PrismaService);
  const syncBackService = app.get(EmailSyncBackService);
  const queueService = app.get(QueueService);

  try {
    // Get tenant with providers
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
    });

    if (!tenant) {
      console.error('No active tenant found!');
      process.exit(1);
    }

    const providers = await prisma.providerConfig.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
      },
    });

    console.log(`📋 Testing on tenant: ${tenant.id} (${tenant.name})`);
    console.log(`📧 Found ${providers.length} active providers:`);
    providers.forEach((p: any) => {
      console.log(`   - ${p.providerType?.toUpperCase()}: ${p.email}`);
    });

    // Run all tests
    await testSyncBackService(syncBackService, prisma, tenant.id);
    await testProviderOperations(syncBackService, prisma, tenant.id, providers);
    await testFolderResolution(prisma, providers);
    await testQueueService(queueService);
    await testCodePatterns();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;

    console.log(`✅ Passed:  ${passed}`);
    console.log(`❌ Failed:  ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Total:   ${results.length}`);

    if (failed > 0) {
      console.log('\n⚠️  FAILED TESTS:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`   [${r.category}] ${r.test}: ${r.details}`);
      });
    }

    const successRate = passed + failed > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : '100';
    console.log(`\n🎯 Success Rate: ${successRate}%`);

    if (failed === 0) {
      console.log('\n🎉 All tests validated successfully!');
    }

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
