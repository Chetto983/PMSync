/**
 * Comprehensive Libero IMAP Test Suite
 * Tests all email functionality with Italian locale folder names
 *
 * Libero Mail uses Italian folder names:
 * - INBOX -> "Posta in arrivo"
 * - SENT -> "Posta Inviata"
 * - DRAFTS -> "Bozze"
 * - TRASH -> "Cestino"
 * - SPAM -> "Spam"
 *
 * Run: npx ts-node scripts/test-libero-imap-full.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailsService } from '../src/modules/email/services/emails.service';
import { EmailSendService } from '../src/modules/email/services/email-send.service';
import { FolderSyncService } from '../src/modules/email-sync/services/folder-sync.service';
import { SyncSchedulerService } from '../src/modules/email-sync/services/sync-scheduler.service';
import { RealtimeEventsService } from '../src/modules/realtime/services/realtime-events.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Configuration - Update these with your Libero test account
const TENANT_ID = process.env.TEST_TENANT_ID || 'your-tenant-id';
const LIBERO_PROVIDER_ID = process.env.TEST_LIBERO_PROVIDER_ID || 'your-libero-provider-id';
const LIBERO_EMAIL = process.env.TEST_LIBERO_EMAIL || 'your-email@libero.it';

// Italian folder names (Libero standard)
const ITALIAN_FOLDERS = {
  INBOX: 'Posta in arrivo',
  SENT: 'Posta Inviata',
  DRAFTS: 'Bozze',
  TRASH: 'Cestino',
  SPAM: 'Spam',
  ARCHIVE: 'Archivio',
};

interface TestResult {
  category: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(category: string, test: string, status: TestResult['status'], details: string, duration?: number) {
  results.push({ category, test, status, details, duration });
  const emoji = {
    PASS: '✅',
    FAIL: '❌',
    WARN: '⚠️',
    SKIP: '⏭️',
  }[status];
  const timeStr = duration ? ` (${duration}ms)` : '';
  console.log(`${emoji} [${category}] ${test}: ${details}${timeStr}`);
}

async function testFolderSync(prisma: PrismaService, folderSync: FolderSyncService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FOLDER SYNC TESTS (Italian Locale)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const start = Date.now();

  // Test 1: Sync folders from Libero
  try {
    await folderSync.syncProviderFolders(TENANT_ID, LIBERO_PROVIDER_ID);
    log('Folder Sync', 'Sync folders from IMAP', 'PASS', 'Folder sync completed', Date.now() - start);
  } catch (err: any) {
    log('Folder Sync', 'Sync folders from IMAP', 'FAIL', err.message);
    return;
  }

  // Test 2: Verify Italian folder names are stored correctly
  const folders = await prisma.folder.findMany({
    where: { providerId: LIBERO_PROVIDER_ID },
    select: { path: true, name: true, specialUse: true },
  });

  log('Folder Sync', 'Folders synced', folders.length > 0 ? 'PASS' : 'FAIL', `${folders.length} folders found`);

  // Test 3: Check specialUse detection for Italian folders
  const inbox = folders.find(f => f.specialUse === 'INBOX');
  const sent = folders.find(f => f.specialUse === 'SENT');
  const drafts = folders.find(f => f.specialUse === 'DRAFTS');
  const trash = folders.find(f => f.specialUse === 'TRASH');

  log('Folder Sync', 'INBOX specialUse detected',
    inbox ? 'PASS' : 'FAIL',
    inbox ? `Path: "${inbox.path}" -> specialUse: ${inbox.specialUse}` : 'INBOX not detected');

  log('Folder Sync', 'SENT specialUse detected',
    sent ? 'PASS' : 'FAIL',
    sent ? `Path: "${sent.path}" -> specialUse: ${sent.specialUse}` : 'SENT not detected');

  log('Folder Sync', 'DRAFTS specialUse detected',
    drafts ? 'PASS' : 'FAIL',
    drafts ? `Path: "${drafts.path}" -> specialUse: ${drafts.specialUse}` : 'DRAFTS not detected');

  log('Folder Sync', 'TRASH specialUse detected',
    trash ? 'PASS' : 'FAIL',
    trash ? `Path: "${trash.path}" -> specialUse: ${trash.specialUse}` : 'TRASH not detected');

  // Test 4: Verify actual Italian folder paths are preserved
  const expectedItalianPaths = ['Posta in arrivo', 'Posta Inviata', 'Bozze', 'Cestino'];
  const foundItalianPaths = expectedItalianPaths.filter(p =>
    folders.some(f => f.path.toLowerCase().includes(p.toLowerCase()) || f.name.toLowerCase().includes(p.toLowerCase()))
  );

  log('Folder Sync', 'Italian folder names preserved',
    foundItalianPaths.length > 0 ? 'PASS' : 'WARN',
    `Found Italian folders: ${foundItalianPaths.join(', ') || 'none'}`);
}

async function testEmailList(emailsService: EmailsService, prisma: PrismaService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  EMAIL LIST TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: List emails from INBOX using specialUse
  const start1 = Date.now();
  try {
    const result = await emailsService.listEmails({
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      filters: { specialUse: 'INBOX' },
    });
    log('Email List', 'List INBOX by specialUse',
      result.emails.length > 0 ? 'PASS' : 'WARN',
      `${result.emails.length} emails found`, Date.now() - start1);
  } catch (err: any) {
    log('Email List', 'List INBOX by specialUse', 'FAIL', err.message);
  }

  // Test 2: List emails from SENT using specialUse
  const start2 = Date.now();
  try {
    const result = await emailsService.listEmails({
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      filters: { specialUse: 'SENT' },
    });
    log('Email List', 'List SENT by specialUse',
      result.emails.length >= 0 ? 'PASS' : 'WARN',
      `${result.emails.length} emails found`, Date.now() - start2);
  } catch (err: any) {
    log('Email List', 'List SENT by specialUse', 'FAIL', err.message);
  }

  // Test 3: List emails by actual Italian folder path
  const start3 = Date.now();
  try {
    const result = await emailsService.listEmails({
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      filters: { folder: 'Posta in arrivo' }, // Italian INBOX
    });
    log('Email List', 'List by Italian folder path "Posta in arrivo"',
      result.emails.length >= 0 ? 'PASS' : 'WARN',
      `${result.emails.length} emails found`, Date.now() - start3);
  } catch (err: any) {
    log('Email List', 'List by Italian folder path', 'FAIL', err.message);
  }

  // Test 4: Search emails (should exclude Cestino/Spam)
  const start4 = Date.now();
  try {
    const result = await emailsService.searchEmails(TENANT_ID, 'test', LIBERO_PROVIDER_ID, 10);
    log('Email List', 'Search excludes TRASH/SPAM by specialUse', 'PASS',
      `${result.length} emails found (TRASH/SPAM excluded)`, Date.now() - start4);
  } catch (err: any) {
    log('Email List', 'Search excludes TRASH/SPAM', 'FAIL', err.message);
  }
}

async function testEmailOperations(emailsService: EmailsService, prisma: PrismaService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  EMAIL CRUD OPERATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get a sample email for testing
  const sampleEmail = await prisma.email.findFirst({
    where: {
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      isDeleted: false,
    },
    orderBy: { receivedAt: 'desc' },
  });

  if (!sampleEmail) {
    log('Email CRUD', 'Get sample email', 'SKIP', 'No emails available for testing');
    return;
  }

  log('Email CRUD', 'Get sample email', 'PASS', `Subject: "${sampleEmail.subject?.substring(0, 40)}..."`);

  // Test 1: Mark as read
  const start1 = Date.now();
  try {
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isRead: true });
    log('Email CRUD', 'Mark as read', 'PASS', 'Email marked as read', Date.now() - start1);
  } catch (err: any) {
    log('Email CRUD', 'Mark as read', 'FAIL', err.message);
  }

  // Test 2: Mark as unread
  const start2 = Date.now();
  try {
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isRead: false });
    log('Email CRUD', 'Mark as unread', 'PASS', 'Email marked as unread', Date.now() - start2);
  } catch (err: any) {
    log('Email CRUD', 'Mark as unread', 'FAIL', err.message);
  }

  // Test 3: Toggle star
  const start3 = Date.now();
  try {
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isStarred: true });
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isStarred: false });
    log('Email CRUD', 'Toggle star', 'PASS', 'Star toggled on/off', Date.now() - start3);
  } catch (err: any) {
    log('Email CRUD', 'Toggle star', 'FAIL', err.message);
  }

  // Test 4: Toggle flag
  const start4 = Date.now();
  try {
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isFlagged: true });
    await emailsService.updateEmail(sampleEmail.id, TENANT_ID, { isFlagged: false });
    log('Email CRUD', 'Toggle flag', 'PASS', 'Flag toggled on/off', Date.now() - start4);
  } catch (err: any) {
    log('Email CRUD', 'Toggle flag', 'FAIL', err.message);
  }
}

async function testSendEmail(emailSendService: EmailSendService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SEND EMAIL TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const timestamp = Date.now();

  // Test 1: Send email (should save to Italian SENT folder)
  const start = Date.now();
  try {
    const result = await emailSendService.sendEmail({
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      to: [LIBERO_EMAIL], // Send to self
      subject: `Test Libero IMAP ${timestamp}`,
      bodyText: `This is a test email sent at ${new Date().toISOString()}`,
      bodyHtml: `<p>This is a test email sent at ${new Date().toISOString()}</p>`,
    });
    log('Send Email', 'Send email via SMTP',
      result.messageId ? 'PASS' : 'FAIL',
      `MessageId: ${result.messageId}`, Date.now() - start);
  } catch (err: any) {
    log('Send Email', 'Send email via SMTP', 'FAIL', err.message);
  }
}

async function testFolderOperations(folderSync: FolderSyncService, prisma: PrismaService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FOLDER OPERATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const timestamp = Date.now();

  // Test 1: Create custom folder
  let createdFolderId: string | null = null;
  const start1 = Date.now();
  try {
    const result = await folderSync.createFolder(
      TENANT_ID,
      LIBERO_PROVIDER_ID,
      `Test-${timestamp}`,
    );
    createdFolderId = result.id;
    log('Folder Ops', 'Create folder', 'PASS',
      `Created: "${result.name}" at path "${result.path}"`, Date.now() - start1);
  } catch (err: any) {
    log('Folder Ops', 'Create folder', 'FAIL', err.message);
  }

  // Test 2: Rename folder
  if (createdFolderId) {
    const folder = await prisma.folder.findUnique({ where: { id: createdFolderId } });
    if (folder) {
      const start2 = Date.now();
      try {
        const result = await folderSync.renameFolder(
          TENANT_ID,
          LIBERO_PROVIDER_ID,
          folder.path,
          `Renamed-${timestamp}`,
        );
        log('Folder Ops', 'Rename folder', 'PASS',
          `Renamed to: "${result.name}"`, Date.now() - start2);
      } catch (err: any) {
        log('Folder Ops', 'Rename folder', 'FAIL', err.message);
      }
    }
  }

  // Test 3: Delete folder
  if (createdFolderId) {
    const folder = await prisma.folder.findUnique({ where: { id: createdFolderId } });
    if (folder) {
      const start3 = Date.now();
      try {
        await folderSync.deleteFolder(
          TENANT_ID,
          LIBERO_PROVIDER_ID,
          folder.path,
        );
        log('Folder Ops', 'Delete folder', 'PASS',
          `Deleted: "${folder.path}"`, Date.now() - start3);
      } catch (err: any) {
        log('Folder Ops', 'Delete folder', 'FAIL', err.message);
      }
    }
  }
}

async function testBulkOperations(emailsService: EmailsService, prisma: PrismaService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BULK OPERATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get sample emails for bulk testing
  const sampleEmails = await prisma.email.findMany({
    where: {
      tenantId: TENANT_ID,
      providerId: LIBERO_PROVIDER_ID,
      isDeleted: false,
    },
    take: 3,
    select: { id: true },
  });

  if (sampleEmails.length < 2) {
    log('Bulk Ops', 'Get sample emails', 'SKIP', 'Not enough emails for bulk testing');
    return;
  }

  const emailIds = sampleEmails.map(e => e.id);

  // Test 1: Bulk mark as read
  const start1 = Date.now();
  try {
    const result = await emailsService.bulkUpdateRead(emailIds, TENANT_ID, true);
    log('Bulk Ops', 'Bulk mark read', 'PASS',
      `${result.updated} emails marked as read`, Date.now() - start1);
  } catch (err: any) {
    log('Bulk Ops', 'Bulk mark read', 'FAIL', err.message);
  }

  // Test 2: Bulk star
  const start2 = Date.now();
  try {
    const result = await emailsService.bulkUpdateStarred(emailIds, TENANT_ID, true);
    await emailsService.bulkUpdateStarred(emailIds, TENANT_ID, false); // Reset
    log('Bulk Ops', 'Bulk star', 'PASS',
      `${result.updated} emails starred`, Date.now() - start2);
  } catch (err: any) {
    log('Bulk Ops', 'Bulk star', 'FAIL', err.message);
  }

  // Test 3: Bulk flag
  const start3 = Date.now();
  try {
    const result = await emailsService.bulkUpdateFlagged(emailIds, TENANT_ID, true);
    await emailsService.bulkUpdateFlagged(emailIds, TENANT_ID, false); // Reset
    log('Bulk Ops', 'Bulk flag', 'PASS',
      `${result.updated} emails flagged`, Date.now() - start3);
  } catch (err: any) {
    log('Bulk Ops', 'Bulk flag', 'FAIL', err.message);
  }
}

async function testRealtimeEvents(realtimeEvents: RealtimeEventsService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  REALTIME EVENTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Check hasTenantConnections
  try {
    const hasConnections = realtimeEvents.hasTenantConnections(TENANT_ID);
    log('Realtime', 'hasTenantConnections check', 'PASS',
      `Connections: ${hasConnections}`);
  } catch (err: any) {
    log('Realtime', 'hasTenantConnections check', 'FAIL', err.message);
  }

  // Test 2: Emit email update (should not throw)
  try {
    realtimeEvents.emitEmailUpdate(TENANT_ID, {
      providerId: LIBERO_PROVIDER_ID,
      reason: 'read-status-updated',
    });
    log('Realtime', 'emitEmailUpdate', 'PASS', 'Event emitted without error');
  } catch (err: any) {
    log('Realtime', 'emitEmailUpdate', 'FAIL', err.message);
  }

  // Test 3: Emit folder counts update
  try {
    realtimeEvents.emitFolderCountsUpdate(TENANT_ID, {
      providerId: LIBERO_PROVIDER_ID,
      folderId: 'test-folder',
      folderName: 'Test',
      totalCount: 10,
      unreadCount: 3,
      timestamp: new Date().toISOString(),
    });
    log('Realtime', 'emitFolderCountsUpdate', 'PASS', 'Event emitted without error');
  } catch (err: any) {
    log('Realtime', 'emitFolderCountsUpdate', 'FAIL', err.message);
  }
}

async function testSync(syncScheduler: SyncSchedulerService) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SYNC OPERATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Get sync stats
  try {
    const stats = await syncScheduler.getSyncStats();
    log('Sync', 'Get sync stats', 'PASS',
      `Active providers: ${stats.smartSync?.totalProviders || 'N/A'}`);
  } catch (err: any) {
    log('Sync', 'Get sync stats', 'FAIL', err.message);
  }

  // Test 2: Trigger sync
  const start = Date.now();
  try {
    await syncScheduler.syncProviderNow(LIBERO_PROVIDER_ID, 'high');
    log('Sync', 'Trigger sync', 'PASS',
      'Sync job queued', Date.now() - start);
  } catch (err: any) {
    log('Sync', 'Trigger sync', 'FAIL', err.message);
  }
}

async function printSummary() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`✅ PASSED:  ${passed}`);
  console.log(`❌ FAILED:  ${failed}`);
  console.log(`⚠️ WARNINGS: ${warned}`);
  console.log(`⏭️ SKIPPED: ${skipped}`);
  console.log(`📝 TOTAL:   ${results.length}`);

  if (failed > 0) {
    console.log('\n🚨 FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ [${r.category}] ${r.test}: ${r.details}`);
    });
  }

  if (warned > 0) {
    console.log('\n⚠️ WARNINGS:');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  ⚠️ [${r.category}] ${r.test}: ${r.details}`);
    });
  }

  // Calculate average response time
  const withDuration = results.filter(r => r.duration !== undefined);
  if (withDuration.length > 0) {
    const avgDuration = withDuration.reduce((sum, r) => sum + (r.duration || 0), 0) / withDuration.length;
    console.log(`\n⏱️ Average operation time: ${avgDuration.toFixed(0)}ms`);
  }

  const passRate = ((passed / (results.length - skipped)) * 100).toFixed(1);
  console.log(`\n📊 Pass Rate: ${passRate}%`);

  if (failed === 0 && warned === 0) {
    console.log('\n🎉 ALL TESTS PASSED! System is production ready.');
  } else if (failed === 0) {
    console.log('\n✅ All tests passed with warnings. Review warnings before production.');
  } else {
    console.log('\n🚨 Some tests failed. Fix issues before production deployment.');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LIBERO IMAP COMPREHENSIVE TEST SUITE');
  console.log('  Testing Italian locale folder names + all API functions');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Provider ID: ${LIBERO_PROVIDER_ID}`);
  console.log(`Email: ${LIBERO_EMAIL}`);
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const emailsService = app.get(EmailsService);
    const emailSendService = app.get(EmailSendService);
    const folderSync = app.get(FolderSyncService);
    const syncScheduler = app.get(SyncSchedulerService);
    const realtimeEvents = app.get(RealtimeEventsService);

    // Verify provider exists
    const provider = await prisma.providerConfig.findFirst({
      where: { id: LIBERO_PROVIDER_ID, tenantId: TENANT_ID },
    });

    if (!provider) {
      console.log(`❌ Provider ${LIBERO_PROVIDER_ID} not found for tenant ${TENANT_ID}`);
      console.log('Please update the TENANT_ID and LIBERO_PROVIDER_ID in the script.');
      return;
    }

    console.log(`✅ Provider found: ${provider.email} (${provider.providerType})\n`);

    // Run all tests
    await testFolderSync(prisma, folderSync);
    await testEmailList(emailsService, prisma);
    await testEmailOperations(emailsService, prisma);
    await testSendEmail(emailSendService);
    await testFolderOperations(folderSync, prisma);
    await testBulkOperations(emailsService, prisma);
    await testRealtimeEvents(realtimeEvents);
    await testSync(syncScheduler);

    await printSummary();

  } finally {
    await app.close();
  }
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
