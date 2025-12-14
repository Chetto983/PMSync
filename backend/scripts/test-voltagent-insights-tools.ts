/**
 * VoltAgent Insights Tools Test
 *
 * Tests all AI-powered email analysis tools:
 * - summarize_email: Generate concise email summaries
 * - analyze_sentiment: Analyze email sentiment and tone
 * - compose_reply: Compose intelligent reply drafts
 * - extract_action_items: Extract action items from emails
 * - categorize_email: Suggest labels for email categorization
 * - generate_smart_replies: Generate quick reply suggestions
 * - analyze_email: Comprehensive email analysis
 * - detect_intent: Detect email intent and purpose
 * - calculate_priority: Calculate email priority score
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-insights-tools.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

interface TestResult {
  name: string;
  tool: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  response?: string;
  error?: string;
}

async function runInsightsToolsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        VoltAgent Insights Tools Validation Test              ║
║        Testing: 9 AI-powered email analysis tools            ║
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

  // Get a real email with content for testing
  const testEmail = await prisma.email.findFirst({
    where: {
      tenantId: user.tenantId,
      bodyText: { not: null },
    },
    orderBy: { receivedAt: 'desc' },
    select: { id: true, subject: true, from: true, snippet: true },
  });

  // Get email stats
  const emailCount = await prisma.email.count({
    where: { tenantId: user.tenantId },
  });

  console.log('🧠 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log(`   Total Emails: ${emailCount}`);
  if (testEmail) {
    console.log(`   Test Email: "${testEmail.subject?.substring(0, 40)}..." from ${testEmail.from}`);
  }
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `insights-tools-test-${Date.now()}`;

  // Define test cases
  const testCases = [
    // SUMMARIZATION
    {
      name: 'Summarize Recent Email',
      tool: 'summarize_email',
      message: 'Riassumi l\'ultima email che ho ricevuto',
      execute: true,
    },
    {
      name: 'Summarize Specific Sender',
      tool: 'summarize_email',
      message: 'Riassumi l\'ultima email da Railway o GitHub',
      execute: true,
    },

    // SENTIMENT ANALYSIS
    {
      name: 'Analyze Email Sentiment',
      tool: 'analyze_sentiment',
      message: 'Qual è il tono dell\'ultima email che ho ricevuto? È positivo o negativo?',
      execute: true,
    },
    {
      name: 'Analyze Multiple Emails Sentiment',
      tool: 'analyze_sentiment',
      message: 'Analizza il sentiment delle ultime 3 email ricevute',
      execute: true,
    },

    // REPLY COMPOSITION
    {
      name: 'Compose Professional Reply',
      tool: 'compose_reply',
      message: 'Scrivi una bozza di risposta professionale all\'ultima email importante',
      execute: true,
    },
    {
      name: 'Compose Casual Reply',
      tool: 'compose_reply',
      message: 'Scrivi una risposta informale e amichevole all\'ultima email da un collega',
      execute: true,
    },

    // ACTION ITEMS EXTRACTION
    {
      name: 'Extract Action Items',
      tool: 'extract_action_items',
      message: 'Quali azioni devo compiere basandomi sulle email non lette?',
      execute: true,
    },

    // EMAIL CATEGORIZATION
    {
      name: 'Categorize Email',
      tool: 'categorize_email',
      message: 'Come categorizzaeresti le ultime 5 email? Suggerisci delle etichette.',
      execute: true,
    },

    // SMART REPLIES
    {
      name: 'Generate Smart Replies',
      tool: 'generate_smart_replies',
      message: 'Genera 3 risposte rapide per l\'ultima email ricevuta',
      execute: true,
    },

    // COMPREHENSIVE ANALYSIS
    {
      name: 'Comprehensive Email Analysis',
      tool: 'analyze_email',
      message: 'Fai un\'analisi completa dell\'ultima email importante: sentiment, urgenza, intento',
      execute: true,
    },

    // INTENT DETECTION
    {
      name: 'Detect Email Intent',
      tool: 'detect_intent',
      message: 'Qual è l\'intento principale dell\'ultima email che ho ricevuto?',
      execute: true,
    },

    // PRIORITY CALCULATION
    {
      name: 'Calculate Email Priority',
      tool: 'calculate_priority',
      message: 'Calcola la priorità delle mie email non lette e dimmi quale gestire prima',
      execute: true,
    },

    // COMBINED INSIGHTS
    {
      name: 'Daily Email Briefing',
      tool: 'multiple',
      message: 'Fammi un briefing delle email di oggi: riassunti, priorità e azioni richieste',
      execute: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('🧠 INSIGHTS TOOLS TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  for (const test of testCases) {
    console.log(`🧪 Testing: ${test.name}`);
    console.log(`   Tool: ${test.tool}`);
    console.log(`   👤 "${test.message}"`);

    if (!test.execute) {
      console.log(`   ⏭️  SKIPPED`);
      results.push({
        name: test.name,
        tool: test.tool,
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
        locale: 'it',
        skipCache: true,
      });
      const duration = Date.now() - startTime;

      if (result.text && result.text.length > 0) {
        console.log(`   ✅ PASSED (${duration}ms)`);
        console.log(`   🤖 ${result.text.substring(0, 150)}${result.text.length > 150 ? '...' : ''}`);

        // Flag slow responses
        if (duration > 10000) {
          console.log(`   ⚠️  SLOW: AI insights operations taking >10s`);
        }

        results.push({
          name: test.name,
          tool: test.tool,
          status: 'passed',
          duration,
          response: result.text.substring(0, 300),
        });
      } else {
        console.log(`   ❓ No response text`);
        results.push({
          name: test.name,
          tool: test.tool,
          status: 'failed',
          duration,
          error: 'No response text',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ FAILED: ${errorMsg.substring(0, 80)}`);
      results.push({
        name: test.name,
        tool: test.tool,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const avgDuration = results.filter((r) => r.status === 'passed').reduce((sum, r) => sum + r.duration, 0) / passed;

  console.log(`${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               INSIGHTS TOOLS TEST RESULTS                    ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Tests: ${testCases.length}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}
   ⏭️  Skipped:  ${skipped}

⏱️  Performance:
   Average Response: ${(avgDuration / 1000).toFixed(2)}s
   ${avgDuration > 5000 ? '⚠️  AI insights operations are slow (>5s average)' : '✅ Performance acceptable'}

📈 Success Rate: ${((passed / (testCases.length - skipped)) * 100).toFixed(1)}%
`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  // Performance breakdown
  console.log('\n📊 Response Times by Test:');
  results
    .filter((r) => r.status === 'passed')
    .sort((a, b) => b.duration - a.duration)
    .forEach((r) => {
      const icon = r.duration > 10000 ? '🐢' : r.duration > 5000 ? '🐌' : '✅';
      console.log(`   ${icon} ${r.name}: ${(r.duration / 1000).toFixed(2)}s`);
    });

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ Insights tools validation completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runInsightsToolsTest().catch(console.error);
