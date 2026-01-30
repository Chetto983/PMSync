import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  const emails = await prisma.email.findMany({
    where: {
      OR: [
        { from: { contains: 'komoot' } },
        { subject: { contains: 'komoot' } },
      ],
    },
    select: {
      id: true,
      subject: true,
      from: true,
      folder: true,
      receivedAt: true,
      isAutoTriaged: true,
      aiLabels: true,
      aiPriority: true,
      autoTriagedAt: true,
      tenantId: true,
      providerId: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 5,
  });

  console.log(`Found ${emails.length} komoot emails\n`);

  for (const email of emails) {
    console.log(`Subject: ${email.subject?.slice(0, 60)}...`);
    console.log(`  From: ${email.from}`);
    console.log(`  Received: ${email.receivedAt}`);
    console.log(`  isAutoTriaged: ${email.isAutoTriaged}`);
    console.log(`  aiLabels: ${email.aiLabels?.join(', ') || 'NONE'}`);
    console.log(`  aiPriority: ${email.aiPriority}`);

    const provider = await prisma.providerConfig.findUnique({
      where: { id: email.providerId },
      select: { email: true, userId: true },
    });
    console.log(`  Provider: ${provider?.email}`);

    if (provider?.userId) {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId: provider.userId },
        select: { aiAutoTriageEnabled: true },
      });
      console.log(`  Auto-triage enabled: ${prefs?.aiAutoTriageEnabled}`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

check().catch(console.error);
