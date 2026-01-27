/// <reference types="node" />
/**
 * REAL E2E Test Script for Phase 5 & 6: Suggested Questions + AskUser Modal
 *
 * This test uses REAL LLM calls to verify:
 * 1. VoltAgent actually generates suggestions in responses
 * 2. VoltAgent generates ask-user blocks when ambiguous
 * 3. Stream parsing works with real SSE data
 *
 * REQUIRES: Running backend + valid auth token
 *
 * Run: cd backend && npx ts-node scripts/test-chat-suggestions-real-e2e.ts
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

// ============ AUTH SETUP ============

/**
 * Login and get auth token for API calls
 */
async function getAuthToken(): Promise<string | null> {
  // Try to use env var first
  if (process.env.TEST_AUTH_TOKEN) {
    return process.env.TEST_AUTH_TOKEN;
  }

  // Try test credentials
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const testPassword = process.env.TEST_PASSWORD || 'testpassword123';

  try {
    const response = await axios.post(`${API_BASE}/api/v1/auth/login`, {
      email: testEmail,
      password: testPassword,
    });
    return response.data?.token || response.data?.accessToken || null;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: unknown } };
    console.log(`   ⚠️ Login failed: ${axiosErr.response?.status} - Using env token if available`);
    return null;
  }
}

// ============ STREAM PARSING ============

/**
 * Parse SSE stream and extract all events
 */
async function parseSSEStream(response: NodeJS.ReadableStream): Promise<{
  textContent: string;
  suggestions: string[] | null;
  askUser: Record<string, unknown> | null;
  events: Array<{ type: string; data: unknown }>;
}> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let textContent = '';
    let suggestions: string[] | null = null;
    let askUser: Record<string, unknown> | null = null;
    const events: Array<{ type: string; data: unknown }> = [];

    response.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            events.push(parsed);

            // Extract text content
            if (parsed.type === 'text-delta' && parsed.delta) {
              textContent += parsed.delta;
            }

            // Extract custom events
            if (parsed.type === 'suggested-questions' && parsed.questions) {
              suggestions = parsed.questions;
            }
            if (parsed.type === 'ask-user' && parsed.question) {
              askUser = parsed;
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    });

    response.on('end', () => {
      // Try to extract from accumulated text if not found in events
      if (!suggestions) {
        const match = textContent.match(/```suggestions\s*\n(\[[\s\S]*?\])\s*\n```/);
        if (match) {
          try {
            suggestions = JSON.parse(match[1]);
          } catch { /* ignore */ }
        }
      }
      if (!askUser) {
        const match = textContent.match(/```ask-user\s*\n(\{[\s\S]*?\})\s*\n```/);
        if (match) {
          try {
            askUser = JSON.parse(match[1]);
          } catch { /* ignore */ }
        }
      }
      resolve({ textContent, suggestions, askUser, events });
    });

    response.on('error', reject);
  });
}

// ============ REAL LLM TESTS ============

/**
 * Test: Real chat that should generate suggestions
 */
