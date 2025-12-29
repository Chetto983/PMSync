import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get the provider info
  const provider = await prisma.providerConfig.findUnique({
    where: { id: 'cmjgymu5a000354yhqyw1wz8g' },
    select: {
      id: true,
      email: true,
      providerType: true,
      displayName: true
    }
  });

  console.log('=== PROVIDER INFO ===');
  console.log(JSON.stringify(provider, null, 2));

  // Get the specific email with ALL fields
  const email = await prisma.email.findUnique({
    where: { id: 'cmjqx761c010rewyhpot0y8dj' }
  });

  if (email) {
    console.log('\n=== FULL EMAIL RECORD ===');
    console.log(JSON.stringify(email, null, 2));
  }

  // Count total emails with invalid From (no @)
  const totalBadFrom = await prisma.email.count({
    where: {
      from: { not: { contains: '@' } }
    }
  });

  console.log('\n=== EMAILS WITH INVALID FROM (no @) ===');
  console.log('Total count:', totalBadFrom);

  // Also check emails with short "from" values (potential data issues)
  const badFromEmails = await prisma.email.findMany({
    where: {
      from: { not: { contains: '@' } }
    },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      headers: true,
      providerId: true,
      externalId: true
    },
    take: 20
  });

  badFromEmails.forEach(e => {
    console.log('---');
    console.log('ID:', e.id);
    console.log('Subject:', e.subject?.substring(0, 50));
    console.log('From:', e.from);
    console.log('To:', e.to);
    console.log('External ID:', e.externalId);
  });

  const emails = await prisma.email.findMany({
    where: {
      subject: { contains: 'BP eDesk', mode: 'insensitive' }
    },
    select: {
      id: true,
      subject: true,
      from: true,
      bodyHtml: true,
      bodyText: true,
      snippet: true,
      receivedAt: true
    },
    take: 5
  });

  console.log('Found emails:', emails.length);
  emails.forEach(e => {
    console.log('---');
    console.log('ID:', e.id);
    console.log('Subject:', e.subject);
    console.log('From:', e.from);
    console.log('Body HTML length:', e.bodyHtml?.length || 0);
    console.log('Body Text length:', e.bodyText?.length || 0);
    console.log('Snippet:', e.snippet?.substring(0, 200));
    console.log('Body HTML (first 2000):');
    console.log(e.bodyHtml?.substring(0, 2000));
    console.log('Body Text (first 2000):');
    console.log(e.bodyText?.substring(0, 2000));
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
