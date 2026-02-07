/**
 * P5 Phase 6: Agent Chain Test
 *
 * PARANOID VALIDATION of agent chain wiring and multi-step flows.
 * Tests that agents can be chained together to complete complex tasks.
 *
 * NOTE: This tests the WIRING, not the LLM reasoning. LLM reasoning
 * would require expensive real LLM calls. Instead, we verify:
 * 1. Supervisor creates correct sub-agents
 * 2. Tools can be executed in sequence (simulating chain)
 * 3. Data flows correctly between tool calls
 * 4. HITL approval points are correctly placed
 *
 * Flows tested:
 * - Flow 1: Search → Analyze (IntelligenceAgent chain)
 * - Flow 2: Search → Create (cross-agent handoff with HITL)
 * - Flow 3: Multi-source query (parallel tool execution)
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getMistralModel } from '../src/modules/ai/voltagent/providers/mistral.provider';
import {
  createActionsAgent,
  createIntelligenceAgent,
  createSupervisorAgent,
} from '../src/modules/ai/voltagent/agents';
import { createEmailTools } from '../src/modules/ai/voltagent/tools/email.tools';
import { createContactsTools } from '../src/modules/ai/voltagent/tools/contacts.tools';
import { createCalendarTools } from '../src/modules/ai/voltagent/tools/calendar.tools';
import { createInsightTools } from '../src/modules/ai/voltagent/tools/insights.tools';
import { Mistral } from '@mistralai/mistralai';

// ============================================================================
// Mock Cache Service
// ============================================================================
const mockCacheService = {
  isHealthy: () => true,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  getClient: () => null,
};

// ============================================================================
// Test Types
// ============================================================================

interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
  error?: string;
  duration?: number;
}

// ============================================================================
// Logging Utilities
// ============================================================================

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSuccess(message: string) {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`);
}

function logError(message: string) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// ============================================================================
// Helper: Execute tool
// ============================================================================

async function executeTool(tool: any, params: any): Promise<any> {
  const start = Date.now();
  try {
    const result = await tool.execute(params);
    return { ...result, _duration: Date.now() - start };
  } catch (error: any) {
    return { success: false, error: error.message, _duration: Date.now() - start };
  }
}

// ============================================================================
// Test 1: Supervisor Agent Sub-Agent Creation
// ============================================================================

async function testSupervisorSubAgents(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 1: Supervisor Sub-Agent Creation');

  const model = getMistralModel();

  // Create supervisor with minimal config
  const supervisor = await createSupervisorAgent({
    model,
    prisma: prisma as any,
    emailSendService: null,
    calendarService: null,
    locale: 'en',
    tenantId,
  });

  // Get sub-agents using VoltAgent API
  const subAgents = supervisor.getSubAgents();
  const subAgentNames = subAgents.map((a: any) => a.name);

  log(`Supervisor has ${subAgents.length} sub-agents: ${subAgentNames.join(', ')}`);

  // Test: Should have ActionsAgent
  const hasActionsAgent = subAgentNames.includes('ActionsAgent');
  results.push({
    testName: 'Supervisor has ActionsAgent',
    passed: hasActionsAgent,
    details: hasActionsAgent ? 'ActionsAgent present' : 'ActionsAgent MISSING',
  });
  hasActionsAgent ? logSuccess('Supervisor has ActionsAgent') : logError('Supervisor MISSING ActionsAgent');

  // Test: Should have IntelligenceAgent
  const hasIntelligenceAgent = subAgentNames.includes('IntelligenceAgent');
  results.push({
    testName: 'Supervisor has IntelligenceAgent',
    passed: hasIntelligenceAgent,
    details: hasIntelligenceAgent ? 'IntelligenceAgent present' : 'IntelligenceAgent MISSING',
  });
  hasIntelligenceAgent
    ? logSuccess('Supervisor has IntelligenceAgent')
    : logError('Supervisor MISSING IntelligenceAgent');

  // Test: Should have exactly 2 core agents (without configService)
  const correctCount = subAgents.length === 2;
  results.push({
    testName: 'Supervisor has 2 core agents',
    passed: correctCount,
    details: correctCount ? 'Correct count' : `Expected 2, got ${subAgents.length}`,
  });
  correctCount ? logSuccess('Supervisor has 2 core agents') : logError(`Supervisor has ${subAgents.length} agents`);

  return results;
}

// ============================================================================
// Test 2: Intelligence Agent Chain (Search → Analyze)
// ============================================================================

async function testIntelligenceChain(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 2: Intelligence Agent Chain (Search → Analyze)');

  // Get a real email to test with
  const testEmail = await prisma.email.findFirst({
    where: { tenantId },
    select: { id: true, subject: true, snippet: true },
  });

  if (!testEmail) {
    log('No emails found - skipping chain test');
    results.push({
      testName: 'Intelligence chain (search → analyze)',
      passed: true,
      details: 'Skipped - no test data',
    });
    return results;
  }

  log(`Using test email: ${testEmail.subject}`);

  // Create Mistral client for insights tools
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    log('MISTRAL_API_KEY not set - skipping analysis step');
    results.push({
      testName: 'Intelligence chain (search → analyze)',
      passed: true,
      details: 'Skipped - no Mistral API key',
    });
    return results;
  }

  const client = new Mistral({ apiKey: mistralApiKey });
  const mockMistralService = {
    completePrompt: async ({ systemPrompt, userPrompt, temperature, maxTokens }: any) => {
      const response = await client.chat.complete({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: temperature ?? 0.3,
        maxTokens: maxTokens ?? 500,
      });
      return response.choices?.[0]?.message?.content || '';
    },
  };

  // Step 1: Search emails using email tools
  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const searchTool = emailTools.find((t) => t.name === 'search_emails');

  if (!searchTool) {
    logError('search_emails tool not found');
    results.push({
      testName: 'Intelligence chain - search step',
      passed: false,
      details: 'search_emails tool not found',
    });
    return results;
  }

  const searchResult = await executeTool(searchTool, {
    query: testEmail.subject?.split(' ')[0] || 'test',
    limit: 1,
  });

  const searchPassed = searchResult.success && searchResult.data?.length > 0;
  results.push({
    testName: 'Intelligence chain - search step',
    passed: searchPassed,
    details: searchPassed
      ? `Found ${searchResult.data?.length} emails in ${searchResult._duration}ms`
      : `Search failed: ${searchResult.error}`,
    duration: searchResult._duration,
  });

  if (searchPassed) {
    logSuccess(`Search step: found ${searchResult.data?.length} emails`);
  } else {
    logError(`Search step failed: ${searchResult.error}`);
    return results;
  }

  // Step 2: Analyze the found email using insights tools
  const insightTools = createInsightTools({
    prisma: prisma as any,
    mistral: mockMistralService as any,
    cacheService: mockCacheService as any,
    locale: 'en',
    tenantId,
  });
  const analyzeTool = insightTools.find((t) => t.name === 'analyze_email');

  if (!analyzeTool) {
    logError('analyze_email tool not found');
    results.push({
      testName: 'Intelligence chain - analyze step',
      passed: false,
      details: 'analyze_email tool not found',
    });
    return results;
  }

  // Use the email ID from search results
  const foundEmailId = searchResult.data[0]?.id || testEmail.id;
  const analyzeResult = await executeTool(analyzeTool, { emailId: foundEmailId });

  const analyzePassed = analyzeResult.summary && analyzeResult.analysis;
  results.push({
    testName: 'Intelligence chain - analyze step',
    passed: analyzePassed,
    details: analyzePassed
      ? `Analysis complete: sentiment=${analyzeResult.analysis?.sentiment}, priority=${analyzeResult.analysis?.priority} (${analyzeResult._duration}ms)`
      : `Analysis failed: ${analyzeResult.error}`,
    duration: analyzeResult._duration,
  });

  if (analyzePassed) {
    logSuccess(`Analyze step: sentiment=${analyzeResult.analysis?.sentiment}`);
  } else {
    logError(`Analyze step failed: ${analyzeResult.error}`);
  }

  // Chain validation: data flows correctly
  const chainValid = searchPassed && analyzePassed;
  results.push({
    testName: 'Intelligence chain - data flow validation',
    passed: chainValid,
    details: chainValid
      ? 'Data flowed correctly from search to analyze'
      : 'Chain broken - data did not flow between steps',
  });

  if (chainValid) {
    logSuccess('Intelligence chain complete - data flowed correctly');
  } else {
    logError('Intelligence chain broken');
  }

  return results;
}

// ============================================================================
// Test 3: Cross-Agent Handoff (Intelligence → Actions with HITL)
// ============================================================================

async function testCrossAgentHandoff(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 3: Cross-Agent Handoff (Search → Create Contact with HITL)');

  // Step 1: Search for contacts (IntelligenceAgent territory)
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);
  const searchContactsTool = contactsTools.find((t) => t.name === 'search_contacts');
  const manageContactTool = contactsTools.find((t) => t.name === 'manage_contact');

  if (!searchContactsTool || !manageContactTool) {
    logError('Contact tools not found');
    results.push({
      testName: 'Cross-agent handoff',
      passed: false,
      details: 'Contact tools not found',
    });
    return results;
  }

  // Search for existing contacts
  const searchResult = await executeTool(searchContactsTool, {
    query: 'test',
    limit: 1,
  });

  log(`Search contacts result: found ${searchResult.data?.length || 0} contacts`);

  results.push({
    testName: 'Cross-agent - Intelligence search step',
    passed: searchResult.success,
    details: searchResult.success
      ? `Search complete (${searchResult._duration}ms)`
      : `Search failed: ${searchResult.error}`,
    duration: searchResult._duration,
  });

  if (searchResult.success) {
    logSuccess('Intelligence search step complete');
  } else {
    logError(`Search failed: ${searchResult.error}`);
  }

  // Step 2: Create contact (ActionsAgent territory - requires HITL)
  const createResult = await executeTool(manageContactTool, {
    action: 'create',
    email: 'chain-test@example.com',
    displayName: 'Chain Test Contact',
  });

  // Verify HITL is required
  const hitlRequired = createResult.success && createResult.requiresApproval === true;
  results.push({
    testName: 'Cross-agent - Actions create step (HITL)',
    passed: hitlRequired,
    details: hitlRequired
      ? `HITL correctly required: actionType=${createResult.actionType}, severity=${createResult.severity}`
      : `HITL issue: requiresApproval=${createResult.requiresApproval}, error=${createResult.error}`,
    duration: createResult._duration,
  });

  if (hitlRequired) {
    logSuccess('Actions create step: HITL correctly required');
  } else {
    logError(`Actions create step issue: ${createResult.error}`);
  }

  // Verify handoff points
  const handoffValid = searchResult.success && hitlRequired;
  results.push({
    testName: 'Cross-agent handoff validation',
    passed: handoffValid,
    details: handoffValid
      ? 'Handoff from IntelligenceAgent to ActionsAgent works correctly'
      : 'Handoff failed',
  });

  if (handoffValid) {
    logSuccess('Cross-agent handoff validated');
  } else {
    logError('Cross-agent handoff failed');
  }

  return results;
}

// ============================================================================
// Test 4: Multi-Source Query (Parallel Tool Execution)
// ============================================================================

async function testMultiSourceQuery(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 4: Multi-Source Query (Contacts + Calendar)');

  // Get a real contact to search for
  const testContact = await prisma.contact.findFirst({
    where: { tenantId },
    select: { id: true, displayName: true },
  });

  const searchName = testContact?.displayName?.split(' ')[0] || 'John';
  log(`Searching for contacts and events related to: ${searchName}`);

  // Create tools
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);
  const calendarTools = createCalendarTools(prisma as any, null, 'en', tenantId, mockCacheService as any);

  const searchContactsTool = contactsTools.find((t) => t.name === 'search_contacts');
  const getEventsTool = calendarTools.find((t) => t.name === 'get_events');

  if (!searchContactsTool || !getEventsTool) {
    logError('Required tools not found');
    results.push({
      testName: 'Multi-source query',
      passed: false,
      details: 'Required tools not found',
    });
    return results;
  }

  // Execute both queries in parallel (simulating multi-source)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const startTime = Date.now();
  const [contactsResult, eventsResult] = await Promise.all([
    executeTool(searchContactsTool, { query: searchName, limit: 5 }),
    executeTool(getEventsTool, {
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
    }),
  ]);
  const parallelDuration = Date.now() - startTime;

  // Validate contacts query
  results.push({
    testName: 'Multi-source - contacts query',
    passed: contactsResult.success,
    details: contactsResult.success
      ? `Found ${contactsResult.data?.length || 0} contacts`
      : `Failed: ${contactsResult.error}`,
    duration: contactsResult._duration,
  });

  if (contactsResult.success) {
    logSuccess(`Contacts query: ${contactsResult.data?.length || 0} contacts`);
  } else {
    logError(`Contacts query failed: ${contactsResult.error}`);
  }

  // Validate events query
  results.push({
    testName: 'Multi-source - events query',
    passed: eventsResult.success,
    details: eventsResult.success
      ? `Found ${eventsResult.data?.length || 0} events`
      : `Failed: ${eventsResult.error}`,
    duration: eventsResult._duration,
  });

  if (eventsResult.success) {
    logSuccess(`Events query: ${eventsResult.data?.length || 0} events`);
  } else {
    logError(`Events query failed: ${eventsResult.error}`);
  }

  // Validate parallel execution efficiency
  const parallelEfficient = parallelDuration < (contactsResult._duration || 0) + (eventsResult._duration || 0);
  results.push({
    testName: 'Multi-source - parallel execution',
    passed: parallelEfficient,
    details: parallelEfficient
      ? `Parallel execution (${parallelDuration}ms) faster than sequential`
      : `Parallel: ${parallelDuration}ms, Sequential would be: ${(contactsResult._duration || 0) + (eventsResult._duration || 0)}ms`,
    duration: parallelDuration,
  });

  if (parallelEfficient) {
    logSuccess(`Parallel execution efficient: ${parallelDuration}ms`);
  } else {
    log(`Parallel execution: ${parallelDuration}ms (acceptable)`);
  }

  // Multi-source aggregation
  const multiSourcePassed = contactsResult.success && eventsResult.success;
  results.push({
    testName: 'Multi-source query validation',
    passed: multiSourcePassed,
    details: multiSourcePassed
      ? 'Both sources queried successfully'
      : 'One or more sources failed',
  });

  if (multiSourcePassed) {
    logSuccess('Multi-source query complete');
  } else {
    logError('Multi-source query failed');
  }

  return results;
}

// ============================================================================
// Test 5: Tool Result Chaining (Pass data between tools)
// ============================================================================

async function testToolResultChaining(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 5: Tool Result Chaining');

  // Get test data
  const testEmail = await prisma.email.findFirst({
    where: { tenantId },
    select: { id: true, from: true },
  });

  if (!testEmail) {
    log('No test email - skipping');
    results.push({
      testName: 'Tool result chaining',
      passed: true,
      details: 'Skipped - no test data',
    });
    return results;
  }

  // Chain: List emails → Extract sender → Search contacts by sender
  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);

  const listEmailsTool = emailTools.find((t) => t.name === 'list_emails');
  const searchContactsTool = contactsTools.find((t) => t.name === 'search_contacts');

  if (!listEmailsTool || !searchContactsTool) {
    logError('Required tools not found');
    results.push({
      testName: 'Tool result chaining',
      passed: false,
      details: 'Required tools not found',
    });
    return results;
  }

  // Step 1: List unread emails (list_emails supports: accounts, unread, content)
  const listResult = await executeTool(listEmailsTool, {
    mode: 'unread',
    limit: 1,
  });

  results.push({
    testName: 'Chain step 1 - list emails',
    passed: listResult.success && listResult.data?.length > 0,
    details: listResult.success
      ? `Listed ${listResult.data?.length} emails`
      : `Failed: ${listResult.error}`,
    duration: listResult._duration,
  });

  if (!listResult.success || !listResult.data?.length) {
    logError('List emails failed - cannot continue chain');
    return results;
  }
  logSuccess(`Step 1: Listed ${listResult.data.length} emails`);

  // Step 2: Extract sender from result
  const senderEmail = listResult.data[0]?.from;
  if (!senderEmail) {
    log('No sender in email - skipping contact search');
    results.push({
      testName: 'Chain step 2 - extract sender',
      passed: true,
      details: 'Skipped - no sender in email',
    });
    return results;
  }

  results.push({
    testName: 'Chain step 2 - extract sender',
    passed: true,
    details: `Extracted sender: ${senderEmail}`,
  });
  logSuccess(`Step 2: Extracted sender: ${senderEmail}`);

  // Step 3: Search contacts by sender email
  const contactResult = await executeTool(searchContactsTool, {
    query: senderEmail,
    limit: 1,
  });

  results.push({
    testName: 'Chain step 3 - search contacts',
    passed: contactResult.success,
    details: contactResult.success
      ? `Found ${contactResult.data?.length || 0} matching contacts`
      : `Failed: ${contactResult.error}`,
    duration: contactResult._duration,
  });

  if (contactResult.success) {
    logSuccess(`Step 3: Found ${contactResult.data?.length || 0} contacts`);
  } else {
    logError(`Step 3 failed: ${contactResult.error}`);
  }

  // Validate chain
  const chainComplete = listResult.success && contactResult.success;
  results.push({
    testName: 'Tool result chaining validation',
    passed: chainComplete,
    details: chainComplete
      ? 'Data successfully chained between tools'
      : 'Chain broken',
  });

  if (chainComplete) {
    logSuccess('Tool result chaining complete');
  } else {
    logError('Tool result chaining failed');
  }

  return results;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║            P5 Phase 6: AGENT CHAIN - PARANOID VALIDATION             ║');
  console.log('║                                                                      ║');
  console.log('║  Testing agent chain wiring and multi-step tool execution            ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const prisma = createPrismaClient();

  try {
    // Get a test tenant
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!tenant) {
      logError('No active tenant found. Cannot run chain tests.');
      process.exit(1);
    }

    log(`Using tenant: ${tenant.name} (${tenant.id})`);

    const allResults: TestResult[] = [];

    // Run all chain tests
    allResults.push(...(await testSupervisorSubAgents(prisma, tenant.id)));
    allResults.push(...(await testIntelligenceChain(prisma, tenant.id)));
    allResults.push(...(await testCrossAgentHandoff(prisma, tenant.id)));
    allResults.push(...(await testMultiSourceQuery(prisma, tenant.id)));
    allResults.push(...(await testToolResultChaining(prisma, tenant.id)));

    // ========================================================================
    // Summary
    // ========================================================================
    logSection('TEST SUMMARY');

    const passed = allResults.filter((r) => r.passed).length;
    const failed = allResults.filter((r) => !r.passed).length;
    const total = allResults.length;

    console.log('\n');
    console.log(`Total: ${passed}/${total} tests passed`);
    console.log('\n');

    if (failed > 0) {
      console.log('FAILED TESTS:');
      allResults
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.testName}: ${r.details}`);
        });
      console.log('\n');
    }

    if (failed === 0) {
      console.log('[PASS] All Agent Chain tests validated successfully!');
    } else {
      console.log(`[FAIL] ${failed} test(s) failed - agent chain wiring may be compromised!`);
    }

    process.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    logError(`Fatal error: ${error}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
