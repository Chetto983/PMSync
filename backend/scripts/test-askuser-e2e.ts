/// <reference types="node" />
/**
 * Real E2E Test: AskUser Modal Flow
 *
 * Tests that the LLM generates proper ask-user blocks for ambiguous requests.
 * Uses REAL API calls to verify end-to-end behavior.
 *
 * Run: cd backend && npx ts-node scripts/test-askuser-e2e.ts
 *
 * Requires:
 * - Backend running at localhost:3000
 * - Valid auth token (TEST_AUTH_TOKEN env var or login credentials)
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

interface AskUserData {
  question: string;
  header: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

const results: TestResult[] = [];

// ============ AUTH ============

async function getAuthToken(): Promise<string | null> {
  if (process.env.TEST_AUTH_TOKEN) {
    return process.env.TEST_AUTH_TOKEN;
  }

  // Use seeded test credentials from prisma/seed.ts
  const testEmail = process.env.TEST_EMAIL || 'test@mailagent.local';
  const testPassword = process.env.TEST_PASSWORD || 'UserPassword123!';

  try {
    // Try the correct auth endpoint path with tenant slug
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: testEmail,
      password: testPassword,
      tenantSlug: 'default', // Default tenant from prisma/seed.ts
    });
    return response.data?.token || response.data?.accessToken || null;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: unknown } };
    console.log(`   ⚠️ Login failed: ${axiosErr.response?.status}`);
    console.log(`   Response: ${JSON.stringify(axiosErr.response?.data)}`);
    return null;
  }
}

// ============ STREAM PARSING ============

interface ParsedStream {
  textContent: string;
  askUser: AskUserData | null;
  askUserFromTool: AskUserData | null; // From tool call
  suggestions: string[] | null;
  toolCalls: Array<{ name: string; args: unknown }>;
}

async function parseSSEStream(response: NodeJS.ReadableStream): Promise<ParsedStream> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let textContent = '';
    let askUser: AskUserData | null = null;
    let askUserFromTool: AskUserData | null = null;
    let suggestions: string[] | null = null;
    const toolCalls: Array<{ name: string; args: unknown }> = [];

    response.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Accumulate text
            if (parsed.type === 'text-delta' && parsed.delta) {
              textContent += parsed.delta;
            }

            // Detect tool calls (tool-based ask-user approach)
            if (parsed.type === 'tool-call') {
              toolCalls.push({ name: parsed.toolName, args: parsed.args });
              // Check if it's ask_user_clarification tool
              if (parsed.toolName === 'ask_user_clarification' && parsed.args) {
                askUserFromTool = {
                  question: parsed.args.question,
                  header: parsed.args.header,
                  options: parsed.args.options,
                  multiSelect: parsed.args.multiSelect,
                };
              }
            }

            // Also check tool-result for ask-user marker
            if (parsed.type === 'tool-result' && parsed.result?.__askUser) {
              askUserFromTool = {
                question: parsed.result.question,
                header: parsed.result.header,
                options: parsed.result.options,
                multiSelect: parsed.result.multiSelect,
              };
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    });

    response.on('end', () => {
      // Parse ask-user block from text (legacy/fallback)
      const askUserMatch = textContent.match(/```ask-user\s*\n(\{[\s\S]*?\})\s*\n```/);
      if (askUserMatch) {
        try {
          askUser = JSON.parse(askUserMatch[1]);
        } catch { /* ignore */ }
      }

      // Fallback: Parse generic ```json blocks with "options" (Mistral outputs these instead of tool calls)
      if (!askUser && !askUserFromTool) {
        const jsonMatch = textContent.match(/```json\s*\n(\{[\s\S]*?\})\s*\n```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.options && Array.isArray(parsed.options)) {
              askUser = {
                question: parsed.question || 'Please select an option',
                header: parsed.header || 'Options',
                options: parsed.options.map((opt: string | { label: string; description?: string }) =>
                  typeof opt === 'string' ? { label: opt } : opt
                ),
                multiSelect: parsed.multiSelect ?? false,
              };
              console.log('   ⚠️  Detected JSON block fallback (Mistral prefers text over tool calls)');
            }
          } catch { /* ignore */ }
        }
      }

      // Parse suggestions block
      const suggestionsMatch = textContent.match(/```suggestions\s*\n(\[[\s\S]*?\])\s*\n```/);
      if (suggestionsMatch) {
        try {
          suggestions = JSON.parse(suggestionsMatch[1]);
        } catch { /* ignore */ }
      }

      resolve({ textContent, askUser, askUserFromTool, suggestions, toolCalls });
    });

    response.on('error', reject);
  });
}

// ============ TESTS ============

/**
 * Test 1: Ambiguous recipient should trigger ask-user
 */
