const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('🔧 Fixing missing titles for Microsoft birthday events...\n');

    // Get Microsoft provider IDs
    const msProviders = await prisma.providerConfig.findMany({
        where: { providerType: 'microsoft' },
        select: { id: true, email: true },
    });

    if (msProviders.length === 0) {
        console.log('No Microsoft providers found.');
        return;
    }

    const msProviderIds = msProviders.map(p => p.id);

    // Find events with "(No Title)"
    const eventsToFix = await prisma.calendarEvent.findMany({
        where: {
            providerId: { in: msProviderIds },
            title: '(No Title)',
        },
        select: {
            id: true,
            externalId: true,
            title: true,
            calendarName: true,
            description: true,
            attendees: true,
            providerId: true,
        },
    });

    console.log(`Found ${eventsToFix.length} events to fix\n`);

    let fixed = 0;
    for (const event of eventsToFix) {
        let newTitle = null;

        // Try to extract from description
        if (event.description) {
            const birthdayMatch = event.description.match(/(?:Birthday|Compleanno):\s*(.+?)(?:\n|<|$)/i);
            if (birthdayMatch && birthdayMatch[1]) {
                newTitle = birthdayMatch[1].trim();
            } else {
                const firstLine = event.description
                    .replace(/<[^>]*>/g, '')
                    .split('\n')
                    .map(l => l.trim())
                    .find(l => l.length > 0 && l.length < 100);
                if (firstLine && !firstLine.includes('http')) {
                    newTitle = firstLine;
                }
            }
        }

        // Try attendees
        if (!newTitle && event.attendees) {
            try {
                const attendeesData = typeof event.attendees === 'string'
                    ? JSON.parse(event.attendees)
                    : event.attendees;
                if (Array.isArray(attendeesData) && attendeesData.length > 0) {
                    const firstAttendee = attendeesData[0];
                    if (firstAttendee?.emailAddress?.name) {
                        newTitle = `${firstAttendee.emailAddress.name}'s Birthday`;
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Calendar name fallback
        if (!newTitle && event.calendarName) {
            if (event.calendarName.toLowerCase().includes('birthday') ||
                event.calendarName.toLowerCase().includes('compleanno')) {
                newTitle = 'Birthday Event';
            }
        }

        if (newTitle) {
            await prisma.calendarEvent.update({
                where: { id: event.id },
                data: { title: newTitle },
            });
            console.log(`✅ Fixed: "${newTitle}" (was "(No Title)")`);
            fixed++;
        }
    }

    console.log(`\n✅ Fixed ${fixed} out of ${eventsToFix.length} events`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
