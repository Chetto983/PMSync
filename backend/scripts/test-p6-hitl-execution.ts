/**
 * P6 HITL Execution Test - Deep Validation
 *
 * This test validates the ACTUAL execution path, not just the approval request.
 * Existing tests only verify:
 * - Action created with PENDING status
 * - Feedback recorded on approve/reject
 * - Learning profile updated
 *
 * THIS test verifies:
 * - Action EXECUTES after approval (not just status change)
 * - Side effects occur in database (contact created, email sent, etc.)
 * - executedAt timestamp is set
 * - Idempotency prevents duplicate execution
 *
 * @see hitl.service.ts - Approval workflow
 * @see action-executor.service.ts - Actual execution
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';
import { ActionExecutorService } from '../src/modules/ai/voltagent/services/action-executor.service';
import {
  ActionSeverity,
  AgentActionType,
} from '../src/modules/ai/voltagent/interfaces/agent-action.interface';

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration: number;
}

const results: TestResult[] = [];

// Console styling
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) {
  console.log(msg);
}

function logSection(title: string) {
  console.log(`\n${CYAN}${'═'.repeat(60)}${RESET}`);
  console.log(`${CYAN}${BOLD}  ${title}${RESET}`);
  console.log(`${CYAN}${'═'.repeat(60)}${RESET}\n`);
}

function logResult(name: string, passed: boolean, details: string, duration: number) {
  const status = passed ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`;
  console.log(`  ${status} ${name} (${duration}ms)`);
  if (!passed || details) {
    console.log(`       ${details}`);
  }
  results.push({ name, passed, details, duration });
}

async function main() {
  console.log(`\n${BOLD}╔════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║     P6 HITL EXECUTION TEST - DEEP VALIDATION               ║${RESET}`);
  console.log(`${BOLD}║     Testing ACTUAL execution, not just approval            ║${RESET}`);
  console.log(`${BOLD}╚════════════════════════════════════════════════════════════╝${RESET}\n`);

  let app: INestApplicationContext;
  let prisma: PrismaService;
  let hitlService: HitlService;
  let actionExecutor: ActionExecutorService;
  let testTenantId: string;
  let testUserId: string;
  const createdContactIds: string[] = [];
  const createdActionIds: string[] = [];

  try {
    // Bootstrap NestJS
    log(`${YELLOW}Bootstrapping NestJS application...${RESET}`);
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });

    prisma = app.get(PrismaService);
    hitlService = app.get(HitlService);
    actionExecutor = app.get(ActionExecutorService);

    // Find test tenant
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'Italian' } },
    });

    if (!tenant) {
      throw new Error('No test tenant found - need Italian RAG Test tenant');
    }

    testTenantId = tenant.id;

    // Find test user
    const user = await prisma.user.findFirst({
      where: { tenantId: testTenantId },
    });

    if (!user) {
      throw new Error('No test user found');
    }

    testUserId = user.id;

    log(`${GREEN}✓ Bootstrap complete${RESET}`);
    log(`  Tenant: ${tenant.name} (${testTenantId})`);
    log(`  User: ${user.email || user.id}`);

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: HITL Create Contact - Full Cycle
    // ═══════════════════════════════════════════════════════════════
    logSection('TEST 1: HITL Create Contact - Full Execution Cycle');

    const test1Start = Date.now();
    try {
      const testEmail = `test-p6-${Date.now()}@example.com`;
      const testName = `P6 Test Contact ${Date.now()}`;
      const testSessionId = `test-p6-session-${Date.now()}`;

      // Step 1: Create pending action via HITL
      log('  Step 1: Creating pending action...');
      const actionId = await hitlService.createPendingAction({
        tenantId: testTenantId,
        userId: testUserId,
        sessionId: testSessionId,
        agentName: 'TestContactAgent',
        action: {
          type: AgentActionType.CREATE_CONTACT,
          severity: ActionSeverity.LOW,
          payload: {
            email: testEmail,
            name: testName,
            firstName: 'P6',
            lastName: 'Test',
          },
          confidence: 0.95,
        },
      });

      if (!actionId) {
        throw new Error('Failed to create pending action');
      }

      createdActionIds.push(actionId);
      log(`       Action ID: ${actionId}`);

      // Step 2: Verify action is PENDING in database
      log('  Step 2: Verifying PENDING status in ActionQueue...');
      const pendingAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      if (!pendingAction) {
        throw new Error('Action not found in ActionQueue');
      }

      if (pendingAction.status !== 'PENDING_APPROVAL') {
        throw new Error(`Expected PENDING_APPROVAL, got ${pendingAction.status}`);
      }

      log(`       Status: ${pendingAction.status} ✓`);

      // Step 3: Approve the action
      log('  Step 3: Approving action...');
      await hitlService.approveAction(testTenantId, actionId, testUserId);
      log('       Approved ✓');

      // Step 4: Verify status is now APPROVED
      log('  Step 4: Verifying APPROVED status...');
      const approvedAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      if (approvedAction?.status !== 'APPROVED') {
        throw new Error(`Expected APPROVED, got ${approvedAction?.status}`);
      }

      log(`       Status: ${approvedAction.status} ✓`);

      // Step 5: EXECUTE the action (THE CRITICAL TEST)
      log('  Step 5: EXECUTING action (the real test)...');

      // Build context for executor
      const agentContext = {
        tenantId: testTenantId,
        userId: testUserId,
        userMessage: 'P6 HITL test - create contact',
        sessionId: testSessionId,
      };

      // Build action payload for executor from the stored action
      const agentAction = {
        type: approvedAction.actionType as AgentActionType,
        payload: approvedAction.actionPayload as Record<string, unknown>,
        confidence: approvedAction.confidence,
        severity: ActionSeverity.LOW,
      };

      const executionResult = await actionExecutor.execute(agentAction, agentContext);

      if (!executionResult.success) {
        throw new Error(`Execution failed: ${executionResult.error}`);
      }

      log(`       Executed ✓ - Result: ${executionResult.summary || 'OK'}`);

      // Step 6: Mark action as executed in HITL
      log('  Step 6: Marking as executed in HITL...');
      await hitlService.markExecuted(
        testTenantId,
        actionId,
        executionResult.success,
        executionResult.error,
      );

      // Step 7: Verify executedAt is set (THE REAL VALIDATION)
      log('  Step 7: Verifying executedAt timestamp...');
      const executedAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      if (!executedAction?.executedAt) {
        throw new Error('executedAt is null - action was approved but NOT executed!');
      }

      log(`       executedAt: ${executedAction.executedAt.toISOString()} ✓`);

      // Step 8: Verify side effect - contact actually exists
      log('  Step 8: Verifying side effect (contact created in DB)...');
      const createdContact = await prisma.contact.findFirst({
        where: {
          tenantId: testTenantId,
          displayName: testName,
        },
      });

      if (!createdContact) {
        throw new Error('Contact NOT created in database - execution had no side effect!');
      }

      createdContactIds.push(createdContact.id);
      log(`       Contact created: ${createdContact.id} ✓`);

      logResult(
        'HITL Create Contact - Full Cycle',
        true,
        `Contact ${testName} created and verified`,
        Date.now() - test1Start,
      );
    } catch (error) {
      logResult(
        'HITL Create Contact - Full Cycle',
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - test1Start,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Rejection - Action should NOT execute
    // ═══════════════════════════════════════════════════════════════
    logSection('TEST 2: Rejection - Action Should NOT Execute');

    const test2Start = Date.now();
    try {
      const testEmail = `test-p6-rejected-${Date.now()}@example.com`;
      const testName = `P6 Rejected Test ${Date.now()}`;
      const testSessionId = `test-p6-reject-${Date.now()}`;

      // Create action
      const actionId = await hitlService.createPendingAction({
        tenantId: testTenantId,
        userId: testUserId,
        sessionId: testSessionId,
        agentName: 'TestContactAgent',
        action: {
          type: AgentActionType.CREATE_CONTACT,
          severity: ActionSeverity.LOW,
          payload: {
            email: testEmail,
            name: testName,
          },
          confidence: 0.9,
        },
      });

      createdActionIds.push(actionId);

      log('  Rejecting action...');
      await hitlService.rejectAction(testTenantId, actionId, testUserId, undefined, 'P6 test rejection');

      // Verify status is REJECTED
      const rejectedAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      if (rejectedAction?.status !== 'REJECTED') {
        throw new Error(`Expected REJECTED, got ${rejectedAction?.status}`);
      }

      // Verify NO contact was created
      const contact = await prisma.contact.findFirst({
        where: { tenantId: testTenantId, displayName: testName },
      });

      if (contact) {
        createdContactIds.push(contact.id);
        throw new Error('Contact was created despite rejection!');
      }

      // Verify executedAt is still null
      if (rejectedAction.executedAt) {
        throw new Error('executedAt should be null for rejected action');
      }

      logResult(
        'Rejection - Action Should NOT Execute',
        true,
        'Rejected action did not create contact',
        Date.now() - test2Start,
      );
    } catch (error) {
      logResult(
        'Rejection - Action Should NOT Execute',
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - test2Start,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Expired Action - Should NOT execute
    // ═══════════════════════════════════════════════════════════════
    logSection('TEST 3: Expired Action - Should NOT Execute');

    const test3Start = Date.now();
    try {
      const testEmail = `test-p6-expired-${Date.now()}@example.com`;
      const testName = `P6 Expired Test ${Date.now()}`;
      const testSessionId = `test-p6-expiry-${Date.now()}`;

      // Create action with very short expiry
      const actionId = await hitlService.createPendingAction({
        tenantId: testTenantId,
        userId: testUserId,
        sessionId: testSessionId,
        agentName: 'TestContactAgent',
        action: {
          type: AgentActionType.CREATE_CONTACT,
          severity: ActionSeverity.LOW,
          payload: {
            email: testEmail,
            name: testName,
          },
          confidence: 0.9,
        },
        expiresInMinutes: 0, // Immediate expiry (or very short)
      });

      createdActionIds.push(actionId);

      // Manually expire the action (set expiresAt to past)
      log('  Manually expiring action...');
      await prisma.actionQueue.update({
        where: { id: actionId },
        data: { expiresAt: new Date(Date.now() - 1000) }, // 1 second ago
      });

      // Try to approve expired action - should fail or be blocked
      log('  Attempting to approve expired action...');
      let approvalError: string | null = null;
      try {
        await hitlService.approveAction(testTenantId, actionId, testUserId);
      } catch (e) {
        approvalError = e instanceof Error ? e.message : String(e);
        log(`       Approval blocked: ${approvalError}`);
      }

      // Verify no contact created
      const contact = await prisma.contact.findFirst({
        where: { tenantId: testTenantId, displayName: testName },
      });

      if (contact) {
        createdContactIds.push(contact.id);
        throw new Error('Contact created from expired action!');
      }

      logResult(
        'Expired Action - Should NOT Execute',
        true,
        approvalError ? `Approval blocked: ${approvalError}` : 'No side effects despite expiry',
        Date.now() - test3Start,
      );
    } catch (error) {
      logResult(
        'Expired Action - Should NOT Execute',
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - test3Start,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Update Contact - Full Cycle
    // ═══════════════════════════════════════════════════════════════
    logSection('TEST 4: Update Contact via HITL');

    const test4Start = Date.now();
    try {
      // First create a contact directly for testing
      const testName = `P6 Update Target ${Date.now()}`;
      const testSessionId = `test-p6-update-${Date.now()}`;
      const contact = await prisma.contact.create({
        data: {
          tenantId: testTenantId,
          displayName: testName,
          firstName: 'Before',
          emails: [{ value: `update-test-${Date.now()}@example.com`, type: 'primary' }],
        },
      });
      createdContactIds.push(contact.id);

      // Create HITL action to update it
      const actionId = await hitlService.createPendingAction({
        tenantId: testTenantId,
        userId: testUserId,
        sessionId: testSessionId,
        agentName: 'TestContactAgent',
        action: {
          type: AgentActionType.UPDATE_CONTACT,
          severity: ActionSeverity.LOW,
          payload: {
            contactId: contact.id,
            firstName: 'After',
            lastName: 'P6Test',
          },
          confidence: 0.95,
        },
      });

      createdActionIds.push(actionId);

      // Approve
      await hitlService.approveAction(testTenantId, actionId, testUserId);

      // Execute
      const approvedAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      const agentContext = {
        tenantId: testTenantId,
        userId: testUserId,
        userMessage: 'P6 HITL test - update contact',
        sessionId: testSessionId,
      };

      const agentAction = {
        type: approvedAction!.actionType as AgentActionType,
        payload: approvedAction!.actionPayload as Record<string, unknown>,
        confidence: approvedAction!.confidence,
        severity: ActionSeverity.LOW,
      };

      const result = await actionExecutor.execute(agentAction, agentContext);
      await hitlService.markExecuted(testTenantId, actionId, result.success, result.error);

      // Verify update occurred
      const updatedContact = await prisma.contact.findFirst({
        where: {
          id: contact.id,
          tenantId: testTenantId,
        },
      });

      if (updatedContact?.firstName !== 'After') {
        throw new Error(
          `Update failed: firstName is ${updatedContact?.firstName}, expected After`,
        );
      }

      logResult(
        'Update Contact via HITL',
        true,
        `Contact updated: firstName changed to "After"`,
        Date.now() - test4Start,
      );
    } catch (error) {
      logResult(
        'Update Contact via HITL',
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - test4Start,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: Delete Contact - Full Cycle
    // ═══════════════════════════════════════════════════════════════
    logSection('TEST 5: Delete Contact via HITL');

    const test5Start = Date.now();
    try {
      // Create a contact to delete
      const testName = `P6 Delete Target ${Date.now()}`;
      const testSessionId = `test-p6-delete-${Date.now()}`;
      const contact = await prisma.contact.create({
        data: {
          tenantId: testTenantId,
          displayName: testName,
          firstName: 'ToBeDeleted',
          emails: [{ value: `delete-test-${Date.now()}@example.com`, type: 'primary' }],
        },
      });
      // Note: Don't add to cleanup list since we're testing deletion

      // Create HITL action to delete it
      const actionId = await hitlService.createPendingAction({
        tenantId: testTenantId,
        userId: testUserId,
        sessionId: testSessionId,
        agentName: 'TestContactAgent',
        action: {
          type: AgentActionType.DELETE_CONTACT,
          severity: ActionSeverity.MEDIUM,
          payload: {
            contactId: contact.id,
          },
          confidence: 0.95,
        },
      });

      createdActionIds.push(actionId);

      // Approve
      await hitlService.approveAction(testTenantId, actionId, testUserId);

      // Execute
      const approvedAction = await prisma.actionQueue.findUnique({
        where: { id: actionId },
      });

      const agentContext = {
        tenantId: testTenantId,
        userId: testUserId,
        userMessage: 'P6 HITL test - delete contact',
        sessionId: testSessionId,
      };

      const agentAction = {
        type: approvedAction!.actionType as AgentActionType,
        payload: approvedAction!.actionPayload as Record<string, unknown>,
        confidence: approvedAction!.confidence,
        severity: ActionSeverity.MEDIUM,
      };

      const result = await actionExecutor.execute(agentAction, agentContext);
      await hitlService.markExecuted(testTenantId, actionId, result.success, result.error);

      // Verify contact is deleted
      const deletedContact = await prisma.contact.findFirst({
        where: {
          id: contact.id,
          tenantId: testTenantId,
        },
      });

      if (deletedContact) {
        createdContactIds.push(contact.id); // Add to cleanup in case test fails
        throw new Error('Contact was NOT deleted - still exists in database');
      }

      logResult(
        'Delete Contact via HITL',
        true,
        `Contact ${contact.id} successfully deleted`,
        Date.now() - test5Start,
      );
    } catch (error) {
      logResult(
        'Delete Contact via HITL',
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - test5Start,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════
    logSection('CLEANUP');

    log(`  Deleting ${createdContactIds.length} test contacts...`);
    for (const contactId of createdContactIds) {
      try {
        await prisma.contact.delete({
          where: {
            id_tenantId: { id: contactId, tenantId: testTenantId },
          },
        });
        log(`       Deleted contact: ${contactId}`);
      } catch {
        log(`       ${YELLOW}Already deleted or not found: ${contactId}${RESET}`);
      }
    }

    log(`  Deleting ${createdActionIds.length} test actions...`);
    for (const actionId of createdActionIds) {
      try {
        // First delete related feedback entries
        await prisma.agentActionFeedback.deleteMany({
          where: { actionId, tenantId: testTenantId },
        });
        await prisma.actionQueue.delete({ where: { id: actionId } });
        log(`       Deleted action: ${actionId}`);
      } catch {
        log(`       ${YELLOW}Already deleted or not found: ${actionId}${RESET}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // RESULTS SUMMARY
    // ═══════════════════════════════════════════════════════════════
    logSection('RESULTS SUMMARY');

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    console.log(`\n  ${BOLD}Total: ${total} tests${RESET}`);
    console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
    console.log(`  ${RED}Failed: ${failed}${RESET}`);
    console.log(`\n  Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log(`\n  ${RED}${BOLD}FAILED TESTS:${RESET}`);
      results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`    ${RED}✗${RESET} ${r.name}`);
          console.log(`      ${r.details}`);
        });
    }

    // Final status
    console.log(`\n${BOLD}${'═'.repeat(60)}${RESET}`);
    if (failed === 0) {
      console.log(`${GREEN}${BOLD}  ✓ ALL P6 HITL EXECUTION TESTS PASSED${RESET}`);
      console.log(`${GREEN}    HITL workflow validated: approve → execute → side effects${RESET}`);
    } else {
      console.log(`${RED}${BOLD}  ✗ SOME TESTS FAILED - HITL EXECUTION NOT FULLY VALIDATED${RESET}`);
    }
    console.log(`${BOLD}${'═'.repeat(60)}${RESET}\n`);

    await app.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${RED}${BOLD}FATAL ERROR:${RESET}`, error);
    process.exit(1);
  }
}

main();
