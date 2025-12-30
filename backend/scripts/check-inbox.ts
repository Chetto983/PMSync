/**
 * Check INBOX folder configuration
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== INBOX Folder Analysis ===\n');

  // Get all folders that might be INBOX
  const folders = await prisma.folder.findMany({
    where: {
      OR: [
        { specialUse: 'INBOX' },
        { specialUse: 'CATEGORY_PERSONAL' },
        { name: { contains: 'Posta in arrivo', mode: 'insensitive' } },
        { name: { contains: 'INBOX', mode: 'insensitive' } },
        { path: { equals: 'INBOX', mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      name: true,
      path: true,
      specialUse: true,
      isSystem: true,
      unreadCount: true,
      totalCount: true,
      provider: { select: { email: true, providerType: true } }
    }
  });

  console.log('Folders that might be INBOX:\n');
  folders.forEach(f => {
    console.log(`Provider: ${f.provider.email} (${f.provider.providerType})`);
    console.log(`  Name: "${f.name}"`);
    console.log(`  Path: "${f.path}"`);
    console.log(`  specialUse: ${f.specialUse || 'null'}`);
    console.log(`  isSystem: ${f.isSystem}`);
    console.log(`  Counts: ${f.unreadCount} unread / ${f.totalCount} total`);
    console.log('');
  });

  // Check if there are folders with CATEGORY_PERSONAL that should be INBOX
  const categoryPersonal = await prisma.folder.findMany({
    where: { specialUse: 'CATEGORY_PERSONAL' },
    select: { name: true, path: true, provider: { select: { email: true } } }
  });

  if (categoryPersonal.length > 0) {
    console.log('\n⚠️  Folders with CATEGORY_PERSONAL (should these be INBOX?):\n');
    categoryPersonal.forEach(f => {
      console.log(`  ${f.provider.email}: name="${f.name}" path="${f.path}"`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
