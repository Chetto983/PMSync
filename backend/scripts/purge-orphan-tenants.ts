/**
 * Purge orphan tenants
 * Deletes all tenants EXCEPT the one with real data
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();
    const KEEP_TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9'; // The one with 3 providers

    console.log(`🛡️  KEEPING Tenant: ${KEEP_TENANT_ID}`);
    console.log('---------------------------------------------------');

    const orphans = await prisma.tenant.findMany({
        where: {
            id: { not: KEEP_TENANT_ID }
        },
        select: { id: true, name: true, slug: true }
    });

    if (orphans.length === 0) {
        console.log('✅ No orphan tenants found.');
        await prisma.$disconnect();
        return;
    }

    console.log(`⚠️  Found ${orphans.length} orphan tenants.`);
    console.log('   (Example: ' + orphans[0].slug + ')');
    console.log('\nStarting PURGE in 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('🗑️  Deleting orphan tenants...');

    const result = await prisma.tenant.deleteMany({
        where: {
            id: { not: KEEP_TENANT_ID }
        }
    });

    console.log(`✅ PURGE COMPLETE.`);
    console.log(`   - Deleted ${result.count} tenants.`);

    await prisma.$disconnect();
}

main().catch(console.error);
