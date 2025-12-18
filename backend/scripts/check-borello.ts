/**
 * Check emails from Borello in database
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  // Search for emails mentioning Borello
  const emails = await prisma.email.findMany({
    where: {
      tenantId,
      OR: [
        { from: { contains: 'borello', mode: 'insensitive' } },
        { subject: { contains: 'borello', mode: 'insensitive' } },
        { snippet: { contains: 'borello', mode: 'insensitive' } },
        { bodyText: { contains: 'borello', mode: 'insensitive' } },
      ]
    },
    select: { id: true, from: true, subject: true, snippet: true, bodyText: true },
    take: 5
  });

  console.log('Emails with Borello:', emails.length);
  emails.forEach(e => {
    console.log('-', e.from);
    console.log('  Subject:', e.subject);
    console.log('  Snippet:', e.snippet?.substring(0, 150));
    console.log('  BodyText:', e.bodyText?.substring(0, 300));
  });

  // Also search for emails containing "mutuo" (mortgage)
  const mutuoEmails = await prisma.email.findMany({
    where: {
      tenantId,
      OR: [
        { subject: { contains: 'mutuo', mode: 'insensitive' } },
        { snippet: { contains: 'mutuo', mode: 'insensitive' } },
        { bodyText: { contains: '224.000', mode: 'insensitive' } },
      ]
    },
    select: { id: true, from: true, subject: true, snippet: true, bodyText: true },
    take: 5
  });

  console.log('\nEmails with mutuo or 224.000:', mutuoEmails.length);
  mutuoEmails.forEach(e => {
    console.log('-', e.from);
    console.log('  Subject:', e.subject);
    console.log('  Snippet:', e.snippet?.substring(0, 150));
    console.log('  BodyText:', e.bodyText?.substring(0, 500));
  });

  await prisma.$disconnect();
}

main().catch(e => console.error(e));
