/**
 * Check folder system status
 * Validates isSystem field after migration
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== Folder System Status ===\n');

  // Get folders ordered by isSystem
  const folders = await prisma.folder.findMany({
    select: { name: true, specialUse: true, isSystem: true },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    take: 25
  });

  console.log('name | specialUse | isSystem');
  console.log('-------------------------------------------');
  folders.forEach(f => {
    console.log(`${f.name.padEnd(25)} | ${(f.specialUse || 'null').padEnd(15)} | ${f.isSystem}`);
  });

  // Get stats
  const systemCount = await prisma.folder.count({ where: { isSystem: true } });
  const userCount = await prisma.folder.count({ where: { isSystem: false } });

  console.log('\n=== Stats ===');
  console.log(`System folders (protected): ${systemCount}`);
  console.log(`User folders (editable): ${userCount}`);

  // Check for any folders with specialUse but isSystem=false (should not happen)
  const mismatched = await prisma.folder.findMany({
    where: {
      specialUse: { not: null },
      isSystem: false
    },
    select: { name: true, specialUse: true }
  });

  if (mismatched.length > 0) {
    console.log('\n⚠️  MISMATCHED (specialUse set but isSystem=false):');
    mismatched.forEach(f => console.log(`  - ${f.name}: ${f.specialUse}`));
  } else {
    console.log('\n✅ All folders correctly configured');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
