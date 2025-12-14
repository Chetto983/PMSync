/**
 * VoltAgent Web Search Test
 *
 * Tests the Mistral Agents API web search integration.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-websearch.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  response?: string;
  error?: string;
}

async function runWebSearchTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           VoltAgent Web Search Test                          ║
║           Testing: Mistral Agents API web_search             ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const results: TestResult[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('❌ No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('🧠 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `websearch-test-${Date.now()}`;

  // Define test cases
  const testCases = [
    {
      name: 'Current Weather Query',
      message: "What's the weather like in Milan, Italy today?",
      execute: true,
    },
    {
      name: 'Recent News Query',
      message: "What are the latest tech news from today?",
      execute: true,
    },
    {
      name: 'Current Events Query',
      message: 'What major events happened this week in technology?',
      execute: true,
    },
    {
      name: 'Sports Query (IT)',
      message: "Quali sono i risultati dell'ultima partita di Serie A?",
      execute: true,
    },
    {
      name: 'Stock Price Query',
      message: 'What is the current stock price of NVIDIA?',
      execute: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('🌐 WEB SEARCH TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  for (const test of testCases) {
    console.log(`🧪 Testing: ${test.name}`);
    console.log(`   👤 "${test.message}"`);

    if (!test.execute) {
      console.log(`   ⏭️  SKIPPED`);
      results.push({
        name: test.name,
        status: 'skipped',
        duration: 0,
      });
      console.log();
      continue;
    }

    try {
      const startTime = Date.now();
      const result = await voltAgentService.chat(test.message, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: test.message.includes('Quali') ? 'it' : 'en',
        skipCache: true,
      });
      const duration = Date.now() - startTime;

      if (result.text && result.text.length > 0) {
        console.log(`   ✅ PASSED (${duration}ms)`);
        console.log(`   🤖 ${result.text.substring(0, 200)}${result.text.length > 200 ? '...' : ''}`);

        // Flag slow responses
        if (duration > 15000) {
          console.log(`   ⚠️  SLOW: Web search operations taking >15s`);
        }

        results.push({
          name: test.name,
          status: 'passed',
          duration,
          response: result.text.substring(0, 500),
        });
      } else {
        console.log(`   ❓ No response text`);
        results.push({
          name: test.name,
          status: 'failed',
          duration,
          error: 'No response text',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ FAILED: ${errorMsg.substring(0, 100)}`);
      results.push({
        name: test.name,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limiting
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const avgDuration = results.filter((r) => r.status === 'passed').reduce((sum, r) => sum + r.duration, 0) / (passed || 1);

  console.log(`${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               WEB SEARCH TEST RESULTS                        ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Tests: ${testCases.length}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}
   ⏭️  Skipped:  ${skipped}

⏱️  Performance:
   Average Response: ${(avgDuration / 1000).toFixed(2)}s
   ${avgDuration > 10000 ? '⚠️  Web search operations are slow (>10s average)' : '✅ Performance acceptable'}

📈 Success Rate: ${((passed / (testCases.length - skipped)) * 100).toFixed(1)}%
`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ Web search test completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runWebSearchTest().catch(console.error);
