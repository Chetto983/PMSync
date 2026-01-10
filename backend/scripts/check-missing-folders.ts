/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'dvdmarchetto@gmail.com' } })
    || await prisma.tenant.findFirst({ where: { name: { contains: 'dvdmarchetto' } } });
  if (!tenant) { console.log('No tenant'); return; }

  // Check what folders the missing emails are in
  const folderDistribution = await prisma.$queryRaw<{folder: string, count: bigint}[]>`
    SELECT e."folder", COUNT(*) as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE e."tenantId" = ${tenant.id}
    AND emb.id IS NULL
    GROUP BY e."folder"
    ORDER BY count DESC
    LIMIT 15
  `;

  console.log('=== FOLDERS WITH MISSING EMBEDDINGS ===');
  for (const r of folderDistribution) {
    console.log((r.folder || '(null)') + ': ' + r.count + ' emails');
  }

  // Check scheduler query - how many would it find?
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const excludedPatterns = ['spam', 'junk', 'trash', 'deleted', 'archive', 'posta indesiderata', 'cestino'];
  
  const orphanCount = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE e."tenantId" = ${tenant.id}
    AND emb.id IS NULL
    AND e."isDeleted" = FALSE
    AND e."receivedAt" > ${thirtyDaysAgo}
  `;
  
  console.log('\n=== BACKFILL ELIGIBILITY ===');
  console.log('Emails within 30 days without embeddings: ' + orphanCount[0]?.count);

  // Check if spam/junk is being filtered correctly
  const spamCount = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    WHERE e."tenantId" = ${tenant.id}
    AND (
      LOWER(e."folder") LIKE '%spam%' 
      OR LOWER(e."folder") LIKE '%junk%'
      OR LOWER(e."folder") LIKE '%trash%'
      OR LOWER(e."folder") LIKE '%posta indesiderata%'
    )
  `;
  console.log('Spam/Junk/Trash emails (excluded): ' + spamCount[0]?.count);

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
