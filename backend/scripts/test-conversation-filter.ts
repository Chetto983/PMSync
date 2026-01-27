/**
 * Test conversation filter - check what messages are returned
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('=== TEST CONVERSATION FILTER ===\n');

  // Get most recent conversation
  const conversations = await prisma.$queryRaw<Array<{
    id: string;
    user_id: string;
    title: string | null;
    created_at: Date;
  }>>(
    Prisma.sql`
      SELECT id, user_id, title, created_at
      FROM voltagent_memory_conversations
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  if (conversations.length === 0) {
    console.log('No conversations found');
    return;
  }

  const conv = conversations[0];
  console.log(`Testing conversation: ${conv.id}`);
  console.log(`User: ${conv.user_id}`);
  console.log(`Title: ${conv.title || 'untitled'}`);
  console.log('');

  // Get ALL messages for this conversation
  const messages = await prisma.$queryRaw<Array<{
    message_id: string;
    role: string;
    parts: unknown;
    metadata: unknown;
    created_at: Date;
  }>>(
    Prisma.sql`
      SELECT message_id, role, parts, metadata, created_at
      FROM voltagent_memory_messages
      WHERE conversation_id = ${conv.id}
      ORDER BY created_at ASC
    `
  );

  console.log(`Total messages in DB: ${messages.length}\n`);

  // Analyze each message
  let toolTypeCount = 0;
  let subAgentCount = 0;
  let textCount = 0;
  let delegationPatternCount = 0;

  const filteredMessages: typeof messages = [];

  for (const msg of messages) {
    const parts = msg.parts as Array<{ type?: string; text?: string }> | null;
    const metadata = msg.metadata as Record<string, unknown> | null;

    // Check if message has NO text content (only tool/step parts)
    // This matches the service logic - we KEEP messages that have text, even if they also have tool parts
    const hasTextContent = parts?.some(p =>
      (!p.type || p.type === 'text') && p.text && p.text.trim().length > 0
    ) ?? false;
    // Check subAgent metadata
    const hasSubAgent = !!(metadata?.subAgentId || metadata?.subAgentName);

    if (!hasTextContent) {
      toolTypeCount++;
      const partTypes = parts?.map(p => p.type || 'undefined').join(', ') || 'empty';
      console.log(`[FILTER:no-text] ${msg.role} | parts: ${partTypes}`);
      continue;
    }

    if (hasSubAgent) {
      subAgentCount++;
      const textContent = parts?.filter(p => !p.type || p.type === 'text').map(p => p.text || '').join(' ') || '';
      console.log(`[FILTER:subAgent] ${msg.role} | "${textContent.slice(0, 50)}..."`);
      continue;
    }

    // Check delegation pattern in content
    const text = parts?.map(p => p.text || '').join(' ') || '';
    const delegationPatterns = [
      /^Send email to .+ with subject .+ and body .+/i,
      /^Update the email body to .+ and send it to .+/i,
      /^Search and summarize emails/i,
      /^Search for contact/i,
      /^Create.*contact/i,
    ];
    const isDelegation = delegationPatterns.some(p => p.test(text.trim()));

    if (isDelegation && msg.role === 'user') {
      delegationPatternCount++;
      console.log(`[FILTER:delegation] ${msg.role} | ${text.slice(0, 50)}...`);
      continue;
    }

    textCount++;
    filteredMessages.push(msg);
    console.log(`[KEEP] ${msg.role} | ${text.slice(0, 50)}...`);
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Total messages: ${messages.length}`);
  console.log(`Filtered (no text content): ${toolTypeCount}`);
  console.log(`Filtered (subAgent duplicate): ${subAgentCount}`);
  console.log(`Filtered (delegation pattern): ${delegationPatternCount}`);
  console.log(`Kept (visible to user): ${textCount}`);

  console.log('\n=== EXPECTED VISIBLE MESSAGES ===\n');
  for (const msg of filteredMessages) {
    const parts = msg.parts as Array<{ type?: string; text?: string }> | null;
    const text = parts?.map(p => p.text || '').join(' ') || '';
    console.log(`${msg.role}: ${text.slice(0, 100)}...`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
