import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('=== CLEANUP AND RESYNC ===\n');

  // Get tenant
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found');
    return;
  }
  console.log('Tenant ID:', user.tenantId);

  // Count current emails
  const emailCount = await prisma.email.count({ where: { tenantId: user.tenantId } });
  console.log('\nCurrent email count:', emailCount);

  // Delete all attachments first (foreign key constraint)
  console.log('\nDeleting attachments...');
  const deletedAttachments = await prisma.emailAttachment.deleteMany({
    where: { email: { tenantId: user.tenantId } }
  });
  console.log('Deleted attachments:', deletedAttachments.count);

  // Delete all email labels
  console.log('\nDeleting email labels...');
  const deletedEmailLabels = await prisma.emailLabel.deleteMany({
    where: { email: { tenantId: user.tenantId } }
  });
  console.log('Deleted email labels:', deletedEmailLabels.count);

  // Delete all emails
  console.log('\nDeleting emails...');
  const deletedEmails = await prisma.email.deleteMany({
    where: { tenantId: user.tenantId }
  });
  console.log('Deleted emails:', deletedEmails.count);

  // Reset sync state for all providers
  console.log('\nResetting sync state...');
  const updatedProviders = await prisma.providerConfig.updateMany({
    where: { tenantId: user.tenantId },
    data: {
      lastSyncedAt: null,
      nextSyncAt: null,
      metadata: null,
    }
  });
  console.log('Reset providers:', updatedProviders.count);

  // Verify cleanup
  const newEmailCount = await prisma.email.count({ where: { tenantId: user.tenantId } });
  console.log('\n=== CLEANUP COMPLETE ===');
  console.log('Emails remaining:', newEmailCount);
  console.log('\nNow trigger a sync from the UI to re-fetch all emails.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
