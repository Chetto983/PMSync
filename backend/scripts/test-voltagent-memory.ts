/**
 * VoltAgent Memory Test Script
 * Tests memory persistence by verifying messages are saved after chat.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-memory.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

async function testMemory() {
  console.log('=== VoltAgent Memory Test ===\n');

  const prisma = createPrismaClient();

  // Get a test user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log(`Using user: ${user.email}`);
  console.log(`Tenant: ${user.tenantId}\n`);

  // Check message count before test using raw query for VoltAgent native table
  const beforeResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM voltagent_memory_messages
  `;
  const beforeCount = Number(beforeResult[0].count);
  console.log(`Messages before test: ${beforeCount}`);

  // Create NestJS application context to access services
  console.log('\nBootstrapping NestJS context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const voltAgentService = app.get(VoltAgentService);

  // Create a unique conversation ID
  const uniqueId = Date.now();
  const conversationId = `test-${uniqueId}`;
  const userName = `Mario${uniqueId % 1000}`;

  // Test message 1 - use unique name to avoid semantic cache hits
  console.log('\n--- Sending first message ---');
  console.log(`Message: "My name is ${userName}. Please remember my name."`);

  try {
    const result1 = await voltAgentService.chat(
      `My name is ${userName}. Please remember my name.`,
      {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'en',
      }
    );

    console.log(`Response: ${result1.text}\n`);

    // Check messages after first call
    const afterFirstResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
    `;
    const afterFirst = Number(afterFirstResult[0].count);
    console.log(`Messages after first call: ${afterFirst} (+${afterFirst - beforeCount})`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test message 2
    console.log('\n--- Sending second message ---');
    console.log('Message: "What is my name? Please tell me."');

    const result2 = await voltAgentService.chat(
      'What is my name? Please tell me.',
      {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId, // Same conversation
        locale: 'en',
      }
    );

    console.log(`Response: ${result2.text}\n`);

    // Check messages after second call
    const afterSecondResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM voltagent_memory_messages
    `;
    const afterSecond = Number(afterSecondResult[0].count);
    console.log(`Messages after second call: ${afterSecond} (+${afterSecond - afterFirst})`);

    // Verify memory content using raw query for VoltAgent native table
    console.log('\n--- Checking memory content ---');
    const messages = await prisma.$queryRaw<Array<{
      conversation_id: string;
      role: string;
      parts: string;
      created_at: Date;
    }>>`
      SELECT conversation_id, role, parts::text, created_at
      FROM voltagent_memory_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `;

    console.log(`Found ${messages.length} messages for conversation ${conversationId}:`);
    messages.forEach((msg, i) => {
      // Parse the parts JSON to extract text
      let content = '';
      try {
        const parts = JSON.parse(msg.parts);
        content = parts.map((p: { text?: string }) => p.text || '').join('');
      } catch {
        content = msg.parts;
      }
      console.log(`  ${i + 1}. [${msg.role}]: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
    });

    // Determine if test passed
    const hasUserMessage = messages.some(m => {
      try {
        const parts = JSON.parse(m.parts);
        return m.role === 'user' && parts.some((p: { text?: string }) => p.text?.includes(userName));
      } catch {
        return false;
      }
    });
    const hasMemoryRecall = result2.text.toLowerCase().includes(userName.toLowerCase());

    console.log('\n=== TEST RESULTS ===');
    console.log(`User message saved: ${hasUserMessage ? 'PASS' : 'FAIL'}`);
    console.log(`AI remembers name: ${hasMemoryRecall ? 'PASS' : 'FAIL'}`);
    console.log(`Messages persisted: ${messages.length >= 2 ? 'PASS' : 'FAIL'}`);

    if (hasUserMessage && hasMemoryRecall && messages.length >= 2) {
      console.log('\n>>> ALL TESTS PASSED! Memory is working correctly. <<<');
    }

  } catch (error) {
    console.error('Error during test:', error);
  }

  await app.close();
  await prisma.$disconnect();
}

testMemory().catch(console.error);
