import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('=== VoltAgent Conversations Check ===\n');

  const count = await prisma.voltAgentConversation.count();
  console.log('Total conversations:', count);

  if (count > 0) {
    const convs = await prisma.voltAgentConversation.findMany({
      take: 10,
      select: { id: true, tenantId: true, userId: true, isDeleted: true, title: true }
    });
    console.log('\nSample conversations:');
    convs.forEach(c => console.log(JSON.stringify(c)));

    // Also delete all to clean up
    console.log('\n--- Deleting all conversations and messages ---');
    const delMsgs = await prisma.voltAgentMessage.deleteMany({});
    console.log('Deleted messages:', delMsgs.count);
    const delConvs = await prisma.voltAgentConversation.deleteMany({});
    console.log('Deleted conversations:', delConvs.count);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
