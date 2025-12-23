import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    // First, let's see what the contact looks like
    const contacts = await prisma.contact.findMany({
      where: {
        displayName: { contains: 'LELE', mode: 'insensitive' }
      },
      take: 3,
      select: { id: true, displayName: true, emails: true }
    });
    console.log('Contacts by name LELE:', JSON.stringify(contacts, null, 2));

    // Now try string_contains on emails
    const contactsByEmail = await prisma.contact.findMany({
      where: {
        emails: { string_contains: 'lelegdb' }
      },
      take: 3,
      select: { id: true, displayName: true, emails: true }
    });
    console.log('\nContacts by email string_contains lelegdb:', JSON.stringify(contactsByEmail, null, 2));

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
