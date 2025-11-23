import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get tenant info
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true }
  });
  console.log('\n=== TENANTS ===');
  console.log(JSON.stringify(tenants, null, 2));

  if (tenants.length === 0) {
    console.log('No tenants found!');
    return;
  }

  const tenantId = tenants[0].id;
  console.log(`\nUsing tenant: ${tenantId}`);

  // Get total emails
  const totalEmails = await prisma.email.count({
    where: { tenantId, isDeleted: false }
  });
  console.log(`\nTotal emails: ${totalEmails}`);

  // Get emails with threadId
  const emailsWithThreads = await prisma.email.findMany({
    where: {
      tenantId,
      threadId: { not: null },
      isDeleted: false
    },
    select: {
      id: true,
      threadId: true,
      subject: true,
      from: true,
      receivedAt: true
    },
    orderBy: { receivedAt: 'desc' },
    take: 20
  });

  console.log(`\n=== EMAILS WITH THREADS (${emailsWithThreads.length}) ===`);

  // Group by threadId
  const threadGroups = new Map<string, typeof emailsWithThreads>();
  emailsWithThreads.forEach(email => {
    if (!email.threadId) return;
    if (!threadGroups.has(email.threadId)) {
      threadGroups.set(email.threadId, []);
    }
    threadGroups.get(email.threadId)!.push(email);
  });

  console.log(`\nUnique threads: ${threadGroups.size}`);

  // Show thread details
  let i = 1;
  for (const [threadId, emails] of threadGroups.entries()) {
    console.log(`\n--- Thread ${i}: ${threadId} (${emails.length} emails) ---`);
    i++;
    let j = 1;
    for (const email of emails) {
      console.log(`  ${j}. ${email.subject?.substring(0, 60) || '(no subject)'}`);
      console.log(`     From: ${email.from}`);
      console.log(`     Date: ${email.receivedAt}`);
      j++;
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
