/**
 * Force IMAP Full Sync
 * Clears lastSyncedAt to trigger a full sync on next sync job
 *
 * Usage: npx ts-node scripts/force-imap-full-sync.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function forceFullSync() {
  console.log('\n=== Force IMAP Full Sync ===\n');

  const prisma = createPrismaClient();

  try {
    // Find IMAP providers
    const providers = await prisma.providerConfig.findMany({
      where: {
        providerType: 'imap',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        lastSyncedAt: true,
        metadata: true,
      },
    });

    console.log(`Found ${providers.length} IMAP provider(s)\n`);

    for (const provider of providers) {
      console.log(`Provider: ${provider.displayName || provider.email}`);
      console.log(`  ID: ${provider.id}`);
      console.log(`  Last Sync: ${provider.lastSyncedAt || 'NEVER'}`);

      // Clear lastSyncedAt AND metadata.lastSyncToken to force full sync
      // The sync decision is based on metadata.lastSyncToken, NOT lastSyncedAt
      const metadata = (provider.metadata as Record<string, any>) || {};
      delete metadata.lastSyncToken;

      await prisma.providerConfig.update({
        where: { id: provider.id },
        data: {
          lastSyncedAt: null,
          metadata: metadata,
        },
      });

      // Also clear folder sync tokens
      const folderResult = await prisma.folder.updateMany({
        where: { providerId: provider.id },
        data: { syncToken: null, lastSyncedAt: null },
      });

      console.log(`  Cleared lastSyncedAt for provider`);
      console.log(`  Cleared syncToken for ${folderResult.count} folders`);
      console.log(`  -> Next sync will be FULL SYNC\n`);
    }

    console.log('Done! Run the sync job to trigger full sync.\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceFullSync().catch(console.error);
