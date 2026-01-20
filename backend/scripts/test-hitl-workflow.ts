/**
 * HITL (Human-in-the-Loop) Workflow Test
 *
 * Tests the complete HITL workflow:
 * 1. User sends chat message that triggers a WRITE action
 * 2. Action is created with status=PENDING
 * 3. User approves/rejects action via API
 * 4. Action is executed (or rejected)
 * 5. Status is updated accordingly
 *
 * Run: npx ts-node backend/scripts/test-hitl-workflow.ts
 */

import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication } from '@nestjs/common';

const TEST_TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

async function runHitlTests(): Promise<void> {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}           HITL WORKFLOW VALIDATION TEST                         ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const prisma = new PrismaClient();
  let app: INestApplication | null = null;
  const results: TestResult[] = [];

  try {
    // Initialize NestJS app for DI
    console.log(`${BLUE}[INIT]${RESET} Starting NestJS application...`);
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();

    // Get services via DI
    const hitlService = app.get('HitlService');
    const voltAgentOrchestratorService = app.get('VoltAgentOrchestratorService');

    // Find test user
    const user = await prisma.user.findFirst({
      where: { tenantId: TEST_TENANT_ID },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new Error(`No user found for tenant ${TEST_TENANT_ID}`);
    }

    console.log(`${GREEN}[OK]${RESET} Found user: ${user.email} (${user.id})\n`);

    // ========================================================================
    // TEST 1: List Pending Actions (initial state)
    // ========================================================================
    console.log(`${BOLD}[TEST 1]${RESET} List pending actions (initial state)...`);
    const initialActions = await hitlService.getPendingActions(TEST_TENANT_ID, user.id);
    console.log(`  Found ${initialActions.length} pending actions`);
    results.push({
      name: 'List pending actions',
      passed: true,
      message: `Found ${initialActions.length} pending actions`,
    });

    // ========================================================================
    // TEST 2: Create test action via chat (SEND_EMAIL)
    // ========================================================================
    console.log(`\n${BOLD}[TEST 2]${RESET} Create HITL action via chat...`);

    const chatPrompt = 'manda email a test@example.com oggetto test hitl testo questo è un test';
    console.log(`  Sending: "${chatPrompt}"`);

    const chatResult = await voltAgentOrchestratorService.processRequest({
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      userMessage: chatPrompt,
      locale: 'it',
    });

    console.log(`  Response: ${chatResult.text?.substring(0, 100)}...`);

    // Check if HITL action was created
    const afterChatActions = await hitlService.getPendingActions(TEST_TENANT_ID, user.id);
    const newAction = afterChatActions.find(
      (a: { actionType: string }) => a.actionType === 'SEND_EMAIL'
    );

    if (newAction) {
      console.log(`  ${GREEN}[OK]${RESET} HITL action created: ${newAction.id}`);
      console.log(`       Type: ${newAction.actionType}`);
      console.log(`       Severity: ${newAction.severity}`);
      console.log(`       Summary: ${newAction.summary}`);
      results.push({
        name: 'Create HITL action via chat',
        passed: true,
        message: `Action ${newAction.id} created`,
        details: { actionType: newAction.actionType, severity: newAction.severity },
      });
    } else {
      console.log(`  ${YELLOW}[WARN]${RESET} No new SEND_EMAIL action found (might already exist or error)`);
      results.push({
        name: 'Create HITL action via chat',
        passed: false,
        message: 'No SEND_EMAIL action created',
      });
    }

    // ========================================================================
    // TEST 3: Get action details
    // ========================================================================
    if (newAction) {
      console.log(`\n${BOLD}[TEST 3]${RESET} Get action details...`);
      const actionDetails = await hitlService.getAction(TEST_TENANT_ID, newAction.executionId || newAction.id);

      if (actionDetails) {
        console.log(`  ${GREEN}[OK]${RESET} Action details retrieved`);
        console.log(`       Payload: ${JSON.stringify(actionDetails.payload).substring(0, 100)}...`);
        results.push({
          name: 'Get action details',
          passed: true,
          message: 'Action details retrieved',
        });
      } else {
        console.log(`  ${RED}[FAIL]${RESET} Could not get action details`);
        results.push({
          name: 'Get action details',
          passed: false,
          message: 'Could not get action details',
        });
      }

      // ========================================================================
      // TEST 4: Reject action
      // ========================================================================
      console.log(`\n${BOLD}[TEST 4]${RESET} Reject action...`);
      const executionId = newAction.executionId || newAction.id;
      const rejectResult = await hitlService.rejectAction(
        TEST_TENANT_ID,
        executionId,
        user.id,
        undefined,
        'Test rejection - validating HITL workflow'
      );

      if (rejectResult) {
        console.log(`  ${GREEN}[OK]${RESET} Action rejected successfully`);
        results.push({
          name: 'Reject action',
          passed: true,
          message: 'Action rejected',
        });
      } else {
        console.log(`  ${RED}[FAIL]${RESET} Reject returned false`);
        results.push({
          name: 'Reject action',
          passed: false,
          message: 'Reject returned false',
        });
      }

      // Verify action is no longer pending
      const afterRejectActions = await hitlService.getPendingActions(TEST_TENANT_ID, user.id);
      const stillPending = afterRejectActions.some(
        (a: { id: string }) => a.id === newAction.id
      );

      if (!stillPending) {
        console.log(`  ${GREEN}[OK]${RESET} Action removed from pending list`);
        results.push({
          name: 'Action removed after reject',
          passed: true,
          message: 'Action no longer pending',
        });
      } else {
        console.log(`  ${RED}[FAIL]${RESET} Action still in pending list`);
        results.push({
          name: 'Action removed after reject',
          passed: false,
          message: 'Action still pending',
        });
      }
    }

    // ========================================================================
    // TEST 5: Create another action and APPROVE it
    // ========================================================================
    console.log(`\n${BOLD}[TEST 5]${RESET} Test approve workflow...`);

    // Create a folder action (safer than email)
    const folderPrompt = 'crea cartella TestHITL123';
    console.log(`  Sending: "${folderPrompt}"`);

    const folderResult = await voltAgentOrchestratorService.processRequest({
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      userMessage: folderPrompt,
      locale: 'it',
    });

    console.log(`  Response: ${folderResult.text?.substring(0, 100)}...`);

    const folderActions = await hitlService.getPendingActions(TEST_TENANT_ID, user.id);
    const folderAction = folderActions.find(
      (a: { actionType: string }) => a.actionType === 'CREATE_FOLDER'
    );

    if (folderAction) {
      console.log(`  ${GREEN}[OK]${RESET} CREATE_FOLDER action created: ${folderAction.id}`);

      // TEST 6: Approve action
      console.log(`\n${BOLD}[TEST 6]${RESET} Approve action...`);
      const approveResult = await hitlService.approveAction(
        TEST_TENANT_ID,
        folderAction.executionId || folderAction.id,
        user.id
      );

      if (approveResult) {
        console.log(`  ${GREEN}[OK]${RESET} Action approved`);
        console.log(`       Approval triggered execution pipeline`);
        results.push({
          name: 'Approve action',
          passed: true,
          message: 'Action approved and execution triggered',
        });
      } else {
        console.log(`  ${YELLOW}[WARN]${RESET} Approve returned false (might be expected if execution failed)`);
        results.push({
          name: 'Approve action',
          passed: false,
          message: 'Approve returned false',
        });
      }
    } else {
      console.log(`  ${YELLOW}[INFO]${RESET} No CREATE_FOLDER action created (model might need provider)`);
      results.push({
        name: 'Create folder action',
        passed: false,
        message: 'No folder action created - might need providerId',
      });
    }

    // ========================================================================
    // TEST 7: Test action counts endpoint
    // ========================================================================
    console.log(`\n${BOLD}[TEST 7]${RESET} Get action counts...`);

    // Get counts from database directly since service might not expose this
    const counts = await prisma.hitlAction.groupBy({
      by: ['status'],
      where: { tenantId: TEST_TENANT_ID },
      _count: { id: true },
    });

    const countMap: Record<string, number> = {};
    counts.forEach((c) => {
      countMap[c.status] = c._count.id;
    });

    console.log(`  PENDING: ${countMap['PENDING'] || 0}`);
    console.log(`  APPROVED: ${countMap['APPROVED'] || 0}`);
    console.log(`  REJECTED: ${countMap['REJECTED'] || 0}`);
    console.log(`  EXECUTED: ${countMap['EXECUTED'] || 0}`);
    console.log(`  FAILED: ${countMap['FAILED'] || 0}`);

    results.push({
      name: 'Action counts',
      passed: true,
      message: `Total actions: ${counts.reduce((sum, c) => sum + c._count.id, 0)}`,
      details: countMap,
    });

    // ========================================================================
    // TEST 8: Cleanup - reject any remaining test actions
    // ========================================================================
    console.log(`\n${BOLD}[TEST 8]${RESET} Cleanup remaining test actions...`);
    const finalActions = await hitlService.getPendingActions(TEST_TENANT_ID, user.id);
    let cleanedCount = 0;

    for (const action of finalActions) {
      const execId = action.executionId || action.id;
      const summary = (action.summary || '').toLowerCase();

      // Only clean up test actions
      if (summary.includes('test') || summary.includes('testhitl')) {
        await hitlService.rejectAction(
          TEST_TENANT_ID,
          execId,
          user.id,
          undefined,
          'Test cleanup'
        );
        cleanedCount++;
      }
    }

    console.log(`  ${GREEN}[OK]${RESET} Cleaned up ${cleanedCount} test actions`);
    results.push({
      name: 'Cleanup',
      passed: true,
      message: `Cleaned ${cleanedCount} test actions`,
    });

  } catch (error) {
    console.error(`\n${RED}[ERROR]${RESET}`, error);
    results.push({
      name: 'Test execution',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await prisma.$disconnect();
    if (app) await app.close();
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}                       TEST SUMMARY                             ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r, i) => {
    const status = r.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  ${i + 1}. [${status}] ${r.name}: ${r.message}`);
  });

  console.log(`\n${BOLD}Results: ${passed}/${results.length} passed${RESET}`);

  if (failed > 0) {
    console.log(`${RED}${failed} test(s) failed${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}All tests passed!${RESET}`);
    process.exit(0);
  }
}

// Run
runHitlTests().catch(console.error);
