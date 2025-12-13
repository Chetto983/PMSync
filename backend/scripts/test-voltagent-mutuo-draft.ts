/**
 * Test Script: Search Mutuo Emails and Create Draft
 *
 * Tests:
 * 1. Search for "mutuo" (mortgage) emails in Gmail
 * 2. Summarize the found emails
 * 3. Create a draft email based on context
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-mutuo-draft.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     VoltAgent: Mutuo Email Search & Draft Test               ║
║     Testing: Email search, summarization, draft creation     ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('📧 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Job: ${user.userPreferences?.jobTitle || 'Not set'}`);
  console.log(`   Style: ${user.userPreferences?.communicationStyle || 'Not set'}\n`);

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const voltAgent = app.get(VoltAgentService);

  const conversationId = `mutuo-test-${Date.now()}`;

  // Test messages for mutuo email search and draft creation
  const testMessages = [
    {
      name: '🔍 Search Mutuo Emails',
      message: 'Cerca nelle mie email tutte quelle relative al mutuo. Fammi un riassunto di cosa trattano.',
    },
    {
      name: '✍️ Create Draft Request',
      message: 'Perfetto, ora crea una bozza di email da inviare alla banca per chiedere informazioni aggiornate sul mio mutuo, includi i dettagli importanti che hai trovato nelle email precedenti.',
    },
  ];

  for (const test of testMessages) {
    console.log(`
═══════════════════════════════════════════════════════════════
${test.name}
───────────────────────────────────────────────────────────────
👤 User: ${test.message}
`);

    try {
      const startTime = Date.now();

      const response = await voltAgent.chat(test.message, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'it',
        skipCache: true,
      });

      const duration = Date.now() - startTime;

      console.log(`🤖 Agent Response:
${response.text}

   ⏱️  Response time: ${duration}ms
   🧠 Model used: ${response.model || 'N/A'}
`);

      // Show pending actions if any (draft creation will trigger HITL)
      if (response.pendingActions && response.pendingActions.length > 0) {
        console.log('📋 Pending Actions (requires user approval):');
        for (const action of response.pendingActions) {
          console.log(`   - Action ID: ${action.id}`);
          console.log(`     Type: ${action.actionType}`);
          console.log(`     Status: ${action.status}`);
          if (action.actionPayload) {
            const payload = typeof action.actionPayload === 'string'
              ? JSON.parse(action.actionPayload)
              : action.actionPayload;
            console.log(`     Payload: ${JSON.stringify(payload, null, 2).substring(0, 500)}...`);
          }
        }
        console.log('');
      }

      console.log('═══════════════════════════════════════════════════════════════\n');

      // Wait between messages
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Error in ${test.name}:`, error instanceof Error ? error.message : error);
    }
  }

  // Cleanup
  await prisma.$disconnect();
  await app.close();
  console.log('\n✅ Test completed!');
  process.exit(0);
}

main().catch(console.error);
