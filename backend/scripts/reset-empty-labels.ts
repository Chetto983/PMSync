import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function reset() {
  // Reset emails that were triaged but have no labels
  const result = await prisma.email.updateMany({
    where: {
      isAutoTriaged: true,
      aiLabels: { isEmpty: true },
      receivedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    data: {
      isAutoTriaged: false,
      autoTriagedAt: null,
    },
  });
  console.log(`Reset ${result.count} emails with empty labels for re-triage`);
  await prisma.$disconnect();
}

reset().catch(console.error);
