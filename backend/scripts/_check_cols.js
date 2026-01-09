require('dotenv').config();
const { createPrismaClient } = require('../dist/prisma/prisma-client.factory');
const prisma = createPrismaClient();

async function main() {
  const tables = ['user_preferences', 'email_attachments', 'email_labels', 'mfa_secrets'];
  for (const table of tables) {
    const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`);
    const hasTenant = cols.some(c => c.column_name === 'tenantId');
    console.log(table + ': tenantId = ' + (hasTenant ? 'YES' : 'NO'));
  }
  await prisma.$disconnect();
}
main();
