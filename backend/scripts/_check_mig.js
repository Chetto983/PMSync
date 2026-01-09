require('dotenv').config();
const { createPrismaClient } = require('../dist/prisma/prisma-client.factory');
const prisma = createPrismaClient();

async function main() {
  const migs = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC`);
  console.log('Recent migrations:');
  migs.forEach(m => console.log('  -', m.migration_name, m.finished_at ? 'DONE' : 'FAILED'));
  await prisma.$disconnect();
}
main();
