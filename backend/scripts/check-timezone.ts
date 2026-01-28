/**
 * Check timezone values in database
 */
/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function main() {
  try {
    const prefs = await prisma.userPreferences.findMany({
      select: {
        userId: true,
        timezone: true,
        language: true,
      },
      take: 10,
    });

    console.log('=== User Preferences (timezone) ===');
    console.log(JSON.stringify(prefs, null, 2));

    // Count null vs non-null timezones
    const nullCount = prefs.filter(p => !p.timezone).length;
    const setCount = prefs.filter(p => p.timezone).length;
    console.log(`\nSummary: ${setCount} with timezone, ${nullCount} without timezone`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
