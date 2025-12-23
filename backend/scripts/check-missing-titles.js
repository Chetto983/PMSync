require('dotenv').config();
const { createPrismaClient } = require('./prisma-client');

async function main() {
    const prisma = createPrismaClient();

    try {
        console.log('🔍 Checking for missing Microsoft Calendar titles...\n');

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

        const missingTitles = await prisma.calendarEvent.findMany({
            where: {
                providerId: { in: msProviderIds },
                title: '(No Title)',
            },
            select: {
                id: true,
                externalId: true,
                title: true,
                calendarName: true,
                startTime: true,
                providerId: true,
            },
            orderBy: { startTime: 'desc' },
            take: 20,
        });

        console.log(`Found ${missingTitles.length} events with missing titles:\n`);

        missingTitles.forEach((event, i) => {
            const provider = msProviders.find(p => p.id === event.providerId);
            console.log(`${i + 1}. Calendar: ${event.calendarName}`);
            console.log(`   Title: "${event.title}"`);
            console.log(`   External ID: ${event.externalId.substring(0, 50)}...`);
            console.log(`   Start: ${event.startTime.toISOString()}`);
            console.log(`   Provider: ${provider?.email}\n`);
        });

        // Check total Microsoft events
        const totalMsEvents = await prisma.calendarEvent.count({
            where: { providerId: { in: msProviderIds } },
        });

        console.log(`Total Microsoft events: ${totalMsEvents}`);
        console.log(`Events with missing titles: ${missingTitles.length}`);
        if (totalMsEvents > 0) {
            console.log(`Percentage: ${((missingTitles.length / totalMsEvents) * 100).toFixed(2)}%`);
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
