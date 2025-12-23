/**
 * Check contact and emails for c.borello@bancadelpiemonte.it
 * Real test data for VoltAgent validation
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/check-borello-contact.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';
  const testEmail = 'c.borello@bancadelpiemonte.it';

  console.log('=== SEARCHING FOR: ' + testEmail + ' ===\n');

  // Search in Contacts (raw SQL for email in JSON)
  console.log('📇 CONTACTS:');
  try {
    // Table is mapped to "unified_contacts" in schema
    const contacts = await prisma.$queryRaw<any[]>`
      SELECT id, "displayName", emails
      FROM unified_contacts
      WHERE "tenantId" = ${tenantId}
      AND emails::text ILIKE ${'%' + testEmail + '%'}
      LIMIT 5
    `;

    if (contacts.length > 0) {
      contacts.forEach((c) => {
        console.log('  - ' + c.displayName);
        console.log('    Emails: ' + JSON.stringify(c.emails));
      });
    } else {
      console.log('  (none found with exact email match)');

      // Try partial search
      const partialQuery = 'borello';
      const partialContacts = await prisma.$queryRaw<any[]>`
        SELECT id, "displayName", emails
        FROM unified_contacts
        WHERE "tenantId" = ${tenantId}
        AND (
          "displayName" ILIKE ${'%' + partialQuery + '%'}
          OR emails::text ILIKE ${'%' + partialQuery + '%'}
        )
        LIMIT 5
      `;

      if (partialContacts.length > 0) {
        console.log('  Found with partial match "borello":');
        partialContacts.forEach((c) => {
          console.log('    - ' + c.displayName);
          console.log('      Emails: ' + JSON.stringify(c.emails));
        });
      }
    }
  } catch (e) {
    console.error('  Error searching contacts:', e);
  }

  // Search in Emails (raw SQL because 'to' is String[] array)
  console.log('\n📧 EMAILS (from/to this address):');
  try {
    const emails = await prisma.$queryRaw<any[]>`
      SELECT id, subject, "from", "to", folder, "receivedAt"
      FROM emails
      WHERE "tenantId" = ${tenantId}
      AND (
        "from" ILIKE ${'%' + testEmail + '%'}
        OR array_to_string("to", ',') ILIKE ${'%' + testEmail + '%'}
      )
      ORDER BY "receivedAt" DESC
      LIMIT 10
    `;

    if (emails.length > 0) {
      console.log('  Found ' + emails.length + ' emails:');
      emails.forEach((e) => {
        console.log('  ─'.repeat(30));
        console.log('  📌 [' + e.folder + '] ' + (e.subject || '(no subject)').substring(0, 60));
        console.log('     From: ' + e.from);
        const toStr = Array.isArray(e.to) ? e.to.join(', ') : String(e.to || '');
        console.log('     To: ' + toStr.substring(0, 80));
        console.log('     Date: ' + e.receivedAt);
      });
    } else {
      console.log('  (none found)');

      // Try partial search
      const partialEmails = await prisma.$queryRaw<any[]>`
        SELECT id, subject, "from", "to", folder, "receivedAt"
        FROM emails
        WHERE "tenantId" = ${tenantId}
        AND (
          "from" ILIKE '%borello%'
          OR array_to_string("to", ',') ILIKE '%borello%'
        )
        ORDER BY "receivedAt" DESC
        LIMIT 10
      `;

      if (partialEmails.length > 0) {
        console.log('  Found with partial match "borello":');
        partialEmails.forEach((e) => {
          console.log('  ─'.repeat(30));
          console.log('  📌 [' + e.folder + '] ' + (e.subject || '(no subject)').substring(0, 60));
          console.log('     From: ' + e.from);
          const toStr = Array.isArray(e.to) ? e.to.join(', ') : String(e.to || '');
          console.log('     To: ' + toStr.substring(0, 80));
          console.log('     Date: ' + e.receivedAt);
        });
      }
    }
  } catch (e) {
    console.error('  Error searching emails:', e);
  }

  // Check conversation history
  console.log('\n💬 CONVERSATION MENTIONS:');
  try {
    const conversations = await prisma.voltAgentMessage.findMany({
      where: {
        tenantId,
        content: { contains: 'borello', mode: 'insensitive' },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, content: true, createdAt: true, conversationId: true },
    });

    if (conversations.length > 0) {
      console.log('  Found ' + conversations.length + ' messages mentioning "borello":');
      conversations.forEach((c) => {
        console.log('  ─'.repeat(30));
        console.log('  📝 [' + c.role + '] ' + c.content.substring(0, 100) + '...');
        console.log('     Conversation: ' + c.conversationId);
        console.log('     Date: ' + c.createdAt);
      });
    } else {
      console.log('  (none found)');
    }
  } catch (e) {
    console.error('  Error searching conversations:', e);
  }

  await prisma.$disconnect();
  console.log('\n✅ Done!');
}

main().catch(console.error);
