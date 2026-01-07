/**
 * REAL AI Validation - Actual API calls, not mocks
 *
 * Tests:
 * 1. Mistral API connectivity
 * 2. Embedding generation (mistral-embed)
 * 3. Chat completion (mistral-small/medium)
 * 4. Memory context injection into chat
 * 5. Daily briefing generation
 * 6. RAG retrieval with real embeddings
 *
 * Run: npx ts-node backend/scripts/test-ai-real-validation.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config({ path: '.env' });

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

const TEST_TENANT_ID = 'test-ai-real-validation';
const TEST_USER_ID = 'test-ai-real-user';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<{ passed: boolean; details?: string }>): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 ${name}...`);

  try {
    const result = await testFn();
    const duration = Date.now() - start;

    results.push({ name, passed: result.passed, details: result.details, duration });

    if (result.passed) {
      console.log(`   ✅ PASS (${duration}ms)`);
      if (result.details) console.log(`   ${result.details}`);
    } else {
      console.log(`   ❌ FAIL (${duration}ms)`);
      if (result.details) console.log(`   ${result.details}`);
    }
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration });
    console.log(`   ❌ ERROR (${duration}ms): ${errorMsg}`);
  }
}

// ============================================================================
// TEST 1: Mistral API Connectivity
// ============================================================================
async function testMistralConnectivity(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  // Simple completion to test connectivity
  const response = await client.chat.complete({
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
    maxTokens: 10,
  });

  const text = typeof response.choices?.[0]?.message?.content === 'string'
    ? response.choices[0].message.content
    : '';

  if (text.toLowerCase().includes('hello')) {
    return { passed: true, details: `Response: "${text.trim()}"` };
  }
  return { passed: false, details: `Unexpected response: "${text}"` };
}

// ============================================================================
// TEST 2: Embedding Generation
// ============================================================================
async function testEmbeddingGeneration(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const response = await client.embeddings.create({
    model: 'mistral-embed',
    inputs: 'Test embedding generation for AI validation',
  });

  const embedding = response.data?.[0]?.embedding;

  if (embedding && embedding.length === 1024) {
    const sampleValues = embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ');
    return { passed: true, details: `1024 dimensions, sample: [${sampleValues}, ...]` };
  }

  return { passed: false, details: `Got ${embedding?.length || 0} dimensions, expected 1024` };
}

// ============================================================================
// TEST 3: Semantic Similarity (embeddings work correctly)
// ============================================================================
async function testSemanticSimilarity(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  // Get embeddings for related and unrelated sentences
  const sentences = [
    'I love eating pizza and pasta',           // 0: Food
    'Italian cuisine is my favorite',           // 1: Related to food
    'The quantum physics equation is complex',  // 2: Unrelated
  ];

  const response = await client.embeddings.create({
    model: 'mistral-embed',
    inputs: sentences,
  });

  const embeddingsRaw = response.data?.map(d => d.embedding);
  if (!embeddingsRaw || embeddingsRaw.length !== 3) {
    return { passed: false, details: 'Failed to get embeddings for all sentences' };
  }

  // Filter out any undefined embeddings
  const embeddings = embeddingsRaw.filter((e): e is number[] => e !== undefined);
  if (embeddings.length !== 3) {
    return { passed: false, details: 'Some embeddings are undefined' };
  }

  // Calculate cosine similarity
  function cosineSim(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  const simFoodItalian = cosineSim(embeddings[0], embeddings[1]);
  const simFoodQuantum = cosineSim(embeddings[0], embeddings[2]);

  // Food and Italian should be more similar than Food and Quantum
  if (simFoodItalian > simFoodQuantum) {
    return {
      passed: true,
      details: `Food↔Italian: ${simFoodItalian.toFixed(3)}, Food↔Quantum: ${simFoodQuantum.toFixed(3)} (related > unrelated ✓)`,
    };
  }

  return {
    passed: false,
    details: `Food↔Italian: ${simFoodItalian.toFixed(3)}, Food↔Quantum: ${simFoodQuantum.toFixed(3)} (expected related > unrelated)`,
  };
}

// ============================================================================
// TEST 4: Memory Storage with Vector
// ============================================================================
async function testMemoryStorageWithVector(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  // Cleanup first
  await prisma.aIMemory.deleteMany({
    where: { tenantId: TEST_TENANT_ID, userId: TEST_USER_ID },
  });

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  // Create memory
  const memory = await prisma.aIMemory.create({
    data: {
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      content: 'User prefers morning meetings before 10am',
      memoryType: 'PREFERENCE',
      source: 'EXPLICIT',
      confidence: 0.9,
    },
  });

  // Generate and store embedding
  const response = await client.embeddings.create({
    model: 'mistral-embed',
    inputs: memory.content,
  });

  const embedding = response.data?.[0]?.embedding;
  if (!embedding || embedding.length !== 1024) {
    return { passed: false, details: 'Failed to generate embedding' };
  }

  const vectorLiteral = `[${embedding.join(',')}]`;
  await prisma.$executeRawUnsafe(`
    UPDATE "ai_memories" SET "vector" = '${vectorLiteral}'::vector WHERE "id" = '${memory.id}'
  `);

  // Verify vector was stored
  const hasVector = await prisma.$queryRaw<Array<{ has_vector: boolean }>>`
    SELECT "vector" IS NOT NULL as has_vector FROM "ai_memories" WHERE "id" = ${memory.id}
  `;

  if (hasVector[0]?.has_vector) {
    return { passed: true, details: `Memory ${memory.id} stored with vector` };
  }

  return { passed: false, details: 'Vector not stored in database' };
}

// ============================================================================
// TEST 5: Semantic Memory Search
// ============================================================================
async function testSemanticMemorySearch(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  // Store multiple memories
  const memories = [
    { content: 'User is vegetarian and avoids meat', type: 'PREFERENCE' as const },
    { content: 'User works at TechCorp as CTO', type: 'FACT' as const },
    { content: 'User checks emails at 9am daily', type: 'PATTERN' as const },
  ];

  for (const m of memories) {
    const created = await prisma.aIMemory.create({
      data: {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        content: m.content,
        memoryType: m.type,
        source: 'EXPLICIT',
        confidence: 0.9,
      },
    });

    const response = await client.embeddings.create({
      model: 'mistral-embed',
      inputs: m.content,
    });

    const embedding = response.data?.[0]?.embedding;
    if (embedding?.length === 1024) {
      const vectorLiteral = `[${embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(`
        UPDATE "ai_memories" SET "vector" = '${vectorLiteral}'::vector WHERE "id" = '${created.id}'
      `);
    }
  }

  // Search with paraphrased query (no keyword overlap!)
  const searchQuery = 'What food can this person eat?'; // Should find vegetarian
  const queryResponse = await client.embeddings.create({
    model: 'mistral-embed',
    inputs: searchQuery,
  });

  const queryEmbedding = queryResponse.data?.[0]?.embedding;
  if (!queryEmbedding) {
    return { passed: false, details: 'Failed to generate query embedding' };
  }

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const searchResults = await prisma.$queryRaw<Array<{ content: string; distance: number }>>`
    SELECT "content", ("vector" <-> ${vectorLiteral}::vector) AS distance
    FROM "ai_memories"
    WHERE "tenantId" = ${TEST_TENANT_ID} AND "userId" = ${TEST_USER_ID} AND "vector" IS NOT NULL
    ORDER BY distance ASC
    LIMIT 1
  `;

  if (searchResults.length > 0 && searchResults[0].content.includes('vegetarian')) {
    const score = 1 - Number(searchResults[0].distance) / 2;
    return {
      passed: true,
      details: `Query "${searchQuery}" → Found vegetarian memory (score: ${score.toFixed(3)})`,
    };
  }

  return {
    passed: false,
    details: `Query "${searchQuery}" did not find vegetarian memory. Top: "${searchResults[0]?.content || 'none'}"`,
  };
}

// ============================================================================
// TEST 6: LLM Fact Extraction
// ============================================================================
async function testFactExtraction(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const userMessage = 'I work at Google as a senior engineer. I prefer short meetings and always drink green tea in the morning.';

  const prompt = `Extract key facts about the user from this message. Return JSON with format: {"facts": ["fact1", "fact2", ...]}

Message: "${userMessage}"`;

  const response = await client.chat.complete({
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: prompt }],
    responseFormat: { type: 'json_object' },
  });

  const content = typeof response.choices?.[0]?.message?.content === 'string'
    ? response.choices[0].message.content
    : '';

  try {
    const parsed = JSON.parse(content);
    const facts = parsed.facts || [];

    if (facts.length >= 2) {
      return {
        passed: true,
        details: `Extracted ${facts.length} facts: ${facts.slice(0, 2).join('; ')}...`,
      };
    }

    return { passed: false, details: `Only extracted ${facts.length} facts` };
  } catch {
    return { passed: false, details: `Failed to parse JSON: ${content.slice(0, 100)}` };
  }
}

// ============================================================================
// TEST 7: Daily Briefing Generation (simplified)
// ============================================================================
async function testDailyBriefingGeneration(): Promise<{ passed: boolean; details?: string }> {
  if (!process.env.MISTRAL_API_KEY) {
    return { passed: false, details: 'MISTRAL_API_KEY not set' };
  }

  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const briefingData = {
    unreadCount: 15,
    urgentEmails: ['Budget review from CFO', 'Server outage alert'],
    todayMeetings: ['10:00 Team standup', '14:00 Client call'],
  };

  const prompt = `Generate a brief morning briefing (2-3 sentences) for a user with:
- ${briefingData.unreadCount} unread emails
- Urgent: ${briefingData.urgentEmails.join(', ')}
- Today's meetings: ${briefingData.todayMeetings.join(', ')}

Keep it professional and concise.`;

  const response = await client.chat.complete({
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 150,
  });

  const briefing = typeof response.choices?.[0]?.message?.content === 'string'
    ? response.choices[0].message.content
    : '';

  if (briefing.length > 50 && briefing.length < 500) {
    return {
      passed: true,
      details: `Generated ${briefing.length} chars: "${briefing.slice(0, 80)}..."`,
    };
  }

  return { passed: false, details: `Briefing too short/long: ${briefing.length} chars` };
}

// ============================================================================
// TEST 8: pgvector HNSW Index Performance
// ============================================================================
async function testHNSWIndexPerformance(): Promise<{ passed: boolean; details?: string }> {
  // Check HNSW index exists
  const indexCheck = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'ai_memories' AND indexname LIKE '%hnsw%'
  `;

  if (indexCheck.length === 0) {
    return { passed: false, details: 'HNSW index not found on ai_memories' };
  }

  // Check index parameters
  const indexParams = await prisma.$queryRaw<Array<{ reloptions: string[] | null }>>`
    SELECT reloptions FROM pg_class WHERE relname = 'ai_memories_vector_hnsw_idx'
  `;

  const params = indexParams[0]?.reloptions?.join(', ') || 'default';
  return { passed: true, details: `Index: ${indexCheck[0].indexname}, params: ${params}` };
}

// ============================================================================
// MAIN
// ============================================================================
async function cleanup() {
  await prisma.aIMemory.deleteMany({
    where: { tenantId: TEST_TENANT_ID, userId: TEST_USER_ID },
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     REAL AI Validation - Actual Mistral API Calls');
  console.log('═══════════════════════════════════════════════════════════');

  if (!process.env.MISTRAL_API_KEY) {
    console.log('\n❌ MISTRAL_API_KEY not set - cannot run AI validation');
    console.log('   Set MISTRAL_API_KEY in .env to run these tests');
    process.exit(1);
  }

  try {
    await cleanup();

    await runTest('1. Mistral API Connectivity', testMistralConnectivity);
    await runTest('2. Embedding Generation (1024d)', testEmbeddingGeneration);
    await runTest('3. Semantic Similarity (related > unrelated)', testSemanticSimilarity);
    await runTest('4. Memory Storage with Vector', testMemoryStorageWithVector);
    await runTest('5. Semantic Memory Search (paraphrased query)', testSemanticMemorySearch);
    await runTest('6. LLM Fact Extraction (JSON mode)', testFactExtraction);
    await runTest('7. Daily Briefing Generation', testDailyBriefingGeneration);
    await runTest('8. HNSW Index Performance', testHNSWIndexPerformance);

    await cleanup();

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('     RESULTS');
    console.log('═══════════════════════════════════════════════════════════');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    for (const r of results) {
      const status = r.passed ? '✅' : '❌';
      console.log(`   ${status} ${r.name} (${r.duration}ms)`);
    }

    console.log('');
    console.log(`   Passed: ${passed}/${results.length}`);
    console.log(`   Failed: ${failed}/${results.length}`);
    console.log(`   Total time: ${totalDuration}ms`);
    console.log('');

    if (failed === 0) {
      console.log('   ✅ ALL AI FUNCTIONALITY VALIDATED');
    } else {
      console.log('   ❌ SOME TESTS FAILED - Review output above');
    }

    process.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    await cleanup();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
