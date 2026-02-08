import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 168); // 1 week

  const [inWindow, totalUntriaged, latestDate] = await Promise.all([
    prisma.email.count({
      where: {
        tenantId: 'cmjgylxkg000054yhnjpkmzd9',
        providerId: 'cmldrhg9u000014yhb853onsl',
        isAutoTriaged: false,
        receivedAt: { gte: cutoff },
        isDeleted: false,
        isDraft: false,
      },
    }),
    prisma.email.count({
      where: {
        tenantId: 'cmjgylxkg000054yhnjpkmzd9',
        providerId: 'cmldrhg9u000014yhb853onsl',
        isAutoTriaged: false,
      },
    }),
    prisma.email.findFirst({
      where: {
        tenantId: 'cmjgylxkg000054yhnjpkmzd9',
        providerId: 'cmldrhg9u000014yhb853onsl',
      },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    }),
  ]);

  console.log(`Cutoff: ${cutoff.toISOString()}`);
  console.log(`Latest PST email: ${latestDate?.receivedAt?.toISOString()}`);
  console.log(`PST emails in 1-week window: ${inWindow}`);
  console.log(`Total untriaged PST: ${totalUntriaged}`);

  await prisma.$disconnect();
}

main().catch(console.error);
