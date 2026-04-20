// READ-ONLY. No writes. No migrations. No seeds.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const host = new URL(connectionString).host;
console.log(`[target] ${host}`);

const adapter = new PrismaPg({ connectionString, max: 3 });
const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });

try {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          twoFactorEnabled: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              providerId: true,
              accountId: true,
              scope: true,
              accessTokenExpiresAt: true,
              createdAt: true,
            },
          },
        },
      },
      _count: { select: { emails: true } },
    },
  });

  console.log(`\nTenants: ${tenants.length}`);
  console.log('='.repeat(80));

  for (const t of tenants) {
    console.log('');
    console.log(`TENANT  id=${t.id}`);
    console.log(`        name="${t.name}"`);
    console.log(`        slug=${t.slug}`);
    console.log(`        active=${t.isActive}  deletedAt=${t.deletedAt ? t.deletedAt.toISOString() : '-'}`);
    console.log(`        createdAt=${t.createdAt.toISOString()}`);
    console.log(`        users=${t.users.length}  emails=${t._count.emails}`);

    for (const u of t.users) {
      console.log('');
      console.log(`  USER  id=${u.id}`);
      console.log(`        email=${u.email}`);
      console.log(`        name="${u.name ?? ''}"`);
      console.log(`        emailVerified=${u.emailVerified}  2fa=${u.twoFactorEnabled}  createdAt=${u.createdAt.toISOString()}`);
      console.log(`        accounts=${u.accounts.length}`);
      for (const a of u.accounts) {
        const exp = a.accessTokenExpiresAt ? a.accessTokenExpiresAt.toISOString() : '-';
        console.log(
          `          - provider=${a.providerId.padEnd(12)} accountId=${a.accountId}  scope=${a.scope ?? '-'}  tokenExp=${exp}`,
        );
      }
    }
    console.log('-'.repeat(80));
  }
} finally {
  await prisma.$disconnect();
}
