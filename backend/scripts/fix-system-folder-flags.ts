/**
 * Fix isSystem flag for system folders
 * One-time migration to set isSystem=true for INBOX, SENT, DRAFTS, TRASH, SPAM, JUNK
 *
 * Run: npx ts-node -r dotenv/config backend/scripts/fix-system-folder-flags.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== Fixing System Folder Flags ===\n');

  const systemSpecialUses = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK'];

  // Find folders that need fixing
  const needsFix = await prisma.folder.findMany({
    where: {
      specialUse: { in: systemSpecialUses },
      isSystem: false,
    },
    select: {
      id: true,
      path: true,
      specialUse: true,
      provider: { select: { email: true, providerType: true } },
    },
  });

  if (needsFix.length === 0) {
    console.log('✅ All system folders already have correct isSystem flag');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${needsFix.length} folders that need isSystem=true:`);
  for (const f of needsFix) {
    console.log(`  - ${f.provider.providerType}:${f.provider.email} ${f.path} [${f.specialUse}]`);
  }

  // Update all at once
  const result = await prisma.folder.updateMany({
    where: {
      specialUse: { in: systemSpecialUses },
      isSystem: false,
    },
    data: {
      isSystem: true,
    },
  });

  console.log(`\n✅ Updated ${result.count} folders to isSystem=true`);

  // Verify
  const stillBroken = await prisma.folder.count({
    where: {
      specialUse: { in: systemSpecialUses },
      isSystem: false,
    },
  });

  if (stillBroken > 0) {
    console.log(`❌ ${stillBroken} folders still have isSystem=false`);
  } else {
    console.log('✅ All system folders now have correct isSystem flag');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
