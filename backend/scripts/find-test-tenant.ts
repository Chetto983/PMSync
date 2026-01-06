import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

async function main() {
  const prisma = createPrismaClient();

  try {
    const tenants = await prisma.tenant.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            emails: true,
            providerConfigs: true,
            users: true,
          }
        }
      }
    });

    console.log('Available tenants:');
    for (const t of tenants) {
      console.log(`  - ${t.name} (${t.id})`);
      console.log(`    Emails: ${t._count.emails}, Providers: ${t._count.providerConfigs}, Users: ${t._count.users}`);
    }

    // Find first tenant with a provider
    const testTenant = tenants.find(t => t._count.providerConfigs > 0);
    if (testTenant) {
      console.log(`\nRecommended test tenant: ${testTenant.name} (${testTenant.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
