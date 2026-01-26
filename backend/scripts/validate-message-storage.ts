/**
 * Validate Message Storage Language
 *
 * Checks VoltAgent memory to verify what language user messages are stored in.
 * This helps diagnose the issue where Italian input is stored as English.
 *
 * Usage: npx ts-node --transpile-only scripts/validate-message-storage.ts
 */
import 'dotenv/config';

async function main() {
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const prisma = createPrismaClient();

  console.log('='.repeat(60));
  console.log('VoltAgent Message Storage Language Validation');
  console.log('='.repeat(60));

  // Get recent conversations
  const conversations = await prisma.voltagent_memory_conversations.findMany({
    orderBy: { updated_at: 'desc' },
    take: 5,
  });

  console.log(`\nFound ${conversations.length} recent conversations:\n`);

  for (const conv of conversations) {
    console.log('-'.repeat(60));
    console.log(`Conversation: ${conv.id}`);
    console.log(`User ID: ${conv.user_id}`);
    console.log(`Title: ${conv.title || '(no title)'}`);
    console.log(`Updated: ${conv.updated_at}`);

    // Get messages for this conversation
    const messages = await prisma.voltagent_memory_messages.findMany({
      where: { conversation_id: conv.id },
      orderBy: { created_at: 'asc' },
      take: 20,
    });

    console.log(`\nMessages (${messages.length}):`);

    for (const msg of messages) {
      const parts = msg.parts as Array<{ type: string; text?: string }> | null;
      let content = '(no content)';

      if (parts && Array.isArray(parts)) {
        content = parts
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { type: string; text?: string }) => p.text || '')
          .join(' ')
          .slice(0, 300);
      }

      console.log(`\n  [${msg.role.toUpperCase()}] ${msg.message_id}`);
      console.log(`  Content: ${content}${content.length >= 300 ? '...' : ''}`);
      console.log(`  Created: ${msg.created_at}`);

      // Detect language patterns
      const englishPatterns = [
        /\bcheck\b/i, /\bfind\b/i, /\bsearch\b/i, /\bget\b/i,
        /\bevents?\b/i, /\bemails?\b/i, /\bnext week\b/i, /\btoday\b/i,
        /\bfollow[- ]?up\b/i, /\bpending\b/i, /\bactions?\b/i,
      ];

      const italianPatterns = [
        /\bcontrolla\b/i, /\bcerca\b/i, /\btrova\b/i,
        /\beventi?\b/i, /\bemail\b/i, /\bprossima settimana\b/i, /\boggi\b/i,
        /\bfollow[- ]?up\b/i, /\bin sospeso\b/i, /\bazioni?\b/i,
      ];

      const hasEnglishPattern = englishPatterns.some((p) => p.test(content));
      const hasItalianPattern = italianPatterns.some((p) => p.test(content));

      if (msg.role === 'user') {
        if (hasEnglishPattern && !hasItalianPattern) {
          console.log(`  >>> ENGLISH detected in user message`);
        } else if (hasItalianPattern && !hasEnglishPattern) {
          console.log(`  >>> ITALIAN detected in user message`);
        } else if (hasEnglishPattern && hasItalianPattern) {
          console.log(`  >>> MIXED language detected in user message`);
        }
      }
    }

    // Get steps for this conversation
    const steps = await prisma.voltagent_memory_steps.findMany({
      where: { conversation_id: conv.id },
      orderBy: { created_at: 'asc' },
      take: 30,
    });

    if (steps.length > 0) {
      console.log(`\n  Steps (${steps.length}):`);
      for (const step of steps) {
        const stepContent = step.content?.slice(0, 150) || '(no content)';
        console.log(`    [${step.type}] ${step.role}: ${stepContent}${stepContent.length >= 150 ? '...' : ''}`);

        // Check delegation task arguments
        if (step.type === 'tool_call') {
          const args = step.arguments as Record<string, unknown> | null;
          if (args?.task) {
            console.log(`      --> Delegation task: "${args.task}"`);
          }
          if (args?.targetAgents) {
            console.log(`      --> Target agents: ${JSON.stringify(args.targetAgents)}`);
          }
        }
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary Statistics');
  console.log('='.repeat(60));

  const totalMessages = await prisma.voltagent_memory_messages.count();
  const userMessages = await prisma.voltagent_memory_messages.count({
    where: { role: 'user' },
  });
  const assistantMessages = await prisma.voltagent_memory_messages.count({
    where: { role: 'assistant' },
  });
  const totalSteps = await prisma.voltagent_memory_steps.count();

  console.log(`\nTotal messages: ${totalMessages}`);
  console.log(`User messages: ${userMessages}`);
  console.log(`Assistant messages: ${assistantMessages}`);
  console.log(`Total steps: ${totalSteps}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
