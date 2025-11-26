/* Quick embedding status monitor: queue counts + DB totals */
require('dotenv').config();
const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { createPrismaClient } = require('./prisma-client');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
});
const prisma = createPrismaClient();

async function main() {
  const q = new Queue('email-embedding', { connection: redis });
  const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  const failed = await q.getJobs(['failed'], 0, 10);

  const emailCount = await prisma.$queryRawUnsafe(
    'SELECT "tenantId", "providerId", COUNT(*)::int AS cnt FROM "emails" GROUP BY "tenantId", "providerId"',
  );
  const embeddingCount = await prisma.$queryRawUnsafe(
    'SELECT "tenantId", COUNT(*)::int AS cnt FROM "embeddings" GROUP BY "tenantId"',
  );

  console.log('Queue counts:', counts);
  if (failed.length) {
    console.log('Failed (top10):', failed.map((j) => ({ id: j.id, reason: j.failedReason })));
  }
  console.log('Emails per provider:', emailCount);
  console.log('Embeddings per tenant:', embeddingCount);

  await q.close();
  await prisma.$disconnect();
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
