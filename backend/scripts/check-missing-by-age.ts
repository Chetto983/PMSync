/// <reference types="node" />
/**
 * Check age distribution of emails without embeddings
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function analyze() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'dvdmarchetto@gmail.com' } });
  if (!tenant) { console.log('Tenant not found'); return; }

  console.log(`Tenant: ${tenant.slug || tenant.name}\n`);

  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
  const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
  const d180 = new Date(now); d180.setDate(d180.getDate() - 180);
  const d365 = new Date(now); d365.setDate(d365.getDate() - 365);

  console.log('=== EMAILS WITHOUT EMBEDDINGS BY AGE ===\n');

  // Helper to count orphan emails in a date range
  const countOrphans = async (startDate: Date | null, endDate: Date) => {
    const dateCondition = startDate
      ? `AND e."receivedAt" >= '${startDate.toISOString()}' AND e."receivedAt" < '${endDate.toISOString()}'`
      : `AND e."receivedAt" < '${endDate.toISOString()}'`;

    const result = await prisma.$queryRawUnsafe<{count: bigint}[]>(`
      SELECT COUNT(*)::bigint as count
      FROM emails e
      LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
      WHERE emb.id IS NULL
        AND e."tenantId" = '${tenant.id}'
        AND e."isDeleted" = FALSE
        ${dateCondition}
    `);
    return Number(result[0]?.count || 0);
  };

  // Count by age brackets (only non-deleted emails)
  const orphans0_30 = await countOrphans(d30, now);
  const orphans30_60 = await countOrphans(d60, d30);
  const orphans60_90 = await countOrphans(d90, d60);
  const orphans90_180 = await countOrphans(d180, d90);
  const orphans180_365 = await countOrphans(d365, d180);
  const orphans365plus = await countOrphans(null, d365);

  console.log('Age Range         | Missing Embeddings | Status');
  console.log('------------------|--------------------|---------');
  console.log(`0-30 days         | ${String(orphans0_30).padStart(18)} | ✅ In scheduler window`);
  console.log(`30-60 days        | ${String(orphans30_60).padStart(18)} | ❌ SKIPPED (beyond 30d)`);
  console.log(`60-90 days        | ${String(orphans60_90).padStart(18)} | ❌ SKIPPED (beyond 30d)`);
  console.log(`90-180 days       | ${String(orphans90_180).padStart(18)} | ❌ SKIPPED (beyond 30d)`);
  console.log(`180-365 days      | ${String(orphans180_365).padStart(18)} | ❌ SKIPPED (beyond 30d)`);
  console.log(`>365 days         | ${String(orphans365plus).padStart(18)} | ❌ SKIPPED (beyond 30d)`);
  console.log('------------------|--------------------|---------');
  const total = orphans0_30 + orphans30_60 + orphans60_90 + orphans90_180 + orphans180_365 + orphans365plus;
  console.log(`TOTAL             | ${String(total).padStart(18)} |`);

  // Check with isDeleted false and excluding spam/trash by folder name (like scheduler)
  const schedulerCount = await prisma.$queryRawUnsafe<{count: bigint}[]>(`
    SELECT COUNT(*)::bigint as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."tenantId" = '${tenant.id}'
      AND e."isDeleted" = FALSE
      AND e."receivedAt" > '${d30.toISOString()}'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%spam%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%trash%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%junk%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%archive%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%deleted%'
  `);

  console.log(`\n📊 Scheduler sees: ${schedulerCount[0]?.count || 0} emails (30d window, excluding spam/trash)`);

  // Show recommendation
  const needsBackfill = total - orphans0_30;
  if (needsBackfill > 0) {
    console.log(`\n⚠️  ${needsBackfill} emails are OLDER than 30 days and won't be processed!`);
    console.log(`\n💡 SOLUTION: Set EMBEDDING_BACKFILL_DAYS to a higher value:`);
    console.log(`   - For 60 days: EMBEDDING_BACKFILL_DAYS=60`);
    console.log(`   - For 90 days: EMBEDDING_BACKFILL_DAYS=90`);
    console.log(`   - For 180 days: EMBEDDING_BACKFILL_DAYS=180`);
    console.log(`   - For 1 year: EMBEDDING_BACKFILL_DAYS=365`);
    console.log(`   - For all time: EMBEDDING_BACKFILL_DAYS=3650 (10 years)`);
  }

  await prisma.$disconnect();
}

analyze().catch(e => { console.error(e); process.exit(1); });
