/**
 * Check actual emails in each tenant
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  const testTenantId = 'cmk2x2zwj0000s4yh5nlq8izj'; // Italian RAG Test
  const davidesTenantId = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace

  console.log('=== ITALIAN RAG TEST TENANT ACTUAL EMAILS ===');
  const testEmails = await prisma.email.findMany({
    where: { tenantId: testTenantId },
    select: { from: true, subject: true },
    take: 15
  });

  testEmails.forEach((e, i) => {
    const from = e.from || 'unknown';
    const subject = (e.subject || '').substring(0, 60);
    console.log(`${i + 1}. From: ${from}`);
    console.log(`   Subject: ${subject}`);
  });

  console.log('');
  console.log('=== DAVIDE WORKSPACE ACTUAL EMAILS ===');
  const davideEmails = await prisma.email.findMany({
    where: { tenantId: davidesTenantId },
    select: { from: true, subject: true },
    take: 15
  });

  davideEmails.forEach((e, i) => {
    const from = e.from || 'unknown';
    const subject = (e.subject || '').substring(0, 60);
    console.log(`${i + 1}. From: ${from}`);
    console.log(`   Subject: ${subject}`);
  });

  console.log('');
  console.log('=== SEARCH FOR ANY ITALIAN-SOUNDING NAMES ===');
  const italianPatterns = ['rossi', 'bianchi', 'verdi', 'neri', 'mario', 'laura', 'luca', 'sofia'];

  for (const pattern of italianPatterns) {
    const count = await prisma.email.count({
      where: {
        OR: [
          { from: { contains: pattern, mode: 'insensitive' } },
          { subject: { contains: pattern, mode: 'insensitive' } },
        ]
      }
    });
    if (count > 0) {
      console.log(`  "${pattern}": ${count} emails found`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
