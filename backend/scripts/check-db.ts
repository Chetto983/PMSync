import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('=== Database Check ===\n');

  // Get all tenants
  const tenants = await prisma.tenant.findMany();
  console.log('Tenants:');
  tenants.forEach(t => {
    console.log(`  - ${t.name} (slug: ${t.slug}, active: ${t.isActive})`);
  });

  console.log('\nUsers:');
  const users = await prisma.user.findMany({
    include: { tenant: { select: { slug: true } } }
  });
  users.forEach(u => {
    console.log(`  - ${u.email} (tenant: ${u.tenant.slug}, active: ${u.isActive})`);
  });

  // Skip providers for now - just check tenants and users
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
