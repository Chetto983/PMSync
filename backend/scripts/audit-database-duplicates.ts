/**
 * Database Audit - Check for duplicate storage and cleanup opportunities
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('=== DATABASE AUDIT ===\n');

  // 1. Check VoltAgent tables
  console.log('--- VOLTAGENT TABLES ---\n');

  const conversations = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_conversations`
  );
  console.log(`voltagent_memory_conversations: ${conversations[0].count} rows`);

  const messages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_messages`
  );
  console.log(`voltagent_memory_messages: ${messages[0].count} rows`);

  const steps = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_steps`
  );
  console.log(`voltagent_memory_steps: ${steps[0].count} rows`);

  const users = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_users`
  );
  console.log(`voltagent_memory_users: ${users[0].count} rows`);

  const workflowStates = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_workflow_states`
  );
  console.log(`voltagent_memory_workflow_states: ${workflowStates[0].count} rows`);

  // 2. Check HITL/ActionQueue
  console.log('\n--- HITL/ACTION QUEUE ---\n');

  const actionQueue = await prisma.actionQueue.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  console.log('ActionQueue by status:');
  for (const a of actionQueue) {
    console.log(`  ${a.status}: ${a._count.id}`);
  }

  const recentActions = await prisma.actionQueue.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      actionType: true,
      status: true,
      createdAt: true,
      reasoning: true,
    },
  });
  console.log('\nRecent actions:');
  for (const action of recentActions) {
    console.log(`  ${action.id.slice(0, 8)} | ${action.actionType} | ${action.status} | ${action.createdAt.toISOString().slice(0, 19)}`);
  }

  // 3. Check AIMemory
  console.log('\n--- AI MEMORY (Long-term) ---\n');

  const aiMemory = await prisma.aIMemory.groupBy({
    by: ['memoryType'],
    _count: { id: true },
  });
  console.log('AIMemory by type:');
  for (const m of aiMemory) {
    console.log(`  ${m.memoryType}: ${m._count.id}`);
  }

  // 4. Check message types in voltagent_memory_messages
  console.log('\n--- MESSAGE TYPES IN VOLTAGENT ---\n');

  const messageTypes = await prisma.$queryRaw<Array<{ role: string; count: bigint }>>(
    Prisma.sql`
      SELECT role, COUNT(*) as count
      FROM voltagent_memory_messages
      GROUP BY role
      ORDER BY count DESC
    `
  );
  console.log('Messages by role:');
  for (const m of messageTypes) {
    console.log(`  ${m.role}: ${m.count}`);
  }

  // 5. Check for tool-type messages
  console.log('\n--- TOOL-TYPE MESSAGES (should be filtered) ---\n');

  const toolMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count
      FROM voltagent_memory_messages
      WHERE parts::text LIKE '%"type":"tool-%'
    `
  );
  console.log(`Messages with tool-type parts: ${toolMessages[0].count}`);

  const textMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count
      FROM voltagent_memory_messages
      WHERE parts::text LIKE '%"type":"text"%'
         OR parts::text NOT LIKE '%"type":%'
    `
  );
  console.log(`Messages with text-type or no type: ${textMessages[0].count}`);

  // 6. Check for delegation task messages by content
  console.log('\n--- DELEGATION TASK MESSAGES (by content pattern) ---\n');

  const delegationMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count
      FROM voltagent_memory_messages
      WHERE role = 'user'
        AND (
          parts::text LIKE '%Send email to%with subject%and body%'
          OR parts::text LIKE '%Update the email body to%and send it to%'
        )
    `
  );
  console.log(`User messages that look like delegation tasks: ${delegationMessages[0].count}`);

  // 7. Check steps table for HITL-related data
  console.log('\n--- VOLTAGENT STEPS (tool calls) ---\n');

  const stepTypes = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>(
    Prisma.sql`
      SELECT type, COUNT(*) as count
      FROM voltagent_memory_steps
      GROUP BY type
      ORDER BY count DESC
      LIMIT 10
    `
  );
  console.log('Steps by type:');
  for (const s of stepTypes) {
    console.log(`  ${s.type}: ${s.count}`);
  }

  // 8. Check for requiresApproval in steps
  console.log('\n--- STEPS WITH requiresApproval ---\n');

  const approvalSteps = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count
      FROM voltagent_memory_steps
      WHERE result::text LIKE '%requiresApproval%'
    `
  );
  console.log(`Steps with requiresApproval in result: ${approvalSteps[0].count}`);

  // Show recent steps with requiresApproval
  const recentApprovalSteps = await prisma.$queryRaw<Array<{
    id: string;
    agent_name: string | null;
    type: string;
    created_at: Date;
    result: unknown;
  }>>(
    Prisma.sql`
      SELECT id, agent_name, type, created_at, result
      FROM voltagent_memory_steps
      WHERE result::text LIKE '%requiresApproval%'
      ORDER BY created_at DESC
      LIMIT 5
    `
  );
  console.log('\nRecent steps with requiresApproval:');
  for (const step of recentApprovalSteps) {
    const result = step.result as Record<string, unknown>;
    console.log(`  ${step.id.slice(0, 8)} | ${step.agent_name || 'unknown'} | ${step.type} | ${String(step.created_at).slice(0, 19)}`);
    console.log(`    result: ${JSON.stringify(result).slice(0, 150)}...`);
  }

  // 9. Summary
  console.log('\n=== CLEANUP OPPORTUNITIES ===\n');

  const totalVoltMessages = Number(messages[0].count);
  const totalToolMessages = Number(toolMessages[0].count);
  const totalDelegation = Number(delegationMessages[0].count);

  console.log(`Total VoltAgent messages: ${totalVoltMessages}`);
  console.log(`  - Tool-type messages (internal): ${totalToolMessages} (${((totalToolMessages/totalVoltMessages)*100).toFixed(1)}%)`);
  console.log(`  - Delegation task messages: ${totalDelegation} (${((totalDelegation/totalVoltMessages)*100).toFixed(1)}%)`);
  console.log(`  - User-visible messages: ~${totalVoltMessages - totalToolMessages - totalDelegation}`);

  console.log(`\nTotal VoltAgent steps: ${steps[0].count}`);
  console.log(`  - Steps with requiresApproval: ${approvalSteps[0].count}`);

  console.log(`\nActionQueue total: ${actionQueue.reduce((acc, a) => acc + a._count.id, 0)}`);
  console.log(`AIMemory total: ${aiMemory.reduce((acc, m) => acc + m._count.id, 0)}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
