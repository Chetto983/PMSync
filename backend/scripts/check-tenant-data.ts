/**
 * Check tenant data for analytics testing
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  const totalEmails = await prisma.email.count();
  const totalTenants = await prisma.tenant.count();
  const unreadEmails = await prisma.email.count({ where: { isRead: false } });

  const providers = await prisma.providerConfig.findMany({
    where: {
      email: { not: { endsWith: '@test.local' } }
    },
    select: { id: true, providerType: true, email: true, isActive: true, tenantId: true },
  });

  console.log('=== REAL PROVIDERS ===');
  const tenantCounts: Record<string, number> = {};

  providers.forEach(p => {
    console.log(`- ${p.email} [${p.providerType}] (Tenant: ${p.tenantId})`);
    tenantCounts[p.tenantId] = (tenantCounts[p.tenantId] || 0) + 1;
  });

  console.log('\n=== TENANT COUNTS ===');
  console.log(tenantCounts);

  console.log('=== TENANT DATA ===');
  console.log('Tenant ID:', tenantId);
  console.log('');
  console.log('PROVIDERS (' + providers.length + '):');
  providers.forEach((p) => console.log('  -', p.providerType, '|', p.email, '| active:', p.isActive));
  console.log('');
  console.log('EMAIL STATS:');
  console.log('  Total tenants:', totalTenants);
  console.log('  Total emails:', totalEmails);
  console.log('  Unread:', unreadEmails);
  console.log('');

  await prisma.$disconnect();
}

main();
