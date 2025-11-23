import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const threadId = '19aac794a5bfd7af';

  const emails = await prisma.email.findMany({
    where: {
      threadId,
      isDeleted: false
    },
    select: {
      id: true,
      externalId: true,
      threadId: true,
      subject: true,
      from: true,
      to: true,
      snippet: true,
      bodyHtml: true,
      receivedAt: true,
      isRead: true,
      isStarred: true,
      folder: true
    },
    orderBy: { receivedAt: 'asc' }
  });

  console.log('\n=== THREAD DETAILS ===');
  console.log(`Thread ID: ${threadId}`);
  console.log(`Emails in thread: ${emails.length}\n`);

  emails.forEach((email, idx) => {
    console.log(`--- Email ${idx + 1} ---`);
    console.log(`ID: ${email.id}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`From: ${email.from}`);
    console.log(`To: ${email.to}`);
    console.log(`Date: ${email.receivedAt}`);
    console.log(`Folder: ${email.folder}`);
    console.log(`Read: ${email.isRead}`);
    console.log(`Starred: ${email.isStarred}`);
    console.log(`Snippet: ${email.snippet?.substring(0, 100)}`);
    console.log('');
  });

  await prisma.$disconnect();
}

main().catch(console.error);
