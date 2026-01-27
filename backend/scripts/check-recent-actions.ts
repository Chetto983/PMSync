/**
 * Check recent HITL actions
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get most recent actions
  const recent = await prisma.actionQueue.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      actionType: true,
      status: true,
      rejectedReason: true,
      createdAt: true,
      actionPayload: true,
    },
  });

  console.log('=== MOST RECENT HITL ACTIONS ===\n');
  for (const a of recent) {
    console.log(`${a.id.slice(0, 12)} | ${a.actionType} | ${a.status}`);
    console.log(`  Created: ${a.createdAt.toISOString()}`);
    console.log(`  Reason: ${a.rejectedReason || 'N/A'}`);
    const payload = a.actionPayload as Record<string, unknown>;
    if (payload) {
      console.log(`  SessionId: ${payload.sessionId || 'none'}`);
      console.log(`  Severity: ${payload.severity || 'none'}`);
    }
    console.log('');
  }

  // Count by status today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayActions = await prisma.actionQueue.groupBy({
    by: ['status'],
    where: { createdAt: { gte: today } },
    _count: { id: true },
  });

  console.log('=== TODAY\'S ACTIONS BY STATUS ===\n');
  for (const s of todayActions) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
