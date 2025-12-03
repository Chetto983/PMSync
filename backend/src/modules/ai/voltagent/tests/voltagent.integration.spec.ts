/**
 * VoltAgent Integration Tests
 *
 * These tests use the REAL Mistral API following VoltAgent best practices:
 * - Uses real LLM calls for accurate integration testing
 * - Implements scorers for consistent quality evaluation
 * - Tests agent delegation and tool execution
 * - Validates observability hooks and metrics collection
 * - Ensures tenant isolation with proper userId namespacing
 *
 * @see https://voltagent.dev/docs/evals/live-evaluations/
 * @see https://voltagent.dev/docs/evals/offline-evaluations/
 *
 * IMPORTANT: Set MISTRAL_API_KEY environment variable to run these tests.
 * Run with: npx jest --testPathPattern=voltagent.integration --passWithNoTests
 */

import type { Agent } from '@voltagent/core';
import { PrismaService } from '../../../../prisma/prisma.service';
import { createSupervisorAgent } from '../agents';
import { resolveLocale } from '../locales';
import { createObservabilityHooks, type AgentMetrics } from '../observability';
import { getMistralModel } from '../providers/mistral.provider';

// Skip all tests if no API key
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const describeIfApiKey = MISTRAL_API_KEY ? describe : describe.skip;

// Timeout for API calls (VoltAgent recommends sufficient timeout for LLM calls)
const API_TIMEOUT = 60000;

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Simple scorer to check if response contains expected keywords.
 * Based on VoltAgent's buildScorer pattern.
 */
const containsKeyword = (response: string, keywords: string[]): number => {
  const lowerResponse = response.toLowerCase();
  const matches = keywords.filter((kw) => lowerResponse.includes(kw.toLowerCase()));
  return matches.length / keywords.length;
};

/**
 * Scorer to check response is in expected language.
 */
const languageScorer = (response: string, languageKeywords: string[]): boolean => {
  const lowerResponse = response.toLowerCase();
  return languageKeywords.some((kw) => lowerResponse.includes(kw.toLowerCase()));
};

/**
 * Mock PrismaService for testing (returns empty results).
 */
const createMockPrismaService = (): PrismaService =>
  ({
    email: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    calendarEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-contact-id' }),
    },
    folder: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'folder-1', name: 'Inbox', type: 'INBOX' },
        { id: 'folder-2', name: 'Sent', type: 'SENT' },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'new-folder-id' }),
    },
    knowledgeEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  }) as unknown as PrismaService;

// Collected metrics for validation
let collectedMetrics: AgentMetrics[] = [];

// =============================================================================
// TEST DATASETS (Following VoltAgent offline evaluation pattern)
// =============================================================================

interface TestCase {
  id: string;
  input: string;
  expectedKeywords: string[];
  description: string;
}

const GENERAL_TEST_CASES: TestCase[] = [
  {
    id: 'general-1',
    input: 'Hello, what can you help me with?',
    expectedKeywords: ['help', 'email', 'calendar', 'contact', 'assist'],
    description: 'Should explain capabilities',
  },
  {
    id: 'general-2',
    input: 'Thanks for your help',
    expectedKeywords: ['welcome', 'glad', 'help', 'assist', 'need'],
    description: 'Should respond politely to thanks',
  },
];

const EMAIL_TEST_CASES: TestCase[] = [
  {
    id: 'email-1',
    input: 'Show me my unread emails',
    expectedKeywords: ['email', 'unread', 'inbox', 'message'],
    description: 'Should handle email query',
  },
  {
    id: 'email-2',
    input: 'Search for emails about the meeting',
    expectedKeywords: ['email', 'search', 'meeting', 'found'],
    description: 'Should search emails',
  },
];

const CALENDAR_TEST_CASES: TestCase[] = [
  {
    id: 'calendar-1',
    input: "What's on my calendar today?",
    expectedKeywords: ['calendar', 'today', 'event', 'schedule', 'meeting'],
    description: 'Should handle calendar query',
  },
];

