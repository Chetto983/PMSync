/**
 * Check embeddings distribution by tenant
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  // Check embeddings by tenant
  const embByTenant = await prisma.embedding.groupBy({
    by: ['tenantId'],
    _count: { id: true }
  });
  console.log('=== EMBEDDINGS BY TENANT ===');
  embByTenant.forEach(e => console.log(`  ${e.tenantId}: ${e._count.id} embeddings`));

  // Check emails by tenant
  const emailsByTenant = await prisma.email.groupBy({
    by: ['tenantId'],
    _count: { id: true }
  });
  console.log('\n=== EMAILS BY TENANT ===');
  emailsByTenant.forEach(e => console.log(`  ${e.tenantId}: ${e._count.id} emails`));

  // Check VoltAgent memory messages by user_id (which contains tenantId)
  const voltagentMessages = await prisma.$queryRaw<{user_id: string, count: bigint}[]>`
    SELECT user_id, COUNT(*) as count
    FROM voltagent_memory_messages
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 20
  `;
  console.log('\n=== VOLTAGENT MEMORY MESSAGES BY USER_ID ===');
  voltagentMessages.forEach(m => console.log(`  ${m.user_id}: ${m.count} messages`));

  // Check VoltAgent conversations
  const voltagentConvos = await prisma.$queryRaw<{user_id: string, count: bigint}[]>`
    SELECT user_id, COUNT(*) as count
    FROM voltagent_memory_conversations
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 20
  `;
  console.log('\n=== VOLTAGENT MEMORY CONVERSATIONS BY USER_ID ===');
  voltagentConvos.forEach(c => console.log(`  ${c.user_id}: ${c.count} conversations`));

  await prisma.$disconnect();
}

main().catch(console.error);
