import { createPrismaClient } from '../src/prisma/prisma-client.factory';

/**
 * One-time migration: create Member records for all existing users
 * that have a tenantId but no corresponding Member record.
 *
 * This ensures existing users work with the better-auth organization plugin.
 * All members get role 'admin' per the flat role model (ORG-03).
 */
const prisma = createPrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { tenantId: { not: null } },
    select: { id: true, tenantId: true },
  });

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.tenantId) continue;

    const existing = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: user.tenantId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.member.create({
      data: {
        organizationId: user.tenantId,
        userId: user.id,
        role: 'admin',
      },
    });
    created++;
  }

  console.log(
    `Migration complete: ${created} member records created, ${skipped} skipped`,
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
