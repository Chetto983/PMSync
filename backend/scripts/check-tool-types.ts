/**
 * Check tool-type messages in VoltAgent memory
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('=== CHECKING TOOL-TYPE MESSAGES ===\n');

  // Method 1: Check using jsonb_array_elements
  const toolTypes = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(DISTINCT m.message_id) as count
      FROM voltagent_memory_messages m,
      LATERAL jsonb_array_elements(m.parts) AS elem
      WHERE elem->>'type' LIKE 'tool-%'
    `
  );
  console.log('Messages with tool-type parts (jsonb_array_elements):', toolTypes[0].count);

  // Method 2: Get sample of tool-type messages
  const samples = await prisma.$queryRaw<Array<{
    message_id: string;
    role: string;
    elem_type: string;
  }>>(
    Prisma.sql`
      SELECT DISTINCT m.message_id, m.role, elem->>'type' as elem_type
      FROM voltagent_memory_messages m,
      LATERAL jsonb_array_elements(m.parts) AS elem
      WHERE elem->>'type' LIKE 'tool-%'
      LIMIT 10
    `
  );

  console.log('\nSample tool-type messages:');
  for (const s of samples) {
    console.log(`  ${s.message_id.slice(0, 8)}... | role=${s.role} | type=${s.elem_type}`);
  }

  // Method 3: Count by tool type
  const byType = await prisma.$queryRaw<Array<{ elem_type: string; count: bigint }>>(
    Prisma.sql`
      SELECT elem->>'type' as elem_type, COUNT(*) as count
      FROM voltagent_memory_messages m,
      LATERAL jsonb_array_elements(m.parts) AS elem
      WHERE elem->>'type' LIKE 'tool-%'
      GROUP BY elem->>'type'
      ORDER BY count DESC
    `
  );

  console.log('\nTool types breakdown:');
  for (const t of byType) {
    console.log(`  ${t.elem_type}: ${t.count}`);
  }

  // Method 4: Check pending HITL actions
  console.log('\n=== PENDING HITL ACTIONS ===\n');
  const pending = await prisma.actionQueue.findMany({
    where: { status: 'PENDING_APPROVAL' },
    select: {
      id: true,
      actionType: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  console.log(`Pending actions: ${pending.length}`);
  for (const p of pending) {
    console.log(`  ${p.id.slice(0, 10)} | ${p.actionType} | created=${p.createdAt.toISOString().slice(0, 19)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
