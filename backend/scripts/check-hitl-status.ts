/**
 * Check HITL status and recent contacts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tenantId = 'cmiz37cl10000aoyh9yn0s4a1';

  // 1. Check if new contact was created
  console.log('=== NEW CONTACTS (last 5) ===');
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, displayName: true, emails: true, createdAt: true }
  });
  contacts.forEach(c => {
    console.log('-', c.displayName, '|', JSON.stringify(c.emails), '|', c.createdAt);
  });

  // 2. Check AgentPendingAction table
  console.log('\n=== AGENT PENDING ACTIONS ===');
  const actions = await prisma.agentPendingAction.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('Total actions:', actions.length);
  actions.forEach(a => {
    console.log('-', a.id, '|', a.actionType, '|', a.status, '|', a.createdAt);
  });

  // 3. Check latest VoltAgent messages for context
  console.log('\n=== LATEST VOLTAGENT MESSAGES ===');
  const messages = await prisma.voltAgentMessage.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { role: true, content: true, agentUsed: true, createdAt: true }
  });
  messages.forEach(m => {
    console.log('[' + m.role + ']', m.content.substring(0, 100) + '...');
  });

  await prisma.$disconnect();
}

main().catch(e => console.error(e));
