/// <reference types="node" />
/**
 * Debug the exact findOrphanEmails query from the scheduler
 * to understand why only 1 email is being found
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

// Same excluded patterns as scheduler
const EXCLUDED_SPECIAL_USE = ['SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED'];
const EXCLUDED_FOLDER_PATTERNS = [
  'spam', 'junk', 'trash', 'deleted', 'archive',
  'posta indesiderata', 'cestino', 'eliminat', 'archivi',
  '[gmail]/spam', '[gmail]/trash', '[gmail]/all mail',
  'deleted items', 'junk email', 'junk e-mail',
];

async function debug() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'dvdmarchetto@gmail.com' } });
  if (!tenant) { console.log('Tenant not found'); return; }

  console.log(`Tenant: ${tenant.slug || tenant.name} (${tenant.id})`);

  // BACKFILL_DAYS = 30
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - 30);
  console.log(`\nLimit date (30 days ago): ${limitDate.toISOString()}`);

  // Step 1: Count all emails for this tenant
  const totalEmails = await prisma.email.count({ where: { tenantId: tenant.id } });
  console.log(`\nTotal emails: ${totalEmails}`);

  // Step 2: Count emails within 30 days
  const recentEmails = await prisma.email.count({
    where: { tenantId: tenant.id, receivedAt: { gt: limitDate } }
  });
  console.log(`Emails in last 30 days: ${recentEmails}`);

  // Step 3: Count emails without embeddings (simple check)
  const withoutEmbSimple = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL AND e."tenantId" = ${tenant.id}
  `;
  console.log(`Emails without embeddings (simple): ${withoutEmbSimple[0]?.count}`);

  // Step 4: Check if folder table has entries for this provider
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, email: true }
  });
  console.log(`\nProviders: ${providers.map(p => `${p.email} (${p.id})`).join(', ')}`);

  for (const provider of providers) {
    const folderCount = await prisma.folder.count({ where: { providerId: provider.id } });
    console.log(`  Folders for ${provider.email}: ${folderCount}`);
  }

  // Step 5: Check email folder values
  const folderDistribution = await prisma.$queryRaw<{folder: string | null, count: bigint}[]>`
    SELECT e.folder, COUNT(*) as count
    FROM emails e
    WHERE e."tenantId" = ${tenant.id}
    GROUP BY e.folder
    ORDER BY count DESC
  `;
  console.log(`\n=== EMAIL FOLDER VALUES ===`);
  for (const f of folderDistribution) {
    console.log(`  "${f.folder || '(null)'}": ${f.count}`);
  }

  // Step 6: Check folder table values
  const folderTableValues = await prisma.$queryRaw<{name: string | null, path: string | null, externalId: string | null, specialUse: string | null}[]>`
    SELECT f.name, f.path, f."externalId", f."specialUse"
    FROM folders f
    JOIN provider_configs p ON p.id = f."providerId"
    WHERE p."tenantId" = ${tenant.id}
  `;
  console.log(`\n=== FOLDER TABLE VALUES ===`);
  for (const f of folderTableValues) {
    console.log(`  name="${f.name}", path="${f.path}", externalId="${f.externalId}", specialUse="${f.specialUse}"`);
  }

  // Step 7: Check which emails have folder matching
  const folderMatchCheck = await prisma.$queryRaw<{folder: string | null, matched: boolean, count: bigint}[]>`
    SELECT e.folder,
           (f.id IS NOT NULL) as matched,
           COUNT(*) as count
    FROM emails e
    LEFT JOIN folders f ON f."providerId" = e."providerId"
      AND (f."path" = e."folder" OR f."name" = e."folder" OR f."externalId" = e."folder")
    WHERE e."tenantId" = ${tenant.id}
    GROUP BY e.folder, (f.id IS NOT NULL)
    ORDER BY count DESC
  `;
  console.log(`\n=== FOLDER JOIN MATCH CHECK ===`);
  for (const f of folderMatchCheck) {
    console.log(`  folder="${f.folder || '(null)'}": matched=${f.matched}, count=${f.count}`);
  }

  // Step 8: Run the EXACT scheduler query
  const patternConditions = EXCLUDED_FOLDER_PATTERNS.map(p =>
    `LOWER(COALESCE(e."folder", '')) LIKE '%${p.toLowerCase()}%'`
  ).join(' OR ');

  const schedulerQuery = `
    SELECT COUNT(*)::bigint as count
    FROM "emails" e
    LEFT JOIN "embeddings" emb ON emb."emailId" = e."id" AND emb."tenantId" = e."tenantId"
    LEFT JOIN "folders" f ON f."providerId" = e."providerId"
      AND (f."path" = e."folder" OR f."name" = e."folder" OR f."externalId" = e."folder")
    WHERE emb."id" IS NULL
      AND e."isDeleted" = FALSE
      AND e."tenantId" = '${tenant.id}'
      AND e."receivedAt" > '${limitDate.toISOString()}'
      AND (f."specialUse" IS NULL OR f."specialUse" NOT IN ('${EXCLUDED_SPECIAL_USE.join("','")}'))
      AND NOT (${patternConditions})
  `;

  console.log(`\n=== SCHEDULER QUERY (verbose) ===`);
  console.log(schedulerQuery);

  const schedulerResult = await prisma.$queryRawUnsafe<{count: bigint}[]>(schedulerQuery);
  console.log(`\nScheduler query result: ${schedulerResult[0]?.count}`);

  // Step 9: Debug - What gets filtered by each condition?
  console.log(`\n=== DEBUGGING FILTER CONDITIONS ===`);

  // Without folder pattern filter
  const noFolderPatternFilter = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*)::bigint as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    LEFT JOIN folders f ON f."providerId" = e."providerId"
      AND (f.path = e.folder OR f.name = e.folder OR f."externalId" = e.folder)
    WHERE emb.id IS NULL
      AND e."isDeleted" = FALSE
      AND e."tenantId" = ${tenant.id}
      AND e."receivedAt" > ${limitDate}
      AND (f."specialUse" IS NULL OR f."specialUse" NOT IN ('SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED'))
  `;
  console.log(`Without folder pattern filter: ${noFolderPatternFilter[0]?.count}`);

  // Check what specialUse values exist
  const specialUseCheck = await prisma.$queryRaw<{specialUse: string | null, count: bigint}[]>`
    SELECT f."specialUse", COUNT(*) as count
    FROM emails e
    LEFT JOIN folders f ON f."providerId" = e."providerId"
      AND (f.path = e.folder OR f.name = e.folder OR f."externalId" = e.folder)
    WHERE e."tenantId" = ${tenant.id}
    GROUP BY f."specialUse"
  `;
  console.log(`\n=== SPECIALUSE VALUES AFTER JOIN ===`);
  for (const s of specialUseCheck) {
    console.log(`  specialUse="${s.specialUse || '(null)'}": ${s.count}`);
  }

  // Step 10: Sample 5 emails that SHOULD be found but aren't
  console.log(`\n=== SAMPLE INBOX EMAILS WITHOUT EMBEDDINGS ===`);
  const sampleInbox = await prisma.$queryRaw<any[]>`
    SELECT e.id, e.folder, e.subject, e."receivedAt", e."isDeleted",
           (emb.id IS NOT NULL) as has_embedding
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE e."tenantId" = ${tenant.id}
      AND LOWER(COALESCE(e.folder, '')) = 'inbox'
      AND emb.id IS NULL
    LIMIT 5
  `;
  for (const e of sampleInbox) {
    console.log(`  id=${e.id.slice(0,8)}..., folder="${e.folder}", receivedAt=${e.receivedAt?.toISOString()}, isDeleted=${e.isDeleted}`);
  }

  await prisma.$disconnect();
}

debug().catch(e => { console.error(e); process.exit(1); });
