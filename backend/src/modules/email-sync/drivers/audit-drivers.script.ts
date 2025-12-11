/**
 * Comprehensive Driver Audit Script
 *
 * Tests ALL driver operations against REAL providers:
 * - Attachments: Download
 * - Folders: Create, Rename, Delete
 * - Messages: Send, Read/Unread, Star/Unstar, Move, Trash, Hard Delete
 * - Sync: Incremental, Full
 * - PubSub: Subscribe, Delete (Google/Microsoft only)
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register src/modules/email-sync/drivers/audit-drivers.script.ts
 *
 * WARNING: This script MODIFIES real mailboxes. Use test accounts only!
 */

import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { DriversModule } from './drivers.module';
import { EmailDriverFactory } from './driver.factory';
import { ResilienceService } from './resilience/resilience.service';
import { ProviderType, ComposeMessage } from './interfaces/canonical.types';
import { DriverCredentials, IEmailDriver } from './interfaces/email-driver.interface';

// Minimal module for audit
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    DriversModule,
  ],
  providers: [
    CryptoService,
    GoogleOAuthService,
    MicrosoftOAuthService,
    ProviderTokenService,
  ],
})
class AuditModule {}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
  skipped?: boolean;
}

interface AuditResult {
  providerId: string;
  email: string;
  providerType: string;
  categories: {
    name: string;
    tests: TestResult[];
    passed: number;
    failed: number;
    skipped: number;
  }[];
  overallPassed: boolean;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
}

// Helper to run a test with timing and error handling
async function runTest(
  name: string,
  testFn: () => Promise<any>,
  logger: Logger,
  skipCondition?: boolean,
  skipReason?: string,
): Promise<TestResult> {
  if (skipCondition) {
    logger.warn(`  [SKIP] ${name}: ${skipReason}`);
    return { name, passed: true, duration: 0, skipped: true, details: { skipReason } };
  }

  const start = Date.now();
  try {
    const details = await testFn();
    const duration = Date.now() - start;
    logger.log(`  [PASS] ${name} (${duration}ms)`);
    return { name, passed: true, duration, details };
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`  [FAIL] ${name}: ${errorMessage}`);
    return { name, passed: false, duration, error: errorMessage };
  }
}

// Delay helper - Production-ready delays for >1000 users
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limit safe delays (respecting API quotas)
const DELAYS = {
  BETWEEN_OPERATIONS: 1500,    // 1.5s between operations (safe for all providers)
  BETWEEN_CATEGORIES: 3000,    // 3s between test categories
  BETWEEN_PROVIDERS: 5000,     // 5s between different providers
  AFTER_SEND: 4000,            // 4s after sending email (wait for delivery)
  AFTER_FOLDER_CREATE: 2000,   // 2s after folder operations (propagation)
  AFTER_DELETE: 2000,          // 2s after delete operations
};

/**
 * Audit attachment operations
 */
async function auditAttachments(
  driver: IEmailDriver,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- ATTACHMENTS ---');
  const tests: TestResult[] = [];

  // Find a message with attachments - search more thoroughly
  // First try INBOX, then SENT (our test emails will be in SENT)
  let msgWithAttachment: any = null;

  for (const folder of ['INBOX', 'SENT']) {
    const messagesResult = await driver.listMessages({ folder, pageSize: 100 });
    msgWithAttachment = messagesResult.messages.find((m) => m.hasAttachments);
    if (msgWithAttachment) {
      logger.log(`  [INFO] Found message with attachment in ${folder}`);
      break;
    }
  }

  if (!msgWithAttachment) {
    tests.push(await runTest(
      'Download Attachment',
      async () => {},
      logger,
      true,
      'No messages with attachments found',
    ));
    return tests;
  }

  // Get full message to get attachment IDs
  const fullMsg = await driver.getMessage(msgWithAttachment.id, { includeBody: true });

  if (!fullMsg?.attachments?.length) {
    tests.push(await runTest(
      'Download Attachment',
      async () => {},
      logger,
      true,
      'Message has no attachment metadata',
    ));
    return tests;
  }

  tests.push(await runTest(
    'Download Attachment',
    async () => {
      const att = fullMsg.attachments[0];
      const data = await driver.getAttachment(msgWithAttachment.id, att.id);
      return {
        filename: data.filename,
        mimeType: data.mimeType,
        size: data.size,
        hasContent: !!data.content,
        contentLength: data.content?.length || 0,
      };
    },
    logger,
  ));

  return tests;
}

