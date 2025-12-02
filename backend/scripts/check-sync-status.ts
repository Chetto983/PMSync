/**
 * Check Sync Status
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('=== SYNC STATUS CHECK ===\n');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      providerType: true,
      isActive: true,
      lastSyncedAt: true,
      nextSyncAt: true,
      syncPriority: true,
      avgActivityRate: true,
      errorStreak: true,
      webhookSubscriptions: {
        where: { isActive: true },
        select: {
          id: true,
          resourcePath: true,
          lastNotificationAt: true,
          expiresAt: true,
        },
      },
    },
  });

  for (const p of providers) {
    console.log(`${p.providerType.toUpperCase()}: ${p.email}`);
    console.log(`  Active: ${p.isActive}`);
    console.log(`  Last Sync: ${p.lastSyncedAt}`);
    console.log(`  Next Sync: ${p.nextSyncAt}`);
    console.log(`  Sync Priority: ${p.syncPriority} (1=high, 5=low)`);
    console.log(`  Activity Rate: ${p.avgActivityRate?.toFixed(2) ?? 'N/A'} emails/hr`);
    console.log(`  Error Streak: ${p.errorStreak}`);

    if (p.webhookSubscriptions.length > 0) {
      console.log(`  Webhooks:`);
      for (const w of p.webhookSubscriptions) {
        console.log(`    - ${w.resourcePath}`);
        console.log(`      Last notification: ${w.lastNotificationAt}`);
        console.log(`      Expires: ${w.expiresAt}`);
      }
    } else {
      console.log(`  Webhooks: None`);
    }
    console.log('');
  }

  // Check if nextSyncAt is in the past (should be syncing)
  const now = new Date();
  console.log(`Current time: ${now.toISOString()}`);

  const dueProviders = providers.filter(
    (p) => p.isActive && (!p.nextSyncAt || new Date(p.nextSyncAt) <= now)
  );
  console.log(`\nProviders due for sync: ${dueProviders.length}`);
  dueProviders.forEach((p) => console.log(`  - ${p.email} (next: ${p.nextSyncAt})`));

  await prisma.$disconnect();
}

main().catch(console.error);
