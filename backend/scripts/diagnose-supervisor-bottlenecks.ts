/**
 * Diagnose Supervisor Agent Bottlenecks
 *
 * Measures time spent in each stage of the supervisor pipeline:
 * 1. Pre-processing (security, rate limiting, cache check)
 * 2. Context loading (user context, episodic memory)
 * 3. RAG retrieval (embedding, vector search, keyword search)
 * 4. LLM generation (supervisor + sub-agent delegation)
 *
 * Run: npx ts-node scripts/diagnose-supervisor-bottlenecks.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';
import Redis from 'ioredis';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

interface TimingResult {
  stage: string;
  durationMs: number;
  details?: string;
}

async function measureTiming<T>(
  stage: string,
  fn: () => Promise<T>,
  details?: string
): Promise<{ result: T; timing: TimingResult }> {
  const start = Date.now();
  const result = await fn();
  return {
    result,
    timing: {
      stage,
      durationMs: Date.now() - start,
      details,
    },
  };
}

async function main() {
  console.log('🔍 Supervisor Agent Bottleneck Diagnosis\n');
  console.log('━'.repeat(60));

  const timings: TimingResult[] = [];
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  const testQuery = "What emails did I receive from Mario about the project?";

  // 1. USER CONTEXT LOADING
  console.log('\n📊 Stage 1: User Context Loading');
  const { timing: userTiming } = await measureTiming('User Context', async () => {
    const [user, providers] = await Promise.all([
      prisma.user.findFirst({
        where: { tenantId: TENANT_ID },
        include: { userPreferences: true },
      }),
      prisma.providerConfig.findMany({
        where: { tenantId: TENANT_ID, isActive: true },
        select: { providerType: true, email: true, displayName: true },
      }),
    ]);
    return { user, providers };
  });
  timings.push(userTiming);
  console.log(`   ${userTiming.stage}: ${userTiming.durationMs}ms`);

  // 2. EPISODIC MEMORY
  console.log('\n📊 Stage 2: Episodic Memory');
  const { timing: episodicTiming } = await measureTiming('Episodic Memory', async () => {
    // Simulating episodic memory fetch (lessons)
    return prisma.actionQueue.findMany({
      where: { tenantId: TENANT_ID },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
  });
  timings.push(episodicTiming);
  console.log(`   ${episodicTiming.stage}: ${episodicTiming.durationMs}ms`);

  // 3. RAG PIPELINE
  console.log('\n📊 Stage 3: RAG Pipeline (UnifiedRetriever)');

  // 3a. Query Embedding
  const { result: embedding, timing: embedTiming } = await measureTiming(
    'Query Embedding (Mistral API)',
    async () => {
      const response = await mistral.embeddings.create({
        model: 'mistral-embed',
        inputs: [testQuery],
      });
      return response.data?.[0]?.embedding ?? [];
    }
  );
  timings.push(embedTiming);
  console.log(`   ${embedTiming.stage}: ${embedTiming.durationMs}ms ⚠️ BOTTLENECK`);

  // 3b. Vector Search
  const { timing: vectorTiming } = await measureTiming('Vector Search (HNSW)', async () => {
    if (embedding.length > 0) {
      return prisma.$queryRaw`
        SELECT id, content, vector <=> ${`[${embedding.join(',')}]`}::vector AS distance
        FROM embeddings
        WHERE "tenantId" = ${TENANT_ID}
        ORDER BY distance ASC
        LIMIT 10
      `;
    }
    return [];
  });
  timings.push(vectorTiming);
  console.log(`   ${vectorTiming.stage}: ${vectorTiming.durationMs}ms`);

  // 3c. Keyword Search
  const { timing: keywordTiming } = await measureTiming('Keyword Search (Prisma)', async () => {
    return prisma.email.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { subject: { contains: 'Mario', mode: 'insensitive' } },
          { from: { contains: 'Mario', mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: { id: true, subject: true, from: true, snippet: true },
    });
  });
  timings.push(keywordTiming);
  console.log(`   ${keywordTiming.stage}: ${keywordTiming.durationMs}ms`);

  // 3d. Additional Sources
  const { timing: deadlinesTiming } = await measureTiming('Deadlines Search', async () => {
    const providers = await prisma.providerConfig.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true },
    });
    return prisma.emailAnalysis.findMany({
      where: {
        tenantId: TENANT_ID,
        email: { providerId: { in: providers.map(p => p.id) } },
        hasDeadline: true,
      },
      take: 5,
    });
  });
  timings.push(deadlinesTiming);
  console.log(`   ${deadlinesTiming.stage}: ${deadlinesTiming.durationMs}ms`);

  const { timing: followupsTiming } = await measureTiming('Follow-ups Search', async () => {
    return prisma.emailFollowUp.findMany({
      where: { tenantId: TENANT_ID, status: { in: ['PENDING', 'REMINDED'] } },
      take: 5,
    });
  });
  timings.push(followupsTiming);
  console.log(`   ${followupsTiming.stage}: ${followupsTiming.durationMs}ms`);

  // 4. LLM GENERATION (simulated - just measure cold start)
  console.log('\n📊 Stage 4: LLM Generation');
  const { timing: llmTiming } = await measureTiming('Mistral Chat (small model)', async () => {
    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Say hello in one word.' }],
      maxTokens: 10,
    });
    return response.choices?.[0]?.message?.content;
  });
  timings.push(llmTiming);
  console.log(`   ${llmTiming.stage}: ${llmTiming.durationMs}ms`);

  // SUMMARY
  console.log('\n' + '━'.repeat(60));
  console.log('📈 BOTTLENECK SUMMARY');
  console.log('━'.repeat(60));

  const totalTime = timings.reduce((sum, t) => sum + t.durationMs, 0);
  const sorted = [...timings].sort((a, b) => b.durationMs - a.durationMs);

  for (const t of sorted) {
    const pct = ((t.durationMs / totalTime) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(Number(pct) / 5));
    console.log(`${t.stage.padEnd(30)} ${t.durationMs.toString().padStart(5)}ms (${pct.padStart(5)}%) ${bar}`);
  }

  console.log('─'.repeat(60));
  console.log(`TOTAL                          ${totalTime.toString().padStart(5)}ms`);

  // Recommendations
  console.log('\n' + '━'.repeat(60));
  console.log('💡 OPTIMIZATION RECOMMENDATIONS');
  console.log('━'.repeat(60));

  const embeddingPct = (embedTiming.durationMs / totalTime) * 100;
  if (embeddingPct > 40) {
    console.log(`
1. QUERY EMBEDDING CACHE (${embeddingPct.toFixed(0)}% of time)
   - Check cache BEFORE calling Mistral API
   - Already implemented in QueryEmbeddingCacheService
   - Verify cache is being used in UnifiedRetriever
`);
  }

  console.log(`
2. QUERY CLASSIFICATION (Skip RAG for simple queries)
   - "Hello" → No RAG needed, direct response
   - "Send email to..." → Only needs ContactsAgent, skip email search
   - "What's the weather?" → WebSearchAgent only

3. LAZY SUB-AGENT CREATION
   - Current: 8 sub-agents created upfront
   - Better: Create only when supervisor delegates

4. RAG SOURCE FILTERING
   - Current: Searches emails, deadlines, followups, actions for ALL queries
   - Better: Analyze query intent first, search only relevant sources

5. REDUCE SUPERVISOR MAXSTEPS
   - Current: maxSteps=10 (can make 10 tool calls)
   - Better: maxSteps=3-5 for faster responses

6. DIRECT AGENT ROUTING
   - For clear intents, skip supervisor and route directly to specialist
   - "Show my calendar" → CalendarAgent directly
`);

  await redis.quit();
  await prisma.$disconnect();
}

main().catch(console.error);
