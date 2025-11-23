import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmi31xyel0000yhukbwp6l714';

  console.log('\n=== DELETE OLD DRAFTS/SENT WITHOUT THREADID ===\n');

  // Get emails without threadId
  const emailsToDelete = await prisma.email.findMany({
    where: {
      tenantId,
      threadId: null,
      isDeleted: false,
      OR: [
        { folder: 'DRAFTS' },
        { folder: 'SENT', externalId: 'sendMail' }
      ]
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      folder: true,
      receivedAt: true
    },
    orderBy: { receivedAt: 'desc' }
  });

  console.log(`Found ${emailsToDelete.length} emails to delete:\n`);

  emailsToDelete.forEach((email, idx) => {
    console.log(`${idx + 1}. [${email.folder}] ${email.subject?.substring(0, 60) || '(no subject)'}`);
    console.log(`   ID: ${email.id}`);
    console.log(`   Date: ${email.receivedAt}`);
  });

  console.log(`\n❌ Deleting ${emailsToDelete.length} emails...`);

  const result = await prisma.email.deleteMany({
    where: {
      id: { in: emailsToDelete.map(e => e.id) }
    }
  });

  console.log(`✅ Deleted ${result.count} emails`);

  // Check final stats
  const totalEmails = await prisma.email.count({
    where: { tenantId, isDeleted: false }
  });

  const emailsWithThread = await prisma.email.count({
    where: {
      tenantId,
      threadId: { not: null },
      isDeleted: false
    }
  });

  console.log('\n=== FINAL STATS ===\n');
  console.log(`Total emails: ${totalEmails}`);
  console.log(`With threadId: ${emailsWithThread} (${((emailsWithThread / totalEmails * 100) || 0).toFixed(1)}%)`);
  console.log(`Without threadId: ${totalEmails - emailsWithThread} (${(((totalEmails - emailsWithThread) / totalEmails * 100) || 0).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch(console.error);
