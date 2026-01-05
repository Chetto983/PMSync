/**
 * Purge stress test data
 * Deletes all providers with emails ending in "@test.local"
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔍 Scanning for stress test data (@test.local)...');

    const testProviders = await prisma.providerConfig.findMany({
        where: {
            OR: [
                { email: { endsWith: '@test.local' } },
                { email: { equals: 'test@example.com', mode: 'insensitive' } }
            ]
        },
        select: { id: true, email: true }
    });

    if (testProviders.length === 0) {
        console.log('✅ No stress test data found.');
        await prisma.$disconnect();
        return;
    }

    console.log(`found ${testProviders.length} test providers.`);
    console.log('⚠️  Starting PURGE in 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('🗑️  Deleting test providers (and cascading to emails/folders)...');

    // Delete in batches to avoid transaction timeouts if needed, but deleteMany is usually fast enough
    // For 500 providers, single deleteMany is fine.
    // Wait, there are 500 providers but 250k emails. 
    // Cascade delete of 500 providers might take a while but Postgres can handle it.

    const result = await prisma.providerConfig.deleteMany({
        where: {
            OR: [
                { email: { endsWith: '@test.local' } },
                { email: { equals: 'test@example.com', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`✅ PURGE COMPLETE.`);
    console.log(`   - Deleted ${result.count} test providers.`);

    // Verify what remains
    const remaining = await prisma.providerConfig.findMany({
        select: { email: true }
    });

    console.log('---------- REMAINING ACCOUNTS ----------');
    remaining.forEach(p => console.log(`   - ${p.email}`));
    console.log('----------------------------------------');

    await prisma.$disconnect();
}

main().catch(console.error);
