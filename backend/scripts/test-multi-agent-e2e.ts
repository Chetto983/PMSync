#!/usr/bin/env ts-node
/**
 * Multi-Agent System E2E Test Script
 *
 * Tests the complete multi-agent system with a real tenant:
 * - Intent classification (RouterAgent)
 * - Language handling (Italian & English)
 * - All specialized agents (Email, Calendar, Contacts, General)
 * - Tool calls and data retrieval
 *
 * Usage: npx ts-node scripts/test-multi-agent-e2e.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { ConfigService } from '@nestjs/config';
import { RouterAgent } from '../src/modules/ai/multi-agent/agents/router.agent';
import { GeneralAgent } from '../src/modules/ai/multi-agent/agents/general.agent';
import { EmailAgent } from '../src/modules/ai/multi-agent/agents/email.agent';
import { CalendarAgent } from '../src/modules/ai/multi-agent/agents/calendar.agent';
import { ContactsAgent } from '../src/modules/ai/multi-agent/agents/contacts.agent';
import { AgentContext, AgentIntent } from '../src/modules/ai/multi-agent/interfaces/agent-context.interface';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const TEST_USER_ID = 'test-e2e-user';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(80));
}

function logTest(name: string) {
  console.log(`\n${colors.blue}[TEST]${colors.reset} ${name}`);
}

function logResult(passed: boolean, details: string) {
  const icon = passed ? `${colors.green}✓` : `${colors.red}✗`;
  console.log(`  ${icon} ${details}${colors.reset}`);
}

// =============================================================================
// TEST RESULTS TRACKING
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  language: string;
  agent: string;
  latencyMs: number;
  response?: string;
  error?: string;
}

const results: TestResult[] = [];

// =============================================================================
// MOCK CONFIG SERVICE
// =============================================================================

const mockConfigService = {
  get: (key: string) => {
    const config: Record<string, string | undefined> = {
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL || 'mistral-small-latest',
      DATABASE_URL: process.env.DATABASE_URL,
    };
    return config[key];
  },
} as unknown as ConfigService;

// =============================================================================
// CONTEXT FACTORY
// =============================================================================

function createContext(
  userMessage: string,
  language: string,
  overrides: Partial<AgentContext> = {},
): AgentContext {
  return {
    tenantId: TENANT_ID,
    userId: TEST_USER_ID,
    userMessage,
    preferences: { language },
    enrichedContext: {
      relevantEmails: [],
      relevantEvents: [],
      relevantContacts: [],
    },
    ...overrides,
  };
}

// =============================================================================
// TEST CASES
// =============================================================================

interface TestCase {
  name: string;
  language: 'en' | 'it';
  message: string;
  expectedIntent?: AgentIntent;
  agent: 'router' | 'general' | 'email' | 'calendar' | 'contacts';
  validateResponse?: (response: string) => boolean;
}

const testCases: TestCase[] = [
  // ===== ENGLISH TESTS =====
  {
    name: 'English Greeting',
    language: 'en',
    message: 'Hello! What can you do for me?',
    expectedIntent: AgentIntent.GENERAL,
    agent: 'general',
    validateResponse: (r) => /email|calendar|contact|help/i.test(r),
  },
  {
    name: 'English Email Request',
    language: 'en',
    message: 'I need to send an email to my colleague about the project update',
    expectedIntent: AgentIntent.EMAIL,
    agent: 'email',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'English Calendar Request',
    language: 'en',
    message: 'Schedule a meeting for tomorrow at 2pm with the team',
    expectedIntent: AgentIntent.CALENDAR,
    agent: 'calendar',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'English Contacts Request',
    language: 'en',
    message: 'Find all contacts from the sales department',
    expectedIntent: AgentIntent.CONTACTS,
    agent: 'contacts',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'English Capability Question',
    language: 'en',
    message: 'What are all the things you can help me with?',
    expectedIntent: AgentIntent.GENERAL,
    agent: 'general',
    validateResponse: (r) => /email|calendar|contact/i.test(r),
  },

  // ===== ITALIAN TESTS =====
  {
    name: 'Italian Greeting',
    language: 'it',
    message: 'Ciao! Cosa puoi fare per me?',
    expectedIntent: AgentIntent.GENERAL,
    agent: 'general',
    validateResponse: (r) => /email|calendario|contatt|aiut/i.test(r),
  },
  {
    name: 'Italian Email Request',
    language: 'it',
    message: 'Devo inviare una email al mio collega riguardo all\'aggiornamento del progetto',
    expectedIntent: AgentIntent.EMAIL,
    agent: 'email',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'Italian Calendar Request',
    language: 'it',
    message: 'Programma una riunione per domani alle 14:00 con il team',
    expectedIntent: AgentIntent.CALENDAR,
    agent: 'calendar',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'Italian Contacts Request',
    language: 'it',
    message: 'Trova tutti i contatti del reparto vendite',
    expectedIntent: AgentIntent.CONTACTS,
    agent: 'contacts',
    validateResponse: (r) => r.length > 20,
  },
  {
    name: 'Italian Capability Question',
    language: 'it',
    message: 'Quali sono tutte le cose con cui puoi aiutarmi?',
    expectedIntent: AgentIntent.GENERAL,
    agent: 'general',
    validateResponse: (r) => /email|calendario|contatt/i.test(r),
  },

  // ===== SPECIFIC TOOL TESTS =====
  {
    name: 'Email Search (English)',
    language: 'en',
    message: 'Show me all unread emails from last week',
    expectedIntent: AgentIntent.EMAIL,
    agent: 'email',
    validateResponse: (r) => r.length > 10,
  },
  {
    name: 'Email Search (Italian)',
    language: 'it',
    message: 'Mostrami tutte le email non lette della settimana scorsa',
    expectedIntent: AgentIntent.EMAIL,
    agent: 'email',
    validateResponse: (r) => r.length > 10,
  },
  {
    name: 'Calendar Check (English)',
    language: 'en',
    message: 'What meetings do I have today?',
    expectedIntent: AgentIntent.CALENDAR,
    agent: 'calendar',
    validateResponse: (r) => r.length > 10,
  },
  {
    name: 'Calendar Check (Italian)',
    language: 'it',
    message: 'Quali riunioni ho oggi?',
    expectedIntent: AgentIntent.CALENDAR,
    agent: 'calendar',
    validateResponse: (r) => r.length > 10,
  },
];

// =============================================================================
// TEST RUNNERS
// =============================================================================

async function testRouterAgent(
  routerAgent: RouterAgent,
  testCase: TestCase,
): Promise<TestResult> {
  const startTime = Date.now();
  const context = createContext(testCase.message, testCase.language);

  try {
    const result = await routerAgent.classifyIntent(context);
    const latency = Date.now() - startTime;

    const passed = testCase.expectedIntent
      ? result.intent === testCase.expectedIntent
      : true;

    return {
      name: `${testCase.name} - Intent Classification`,
      passed,
      language: testCase.language,
      agent: 'RouterAgent',
      latencyMs: latency,
      response: `Intent: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`,
      error: passed ? undefined : `Expected ${testCase.expectedIntent}, got ${result.intent}`,
    };
  } catch (error) {
    return {
      name: `${testCase.name} - Intent Classification`,
      passed: false,
      language: testCase.language,
      agent: 'RouterAgent',
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testAgent(
  agent: GeneralAgent | EmailAgent | CalendarAgent | ContactsAgent,
  testCase: TestCase,
): Promise<TestResult> {
  const startTime = Date.now();
  const context = createContext(testCase.message, testCase.language);

  try {
    const result = await agent.process(context);
    const latency = Date.now() - startTime;

    const response = result.messages.join(' ');
    const validationPassed = testCase.validateResponse
      ? testCase.validateResponse(response)
      : response.length > 0;

    return {
      name: testCase.name,
      passed: validationPassed && result.messages.length > 0,
      language: testCase.language,
      agent: agent.name,
      latencyMs: latency,
      response: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
      error: validationPassed ? undefined : 'Response validation failed',
    };
  } catch (error) {
    return {
      name: testCase.name,
      passed: false,
      language: testCase.language,
      agent: agent.name,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// MAIN TEST EXECUTION
// =============================================================================

async function runTests() {
  log('\n' + '█'.repeat(80), colors.magenta);
  log('  MULTI-AGENT E2E TEST SUITE', colors.bright + colors.magenta);
  log('  Tenant: ' + TENANT_ID, colors.magenta);
  log('█'.repeat(80), colors.magenta);

  // Check API key
  if (!process.env.MISTRAL_API_KEY) {
    log('\n✗ MISTRAL_API_KEY not set in .env file', colors.red);
    process.exit(1);
  }
  log('\n✓ MISTRAL_API_KEY found', colors.green);

  // Initialize agents
  logSection('INITIALIZING AGENTS');

  const routerAgent = new RouterAgent(mockConfigService);
  const generalAgent = new GeneralAgent(mockConfigService);
  const emailAgent = new EmailAgent(mockConfigService);
  const calendarAgent = new CalendarAgent(mockConfigService);
  const contactsAgent = new ContactsAgent(mockConfigService);

  log('✓ All agents initialized', colors.green);

  // Verify database connection (optional - skip if Prisma not available)
  logSection('DATABASE CONNECTION');
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: TENANT_ID },
      });
      if (tenant) {
        log(`✓ Tenant found: ${tenant.name}`, colors.green);
      } else {
        log(`⚠ Tenant ${TENANT_ID} not found in database`, colors.yellow);
      }
    } catch (error) {
      log(`⚠ Could not verify tenant: ${error}`, colors.yellow);
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    log('⚠ Prisma client not available - skipping DB verification', colors.yellow);
    log('  (Run "npx prisma generate" to enable DB checks)', colors.yellow);
  }

  // Run intent classification tests
  logSection('INTENT CLASSIFICATION TESTS');

  for (const testCase of testCases) {
    logTest(`${testCase.name} [${testCase.language.toUpperCase()}]`);
    const result = await testRouterAgent(routerAgent, testCase);
    results.push(result);
    logResult(result.passed, `${result.response} (${result.latencyMs}ms)`);
    if (result.error) {
      log(`    Error: ${result.error}`, colors.red);
    }
  }

  // Run agent response tests
  logSection('AGENT RESPONSE TESTS');

  for (const testCase of testCases) {
    logTest(`${testCase.name} [${testCase.language.toUpperCase()}]`);

    let agent: GeneralAgent | EmailAgent | CalendarAgent | ContactsAgent;
    switch (testCase.agent) {
      case 'general':
        agent = generalAgent;
        break;
      case 'email':
        agent = emailAgent;
        break;
      case 'calendar':
        agent = calendarAgent;
        break;
      case 'contacts':
        agent = contactsAgent;
        break;
      default:
        continue;
    }

    const result = await testAgent(agent, testCase);
    results.push(result);

    logResult(result.passed, `${result.agent} responded in ${result.latencyMs}ms`);
    if (result.response) {
      log(`    Response: "${result.response}"`, colors.cyan);
    }
    if (result.error) {
      log(`    Error: ${result.error}`, colors.red);
    }
  }

  // Generate summary report
  logSection('TEST SUMMARY REPORT');

  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;

  // Group by language
  const enResults = results.filter((r) => r.language === 'en');
  const itResults = results.filter((r) => r.language === 'it');

  const enPassed = enResults.filter((r) => r.passed).length;
  const itPassed = itResults.filter((r) => r.passed).length;

  console.log('\n  Language Breakdown:');
  log(`    English: ${enPassed}/${enResults.length} (${((enPassed / enResults.length) * 100).toFixed(1)}%)`, enPassed === enResults.length ? colors.green : colors.yellow);
  log(`    Italian: ${itPassed}/${itResults.length} (${((itPassed / itResults.length) * 100).toFixed(1)}%)`, itPassed === itResults.length ? colors.green : colors.yellow);

  // Group by agent
  console.log('\n  Agent Breakdown:');
  const agentGroups = ['RouterAgent', 'GeneralAgent', 'EmailAgent', 'CalendarAgent', 'ContactsAgent'];
  for (const agentName of agentGroups) {
    const agentResults = results.filter((r) => r.agent === agentName);
    if (agentResults.length > 0) {
      const agentPassed = agentResults.filter((r) => r.passed).length;
      const avgLatency = agentResults.reduce((sum, r) => sum + r.latencyMs, 0) / agentResults.length;
      log(
        `    ${agentName}: ${agentPassed}/${agentResults.length} passed (avg ${avgLatency.toFixed(0)}ms)`,
        agentPassed === agentResults.length ? colors.green : colors.yellow,
      );
    }
  }

  // Overall summary
  console.log('\n' + '-'.repeat(60));
  const passRate = (passedTests / totalTests) * 100;
  log(
    `  OVERALL: ${passedTests}/${totalTests} tests passed (${passRate.toFixed(1)}%)`,
    passRate >= 90 ? colors.green : passRate >= 70 ? colors.yellow : colors.red,
  );
  console.log('-'.repeat(60));

  // List failed tests
  if (failedTests > 0) {
    console.log('\n  Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        log(`    ✗ ${r.name} [${r.language}] - ${r.error}`, colors.red);
      });
  }

  console.log('\n');
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
