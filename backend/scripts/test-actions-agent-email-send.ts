/**
 * ActionsAgent Email Send Workflow Test
 *
 * Validates the fix for ActionsAgent:
 * 1. Agent MUST call list_emails(mode: "accounts") FIRST to get providerId
 * 2. Agent matches user-specified account to correct providerId
 * 3. Agent calls manage_email(action: "send", providerId: "...", ...)
 * 4. HITL action is created with correct parameters
 *
 * Tenant: cmjgylxkg000054yhnjpkmzd9
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-actions-agent-email-send.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';

// Test tenant ID
const TEST_TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  details?: string;
  error?: string;
}

async function runActionsAgentEmailSendTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   ActionsAgent Email Send Workflow Validation                ║
║   Testing: list_emails(accounts) → manage_email(send)        ║
╚══════════════════════════════════════════════════════════════╝
`);

  const results: TestResult[] = [];
  const prisma = createPrismaClient();

  // =============================================================================
  // TEST 1: Verify Tenant Data
  // =============================================================================
  console.log('\n📦 TEST 1: Verify Tenant Data\n');

  let user: any;
  let providers: any[] = [];

  try {
    const startTime = Date.now();

    // Get user from specific tenant
    user = await prisma.user.findFirst({
      where: { tenantId: TEST_TENANT_ID, isActive: true, deletedAt: null },
      include: { userPreferences: true },
    });

    if (!user) {
      throw new Error(`No active user found for tenant ${TEST_TENANT_ID}`);
    }

    // Get email providers (accounts)
    providers = await prisma.providerConfig.findMany({
      where: { tenantId: TEST_TENANT_ID, isActive: true },
      select: { id: true, email: true, providerType: true, displayName: true },
    });

    console.log(`   ✅ User: ${user.email} (tenant: ${user.tenantId})`);
    console.log(`   ✅ Email Accounts: ${providers.length}`);
    for (const p of providers) {
      console.log(`      📧 ${p.email} (${p.providerType}) - ID: ${p.id.substring(0, 8)}...`);
    }

    results.push({
      name: 'Verify Tenant Data',
      status: providers.length > 0 ? 'passed' : 'failed',
      duration: Date.now() - startTime,
      details: `Found ${providers.length} email accounts`,
    });

    if (providers.length === 0) {
      console.log('   ❌ No email accounts found! Cannot test email send.');
      await prisma.$disconnect();
      printSummary(results);
      return;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ ERROR: ${errorMsg}`);
    results.push({
      name: 'Verify Tenant Data',
      status: 'failed',
      duration: 0,
      error: errorMsg,
    });
    await prisma.$disconnect();
    printSummary(results);
    return;
  }

  // =============================================================================
  // TEST 2: ActionsAgent Email Send (with specific account)
  // =============================================================================
  console.log('\n📧 TEST 2: ActionsAgent Email Send with Specific Account\n');

  try {
    const startTime = Date.now();

    console.log('   🚀 Starting VoltAgent...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });

    const voltAgentService = app.get(VoltAgentService);
    const hitlService = app.get(HitlService);
    const conversationId = `email-send-test-${Date.now()}`;

    // Pick a sender account (preferably not gmail to test variety)
    const senderAccount = providers.find((p) => p.email.includes('hotmail')) || providers[0];
    const senderEmail = senderAccount.email;

    // Test message - Italian, specifying sender account
    const testMessage = `manda email a test.recipient@example.com da ${senderEmail} con oggetto "Test VoltAgent" e testo "Questo è un test automatico del sistema VoltAgent."`;

    console.log(`   📤 Sender: ${senderEmail}`);
    console.log(`   💬 Message: "${testMessage.substring(0, 80)}..."`);

    const result = await voltAgentService.chat(testMessage, {
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      conversationId,
      locale: 'it',
      skipCache: true,
    });

    const duration = Date.now() - startTime;

    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   🤖 Agent: ${result.agentUsed || 'unknown'}`);
    console.log(`   📝 Response: ${result.text?.substring(0, 200)}...`);

    // Check for HITL pending action
    const hasPendingAction = result.pendingActions && result.pendingActions.length > 0;
    console.log(`   🔐 HITL Actions: ${hasPendingAction ? result.pendingActions?.length : 0}`);

    if (hasPendingAction) {
      const action = result.pendingActions![0];
      console.log(`\n   📋 HITL Action Details:`);
      console.log(`      ID: ${action.id}`);
      console.log(`      Type: ${action.type}`);
      console.log(`      Summary: ${action.summary || 'N/A'}`);

      // Verify the action has correct providerId
      const actionDetails = await hitlService.getPendingAction(action.id);
      const params = actionDetails?.parameters as any;

      console.log(`\n   🔍 Action Parameters:`);
      console.log(`      providerId: ${params?.providerId || 'MISSING!'}`);
      console.log(`      to: ${JSON.stringify(params?.to) || 'MISSING!'}`);
      console.log(`      subject: ${params?.subject || 'MISSING!'}`);

      // Validate providerId matches sender account
      const providerIdMatch = params?.providerId === senderAccount.id;
      console.log(`\n   ${providerIdMatch ? '✅' : '❌'} ProviderId matches sender: ${providerIdMatch}`);

      if (!providerIdMatch) {
        console.log(`      Expected: ${senderAccount.id}`);
        console.log(`      Got: ${params?.providerId}`);
      }

      results.push({
        name: 'ActionsAgent Email Send',
        status: providerIdMatch ? 'passed' : 'failed',
        duration,
        details: providerIdMatch
          ? `HITL action created with correct providerId`
          : `ProviderId mismatch! Expected ${senderAccount.id}, got ${params?.providerId}`,
      });

      // Cleanup: Reject the action
      await hitlService.resolveAction(action.id, {
        userId: user.id,
        decision: 'REJECTED',
        reason: 'Test cleanup - rejected by validation script',
      });
      console.log(`   🧹 Action rejected for cleanup`);
    } else {
      // No HITL action = Agent didn't call manage_email = FAILURE
      console.log(`   ❌ No HITL action created! Agent may not have called manage_email.`);

      // Check if response mentions "non riuscito" or similar error
      const responseText = result.text?.toLowerCase() || '';
      const hasError =
        responseText.includes('non riuscito') ||
        responseText.includes('non trovato') ||
        responseText.includes('cannot') ||
        responseText.includes('error');

      results.push({
        name: 'ActionsAgent Email Send',
        status: 'failed',
        duration,
        error: hasError
          ? `Agent returned error: ${result.text?.substring(0, 100)}`
          : 'No HITL action created - agent may be generating text instead of calling tools',
      });
    }

    await app.close();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ ERROR: ${errorMsg}`);
    results.push({
      name: 'ActionsAgent Email Send',
      status: 'failed',
      duration: 0,
      error: errorMsg,
    });
  }

  // =============================================================================
  // TEST 3: ActionsAgent Email Send (auto-select single account)
  // =============================================================================
  if (providers.length === 1) {
    console.log('\n📧 TEST 3: ActionsAgent Auto-Select Single Account\n');

    try {
      const startTime = Date.now();
      const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
      const voltAgentService = app.get(VoltAgentService);
      const hitlService = app.get(HitlService);
      const conversationId = `email-send-auto-${Date.now()}`;

      // Message WITHOUT specifying sender (should auto-select the only account)
      const testMessage = `scrivi email a colleague@example.com con oggetto "Meeting reminder" dicendo "Non dimenticare la riunione di domani."`;

      console.log(`   💬 Message: "${testMessage.substring(0, 80)}..."`);
      console.log(`   📤 Expected auto-select: ${providers[0].email}`);

      const result = await voltAgentService.chat(testMessage, {
        tenantId: TEST_TENANT_ID,
        userId: user.id,
        conversationId,
        locale: 'it',
        skipCache: true,
      });

      const duration = Date.now() - startTime;
      const hasPendingAction = result.pendingActions && result.pendingActions.length > 0;

      if (hasPendingAction) {
        const action = result.pendingActions![0];
        const actionDetails = await hitlService.getPendingAction(action.id);
        const params = actionDetails?.parameters as any;

        const providerIdMatch = params?.providerId === providers[0].id;
        console.log(`   ${providerIdMatch ? '✅' : '❌'} Auto-selected correct account: ${providerIdMatch}`);

        results.push({
          name: 'ActionsAgent Auto-Select Account',
          status: providerIdMatch ? 'passed' : 'failed',
          duration,
          details: providerIdMatch ? 'Auto-selected the only available account' : 'Wrong account selected',
        });

        await hitlService.resolveAction(action.id, {
          userId: user.id,
          decision: 'REJECTED',
          reason: 'Test cleanup',
        });
      } else {
        results.push({
          name: 'ActionsAgent Auto-Select Account',
          status: 'failed',
          duration,
          error: 'No HITL action created',
        });
      }

      await app.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        name: 'ActionsAgent Auto-Select Account',
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }
  } else {
    console.log('\n⚠️  TEST 3: Skipped (multiple accounts - would require user selection)\n');
    results.push({
      name: 'ActionsAgent Auto-Select Account',
      status: 'skipped',
      duration: 0,
      details: 'Multiple accounts exist - auto-select only works with single account',
    });
  }

  await prisma.$disconnect();
  printSummary(results);
}

function printSummary(results: TestResult[]) {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const total = results.length - skipped;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              ACTIONS AGENT TEST RESULTS                      ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Tests: ${results.length}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}
   ⚠️  Skipped: ${skipped}

📈 Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%
`);

  console.log('─'.repeat(60));
  console.log('DETAILED RESULTS:');
  console.log('─'.repeat(60));

  for (const r of results) {
    const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⚠️';
    console.log(`\n${icon} ${r.name}`);
    console.log(`   Status: ${r.status.toUpperCase()}`);
    console.log(`   Duration: ${r.duration}ms`);
    if (r.details) console.log(`   Details: ${r.details}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  }

  console.log('\n' + '═'.repeat(60));

  if (failed > 0) {
    console.log(`
❌ TESTS FAILED!

Possible causes:
1. ActionsAgent not calling list_emails(mode: "accounts") first
2. ProviderId not being extracted from accounts list
3. manage_email not receiving correct providerId

Check:
- backend/src/modules/ai/voltagent/agents/actions.agent.ts (ACTIONS_TOOLS includes list_emails)
- backend/src/modules/ai/voltagent/prompts/actions.prompt.ts (MANDATORY_EMAIL_SEND_WORKFLOW)
`);
    process.exit(1);
  } else {
    console.log('✅ All tests passed! ActionsAgent email send workflow is working correctly.');
    process.exit(0);
  }
}

runActionsAgentEmailSendTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
