/**
 * Delete and resync Gmail folders to fix stale specialUse data
 *
 * Run: npx ts-node backend/scripts/resync-gmail-folders.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== Gmail Folders Resync ===\n');

  // Find Gmail provider
  const gmailProvider = await prisma.providerConfig.findFirst({
    where: {
      providerType: 'google',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
    },
  });

  if (!gmailProvider) {
    console.log('❌ No active Gmail provider found');
    return;
  }

  console.log(`Found Gmail provider: ${gmailProvider.email}`);
  console.log(`Provider ID: ${gmailProvider.id}`);

  // Count current folders
  const folderCount = await prisma.folder.count({
    where: { providerId: gmailProvider.id },
  });
  console.log(`Current folder count: ${folderCount}`);

  // Show current folders with specialUse
  const currentFolders = await prisma.folder.findMany({
    where: { providerId: gmailProvider.id },
    select: { name: true, specialUse: true, path: true },
    orderBy: { name: 'asc' },
  });

  console.log('\nCurrent folders:');
  for (const f of currentFolders) {
    console.log(`  ${f.name.padEnd(25)} [${(f.specialUse || 'null').padEnd(20)}] path: ${f.path}`);
  }

  // Delete all folders for this provider
  console.log('\nDeleting all Gmail folders...');
  const deleteResult = await prisma.folder.deleteMany({
    where: { providerId: gmailProvider.id },
  });
  console.log(`✅ Deleted ${deleteResult.count} folders`);

  // Also delete any emails to force full resync
  console.log('\nDeleting all Gmail emails (for clean resync)...');
  const emailDeleteResult = await prisma.email.deleteMany({
    where: { providerId: gmailProvider.id },
  });
  console.log(`✅ Deleted ${emailDeleteResult.count} emails`);

  // Reset sync state
  console.log('\nResetting sync state...');
  await prisma.providerConfig.update({
    where: { id: gmailProvider.id },
    data: {
      lastSyncedAt: null,
    },
  });
  console.log('✅ Reset lastSyncedAt to null');

  console.log('\n✅ Gmail data cleared. Trigger sync to re-fetch folders.');
  console.log('   Use the API endpoint: POST /api/v1/email/sync/{providerId}');
  console.log(`   Provider ID: ${gmailProvider.id}`);

  await prisma.$disconnect();
}

main().catch(console.error);
