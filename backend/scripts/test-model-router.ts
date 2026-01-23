/**
 * Quick diagnostic to test model router intent classification.
 * Tests if "send email" messages are correctly routed to ActionsAgent.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ModelRouterService } from '../src/modules/ai/voltagent/services/model-router.service';
import { ChatRequestProcessorService } from '../src/modules/ai/voltagent/services/chat-request-processor.service';

const TEST_MESSAGES = [
  // WRITE_OPS - should route to Actions
  'Send an email to test@example.com with subject "Test" and body "Hello"',
  'Reply to the email from John',
  'Forward this email to manager@company.com',
  'Delete the spam email',
  'Create a new contact for Jane Doe',
  'Schedule a meeting for tomorrow at 2pm',

  // READ_OPS - should route to Intelligence
  'Search for emails from John',
  'Show my unread emails',
  'How many emails do I have today?',
  'Find contacts at Acme Corp',
  'List my calendar events for next week',

  // SIMPLE - should stay with Supervisor
  'Hello',
  'Thanks!',
  'What is the weather like?',
];

async function main() {
  console.log('\n===== MODEL ROUTER DIAGNOSTIC =====\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  // Test ModelRouterService directly
  const modelRouter = app.get(ModelRouterService, { strict: false });
  const chatProcessor = app.get(ChatRequestProcessorService, { strict: false });

  console.log('Service injection status:');
  console.log(`  ModelRouterService: ${modelRouter ? '✓ OK' : '✗ NULL'}`);
  console.log(`  ChatRequestProcessorService: ${chatProcessor ? '✓ OK' : '✗ NULL'}`);
  console.log();

  if (!modelRouter) {
    console.log('ERROR: ModelRouterService not available!');
    await app.close();
    return;
  }

  console.log('Testing intent classification:\n');
  console.log('Message'.padEnd(60) + 'Intent'.padEnd(15) + 'Agent');
  console.log('-'.repeat(90));

  for (const message of TEST_MESSAGES) {
    const result = modelRouter.routeMessage(message);
    const intent = result.suggestedAgent === 'Actions' ? 'WRITE_OPS' :
                   result.suggestedAgent === 'Intelligence' ? 'READ_OPS' : 'SIMPLE/OTHER';
    const truncated = message.length > 55 ? message.substring(0, 55) + '...' : message;

    // Mark expected vs actual
    const isWriteMsg = /^(send|reply|forward|delete|create|schedule)/i.test(message);
    const isReadMsg = /^(search|show|how many|find|list)/i.test(message);
    const isSimpleMsg = /^(hello|thanks|what is)/i.test(message);

    let expected = 'Supervisor';
    if (isWriteMsg) expected = 'Actions';
    if (isReadMsg) expected = 'Intelligence';

    const match = result.suggestedAgent === expected ? '✓' : '✗';

    console.log(`${match} ${truncated.padEnd(57)} ${intent.padEnd(15)} ${result.suggestedAgent}`);
  }

  console.log('\n===== ROUTING SUMMARY =====\n');

  // Test the critical "send email" message specifically
  const criticalTest = 'Send an email to test@example.com with subject "Test" and body "Hello"';
  const criticalResult = modelRouter.routeMessage(criticalTest);

  console.log(`Critical test: "${criticalTest.substring(0, 50)}..."`);
  console.log(`  suggestedAgent: ${criticalResult.suggestedAgent}`);
  console.log(`  complexity: ${criticalResult.complexity}`);
  console.log(`  recommendedModel: ${criticalResult.recommendedModel}`);
  console.log(`  confidence: ${criticalResult.confidence}`);
  console.log();

  if (criticalResult.suggestedAgent === 'Actions') {
    console.log('✓ PASS: "Send email" correctly routes to ActionsAgent (direct routing enabled)');
    console.log('  → ActionsAgent will be TOP-LEVEL agent');
    console.log('  → onToolEnd hooks WILL fire for ActionsAgent tools');
    console.log('  → HITL actions SHOULD be captured');
  } else {
    console.log('✗ FAIL: "Send email" routes to ' + criticalResult.suggestedAgent);
    console.log('  → Supervisor will delegate to ActionsAgent');
    console.log('  → Sub-agent hooks do NOT fire');
    console.log('  → HITL actions will NOT be captured');
    console.log();
    console.log('Fix needed: Ensure WRITE_OPS patterns match before READ_OPS');
  }

  await app.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
