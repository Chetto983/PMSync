/**
 * V3 Streaming Endpoint - PARANOID Integration Test
 *
 * CRITICAL, CYNICAL, NO BULLSHIT validation of AI SDK v6 integration.
 * Tests REAL LLM calls through the V3 streaming endpoint.
 *
 * What this tests:
 * 1. V3 endpoint actually responds with SSE
 * 2. AI SDK protocol compliance (x-vercel-ai-ui-message-stream header)
 * 3. Event format validation (text-delta, tool-*, finish)
 * 4. PII sanitization in stream
 * 5. Tool invocation during streaming
 * 6. Error handling under real conditions
 *
 * NO MOCKS. NO JEST. REAL DATABASE. REAL LLM. REAL NETWORK.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-v3-streaming-paranoid.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import * as https from 'https';

// ============================================================================
// PARANOID ASSERTION HELPERS
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function ASSERT(condition: boolean, message: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${message}`);
  } else {
    failedTests++;
    failures.push(message);
    console.log(`  ❌ FAILED: ${message}`);
  }
}

function CRITICAL_ASSERT(condition: boolean, message: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [CRITICAL] ${message}`);
  } else {
    failedTests++;
    failures.push(`[CRITICAL] ${message}`);
    console.log(`  🚨 CRITICAL FAILURE: ${message}`);
    throw new Error(`Critical assertion failed: ${message}`);
  }
}

// ============================================================================
// HTTP STREAMING CLIENT (NO AXIOS - RAW SSE PARSING)
// ============================================================================

interface StreamTestResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  events: SSEEvent[];
  rawChunks: string[];
  errors: string[];
  totalBytes: number;
  durationMs: number;
}

interface SSEEvent {
  type: string;
  data: unknown;
  raw: string;
}

async function streamV3Endpoint(
  baseUrl: string,
  token: string,
  message: string,
  conversationId: string,
  locale: string = 'it',
): Promise<StreamTestResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/api/v1/voltagent/chat/stream/v3`);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const body = JSON.stringify({ message, conversationId, locale });
    const startTime = Date.now();

    const result: StreamTestResult = {
      statusCode: 0,
      headers: {},
      events: [],
      rawChunks: [],
      errors: [],
      totalBytes: 0,
      durationMs: 0,
    };

    const req = httpModule.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 3000),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        rejectUnauthorized: false, // Allow self-signed certs in dev
      },
      (res) => {
        result.statusCode = res.statusCode || 0;
        result.headers = res.headers as Record<string, string | string[] | undefined>;

        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          result.rawChunks.push(chunkStr);
          result.totalBytes += chunk.length;
          buffer += chunkStr;

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') {
                result.events.push({ type: 'DONE', data: null, raw: line });
              } else {
                try {
                  const data = JSON.parse(dataStr);
                  result.events.push({ type: data.type || 'unknown', data, raw: line });
                } catch {
                  result.errors.push(`Failed to parse: ${dataStr.slice(0, 100)}`);
                }
              }
            }
          }
        });

        res.on('end', () => {
          result.durationMs = Date.now() - startTime;
          resolve(result);
        });

        res.on('error', (err) => {
          result.errors.push(`Response error: ${err.message}`);
          result.durationMs = Date.now() - startTime;
          resolve(result);
        });
      },
    );

    req.on('error', (err: any) => {
      reject(new Error(`Request failed: ${err.message || err.code || JSON.stringify(err)}`));
    });

    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout after 120s'));
    });

    req.write(body);
    req.end();
  });
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

async function testBasicStreaming(baseUrl: string, token: string, tenantId: string): Promise<void> {
  console.log('\n📡 TEST 1: Basic SSE Streaming');
  console.log('   Testing: Simple greeting, no tools');

  const conversationId = `paranoid-test-${Date.now()}`;
  const result = await streamV3Endpoint(baseUrl, token, 'Ciao, come stai?', conversationId);

  // Always show raw output for debugging
  console.log('\n   📦 RAW EVENTS:');
  result.events.forEach((e, i) => {
    console.log(`      [${i}] ${e.type}: ${JSON.stringify(e.data).slice(0, 150)}`);
  });
  console.log('');

  // Debug: show raw response if not 200
  if (result.statusCode !== 200) {
    console.log(`   ⚠️  Raw response chunks: ${result.rawChunks.join('').slice(0, 500)}`);
    console.log(`   ⚠️  Errors: ${result.errors.join(', ')}`);
  }

  // Protocol assertions
  CRITICAL_ASSERT(result.statusCode === 200, `Status code is 200 (got ${result.statusCode})`);
  CRITICAL_ASSERT(
    result.headers['content-type']?.toString().includes('text/event-stream') ?? false,
    `Content-Type is text/event-stream (got ${result.headers['content-type']})`,
  );
  CRITICAL_ASSERT(
    result.headers['x-vercel-ai-ui-message-stream'] === 'v1',
    `AI SDK header present: x-vercel-ai-ui-message-stream=v1 (got ${result.headers['x-vercel-ai-ui-message-stream']})`,
  );

  // Event assertions
  const textDeltas = result.events.filter((e) => e.type === 'text-delta');
  ASSERT(textDeltas.length > 0, `Received text-delta events (count: ${textDeltas.length})`);

  const finishEvents = result.events.filter((e) => e.type === 'finish');
  ASSERT(finishEvents.length > 0 || result.events.some((e) => e.type === 'DONE'), 'Received finish or DONE event');

  // Content assertions
  const fullText = textDeltas.map((e) => (e.data as { delta?: string })?.delta || '').join('');
  ASSERT(fullText.length > 10, `Response has meaningful content (${fullText.length} chars)`);
  ASSERT(!fullText.includes('[Conversation'), 'No leaked internal context markers');
  ASSERT(!fullText.includes('## Learned'), 'No leaked Learned Constraints');

  console.log(`   📊 Stats: ${result.events.length} events, ${result.totalBytes} bytes, ${result.durationMs}ms`);
  console.log(`   📝 Response preview: "${fullText.slice(0, 100)}..."`);
}

async function testToolInvocation(baseUrl: string, token: string, tenantId: string): Promise<void> {
  console.log('\n🔧 TEST 2: Tool Invocation Streaming');
  console.log('   Testing: Query that triggers tool calls');

  const conversationId = `paranoid-tools-${Date.now()}`;
  const result = await streamV3Endpoint(
    baseUrl,
    token,
    'Quante email non lette ho? Dimmi il numero esatto.',
    conversationId,
  );

  // Always show raw output for debugging
  console.log('\n   📦 RAW EVENTS:');
  result.events.forEach((e, i) => {
    console.log(`      [${i}] ${e.type}: ${JSON.stringify(e.data).slice(0, 200)}`);
  });
  console.log('');

  CRITICAL_ASSERT(result.statusCode === 200, `Status code is 200 (got ${result.statusCode})`);

  // Look for tool-related events (AI SDK v6 format)
  const toolInputStart = result.events.filter((e) => e.type === 'tool-input-start');
  const toolInputAvailable = result.events.filter((e) => e.type === 'tool-input-available');
  const toolOutputAvailable = result.events.filter((e) => e.type === 'tool-output-available');
  const toolCall = result.events.filter((e) => e.type === 'tool-call');
  const toolResult = result.events.filter((e) => e.type === 'tool-result');

  // VoltAgent toUIMessageStream may use different event names
  const hasToolActivity =
    toolInputStart.length > 0 ||
    toolInputAvailable.length > 0 ||
    toolOutputAvailable.length > 0 ||
    toolCall.length > 0 ||
    toolResult.length > 0;

  ASSERT(hasToolActivity, `Tool events detected in stream (AI SDK format)`);

  if (hasToolActivity) {
    console.log(`   🔧 Tool events: input-start=${toolInputStart.length}, input-available=${toolInputAvailable.length}, output=${toolOutputAvailable.length}`);
  } else {
    // Log all event types for debugging
    const eventTypes = [...new Set(result.events.map((e) => e.type))];
    console.log(`   ⚠️  Event types seen: ${eventTypes.join(', ')}`);
  }

  // Text content assertions
  const textDeltas = result.events.filter((e) => e.type === 'text-delta');
  const fullText = textDeltas.map((e) => (e.data as { delta?: string })?.delta || '').join('');
  ASSERT(fullText.length > 0, `Response contains text content`);

  console.log(`   📊 Stats: ${result.events.length} events, ${result.durationMs}ms`);
  console.log(`   📝 Response preview: "${fullText.slice(0, 150)}..."`);
}

async function testPiiSanitization(baseUrl: string, token: string, tenantId: string): Promise<void> {
  console.log('\n🔒 TEST 3: PII Sanitization');
  console.log('   Testing: Stream output should not leak raw PII placeholders');

  const conversationId = `paranoid-pii-${Date.now()}`;
  // Query that might reference emails/contacts with PII
  const result = await streamV3Endpoint(
    baseUrl,
    token,
    'Mostrami le ultime 3 email che ho ricevuto con mittente e oggetto.',
    conversationId,
  );

  CRITICAL_ASSERT(result.statusCode === 200, `Status code is 200`);

  const textDeltas = result.events.filter((e) => e.type === 'text-delta');
  const fullText = textDeltas.map((e) => (e.data as { delta?: string })?.delta || '').join('');

  // Paranoid PII checks
  ASSERT(!fullText.includes('[EMAIL_REDACTED'), 'No leaked [EMAIL_REDACTED] placeholders');
  ASSERT(!fullText.includes('[NAME_REDACTED'), 'No leaked [NAME_REDACTED] placeholders');
  ASSERT(!fullText.includes('[CONTENT_REDACTED'), 'No leaked [CONTENT_REDACTED] placeholders');
  ASSERT(!fullText.includes('EMAIL_REDACTED:'), 'No leaked EMAIL_REDACTED: markers');

  // Internal context leak checks
  ASSERT(!fullText.includes('[Conversation History]'), 'No leaked [Conversation History]');
  ASSERT(!fullText.includes('[Current Message]'), 'No leaked [Current Message]');
  ASSERT(!fullText.includes('[User Memory]'), 'No leaked [User Memory]');

  console.log(`   📝 Response preview: "${fullText.slice(0, 200)}..."`);
}

async function testErrorHandling(baseUrl: string, token: string): Promise<void> {
  console.log('\n💥 TEST 4: Error Handling');
  console.log('   Testing: Invalid requests should fail gracefully');

  // Test with empty message
  const conversationId = `paranoid-error-${Date.now()}`;
  try {
    const result = await streamV3Endpoint(baseUrl, token, '', conversationId);
    // Either 400 or an error event in stream
    ASSERT(
      result.statusCode === 400 || result.events.some((e) => e.type === 'error'),
      `Empty message handled (status: ${result.statusCode}, error events: ${result.events.filter((e) => e.type === 'error').length})`,
    );
  } catch (err) {
    ASSERT(true, `Empty message rejected with error: ${(err as Error).message.slice(0, 50)}`);
  }
}

async function testConcurrentStreams(baseUrl: string, token: string, tenantId: string): Promise<void> {
  console.log('\n⚡ TEST 5: Concurrent Streams');
  console.log('   Testing: Multiple simultaneous streams should not interfere');

  const promises = [
    streamV3Endpoint(baseUrl, token, 'Quante email ho ricevuto oggi?', `concurrent-1-${Date.now()}`),
    streamV3Endpoint(baseUrl, token, 'Cosa ho in calendario domani?', `concurrent-2-${Date.now()}`),
    streamV3Endpoint(baseUrl, token, 'Chi è il mio contatto più recente?', `concurrent-3-${Date.now()}`),
  ];

  const results = await Promise.all(promises);

  let allSucceeded = true;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.statusCode !== 200) {
      allSucceeded = false;
      console.log(`   ⚠️  Stream ${i + 1} failed with status ${r.statusCode}`);
    }
    const textDeltas = r.events.filter((e) => e.type === 'text-delta');
    const text = textDeltas.map((e) => (e.data as { delta?: string })?.delta || '').join('');
    console.log(`   📝 Stream ${i + 1}: ${text.slice(0, 80)}... (${r.durationMs}ms)`);
  }

  ASSERT(allSucceeded, 'All concurrent streams completed with 200');
  ASSERT(
    results.every((r) => r.events.filter((e) => e.type === 'text-delta').length > 0),
    'All streams produced text output',
  );
}

async function testInvalidToken(baseUrl: string): Promise<void> {
  console.log('\n🔐 TEST 6: Authentication');
  console.log('   Testing: Invalid token should be rejected');

  try {
    const result = await streamV3Endpoint(baseUrl, 'invalid-token-xyz', 'test', 'auth-test');
    ASSERT(result.statusCode === 401, `Invalid token returns 401 (got ${result.statusCode})`);
  } catch (err) {
    ASSERT(true, `Request failed as expected: ${(err as Error).message.slice(0, 50)}`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  V3 STREAMING ENDPOINT - PARANOID INTEGRATION TEST                       ║');
  console.log('║  NO MOCKS | NO JEST | REAL DATABASE | REAL LLM | REAL NETWORK            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  const prisma = createPrismaClient();

  try {
    // Get test user and create JWT
    // Find users and pick one with tenantId
    const users = await prisma.user.findMany({
      include: { userPreferences: true },
      take: 10,
    });
    const user = users.find((u) => u.tenantId);
    if (!user || !user.tenantId) {
      throw new Error('No user with tenantId found in database');
    }

    console.log('👤 Test User:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Tenant: ${user.tenantId}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}\n`);

    // Bootstrap NestJS to get JWT service
    console.log('🚀 Bootstrapping NestJS...');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

    // Generate a real JWT token
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = app.get(JwtService);
    const token = jwtService.sign({
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    console.log(`   ✅ JWT generated (${token.length} chars)\n`);

    const baseUrl = process.env.API_URL || 'http://localhost:3000';
    console.log(`🌐 Target: ${baseUrl}/api/v1/voltagent/chat/stream/v3\n`);

    // Run all tests
    await testInvalidToken(baseUrl);
    await testBasicStreaming(baseUrl, token, user.tenantId);
    await testToolInvocation(baseUrl, token, user.tenantId);
    await testPiiSanitization(baseUrl, token, user.tenantId);
    await testErrorHandling(baseUrl, token);
    await testConcurrentStreams(baseUrl, token, user.tenantId);

    // Final report
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  FINAL REPORT                                                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n   Total Tests:  ${totalTests}`);
    console.log(`   ✅ Passed:    ${passedTests}`);
    console.log(`   ❌ Failed:    ${failedTests}`);

    if (failures.length > 0) {
      console.log('\n   FAILURES:');
      for (const f of failures) {
        console.log(`   - ${f}`);
      }
    }

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    console.log(`\n   Success Rate: ${successRate}%`);

    if (failedTests === 0) {
      console.log('\n   🎉 ALL TESTS PASSED - V3 STREAMING IS WORKING!');
    } else {
      console.log('\n   ⚠️  SOME TESTS FAILED - INVESTIGATE BEFORE DEPLOYING');
    }

    await app.close();
  } catch (error) {
    console.error('\n💀 CRITICAL ERROR:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
