/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function listTenants() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true }
  });
  console.log('=== ALL TENANTS ===');
  for (const t of tenants) {
    const emailCount = await prisma.email.count({ where: { tenantId: t.id } });
    const embCount = await prisma.embedding.count({ where: { tenantId: t.id, emailId: { not: null } } });
    const pct = emailCount > 0 ? ((embCount / emailCount) * 100).toFixed(1) : '0';
    console.log((t.slug || t.name) + ': ' + emailCount + ' emails, ' + embCount + ' emb (' + pct + '%)');
  }
  await prisma.$disconnect();
}
listTenants().catch(e => { console.error(e); process.exit(1); });
