/**
 * CYNICAL DEBUGGER: Diagnose PII Service Injection
 *
 * PURPOSE: Find out why PiiDetectionService is null in ChatRequestProcessorService
 * despite being declared in providers.
 *
 * RUN: npx ts-node --transpile-only backend/scripts/diagnose-pii-injection.ts
 */

// Force load dotenv first to prevent validation errors
import * as dotenv from 'dotenv';
dotenv.config({ path: 'd:/MailAgent/backend/.env' });

// Override missing env vars for testing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-diagnostics-only';
process.env.GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || 'test-gmail-id';
process.env.GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'test-gmail-secret';
process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'test-ms-id';
process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test-ms-secret';
process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'test-mistral-key';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PiiDetectionService } from '../src/modules/ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../src/modules/ai/guards/pii-resolution.service';
import { PromptGuardService } from '../src/modules/ai/guards/prompt-guard-sentinel.service';
import { ChatRequestProcessorService } from '../src/modules/ai/voltagent/services/chat-request-processor.service';

async function diagnose() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           CYNICAL DEBUGGER: PII SERVICE INJECTION DIAGNOSTIC                ║');
  console.log('║                    "Why is PiiDetectionService null?"                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 1: Direct service resolution from container');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Test 1: Can we get the services directly?
  const services = [
    { name: 'PiiDetectionService', type: PiiDetectionService },
    { name: 'PiiResolutionService', type: PiiResolutionService },
    { name: 'PromptGuardService', type: PromptGuardService },
    { name: 'ChatRequestProcessorService', type: ChatRequestProcessorService },
  ];

  for (const svc of services) {
    try {
      const instance = app.get(svc.type);
      console.log(`✅ ${svc.name}: RESOLVED (instance exists)`);
    } catch (e: any) {
      console.log(`❌ ${svc.name}: FAILED - ${e.message}`);
    }
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 2: ChatRequestProcessorService internal dependency state');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Test 2: Check ChatRequestProcessorService internal state
  const processor = app.get(ChatRequestProcessorService);

  // Access private properties using bracket notation
  const deps = {
    piiDetectionService: (processor as any)['piiDetectionService'],
    piiResolutionService: (processor as any)['piiResolutionService'],
    promptGuardService: (processor as any)['promptGuardService'],
    rateLimiterService: (processor as any)['rateLimiterService'],
    taskClassifier: (processor as any)['taskClassifier'],
  };

  console.log('Internal dependency state:');
  for (const [name, value] of Object.entries(deps)) {
    const status = value === null ? '❌ NULL' : value === undefined ? '❌ UNDEFINED' : '✅ INJECTED';
    console.log(`  ${name}: ${status}`);
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 3: Direct PII detection test (bypass DI)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Test 3: Direct PII detection
  const piiService = app.get(PiiDetectionService);
  const testText = 'Contact secret.test@example.com at +1-555-123-4567';

  console.log(`Input: "${testText}"`);
  const result = piiService.detect(testText);
  console.log(`hasPii: ${result.hasPii}`);
  console.log(`detectedTypes: ${result.detectedTypes.join(', ')}`);
  console.log(`piiCount: ${result.piiCount}`);
  console.log(`redactedText: ${result.redactedText}`);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('TEST 4: ChatRequestProcessor.processAndStorePii (THE PROBLEM?)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Test 4: Process through ChatRequestProcessor
  const piiResult = await processor.processAndStorePii(testText, 'test-tenant', 'test-session');
  console.log('ChatRequestProcessor.processAndStorePii result:');
  console.log(`  processedMessage: ${piiResult.processedMessage}`);
  console.log(`  hasPii: ${piiResult.hasPii}`);
  console.log(`  piiDetails count: ${piiResult.piiDetails.length}`);
  console.log(`  detectedTypes: ${piiResult.detectedTypes.join(', ')}`);

  // VERDICT
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                               DIAGNOSIS                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  if (deps.piiDetectionService === null) {
    console.log('🚨 ROOT CAUSE: piiDetectionService is NULL in ChatRequestProcessorService');
    console.log('   Despite being in VoltAgentModule providers, NestJS is not injecting it.');
    console.log('');
    console.log('POSSIBLE CAUSES:');
    console.log('  1. @Optional() decorator is masking an injection error');
    console.log('  2. Circular dependency causing injection to fail');
    console.log('  3. Module configuration issue');
    console.log('');
    console.log('RECOMMENDATION: Remove @Optional() to see the actual error');
  } else if (!piiResult.hasPii) {
    console.log('🚨 BUG: piiDetectionService is injected but not detecting PII!');
    console.log('   Direct detection works, but processAndStorePii fails.');
  } else {
    console.log('✅ ALL WORKING: PII detection is functioning correctly.');
  }

  await app.close();
  console.log('\nDone!\n');
}

diagnose().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
