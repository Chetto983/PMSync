require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('Finding users for tenant:', TENANT_ID);

  const users = await prisma.user.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    }
  });

  console.log('Found', users.length, 'users:');
  users.forEach(u => {
    console.log(`  - ${u.id}: ${u.email} (${u.role})`);
  });

  if (users.length > 0) {
    console.log('\nUse this userId for testing:', users[0].id);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
