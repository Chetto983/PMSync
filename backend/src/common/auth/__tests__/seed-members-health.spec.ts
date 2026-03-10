/**
 * Health check: every user with a non-null tenantId must have a Member record.
 * Requires DATABASE_URL. Skips gracefully when no DB is available.
 */
import { createPrismaClient } from '../../../prisma/prisma-client.factory';

const canConnect = !!process.env.DATABASE_URL;

const describeOrSkip = canConnect ? describe : describe.skip;

describeOrSkip('Seed Members Health Check', () => {
  const prisma = createPrismaClient();

  afterAll(() => prisma.$disconnect());

  it('every user with tenantId has a corresponding Member record', async () => {
    const users = await prisma.user.findMany({
      where: { tenantId: { not: null } },
      select: { id: true, tenantId: true },
    });

    const missing: string[] = [];
    for (const u of users) {
      const member = await prisma.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: u.tenantId!,
            userId: u.id,
          },
        },
      });
      if (!member) missing.push(u.id);
    }

    expect(missing).toEqual(
      expect.arrayContaining([]),
    );
    if (missing.length > 0) {
      fail(
        `Users missing Member records: [${missing.join(', ')}]. ` +
        'Run: npx ts-node backend/prisma/seed-members.ts',
      );
    }
  });
});
