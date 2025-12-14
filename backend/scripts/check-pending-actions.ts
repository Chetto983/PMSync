/**
 * Check pending actions in database
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();

  const actions = await prisma.agentPendingAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      actionType: true,
      status: true,
      createdAt: true,
      payload: true,
    },
  });

  console.log('Recent Pending Actions:');
  console.log(JSON.stringify(actions, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
