/**
 * Fix Microsoft event titles by re-fetching from Graph API
 *
 * Usage: npx ts-node scripts/fix-ms-event-titles.ts
 */

import 'dotenv/config';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';

async function main() {
  console.log('========================================');
  console.log('🔧 Fix Microsoft Event Titles');
  console.log('========================================\n');

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

    // Find events with "(No Title)" that belong to Microsoft provider
    const noTitleEvents = await prisma.calendarEvent.findMany({
      where: {
        providerId: msProvider.id,
        title: '(No Title)',
        isDeleted: false,
      },
      select: {
        id: true,
        externalId: true,
        calendarId: true,
        calendarName: true,
        startTime: true,
      },
    });

    console.log(`Found ${noTitleEvents.length} events with "(No Title)"\n`);

    if (noTitleEvents.length === 0) {
      console.log('No events to fix!');
      return;
    }

    let fixed = 0;
    let errors = 0;

    for (const event of noTitleEvents) {
      try {
        // Fetch event from Microsoft Graph
        const msEvent = await client.api(`/me/events/${event.externalId}`).get();

        if (msEvent.subject && msEvent.subject.trim() !== '') {
          // Update the event title in database
          await prisma.calendarEvent.update({
            where: { id: event.id },
            data: { title: msEvent.subject },
          });

          console.log(`✅ Fixed: "${msEvent.subject}" (${event.startTime.toISOString().substring(0, 10)})`);
          fixed++;
        } else {
          // Try to extract title from body or other fields
          let extractedTitle: string | null = null;

          // Check body for birthday name
          if (msEvent.body?.content) {
            const bodyText = msEvent.body.content.replace(/<[^>]*>/g, '').trim();
            if (bodyText && bodyText.length > 0 && bodyText.length < 100) {
              extractedTitle = bodyText.split('\n')[0].trim();
            }
          }

          // Check organizer for birthday
          if (!extractedTitle && event.calendarName?.toLowerCase().includes('compleann')) {
            if (msEvent.organizer?.emailAddress?.name) {
              extractedTitle = `Compleanno di ${msEvent.organizer.emailAddress.name}`;
            }
          }

          if (extractedTitle) {
            await prisma.calendarEvent.update({
              where: { id: event.id },
              data: { title: extractedTitle },
            });
            console.log(`✅ Extracted: "${extractedTitle}" (${event.startTime.toISOString().substring(0, 10)})`);
            fixed++;
          } else {
            console.log(`⚠️ Still no title for event ${event.externalId?.substring(0, 30)}...`);
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`❌ Error fetching event ${event.externalId?.substring(0, 30)}...: ${errMsg.substring(0, 50)}`);
        errors++;
      }
    }

    console.log('\n========================================');
    console.log('📊 Summary');
    console.log('========================================');
    console.log(`Total events with "(No Title)": ${noTitleEvents.length}`);
    console.log(`✅ Fixed: ${fixed}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`⚠️ Remaining: ${noTitleEvents.length - fixed - errors}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
