import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmi31xyel0000yhukbwp6l714';

  const emailsWithoutThread = await prisma.email.findMany({
    where: {
      tenantId,
      threadId: null,
      isDeleted: false
    },
    select: {
      id: true,
      externalId: true,
      providerId: true,
      subject: true,
      from: true,
      receivedAt: true,
      folder: true
    },
    orderBy: { receivedAt: 'desc' }
  });

  console.log(`\n=== EMAILS WITHOUT THREADID (${emailsWithoutThread.length}) ===\n`);

  for (const email of emailsWithoutThread) {
    console.log(`ID: ${email.id}`);
    console.log(`External ID: ${email.externalId}`);
    console.log(`Provider ID: ${email.providerId}`);
    console.log(`Subject: ${email.subject?.substring(0, 80) || '(no subject)'}`);
    console.log(`From: ${email.from}`);
    console.log(`Folder: ${email.folder}`);
    console.log(`Date: ${email.receivedAt}`);
    console.log('---');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
