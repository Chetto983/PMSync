/**
 * Fix missing titles for Microsoft birthday events
 * This script directly queries existing events and applies the title extraction logic
 * Run with: node scripts/fix-birthday-titles.js
 */
const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('=== Fixing Birthday Event Titles ===\n');

    // Find all Microsoft events with "(No Title)" 
    const noTitleEvents = await prisma.calendarEvent.findMany({
        where: {
            title: '(No Title)',
            isDeleted: false,
            provider: {
                providerType: 'microsoft'
            }
        },
        include: {
            provider: true
        }
    });

    console.log(`Found ${noTitleEvents.length} events with "(No Title)"\n`);

    if (noTitleEvents.length === 0) {
        console.log('No events to fix!');
        return;
    }

    let fixed = 0;
    let unchanged = 0;

    for (const event of noTitleEvents) {
        // Try to extract title from description/body
        let newTitle = null;
        const bodyContent = event.description || '';

        if (bodyContent) {
            // Look for birthday patterns
            const birthdayMatch = bodyContent.match(/(?:Birthday|Compleanno|Anniversaire):\s*(.+?)(?:\n|<|$)/i);
            if (birthdayMatch && birthdayMatch[1]) {
                newTitle = birthdayMatch[1].trim();
            } else {
                // Extract first non-empty line from body
                const firstLine = bodyContent
                    .replace(/<[^>]*>/g, '') // Remove HTML tags
                    .split('\n')
                    .map(l => l.trim())
                    .find(l => l.length > 0 && l.length < 100);
                if (firstLine) {
                    newTitle = firstLine;
                }
            }
        }

        // Check calendar name for context
        if (!newTitle && event.calendarName) {
            if (event.calendarName.toLowerCase().includes('birthday') ||
                event.calendarName.toLowerCase().includes('compleanno')) {
                // Use the event date to create a generic title
                const eventDate = new Date(event.startTime);
                const month = eventDate.toLocaleString('default', { month: 'long' });
                const day = eventDate.getDate();
                newTitle = `Birthday - ${month} ${day}`;
            }
        }

        if (newTitle && newTitle !== '(No Title)') {
            await prisma.calendarEvent.update({
                where: { id: event.id },
                data: { title: newTitle }
            });
            console.log(`✅ Fixed: "${event.id}" -> "${newTitle}"`);
            fixed++;
        } else {
            console.log(`⚠️  No title found for: ${event.id} (calendar: ${event.calendarName})`);
            unchanged++;
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Unchanged: ${unchanged}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
