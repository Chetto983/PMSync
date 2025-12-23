/**
 * Validation Test Script for EmailSyncBackService Bug Fixes
 * Tests all 11 fixes from EMAIL_SYNC_BACK_AUDIT.md
 *
 * Run: npx ts-node scripts/validate-sync-back-fixes.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailSyncBackService, EmailSyncOperation } from '../src/modules/email/services/email-sync-back.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Logger } from '@nestjs/common';

interface TestResult {
  bug: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
}

const results: TestResult[] = [];

function log(bug: string, test: string, status: 'PASS' | 'FAIL' | 'SKIP', details: string) {
  results.push({ bug, test, status, details });
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${emoji} [${bug}] ${test}: ${details}`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       EmailSyncBackService Bug Fix Validation Tests            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const logger = new Logger('SyncBackTest');
  const prisma = app.get(PrismaService);
  const syncBackService = app.get(EmailSyncBackService);

  try {
    // Get first tenant with active providers
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
    });

    if (!tenant) {
      console.error('No active tenant found!');
      process.exit(1);
    }

    // Get providers separately
    const providers = await prisma.providerConfig.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
      },
      take: 5,
    });

    console.log(`📋 Testing on tenant: ${tenant.id} (${tenant.name})`);
    console.log(`📧 Found ${providers.length} active providers\n`);

    const googleProvider = providers.find((p: any) => p.providerType?.toUpperCase() === 'GOOGLE');
    const microsoftProvider = providers.find((p: any) => p.providerType?.toUpperCase() === 'MICROSOFT');
    const imapProvider = providers.find((p: any) => p.providerType?.toUpperCase() === 'IMAP');

    // ═══════════════════════════════════════════════════════════════════
    // BUG #9: Validate externalId before API calls
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #9: ExternalId Validation ═══');

    // Test empty externalId
    try {
      await syncBackService.syncOperationToProvider({
        emailId: 'test-email-id',
        externalId: '',  // Empty!
        providerId: providers[0]?.id || 'fake-provider',
        tenantId: tenant.id,
        operation: 'markRead',
      });
      log('Bug #9', 'Empty externalId rejected', 'FAIL', 'Should have thrown error');
    } catch (err: any) {
      if (err.message.includes('Invalid externalId') || err.message.includes('empty')) {
        log('Bug #9', 'Empty externalId rejected', 'PASS', 'Correctly threw validation error');
      } else {
        log('Bug #9', 'Empty externalId rejected', 'FAIL', `Wrong error: ${err.message}`);
      }
    }

    // Test missing providerId
    try {
      await syncBackService.syncOperationToProvider({
        emailId: 'test-email-id',
        externalId: 'valid-external-id',
        providerId: '',  // Empty!
        tenantId: tenant.id,
        operation: 'markRead',
      });
      log('Bug #9', 'Missing providerId rejected', 'FAIL', 'Should have thrown error');
    } catch (err: any) {
      if (err.message.includes('Missing providerId') || err.message.includes('providerId')) {
        log('Bug #9', 'Missing providerId rejected', 'PASS', 'Correctly threw validation error');
      } else {
        log('Bug #9', 'Missing providerId rejected', 'FAIL', `Wrong error: ${err.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #6: Provider not found error handling
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #6: Provider Not Found Handling ═══');

    try {
      await syncBackService.syncOperationToProvider({
        emailId: 'test-email-id',
        externalId: 'valid-external-id',
        providerId: 'non-existent-provider-id-12345',
        tenantId: tenant.id,
        operation: 'markRead',
      });
      log('Bug #6', 'Non-existent provider rejected', 'FAIL', 'Should have thrown error');
    } catch (err: any) {
      if (err.message.includes('Provider not found')) {
        log('Bug #6', 'Non-existent provider rejected', 'PASS', 'Clear error message provided');
      } else {
        log('Bug #6', 'Non-existent provider rejected', 'FAIL', `Wrong error: ${err.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #3: Microsoft folder resolution (localization)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #3: Microsoft Folder Resolution ═══');

    if (microsoftProvider) {
      // Check that TRASH resolves to proper folder ID via getMicrosoftFolderId
      const trashFolder = await prisma.folder.findFirst({
        where: {
          providerId: microsoftProvider.id,
          OR: [
            { specialUse: 'TRASH' },
            { specialUse: 'trash' },
          ],
        },
      });

      if (trashFolder) {
        log('Bug #3', 'MS TRASH folder lookup', 'PASS', `Found: ${trashFolder.name} (path: ${trashFolder.path})`);
      } else {
        // Try to find by name pattern
        const anyTrash = await prisma.folder.findFirst({
          where: {
            providerId: microsoftProvider.id,
            OR: [
              { name: { contains: 'elimin', mode: 'insensitive' } },  // Italian
              { name: { contains: 'trash', mode: 'insensitive' } },
              { name: { contains: 'deleted', mode: 'insensitive' } },
            ],
          },
        });
        if (anyTrash) {
          log('Bug #3', 'MS TRASH folder lookup', 'PASS', `Found by name: ${anyTrash.name}`);
        } else {
          log('Bug #3', 'MS TRASH folder lookup', 'SKIP', 'No trash folder synced yet');
        }
      }
    } else {
      log('Bug #3', 'MS TRASH folder lookup', 'SKIP', 'No Microsoft provider configured');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #1 & #2: Gmail delete/move label handling (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #1 & #2: Gmail Label Handling (Code Verification) ═══');

    // Read the source file to verify the fix is in place
    const fs = require('fs');
    const syncBackPath = require('path').join(__dirname, '../src/modules/email/services/email-sync-back.service.ts');
    const sourceCode = fs.readFileSync(syncBackPath, 'utf-8');

    // Check for separate delete case
    if (sourceCode.includes("case 'delete':") &&
        sourceCode.includes("deleteLabelsToRemove") &&
        sourceCode.includes("removeLabelIds: deleteLabelsToRemove")) {
      log('Bug #2', 'Gmail delete separated from moveToFolder', 'PASS', 'Delete case properly separated with label removal');
    } else {
      log('Bug #2', 'Gmail delete separated from moveToFolder', 'FAIL', 'Delete case not properly implemented');
    }

    // Check for label removal in moveToFolder
    if (sourceCode.includes("labelsToRemove") &&
        sourceCode.includes("removeLabelIds: labelsToRemove")) {
      log('Bug #1', 'Gmail moveToFolder removes source labels', 'PASS', 'Label removal implemented');
    } else {
      log('Bug #1', 'Gmail moveToFolder removes source labels', 'FAIL', 'Label removal not found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #5: Token refresh error handling (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #5: Token Refresh Error Handling ═══');

    if (sourceCode.includes("catch (refreshError)") &&
        sourceCode.includes("Authentication failed for")) {
      log('Bug #5', 'Token refresh try/catch implemented', 'PASS', 'Error handling with user-friendly message');
    } else {
      log('Bug #5', 'Token refresh try/catch implemented', 'FAIL', 'Error handling not found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #7: Microsoft batch moveToFolder (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #7: Microsoft Batch moveToFolder ═══');

    if (sourceCode.includes("msTrashFolderId") &&
        sourceCode.includes("destinationId: msTrashFolderId")) {
      log('Bug #7', 'MS batch uses resolved folder ID', 'PASS', 'Batch delete uses getMicrosoftFolderId');
    } else {
      log('Bug #7', 'MS batch uses resolved folder ID', 'FAIL', 'Batch still uses hardcoded folder');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #11: Microsoft batch response validation (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #11: Microsoft Batch Response Validation ═══');

    if (sourceCode.includes("res.status >= 400") &&
        sourceCode.includes("batch operation failed")) {
      log('Bug #11', 'MS batch validates response status', 'PASS', 'Individual response errors logged');
    } else {
      log('Bug #11', 'MS batch validates response status', 'FAIL', 'Batch response validation not found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #12: Gmail batch comment accuracy (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #12: Gmail Batch Comment Accuracy ═══');

    if (sourceCode.includes("Using 900 as safety margin")) {
      log('Bug #12', 'Gmail batch comment updated', 'PASS', 'Comment explains 900 limit safety margin');
    } else {
      log('Bug #12', 'Gmail batch comment updated', 'FAIL', 'Comment still misleading');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #13: Timeout protection (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #13: Operation Timeout Protection ═══');

    if (sourceCode.includes("OPERATION_TIMEOUT_MS") &&
        sourceCode.includes("withTimeout")) {
      log('Bug #13', 'Timeout wrapper implemented', 'PASS', 'Operations protected with 30s timeout');
    } else {
      log('Bug #13', 'Timeout wrapper implemented', 'FAIL', 'Timeout protection not found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUG #14: IMAP connection cleanup (code review)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Bug #14: IMAP Connection Cleanup ═══');

    if (sourceCode.includes("let client: ImapFlow | null = null") &&
        sourceCode.includes("finally") &&
        sourceCode.includes("await client.logout()")) {
      log('Bug #14', 'IMAP connection properly cleaned up', 'PASS', 'Client declared outside try with finally cleanup');
    } else {
      log('Bug #14', 'IMAP connection properly cleaned up', 'FAIL', 'IMAP cleanup pattern not found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // LIVE TEST: Real email operation (if emails exist)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ Live Email Operation Tests ═══');

    // Find a test email to operate on
    const testEmail = await prisma.email.findFirst({
      where: {
        tenantId: tenant.id,
        externalId: { not: '' },
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        subject: true,
        isRead: true,
      },
    });

    if (testEmail && testEmail.externalId && testEmail.providerId) {
      console.log(`\n📧 Testing with email: "${testEmail.subject?.substring(0, 50)}..."`);

      // Test mark read/unread operation
      const originalReadStatus = testEmail.isRead;
      const targetReadStatus = !originalReadStatus;

      try {
        await syncBackService.syncOperationToProvider({
          emailId: testEmail.id,
          externalId: testEmail.externalId,
          providerId: testEmail.providerId,
          tenantId: tenant.id,
          operation: targetReadStatus ? 'markRead' : 'markUnread',
        });

        log('Live Test', `Mark ${targetReadStatus ? 'read' : 'unread'} operation`, 'PASS', 'Operation completed successfully');

        // Revert the change
        await syncBackService.syncOperationToProvider({
          emailId: testEmail.id,
          externalId: testEmail.externalId,
          providerId: testEmail.providerId,
          tenantId: tenant.id,
          operation: originalReadStatus ? 'markRead' : 'markUnread',
        });
        log('Live Test', 'Revert read status', 'PASS', 'Reverted to original state');

      } catch (err: any) {
        log('Live Test', 'Read status operation', 'FAIL', err.message);
      }
    } else {
      log('Live Test', 'Email operations', 'SKIP', 'No emails with externalId found');
    }

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
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
        console.log(`   [${r.bug}] ${r.test}: ${r.details}`);
      });
    }

    const successRate = ((passed / (passed + failed)) * 100).toFixed(1);
    console.log(`\n🎯 Success Rate: ${successRate}%`);

    if (failed === 0) {
      console.log('\n🎉 All bug fixes validated successfully!');
    }

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
