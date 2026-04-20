// DESTRUCTIVE - executed with explicit confirmation 2026-04-20
// Phrase: [WIPE PROD CONFIRMED 2026-04-20] delete davide tenant + Default Tenant
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const host = new URL(connectionString).host;
console.log(`[target] ${host}`);

if (!host.includes('railway') && !host.includes('rlwy.net') && !host.includes('ballast.proxy')) {
  console.error('Refusing: host does not look like expected Railway prod.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString, max: 3 });
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

const DAVIDE = 'cmo765ze3000001o7dyqtk1e9';
const DEFAULT = 'cmo73abqq0000hoyhdh1qkc9j';

try {
  for (const id of [DAVIDE, DEFAULT]) {
    const before = await prisma.tenant.findUnique({
      where: { id },
      include: { _count: { select: { users: true, emails: true } } },
    });
    if (!before) {
      console.log(`[skip] tenant ${id} not found`);
      continue;
    }
    console.log(
      `[pre ] ${id} name="${before.name}" users=${before._count.users} emails=${before._count.emails}`,
    );
    const deleted = await prisma.tenant.delete({ where: { id } });
    console.log(`[del ] ${id} name="${deleted.name}" deleted=ok`);
  }

  const remaining = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`\n[post] tenants remaining: ${remaining.length}`);
  for (const t of remaining) console.log('  -', t.id, t.name);
} catch (e) {
  console.error('[FAIL]', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
