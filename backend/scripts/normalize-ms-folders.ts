/**
 * Refresh Microsoft folder counts without renaming folders.
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/normalize-ms-folders.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  const providers = await prisma.providerConfig.findMany({
    where: { providerType: 'microsoft' },
    select: { id: true },
  });

  for (const provider of providers) {
    // Refresh folder counts based on existing folder names (no renaming)
    const folderCounts = await prisma.email.groupBy({
      by: ['folder'],
      where: { providerId: provider.id },
      _count: { _all: true },
      _sum: { isRead: true },
    });

    let updated = 0;
    for (const fc of folderCounts) {
      if (!fc.folder) continue;
      const folder = await prisma.folder.findFirst({
        where: { providerId: provider.id, name: fc.folder },
        select: { id: true },
      });
      if (folder) {
        const unreadCount = await prisma.email.count({
          where: { providerId: provider.id, folder: fc.folder, isRead: false },
        });
        await prisma.folder.update({
          where: { id: folder.id },
          data: { totalCount: fc._count._all, unreadCount },
        });
        updated += 1;
      }
    }

    console.log(
      `Provider ${provider.id}: updated ${updated} folder counts (names preserved)`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
