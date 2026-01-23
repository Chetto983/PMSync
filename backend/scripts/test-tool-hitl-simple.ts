/**
 * Simple test to verify:
 * 1. Tools actually execute and return requiresApproval
 * 2. onToolEnd hook fires
 * 3. onPendingAction callback is called
 * 4. HITL action is persisted to database
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActionStatus } from '@prisma/client';
import { ModelRouterService } from '../src/modules/ai/voltagent/services/model-router.service';
import { ChatRequestProcessorService } from '../src/modules/ai/voltagent/services/chat-request-processor.service';

const TENANT_ID = process.argv[2] || 'cmjgylxkg000054yhnjpkmzd9';
const USER_ID = process.argv[3] || 'test-user';

async function main() {
  const testStartTime = Date.now();

  console.log('\n===== SIMPLE HITL TOOL TEST (WITH ROUTING DEBUG) =====\n');
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`User: ${USER_ID}\n`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'], // Reduce noise, key debug added via custom logging
  });

  const voltAgent = app.get(VoltAgentService);
  const hitlService = app.get(HitlService);
  const prisma = app.get(PrismaService);
  const modelRouter = app.get(ModelRouterService, { strict: false });
  const chatProcessor = app.get(ChatRequestProcessorService, { strict: false });

  // Debug: Verify routing before chat
  const testMessage = 'Send an email to test@example.com with subject "Test" and body "Hello"';
  console.log('\n=== ROUTING DEBUG ===');
  console.log(`Services available: ModelRouter=${!!modelRouter}, ChatProcessor=${!!chatProcessor}`);

  if (modelRouter) {
    const routingResult = modelRouter.routeMessage(testMessage);
    console.log(`Model Router result:`);
    console.log(`  suggestedAgent: ${routingResult.suggestedAgent}`);
    console.log(`  complexity: ${routingResult.complexity}`);
    console.log(`  recommendedModel: ${routingResult.recommendedModel}`);

    if (routingResult.suggestedAgent === 'Actions') {
      console.log('✓ Direct routing to ActionsAgent SHOULD be used');
    } else {
      console.log('✗ WARNING: Will route via Supervisor - hooks may not fire!');
    }
  } else {
    console.log('✗ ModelRouterService not available - will default to Supervisor!');
  }

  // Clean up any previous test actions
  const sessionId = `test-session-${Date.now()}`;
  console.log(`\nSession: ${sessionId}`);

  // Count pending actions BEFORE test
  const beforeCount = await prisma.actionQueue.count({
    where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
  });
  console.log(`Pending actions BEFORE: ${beforeCount}`);

  // Test 1: Send a message that should trigger email HITL
  console.log('\n--- Test 1: Send email (should trigger HITL) ---');
  const chatStartTime = Date.now();
  try {
    const result = await voltAgent.chat(
      testMessage,
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: sessionId,
        locale: 'en',
      },
    );
    console.log('Response:', result.text?.substring(0, 200) + '...');
    console.log('Pending actions in response:', result.pendingActions?.length || 0);
    console.log('Requires approval:', result.requiresApproval);
  } catch (err) {
    console.error('Chat failed:', err instanceof Error ? err.message : err);
  }

  // Wait for async hook processing
  await new Promise((r) => setTimeout(r, 2000));

  // Count pending actions AFTER test
  const afterCount = await prisma.actionQueue.count({
    where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
  });
  console.log(`\nPending actions AFTER: ${afterCount}`);
  console.log(`New actions created: ${afterCount - beforeCount}`);

  // Check recent actions for this tenant (created after chat started)
  const recentActions = await prisma.actionQueue.findMany({
    where: {
      tenantId: TENANT_ID,
      createdAt: { gte: new Date(chatStartTime - 5000) }, // 5s buffer
    },
    select: {
      id: true,
      actionType: true,
      status: true,
      actionPayload: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\nRecent actions:', JSON.stringify(recentActions, null, 2));

  // Summary
  console.log('\n===== SUMMARY =====');
  const newActionsCount = afterCount - beforeCount;

  if (newActionsCount > 0) {
    console.log('✓ PASS: HITL actions were created');
    console.log('  → Direct routing to ActionsAgent is working!');
    console.log('  → onToolEnd hooks are firing correctly');
  } else {
    console.log('✗ FAIL: No HITL actions were created');
    console.log('\nDiagnostic checklist:');
    console.log('1. Did model router return Actions agent? (Check routing debug above)');
    console.log('2. Is direct routing bypassing Supervisor?');
    console.log('3. Is onToolEnd hook firing for manage_email tool?');
    console.log('4. Is onPendingAction callback being called?');
  }

  // Force exit to avoid Redis cleanup errors flooding output
  console.log('\n[Exiting cleanly...]');
  process.exit(newActionsCount > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
