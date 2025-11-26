const { createPrismaClient } = require('./prisma-client');

(async () => {
  const prisma = createPrismaClient();
  try {
    const counts = await prisma.email.groupBy({
      by: ['providerId'],
      _count: { providerId: true },
    });
    console.log('Email counts by provider:', counts);

    const totalEmbeddings = await prisma.embedding.count();
    console.log('Total embeddings:', totalEmbeddings);

    const latestEmbeddings = await prisma.embedding.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        documentName: true,
        metadata: true,
        createdAt: true,
      },
    });
    console.log('Latest embeddings:', latestEmbeddings);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
