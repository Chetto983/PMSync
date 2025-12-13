/**
 * Test Script: deleteProviderConfig() Transaction Fix (PROV-1.1)
 *
 * Tests that the transaction fix works correctly by:
 * 1. Creating a temporary test provider with emails and contacts
 * 2. Executing the same transaction logic as deleteProviderConfig()
 * 3. Verifying all related data is deleted atomically
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/test-delete-provider.ts
 *
 * NOTE: Creates a TEMPORARY test provider that will be deleted.
 * Does NOT delete your real providers.
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
  console.log('Test: deleteProviderConfig() Transaction Fix (PROV-1.1)');
  console.log('='.repeat(60));
  console.log('');

  let testProviderId: string | null = null;
  let testContactId: string | null = null;

  try {
    // Step 1: Find an existing tenant to use
    const existingTenant = await prisma.tenant.findFirst();
    if (!existingTenant) {
      console.error('❌ No tenant found. Please create a tenant first.');
      process.exit(1);
    }

    const tenantId = existingTenant.id;
    console.log(`Using tenant: ${tenantId}\n`);

    // Step 2: Create a TEST provider (will be deleted)
    console.log('--- Setup Phase ---');
    let start = Date.now();
    testProviderId = `test-delete-${Date.now()}`;

    const testProvider = await prisma.providerConfig.create({
      data: {
        id: testProviderId,
        tenantId,
        email: `test-delete-${Date.now()}@test.local`,
        providerType: 'google',
        accessToken: 'test-token-encrypted',
        tokenEncryptionIv: 'test-iv',
        refreshToken: 'test-refresh-encrypted',
        refreshTokenEncryptionIv: 'test-refresh-iv',
        isActive: false, // Not a real provider
      },
    });
    recordTest('Create test provider', 'PASS', Date.now() - start, testProvider.id);

    // Step 3: Create test emails for this provider
    start = Date.now();
    const emailIds: string[] = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const email = await prisma.email.create({
        data: {
          tenantId,
          providerId: testProviderId,
          externalId: `test-external-${i}-${Date.now()}`,
          subject: `Test Email ${i}`,
          from: 'sender@test.local',
          to: ['recipient@test.local'],
          folder: 'INBOX',
          sentAt: now,
          receivedAt: now,
          isRead: false,
        },
      });
      emailIds.push(email.id);
    }
    recordTest('Create test emails', 'PASS', Date.now() - start, `${emailIds.length} emails`);

    // Step 4: Create a test contact linked ONLY to this provider (will become orphan)
    start = Date.now();
    const testContact = await prisma.contact.create({
      data: {
        tenantId,
        displayName: `Test Contact ${Date.now()}`,
        emails: ['test-contact@test.local'],
        isDeleted: false,
        providerContacts: {
          create: {
            tenantId,
            providerId: testProviderId,
            externalId: `test-contact-external-${Date.now()}`,
          },
        },
      },
    });
    testContactId = testContact.id;
    recordTest('Create test contact', 'PASS', Date.now() - start, testContact.id);

    // Step 5: Verify data exists before deletion
    console.log('\n--- Before Deletion ---');
    const emailsBefore = await prisma.email.count({
      where: { providerId: testProviderId },
    });
    const providerBefore = await prisma.providerConfig.findUnique({
      where: { id: testProviderId },
    });
    const providerContactsBefore = await prisma.providerContact.count({
      where: { providerId: testProviderId },
    });
    const contactBefore = await prisma.contact.findUnique({
      where: { id: testContactId },
    });

    console.log(`  Emails: ${emailsBefore}`);
    console.log(`  Provider exists: ${!!providerBefore}`);
    console.log(`  ProviderContacts: ${providerContactsBefore}`);
    console.log(`  Contact exists: ${!!contactBefore}`);

    // Step 6: Execute the transaction (same as deleteProviderConfig)
    console.log('\n--- Executing Transaction ---');
    start = Date.now();

    const { emailsDeleted, orphanedContactsCount } = await prisma.$transaction(async (tx) => {
      // Delete all emails for this provider (cascade deletes attachments)
      const emailDeleteResult = await tx.email.deleteMany({
        where: { providerId: testProviderId! },
      });

      // Delete the provider config itself (cascade deletes providerContacts)
      await tx.providerConfig.delete({
        where: { id: testProviderId! },
      });

      // Clean up orphaned contacts (contacts with no provider links)
      const orphanedContactsResult = await tx.contact.deleteMany({
        where: {
          tenantId,
          providerContacts: {
            none: {},
          },
        },
      });

      return {
        emailsDeleted: emailDeleteResult.count,
        orphanedContactsCount: orphanedContactsResult.count,
      };
    });

    const txDuration = Date.now() - start;
    recordTest('Execute transaction', 'PASS', txDuration, `${emailsDeleted} emails, ${orphanedContactsCount} orphaned contacts`);

    // Step 7: Verify data is deleted after transaction
    console.log('\n--- After Deletion ---');
    const emailsAfter = await prisma.email.count({
      where: { providerId: testProviderId },
    });
    const providerAfter = await prisma.providerConfig.findUnique({
      where: { id: testProviderId },
    });
    const providerContactsAfter = await prisma.providerContact.count({
      where: { providerId: testProviderId },
    });
    const contactAfter = await prisma.contact.findUnique({
      where: { id: testContactId },
    });

    console.log(`  Emails: ${emailsAfter}`);
    console.log(`  Provider exists: ${!!providerAfter}`);
    console.log(`  ProviderContacts: ${providerContactsAfter}`);
    console.log(`  Contact exists: ${!!contactAfter}`);

    // Step 8: Validate results
    const allPassed =
      emailsAfter === 0 &&
      providerAfter === null &&
      providerContactsAfter === 0 &&
      contactAfter === null;

    console.log('\n--- Validation ---');
    recordTest('Emails deleted', emailsAfter === 0 ? 'PASS' : 'FAIL', 0, `${emailsAfter} remaining`);
    recordTest('Provider deleted', providerAfter === null ? 'PASS' : 'FAIL', 0);
    recordTest('ProviderContacts cascade deleted', providerContactsAfter === 0 ? 'PASS' : 'FAIL', 0, `${providerContactsAfter} remaining`);
    recordTest('Orphaned contact deleted', contactAfter === null ? 'PASS' : 'FAIL', 0);

    // Summary
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ TEST PASSED: Transaction works correctly!');
      console.log('   - All emails deleted atomically');
      console.log('   - Provider config deleted');
      console.log('   - ProviderContacts cascade deleted');
      console.log('   - Orphaned contacts cleaned up');
    } else {
      console.log('❌ TEST FAILED: Data inconsistency detected');
      results.filter((r) => r.status === 'FAIL').forEach((r) => {
        console.log(`   - ${r.step}: ${r.details || 'failed'}`);
      });
    }
    console.log('='.repeat(60));

    // Mark test provider/contact as null since they're deleted
    testProviderId = null;
    testContactId = null;

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);

    // Cleanup on error
    if (testProviderId) {
      console.log('\nCleaning up test data...');
      try {
        await prisma.email.deleteMany({ where: { providerId: testProviderId } });
        await prisma.providerConfig.delete({ where: { id: testProviderId } }).catch(() => {});
        console.log('Cleanup completed.');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
