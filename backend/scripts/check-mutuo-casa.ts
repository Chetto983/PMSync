/**
 * Check Mutuo casa email content
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  // Search for "Mutuo casa" emails
  const emails = await prisma.email.findMany({
    where: {
      tenantId,
      subject: { contains: 'Mutuo casa', mode: 'insensitive' }
    },
    select: { id: true, from: true, subject: true, snippet: true, bodyText: true },
    take: 5
  });

  console.log('Emails with "Mutuo casa":', emails.length);
  emails.forEach(e => {
    console.log('='.repeat(60));
    console.log('From:', e.from);
    console.log('Subject:', e.subject);
    console.log('Snippet:', e.snippet?.substring(0, 200));
    console.log('BodyText:', e.bodyText?.substring(0, 800));
  });

  await prisma.$disconnect();
}

main().catch(e => console.error(e));
