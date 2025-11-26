const { createPrismaClient } = require('./prisma-client');
const prisma = createPrismaClient();
(async () => {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "providerId", "folder", COUNT(*)::int as cnt, SUM(CASE WHEN "isRead"=false THEN 1 ELSE 0 END)::int as unread FROM "emails" GROUP BY "providerId", "folder" ORDER BY "providerId", cnt DESC'
  );
  console.log(rows);
})()
  .catch((err) => { console.error(err); })
  .finally(() => prisma.$disconnect());