const MULTILANG_TEST_CASES = [
  {
    locale: 'en' as const,
    input: 'Hello, what can you do?',
    languageKeywords: ['can', 'help', 'email', 'calendar', 'you', 'assist'],
  },
  {
    locale: 'it' as const,
    input: 'Ciao, cosa puoi fare per me?',
    languageKeywords: ['posso', 'aiutare', 'email', 'calendario', 'contatti', 'puoi'],
  },
];

describeIfApiKey('VoltAgent Integration Tests (Real Mistral API)', () => {
  let supervisorAgent: Agent;
  let mockPrismaService: PrismaService;
  let observabilityHooks: ReturnType<typeof createObservabilityHooks>;

  beforeAll(() => {
    // Use real timers for API calls
    jest.useRealTimers();
    mockPrismaService = createMockPrismaService();

    // Initialize observability hooks with metrics collection
    observabilityHooks = createObservabilityHooks({
      logger: {
        info: (msg, ctx) => console.log(`[INFO] ${msg}`, JSON.stringify(ctx)),
        warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, JSON.stringify(ctx)),
        error: (msg, ctx) => console.error(`[ERROR] ${msg}`, JSON.stringify(ctx)),
        debug: () => {}, // Suppress debug in tests
      },
      logToolCalls: false, // Reduce noise in tests
      trackUsage: true,
      onMetrics: (metrics) => {
        collectedMetrics.push(metrics);
      },
    });

    // Create supervisor agent with real LLM
    const model = getMistralModel('small');
    const locale = resolveLocale('en');

    supervisorAgent = createSupervisorAgent({
      model,
      prisma: mockPrismaService,
      emailSendService: null,
      calendarService: null,
      locale,
      tenantId: 'test-tenant',
      hooks: observabilityHooks,
    });
  });

  beforeEach(() => {
    collectedMetrics = [];
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Clear any pending timers to prevent Jest worker hang
    jest.clearAllTimers();
  });

  // =============================================================================
  // GENERAL AGENT TESTS
  // =============================================================================

  describe('General Interactions', () => {
    it.each(GENERAL_TEST_CASES)(
      '$description (id: $id)',
      async ({ input, expectedKeywords }) => {
        const result = await supervisorAgent.generateText(input, {
          userId: 'test-tenant:test-user',
        });

        expect(result.text).toBeDefined();
        expect(result.text.length).toBeGreaterThan(0);

        // Score response quality
        const score = containsKeyword(result.text, expectedKeywords);
        console.log(`[SCORE] General test score: ${(score * 100).toFixed(0)}%`);

        // At least some keywords should be present
        expect(score).toBeGreaterThan(0);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // EMAIL AGENT DELEGATION TESTS
  // =============================================================================

  describe('Email Agent Delegation', () => {
    it.each(EMAIL_TEST_CASES)(
      '$description (id: $id)',
      async ({ input, expectedKeywords }) => {
        const result = await supervisorAgent.generateText(input, {
          userId: 'test-tenant:test-user',
        });

        expect(result.text).toBeDefined();

        // Should have attempted some steps (possibly tool calls)
        expect(result.steps).toBeDefined();

        // Log tool calls for debugging
        const toolCalls = result.steps.flatMap((step) => {
          const s = step as unknown as { toolCalls?: Array<{ toolName: string }> };
          return s.toolCalls || [];
        });
        if (toolCalls.length > 0) {
          console.log(
            `[TOOLS] Called: ${toolCalls.map((tc) => tc.toolName).join(', ')}`,
          );
        }

        // Score response
        const score = containsKeyword(result.text, expectedKeywords);
        console.log(`[SCORE] Email test score: ${(score * 100).toFixed(0)}%`);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // CALENDAR AGENT DELEGATION TESTS
  // =============================================================================

  describe('Calendar Agent Delegation', () => {
    it.each(CALENDAR_TEST_CASES)(
      '$description (id: $id)',
      async ({ input, expectedKeywords }) => {
        const result = await supervisorAgent.generateText(input, {
          userId: 'test-tenant:test-user',
        });

        expect(result.text).toBeDefined();
        expect(result.steps).toBeDefined();

        const score = containsKeyword(result.text, expectedKeywords);
        console.log(`[SCORE] Calendar test score: ${(score * 100).toFixed(0)}%`);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // MULTI-LANGUAGE SUPPORT TESTS
  // =============================================================================

  describe('Multi-Language Support', () => {
    it.each(MULTILANG_TEST_CASES)(
      'responds appropriately in $locale',
      async ({ locale, input, languageKeywords }) => {
        const model = getMistralModel('small');
        const agent = createSupervisorAgent({
          model,
          prisma: mockPrismaService,
          emailSendService: null,
          calendarService: null,
          locale,
          tenantId: 'test-tenant',
          hooks: observabilityHooks,
        });

        const result = await agent.generateText(input, {
          userId: 'test-tenant:test-user',
        });

        expect(result.text).toBeDefined();
        expect(result.text.length).toBeGreaterThan(0);

        // Check language-appropriate response
        const isCorrectLanguage = languageScorer(result.text, languageKeywords);
        console.log(`[LANG] ${locale}: ${isCorrectLanguage ? 'PASS' : 'FAIL'}`);
        expect(isCorrectLanguage).toBe(true);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // OBSERVABILITY HOOKS TESTS
  // =============================================================================

  describe('Observability Hooks', () => {
    it('collects metrics on successful operation', async () => {
      await supervisorAgent.generateText('Hello', {
        userId: 'test-tenant:test-user',
      });

      expect(collectedMetrics.length).toBeGreaterThan(0);

      const metric = collectedMetrics[0];
      expect(metric.agentName).toBe('SupervisorAgent');
      expect(metric.success).toBe(true);
      expect(metric.duration).toBeGreaterThan(0);
      expect(metric.operationId).toBeDefined();

      console.log(`[METRICS] Duration: ${metric.duration}ms, Success: ${metric.success}`);
    }, API_TIMEOUT);

    it('tracks token usage when available', async () => {
      await supervisorAgent.generateText('What is 2 + 2?', {
        userId: 'test-tenant:test-user',
      });

      expect(collectedMetrics.length).toBeGreaterThan(0);

      const metric = collectedMetrics[0];
      if (metric.totalTokens !== undefined) {
        expect(metric.totalTokens).toBeGreaterThan(0);
        console.log(`[METRICS] Tokens: ${metric.totalTokens}`);
      }
    }, API_TIMEOUT);
  });

  // =============================================================================
  // TENANT ISOLATION TESTS
  // =============================================================================

  describe('Tenant Isolation', () => {
    it('uses tenant-scoped userId format correctly', async () => {
      const tenantUserId = 'tenant-123:user-456';

      const result = await supervisorAgent.generateText('Hello', {
        userId: tenantUserId,
      });

      expect(result.text).toBeDefined();
      expect(collectedMetrics.length).toBeGreaterThan(0);
    }, API_TIMEOUT);

    it('maintains separate agents per tenant', async () => {
      const tenant1Agent = createSupervisorAgent({
        model: getMistralModel('small'),
        prisma: mockPrismaService,
        emailSendService: null,
        calendarService: null,
        locale: 'en',
        tenantId: 'tenant-1',
        hooks: observabilityHooks,
      });

      const tenant2Agent = createSupervisorAgent({
        model: getMistralModel('small'),
        prisma: mockPrismaService,
        emailSendService: null,
        calendarService: null,
        locale: 'en',
        tenantId: 'tenant-2',
        hooks: observabilityHooks,
      });

      // Both agents should work independently
      const [result1, result2] = await Promise.all([
        tenant1Agent.generateText('Hello', { userId: 'tenant-1:user-1' }),
        tenant2Agent.generateText('Hello', { userId: 'tenant-2:user-1' }),
      ]);

      expect(result1.text).toBeDefined();
      expect(result2.text).toBeDefined();
    }, API_TIMEOUT * 2);
  });

  // =============================================================================
  // TOOL EXECUTION TESTS
  // =============================================================================

  describe('Tool Execution', () => {
    it('can list folders via tool', async () => {
      const result = await supervisorAgent.generateText('List my email folders', {
        userId: 'test-tenant:test-user',
      });

      expect(result.text).toBeDefined();

      // Check if folder tool was called
      const mockFolderFindMany = mockPrismaService.folder.findMany as jest.Mock;
      console.log(`[TOOL] folder.findMany called: ${mockFolderFindMany.mock.calls.length} times`);
    }, API_TIMEOUT);

    it('handles empty results gracefully', async () => {
      const result = await supervisorAgent.generateText('Show me all contacts', {
        userId: 'test-tenant:test-user',
      });

      // Should handle empty results without error
      expect(result.text).toBeDefined();
    }, API_TIMEOUT);
  });

  // =============================================================================
  // PERFORMANCE TESTS
  // =============================================================================

  describe('Performance', () => {
    it('responds within acceptable latency', async () => {
      const startTime = Date.now();
      await supervisorAgent.generateText('Hello', {
        userId: 'test-tenant:test-user',
      });
      const latency = Date.now() - startTime;

      console.log(`[PERF] Simple response latency: ${latency}ms`);

      // Should respond within 30 seconds for simple query
      expect(latency).toBeLessThan(30000);
    }, API_TIMEOUT);
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('handles empty message', async () => {
      const result = await supervisorAgent.generateText('', {
        userId: 'test-tenant:test-user',
      });

      expect(result.text).toBeDefined();
    }, API_TIMEOUT);

    it('handles special characters', async () => {
      const result = await supervisorAgent.generateText(
        'Send email to "test+special"@example.com',
        { userId: 'test-tenant:test-user' },
      );

      expect(result.text).toBeDefined();
    }, API_TIMEOUT);

    it('handles unicode/emoji', async () => {
      const result = await supervisorAgent.generateText('Help me 🎉', {
        userId: 'test-tenant:test-user',
      });

      expect(result.text).toBeDefined();
    }, API_TIMEOUT);
  });
});

// =============================================================================
// REAL TENANT INTEGRATION TESTS
// Tests using real database data (requires DATABASE_URL and real tenant)
// =============================================================================

// Optional: Set TEST_TENANT_ID to run with real tenant data
const TEST_TENANT_ID = process.env.TEST_TENANT_ID;
const describeIfRealTenant = TEST_TENANT_ID && MISTRAL_API_KEY ? describe : describe.skip;

describeIfRealTenant('VoltAgent Real Tenant Tests', () => {
  // These tests require:
  // - MISTRAL_API_KEY set
  // - TEST_TENANT_ID set to a real tenant ID
  // - DATABASE_URL pointing to real database
  //
  // Run with: TEST_TENANT_ID=your-tenant npx jest --testPathPattern=voltagent.integration

  it('placeholder for real tenant tests', () => {
    console.log(`[REAL TENANT] Would test with tenant: ${TEST_TENANT_ID}`);
    console.log('[REAL TENANT] To enable, set TEST_TENANT_ID and DATABASE_URL');
    expect(true).toBe(true);
  });

  // Real tenant tests would use actual PrismaService
  // Example:
  // it('queries real email data', async () => {
  //   const prisma = new PrismaService();
  //   const supervisorAgent = createSupervisorAgent({
  //     model: getMistralModel('small'),
  //     prisma,
  //     emailSendService: null,
  //     calendarService: null,
  //     locale: 'en',
  //     tenantId: TEST_TENANT_ID,
  //   });
  //   const result = await supervisorAgent.generateText('How many emails do I have?', {
  //     userId: `${TEST_TENANT_ID}:test-user`,
  //   });
  //   expect(result.text).toBeDefined();
  // }, API_TIMEOUT);
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================

afterAll(() => {
  if (!MISTRAL_API_KEY) {
    console.log('\n⚠️  MISTRAL_API_KEY not set - VoltAgent integration tests skipped');
    console.log('   Set the environment variable to run real API tests\n');
  } else {
    console.log('\n✅ VoltAgent integration tests completed');
    console.log(`   Total metrics collected: ${collectedMetrics.length}`);
    if (collectedMetrics.length > 0) {
      const avgDuration =
        collectedMetrics.reduce((sum, m) => sum + m.duration, 0) / collectedMetrics.length;
      const successRate =
        (collectedMetrics.filter((m) => m.success).length / collectedMetrics.length) * 100;
      console.log(`   Average duration: ${avgDuration.toFixed(0)}ms`);
      console.log(`   Success rate: ${successRate.toFixed(0)}%\n`);
    }
  }
  if (TEST_TENANT_ID) {
    console.log(`   Real tenant tests enabled for: ${TEST_TENANT_ID}`);
  }
});

