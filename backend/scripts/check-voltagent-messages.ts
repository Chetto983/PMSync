/**
 * Check VoltAgent Messages - Debug duplicate/delegation messages
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('=== VoltAgent Messages Check ===\n');

  // Get ALL messages with SELECT *
  const messages = await prisma.$queryRaw<Array<Record<string, unknown>>>(
    Prisma.sql`SELECT * FROM voltagent_memory_messages ORDER BY created_at DESC LIMIT 20`
  );

  console.log(`Found ${messages.length} messages\n`);

  if (messages.length > 0) {
    console.log('Column names:', Object.keys(messages[0]).join(', '));
    console.log('');
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`--- Message ${i + 1} ---`);

    // Print all keys and values
    for (const [key, value] of Object.entries(msg)) {
      let displayValue: string;
      if (key === 'content' || key === 'parts') {
        // Truncate content
        displayValue = JSON.stringify(value).substring(0, 150) + '...';
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
      } else {
        displayValue = String(value);
      }
      console.log(`  ${key}: ${displayValue}`);
    }
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
