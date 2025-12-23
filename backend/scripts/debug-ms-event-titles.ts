/**
 * Debug script to inspect Microsoft Graph API response for birthday/holiday events
 *
 * Usage: npx ts-node scripts/debug-ms-event-titles.ts
 */

import 'dotenv/config';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';

async function main() {
  console.log('========================================');
  console.log('🔍 Microsoft Event Titles Debug');
  console.log('========================================\n');

  // Import Prisma client
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const { CryptoService } = await import('../src/common/services/crypto.service');
  const prisma = createPrismaClient();
  const crypto = new CryptoService();

  try {
    // Find Microsoft provider
    const msProvider = await prisma.providerConfig.findFirst({
      where: {
        providerType: 'microsoft',
        isActive: true,
        supportsCalendar: true,
      },
    });

    if (!msProvider) {
      console.log('No Microsoft provider found');
      return;
    }

    console.log(`Provider: ${msProvider.email}\n`);

    // Decrypt access token
    if (!msProvider.accessToken || !msProvider.tokenEncryptionIv) {
      console.log('No access token found');
      return;
    }

    const accessToken = crypto.decrypt(msProvider.accessToken, msProvider.tokenEncryptionIv);

    // Create Graph client
    const client = GraphClient.init({
      authProvider: (done) => done(null, accessToken),
    });

    // Fetch calendars
    console.log('--- Fetching Calendars ---\n');
    const calendarsResponse = await client.api('/me/calendars').select('id,name').get();
    const calendars = calendarsResponse.value || [];

    for (const cal of calendars) {
      console.log(`📅 ${cal.name} (${cal.id.substring(0, 30)}...)`);
    }

    // Find birthday and holiday calendars
    const birthdayCal = calendars.find((c: any) =>
      c.name.toLowerCase().includes('birthday') ||
      c.name.toLowerCase().includes('compleann')  // Matches compleanno/compleanni
    );
    const holidayCal = calendars.find((c: any) =>
      c.name.toLowerCase().includes('holiday') ||
      c.name.toLowerCase().includes('festività')
    );

    // Fetch events from interesting calendars - birthday FIRST
    const targetCalendars = [birthdayCal, holidayCal].filter(Boolean);
    console.log(`\n🎂 Birthday calendar found: ${birthdayCal?.name || 'NO'}`);
    console.log(`🎄 Holiday calendar found: ${holidayCal?.name || 'NO'}`);

    if (targetCalendars.length === 0) {
      console.log('\n⚠️ No birthday or holiday calendars found');
      // Use first calendar
      if (calendars.length > 0) {
        targetCalendars.push(calendars[0]);
      }
    }

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 30);
    const sixtyDaysAhead = new Date();
    sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

    for (const cal of targetCalendars) {
      console.log(`\n========================================`);
      console.log(`📅 Calendar: ${cal.name}`);
      console.log(`========================================\n`);

      try {
        // Fetch ALL fields (no $select) to see complete data
        const response = await client
          .api(`/me/calendars/${cal.id}/calendarView`)
          .query({
            startDateTime: sixtyDaysAgo.toISOString(),
            endDateTime: sixtyDaysAhead.toISOString(),
          })
          .top(5)
          .get();

        const events = response.value || [];
        console.log(`Found ${events.length} events\n`);

        for (let i = 0; i < Math.min(events.length, 3); i++) {
          const event = events[i];
          console.log(`--- Event ${i + 1} ---`);
          console.log(`subject: "${event.subject || '(empty)'}"`);
          console.log(`id: ${event.id?.substring(0, 50)}...`);
          console.log(`start: ${event.start?.dateTime}`);
          console.log(`end: ${event.end?.dateTime}`);
          console.log(`isAllDay: ${event.isAllDay}`);
          console.log(`isCancelled: ${event.isCancelled}`);

          if (event.body?.content) {
            const bodyPreview = event.body.content
              .replace(/<[^>]*>/g, '')
              .substring(0, 200)
              .trim();
            console.log(`body: "${bodyPreview}..."`);
          } else {
            console.log(`body: (empty)`);
          }

          if (event.bodyPreview) {
            console.log(`bodyPreview: "${event.bodyPreview.substring(0, 100)}..."`);
          }

          if (event.attendees?.length > 0) {
            console.log(`attendees: ${event.attendees.map((a: any) => a.emailAddress?.name || a.emailAddress?.address).join(', ')}`);
          }

          if (event.organizer) {
            console.log(`organizer: ${event.organizer.emailAddress?.name || event.organizer.emailAddress?.address}`);
          }

          // Print ALL fields for first event
          if (i === 0) {
            console.log(`\n🔍 ALL FIELDS FOR FIRST EVENT:`);
            console.log(JSON.stringify(event, null, 2));
          }

          console.log('');
        }
      } catch (error) {
        console.log(`Error fetching calendar: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Also check contact birthdays endpoint (special API for Microsoft)
    console.log(`\n========================================`);
    console.log(`🎂 Checking Contact Birthdays API`);
    console.log(`========================================\n`);

    try {
      // Try the contacts endpoint to get birthday info
      const contactsResponse = await client
        .api('/me/contacts')
        .select('displayName,birthday,givenName,surname')
        .filter('birthday ne null')
        .top(10)
        .get();

      const contacts = contactsResponse.value || [];
      console.log(`Found ${contacts.length} contacts with birthdays:\n`);

      for (const contact of contacts.slice(0, 5)) {
        console.log(`  - ${contact.displayName}: ${contact.birthday}`);
      }
    } catch (error) {
      console.log(`Error fetching contacts: ${error instanceof Error ? error.message : String(error)}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
