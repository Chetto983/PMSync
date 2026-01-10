/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function debug() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'dvdmarchetto@gmail.com' } })
    || await prisma.tenant.findFirst({ where: { name: { contains: 'dvdmarchetto' } } });
  
  if (!tenant) { console.log('Tenant not found'); return; }
  console.log('Tenant:', tenant.slug || tenant.name);

  // 1. Check email distribution by date
  const emailsByMonth = await prisma.$queryRaw<{month: string, count: bigint}[]>`
    SELECT TO_CHAR("receivedAt", 'YYYY-MM') as month, COUNT(*) as count
    FROM emails WHERE "tenantId" = ${tenant.id}
    GROUP BY month ORDER BY month DESC LIMIT 6
  `;
  console.log('\n=== EMAILS BY MONTH ===');
  for (const r of emailsByMonth) {
    console.log(r.month + ': ' + r.count + ' emails');
  }

  // 2. Check emails WITH vs WITHOUT embeddings
  const withEmb = await prisma.email.count({
    where: { tenantId: tenant.id, embeddings: { some: {} } }
  });
  const withoutEmb = await prisma.email.count({
    where: { tenantId: tenant.id, embeddings: { none: {} } }
  });
  console.log('\n=== EMBEDDING STATUS ===');
  console.log('With embeddings: ' + withEmb);
  console.log('Without embeddings: ' + withoutEmb);

  // 3. Check emails without embeddings - why?
  const missing = await prisma.email.findMany({
    where: { tenantId: tenant.id, embeddings: { none: {} } },
    select: { 
      id: true, 
      subject: true, 
      bodyText: true, 
      bodyHtml: true,
      snippet: true,
      receivedAt: true 
    },
    take: 10,
    orderBy: { receivedAt: 'desc' }
  });
  
  console.log('\n=== SAMPLE EMAILS WITHOUT EMBEDDINGS ===');
  for (const e of missing) {
    const hasContent = !!(e.bodyText || e.bodyHtml || e.snippet);
    const contentLen = (e.bodyText || e.bodyHtml || e.snippet || '').length;
    console.log('- ' + (e.subject || '(no subject)').slice(0,50) + ' | content: ' + (hasContent ? contentLen + ' chars' : 'EMPTY'));
  }

  // 4. Check embedding queue status (BullMQ jobs in Redis)
  console.log('\n=== POSSIBLE CAUSES ===');
  const emptyContent = await prisma.email.count({
    where: { 
      tenantId: tenant.id, 
      embeddings: { none: {} },
      AND: [
        { bodyText: null },
        { bodyHtml: null },
        { snippet: null }
      ]
    }
  });
  console.log('Emails with NO content (bodyText/Html/snippet): ' + emptyContent);

  const recentWithout = await prisma.email.count({
    where: {
      tenantId: tenant.id,
      embeddings: { none: {} },
      receivedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  });
  console.log('Recent emails (7d) without embeddings: ' + recentWithout);

  // 5. What does the scheduler query actually find for this tenant?
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const schedulerWouldFind = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE e."tenantId" = ${tenant.id}
      AND emb.id IS NULL
      AND e."isDeleted" = FALSE
      AND e."receivedAt" > ${thirtyDaysAgo}
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%spam%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%trash%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%junk%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%archive%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%deleted%'
  `;
  console.log('Scheduler would find for THIS tenant: ' + schedulerWouldFind[0]?.count);

  // 6. Check ALL tenants
  const allTenantsOrphan = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count
    FROM emails e
    LEFT JOIN embeddings emb ON emb."emailId" = e.id AND emb."tenantId" = e."tenantId"
    WHERE emb.id IS NULL
      AND e."isDeleted" = FALSE
      AND e."receivedAt" > ${thirtyDaysAgo}
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%spam%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%trash%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%junk%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%archive%'
      AND LOWER(COALESCE(e.folder, '')) NOT LIKE '%deleted%'
  `;
  console.log('Scheduler would find across ALL tenants: ' + allTenantsOrphan[0]?.count);

  await prisma.$disconnect();
}
debug().catch(e => { console.error(e); process.exit(1); });
