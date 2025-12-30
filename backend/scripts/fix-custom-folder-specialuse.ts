/**
 * Fix custom Gmail folders that incorrectly have specialUse set
 * Custom folders (Label_XX) should have specialUse = null
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== Fixing Custom Folder specialUse ===\n');

  // Find folders where externalId is Label_XX but specialUse is not null
  const brokenFolders = await prisma.folder.findMany({
    where: {
      AND: [
        {
          OR: [
            { externalId: { startsWith: 'Label_' } },
            { externalId: { startsWith: 'label_' } },
          ]
        },
        { specialUse: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      path: true,
      externalId: true,
      specialUse: true,
    },
  });

  console.log(`Found ${brokenFolders.length} custom folders with incorrect specialUse:`);
  brokenFolders.forEach(f => {
    console.log(`  - ${f.name}: specialUse="${f.specialUse}" → will set to null`);
  });

  if (brokenFolders.length === 0) {
    console.log('\n✅ No folders need fixing!');
    return;
  }

  // Fix them
  const result = await prisma.folder.updateMany({
    where: {
      id: { in: brokenFolders.map(f => f.id) },
    },
    data: {
      specialUse: null,
      isSystem: false,
    },
  });

  console.log(`\n✅ Fixed ${result.count} folders`);
  console.log('\nRun folder sync or refresh the page to see the correct names.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
