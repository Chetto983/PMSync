require('dotenv').config();
const { createPrismaClient } = require('./prisma-client');

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1'; // Davide's tenant

  try {
    // Test the exact search_contacts logic
    const query = 'lelegdb@gmail.com';
    const takeLimit = 10;

    console.log('=== Testing search_contacts logic ===');
    console.log('Query:', query);
    console.log('TenantId:', tenantId);

    // Step 1: Prisma search (name/company)
    let contacts = await prisma.contact.findMany({
      where: {
        tenantId,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: takeLimit,
      select: { id: true, displayName: true, emails: true }
    });
    console.log('\nStep 1 - Prisma search (name/company):', contacts.length, 'results');

    // Step 2: If no results and has @, try raw SQL
    if (contacts.length === 0 && query.includes('@')) {
      console.log('Step 2 - Trying raw SQL for email search...');
      const emailContacts = await prisma.$queryRaw`
        SELECT id, "displayName", emails
        FROM unified_contacts
        WHERE "tenantId" = ${tenantId}
          AND emails::text ILIKE ${'%' + query + '%'}
        LIMIT ${takeLimit}
      `;
      console.log('Raw SQL results:', emailContacts.length, 'results');
      console.log('Contacts found:', JSON.stringify(emailContacts, null, 2));
    } else {
      console.log('Contacts found:', JSON.stringify(contacts, null, 2));
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
