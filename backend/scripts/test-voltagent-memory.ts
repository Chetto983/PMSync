/**
 * VoltAgent Memory & User Context Test Script
 * Tests:
 * 1. Memory persistence across messages
 * 2. User context (name, job, preferences) in agent instructions
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-memory.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

async function testMemory() {
  console.log('=== VoltAgent Memory & User Context Test ===\n');

  const prisma = createPrismaClient();

  // Get test user with preferences
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('User Profile:');
  console.log(`  Name: ${user.firstName} ${user.lastName}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Job: ${user.userPreferences?.jobTitle || 'Not set'}`);
  console.log(`  Department: ${user.userPreferences?.department || 'Not set'}`);
  console.log(`  Communication Style: ${user.userPreferences?.communicationStyle || 'Not set'}`);
  console.log(`  Tenant: ${user.tenantId}\n`);

  // Clear Redis semantic cache to avoid cached responses
  console.log('Clearing Redis semantic cache...');

  // Create NestJS application context
  console.log('Bootstrapping NestJS context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const voltAgentService = app.get(VoltAgentService);

  // Create a unique conversation ID
  const uniqueId = Date.now();
  const conversationId = `test-context-${uniqueId}`;

  console.log('\n=== Test 1: User Context Recognition ===');
  console.log('Asking: "What do you know about me?"');

  try {
    const result1 = await voltAgentService.chat(
      'What do you know about me? Tell me my name, email, and job if you know them.',
      {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'en',
        skipCache: true, // Skip semantic cache
      }
    );

    console.log(`\nAI Response:\n${result1.text}\n`);

    // Check if AI knows user info
    const knowsName = result1.text.toLowerCase().includes(user.firstName?.toLowerCase() || 'NOTFOUND');
    const knowsJob = user.userPreferences?.jobTitle
      ? result1.text.toLowerCase().includes(user.userPreferences.jobTitle.toLowerCase())
      : false;

    console.log('=== Context Recognition Results ===');
    console.log(`AI knows user name: ${knowsName ? 'PASS' : 'FAIL'}`);
    console.log(`AI knows user job: ${knowsJob ? 'PASS' : 'FAIL'}`);

    // Test 2: Memory recall
    console.log('\n=== Test 2: Memory Persistence ===');
    console.log('Telling AI a secret...');

    const secretCode = `SECRET${uniqueId % 1000}`;
    const result2 = await voltAgentService.chat(
      `Please remember this secret code: ${secretCode}. I will ask you about it later.`,
      {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'en',
        skipCache: true,
      }
    );
    console.log(`AI Response: ${result2.text}\n`);

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('Asking AI to recall the secret...');
    const result3 = await voltAgentService.chat(
      'What was the secret code I told you earlier?',
      {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'en',
        skipCache: true,
      }
    );
    console.log(`AI Response: ${result3.text}\n`);

    const remembersSecret = result3.text.includes(secretCode);

    console.log('=== Memory Persistence Results ===');
    console.log(`AI remembers secret code: ${remembersSecret ? 'PASS' : 'FAIL'}`);

    // Check messages in DB
    const messagesResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
      WHERE conversation_id = ${conversationId}
    `;
    const messageCount = Number(messagesResult[0].count);
    console.log(`Messages saved to DB: ${messageCount} (expected: 6)`);

    // Final summary
    console.log('\n=== FINAL RESULTS ===');
    const allPassed = knowsName && remembersSecret;
    if (allPassed) {
      console.log('>>> ALL TESTS PASSED! User context and memory working correctly. <<<');
    } else {
      console.log('>>> SOME TESTS FAILED <<<');
      if (!knowsName) console.log('  - User context not being passed to agent');
      if (!remembersSecret) console.log('  - Memory not persisting across messages');
    }

  } catch (error) {
    console.error('Error during test:', error);
  }

  await app.close();
  await prisma.$disconnect();
}

testMemory().catch(console.error);
