/**
 * Debug script for calendar delete issues
 * Run with: node scripts/debug-calendar-delete.js
 */
const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('=== Calendar Delete Debug ===\n');

    // Get a Microsoft event
    const events = await prisma.calendarEvent.findMany({
        where: {
            isDeleted: false,
            provider: {
                providerType: 'microsoft'
            }
        },
        include: {
            provider: true
        },
        take: 3
    });

    if (events.length === 0) {
        console.log('No Microsoft calendar events found');
        return;
    }

    console.log(`Found ${events.length} Microsoft events:\n`);

    for (const event of events) {
        console.log('---');
        console.log(`  ID (internal): ${event.id}`);
        console.log(`  External ID: ${event.externalId.substring(0, 50)}...`);
        console.log(`  Calendar ID: ${event.calendarId?.substring(0, 50) || 'null'}...`);
        console.log(`  Calendar Name: ${event.calendarName}`);
        console.log(`  Title: ${event.title}`);
        console.log(`  Provider: ${event.provider.providerType} (${event.provider.email})`);
    }

    console.log('\n=== External ID Format Analysis ===');
    const event = events[0];
    console.log(`Full External ID length: ${event.externalId.length}`);
    console.log(`Full External ID: ${event.externalId}`);
    console.log(`\nMicrosoft Graph API expects: DELETE /me/events/{id}`);
    console.log(`Where {id} is the Microsoft event ID`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

