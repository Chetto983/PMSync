// DESTRUCTIVE - clean slate wipe after tenant deletion
// Phrase: WIPE ALL I TELL U AND START CLEAN (2026-04-20)
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const host = new URL(connectionString).host;
console.log(`[target] ${host}`);

if (!host.includes('rlwy.net') && !host.includes('railway') && !host.includes('ballast.proxy')) {
  console.error('Refusing: host does not look like Railway prod.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString, max: 3 });
const prisma = new PrismaClient({ adapter, log: ['error'] });

try {
  // Enumerate all public table names directly from Postgres
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const tables = rows.map((r) => r.tablename).filter((t) => !t.startsWith('_prisma_'));

  console.log(`[tables] ${tables.length} tables in public schema (excluding _prisma_migrations)`);

  // Pre-wipe counts
  const preCounts = {};
  for (const t of tables) {
    const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
    if (c > 0) preCounts[t] = c;
  }
  console.log('[pre-counts non-empty]', JSON.stringify(preCounts, null, 2));

  if (Object.keys(preCounts).length === 0) {
    console.log('[done] already empty, no wipe needed');
  } else {
    // Single transactional DELETE with session_replication_role=replica to bypass FKs
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = replica`);
      for (const t of tables) {
        const n = preCounts[t];
        if (!n) continue;
        await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
        console.log(`[wiped] ${t} (${n} rows)`);
      }
      await tx.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
    });

    // Verify
    const postCounts = {};
    for (const t of tables) {
      const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      if (c > 0) postCounts[t] = c;
    }
    console.log('[post-counts non-empty]', JSON.stringify(postCounts, null, 2));
    console.log(`[done] ${Object.keys(preCounts).length} tables cleared. schema intact.`);
  }
} catch (e) {
  console.error('[FAIL]', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
