/**
 * P5 Agent Validation - Comprehensive RAG & LLM Accuracy Testing
 *
 * Based on best practices from:
 * - https://www.evidentlyai.com/llm-guide/rag-evaluation
 * - https://www.databricks.com/blog/LLM-auto-eval-best-practices-RAG
 *
 * Tests:
 * 1. RETRIEVAL ACCURACY: Does search return correct emails?
 * 2. CONTACT SEARCH: Does search_contacts find correct contacts?
 * 3. GENERATION ACCURACY: Does LLM extract correct information?
 * 4. LANGUAGE COHERENCE: Does IT locale produce Italian, EN produce English?
 * 5. TENANT ISOLATION: Can tenant A see tenant B's data?
 * 6. HALLUCINATION DETECTION: Does search refuse impossible queries?
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { createEmailTools } from '../src/modules/ai/voltagent/tools/email.tools';
import { createContactsTools } from '../src/modules/ai/voltagent/tools/contacts.tools';
import { createInsightTools } from '../src/modules/ai/voltagent/tools/insights.tools';

const prisma = createPrismaClient();

// Test results tracking
interface TestCase {
  name: string;
  category: 'retrieval' | 'generation' | 'language' | 'isolation' | 'hallucination';
  passed: boolean;
  expected: string;
  actual: string;
}

const results: TestCase[] = [];

// Ground truth test tenant IDs
const ITALIAN_TENANT_ID = 'cmk2x2zwj0000s4yh5nlq8izj';
const RAG_BENCHMARK_TENANT_ID = 'YIqV7NvQb_x3Cf6H2SdLY';

const mockCacheService = {
  get: async () => null,
  set: async () => {},
  isHealthy: () => true,
};

// ============================================================================
// GROUND TRUTH TEST CASES
// ============================================================================

const RETRIEVAL_TESTS = [
  {
    query: 'SLA',
    expectedContent: 'Revisione clausole SLA',
    description: 'Search for SLA-related emails',
  },
  {
    query: 'ordine consegna',
    expectedContent: 'Ordine #ORD-GLPQBAON',
    description: 'Search for order/delivery emails',
  },
  {
    query: 'opportunità greentech',
    expectedContent: 'greentech',
    description: 'Search for specific opportunity',
  },
  {
    query: 'candidatura project manager',
    expectedContent: 'Project Manager',
    description: 'Search for job candidate',
  },
];

const CONTACT_TESTS = [
  {
    query: 'CFO',
    expectedContent: 'Silvia Mariani',
    description: 'Search for CFO contact',
  },
  {
    query: 'CTO',
    expectedContent: 'Paolo Costa',
    description: 'Search for CTO contact',
  },
  {
    query: 'avvocato',
    expectedContent: 'Marco Rossi',
    description: 'Search for lawyer',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

function log(
  category: TestCase['category'],
  name: string,
  passed: boolean,
  expected: string,
  actual: string,
) {
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${name}`);
  if (!passed) {
    console.log(`     Expected: ${expected.slice(0, 80)}`);
    console.log(`     Actual: ${actual.slice(0, 80)}`);
  }
  results.push({ name, category, passed, expected, actual });
}

// Helper to execute tool
async function executeTool(tool: any, params: any): Promise<string> {
  try {
    const result = await tool.execute(params);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ============================================================================
// MistralService mock for LLM tests
// ============================================================================
async function createMistralServiceMock(): Promise<any | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('  ⚠️  MISTRAL_API_KEY not set - LLM tests will be skipped');
    return null;
  }

  try {
    const { Mistral } = await import('@mistralai/mistralai');
    const client = new Mistral({ apiKey });

    // Return a mock that matches MistralService interface
    return {
      completePrompt: async (params: {
        systemPrompt?: string;
        userPrompt: string;
        temperature?: number;
        maxTokens?: number;
      }) => {
        const messages: { role: 'system' | 'user'; content: string }[] = [];
        if (params.systemPrompt) {
          messages.push({ role: 'system', content: params.systemPrompt });
        }
        messages.push({ role: 'user', content: params.userPrompt });

        const response = await client.chat.complete({
          model: 'mistral-small-latest',
          messages,
          temperature: params.temperature ?? 0.4,
          maxTokens: params.maxTokens ?? 512,
        });

        return response.choices?.[0]?.message?.content || '';
      },
    };
  } catch (error) {
    console.log(`  ⚠️  Mistral init failed: ${error}`);
    return null;
  }
}

// ============================================================================
// TEST 1: RETRIEVAL ACCURACY
// ============================================================================
async function testRetrievalAccuracy() {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 1: RETRIEVAL ACCURACY (search_emails finds correct results)');
  console.log('='.repeat(70));

  const emailTools = createEmailTools(
    prisma as any,
    null,
    'it',
    ITALIAN_TENANT_ID,
    mockCacheService as any,
  );

  const searchTool = emailTools.find((t: any) => t.name === 'search_emails');
  if (!searchTool) {
    console.log('  ⚠️  search_emails tool not found');
    return;
  }

  for (const test of RETRIEVAL_TESTS) {
    const result = await executeTool(searchTool, { query: test.query, limit: 5 });
    const found = result.toLowerCase().includes(test.expectedContent.toLowerCase());
    log('retrieval', test.description, found, test.expectedContent, result.slice(0, 200));
  }
}

// ============================================================================
// TEST 2: CONTACT SEARCH ACCURACY
// ============================================================================
async function testContactSearchAccuracy() {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 2: CONTACT SEARCH ACCURACY (search_contacts finds correct results)');
  console.log('='.repeat(70));

  const contactTools = createContactsTools(
    prisma as any,
    'it',
    ITALIAN_TENANT_ID,
    mockCacheService as any,
  );

  const searchTool = contactTools.find((t: any) => t.name === 'search_contacts');
  if (!searchTool) {
    console.log('  ⚠️  search_contacts tool not found');
    return;
  }

  for (const test of CONTACT_TESTS) {
    const result = await executeTool(searchTool, { query: test.query, limit: 5 });
    const found = result.includes(test.expectedContent);
    log('retrieval', test.description, found, test.expectedContent, result.slice(0, 200));
  }
}

// ============================================================================
// TEST 3: GENERATION ACCURACY (LLM Analysis)
// ============================================================================
async function testGenerationAccuracy(mistral: any) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 3: GENERATION ACCURACY (LLM extracts correct information)');
  console.log('='.repeat(70));

  if (!mistral) {
    console.log('  ⚠️  Skipping LLM tests - Mistral not available');
    return;
  }

  const insightsTools = createInsightTools({
    prisma: prisma as any,
    mistral,
    locale: 'it',
    tenantId: ITALIAN_TENANT_ID,
    cacheService: mockCacheService as any,
  });

  const analyzeTool = insightsTools.find((t: any) => t.name === 'analyze_email');
  if (!analyzeTool) {
    console.log('  ⚠️  analyze_email tool not found');
    return;
  }

  // Test 1: Find SLA email and analyze
  const slaEmail = await prisma.email.findFirst({
    where: { tenantId: ITALIAN_TENANT_ID, subject: { contains: 'SLA' } },
    select: { id: true },
  });

  if (slaEmail) {
    const result = await executeTool(analyzeTool, { emailId: slaEmail.id });
    const hasRelevantKeywords = containsAny(result, ['conformi', 'clausole', 'firma', 'normativa', 'SLA', 'contratto']);
    log(
      'generation',
      'LLM extracts SLA status from email',
      hasRelevantKeywords,
      'Keywords: conformi, clausole, firma',
      result.slice(0, 300),
    );
  } else {
    log('generation', 'LLM extracts SLA status from email', false, 'SLA email', 'Email not found');
  }

  // Test 2: Find order email and analyze
  const orderEmail = await prisma.email.findFirst({
    where: { tenantId: ITALIAN_TENANT_ID, subject: { contains: 'Ordine' } },
    select: { id: true },
  });

  if (orderEmail) {
    const result = await executeTool(analyzeTool, { emailId: orderEmail.id });
    const hasRelevantKeywords = containsAny(result, ['ordine', 'consegna', 'confermato', 'logistic', 'order', 'delivery']);
    log(
      'generation',
      'LLM extracts order info from email',
      hasRelevantKeywords,
      'Keywords: ordine, consegna, confermato',
      result.slice(0, 300),
    );
  } else {
    log('generation', 'LLM extracts order info from email', false, 'Order email', 'Email not found');
  }
}

// ============================================================================
// TEST 4: LANGUAGE COHERENCE
// ============================================================================
async function testLanguageCoherence(mistral: any) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 4: LANGUAGE COHERENCE (IT locale → Italian, EN → English)');
  console.log('='.repeat(70));

  if (!mistral) {
    console.log('  ⚠️  Skipping LLM tests - Mistral not available');
    return;
  }

  // Find an email to compose reply to
  const email = await prisma.email.findFirst({
    where: { tenantId: ITALIAN_TENANT_ID },
    select: { id: true },
  });

  if (!email) {
    console.log('  ⚠️  No email found');
    return;
  }

  // Test Italian locale
  const itTools = createInsightTools({
    prisma: prisma as any,
    mistral,
    locale: 'it',
    tenantId: ITALIAN_TENANT_ID,
    cacheService: mockCacheService as any,
  });

  const composeToolIT = itTools.find((t: any) => t.name === 'compose_reply');
  if (composeToolIT) {
    // Use mode: 'suggestions' which doesn't require instructions
    const result = await executeTool(composeToolIT, { emailId: email.id, mode: 'suggestions' });
    const italianWords = ['gentile', 'cordiali', 'saluti', 'grazie', 'prego', 'buongiorno', 'confermare', 'ricevuto'];
    const hasItalian = containsAny(result, italianWords);
    log('language', 'IT locale produces Italian replies', hasItalian, 'Italian words', result.slice(0, 150));
  }

  // Test English locale
  const enTools = createInsightTools({
    prisma: prisma as any,
    mistral,
    locale: 'en',
    tenantId: ITALIAN_TENANT_ID,
    cacheService: mockCacheService as any,
  });

  const composeToolEN = enTools.find((t: any) => t.name === 'compose_reply');
  if (composeToolEN) {
    // Use mode: 'suggestions' which doesn't require instructions
    const result = await executeTool(composeToolEN, { emailId: email.id, mode: 'suggestions' });
    const englishWords = ['dear', 'regards', 'thank', 'please', 'hello', 'sincerely', 'confirm', 'received'];
    const hasEnglish = containsAny(result, englishWords);
    log('language', 'EN locale produces English replies', hasEnglish, 'English words', result.slice(0, 150));
  }
}

// ============================================================================
// TEST 5: TENANT ISOLATION (Security Critical)
// ============================================================================
async function testTenantIsolation() {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 5: TENANT ISOLATION (Tenant A cannot see Tenant B data)');
  console.log('='.repeat(70));

  // Italian tenant trying to search RAG Benchmark data
  const emailTools = createEmailTools(
    prisma as any,
    null,
    'it',
    ITALIAN_TENANT_ID,
    mockCacheService as any,
  );

  const searchTool = emailTools.find((t: any) => t.name === 'search_emails');
  if (!searchTool) return;

  // Search for RAG Benchmark specific content
  const result1 = await executeTool(searchTool, { query: 'TechCorp Deal OPP-TC-2025', limit: 10 });
  // Parse result to check actual data, not the query in the result string
  let leaksData1 = false;
  try {
    const parsed1 = JSON.parse(result1);
    // Check if any email in data array contains TechCorp (not in the query echoed)
    const dataStr1 = JSON.stringify(parsed1.data || []);
    leaksData1 = dataStr1.includes('TechCorp') && !dataStr1.includes('[]');
  } catch {
    // If not JSON, check result but exclude the known query terms
    leaksData1 = result1.includes('TechCorp') && !result1.includes('"data":[]');
  }
  log(
    'isolation',
    'Italian tenant cannot see RAG Benchmark emails (TechCorp)',
    !leaksData1,
    'No TechCorp data visible',
    leaksData1 ? 'SECURITY BREACH!' : 'Properly isolated',
  );

  // Search for specific RAG Benchmark subject
  const result2 = await executeTool(searchTool, { query: 'Incident Report INC-2025', limit: 10 });
  // Parse result to check actual data
  let leaksData2 = false;
  try {
    const parsed2 = JSON.parse(result2);
    const dataStr2 = JSON.stringify(parsed2.data || []);
    leaksData2 = (dataStr2.includes('INC-2025') || dataStr2.includes('Network slowdown')) && !dataStr2.includes('[]');
  } catch {
    leaksData2 = (result2.includes('INC-2025') || result2.includes('Network slowdown')) && !result2.includes('"data":[]');
  }
  log(
    'isolation',
    'Italian tenant cannot see Incident Reports from other tenant',
    !leaksData2,
    'No incident data visible',
    leaksData2 ? 'SECURITY BREACH!' : 'Properly isolated',
  );
}

// ============================================================================
// TEST 6: HALLUCINATION DETECTION
// ============================================================================
async function testHallucinationDetection() {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 6: HALLUCINATION DETECTION (search returns empty for impossible queries)');
  console.log('='.repeat(70));

  const emailTools = createEmailTools(
    prisma as any,
    null,
    'it',
    ITALIAN_TENANT_ID,
    mockCacheService as any,
  );

  const searchTool = emailTools.find((t: any) => t.name === 'search_emails');
  if (!searchTool) return;

  // Test impossible date query
  const result1 = await executeTool(searchTool, { query: 'email from year 1985', limit: 5 });
  // Check actual data array, not just string presence
  let noResults1 = false;
  try {
    const parsed1 = JSON.parse(result1);
    noResults1 = !parsed1.data || parsed1.data.length === 0;
  } catch {
    noResults1 = result1.includes('[]') || result1.includes('"data":[]');
  }
  log(
    'hallucination',
    'Search for 1985 returns no results (not hallucinated)',
    noResults1,
    'Empty or no results',
    result1.slice(0, 100),
  );

  // Test search for non-existent sender
  const result2 = await executeTool(searchTool, { query: 'barack.obama@whitehouse.gov', limit: 5 });
  // Check actual data array for emails from this sender
  let noFakeEmails = false;
  try {
    const parsed2 = JSON.parse(result2);
    const data = parsed2.data || [];
    // Check if any returned email is actually from obama (not just query echoed)
    noFakeEmails = data.length === 0 || !data.some((e: any) =>
      e.from?.toLowerCase().includes('obama') || e.subject?.toLowerCase().includes('obama')
    );
  } catch {
    noFakeEmails = result2.includes('"data":[]') || result2.includes('[]');
  }
  log(
    'hallucination',
    'Search for non-existent sender returns empty',
    noFakeEmails,
    'No fake emails',
    result2.slice(0, 100),
  );
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║       P5 AGENT VALIDATION - Comprehensive RAG & LLM Testing          ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Initialize MistralService mock for LLM tests
  const mistral = await createMistralServiceMock();

  try {
    await testRetrievalAccuracy();
    await testContactSearchAccuracy();
    await testGenerationAccuracy(mistral);
    await testLanguageCoherence(mistral);
    await testTenantIsolation();
    await testHallucinationDetection();

    // Summary by category
    console.log('\n' + '='.repeat(70));
    console.log(' VALIDATION SUMMARY');
    console.log('='.repeat(70));

    const categories = ['retrieval', 'generation', 'language', 'isolation', 'hallucination'] as const;

    let totalPassed = 0;
    let totalTests = 0;

    console.log('\n  Category            | Passed | Total | Score');
    console.log('  --------------------|--------|-------|------');

    for (const cat of categories) {
      const catResults = results.filter(r => r.category === cat);
      const passed = catResults.filter(r => r.passed).length;
      const total = catResults.length;
      const scoreAvg = total > 0 ? ((passed / total) * 100).toFixed(0) : 'N/A';

      totalPassed += passed;
      totalTests += total;

      console.log(
        `  ${cat.padEnd(19)} | ${String(passed).padStart(6)} | ${String(total).padStart(5)} | ${String(scoreAvg).padStart(4)}%`,
      );
    }

    console.log('  --------------------|--------|-------|------');
    const finalScore = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(0) : '0';
    console.log(`  TOTAL               | ${String(totalPassed).padStart(6)} | ${String(totalTests).padStart(5)} | ${finalScore}%`);

    // Final verdict
    const overallScore = totalTests > 0 ? totalPassed / totalTests : 0;
    console.log('\n');

    if (overallScore >= 0.9) {
      console.log('  🎉 VALIDATION PASSED - Agent is production-ready');
    } else if (overallScore >= 0.7) {
      console.log('  ⚠️  VALIDATION PARTIAL - Some issues need attention');
    } else {
      console.log('  ❌ VALIDATION FAILED - Critical issues found');
    }

    // List failures
    const failures = results.filter(r => !r.passed);
    if (failures.length > 0) {
      console.log('\n  FAILURES:');
      failures.forEach(f => {
        console.log(`    ❌ [${f.category}] ${f.name}`);
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
