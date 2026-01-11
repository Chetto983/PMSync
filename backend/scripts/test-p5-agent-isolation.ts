/**
 * P5 Phase 5: Agent Isolation Test
 *
 * PARANOID VALIDATION of agent tool access control.
 * Verifies that each agent only has access to its designated tools.
 *
 * ActionsAgent (WRITE only):
 * - CAN call: manage_email, bulk_email_actions, manage_folder, manage_contact, manage_event
 * - CANNOT call: list_emails, search_emails, count_emails, list_folders, search_contacts, get_events, analyze_email, compose_reply, semantic_search_emails
 *
 * IntelligenceAgent (READ only):
 * - CAN call: list_emails, search_emails, count_emails, list_folders, search_contacts, manage_contact (get), get_events, manage_event (check_availability), analyze_email, compose_reply, semantic_search_emails
 * - CANNOT call: bulk_email_actions (and should NOT use manage_* for write actions)
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getMistralModel } from '../src/modules/ai/voltagent/providers/mistral.provider';
import { createActionsAgent, createIntelligenceAgent } from '../src/modules/ai/voltagent/agents';

// ============================================================================
// Mock Cache Service (like other P5 tests)
// ============================================================================
const mockCacheService = {
  isHealthy: () => true,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  getClient: () => null,
};

// ============================================================================
// Configuration
// ============================================================================

const TEST_CONFIG = {
  locale: 'en' as const,
};

// Tool lists for validation
const ACTIONS_ALLOWED_TOOLS = [
  'manage_email',
  'bulk_email_actions',
  'manage_folder',
  'manage_contact',
  'manage_event',
];

const ACTIONS_FORBIDDEN_TOOLS = [
  'list_emails',
  'search_emails',
  'count_emails',
  'list_folders',
  'search_contacts',
  'get_events',
  'analyze_email',
  'compose_reply',
  'semantic_search_emails',
];

// NOTE: semantic_search_emails is only available when embeddingsService is provided
// Without embeddingsService, IntelligenceAgent has 10 tools
const INTELLIGENCE_ALLOWED_TOOLS = [
  'list_emails',
  'search_emails',
  'count_emails',
  'list_folders',
  'search_contacts',
  'manage_contact', // for 'get' only
  'get_events',
  'manage_event', // for 'check_availability' only
  'analyze_email',
  'compose_reply',
  // 'semantic_search_emails', // Only available with embeddingsService
];

// Tool that requires embeddingsService
const INTELLIGENCE_OPTIONAL_TOOLS = ['semantic_search_emails'];

const INTELLIGENCE_FORBIDDEN_TOOLS = ['bulk_email_actions'];

// ============================================================================
// Test Types
// ============================================================================

interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
  agentTools?: string[];
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
// Test Implementation
// ============================================================================

async function testActionsAgentIsolation(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
  cacheService: typeof mockCacheService,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test ActionsAgent Tool Isolation');

  // Create ActionsAgent
  const model = getMistralModel();
  const agent = createActionsAgent({
    model,
    prisma: prisma as any,
    emailSendService: null,
    calendarService: null,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });

  // Get actual tools from agent
  const agentTools = agent.getToolsForApi().map((t) => t.name);
  log(`ActionsAgent has ${agentTools.length} tools: ${agentTools.join(', ')}`);

  // Test 1: Verify allowed tools are present
  for (const toolName of ACTIONS_ALLOWED_TOOLS) {
    const hasAccess = agentTools.includes(toolName);
    results.push({
      testName: `ActionsAgent HAS ${toolName}`,
      passed: hasAccess,
      details: hasAccess
        ? `Tool ${toolName} is correctly available`
        : `MISSING: Tool ${toolName} should be available`,
      agentTools,
    });

    if (hasAccess) {
      logSuccess(`ActionsAgent HAS ${toolName}`);
    } else {
      logError(`ActionsAgent MISSING ${toolName}`);
    }
  }

  // Test 2: Verify forbidden tools are NOT present
  for (const toolName of ACTIONS_FORBIDDEN_TOOLS) {
    const hasAccess = agentTools.includes(toolName);
    results.push({
      testName: `ActionsAgent BLOCKED ${toolName}`,
      passed: !hasAccess,
      details: !hasAccess
        ? `Tool ${toolName} is correctly blocked`
        : `VIOLATION: Tool ${toolName} should NOT be available`,
      agentTools,
    });

    if (!hasAccess) {
      logSuccess(`ActionsAgent BLOCKED ${toolName}`);
    } else {
      logError(`ActionsAgent VIOLATION: has ${toolName}`);
    }
  }

  return results;
}

async function testIntelligenceAgentIsolation(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
  cacheService: typeof mockCacheService,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test IntelligenceAgent Tool Isolation');

  // Create mock mistral service for insights tools
  const mockMistral = {
    completePrompt: async () => 'mock response',
  } as any;

  // Create IntelligenceAgent
  const model = getMistralModel();
  const agent = createIntelligenceAgent({
    model,
    prisma: prisma as any,
    mistral: mockMistral,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });

  // Get actual tools from agent
  const agentTools = agent.getToolsForApi().map((t) => t.name);
  log(`IntelligenceAgent has ${agentTools.length} tools: ${agentTools.join(', ')}`);

  // Test 1: Verify allowed tools are present
  for (const toolName of INTELLIGENCE_ALLOWED_TOOLS) {
    const hasAccess = agentTools.includes(toolName);
    results.push({
      testName: `IntelligenceAgent HAS ${toolName}`,
      passed: hasAccess,
      details: hasAccess
        ? `Tool ${toolName} is correctly available`
        : `MISSING: Tool ${toolName} should be available`,
      agentTools,
    });

    if (hasAccess) {
      logSuccess(`IntelligenceAgent HAS ${toolName}`);
    } else {
      logError(`IntelligenceAgent MISSING ${toolName}`);
    }
  }

  // Test 2: Verify forbidden tools are NOT present
  for (const toolName of INTELLIGENCE_FORBIDDEN_TOOLS) {
    const hasAccess = agentTools.includes(toolName);
    results.push({
      testName: `IntelligenceAgent BLOCKED ${toolName}`,
      passed: !hasAccess,
      details: !hasAccess
        ? `Tool ${toolName} is correctly blocked`
        : `VIOLATION: Tool ${toolName} should NOT be available`,
      agentTools,
    });

    if (!hasAccess) {
      logSuccess(`IntelligenceAgent BLOCKED ${toolName}`);
    } else {
      logError(`IntelligenceAgent VIOLATION: has ${toolName}`);
    }
  }

  // Test 3: Check optional tools (expected missing without embeddingsService)
  for (const toolName of INTELLIGENCE_OPTIONAL_TOOLS) {
    const hasAccess = agentTools.includes(toolName);
    // Pass regardless - just informational
    results.push({
      testName: `IntelligenceAgent OPTIONAL ${toolName}`,
      passed: true, // Always pass - this is informational
      details: hasAccess
        ? `Optional tool ${toolName} is available (embeddingsService provided)`
        : `Optional tool ${toolName} not available (requires embeddingsService)`,
      agentTools,
    });

    if (hasAccess) {
      logSuccess(`IntelligenceAgent OPTIONAL ${toolName} (available)`);
    } else {
      log(`IntelligenceAgent OPTIONAL ${toolName} (requires embeddingsService - OK)`);
    }
  }

  return results;
}

async function testToolOverlap(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
  cacheService: typeof mockCacheService,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test Tool Overlap (manage_contact, manage_event)');

  // These tools are in BOTH agents but with different intended actions
  // ActionsAgent: manage_contact (create, update, delete), manage_event (create, update, delete)
  // IntelligenceAgent: manage_contact (get only), manage_event (check_availability only)

  const model = getMistralModel();

  // Get ActionsAgent tools
  const actionsAgent = createActionsAgent({
    model,
    prisma: prisma as any,
    emailSendService: null,
    calendarService: null,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const actionsTools = actionsAgent.getToolsForApi().map((t) => t.name);

  // Get IntelligenceAgent tools
  const mockMistral = { completePrompt: async () => 'mock' } as any;
  const intelligenceAgent = createIntelligenceAgent({
    model,
    prisma: prisma as any,
    mistral: mockMistral,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const intelligenceTools = intelligenceAgent.getToolsForApi().map((t) => t.name);

  // Verify manage_contact overlap
  const actionsHasManageContact = actionsTools.includes('manage_contact');
  const intelligenceHasManageContact = intelligenceTools.includes('manage_contact');

  results.push({
    testName: 'manage_contact accessible by both agents',
    passed: actionsHasManageContact && intelligenceHasManageContact,
    details:
      actionsHasManageContact && intelligenceHasManageContact
        ? 'Both agents have manage_contact (with different allowed actions)'
        : `Actions: ${actionsHasManageContact}, Intelligence: ${intelligenceHasManageContact}`,
  });

  if (actionsHasManageContact && intelligenceHasManageContact) {
    logSuccess('manage_contact accessible by both agents (different actions)');
  } else {
    logError('manage_contact overlap issue');
  }

  // Verify manage_event overlap
  const actionsHasManageEvent = actionsTools.includes('manage_event');
  const intelligenceHasManageEvent = intelligenceTools.includes('manage_event');

  results.push({
    testName: 'manage_event accessible by both agents',
    passed: actionsHasManageEvent && intelligenceHasManageEvent,
    details:
      actionsHasManageEvent && intelligenceHasManageEvent
        ? 'Both agents have manage_event (with different allowed actions)'
        : `Actions: ${actionsHasManageEvent}, Intelligence: ${intelligenceHasManageEvent}`,
  });

  if (actionsHasManageEvent && intelligenceHasManageEvent) {
    logSuccess('manage_event accessible by both agents (different actions)');
  } else {
    logError('manage_event overlap issue');
  }

  return results;
}

async function testExclusiveTools(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
  cacheService: typeof mockCacheService,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test Exclusive Tool Access');

  const model = getMistralModel();

  // Get ActionsAgent tools
  const actionsAgent = createActionsAgent({
    model,
    prisma: prisma as any,
    emailSendService: null,
    calendarService: null,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const actionsTools = new Set(actionsAgent.getToolsForApi().map((t) => t.name));

  // Get IntelligenceAgent tools
  const mockMistral = { completePrompt: async () => 'mock' } as any;
  const intelligenceAgent = createIntelligenceAgent({
    model,
    prisma: prisma as any,
    mistral: mockMistral,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const intelligenceTools = new Set(intelligenceAgent.getToolsForApi().map((t) => t.name));

  // Test: bulk_email_actions is EXCLUSIVE to ActionsAgent
  const bulkOnlyInActions = actionsTools.has('bulk_email_actions') && !intelligenceTools.has('bulk_email_actions');
  results.push({
    testName: 'bulk_email_actions EXCLUSIVE to ActionsAgent',
    passed: bulkOnlyInActions,
    details: bulkOnlyInActions
      ? 'bulk_email_actions correctly exclusive to ActionsAgent'
      : `Actions: ${actionsTools.has('bulk_email_actions')}, Intelligence: ${intelligenceTools.has('bulk_email_actions')}`,
  });

  if (bulkOnlyInActions) {
    logSuccess('bulk_email_actions EXCLUSIVE to ActionsAgent');
  } else {
    logError('bulk_email_actions exclusivity violation');
  }

  // Test: list_emails is EXCLUSIVE to IntelligenceAgent
  const listOnlyInIntelligence = intelligenceTools.has('list_emails') && !actionsTools.has('list_emails');
  results.push({
    testName: 'list_emails EXCLUSIVE to IntelligenceAgent',
    passed: listOnlyInIntelligence,
    details: listOnlyInIntelligence
      ? 'list_emails correctly exclusive to IntelligenceAgent'
      : `Actions: ${actionsTools.has('list_emails')}, Intelligence: ${intelligenceTools.has('list_emails')}`,
  });

  if (listOnlyInIntelligence) {
    logSuccess('list_emails EXCLUSIVE to IntelligenceAgent');
  } else {
    logError('list_emails exclusivity violation');
  }

  // Test: search_emails is EXCLUSIVE to IntelligenceAgent
  const searchOnlyInIntelligence = intelligenceTools.has('search_emails') && !actionsTools.has('search_emails');
  results.push({
    testName: 'search_emails EXCLUSIVE to IntelligenceAgent',
    passed: searchOnlyInIntelligence,
    details: searchOnlyInIntelligence
      ? 'search_emails correctly exclusive to IntelligenceAgent'
      : `Actions: ${actionsTools.has('search_emails')}, Intelligence: ${intelligenceTools.has('search_emails')}`,
  });

  if (searchOnlyInIntelligence) {
    logSuccess('search_emails EXCLUSIVE to IntelligenceAgent');
  } else {
    logError('search_emails exclusivity violation');
  }

  // Test: analyze_email is EXCLUSIVE to IntelligenceAgent
  const analyzeOnlyInIntelligence = intelligenceTools.has('analyze_email') && !actionsTools.has('analyze_email');
  results.push({
    testName: 'analyze_email EXCLUSIVE to IntelligenceAgent',
    passed: analyzeOnlyInIntelligence,
    details: analyzeOnlyInIntelligence
      ? 'analyze_email correctly exclusive to IntelligenceAgent'
      : `Actions: ${actionsTools.has('analyze_email')}, Intelligence: ${intelligenceTools.has('analyze_email')}`,
  });

  if (analyzeOnlyInIntelligence) {
    logSuccess('analyze_email EXCLUSIVE to IntelligenceAgent');
  } else {
    logError('analyze_email exclusivity violation');
  }

  return results;
}

async function testAgentToolCounts(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
  cacheService: typeof mockCacheService,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test Agent Tool Counts');

  const model = getMistralModel();

  // Get ActionsAgent tools
  const actionsAgent = createActionsAgent({
    model,
    prisma: prisma as any,
    emailSendService: null,
    calendarService: null,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const actionsToolCount = actionsAgent.getToolsForApi().length;

  // Get IntelligenceAgent tools
  const mockMistral = { completePrompt: async () => 'mock' } as any;
  const intelligenceAgent = createIntelligenceAgent({
    model,
    prisma: prisma as any,
    mistral: mockMistral,
    cacheService: cacheService as any,
    locale: TEST_CONFIG.locale,
    tenantId,
  });
  const intelligenceToolCount = intelligenceAgent.getToolsForApi().length;

  // Test: ActionsAgent should have exactly 5 tools
  const actionsCorrectCount = actionsToolCount === ACTIONS_ALLOWED_TOOLS.length;
  results.push({
    testName: `ActionsAgent tool count = ${ACTIONS_ALLOWED_TOOLS.length}`,
    passed: actionsCorrectCount,
    details: actionsCorrectCount
      ? `Correct: ${actionsToolCount} tools`
      : `MISMATCH: Expected ${ACTIONS_ALLOWED_TOOLS.length}, got ${actionsToolCount}`,
  });

  if (actionsCorrectCount) {
    logSuccess(`ActionsAgent has ${actionsToolCount} tools (correct)`);
  } else {
    logError(`ActionsAgent has ${actionsToolCount} tools (expected ${ACTIONS_ALLOWED_TOOLS.length})`);
  }

  // Test: IntelligenceAgent should have expected tool count
  const intelligenceCorrectCount = intelligenceToolCount === INTELLIGENCE_ALLOWED_TOOLS.length;
  results.push({
    testName: `IntelligenceAgent tool count = ${INTELLIGENCE_ALLOWED_TOOLS.length}`,
    passed: intelligenceCorrectCount,
    details: intelligenceCorrectCount
      ? `Correct: ${intelligenceToolCount} tools`
      : `MISMATCH: Expected ${INTELLIGENCE_ALLOWED_TOOLS.length}, got ${intelligenceToolCount}`,
  });

  if (intelligenceCorrectCount) {
    logSuccess(`IntelligenceAgent has ${intelligenceToolCount} tools (correct)`);
  } else {
    logError(`IntelligenceAgent has ${intelligenceToolCount} tools (expected ${INTELLIGENCE_ALLOWED_TOOLS.length})`);
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
  console.log('║          P5 Phase 5: AGENT ISOLATION - PARANOID VALIDATION           ║');
  console.log('║                                                                      ║');
  console.log('║  Verifying agent tool access control is correctly enforced           ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const prisma = createPrismaClient();
  const cacheService = mockCacheService;

  try {
    // Get a test tenant
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!tenant) {
      logError('No active tenant found. Cannot run isolation tests.');
      process.exit(1);
    }

    log(`Using tenant: ${tenant.name} (${tenant.id})`);

    const allResults: TestResult[] = [];

    // Run all isolation tests
    allResults.push(...(await testActionsAgentIsolation(prisma, tenant.id, cacheService)));
    allResults.push(...(await testIntelligenceAgentIsolation(prisma, tenant.id, cacheService)));
    allResults.push(...(await testToolOverlap(prisma, tenant.id, cacheService)));
    allResults.push(...(await testExclusiveTools(prisma, tenant.id, cacheService)));
    allResults.push(...(await testAgentToolCounts(prisma, tenant.id, cacheService)));

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
      console.log('[PASS] All Agent Isolation tests validated successfully!');
    } else {
      console.log(`[FAIL] ${failed} test(s) failed - agent isolation may be compromised!`);
    }

    process.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    logError(`Fatal error: ${error}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    // Mock cache service doesn't need disconnect
  }
}

main();