async function testAmbiguousRecipient(token: string): Promise<void> {
  console.log('\n📧 Test 1: Ambiguous recipient "Send email to John"...');

  try {
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

    const { textContent, askUser, askUserFromTool, toolCalls } = await parseSSEStream(response.data);

    // Check for ask-user via tool call (preferred) OR JSON block (fallback)
    const hasToolAskUser = askUserFromTool !== null && askUserFromTool.question && askUserFromTool.options;
    const hasJsonAskUser = askUser !== null && askUser.question && askUser.options;
    const hasAskUser = hasToolAskUser || hasJsonAskUser;
    const effectiveAskUser = askUserFromTool || askUser;
    const asksInText = /which john|multiple|clarify|specify|who do you mean/i.test(textContent);

    results.push({
      name: 'Ambiguous recipient: Response received',
      passed: textContent.length > 0 || toolCalls.length > 0,
      details: `${textContent.length} chars, ${toolCalls.length} tool calls`,
    });

    results.push({
      name: 'Ambiguous recipient: ask-user generated',
      passed: !!hasAskUser,
      details: hasToolAskUser
        ? `[TOOL] Question: "${effectiveAskUser?.question}", ${effectiveAskUser?.options?.length} options`
        : hasJsonAskUser
          ? `[JSON] Question: "${effectiveAskUser?.question}", ${effectiveAskUser?.options?.length} options`
          : asksInText
            ? 'Asked in text (should use tool or JSON block)'
            : 'No clarification detected',
    });

    if (hasAskUser) {
      // Validate ask-user structure
      const validStructure = !!(
        effectiveAskUser?.question &&
        effectiveAskUser?.header &&
        Array.isArray(effectiveAskUser?.options) &&
        effectiveAskUser.options.length >= 2
      );
      results.push({
        name: 'Ambiguous recipient: ask-user structure valid',
        passed: validStructure,
        details: validStructure
          ? `Header: "${effectiveAskUser?.header}", Options: ${effectiveAskUser?.options?.map(o => o.label).join(', ')}`
          : 'Invalid structure',
      });
    }

    console.log(`   📝 Response: "${textContent.substring(0, 150)}..."`);
    if (toolCalls.length > 0) {
      console.log(`   🔧 Tool calls: ${toolCalls.map(t => t.name).join(', ')}`);
    }
    if (effectiveAskUser) {
      console.log(`   ✅ ask-user: ${JSON.stringify(effectiveAskUser, null, 2)}`);
    }

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    results.push({
      name: 'Ambiguous recipient: Response received',
      passed: false,
      error: `Request failed: ${axiosErr.response?.status || axiosErr.message}`,
    });
  }
}

/**
 * Test 2: Missing required info should trigger ask-user
 */
