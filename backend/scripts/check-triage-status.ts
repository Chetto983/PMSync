/**
 * Check triage status in database
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  console.log('=== TRIAGE STATUS CHECK ===\n');

  // Check if any emails have aiLabels
  const withLabels = await prisma.email.findMany({
    where: {
      aiLabels: { isEmpty: false },
      isAutoTriaged: true
    },
    select: {
      id: true,
      subject: true,
      aiLabels: true,
      aiPriority: true,
      autoTriagedAt: true,
      receivedAt: true
    },
    orderBy: { autoTriagedAt: 'desc' },
    take: 10
  });

  console.log(`Emails with AI labels: ${withLabels.length} (showing last 10)`);
  withLabels.forEach(e => {
    console.log(`  - "${e.subject?.slice(0,40)}..."`);
    console.log(`    Labels: ${e.aiLabels?.join(', ') || 'none'}`);
    console.log(`    Priority: ${e.aiPriority}, Triaged: ${e.autoTriagedAt}`);
  });

  // Check recent emails without triage
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2); // Last 2 days

  const recentUntriaged = await prisma.email.findMany({
    where: {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff }
    },
    select: { id: true, subject: true, receivedAt: true, folder: true },
    orderBy: { receivedAt: 'desc' },
    take: 10
  });

  console.log(`\nRecent emails NOT triaged (last 2 days): ${recentUntriaged.length}`);
  recentUntriaged.slice(0,5).forEach(e => {
    console.log(`  - "${e.subject?.slice(0,40)}..." (${e.folder})`);
  });

  // Check if sync is incremental
  const providers = await prisma.providerConfig.findMany({
    select: { email: true, metadata: true, lastSyncedAt: true }
  });

  console.log('\n=== PROVIDER SYNC STATUS ===');
  providers.forEach(p => {
    const meta = p.metadata as Record<string, unknown> | null;
    const hasToken = !!(meta?.lastSyncToken || meta?.historyId);
    console.log(`${p.email}:`);
    console.log(`  Has sync token: ${hasToken ? 'YES (incremental)' : 'NO (full sync)'}`);
    console.log(`  Last sync: ${p.lastSyncedAt}`);
  });

  await prisma.$disconnect();
}

check().catch(console.error);
