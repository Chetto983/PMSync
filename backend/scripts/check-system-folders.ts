import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  const folders = await prisma.folder.findMany({
    where: {
      specialUse: { in: ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK'] }
    },
    select: {
      id: true,
      path: true,
      specialUse: true,
      isSystem: true,
      provider: { select: { providerType: true, email: true } }
    }
  });

  console.log('\n=== System Folders Status ===\n');
  console.log('Provider'.padEnd(30), 'Path'.padEnd(15), 'specialUse'.padEnd(12), 'isSystem');
  console.log('-'.repeat(75));

  for (const f of folders) {
    const flag = f.isSystem ? '✅ true' : '❌ false';
    console.log(
      `${f.provider.providerType}:${f.provider.email}`.padEnd(30).slice(0, 30),
      f.path.padEnd(15).slice(0, 15),
      (f.specialUse || '').padEnd(12),
      flag
    );
  }

  const needsFix = folders.filter(f => !f.isSystem);
  if (needsFix.length > 0) {
    console.log(`\n⚠️  ${needsFix.length} folders need isSystem=true`);
  } else {
    console.log('\n✅ All system folders have correct isSystem flag');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
