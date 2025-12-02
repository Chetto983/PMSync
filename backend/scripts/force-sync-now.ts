/**
 * Force Sync Now - Reset nextSyncAt to trigger immediate sync
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('=== FORCING IMMEDIATE SYNC ===\n');

  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Update all providers to sync immediately
  const result = await prisma.providerConfig.updateMany({
    where: { tenantId: TENANT_ID, isActive: true },
    data: {
      nextSyncAt: fiveMinutesAgo,
      syncPriority: 1, // Temporarily set high priority
    },
  });

  console.log(`✅ Updated ${result.count} providers to sync immediately`);

  // Check updated providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      email: true,
      providerType: true,
      nextSyncAt: true,
      syncPriority: true,
    },
  });

  console.log('\nUpdated providers:');
  for (const p of providers) {
    console.log(`  ${p.providerType}: ${p.email}`);
    console.log(`    Next Sync: ${p.nextSyncAt}`);
    console.log(`    Priority: ${p.syncPriority}`);
  }

  console.log('\n⏳ The scheduler will pick this up in the next cron cycle (every 5 min)');
  console.log('   Or you can restart the backend to trigger immediately.');

  await prisma.$disconnect();
}

main().catch(console.error);
