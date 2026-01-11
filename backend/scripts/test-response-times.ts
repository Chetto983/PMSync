/**
 * Real Response Time Test - Multiple iterations for P50/P95/P99
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Mistral } from '@mistralai/mistralai';

const prisma = createPrismaClient();

interface TimingStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

function calculateStats(timings: number[]): TimingStats {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║          REAL RESPONSE TIME TEST - User Wait Time Analysis           ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log();

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('MISTRAL_API_KEY not set');
    process.exit(1);
  }

  const client = new Mistral({ apiKey });
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
  if (!tenant) {
    console.log('No tenant found');
    process.exit(1);
  }

  // Get multiple test emails for variety
  const emails = await prisma.email.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, subject: true },
    take: 10,
  });

  console.log(`Testing with ${emails.length} emails from tenant: ${tenant.name}`);
  console.log();

  const mockMistral = {
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

  const mockCache = {
    isHealthy: () => true,
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    getClient: () => null,
  };

  // Import tools
  const { createInsightTools } = await import('../src/modules/ai/voltagent/tools/insights.tools');
  const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
  const { createContactsTools } = await import('../src/modules/ai/voltagent/tools/contacts.tools');

  const insightTools = createInsightTools({
    prisma: prisma as any,
    mistral: mockMistral as any,
    locale: 'en',
    tenantId: tenant.id,
    cacheService: mockCache as any,
  });

  const emailTools = createEmailTools(prisma as any, null, 'en', tenant.id, mockCache as any);
  const contactTools = createContactsTools(prisma as any, 'en', tenant.id, mockCache as any);

  const analyzeTool = insightTools.find((t: any) => t.name === 'analyze_email');
  const composeTool = insightTools.find((t: any) => t.name === 'compose_reply');
  const searchTool = emailTools.find((t: any) => t.name === 'search_emails');
  const listTool = emailTools.find((t: any) => t.name === 'list_emails');
  const contactSearchTool = contactTools.find((t: any) => t.name === 'search_contacts');

  // =========================================================================
  // TEST 1: analyze_email with LLM (10 iterations)
  // =========================================================================
  console.log('='.repeat(70));
  console.log(' TEST 1: analyze_email (LLM) - 10 iterations');
  console.log('='.repeat(70));

  const analyzeTimings: number[] = [];
  for (let i = 0; i < 10; i++) {
    const email = emails[i % emails.length];
    const start = Date.now();
    await (analyzeTool as any).execute({ emailId: email.id, includeLabels: true });
    const elapsed = Date.now() - start;
    analyzeTimings.push(elapsed);
    process.stdout.write(`  [${i + 1}/10] ${elapsed}ms\r`);
  }
  console.log();
  const analyzeStats = calculateStats(analyzeTimings);
  console.log(`  Min: ${analyzeStats.min}ms | Avg: ${analyzeStats.avg}ms | P50: ${analyzeStats.p50}ms | P95: ${analyzeStats.p95}ms | Max: ${analyzeStats.max}ms`);

  // =========================================================================
  // TEST 2: compose_reply suggestions with LLM (10 iterations)
  // =========================================================================
  console.log();
  console.log('='.repeat(70));
  console.log(' TEST 2: compose_reply suggestions (LLM) - 10 iterations');
  console.log('='.repeat(70));

  const composeTimings: number[] = [];
  for (let i = 0; i < 10; i++) {
    const email = emails[i % emails.length];
    const start = Date.now();
    await (composeTool as any).execute({ emailId: email.id, mode: 'suggestions', tone: 'casual' });
    const elapsed = Date.now() - start;
    composeTimings.push(elapsed);
    process.stdout.write(`  [${i + 1}/10] ${elapsed}ms\r`);
  }
  console.log();
  const composeStats = calculateStats(composeTimings);
  console.log(`  Min: ${composeStats.min}ms | Avg: ${composeStats.avg}ms | P50: ${composeStats.p50}ms | P95: ${composeStats.p95}ms | Max: ${composeStats.max}ms`);

  // =========================================================================
  // TEST 3: search_emails (DB only) - 20 iterations
  // =========================================================================
  console.log();
  console.log('='.repeat(70));
  console.log(' TEST 3: search_emails (DB only) - 20 iterations');
  console.log('='.repeat(70));

  const searchTimings: number[] = [];
  const queries = ['meeting', 'test', 'urgent', 'hello', 'project'];
  for (let i = 0; i < 20; i++) {
    const query = queries[i % queries.length];
    const start = Date.now();
    await (searchTool as any).execute({ query, limit: 10 });
    const elapsed = Date.now() - start;
    searchTimings.push(elapsed);
    process.stdout.write(`  [${i + 1}/20] ${elapsed}ms\r`);
  }
  console.log();
  const searchStats = calculateStats(searchTimings);
  console.log(`  Min: ${searchStats.min}ms | Avg: ${searchStats.avg}ms | P50: ${searchStats.p50}ms | P95: ${searchStats.p95}ms | Max: ${searchStats.max}ms`);

  // =========================================================================
  // TEST 4: list_emails (DB only) - 20 iterations
  // =========================================================================
  console.log();
  console.log('='.repeat(70));
  console.log(' TEST 4: list_emails (DB only) - 20 iterations');
  console.log('='.repeat(70));

  const listTimings: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    await (listTool as any).execute({ mode: 'unread', limit: 10 });
    const elapsed = Date.now() - start;
    listTimings.push(elapsed);
    process.stdout.write(`  [${i + 1}/20] ${elapsed}ms\r`);
  }
  console.log();
  const listStats = calculateStats(listTimings);
  console.log(`  Min: ${listStats.min}ms | Avg: ${listStats.avg}ms | P50: ${listStats.p50}ms | P95: ${listStats.p95}ms | Max: ${listStats.max}ms`);

  // =========================================================================
  // TEST 5: search_contacts (DB only) - 20 iterations
  // =========================================================================
  console.log();
  console.log('='.repeat(70));
  console.log(' TEST 5: search_contacts (DB only) - 20 iterations');
  console.log('='.repeat(70));

  const contactTimings: number[] = [];
  const names = ['john', 'test', 'company', 'email', 'work'];
  for (let i = 0; i < 20; i++) {
    const query = names[i % names.length];
    const start = Date.now();
    await (contactSearchTool as any).execute({ query, limit: 10 });
    const elapsed = Date.now() - start;
    contactTimings.push(elapsed);
    process.stdout.write(`  [${i + 1}/20] ${elapsed}ms\r`);
  }
  console.log();
  const contactStats = calculateStats(contactTimings);
  console.log(`  Min: ${contactStats.min}ms | Avg: ${contactStats.avg}ms | P50: ${contactStats.p50}ms | P95: ${contactStats.p95}ms | Max: ${contactStats.max}ms`);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log();
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                         USER WAIT TIME SUMMARY                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Operation                 | Iterations |   P50   |   P95   |   Avg   ');
  console.log('-'.repeat(70));
  console.log(`analyze_email (LLM)       |     10     | ${String(analyzeStats.p50).padStart(5)}ms | ${String(analyzeStats.p95).padStart(5)}ms | ${String(analyzeStats.avg).padStart(5)}ms`);
  console.log(`compose_reply (LLM)       |     10     | ${String(composeStats.p50).padStart(5)}ms | ${String(composeStats.p95).padStart(5)}ms | ${String(composeStats.avg).padStart(5)}ms`);
  console.log(`search_emails (DB)        |     20     | ${String(searchStats.p50).padStart(5)}ms | ${String(searchStats.p95).padStart(5)}ms | ${String(searchStats.avg).padStart(5)}ms`);
  console.log(`list_emails (DB)          |     20     | ${String(listStats.p50).padStart(5)}ms | ${String(listStats.p95).padStart(5)}ms | ${String(listStats.avg).padStart(5)}ms`);
  console.log(`search_contacts (DB)      |     20     | ${String(contactStats.p50).padStart(5)}ms | ${String(contactStats.p95).padStart(5)}ms | ${String(contactStats.avg).padStart(5)}ms`);
  console.log('-'.repeat(70));
  console.log();
  console.log('KEY INSIGHTS:');
  console.log(`  • LLM operations (AI analysis): ~${Math.round((analyzeStats.avg + composeStats.avg) / 2)}ms average (1-3 seconds)`);
  console.log(`  • Database operations: ~${Math.round((searchStats.avg + listStats.avg + contactStats.avg) / 3)}ms average (<50ms)`);
  console.log(`  • User perceived latency dominated by LLM API call time`);
  console.log();

  await prisma.$disconnect();
}

main().catch(console.error);
