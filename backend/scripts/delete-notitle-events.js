/**
 * Delete old "(No Title)" events to force fresh sync
 * This will delete the local copies so Microsoft can re-sync them with correct data
 * Run with: node scripts/delete-notitle-events.js
 */
const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('=== Deleting "(No Title)" Events for Fresh Sync ===\n');

    // Count events before
    const count = await prisma.calendarEvent.count({
        where: {
            title: '(No Title)',
            isDeleted: false,
        }
    });

    console.log(`Found ${count} events with "(No Title)"\n`);

    if (count === 0) {
        console.log('No events to delete!');
        return;
    }

    // Delete them (hard delete so they can be re-synced)
    const result = await prisma.calendarEvent.deleteMany({
        where: {
            title: '(No Title)',
            isDeleted: false,
        }
    });

    console.log(`✅ Deleted ${result.count} events`);
    console.log('\n📋 Next steps:');
    console.log('1. Run: node scripts/force-full-calendar-sync.js');
    console.log('2. Click "Aggiorna calendari" in the UI');
    console.log('3. This will re-sync all events with correct titles from Microsoft');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
