import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function main() {
  console.log('\n=== CHECKING DELEGATE_TASK CALLS ===\n');

  const msgs = await prisma.$queryRaw<any[]>`
    SELECT message_id, role, parts, created_at
    FROM voltagent_memory_messages
    WHERE conversation_id LIKE 'bruteforce-%'
    ORDER BY created_at DESC
    LIMIT 200
  `;

  console.log('Total messages:', msgs.length);

  // Find delegate_task calls
  let delegateCount = 0;

  for (const msg of msgs) {
    const parts = typeof msg.parts === 'string' ? JSON.parse(msg.parts) : msg.parts || [];

    for (const part of parts) {
      if (part.type === 'tool-delegate_task') {
        delegateCount++;
        console.log('\n=== DELEGATE_TASK #' + delegateCount + ' ===');
        console.log('Time:', msg.created_at);
        console.log('Args:', JSON.stringify(part.args || part.toolCallArgs || {}, null, 2).substring(0, 500));
        console.log('Result:', JSON.stringify(part.result || part.toolResult || {}, null, 2).substring(0, 500));
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('Total delegate_task calls:', delegateCount);

  // Also check for any ActionsAgent mentions
  console.log('\n=== CHECKING FOR ACTIONS AGENT MENTIONS ===');
  let actionsAgentMentions = 0;

  for (const msg of msgs) {
    const partsStr = JSON.stringify(msg.parts || '');
    if (partsStr.toLowerCase().includes('actionsagent')) {
      actionsAgentMentions++;
      console.log('\nMessage with ActionsAgent mention:');
      console.log('Time:', msg.created_at);
      console.log('Parts (first 400 chars):', partsStr.substring(0, 400));
    }
  }

  console.log('\nTotal ActionsAgent mentions:', actionsAgentMentions);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
