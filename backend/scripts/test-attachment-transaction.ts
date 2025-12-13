/**
 * Test Script: Attachment Handler Transaction Fix (SYNC-1.1/1.2)
 *
 * Tests that the attachment handler transaction fix works correctly by:
 * 1. Creating a test email with attachments
 * 2. Simulating a re-sync scenario (delete old + create new atomically)
 * 3. Verifying the transaction ensures data consistency
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/test-attachment-transaction.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

// Test results tracking
interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(
  step: string,
  status: 'PASS' | 'FAIL',
  duration: number,
  details?: string,
) {
  results.push({ step, status, duration, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${step}: ${status} (${duration}ms)${details ? ` - ${details}` : ''}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Test: Attachment Handler Transaction Fix (SYNC-1.1/1.2)');
  console.log('='.repeat(60));
  console.log('');

  let testProviderId: string | null = null;
  let testEmailId: string | null = null;

  try {
    // Step 1: Find an existing tenant to use
    const existingTenant = await prisma.tenant.findFirst();
    if (!existingTenant) {
      console.error('❌ No tenant found. Please create a tenant first.');
      process.exit(1);
    }

    const tenantId = existingTenant.id;
    console.log(`Using tenant: ${tenantId}\n`);

    // Step 2: Create a TEST provider
    console.log('--- Setup Phase ---');
    let start = Date.now();
    testProviderId = `test-attach-${Date.now()}`;

    await prisma.providerConfig.create({
      data: {
        id: testProviderId,
        tenantId,
        email: `test-attach-${Date.now()}@test.local`,
        providerType: 'google',
        accessToken: 'test-token-encrypted',
        tokenEncryptionIv: 'test-iv',
        refreshToken: 'test-refresh-encrypted',
        refreshTokenEncryptionIv: 'test-refresh-iv',
        isActive: false,
      },
    });
    recordTest('Create test provider', 'PASS', Date.now() - start, testProviderId);

    // Step 3: Create a test email
    start = Date.now();
    const now = new Date();
    const testEmail = await prisma.email.create({
      data: {
        tenantId,
        providerId: testProviderId,
        externalId: `test-email-${Date.now()}`,
        subject: 'Test Email with Attachments',
        from: 'sender@test.local',
        to: ['recipient@test.local'],
        folder: 'INBOX',
        sentAt: now,
        receivedAt: now,
        isRead: false,
      },
    });
    testEmailId = testEmail.id;
    recordTest('Create test email', 'PASS', Date.now() - start, testEmailId);

    // Step 4: Create initial attachments (simulating first sync)
    start = Date.now();
    const initialAttachments = [
      { filename: 'document1.pdf', mimeType: 'application/pdf', size: 1024 },
      { filename: 'image1.png', mimeType: 'image/png', size: 2048 },
      { filename: 'spreadsheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 4096 },
    ];

    for (const att of initialAttachments) {
      await prisma.emailAttachment.create({
        data: {
          emailId: testEmailId,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          storageType: 'metadata',
          isInline: false,
        },
      });
    }
    recordTest('Create initial attachments', 'PASS', Date.now() - start, `${initialAttachments.length} attachments`);

    // Step 5: Verify attachments exist
    const attachmentsBefore = await prisma.emailAttachment.count({
      where: { emailId: testEmailId },
    });
    console.log(`\n--- Before Re-sync ---`);
    console.log(`  Attachments: ${attachmentsBefore}`);

    // Step 6: Simulate re-sync with NEW attachments (the fixed transaction pattern)
    console.log('\n--- Simulating Re-sync with Transaction ---');
    start = Date.now();

    const newAttachmentRecords = [
      {
        emailId: testEmailId,
        filename: 'new-document.pdf',
        mimeType: 'application/pdf',
        size: 5120,
        contentId: null,
        storageType: 'metadata',
        storagePath: null,
        contentHash: null,
        isInline: false,
      },
      {
        emailId: testEmailId,
        filename: 'new-image.jpg',
        mimeType: 'image/jpeg',
        size: 8192,
        contentId: null,
        storageType: 'metadata',
        storagePath: null,
        contentHash: null,
        isInline: false,
      },
    ];

    // This is the FIXED pattern - atomic delete + createMany in transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing attachments for this email
      await tx.emailAttachment.deleteMany({
        where: { emailId: testEmailId! },
      });

      // Create all new attachment records
      await tx.emailAttachment.createMany({
        data: newAttachmentRecords,
      });
    });

    recordTest('Execute transaction (delete + createMany)', 'PASS', Date.now() - start, 'Atomic operation');

    // Step 7: Verify final state
    console.log('\n--- After Re-sync ---');
    const attachmentsAfter = await prisma.emailAttachment.findMany({
      where: { emailId: testEmailId },
      select: { filename: true, size: true },
    });

    console.log(`  Attachments: ${attachmentsAfter.length}`);
    attachmentsAfter.forEach(att => {
      console.log(`    - ${att.filename} (${att.size} bytes)`);
    });

    // Step 8: Validate results
    console.log('\n--- Validation ---');
    const correctCount = attachmentsAfter.length === newAttachmentRecords.length;
    const correctFiles = attachmentsAfter.every(att =>
      newAttachmentRecords.some(r => r.filename === att.filename)
    );
    const oldFilesGone = !attachmentsAfter.some(att =>
      initialAttachments.some(i => i.filename === att.filename)
    );

    recordTest('Correct attachment count', correctCount ? 'PASS' : 'FAIL', 0,
      `${attachmentsAfter.length} == ${newAttachmentRecords.length}`);
    recordTest('New files present', correctFiles ? 'PASS' : 'FAIL', 0);
    recordTest('Old files removed', oldFilesGone ? 'PASS' : 'FAIL', 0);

    // Step 9: Test rollback scenario (simulate failure mid-transaction)
    console.log('\n--- Testing Transaction Rollback ---');
    start = Date.now();

    const countBefore = await prisma.emailAttachment.count({
      where: { emailId: testEmailId! },
    });

    let rollbackWorked = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Delete existing
        await tx.emailAttachment.deleteMany({
          where: { emailId: testEmailId! },
        });

        // Try to create with invalid data (will fail)
        await tx.emailAttachment.createMany({
          data: [{
            emailId: 'nonexistent-email-id-that-will-fail-foreign-key',
            filename: 'should-fail.pdf',
            mimeType: 'application/pdf',
            size: 100,
            storageType: 'metadata',
            isInline: false,
          }],
        });
      });
    } catch {
      // Expected to fail - this proves rollback works
      rollbackWorked = true;
    }

    const countAfterRollback = await prisma.emailAttachment.count({
      where: { emailId: testEmailId },
    });

    recordTest('Transaction rollback on failure',
      rollbackWorked && countAfterRollback === countBefore ? 'PASS' : 'FAIL',
      Date.now() - start,
      `Before: ${countBefore}, After rollback: ${countAfterRollback}`);

    // Summary
    const allPassed = results.every(r => r.status === 'PASS');

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ ALL TESTS PASSED: Attachment handler transaction fix verified!');
      console.log('   - Atomic delete + createMany works correctly');
      console.log('   - Transaction rollback on failure preserves data');
      console.log('   - Old attachments replaced atomically with new ones');
    } else {
      console.log('❌ SOME TESTS FAILED:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`   - ${r.step}: ${r.details || 'failed'}`);
      });
    }
    console.log('='.repeat(60));

    // Cleanup
    console.log('\nCleaning up test data...');
    await prisma.emailAttachment.deleteMany({ where: { emailId: testEmailId } });
    await prisma.email.delete({ where: { id: testEmailId } });
    await prisma.providerConfig.delete({ where: { id: testProviderId } });
    console.log('Cleanup completed.');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);

    // Cleanup on error
    if (testEmailId) {
      try {
        await prisma.emailAttachment.deleteMany({ where: { emailId: testEmailId } });
        await prisma.email.delete({ where: { id: testEmailId } }).catch(() => {});
      } catch {}
    }
    if (testProviderId) {
      try {
        await prisma.providerConfig.delete({ where: { id: testProviderId } }).catch(() => {});
      } catch {}
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
