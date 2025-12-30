/**
 * Fix Gmail INBOX folder specialUse
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== Fixing Gmail INBOX ===\n');

  // Find and fix Gmail INBOX
  const result = await prisma.folder.updateMany({
    where: {
      path: 'INBOX',
      specialUse: 'CATEGORY_PERSONAL'
    },
    data: {
      specialUse: 'INBOX'
    }
  });
  console.log('Updated folders:', result.count);

  // Verify
  const folders = await prisma.folder.findMany({
    where: { path: 'INBOX' },
    select: { name: true, specialUse: true, provider: { select: { email: true } } }
  });
  console.log('\nINBOX folders after fix:');
  folders.forEach(f => console.log(`  ${f.provider.email}: specialUse=${f.specialUse}`));

  await prisma.$disconnect();
}

main().catch(console.error);
