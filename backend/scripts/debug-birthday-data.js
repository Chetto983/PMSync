/**
 * Debug birthday events to see what data we have
 */
const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('=== No Title Event Data Analysis ===\n');

    // Get events with No Title
    const events = await prisma.calendarEvent.findMany({
        where: {
            title: '(No Title)',
            isDeleted: false,
        },
        take: 5
    });

    console.log(`Found ${events.length} "(No Title)" events:\n`);

    for (const event of events) {
        console.log('---');
        console.log(`ID: ${event.id}`);
        console.log(`Title: "${event.title}"`);
        console.log(`Calendar: ${event.calendarName}`);
        console.log(`Date: ${event.startTime}`);
        console.log(`Description length: ${event.description?.length || 0}`);
        console.log(`Organizer: ${event.organizer || 'null'}`);
        console.log(`Attendees: ${event.attendees ? JSON.stringify(event.attendees).substring(0, 100) : 'null'}`);
    }

    // Also count by calendar
    const counts = await prisma.calendarEvent.groupBy({
        by: ['calendarName'],
        where: {
            title: '(No Title)',
            isDeleted: false,
        },
        _count: true
    });

    console.log('\n=== Counts by Calendar ===');
    for (const c of counts) {
        console.log(`${c.calendarName}: ${c._count} events`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
