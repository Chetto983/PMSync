/**
 * Check where Italian names are located by tenant
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  const testTenantId = 'cmk2x2zwj0000s4yh5nlq8izj'; // Italian RAG Test
  const davidesTenantId = 'cmjgylxkg000054yhnjpkmzd9'; // Davide's Workspace

  const patterns = ['rossi', 'bianchi', 'laura', 'luca'];

  console.log('=== ITALIAN NAMES BY TENANT ===\n');

  for (const pattern of patterns) {
    const inTest = await prisma.email.count({
      where: {
        tenantId: testTenantId,
        OR: [
          { from: { contains: pattern, mode: 'insensitive' } },
        ]
      }
    });

    const inDavide = await prisma.email.count({
      where: {
        tenantId: davidesTenantId,
        OR: [
          { from: { contains: pattern, mode: 'insensitive' } },
        ]
      }
    });

    console.log(`"${pattern}":`);
    console.log(`  Italian RAG Test: ${inTest}`);
    console.log(`  Davide's Workspace: ${inDavide}`);
    console.log('');
  }

  // Show sample emails with "rossi" in Italian RAG Test
  console.log('=== SAMPLE EMAILS WITH "ROSSI" IN ITALIAN RAG TEST ===');
  const rossiEmails = await prisma.email.findMany({
    where: {
      tenantId: testTenantId,
      from: { contains: 'rossi', mode: 'insensitive' }
    },
    select: { from: true, subject: true },
    take: 5
  });

  rossiEmails.forEach((e, i) => {
    console.log(`${i + 1}. ${e.from} - ${(e.subject || '').substring(0, 50)}`);
  });

  // Check for EXACT "Mario Rossi" string
  console.log('\n=== SEARCH FOR EXACT "Mario Rossi" ===');
  const marioRossiExact = await prisma.email.count({
    where: {
      from: { contains: 'Mario Rossi', mode: 'insensitive' }
    }
  });
  console.log(`Total "Mario Rossi" in from field: ${marioRossiExact}`);

  // Check for test domains
  console.log('\n=== SEARCH FOR TEST DOMAINS ===');
  const testDomains = ['azienda.com', 'partner.com', 'cliente.com', 'fornitore.com'];
  for (const domain of testDomains) {
    const count = await prisma.email.count({
      where: {
        from: { contains: domain, mode: 'insensitive' }
      }
    });
    console.log(`"${domain}": ${count} emails`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
