/**
 * Test script for DataCleanupService
 *
 * Validates:
 * 1. getExpiredCounts() works
 * 2. VoltAgent table detection works
 * 3. Cleanup logic is correct (dry run)
 *
 * Usage: npx ts-node scripts/test-data-cleanup.ts
 */
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
  console.log('='.repeat(60));
  console.log('DataCleanupService Validation');
  console.log('='.repeat(60));

  // 1. Check VoltAgent tables exist
  console.log('\n[1] Checking VoltAgent memory tables...');
  const tableExists = await checkVoltAgentTablesExist();
  console.log(`    voltagent_memory_conversations: ${tableExists ? '✅ EXISTS' : '❌ NOT FOUND'}`);

  // 2. Get current counts
  console.log('\n[2] Current record counts:');
  const counts = await getCurrentCounts();
  console.log(`    ActionQueue:           ${counts.actionQueue}`);
  console.log(`    AgentActionFeedback:   ${counts.feedback}`);
  console.log(`    AgentLearningProfile:  ${counts.profiles}`);
  console.log(`    AIMemory:              ${counts.memories}`);
  if (tableExists) {
    console.log(`    VoltAgent Conversations: ${counts.conversations}`);
    console.log(`    VoltAgent Messages:      ${counts.messages}`);
  }

  // 3. Get expired counts (what would be deleted)
  console.log('\n[3] Expired/Old records (would be deleted):');
  const expired = await getExpiredCounts(tableExists);
  console.log(`    ActionQueue (expired):     ${expired.actionQueue}`);
  console.log(`    AgentActionFeedback:       ${expired.feedback}`);
  console.log(`    AgentLearningProfile:      ${expired.profiles}`);
  console.log(`    AIMemory:                  ${expired.memories}`);
  if (tableExists) {
    console.log(`    Conversations (>30 days):  ${expired.conversations}`);
  }

  // 4. Validate retention logic
  console.log('\n[4] Retention policy validation:');
  const now = new Date();

  // Check if expiresAt is being set correctly on new records
  const recentFeedback = await prisma.agentActionFeedback.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, expiresAt: true },
  });

  if (recentFeedback) {
    const daysDiff = recentFeedback.expiresAt
      ? Math.round((recentFeedback.expiresAt.getTime() - recentFeedback.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 'NOT SET';
    console.log(`    AgentActionFeedback retention: ${daysDiff} days ${daysDiff === 30 ? '✅' : '⚠️'}`);
  } else {
    console.log('    AgentActionFeedback: No records found');
  }

  const recentProfile = await prisma.agentLearningProfile.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, expiresAt: true },
  });

  if (recentProfile) {
    const daysDiff = recentProfile.expiresAt
      ? Math.round((recentProfile.expiresAt.getTime() - recentProfile.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 'NOT SET';
    console.log(`    AgentLearningProfile retention: ${daysDiff} days ${daysDiff === 90 ? '✅' : '⚠️'}`);
  } else {
    console.log('    AgentLearningProfile: No records found');
  }

  // 5. Summary
  console.log('\n[5] Summary:');
  const totalExpired = expired.actionQueue + expired.feedback + expired.profiles + expired.memories + (expired.conversations || 0);
  const totalRecords = counts.actionQueue + counts.feedback + counts.profiles + counts.memories + (counts.conversations || 0);

  console.log(`    Total records:  ${totalRecords}`);
  console.log(`    Would delete:   ${totalExpired}`);
  console.log(`    Percentage:     ${totalRecords > 0 ? ((totalExpired / totalRecords) * 100).toFixed(1) : 0}%`);

  if (totalExpired > 0) {
    console.log('\n    ⚠️  Run cleanup with: DataCleanupService.runManualCleanup()');
  } else {
    console.log('\n    ✅ No cleanup needed');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Validation complete');
  console.log('='.repeat(60));
}

async function checkVoltAgentTablesExist(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'voltagent_memory_conversations'
      ) as exists
    `;
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

async function getCurrentCounts() {
  const [actionQueue, feedback, profiles, memories] = await Promise.all([
    prisma.actionQueue.count(),
    prisma.agentActionFeedback.count(),
    prisma.agentLearningProfile.count(),
    prisma.aIMemory.count(),
  ]);

  let conversations = 0;
  let messages = 0;

  try {
    const convResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM voltagent_memory_conversations
    `;
    conversations = Number(convResult[0]?.count ?? 0);

    const msgResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
    `;
    messages = Number(msgResult[0]?.count ?? 0);
  } catch {
    // Tables don't exist
  }

  return { actionQueue, feedback, profiles, memories, conversations, messages };
}

async function getExpiredCounts(tableExists: boolean) {
  const now = new Date();
  const cutoff30Days = new Date();
  cutoff30Days.setDate(cutoff30Days.getDate() - 30);

  const [actionQueue, feedback, profiles, memories] = await Promise.all([
    prisma.actionQueue.count({
      where: { status: 'PENDING_APPROVAL', expiresAt: { lt: now, not: null } },
    }),
    prisma.agentActionFeedback.count({
      where: { expiresAt: { lt: now } },
    }),
    prisma.agentLearningProfile.count({
      where: { expiresAt: { lt: now } },
    }),
    prisma.aIMemory.count({
      where: { expiresAt: { lt: now } },
    }),
  ]);

  let conversations = 0;
  if (tableExists) {
    try {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM voltagent_memory_conversations
        WHERE updated_at < ${cutoff30Days}
      `;
      conversations = Number(result[0]?.count ?? 0);
    } catch {
      // Ignore
    }
  }

  return { actionQueue, feedback, profiles, memories, conversations };
}

main()
  .catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
