/**
 * Check for 224.000 in emails and VoltAgent memory
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  // Search for 224 in all emails
  const emails = await prisma.email.findMany({
    where: {
      tenantId,
      OR: [
        { bodyText: { contains: '224', mode: 'insensitive' } },
        { bodyHtml: { contains: '224', mode: 'insensitive' } },
      ]
    },
    select: { id: true, from: true, subject: true },
    take: 10
  });

  console.log('Emails with 224:', emails.length);
  emails.forEach(e => console.log('-', e.from, '|', e.subject));

  // Check VoltAgentMemory for the stored value
  const memories = await prisma.voltAgentMemory.findMany({
    where: { tenantId },
    take: 20
  });
  console.log('\nVoltAgent Memories:', memories.length);
  memories.forEach(m => {
    const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    console.log('-', m.key, '|', val?.substring(0, 100));
  });

  await prisma.$disconnect();
}

main().catch(e => console.error(e));
