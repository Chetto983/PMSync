import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmi31xyel0000yhukbwp6l714';

  // Count emails without threadId
  const emailsWithoutThread = await prisma.email.count({
    where: {
      tenantId,
      threadId: null,
      isDeleted: false
    }
  });

  const totalEmails = await prisma.email.count({
    where: { tenantId, isDeleted: false }
  });

  console.log('\n=== THREAD ID MIGRATION STATUS ===\n');
  console.log(`Total emails: ${totalEmails}`);
  console.log(`Emails WITH threadId: ${totalEmails - emailsWithoutThread} (${((totalEmails - emailsWithoutThread) / totalEmails * 100).toFixed(1)}%)`);
  console.log(`Emails WITHOUT threadId: ${emailsWithoutThread} (${(emailsWithoutThread / totalEmails * 100).toFixed(1)}%)`);

  // Show provider breakdown
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId },
    select: {
      id: true,
      providerType: true,
      email: true
    }
  });

  console.log('\n=== PROVIDERS ===\n');
  for (const provider of providers) {
    const providerEmails = await prisma.email.count({
      where: { providerId: provider.id, isDeleted: false }
    });

    const providerWithThread = await prisma.email.count({
      where: {
        providerId: provider.id,
        threadId: { not: null },
        isDeleted: false
      }
    });

    console.log(`Provider: ${provider.providerType} (${provider.email})`);
    console.log(`  Total: ${providerEmails}`);
    console.log(`  With threadId: ${providerWithThread} (${((providerWithThread / providerEmails * 100) || 0).toFixed(1)}%)`);
    console.log(`  Missing threadId: ${providerEmails - providerWithThread}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
