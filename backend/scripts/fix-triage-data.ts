import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function fix() {
  console.log('=== FIX TRIAGE DATA ===\n');

  // 1. Mark SENT emails as already triaged (skip them forever)
  const sentResult = await prisma.email.updateMany({
    where: {
      folder: 'SENT',
      isAutoTriaged: false,
    },
    data: {
      isAutoTriaged: true, // Mark as done so we skip them
      aiPriorityReason: 'Sent email - skipped',
    },
  });
  console.log(`1. Marked ${sentResult.count} SENT emails as triaged (skipped)`);

  // 2. Reset inbox emails that have no labels for re-triage
  const resetResult = await prisma.email.updateMany({
    where: {
      folder: { in: ['INBOX', 'UPDATES', 'PROMOTIONS', 'SOCIAL', 'FORUMS'] },
      isAutoTriaged: true,
      aiLabels: { isEmpty: true },
      receivedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    data: {
      isAutoTriaged: false,
      autoTriagedAt: null,
    },
  });
  console.log(`2. Reset ${resetResult.count} inbox emails (no labels) for re-triage`);

  await prisma.$disconnect();
}

fix().catch(console.error);