async function testMissingRequiredInfo(token: string): Promise<void> {
  console.log('\n📅 Test 2: Missing info "Schedule a meeting"...');

  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/voltagent/chat/stream/v3`,
      {
        message: 'Schedule a meeting',
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

    const { textContent, askUser, askUserFromTool, toolCalls } = await parseSSEStream(response.data);

    const hasToolAskUser = askUserFromTool !== null && askUserFromTool.question && askUserFromTool.options;
    const hasJsonAskUser = askUser !== null && askUser.question && askUser.options;
    const hasAskUser = hasToolAskUser || hasJsonAskUser;
    const effectiveAskUser = askUserFromTool || askUser;
    const asksForDetails = /when|what time|who|with whom|duration|purpose/i.test(textContent);

    results.push({
      name: 'Missing info: Response received',
      passed: textContent.length > 0 || toolCalls.length > 0,
      details: `${textContent.length} chars, ${toolCalls.length} tool calls`,
    });

    results.push({
      name: 'Missing info: Asks for clarification',
      passed: !!(hasAskUser || asksForDetails),
      details: hasToolAskUser
        ? `[TOOL] "${effectiveAskUser?.question}"`
        : hasJsonAskUser
          ? `[JSON] "${effectiveAskUser?.question}"`
          : asksForDetails
            ? 'Asked in text (should use tool)'
            : 'No clarification',
    });

    console.log(`   📝 Response: "${textContent.substring(0, 150)}..."`);
    if (toolCalls.length > 0) {
      console.log(`   🔧 Tool calls: ${toolCalls.map(t => t.name).join(', ')}`);
    }

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    results.push({
      name: 'Missing info: Response received',
      passed: false,
      error: `Request failed: ${axiosErr.response?.status || axiosErr.message}`,
    });
  }
}

/**
 * Test 3: Clear command should NOT trigger ask-user
 */
async function testClearCommand(token: string): Promise<void> {
  console.log('\n✉️ Test 3: Clear command "How many unread emails do I have?"...');

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

    const { textContent, askUser, askUserFromTool, suggestions, toolCalls } = await parseSSEStream(response.data);

    const hasAskUser = (askUserFromTool !== null) || (askUser !== null);

    results.push({
      name: 'Clear command: Response received',
      passed: textContent.length > 0,
      details: `${textContent.length} chars, ${toolCalls.length} tool calls`,
    });

    results.push({
      name: 'Clear command: NO ask-user (executes directly)',
      passed: !hasAskUser,
      details: hasAskUser
        ? `Unnecessary ask-user: "${(askUserFromTool || askUser)?.question}"`
        : 'Correctly executed without asking',
    });

    results.push({
      name: 'Clear command: Has suggestions',
      passed: suggestions !== null && suggestions.length > 0,
      details: suggestions ? `${suggestions.length} suggestions` : 'No suggestions',
    });

    console.log(`   📝 Response: "${textContent.substring(0, 150)}..."`);

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    results.push({
      name: 'Clear command: Response received',
      passed: false,
      error: `Request failed: ${axiosErr.response?.status || axiosErr.message}`,
    });
  }
}

/**
 * Test 4: Multiple interpretations should trigger ask-user
 */
async function testMultipleInterpretations(token: string): Promise<void> {
  console.log('\n📂 Test 4: Multiple interpretations "Organize my inbox"...');

  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/voltagent/chat/stream/v3`,
      {
        message: 'Organize my inbox',
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

    const { textContent, askUser, askUserFromTool, toolCalls } = await parseSSEStream(response.data);

    const hasToolAskUser = askUserFromTool !== null && askUserFromTool.question && askUserFromTool.options;
    const hasJsonAskUser = askUser !== null && askUser.question && askUser.options;
    const hasAskUser = hasToolAskUser || hasJsonAskUser;
    const effectiveAskUser = askUserFromTool || askUser;
    const asksForClarification = /how|which way|by what|priorit|sender|date|folder/i.test(textContent);

    results.push({
      name: 'Multiple interpretations: Response received',
      passed: textContent.length > 0 || toolCalls.length > 0,
      details: `${textContent.length} chars, ${toolCalls.length} tool calls`,
    });

    results.push({
      name: 'Multiple interpretations: Asks for approach',
      passed: !!(hasAskUser || asksForClarification),
      details: hasToolAskUser
        ? `[TOOL] "${effectiveAskUser?.question}"`
        : hasJsonAskUser
          ? `[JSON] "${effectiveAskUser?.question}"`
          : asksForClarification
            ? 'Asked in text (should use tool)'
            : 'No clarification',
    });

    console.log(`   📝 Response: "${textContent.substring(0, 150)}..."`);
    if (toolCalls.length > 0) {
      console.log(`   🔧 Tool calls: ${toolCalls.map(t => t.name).join(', ')}`);
    }

  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    results.push({
      name: 'Multiple interpretations: Response received',
      passed: false,
      error: `Request failed: ${axiosErr.response?.status || axiosErr.message}`,
    });
  }
}

// ============ MAIN ============

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Real E2E Test: AskUser Modal Flow');
  console.log('  Using ACTUAL LLM calls - Verifying ask-user block generation');
  console.log('═══════════════════════════════════════════════════════════');

  // Check server
  try {
    await axios.get(`${API_BASE}/health`, { timeout: 3000 });
    console.log(`\n✅ Server running at ${API_BASE}`);
  } catch {
    console.log(`\n❌ Server not running at ${API_BASE}`);
    console.log('   Start: cd backend && npm run start:dev');
    process.exit(1);
  }

  // Get auth
  console.log('\n🔐 Getting auth token...');
  const token = await getAuthToken();

  if (!token) {
    console.log('❌ Could not get auth token');
    console.log('   Set TEST_AUTH_TOKEN env var');
    process.exit(1);
  }
  console.log('✅ Auth token obtained');

  // Clear agent cache to force reload of prompts
  console.log('\n🧹 Clearing agent cache (force prompt reload)...');
  try {
    const clearResponse = await axios.post(
      `${API_BASE}/api/v1/voltagent/cache/clear-agents`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );
    console.log(`✅ Agent cache cleared: ${clearResponse.data?.message || 'OK'}`);
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number }; message?: string };
    console.log(`⚠️  Could not clear cache: ${axiosErr.response?.status || axiosErr.message}`);
    console.log('   Continuing anyway (cache may still have old prompts)...');
  }

  // Run tests
  await testAmbiguousRecipient(token);
  await testMissingRequiredInfo(token);
  await testClearCommand(token);
  await testMultipleInterpretations(token);

  // Print results
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.details) console.log(`   └─ ${result.details}`);
    if (result.error) console.log(`   └─ ERROR: ${result.error}`);
    result.passed ? passed++ : failed++;
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`  Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('───────────────────────────────────────────────────────────');

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed!');
    console.log('   The LLM may not be generating ask-user blocks consistently.');
    console.log('   Check the supervisor prompt instructions.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
