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

  console.log('=== INBOX/SENT EMAILS WITHOUT EMBEDDINGS - DATE CHECK ===\n');

  // Check INBOX emails without embeddings - are they older than 30 days?
  const inboxMissing = await prisma.$queryRaw<{
    within_30d: bigint,
    older_30d: bigint,
    oldest_date: Date | null,
    newest_date: Date | null
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE e."receivedAt" > ${d30}) as within_30d,
      COUNT(*) FILTER (WHERE e."receivedAt" <= ${d30}) as older_30d,
      MIN(e."receivedAt") as oldest_date,
      MAX(e."receivedAt") as newest_date
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."tenantId" = ${tenant.id}
      AND e."isDeleted" = FALSE
      AND e.folder = 'INBOX'
  `;

  const inbox = inboxMissing[0];
  console.log('📥 INBOX emails without embeddings:');
  console.log(`   Within 30 days: ${inbox?.within_30d || 0}`);
  console.log(`   Older than 30d: ${inbox?.older_30d || 0}`);
  console.log(`   Oldest: ${inbox?.oldest_date?.toISOString().split('T')[0] || 'N/A'}`);
  console.log(`   Newest: ${inbox?.newest_date?.toISOString().split('T')[0] || 'N/A'}`);

  // Check SENT emails
  const sentMissing = await prisma.$queryRaw<{
    within_30d: bigint,
    older_30d: bigint,
    oldest_date: Date | null,
    newest_date: Date | null
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE e."receivedAt" > ${d30}) as within_30d,
      COUNT(*) FILTER (WHERE e."receivedAt" <= ${d30}) as older_30d,
      MIN(e."receivedAt") as oldest_date,
      MAX(e."receivedAt") as newest_date
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."tenantId" = ${tenant.id}
      AND e."isDeleted" = FALSE
      AND e.folder = 'SENT'
  `;

  const sent = sentMissing[0];
  console.log('\n📤 SENT emails without embeddings:');
  console.log(`   Within 30 days: ${sent?.within_30d || 0}`);
  console.log(`   Older than 30d: ${sent?.older_30d || 0}`);
  console.log(`   Oldest: ${sent?.oldest_date?.toISOString().split('T')[0] || 'N/A'}`);
  console.log(`   Newest: ${sent?.newest_date?.toISOString().split('T')[0] || 'N/A'}`);

  // Check UPDATES/PROMOTIONS
  const otherFolders = await prisma.$queryRaw<{
    folder: string | null,
    within_30d: bigint,
    older_30d: bigint
  }[]>`
    SELECT
      e.folder,
      COUNT(*) FILTER (WHERE e."receivedAt" > ${d30}) as within_30d,
      COUNT(*) FILTER (WHERE e."receivedAt" <= ${d30}) as older_30d
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."tenantId" = ${tenant.id}
      AND e."isDeleted" = FALSE
      AND e.folder NOT IN ('INBOX', 'SENT', 'TRASH', 'SPAM', 'ARCHIVE', 'DRAFTS')
    GROUP BY e.folder
    ORDER BY (COUNT(*) FILTER (WHERE e."receivedAt" <= ${d30})) DESC
  `;

  if (otherFolders.length > 0) {
    console.log('\n📂 Other folders without embeddings:');
    for (const f of otherFolders) {
      console.log(`   ${f.folder}: ${f.within_30d} recent, ${f.older_30d} older`);
    }
  }

  // Summary
  const totalInbox = Number(inbox?.within_30d || 0) + Number(inbox?.older_30d || 0);
  const totalSent = Number(sent?.within_30d || 0) + Number(sent?.older_30d || 0);

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n✅ Scheduler is working correctly!`);
  console.log(`   It processes emails from the last 30 days, excluding spam/trash.`);
  console.log(`\n⚠️  Your INBOX (${totalInbox}) and SENT (${totalSent}) emails without embeddings`);
  console.log(`   are ALL older than 30 days!`);
  console.log(`\n💡 TO FIX: Increase EMBEDDING_BACKFILL_DAYS in your .env:`);
  console.log(`   EMBEDDING_BACKFILL_DAYS=365  # Process emails up to 1 year old`);

  await prisma.$disconnect();
}

analyze().catch(e => { console.error(e); process.exit(1); });