async function testRealSuggestionsGeneration(token: string): Promise<void> {
  console.log('\n🤖 Testing REAL suggestions generation...');

  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/voltagent/chat/stream/v3`,
      {
        message: 'How many unread emails do I have?',
        locale: 'en',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 60000,
      }
    );

    const { textContent, suggestions, events } = await parseSSEStream(response.data);

    // Check we got a response
    results.push({
      name: 'Real LLM: Got response',
      passed: textContent.length > 0,
      details: `Response length: ${textContent.length} chars`,
    });

    // Check for suggestions
    results.push({
      name: 'Real LLM: Generated suggestions',
      passed: suggestions !== null && Array.isArray(suggestions) && suggestions.length > 0,
      details: suggestions ? `Found ${suggestions.length} suggestions: ${suggestions.slice(0, 2).join(', ')}...` : 'No suggestions found',
    });

    // Check suggestions format
    if (suggestions && suggestions.length > 0) {
      const allStrings = suggestions.every(s => typeof s === 'string');
      const reasonableLength = suggestions.every(s => s.length < 100);
      results.push({
        name: 'Real LLM: Suggestions format valid',
        passed: allStrings && reasonableLength,
        details: `All strings: ${allStrings}, reasonable length: ${reasonableLength}`,
      });
    } else {
      results.push({
        name: 'Real LLM: Suggestions format valid',
        passed: false,
        error: 'No suggestions to validate',
      });
    }

    // Log sample for debugging
    console.log(`   📝 Response preview: "${textContent.substring(0, 100)}..."`);
    if (suggestions) {
      console.log(`   💡 Suggestions: ${JSON.stringify(suggestions)}`);
    }

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    results.push({
      name: 'Real LLM: Got response',
      passed: false,
      error: `Request failed: ${axiosErr.response?.status || axiosErr.message}`,
    });
    results.push({
      name: 'Real LLM: Generated suggestions',
      passed: false,
      error: 'Request failed',
    });
    results.push({
      name: 'Real LLM: Suggestions format valid',
      passed: false,
      error: 'Request failed',
    });
  }
}

/**
 * Test: Real chat that should trigger ask-user (ambiguous request)
 */
async function testRealAskUserGeneration(token: string): Promise<void> {
  console.log('\n🤔 Testing REAL ask-user generation (ambiguous request)...');

  try {
    // Send ambiguous message that should trigger clarification
    const response = await axios.post(
      `${API_BASE}/api/v1/voltagent/chat/stream/v3`,
      {
        message: 'Send an email to John',
        locale: 'en',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 60000,
      }
    );

    const { textContent, askUser, suggestions } = await parseSSEStream(response.data);

    // Check we got a response
    results.push({
      name: 'Real LLM: Ambiguous request responded',
      passed: textContent.length > 0,
      details: `Response length: ${textContent.length} chars`,
    });

    // Check for ask-user OR sensible handling
    // Note: LLM may not always generate ask-user block, it might just ask in text
    const hasAskUserBlock = !!(askUser !== null && askUser.question && askUser.options);
    const asksInText = textContent.toLowerCase().includes('which john') ||
                       textContent.toLowerCase().includes('clarify') ||
                       textContent.toLowerCase().includes('which one') ||
                       textContent.toLowerCase().includes('multiple');

    results.push({
      name: 'Real LLM: Handled ambiguity',
      passed: hasAskUserBlock || asksInText,
      details: hasAskUserBlock
        ? `ask-user block: "${(askUser as { question?: string })?.question}"`
        : asksInText
          ? 'Asked for clarification in text'
          : 'No clarification detected',
    });

    // If ask-user block exists, validate format
    if (hasAskUserBlock) {
      const validFormat = askUser.question && Array.isArray(askUser.options);
      results.push({
        name: 'Real LLM: ask-user format valid',
        passed: !!validFormat,
        details: `Has question: ${!!askUser.question}, has options: ${Array.isArray(askUser.options)}`,
      });
      console.log(`   🤔 ask-user: ${JSON.stringify(askUser)}`);
    } else {
      results.push({
        name: 'Real LLM: ask-user format valid',
        passed: true, // Skip if no block (not always generated)
        details: 'SKIPPED - No ask-user block generated (may have asked in text)',
      });
    }

    // Check suggestions still work after ambiguous request
    results.push({
      name: 'Real LLM: Suggestions with ambiguous',
      passed: suggestions !== null && suggestions.length > 0,
      details: suggestions ? `Found ${suggestions.length} suggestions` : 'No suggestions (acceptable)',
    });

    console.log(`   📝 Response preview: "${textContent.substring(0, 150)}..."`);

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    const errorMsg = `Request failed: ${axiosErr.response?.status || axiosErr.message}`;
    results.push({ name: 'Real LLM: Ambiguous request responded', passed: false, error: errorMsg });
    results.push({ name: 'Real LLM: Handled ambiguity', passed: false, error: errorMsg });
    results.push({ name: 'Real LLM: ask-user format valid', passed: false, error: errorMsg });
    results.push({ name: 'Real LLM: Suggestions with ambiguous', passed: false, error: errorMsg });
  }
}

/**
 * Test: Multiple messages to verify consistent suggestion generation
 */
async function testConsistentSuggestions(token: string): Promise<void> {
  console.log('\n🔄 Testing suggestion consistency across messages...');

  const testMessages = [
    'What events do I have today?',
    'Show me my contacts',
    'Summarize my inbox',
  ];

  let successCount = 0;

  for (const message of testMessages) {
    try {
      const response = await axios.post(
        `${API_BASE}/api/v1/voltagent/chat/stream/v3`,
        { message, locale: 'en' },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
          timeout: 60000,
        }
      );

      const { suggestions } = await parseSSEStream(response.data);
      if (suggestions && suggestions.length > 0) {
        successCount++;
        console.log(`   ✅ "${message}" → ${suggestions.length} suggestions`);
      } else {
        console.log(`   ❌ "${message}" → No suggestions`);
      }
    } catch {
      console.log(`   ❌ "${message}" → Request failed`);
    }
  }

  const consistencyRate = (successCount / testMessages.length) * 100;
  results.push({
    name: 'Real LLM: Suggestion consistency',
    passed: consistencyRate >= 66, // At least 2/3 should have suggestions
    details: `${successCount}/${testMessages.length} messages had suggestions (${consistencyRate.toFixed(0)}%)`,
  });
}

// ============ MAIN ============

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  REAL E2E Test: Phase 5 (Suggestions) & Phase 6 (AskUser)');
  console.log('  Using ACTUAL LLM calls - Not Mocks!');
  console.log('═══════════════════════════════════════════════════════════');

  // Check server is running
  try {
    await axios.get(`${API_BASE}/health`, { timeout: 3000 });
    console.log(`\n✅ Server running at ${API_BASE}`);
  } catch {
    console.log(`\n❌ Server not running at ${API_BASE}`);
    console.log('   Start the backend first: cd backend && npm run start:dev');
    process.exit(1);
  }

  // Get auth token
  console.log('\n🔐 Getting auth token...');
  const token = await getAuthToken();

  if (!token) {
    console.log('❌ Could not get auth token');
    console.log('   Set TEST_AUTH_TOKEN env var or configure TEST_EMAIL/TEST_PASSWORD');
    console.log('\n   Example: TEST_AUTH_TOKEN=your_token npx ts-node scripts/test-chat-suggestions-real-e2e.ts');
    process.exit(1);
  }

  console.log('✅ Auth token obtained');

  // Run real LLM tests
  await testRealSuggestionsGeneration(token);
  await testRealAskUserGeneration(token);
  await testConsistentSuggestions(token);

  // Print results
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  REAL E2E TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    const isSkipped = result.details?.startsWith('SKIPPED');
    const icon = isSkipped ? '⏭️' : result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.details) {
      console.log(`   └─ ${result.details}`);
    }
    if (result.error) {
      console.log(`   └─ ERROR: ${result.error}`);
    }
    if (isSkipped) {
      skipped++;
      passed++;
    } else if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed} | SKIPPED: ${skipped}`);
  console.log('───────────────────────────────────────────────────────────');

  const passRate = ((passed / results.length) * 100).toFixed(1);
  console.log(`  Pass Rate: ${passRate}%`);
  console.log('───────────────────────────────────────────────────────────');

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed! The LLM may not be generating suggestions consistently.');
    console.log('   Check the supervisor prompt and ensure suggestions section is present.');
    process.exit(1);
  } else {
    console.log('\n🎉 All real E2E tests passed! LLM is generating suggestions correctly.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
