require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  const totalEmails = await prisma.email.count({ where: { tenantId } });
  const unreadEmails = await prisma.email.count({ where: { tenantId, isRead: false } });
  const sentEmails = await prisma.email.count({ where: { tenantId, folder: 'SENT' } });

  const providers = await prisma.provider.findMany({
    where: { tenantId },
    select: { id: true, type: true, email: true, isActive: true }
  });

  const recentEmails = await prisma.email.findMany({
    where: { tenantId },
    take: 5,
    orderBy: { receivedAt: 'desc' },
    select: { subject: true, from: true, folder: true, receivedAt: true }
  });

  console.log('=== TENANT DATA ===');
  console.log('Tenant ID:', tenantId);
  console.log('');
  console.log('PROVIDERS (' + providers.length + '):');
  providers.forEach(p => console.log('  -', p.type, '|', p.email, '| active:', p.isActive));
  console.log('');
  console.log('EMAIL STATS:');
  console.log('  Total emails:', totalEmails);
  console.log('  Unread:', unreadEmails);
  console.log('  Sent:', sentEmails);
  console.log('');
  console.log('RECENT EMAILS:');
  recentEmails.forEach(e => console.log('  -', e.folder, '|', (e.subject || '').substring(0, 50), '|', e.receivedAt));

  await prisma.$disconnect();
}

main();
