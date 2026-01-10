/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function analyze() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'dvdmarchetto@gmail.com' } });
  if (!tenant) { console.log('Tenant not found'); return; }

  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);

  console.log('=== 30-DAY EMAILS WITHOUT EMBEDDINGS BY FOLDER ===\n');

  const result = await prisma.$queryRaw<{folder: string | null, count: bigint}[]>`
    SELECT e.folder, COUNT(*)::bigint as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."tenantId" = ${tenant.id}
      AND e."isDeleted" = FALSE
      AND e."receivedAt" > ${d30}
    GROUP BY e.folder
    ORDER BY count DESC
  `;

  console.log('Folder         | Missing | Would be processed?');
  console.log('---------------|---------|--------------------');

  const excludedPatterns = ['spam', 'junk', 'trash', 'deleted', 'archive'];
  let processable = 0;
  let excluded = 0;

  for (const r of result) {
    const folder = (r.folder || '(null)').toLowerCase();
    const isExcluded = excludedPatterns.some(p => folder.includes(p));
    const status = isExcluded ? '❌ Excluded' : '✅ Should process';
    console.log(`${(r.folder || '(null)').padEnd(15)}| ${String(r.count).padStart(7)} | ${status}`);

    if (isExcluded) {
      excluded += Number(r.count);
    } else {
      processable += Number(r.count);
    }
  }

  console.log('---------------|---------|--------------------');
  console.log(`Should process | ${String(processable).padStart(7)} |`);
  console.log(`Excluded       | ${String(excluded).padStart(7)} |`);

  // Now check with FULL scheduler conditions including folder join
  console.log('\n=== WITH FULL SCHEDULER FOLDER JOIN ===');
  const fullQuery = await prisma.$queryRaw<{folder: string | null, specialUse: string | null, count: bigint}[]>`
    SELECT e.folder, f."specialUse", COUNT(*)::bigint as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    LEFT JOIN folders f ON f."providerId" = e."providerId"
      AND (f.path = e.folder OR f.name = e.folder OR f."externalId" = e.folder)
    WHERE emb.id IS NULL
      AND e."tenantId" = ${tenant.id}
      AND e."isDeleted" = FALSE
      AND e."receivedAt" > ${d30}
    GROUP BY e.folder, f."specialUse"
    ORDER BY count DESC
  `;

  console.log('\nFolder         | specialUse         | Count | Scheduler excludes?');
  console.log('---------------|--------------------|-------|--------------------');

  const EXCLUDED_SPECIAL = ['SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED'];
  let schedulerProcessable = 0;

  for (const r of fullQuery) {
    const isSpecialExcluded = EXCLUDED_SPECIAL.includes(r.specialUse || '');
    const isFolderExcluded = excludedPatterns.some(p => (r.folder || '').toLowerCase().includes(p));
    const isExcluded = isSpecialExcluded || isFolderExcluded;
    const status = isExcluded ? '❌ YES' : '✅ NO';
    console.log(`${(r.folder || '(null)').padEnd(15)}| ${(r.specialUse || '(null)').padEnd(18)} | ${String(r.count).padStart(5)} | ${status}`);

    if (!isExcluded) {
      schedulerProcessable += Number(r.count);
    }
  }

  console.log(`\n📊 Scheduler should process: ${schedulerProcessable} emails`);

  await prisma.$disconnect();
}

analyze().catch(e => { console.error(e); process.exit(1); });
