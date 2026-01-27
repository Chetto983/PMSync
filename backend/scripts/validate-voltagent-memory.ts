/**
 * VoltAgent Memory Validation Script
 *
 * Validates the structure and integrity of VoltAgent memory tables.
 * Based on: https://voltagent.dev/docs/agents/memory/overview/
 *
 * Tables analyzed:
 * - voltagent_memory_conversations - Conversation metadata
 * - voltagent_memory_messages - Chat messages (UIMessage format)
 * - voltagent_memory_steps - Tool calls and agent steps
 * - voltagent_memory_users - User metadata
 * - voltagent_memory_workflow_states - Workflow checkpoints
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

interface ValidationResult {
  table: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  count?: number;
}

const results: ValidationResult[] = [];

function addResult(result: ValidationResult) {
  results.push(result);
  const icon = result.status === 'PASS' ? '✓' : result.status === 'WARN' ? '⚠' : '✗';
  console.log(`  ${icon} [${result.status}] ${result.check}: ${result.message}`);
}

async function validateConversations() {
  console.log('\n=== CONVERSATIONS TABLE ===\n');

  // Check total count
  const total = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_conversations`
  );
  addResult({
    table: 'conversations',
    check: 'total_count',
    status: 'PASS',
    message: `${total[0].count} conversations found`,
    count: Number(total[0].count),
  });

  // Check for orphaned conversations (no messages)
  const orphaned = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_conversations c
      WHERE NOT EXISTS (
        SELECT 1 FROM voltagent_memory_messages m
        WHERE m.conversation_id = c.id
      )
    `
  );
  const orphanCount = Number(orphaned[0].count);
  addResult({
    table: 'conversations',
    check: 'orphaned_conversations',
    status: orphanCount > 0 ? 'WARN' : 'PASS',
    message: orphanCount > 0 ? `${orphanCount} conversations have no messages (cleanup candidate)` : 'No orphaned conversations',
    count: orphanCount,
  });

  // Check user_id format (should be tenantId:userId)
  const badUserIds = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_conversations
      WHERE user_id NOT LIKE '%:%'
    `
  );
  const badCount = Number(badUserIds[0].count);
  addResult({
    table: 'conversations',
    check: 'user_id_format',
    status: badCount > 0 ? 'WARN' : 'PASS',
    message: badCount > 0 ? `${badCount} conversations have non-standard user_id format` : 'All user_ids follow tenantId:userId format',
    count: badCount,
  });
}

async function validateMessages() {
  console.log('\n=== MESSAGES TABLE ===\n');

  // Check total count
  const total = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_messages`
  );
  addResult({
    table: 'messages',
    check: 'total_count',
    status: 'PASS',
    message: `${total[0].count} messages found`,
    count: Number(total[0].count),
  });

  // Check message roles
  const roles = await prisma.$queryRaw<Array<{ role: string; count: bigint }>>(
    Prisma.sql`
      SELECT role, COUNT(*) as count FROM voltagent_memory_messages
      GROUP BY role ORDER BY count DESC
    `
  );
  for (const r of roles) {
    const validRoles = ['user', 'assistant', 'system'];
    addResult({
      table: 'messages',
      check: `role_${r.role}`,
      status: validRoles.includes(r.role) ? 'PASS' : 'WARN',
      message: `${r.count} messages with role '${r.role}'`,
      count: Number(r.count),
    });
  }

  // Check for tool-type messages (internal, should be filtered in UI)
  const toolMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
      WHERE parts::text LIKE '%"type":"tool-%'
    `
  );
  const toolCount = Number(toolMessages[0].count);
  addResult({
    table: 'messages',
    check: 'tool_type_messages',
    status: toolCount > 0 ? 'WARN' : 'PASS',
    message: toolCount > 0
      ? `${toolCount} messages have tool-type parts (should be filtered in UI)`
      : 'No tool-type messages found',
    count: toolCount,
  });

  // Check for subAgent metadata (internal delegation)
  const subAgentMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
      WHERE metadata::text LIKE '%subAgentId%' OR metadata::text LIKE '%subAgentName%'
    `
  );
  const subAgentCount = Number(subAgentMessages[0].count);
  addResult({
    table: 'messages',
    check: 'subagent_messages',
    status: subAgentCount > 0 ? 'WARN' : 'PASS',
    message: subAgentCount > 0
      ? `${subAgentCount} messages have subAgent metadata (internal delegation, should be filtered)`
      : 'No subAgent messages found',
    count: subAgentCount,
  });

  // Check messages without text content
  const emptyMessages = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
      WHERE parts::text NOT LIKE '%"text":%'
    `
  );
  const emptyCount = Number(emptyMessages[0].count);
  addResult({
    table: 'messages',
    check: 'messages_without_text',
    status: emptyCount > 0 ? 'WARN' : 'PASS',
    message: emptyCount > 0
      ? `${emptyCount} messages have no text content (pure tool calls)`
      : 'All messages have text content',
    count: emptyCount,
  });

  // Sample some messages to show structure
  console.log('\n  Sample messages:');
  const samples = await prisma.$queryRaw<Array<{
    conversation_id: string;
    role: string;
    parts: unknown;
    metadata: unknown;
  }>>(
    Prisma.sql`
      SELECT conversation_id, role, parts, metadata
      FROM voltagent_memory_messages
      ORDER BY created_at DESC
      LIMIT 3
    `
  );
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    console.log(`  [${i + 1}] role=${s.role}, conv=${String(s.conversation_id).slice(0, 20)}...`);
    const parts = s.parts as Array<{ type?: string; text?: string }>;
    if (parts && parts.length > 0) {
      console.log(`      parts[0].type=${parts[0].type || 'undefined'}, text=${(parts[0].text || '').slice(0, 50)}...`);
    }
  }
}

async function validateSteps() {
  console.log('\n=== STEPS TABLE ===\n');

  // Check total count
  const total = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) as count FROM voltagent_memory_steps`
  );
  addResult({
    table: 'steps',
    check: 'total_count',
    status: 'PASS',
    message: `${total[0].count} steps found`,
    count: Number(total[0].count),
  });

  // Check step types
  const types = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>(
    Prisma.sql`
      SELECT type, COUNT(*) as count FROM voltagent_memory_steps
      GROUP BY type ORDER BY count DESC
    `
  );
  for (const t of types) {
    addResult({
      table: 'steps',
      check: `step_type_${t.type}`,
      status: 'PASS',
      message: `${t.count} steps of type '${t.type}'`,
      count: Number(t.count),
    });
  }

  // Check for HITL (requiresApproval) in results
  const hitlSteps = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_steps
      WHERE result::text LIKE '%requiresApproval%'
    `
  );
  const hitlCount = Number(hitlSteps[0].count);
  addResult({
    table: 'steps',
    check: 'hitl_steps',
    status: 'PASS',
    message: `${hitlCount} steps contain requiresApproval (HITL actions)`,
    count: hitlCount,
  });

  // Check orphaned steps (no conversation)
  const orphanedSteps = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) as count FROM voltagent_memory_steps s
      WHERE NOT EXISTS (
        SELECT 1 FROM voltagent_memory_conversations c
        WHERE c.id = s.conversation_id
      )
    `
  );
  const orphanStepCount = Number(orphanedSteps[0].count);
  addResult({
    table: 'steps',
    check: 'orphaned_steps',
    status: orphanStepCount > 0 ? 'FAIL' : 'PASS',
    message: orphanStepCount > 0
      ? `${orphanStepCount} steps reference non-existent conversations (data integrity issue!)`
      : 'All steps linked to valid conversations',
    count: orphanStepCount,
  });
}

async function validateActionQueue() {
  console.log('\n=== ACTION QUEUE (HITL) ===\n');

  // Check counts by status
  const statuses = await prisma.actionQueue.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  for (const s of statuses) {
    addResult({
      table: 'action_queue',
      check: `status_${s.status}`,
      status: 'PASS',
      message: `${s._count.id} actions with status '${s.status}'`,
      count: s._count.id,
    });
  }

  // Check for expired pending actions
  const expiredPending = await prisma.actionQueue.count({
    where: {
      status: 'PENDING_APPROVAL',
      expiresAt: { lt: new Date() },
    },
  });
  addResult({
    table: 'action_queue',
    check: 'expired_pending',
    status: expiredPending > 0 ? 'WARN' : 'PASS',
    message: expiredPending > 0
      ? `${expiredPending} pending actions are expired (should be cleaned up)`
      : 'No expired pending actions',
    count: expiredPending,
  });

  // Check rejected reasons
  const rejectedReasons = await prisma.$queryRaw<Array<{ reason: string | null; count: bigint }>>(
    Prisma.sql`
      SELECT "rejectedReason" as reason, COUNT(*) as count
      FROM action_queue
      WHERE status = 'REJECTED'
      GROUP BY "rejectedReason"
      ORDER BY count DESC
      LIMIT 5
    `
  );
  console.log('\n  Rejected action reasons:');
  for (const r of rejectedReasons) {
    console.log(`    - "${r.reason || 'NO REASON'}": ${r.count}`);
  }
}

async function validateAIMemory() {
  console.log('\n=== AI MEMORY (Long-term) ===\n');

  // Check counts by type
  const types = await prisma.aIMemory.groupBy({
    by: ['memoryType'],
    _count: { id: true },
  });

  for (const t of types) {
    addResult({
      table: 'ai_memory',
      check: `type_${t.memoryType}`,
      status: 'PASS',
      message: `${t._count.id} memories of type '${t.memoryType}'`,
      count: t._count.id,
    });
  }

  // Check expired memories
  const expired = await prisma.aIMemory.count({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  addResult({
    table: 'ai_memory',
    check: 'expired_memories',
    status: expired > 0 ? 'WARN' : 'PASS',
    message: expired > 0
      ? `${expired} memories are expired (should be cleaned up)`
      : 'No expired memories',
    count: expired,
  });
}

async function printSummary() {
  console.log('\n========================================');
  console.log('           VALIDATION SUMMARY           ');
  console.log('========================================\n');

  const passes = results.filter(r => r.status === 'PASS').length;
  const warns = results.filter(r => r.status === 'WARN').length;
  const fails = results.filter(r => r.status === 'FAIL').length;

  console.log(`✓ PASS: ${passes}`);
  console.log(`⚠ WARN: ${warns}`);
  console.log(`✗ FAIL: ${fails}`);

  if (warns > 0) {
    console.log('\nWarnings to address:');
    for (const r of results.filter(r => r.status === 'WARN')) {
      console.log(`  - [${r.table}] ${r.check}: ${r.message}`);
    }
  }

  if (fails > 0) {
    console.log('\nFailures requiring immediate attention:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - [${r.table}] ${r.check}: ${r.message}`);
    }
  }

  // Cleanup recommendations
  console.log('\n========================================');
  console.log('         CLEANUP RECOMMENDATIONS        ');
  console.log('========================================\n');

  const toolMsgResult = results.find(r => r.check === 'tool_type_messages');
  const subAgentResult = results.find(r => r.check === 'subagent_messages');
  const orphanedConvResult = results.find(r => r.check === 'orphaned_conversations');
  const expiredPendingResult = results.find(r => r.check === 'expired_pending');
  const expiredMemoryResult = results.find(r => r.check === 'expired_memories');

  if (toolMsgResult && toolMsgResult.count && toolMsgResult.count > 0) {
    console.log(`1. Tool-type messages (${toolMsgResult.count}): These are filtered in UI via hasToolTypeParts()`);
    console.log(`   Action: No cleanup needed, filtering handles display`);
  }

  if (subAgentResult && subAgentResult.count && subAgentResult.count > 0) {
    console.log(`2. SubAgent messages (${subAgentResult.count}): Filtered via metadata.subAgentId check`);
    console.log(`   Action: No cleanup needed, filtering handles display`);
  }

  if (orphanedConvResult && orphanedConvResult.count && orphanedConvResult.count > 0) {
    console.log(`3. Orphaned conversations (${orphanedConvResult.count}): No messages attached`);
    console.log(`   Action: Consider deleting via: DELETE FROM voltagent_memory_conversations WHERE NOT EXISTS (...)`);
  }

  if (expiredPendingResult && expiredPendingResult.count && expiredPendingResult.count > 0) {
    console.log(`4. Expired pending actions (${expiredPendingResult.count}): Should be auto-rejected`);
    console.log(`   Action: Run DataCleanupService or update status to EXPIRED`);
  }

  if (expiredMemoryResult && expiredMemoryResult.count && expiredMemoryResult.count > 0) {
    console.log(`5. Expired AI memories (${expiredMemoryResult.count}): Past expiresAt date`);
    console.log(`   Action: Run DataCleanupService to delete`);
  }
}

async function main() {
  console.log('========================================');
  console.log('    VOLTAGENT MEMORY VALIDATION        ');
  console.log('========================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  await validateConversations();
  await validateMessages();
  await validateSteps();
  await validateActionQueue();
  await validateAIMemory();
  await printSummary();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
