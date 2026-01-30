/**
 * Check remaining untriaged emails - why weren't they processed?
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  console.log('=== REMAINING UNTRIAGED EMAILS ===\n');

  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const untriaged = await prisma.email.findMany({
    where: {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff48h },
      isDeleted: false,
      isDraft: false,
    },
    select: {
      id: true,
      subject: true,
      folder: true,
      receivedAt: true,
      tenantId: true,
      providerId: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
  });

  console.log(`Found ${untriaged.length} untriaged emails from last 48h\n`);

  for (const email of untriaged) {
    const age = (now.getTime() - (email.receivedAt?.getTime() || 0)) / (1000 * 60 * 60);
    const within24h = email.receivedAt ? email.receivedAt >= cutoff24h : false;

    // Check user preferences for this tenant
    const provider = await prisma.providerConfig.findUnique({
      where: { id: email.providerId },
      select: { userId: true, email: true },
    });

    let autoTriageEnabled = false;
    if (provider?.userId) {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId: provider.userId },
        select: { aiAutoTriageEnabled: true },
      });
      autoTriageEnabled = prefs?.aiAutoTriageEnabled ?? false;
    }

    console.log(`Email: "${email.subject?.slice(0, 50)}..."`);
    console.log(`  Folder: ${email.folder}`);
    console.log(`  Age: ${age.toFixed(1)}h (${within24h ? 'WITHIN 24h' : '>24h - TOO OLD'})`);
    console.log(`  Provider: ${provider?.email || 'unknown'}`);
    console.log(`  Auto-triage enabled: ${autoTriageEnabled ? 'YES' : 'NO - DISABLED'}`);
    console.log();
  }

  await prisma.$disconnect();
}

check().catch(console.error);
