/**
 * Check how VoltAgent stores assistant messages
 * Understanding the full message structure
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('=== VOLTAGENT ASSISTANT MESSAGE STRUCTURE ===\n');

  // Get ALL assistant messages with full structure
  const msgs = await prisma.$queryRaw<Array<{
    message_id: string;
    role: string;
    parts: unknown;
    metadata: unknown;
    created_at: Date;
  }>>(
    Prisma.sql`
      SELECT message_id, role, parts, metadata, created_at
      FROM voltagent_memory_messages
      WHERE role = 'assistant'
      ORDER BY created_at DESC
      LIMIT 10
    `
  );

  console.log(`Found ${msgs.length} assistant messages\n`);

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const parts = m.parts as Array<{ type?: string; text?: string; [key: string]: unknown }>;

    console.log(`=== Message ${i + 1} ===`);
    console.log(`Created: ${m.created_at}`);
    console.log(`Metadata: ${JSON.stringify(m.metadata)}`);
    console.log(`Parts count: ${parts?.length || 0}`);

    if (parts) {
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        console.log(`  Part ${j + 1}:`);
        console.log(`    type: ${part.type || 'undefined'}`);
        console.log(`    text: ${(part.text || '').slice(0, 100)}...`);
        // Show other keys
        const otherKeys = Object.keys(part).filter(k => k !== 'type' && k !== 'text');
        if (otherKeys.length > 0) {
          console.log(`    other keys: ${otherKeys.join(', ')}`);
        }
      }
    }
    console.log('');
  }

  // Check if there are any assistant messages with ONLY text type
  console.log('=== CHECKING FOR PURE TEXT ASSISTANT MESSAGES ===\n');

  const textOnly = await prisma.$queryRaw<Array<{
    message_id: string;
    parts: unknown;
  }>>(
    Prisma.sql`
      SELECT message_id, parts
      FROM voltagent_memory_messages
      WHERE role = 'assistant'
      AND parts::text LIKE '%"type":"text"%'
      ORDER BY created_at DESC
      LIMIT 5
    `
  );

  console.log(`Found ${textOnly.length} assistant messages with "type":"text"\n`);

  for (const m of textOnly) {
    const parts = m.parts as Array<{ type?: string; text?: string }>;
    console.log(`Message ${m.message_id.slice(0, 8)}:`);
    if (parts) {
      for (const p of parts) {
        console.log(`  type=${p.type}, text=${(p.text || '').slice(0, 80)}...`);
      }
    }
    console.log('');
  }

  // Check unique part types
  console.log('=== ALL UNIQUE PART TYPES ===\n');

  const partTypes = await prisma.$queryRaw<Array<{ part_type: string | null; count: bigint }>>(
    Prisma.sql`
      SELECT elem->>'type' as part_type, COUNT(*) as count
      FROM voltagent_memory_messages,
      LATERAL jsonb_array_elements(parts) AS elem
      GROUP BY elem->>'type'
      ORDER BY count DESC
    `
  );

  for (const pt of partTypes) {
    console.log(`  ${pt.part_type || 'null/undefined'}: ${pt.count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