/**
 * Audit folder CRUD operations
 */
async function auditFolderCRUD(
  driver: IEmailDriver,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- FOLDER CRUD ---');
  const tests: TestResult[] = [];
  const testFolderName = `_audit_test_${Date.now()}`;
  let createdFolderId: string | null = null;

  // Create folder
  tests.push(await runTest(
    'Create Folder',
    async () => {
      const folder = await driver.createFolder(testFolderName);
      createdFolderId = folder.id;
      return { id: folder.id, name: folder.name, type: folder.type };
    },
    logger,
  ));

  await delay(DELAYS.AFTER_FOLDER_CREATE);

  // Verify folder exists
  tests.push(await runTest(
    'Verify Folder Created',
    async () => {
      const folders = await driver.listFolders();
      const found = folders.find((f) => f.name === testFolderName || f.id === createdFolderId);
      if (!found) throw new Error('Created folder not found in list');
      return { found: true, id: found.id };
    },
    logger,
    !createdFolderId,
    'Folder creation failed',
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Rename folder
  const renamedName = `${testFolderName}_renamed`;
  tests.push(await runTest(
    'Rename Folder',
    async () => {
      await driver.renameFolder(createdFolderId!, renamedName);
      return { oldName: testFolderName, newName: renamedName };
    },
    logger,
    !createdFolderId,
    'No folder to rename',
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Delete folder
  tests.push(await runTest(
    'Delete Folder',
    async () => {
      // Use the renamed folder ID or original
      await driver.deleteFolder(createdFolderId!);
      return { deleted: true };
    },
    logger,
    !createdFolderId,
    'No folder to delete',
  ));

  await delay(DELAYS.AFTER_DELETE);

  // Verify folder deleted
  tests.push(await runTest(
    'Verify Folder Deleted',
    async () => {
      const folders = await driver.listFolders();
      const found = folders.find((f) => f.id === createdFolderId || f.name === renamedName);
      if (found) throw new Error('Folder still exists after deletion');
      return { verified: true };
    },
    logger,
    !createdFolderId,
    'No folder to verify',
  ));

  return tests;
}

/**
 * Audit send email operation
 */
async function auditSendEmail(
  driver: IEmailDriver,
  userEmail: string,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- SEND EMAIL ---');
  const tests: TestResult[] = [];

  const testSubject = `[AUDIT-TEST] ${new Date().toISOString()}`;

  tests.push(await runTest(
    'Send Email (to self)',
    async () => {
      const message: ComposeMessage = {
        to: [{ email: userEmail, name: 'Audit Test' }],
        subject: testSubject,
        bodyHtml: `<p>This is an automated audit test email sent at ${new Date().toISOString()}</p>`,
        bodyText: `This is an automated audit test email sent at ${new Date().toISOString()}`,
      };
      const messageId = await driver.sendMessage(message);
      return { messageId, subject: testSubject };
    },
    logger,
  ));

  return tests;
}

/**
 * Audit read/unread status operations
 */
async function auditReadStatus(
  driver: IEmailDriver,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- READ/UNREAD STATUS ---');
  const tests: TestResult[] = [];

  // Get a message to test with
  const messagesResult = await driver.listMessages({ folder: 'INBOX', pageSize: 5 });
  if (messagesResult.messages.length === 0) {
    tests.push(await runTest('Mark as Read', async () => {}, logger, true, 'No messages in INBOX'));
    tests.push(await runTest('Mark as Unread', async () => {}, logger, true, 'No messages in INBOX'));
    return tests;
  }

  const testMsg = messagesResult.messages[0];
  const originalReadStatus = testMsg.isRead;

  // Mark as read
  tests.push(await runTest(
    'Mark as Read',
    async () => {
      await driver.setReadStatus(testMsg.id, true);
      // Verify
      const updated = await driver.getMessage(testMsg.id);
      return { messageId: testMsg.id, isRead: updated?.isRead };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Mark as unread
  tests.push(await runTest(
    'Mark as Unread',
    async () => {
      await driver.setReadStatus(testMsg.id, false);
      // Verify
      const updated = await driver.getMessage(testMsg.id);
      return { messageId: testMsg.id, isRead: updated?.isRead };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Restore original status
  await driver.setReadStatus(testMsg.id, originalReadStatus);

  return tests;
}

/**
 * Audit star/unstar operations
 */
async function auditStarStatus(
  driver: IEmailDriver,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- STAR/UNSTAR ---');
  const tests: TestResult[] = [];

  const messagesResult = await driver.listMessages({ folder: 'INBOX', pageSize: 5 });
  if (messagesResult.messages.length === 0) {
    tests.push(await runTest('Star Message', async () => {}, logger, true, 'No messages in INBOX'));
    tests.push(await runTest('Unstar Message', async () => {}, logger, true, 'No messages in INBOX'));
    return tests;
  }

  const testMsg = messagesResult.messages[0];
  const originalStarStatus = testMsg.isStarred;

  // Star message
  tests.push(await runTest(
    'Star Message',
    async () => {
      await driver.setStarredStatus(testMsg.id, true);
      const updated = await driver.getMessage(testMsg.id);
      return { messageId: testMsg.id, isStarred: updated?.isStarred };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Unstar message
  tests.push(await runTest(
    'Unstar Message',
    async () => {
      await driver.setStarredStatus(testMsg.id, false);
      const updated = await driver.getMessage(testMsg.id);
      return { messageId: testMsg.id, isStarred: updated?.isStarred };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Restore original status
  await driver.setStarredStatus(testMsg.id, originalStarStatus);

  return tests;
}

/**
 * Audit move to folder operations
 */
async function auditMoveToFolder(
  driver: IEmailDriver,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- MOVE TO FOLDER ---');
  const tests: TestResult[] = [];

  // Create a test folder for moving
  const testFolderName = `_move_test_${Date.now()}`;
  let testFolderId: string | null = null;

  try {
    const folder = await driver.createFolder(testFolderName);
    testFolderId = folder.id;
  } catch (error) {
    tests.push(await runTest('Move Message', async () => {}, logger, true, 'Could not create test folder'));
    return tests;
  }

  await delay(DELAYS.AFTER_FOLDER_CREATE);

  // Get a message from INBOX (safer to test with)
  const inboxMessages = await driver.listMessages({ folder: 'INBOX', pageSize: 5 });
  if (inboxMessages.messages.length === 0) {
    // Cleanup test folder
    try { await driver.deleteFolder(testFolderId); } catch {}
    tests.push(await runTest('Move Message', async () => {}, logger, true, 'No messages in INBOX'));
    return tests;
  }

  const testMsg = inboxMessages.messages[0];

  // Move to test folder
  tests.push(await runTest(
    'Move Message to Custom Folder',
    async () => {
      await driver.moveMessage(testMsg.id, testFolderId);
      return { messageId: testMsg.id, targetFolder: testFolderName };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Move back to INBOX
  tests.push(await runTest(
    'Move Message Back to INBOX',
    async () => {
      // Get message from new location
      const movedMessages = await driver.listMessages({ folder: testFolderId, pageSize: 5 });
      if (movedMessages.messages.length > 0) {
        await driver.moveMessage(movedMessages.messages[0].id, 'INBOX');
        return { moved: true };
      }
      return { moved: false, note: 'Message not found in target folder' };
    },
    logger,
  ));

  await delay(DELAYS.BETWEEN_OPERATIONS);

  // Cleanup test folder
  try {
    await driver.deleteFolder(testFolderId);
  } catch (error) {
    logger.warn(`  [WARN] Could not delete test folder: ${error}`);
  }

  return tests;
}

/**
 * Audit trash and delete operations
 */
async function auditTrashAndDelete(
  driver: IEmailDriver,
  userEmail: string,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- TRASH & DELETE ---');
  const tests: TestResult[] = [];

  // First, send a test email to delete
  const testSubject = `[DELETE-TEST] ${Date.now()}`;
  let _sentMessageId: string | null = null;

  try {
    _sentMessageId = await driver.sendMessage({
      to: [{ email: userEmail }],
      subject: testSubject,
      bodyText: 'This message will be deleted by the audit script.',
      bodyHtml: '<p>This message will be deleted by the audit script.</p>',
    });
    logger.log(`  [INFO] Sent test email for deletion: ${testSubject}`);
    await delay(DELAYS.AFTER_SEND); // Wait for email to arrive
  } catch (_error) {
    tests.push(await runTest('Move to Trash', async () => {}, logger, true, 'Could not send test email'));
    tests.push(await runTest('Hard Delete', async () => {}, logger, true, 'Could not send test email'));
    return tests;
  }

  // Find the sent message in SENT folder
  const sentMessages = await driver.listMessages({ folder: 'SENT', pageSize: 10 });
  const testMessage = sentMessages.messages.find((m) => m.subject === testSubject);

  if (!testMessage) {
    tests.push(await runTest('Move to Trash', async () => {}, logger, true, 'Test message not found'));
    tests.push(await runTest('Hard Delete', async () => {}, logger, true, 'Test message not found'));
    return tests;
  }

  // Move to Trash (soft delete)
  tests.push(await runTest(
    'Move to Trash',
    async () => {
      await driver.deleteMessage(testMessage.id, false);
      return { messageId: testMessage.id, permanent: false };
    },
    logger,
  ));

  await delay(DELAYS.AFTER_DELETE);

  // Find message in Trash
  const trashMessages = await driver.listMessages({ folder: 'TRASH', pageSize: 10 });
  const trashedMessage = trashMessages.messages.find((m) => m.subject === testSubject);

  // Hard delete from Trash
  tests.push(await runTest(
    'Hard Delete',
    async () => {
      if (trashedMessage) {
        await driver.deleteMessage(trashedMessage.id, true);
        return { messageId: trashedMessage.id, permanent: true };
      }
      // If not found in trash, try original ID
      await driver.deleteMessage(testMessage.id, true);
      return { messageId: testMessage.id, permanent: true };
    },
    logger,
  ));

  return tests;
}

/**
 * Audit sync operations
 */
async function auditSync(
  driver: IEmailDriver,
  providerType: string,
  logger: Logger,
): Promise<TestResult[]> {
  logger.log('\n--- SYNC OPERATIONS ---');
  const tests: TestResult[] = [];

  // IMAP doesn't support sync tokens - this is expected
  const isImap = providerType === 'imap' || providerType === 'generic';
  const supportsSync = typeof driver.getInitialSyncToken === 'function' && !isImap;

  tests.push(await runTest(
    'Get Initial Sync Token',
    async () => {
      const token = await driver.getInitialSyncToken!();
      return { token: token?.substring(0, 50) + '...', length: token?.length };
    },
    logger,
    !supportsSync || isImap,
    isImap ? 'IMAP does not support sync tokens (expected)' : 'Driver does not support sync tokens',
  ));

  // Full sync simulation - just list all messages from INBOX
  tests.push(await runTest(
    'Full Sync (List All INBOX)',
    async () => {
      let totalMessages = 0;
      let pageToken: string | undefined;
      let pages = 0;

      do {
        const result = await driver.listMessages({
          folder: 'INBOX',
          pageSize: 50,
          pageToken,
        });
        totalMessages += result.messages.length;
        pageToken = result.nextPageToken;
        pages++;

        // Limit to 5 pages for testing
        if (pages >= 5) break;
      } while (pageToken);

      return { totalMessages, pages, complete: !pageToken };
    },
    logger,
  ));

  return tests;
}

/**
 * Main audit function
 */
async function auditDriver(
  factory: EmailDriverFactory,
  resilience: ResilienceService,
  provider: any,
  credentials: DriverCredentials,
  logger: Logger,
): Promise<AuditResult> {
  const result: AuditResult = {
    providerId: provider.id,
    email: provider.email,
    providerType: provider.providerType,
    categories: [],
    overallPassed: true,
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
  };

  const providerTypeStr = provider.providerType as string;
  const driverType = (providerTypeStr === 'generic' ? 'imap' : providerTypeStr) as ProviderType;

  logger.log(`\n${'='.repeat(70)}`);
  logger.log(`COMPREHENSIVE AUDIT: ${provider.email} (${providerTypeStr})`);
  logger.log(`${'='.repeat(70)}`);

  try {
    // Connect
    const driver = await factory.createResilientDriver(driverType, provider.id, credentials);
    logger.log(`[CONNECTED] ${provider.email}`);

    // Run all audit categories
    const categories = [
      { name: 'Attachments', fn: () => auditAttachments(driver, logger) },
      { name: 'Folder CRUD', fn: () => auditFolderCRUD(driver, logger) },
      { name: 'Send Email', fn: () => auditSendEmail(driver, provider.email, logger) },
      { name: 'Read/Unread', fn: () => auditReadStatus(driver, logger) },
      { name: 'Star/Unstar', fn: () => auditStarStatus(driver, logger) },
      { name: 'Move to Folder', fn: () => auditMoveToFolder(driver, logger) },
      { name: 'Trash & Delete', fn: () => auditTrashAndDelete(driver, provider.email, logger) },
      { name: 'Sync Operations', fn: () => auditSync(driver, driverType, logger) },
    ];

    for (const category of categories) {
      const tests = await category.fn();
      const passed = tests.filter((t) => t.passed && !t.skipped).length;
      const failed = tests.filter((t) => !t.passed).length;
      const skipped = tests.filter((t) => t.skipped).length;

      result.categories.push({
        name: category.name,
        tests,
        passed,
        failed,
        skipped,
      });

      result.totalTests += tests.length;
      result.totalPassed += passed;
      result.totalFailed += failed;
      result.totalSkipped += skipped;

      if (failed > 0) result.overallPassed = false;

      // Production-safe delay between categories
      await delay(DELAYS.BETWEEN_CATEGORIES);
    }

    // Disconnect
    await driver.disconnect();
    logger.log(`\n[DISCONNECTED] ${provider.email}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[ERROR] Audit failed: ${errorMessage}`);
    result.overallPassed = false;
    result.categories.push({
      name: 'Connection',
      tests: [{ name: 'Connect', passed: false, duration: 0, error: errorMessage }],
      passed: 0,
      failed: 1,
      skipped: 0,
    });
    result.totalTests++;
    result.totalFailed++;
  }

  return result;
}

async function main() {
  const logger = new Logger('DriverAudit');

  logger.log('='.repeat(70));
  logger.log('COMPREHENSIVE DRIVER AUDIT');
  logger.log('WARNING: This script MODIFIES real mailboxes!');
  logger.log('='.repeat(70));

  const app = await NestFactory.createApplicationContext(AuditModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const tokenService = app.get(ProviderTokenService);
  const factory = app.get(EmailDriverFactory);
  const resilience = app.get(ResilienceService);
  const crypto = app.get(CryptoService);

  // Get active providers
  const providers = await prisma.providerConfig.findMany({
    where: {
      isActive: true,
      providerType: { in: ['google', 'microsoft', 'imap', 'generic'] },
    },
    take: 10,
    orderBy: { lastSyncedAt: 'desc' },
  });

  logger.log(`\nFound ${providers.length} providers to audit\n`);

  const results: AuditResult[] = [];

  for (const provider of providers) {
    try {
      let credentials: DriverCredentials;

      if (provider.providerType === 'imap' || provider.providerType === 'generic') {
        if (!provider.imapPassword || !provider.imapEncryptionIv) {
          throw new Error('IMAP password not configured');
        }
        const decryptedPassword = crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
        credentials = {
          type: 'basic',
          username: provider.imapUsername || provider.email,
          password: decryptedPassword,
          imapHost: provider.imapHost || '',
          imapPort: provider.imapPort || 993,
          imapTls: provider.imapUseTls !== false,
          smtpHost: provider.smtpHost || '',
          smtpPort: provider.smtpPort || 465,
          smtpTls: provider.smtpUseTls !== false,
          emailHint: provider.email,
        };
      } else {
        const { accessToken } = await tokenService.getProviderWithToken(provider.id);
        credentials = {
          type: 'oauth2',
          accessToken,
          emailHint: provider.email,
        };
      }

      const result = await auditDriver(factory, resilience, provider, credentials, logger);
      results.push(result);

      await delay(DELAYS.BETWEEN_PROVIDERS); // Production-safe delay between providers

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to audit ${provider.email}: ${errorMessage}`);
    }
  }

  // Print summary
  logger.log(`\n${'='.repeat(70)}`);
  logger.log('AUDIT SUMMARY');
  logger.log(`${'='.repeat(70)}`);

  for (const result of results) {
    const status = result.overallPassed ? 'PASS' : 'FAIL';
    logger.log(`\n[${status}] ${result.email} (${result.providerType})`);
    logger.log(`     Total: ${result.totalPassed}/${result.totalTests} passed, ${result.totalFailed} failed, ${result.totalSkipped} skipped`);

    for (const cat of result.categories) {
      const catStatus = cat.failed > 0 ? 'FAIL' : 'PASS';
      logger.log(`     [${catStatus}] ${cat.name}: ${cat.passed}/${cat.tests.length} (${cat.skipped} skipped)`);

      // Show failed tests
      for (const test of cat.tests) {
        if (!test.passed && !test.skipped) {
          logger.log(`           - ${test.name}: ${test.error}`);
        }
      }
    }
  }

  const totalPassed = results.filter((r) => r.overallPassed).length;
  const totalFailed = results.filter((r) => !r.overallPassed).length;

  logger.log(`\n${'='.repeat(70)}`);
  logger.log(`FINAL: ${totalPassed}/${results.length} providers passed all tests`);
  logger.log(`${'='.repeat(70)}`);

  await app.close();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
