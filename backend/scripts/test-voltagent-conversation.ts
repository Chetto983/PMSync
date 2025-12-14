/**
 * VoltAgent Comprehensive Conversation Test
 *
 * Tests a realistic multi-turn conversation using:
 * - Email operations (search, read)
 * - Calendar operations (list events)
 * - Contacts operations (search)
 * - Memory persistence across turns
 * - User context personalization
 *
 * Based on REAL data from your database!
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-conversation.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

interface ConversationTurn {
  userMessage: string;
  description: string;
}

async function runConversation() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     VoltAgent Comprehensive Conversation Test                ║');
  console.log('║     Testing: Email, Calendar, Contacts, Memory               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

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
  const app = await NestFactory.createApplicationContext(AppModule);
  const voltAgentService = app.get(VoltAgentService);

  const conversationId = `conversation-${Date.now()}`;

  // Define conversation turns based on REAL data
  const conversation: ConversationTurn[] = [
    {
      description: '1️⃣  Greeting & Self Introduction',
      userMessage: 'Ciao! Chi sono io? Dimmi il mio nome e cosa faccio di lavoro.',
    },
    {
      description: '1️⃣b Provider Awareness Test',
      userMessage: 'Quali account email ho collegato? Dimmi il tipo (Gmail, Outlook) e il nome.',
    },
    {
      description: '2️⃣  Email Search - Komoot notifications',
      userMessage: 'Ho ricevuto email da Komoot? Chi è andato in bici recentemente?',
    },
    {
      description: '3️⃣  Email Search - Railway build',
      userMessage: 'Cosa dice l\'ultima email da Railway? Il build è andato a buon fine?',
    },
    {
      description: '4️⃣  Calendar - Today\'s events',
      userMessage: 'Cosa ho in calendario per oggi? Devo buttare il ferroso?',
    },
    {
      description: '5️⃣  Calendar - Upcoming birthdays',
      userMessage: 'Ci sono compleanni in arrivo questa settimana?',
    },
    {
      description: '6️⃣  Contacts Search - Work contacts',
      userMessage: 'Cerca il contatto Chris Newitt. Chi è?',
    },
    {
      description: '7️⃣  Contacts Search - Italian contacts',
      userMessage: 'Chi è Renato Reinaudo nei miei contatti?',
    },
    {
      description: '8️⃣  Memory Test - Remember preference',
      userMessage: 'Ricorda che preferisco ricevere risposte brevi e in italiano.',
    },
    {
      description: '9️⃣  Memory Test - Verify recall',
      userMessage: 'Come preferisco le risposte? Te l\'ho detto prima.',
    },
    {
      description: '🔟  Summary request',
      userMessage: 'Fammi un riassunto: come mi chiamo, quali email importanti ho, e cosa devo fare oggi?',
    },
  ];

  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const turn of conversation) {
    console.log(`${turn.description}`);
    console.log('─'.repeat(60));
    console.log(`👤 User: ${turn.userMessage}\n`);

    try {
      const startTime = Date.now();
      const result = await voltAgentService.chat(turn.userMessage, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'it', // Italian locale
        skipCache: true, // Skip cache for testing
      });
      const duration = Date.now() - startTime;

      console.log(`🤖 Agent: ${result.text}`);
      console.log(`\n   ⏱️  Response time: ${duration}ms`);
      if (result.model) console.log(`   🧠 Model used: ${result.model}`);
      if (result.pendingActions?.length) {
        console.log(`   ⚠️  Pending actions: ${result.pendingActions.length}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    // Small delay between turns
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Check message count
  const messagesResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM voltagent_memory_messages
    WHERE conversation_id = ${conversationId}
  `;
  const messageCount = Number(messagesResult[0].count);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Conversation Summary                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Statistics:`);
  console.log(`   Total turns: ${conversation.length}`);
  console.log(`   Messages persisted: ${messageCount}`);
  console.log(`   Conversation ID: ${conversationId}`);

  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ Conversation test completed!');
}

runConversation().catch(console.error);
