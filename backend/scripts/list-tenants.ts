import 'dotenv/config';

async function main() {
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const prisma = createPrismaClient();

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log('Available tenants:');
  tenants.forEach((t: { id: string; name: string }) => console.log(`  ${t.id} - ${t.name}`));

  await prisma.$disconnect();
}

main().catch(console.error);
