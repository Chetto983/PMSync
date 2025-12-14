/**
 * VoltAgent AI Secretary Test V2 - With Performance & Cost Tracking
 *
 * IMPROVED VERSION with:
 * - Proper HITL auto-approval via database queries
 * - Performance metrics (response time per step)
 * - Cost tracking (estimated tokens/cost)
 * - Real email sending between accounts
 *
 * Your accounts:
 * - Work: dvdmarchetto@gmail.com (Google)
 * - Personal: chetto983@hotmail.it (Microsoft)
 * - Info: testopta@libero.it (Libero/IMAP)
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-real-secretary-v2.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { ActionExecutorService } from '../src/modules/ai/voltagent/services/action-executor.service';

// Performance & Cost tracking
interface StepMetrics {
  step: string;
  duration: number;
  tokensEstimate?: number;
  costEstimate?: number;
  status: 'passed' | 'failed' | 'hitl_approved' | 'skipped';
  error?: string;
}

// Mistral pricing (approximate)
const MISTRAL_PRICE_PER_1K_INPUT = 0.002; // $0.002 per 1K input tokens
const MISTRAL_PRICE_PER_1K_OUTPUT = 0.006; // $0.006 per 1K output tokens

function estimateCost(inputChars: number, outputChars: number): { tokens: number; cost: number } {
  // Rough estimate: 4 chars per token
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  const cost = (inputTokens / 1000) * MISTRAL_PRICE_PER_1K_INPUT + (outputTokens / 1000) * MISTRAL_PRICE_PER_1K_OUTPUT;
  return { tokens: inputTokens + outputTokens, cost };
}

async function runSecretaryTestV2() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║    VoltAgent AI SECRETARY V2 - Performance & Cost Audit      ║
║    Features: Real emails, HITL approval, Speed/Cost tracking ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const metrics: StepMetrics[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('❌ No user found');
    await prisma.$disconnect();
    return;
  }

  // Get providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, email: true, providerType: true, scope: true },
    orderBy: { isDefault: 'desc' },
  });

  const work = providers.find((p) => p.email.includes('gmail'))?.email || providers[0]?.email;
  const personal = providers.find((p) => p.email.includes('hotmail') || p.email.includes('outlook'))?.email || providers[1]?.email;
  const info = providers.find((p) => p.email.includes('libero'))?.email || providers[2]?.email;

  console.log('📧 ACCOUNTS:');
  console.log(`   Work:     ${work || 'N/A'}`);
  console.log(`   Personal: ${personal || 'N/A'}`);
  console.log(`   Info:     ${info || 'N/A'}`);
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const actionExecutor = app.get(ActionExecutorService);
  const conversationId = `secretary-v2-${Date.now()}`;
  const testId = `TSv2-${Date.now().toString(36).toUpperCase()}`;

  console.log(`🏷️  Test ID: ${testId}\n`);

  // Helper function to execute step and auto-approve HITL
  async function executeStep(name: string, message: string, autoApprove = false, waitMs = 0): Promise<void> {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`🧪 ${name}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`👤 "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"\n`);

    const startTime = Date.now();
    let status: StepMetrics['status'] = 'passed';
    let error: string | undefined;
    let outputLength = 0;

    try {
      const result = await voltAgentService.chat(message, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'it',
        skipCache: true,
      });

      outputLength = result.text?.length || 0;
      console.log(`   🤖 ${result.text?.substring(0, 150)}${outputLength > 150 ? '...' : ''}`);

      // Check for pending actions and auto-approve if requested
      if (autoApprove) {
        const pendingActions = await prisma.agentPendingAction.findMany({
          where: {
            tenantId: user.tenantId,
            userId: user.id,
            status: 'PENDING',
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        if (pendingActions.length > 0) {
          console.log(`   🔐 Found ${pendingActions.length} pending action(s)`);

          for (const action of pendingActions) {
            console.log(`   📋 ${action.actionType}: Approving...`);

            try {
              // Update status to APPROVED
              await prisma.agentPendingAction.update({
                where: { id: action.id },
                data: {
                  status: 'APPROVED',
                  resolvedBy: user.id,
                  resolvedAt: new Date(),
                },
              });

              // Execute the action
              const execResult = await actionExecutor.executeApprovedAction(action.id, {
                userId: user.id,
                role: 'admin',
              });

              if (execResult.success) {
                console.log(`   ✅ Action executed: ${execResult.message || 'Success'}`);
                status = 'hitl_approved';
              } else {
                console.log(`   ⚠️  Action failed: ${execResult.error || 'Unknown error'}`);
              }
            } catch (execError) {
              console.log(`   ⚠️  Execution error: ${execError instanceof Error ? execError.message : 'Unknown'}`);
            }
          }
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      status = 'failed';
      console.log(`   ❌ ERROR: ${error.substring(0, 80)}`);
    }

    const duration = Date.now() - startTime;
    const { tokens, cost } = estimateCost(message.length, outputLength);

    console.log(`   ⏱️  ${duration}ms | ~${tokens} tokens | $${cost.toFixed(4)}`);

    // Flag slow responses (>5s is too slow for UX)
    if (duration > 5000) {
      console.log(`   ⚠️  SLOW RESPONSE! User experience degraded.`);
    }

    metrics.push({
      step: name,
      duration,
      tokensEstimate: tokens,
      costEstimate: cost,
      status,
      error,
    });

    if (waitMs > 0) {
      console.log(`   ⏳ Waiting ${waitMs}ms for sync...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  // ========== TEST SCENARIOS ==========

  console.log(`${'═'.repeat(60)}`);
  console.log('📊 PHASE 1: PERFORMANCE BASELINE');
  console.log(`${'═'.repeat(60)}`);

  // Simple queries (should be fast <2s)
  await executeStep('Simple date query', 'Che giorno è oggi?');
  await executeStep('User identity query', 'Come mi chiamo?');
  await executeStep('Provider awareness', 'Quali account email ho collegato?');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📧 PHASE 2: EMAIL OPERATIONS');
  console.log(`${'═'.repeat(60)}`);

  // Email search (medium complexity)
  await executeStep('Email search', 'Mostrami le ultime 5 email non lette');
  await executeStep('Email from sender', 'Cerca email da Railway');

  // Send real email (requires HITL approval)
  if (work && personal) {
    await executeStep(
      'Send email: Work -> Personal',
      `Invia una email da ${work} a ${personal} con oggetto "[${testId}] Test AI Secretary" e corpo: "Test automatico dell'AI Secretary. Timestamp: ${new Date().toISOString()}"`,
      true, // autoApprove
      5000, // wait for sync
    );
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📅 PHASE 3: CALENDAR OPERATIONS');
  console.log(`${'═'.repeat(60)}`);

  await executeStep('Calendar today', 'Cosa ho in calendario oggi?');
  await executeStep('Availability check', 'Sono libero domani alle 10?');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('👥 PHASE 4: CONTACTS OPERATIONS');
  console.log(`${'═'.repeat(60)}`);

  await executeStep('Contact search', 'Cerca il contatto Marco');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📁 PHASE 5: FOLDER OPERATIONS');
  console.log(`${'═'.repeat(60)}`);

  await executeStep('List folders', 'Elenca le mie cartelle email');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('🧠 PHASE 6: AI INSIGHTS');
  console.log(`${'═'.repeat(60)}`);

  await executeStep('Inbox priority', 'Quali email non lette sono più urgenti?');

  // ========== RESULTS SUMMARY ==========

  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
  const totalTokens = metrics.reduce((sum, m) => sum + (m.tokensEstimate || 0), 0);
  const totalCost = metrics.reduce((sum, m) => sum + (m.costEstimate || 0), 0);
  const avgDuration = totalDuration / metrics.length;
  const passed = metrics.filter((m) => m.status === 'passed' || m.status === 'hitl_approved').length;
  const failed = metrics.filter((m) => m.status === 'failed').length;
  const slowSteps = metrics.filter((m) => m.duration > 5000);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              AI SECRETARY V2 - AUDIT RESULTS                 ║
╚══════════════════════════════════════════════════════════════╝

📊 TEST STATISTICS:
   Total Steps:    ${metrics.length}
   ✅ Passed:      ${passed}
   ❌ Failed:      ${failed}
   Success Rate:   ${((passed / metrics.length) * 100).toFixed(1)}%

⏱️  PERFORMANCE METRICS:
   Total Time:     ${(totalDuration / 1000).toFixed(1)}s
   Average Time:   ${(avgDuration / 1000).toFixed(2)}s per request
   Slow Steps:     ${slowSteps.length} (>5s)
   ${slowSteps.length > 0 ? '⚠️  WARNING: Some responses too slow for good UX!' : '✅ All responses within acceptable range'}

💰 COST ESTIMATES (Mistral):
   Total Tokens:   ~${totalTokens}
   Estimated Cost: $${totalCost.toFixed(4)} USD

📈 PERFORMANCE BY STEP:
`);

  // Sort by duration (slowest first)
  const sortedMetrics = [...metrics].sort((a, b) => b.duration - a.duration);
  sortedMetrics.forEach((m) => {
    const icon = m.duration > 5000 ? '🐢' : m.duration > 2000 ? '🐌' : '✅';
    console.log(`   ${icon} ${m.step}: ${(m.duration / 1000).toFixed(2)}s`);
  });

  // Check for test emails in DB
  const testEmails = await prisma.email.count({
    where: { tenantId: user.tenantId, subject: { contains: testId } },
  });
  console.log(`\n📬 Test emails in database: ${testEmails}`);

  if (failed > 0) {
    console.log('\n❌ FAILED STEPS:');
    metrics
      .filter((m) => m.status === 'failed')
      .forEach((m) => console.log(`   - ${m.step}: ${m.error}`));
  }

  // Performance recommendations
  console.log('\n🔍 RECOMMENDATIONS:');
  if (avgDuration > 5000) {
    console.log('   ⚠️  Average response time >5s. Consider:');
    console.log('      - Using faster models for simple queries');
    console.log('      - Implementing caching for repeated queries');
    console.log('      - Optimizing tool execution');
  }
  if (slowSteps.length > 3) {
    console.log('   ⚠️  Multiple slow steps detected. Consider:');
    console.log('      - Model routing (fast model for simple tasks)');
    console.log('      - Parallel tool execution');
  }

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log(`\n✅ AI Secretary V2 test completed!`);
  console.log(`   Test ID: ${testId}`);

  process.exit(failed > 0 ? 1 : 0);
}

runSecretaryTestV2().catch(console.error);
