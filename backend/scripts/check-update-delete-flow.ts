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
  console.log('\n=== CHECKING UPDATE/DELETE CONTACT/EVENT FLOW ===\n');

  // Look for all messages in the bruteforce conversation
  const msgs = await prisma.$queryRaw<any[]>`
    SELECT message_id, role, parts, created_at
    FROM voltagent_memory_messages
    WHERE conversation_id LIKE 'bruteforce-%'
    ORDER BY created_at DESC
    LIMIT 200
  `;

  console.log('Total messages:', msgs.length);

  // Find messages related to update/delete contact/event
  const relevantMsgs: any[] = [];

  for (const msg of msgs) {
    const parts = typeof msg.parts === 'string' ? JSON.parse(msg.parts) : msg.parts || [];

    for (const part of parts) {
      const text = (part.text || '').toLowerCase();
      const partStr = JSON.stringify(part).toLowerCase();

      if (
        text.includes('update contact') ||
        text.includes('delete contact') ||
        text.includes('aggiorna contatto') ||
        text.includes('elimina contatto') ||
        text.includes('update event') ||
        text.includes('delete event') ||
        text.includes('aggiorna evento') ||
        text.includes('elimina evento') ||
        partStr.includes('manage_contact') ||
        partStr.includes('manage_event') ||
        partStr.includes('search_contacts') ||
        partStr.includes('get_events')
      ) {
        relevantMsgs.push({ msg, part });
      }
    }
  }

  console.log('\n=== RELEVANT MESSAGES ===');
  console.log('Found:', relevantMsgs.length);

  for (const { msg, part } of relevantMsgs.slice(0, 20)) {
    console.log('\n---');
    console.log('Time:', msg.created_at);
    console.log('Role:', msg.role);
    console.log('Part type:', part.type);

    if (part.type === 'text') {
      console.log('Text:', (part.text || '').substring(0, 400));
    } else if (part.type.startsWith('tool-')) {
      console.log('Tool:', part.type);
      // VoltAgent stores tool args in 'input' property, not 'args'
      const toolInput = part.input || part.args || part.toolCallArgs || {};
      const toolOutput = part.output || part.result || part.toolResult || {};
      console.log('Input:', JSON.stringify(toolInput).substring(0, 300));
      console.log('Output:', JSON.stringify(toolOutput).substring(0, 400));
      console.log('State:', part.state || 'unknown');
    }
  }

  // Check for manage_contact and manage_event tool calls
  console.log('\n=== MANAGE_CONTACT / MANAGE_EVENT TOOL CALLS ===');
  let manageContactCount = 0;
  let manageEventCount = 0;

  for (const msg of msgs) {
    const parts = typeof msg.parts === 'string' ? JSON.parse(msg.parts) : msg.parts || [];

    for (const part of parts) {
      if (part.type === 'tool-manage_contact') {
        manageContactCount++;
        console.log('\n[manage_contact]');
        // VoltAgent stores tool args in 'input' property
        console.log('Input:', JSON.stringify(part.input || part.args || {}).substring(0, 300));
        console.log('Output:', JSON.stringify(part.output || part.result || {}).substring(0, 300));
      }
      if (part.type === 'tool-manage_event') {
        manageEventCount++;
        console.log('\n[manage_event]');
        console.log('Input:', JSON.stringify(part.input || part.args || {}).substring(0, 300));
        console.log('Output:', JSON.stringify(part.output || part.result || {}).substring(0, 300));
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log('manage_contact calls:', manageContactCount);
  console.log('manage_event calls:', manageEventCount);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
