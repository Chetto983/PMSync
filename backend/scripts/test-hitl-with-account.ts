/**
 * HITL test with specific account - validates prompt improvements
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActionStatus } from '@prisma/client';

const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

async function main() {
  console.log('\n===== HITL TEST WITH SPECIFIC ACCOUNT =====\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgent = app.get(VoltAgentService);
  const prisma = app.get(PrismaService);

  const sessionId = `hitl-test-${Date.now()}`;

  // Count pending actions BEFORE
  const beforeCount = await prisma.actionQueue.count({
    where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
  });
  console.log(`Pending actions BEFORE: ${beforeCount}`);

  // Test messages with specific accounts
  const tests = [
    {
      name: 'Email with specific account',
      message: 'Send email from chetto983@hotmail.it to test@example.com with subject "Test" and body "Hello"',
      expectHitl: true,
    },
    {
      name: 'Create contact',
      message: 'Create a new contact named "Test User" with email testuser@example.com',
      expectHitl: true,
    },
    {
      name: 'Search contacts (no HITL expected)',
      message: 'Search for contact named Mario',
      expectHitl: false,
    },
  ];

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`Message: ${test.message}`);

    const countBefore = await prisma.actionQueue.count({
      where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
    });

    try {
      const result = await voltAgent.chat(test.message, {
        tenantId: TENANT_ID,
        userId: 'test-user',
        conversationId: sessionId,
        locale: 'en',
      });

      // ChatResult has text property directly
      const response = result.text || '';
      console.log(`Response: ${response.substring(0, 200)}...`);
      console.log(`Requires approval: ${result.requiresApproval}`);

      const countAfter = await prisma.actionQueue.count({
        where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
      });
      const actionsCreated = countAfter - countBefore;
      console.log(`Actions created: ${actionsCreated}`);

      if (test.expectHitl && actionsCreated > 0) {
        console.log('✅ PASS: HITL action created as expected');
      } else if (!test.expectHitl && actionsCreated === 0) {
        console.log('✅ PASS: No HITL action (correct for read operation)');
      } else if (test.expectHitl && actionsCreated === 0) {
        console.log('⚠️ WARN: Expected HITL but none created (may have asked clarifying question)');
      } else {
        console.log('❌ FAIL: Unexpected result');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ ERROR: ${message}`);
    }
  }

  // Final count
  const afterCount = await prisma.actionQueue.count({
    where: { tenantId: TENANT_ID, status: ActionStatus.PENDING_APPROVAL },
  });
  console.log(`\n===== SUMMARY =====`);
  console.log(`Total pending actions: ${beforeCount} → ${afterCount} (${afterCount - beforeCount} new)`);

  await app.close();
  process.exit(0);
}

main().catch(console.error);
