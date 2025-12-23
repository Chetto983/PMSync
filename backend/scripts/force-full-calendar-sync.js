const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function main() {
    console.log('🔄 Deleting sync states for fresh sync with debug logging...\n');

    const msProvider = await prisma.providerConfig.findFirst({
        where: {
            providerType: 'microsoft',
            email: 'chetto983@hotmail.it',
        },
    });

    if (!msProvider) {
        console.log('Microsoft provider not found.');
        return;
    }

    // Delete sync states
    await prisma.calendarSyncState.deleteMany({
        where: { providerId: msProvider.id },
    });

    console.log('✅ Sync states deleted');
    console.log('\n📋 Next steps:');
    console.log('1. Click "Aggiorna calendari" in the UI');
    console.log('2. Check backend terminal for "=== BIRTHDAY CALENDAR DEBUG ===" message');
    console.log('3. This will show the RAW data Microsoft sends for birthday events');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
