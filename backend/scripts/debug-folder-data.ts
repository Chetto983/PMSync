/**
 * Debug script to check folder data in database
 */

import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get all providers and their folders
  const providers = await prisma.providerConfig.findMany({
    where: { isActive: true },
    include: {
      folders: {
        select: { name: true, specialUse: true, path: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  for (const provider of providers) {
    console.log(`\n=== ${provider.providerType.toUpperCase()}: ${provider.email} ===`);
    for (const f of provider.folders) {
      const specialUse = f.specialUse ? `[${f.specialUse}]` : '';
      console.log(`  ${f.name.padEnd(30)} ${specialUse.padEnd(20)} path: ${f.path}`);
    }
  }

  // Check for INBOX specifically
  console.log('\n=== FOLDERS WITH INBOX SPECIALUSE ===');
  const inboxFolders = await prisma.folder.findMany({
    where: { specialUse: 'INBOX' },
    select: { name: true, specialUse: true, provider: { select: { email: true, providerType: true } } },
  });

  if (inboxFolders.length === 0) {
    console.log('  NO FOLDERS WITH specialUse=INBOX found!');
  } else {
    for (const f of inboxFolders) {
      console.log(`  ${f.provider.providerType}: ${f.provider.email} -> ${f.name}`);
    }
  }

  // Check for all unique specialUse values
  console.log('\n=== ALL UNIQUE SPECIALUSE VALUES ===');
  const uniqueSpecialUse = await prisma.folder.groupBy({
    by: ['specialUse'],
    _count: true,
    orderBy: { _count: { specialUse: 'desc' } },
  });

  for (const item of uniqueSpecialUse) {
    console.log(`  ${(item.specialUse || 'null').padEnd(25)} count: ${item._count}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
