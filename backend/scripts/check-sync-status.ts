/**
 * Check Sync Status Script
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSync() {
  console.log('=== PROVIDER SYNC STATUS ===\n');

  // Get providers
  const providers = await prisma.providerConfig.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      providerType: true,
      lastSyncedAt: true,
      syncStatus: true,
      syncError: true,
    }
  });

  for (const p of providers) {
    console.log(`Provider: ${p.email}`);
    console.log(`  Type: ${p.providerType}`);
    console.log(`  Status: ${p.syncStatus || 'unknown'}`);
    console.log(`  Last Sync: ${p.lastSyncedAt || 'never'}`);
    if (p.syncError) console.log(`  ERROR: ${p.syncError}`);
    console.log();
  }

  // Get email counts
  const emailCount = await prisma.email.count();
  console.log(`Total emails in DB: ${emailCount}`);

  // Get recent emails
  const recentEmails = await prisma.email.findMany({
    take: 5,
    orderBy: { receivedAt: 'desc' },
    select: { subject: true, receivedAt: true, folder: true }
  });

  console.log('\n=== 5 MOST RECENT EMAILS ===');
  for (const e of recentEmails) {
    const subj = (e.subject || '(no subject)').substring(0, 40);
    console.log(`- ${subj} | ${e.folder} | ${e.receivedAt}`);
  }

  await prisma.$disconnect();
}

checkSync().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
