/**
 * P5 Deep Conversation Context Validation
 *
 * CRITICAL TEST: Validates that the LLM does NOT forget context across turns.
 *
 * Tests:
 * 1. BASIC MEMORY: Tell agent info in turn 1, ask about it in turn 3
 * 2. LONG CONTEXT: 12+ turn conversation, verify compaction preserves key facts
 * 3. CROSS-REFERENCE: Info from multiple turns combined in response
 * 4. PERSISTENCE: Same conversationId across "sessions" retains history
 * 5. ISOLATION: Different conversationId has NO memory leak
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { ConfigService } from '@nestjs/config';

const prisma = createPrismaClient();

// Test results
interface TestCase {
  name: string;
  category: 'basic' | 'long_context' | 'cross_ref' | 'persistence' | 'isolation';
  passed: boolean;
  expected: string;
  actual: string;
  turnCount: number;
}

const results: TestCase[] = [];

// Configuration
const TEST_TENANT_ID = 'cmk2x2zwj0000s4yh5nlq8izj'; // Italian RAG Test tenant

// ============================================================================
// MistralService mock for LLM calls
// ============================================================================
async function createMistralService(): Promise<{
  completePrompt: (params: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<string>;
} | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('  ⚠️  MISTRAL_API_KEY not set - LLM tests will be skipped');
    return null;
  }

  try {
    const { Mistral } = await import('@mistralai/mistralai');
    const client = new Mistral({ apiKey });

    return {
      completePrompt: async (params) => {
        const messages: { role: 'system' | 'user'; content: string }[] = [];
        if (params.systemPrompt) {
          messages.push({ role: 'system', content: params.systemPrompt });
        }
        messages.push({ role: 'user', content: params.userPrompt });

        const response = await client.chat.complete({
          model: 'mistral-small-latest',
          messages,
          temperature: params.temperature ?? 0.3,
          maxTokens: params.maxTokens ?? 512,
        });

        const content = response.choices?.[0]?.message?.content;
        // Handle both string and ContentChunk[] return types
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          return content
            .filter((c): c is { type: 'text'; text: string } => (c as any).type === 'text')
            .map((c) => c.text)
            .join('');
        }
        return '';
      },
    };
  } catch (error) {
    console.log(`  ⚠️  Mistral init failed: ${error}`);
    return null;
  }
}

// ============================================================================
// Simulated Conversation Memory (mimics VoltAgent Memory API)
// ============================================================================
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

class ConversationMemory {
  private conversations: Map<string, Message[]> = new Map();

  addMessage(conversationId: string, message: Message): void {
    const messages = this.conversations.get(conversationId) || [];
    messages.push(message);
    this.conversations.set(conversationId, messages);
  }

  getMessages(conversationId: string, limit = 50): Message[] {
    const messages = this.conversations.get(conversationId) || [];
    return messages.slice(-limit);
  }

  formatForContext(conversationId: string, limit = 50): string {
    const messages = this.getMessages(conversationId, limit);
    if (messages.length === 0) return '';

    return messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
  }

  // Simulate compaction (>10 messages)
  compactIfNeeded(conversationId: string): { summary?: string; recent: Message[] } {
    const messages = this.getMessages(conversationId);
    if (messages.length <= 10) {
      return { recent: messages };
    }

    // Keep last 6 messages, summarize older ones
    const oldMessages = messages.slice(0, -6);
    const recentMessages = messages.slice(-6);

    const summaryPoints = oldMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.substring(0, 100))
      .join('; ');

    return {
      summary: `Previous conversation context: ${summaryPoints}`,
      recent: recentMessages,
    };
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}

// ============================================================================
// Test Helpers
// ============================================================================
function log(
  category: TestCase['category'],
  name: string,
  passed: boolean,
  expected: string,
  actual: string,
  turnCount: number,
) {
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${name} (${turnCount} turns)`);
  if (!passed) {
    console.log(`     Expected: ${expected.slice(0, 80)}`);
    console.log(`     Actual: ${actual.slice(0, 80)}`);
  }
  results.push({ name, category, passed, expected, actual, turnCount });
}

async function chat(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
  memory: ConversationMemory,
  conversationId: string,
  userMessage: string,
): Promise<string> {
  // Get context
  const { summary, recent } = memory.compactIfNeeded(conversationId);

  let contextSection = '';
  if (summary) {
    contextSection += `\n\nCONVERSATION SUMMARY:\n${summary}`;
  }
  if (recent.length > 0) {
    contextSection += `\n\nRECENT MESSAGES:\n${recent.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`;
  }

  const systemPrompt = `You are a helpful email assistant. You have access to the user's conversation history below.
IMPORTANT: You must remember and reference information from the conversation history when relevant.
If the user told you something earlier (like their name, preferences, or facts), recall and use that information.
${contextSection}`;

  const response = await mistral.completePrompt({
    systemPrompt,
    userPrompt: userMessage,
    temperature: 0.3,
    maxTokens: 300,
  });

  // Store both messages
  memory.addMessage(conversationId, {
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });
  memory.addMessage(conversationId, {
    role: 'assistant',
    content: response,
    timestamp: new Date(),
  });

  return response;
}

// ============================================================================
// TEST 1: Basic Memory (3 turns)
// ============================================================================
async function testBasicMemory(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 1: BASIC MEMORY (Tell info, ask about it 2 turns later)');
  console.log('='.repeat(70));

  const memory = new ConversationMemory();
  const convId = `test-basic-${Date.now()}`;

  // Turn 1: Tell the agent a fact
  const r1 = await chat(mistral, memory, convId, 'My name is Marco Rossi and I work at TechCorp as a software engineer.');
  console.log(`  Turn 1 - User: "My name is Marco..."  → AI acknowledged`);

  // Turn 2: Unrelated question
  await chat(mistral, memory, convId, 'What time is it in New York right now?');
  console.log(`  Turn 2 - User: "What time in NY?"  → AI responded`);

  // Turn 3: Ask about the fact from turn 1
  const r3 = await chat(mistral, memory, convId, 'What is my name and where do I work?');
  console.log(`  Turn 3 - User: "What is my name?"  → Checking response...`);

  const hasName = r3.toLowerCase().includes('marco');
  const hasCompany = r3.toLowerCase().includes('techcorp');

  log('basic', 'LLM remembers name from turn 1', hasName, 'Marco', r3, 3);
  log('basic', 'LLM remembers company from turn 1', hasCompany, 'TechCorp', r3, 3);
}

// ============================================================================
// TEST 2: Long Context (12+ turns with compaction)
// ============================================================================
async function testLongContext(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 2: LONG CONTEXT (12 turns, compaction kicks in)');
  console.log('='.repeat(70));

  const memory = new ConversationMemory();
  const convId = `test-long-${Date.now()}`;

  // Turn 1-2: Key facts
  await chat(mistral, memory, convId, 'Important: My project code is PROJECT-ALPHA-2025. Remember this code.');
  await chat(mistral, memory, convId, 'My deadline is January 15th for the ALPHA milestone.');

  // Turn 3-10: Filler conversation (8 turns)
  for (let i = 3; i <= 10; i++) {
    await chat(mistral, memory, convId, `This is turn ${i}. Tell me a random fact about emails.`);
  }
  console.log(`  Turns 1-10: 10 messages stored, project code and deadline mentioned early`);

  // Turn 11: Verify compaction preserves key info
  const r11 = await chat(mistral, memory, convId, 'What was my project code that I mentioned at the start?');
  console.log(`  Turn 11: Asked about project code...`);

  // Turn 12: Verify another key fact
  const r12 = await chat(mistral, memory, convId, 'And what was my deadline?');
  console.log(`  Turn 12: Asked about deadline...`);

  const hasProjectCode = r11.includes('ALPHA') || r11.includes('PROJECT') || r11.includes('2025');
  const hasDeadline = r12.toLowerCase().includes('january') || r12.toLowerCase().includes('15');

  log('long_context', 'Compacted context preserves project code', hasProjectCode, 'PROJECT-ALPHA-2025', r11, 12);
  log('long_context', 'Compacted context preserves deadline', hasDeadline, 'January 15th', r12, 12);
}

// ============================================================================
// TEST 3: Cross-Reference (Combine info from multiple turns)
// ============================================================================
async function testCrossReference(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 3: CROSS-REFERENCE (Combine info from multiple turns)');
  console.log('='.repeat(70));

  const memory = new ConversationMemory();
  const convId = `test-crossref-${Date.now()}`;

  // Turn 1: Person info
  await chat(mistral, memory, convId, 'I need to email Giovanni, who is our CFO.');

  // Turn 2: Topic info
  await chat(mistral, memory, convId, 'The email is about the Q4 budget review.');

  // Turn 3: Deadline info
  await chat(mistral, memory, convId, 'The budget needs to be approved by Friday.');

  // Turn 4: Ask to combine all info
  const r4 = await chat(
    mistral,
    memory,
    convId,
    'Can you summarize who I need to email, about what topic, and by when?',
  );
  console.log(`  Turn 4: Asked to combine all info from turns 1-3`);

  const hasGiovanni = r4.toLowerCase().includes('giovanni');
  const hasBudget = r4.toLowerCase().includes('budget') || r4.toLowerCase().includes('q4');
  const hasFriday = r4.toLowerCase().includes('friday');

  log('cross_ref', 'Combines person from turn 1', hasGiovanni, 'Giovanni', r4, 4);
  log('cross_ref', 'Combines topic from turn 2', hasBudget, 'budget/Q4', r4, 4);
  log('cross_ref', 'Combines deadline from turn 3', hasFriday, 'Friday', r4, 4);
}

// ============================================================================
// TEST 4: Persistence (Same conversationId retains history)
// ============================================================================
async function testPersistence(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 4: PERSISTENCE (Same conversationId retains history)');
  console.log('='.repeat(70));

  // Use a shared memory instance (simulating database persistence)
  const sharedMemory = new ConversationMemory();
  const persistentConvId = `persistent-conv-${Date.now()}`;

  // "Session 1": Store a fact
  console.log('  Session 1: Storing preference...');
  await chat(mistral, sharedMemory, persistentConvId, 'My preferred email style is formal and concise.');

  // "Session 2": Retrieve the fact (same memory, same convId)
  console.log('  Session 2: Asking about preference...');
  const r2 = await chat(
    mistral,
    sharedMemory,
    persistentConvId,
    'What email style do I prefer? Remind me.',
  );

  const hasFormal = r2.toLowerCase().includes('formal');
  const hasConcise = r2.toLowerCase().includes('concise');

  log('persistence', 'Recalls "formal" preference', hasFormal, 'formal', r2, 2);
  log('persistence', 'Recalls "concise" preference', hasConcise, 'concise', r2, 2);
}

// ============================================================================
// TEST 5: Isolation (Different conversationId has NO memory leak)
// ============================================================================
async function testIsolation(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 5: ISOLATION (Different conversationId has NO memory leak)');
  console.log('='.repeat(70));

  const memory = new ConversationMemory();
  const convA = `conv-A-${Date.now()}`;
  const convB = `conv-B-${Date.now()}`;

  // Conversation A: Store a secret
  const secretCode = `SECRET-${Date.now()}`;
  await chat(mistral, memory, convA, `My secret code is ${secretCode}. Do not share this with anyone.`);
  console.log(`  Conv A: Stored secret code ${secretCode}`);

  // Conversation B: Try to access it
  const rB = await chat(mistral, memory, convB, 'What is my secret code?');
  console.log(`  Conv B: Asked about secret code (should NOT know it)`);

  // Check that conversation B does NOT have the secret
  const leaksSecret = rB.includes(secretCode) || rB.includes('SECRET');
  const correctlyUnknown =
    rB.toLowerCase().includes("don't") ||
    rB.toLowerCase().includes("haven't") ||
    rB.toLowerCase().includes('not') ||
    rB.toLowerCase().includes('no secret') ||
    rB.toLowerCase().includes('unknown') ||
    rB.toLowerCase().includes("don't have") ||
    !leaksSecret;

  log(
    'isolation',
    'Conversation B does NOT leak secret from A',
    !leaksSecret,
    'No secret visible',
    leaksSecret ? 'SECURITY BREACH!' : 'Properly isolated',
    2,
  );
}

// ============================================================================
// TEST 6: Real VoltAgent Integration (uses actual database)
// ============================================================================
async function testRealDatabaseContext(
  mistral: NonNullable<Awaited<ReturnType<typeof createMistralService>>>,
) {
  console.log('\n' + '='.repeat(70));
  console.log(' TEST 6: REAL DATABASE CONTEXT (AIMemory persistence)');
  console.log('='.repeat(70));

  // Get a test user
  const user = await prisma.user.findFirst({
    where: { tenantId: TEST_TENANT_ID },
    select: { id: true },
  });

  if (!user) {
    console.log('  ⚠️  Skipped: No test user found');
    return;
  }

  const testConvId = `db-conv-${Date.now()}`;

  // Store conversation in AIMemory (simulating what VoltAgent does)
  await prisma.aIMemory.create({
    data: {
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      content: JSON.stringify({
        role: 'user',
        content: 'I prefer replies in Italian language.',
      }),
      memoryType: 'INTERACTION',
      source: 'CONVERSATION',
      category: testConvId,
    },
  });

  await prisma.aIMemory.create({
    data: {
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      content: JSON.stringify({
        role: 'assistant',
        content: 'Capito! Risponderò in italiano.',
      }),
      memoryType: 'INTERACTION',
      source: 'CONVERSATION',
      category: testConvId,
    },
  });
  console.log('  Stored 2 messages in AIMemory database');

  // Load and verify
  const stored = await prisma.aIMemory.findMany({
    where: {
      tenantId: TEST_TENANT_ID,
      userId: user.id,
      category: testConvId,
    },
    orderBy: { createdAt: 'asc' },
  });

  const hasUserMsg = stored.some((m) => m.content.includes('Italian'));
  const hasAssistantMsg = stored.some((m) => m.content.includes('italiano'));

  log('persistence', 'AIMemory stores user message', hasUserMsg, 'Italian language', stored.length.toString(), 2);
  log('persistence', 'AIMemory stores assistant message', hasAssistantMsg, 'italiano', stored.length.toString(), 2);

  // Cleanup
  await prisma.aIMemory.deleteMany({
    where: { category: testConvId },
  });
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║       P5 DEEP CONVERSATION CONTEXT VALIDATION                        ║');
  console.log('║       Validates LLM does NOT forget context across turns             ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const mistral = await createMistralService();

  if (!mistral) {
    console.log('\n❌ Cannot run tests without Mistral API key');
    console.log('   Set MISTRAL_API_KEY in environment');
    process.exit(1);
  }

  try {
    await testBasicMemory(mistral);
    await testLongContext(mistral);
    await testCrossReference(mistral);
    await testPersistence(mistral);
    await testIsolation(mistral);
    await testRealDatabaseContext(mistral);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log(' CONVERSATION CONTEXT VALIDATION SUMMARY');
    console.log('='.repeat(70));

    const categories = ['basic', 'long_context', 'cross_ref', 'persistence', 'isolation'] as const;

    let totalPassed = 0;
    let totalTests = 0;

    console.log('\n  Category            | Passed | Total | Score');
    console.log('  --------------------|--------|-------|------');

    for (const cat of categories) {
      const catResults = results.filter((r) => r.category === cat);
      const passed = catResults.filter((r) => r.passed).length;
      const total = catResults.length;
      const score = total > 0 ? ((passed / total) * 100).toFixed(0) : 'N/A';

      totalPassed += passed;
      totalTests += total;

      console.log(
        `  ${cat.padEnd(19)} | ${String(passed).padStart(6)} | ${String(total).padStart(5)} | ${String(score).padStart(4)}%`,
      );
    }

    console.log('  --------------------|--------|-------|------');
    const finalScore = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(0) : '0';
    console.log(`  TOTAL               | ${String(totalPassed).padStart(6)} | ${String(totalTests).padStart(5)} | ${finalScore}%`);

    // Verdict
    console.log('\n');
    const overallScore = totalTests > 0 ? totalPassed / totalTests : 0;

    if (overallScore >= 0.9) {
      console.log('  🎉 CONTEXT VALIDATION PASSED - LLM maintains conversation memory');
    } else if (overallScore >= 0.7) {
      console.log('  ⚠️  CONTEXT VALIDATION PARTIAL - Some memory issues detected');
    } else {
      console.log('  ❌ CONTEXT VALIDATION FAILED - LLM is forgetting context!');
    }

    // Failures
    const failures = results.filter((r) => !r.passed);
    if (failures.length > 0) {
      console.log('\n  FAILURES:');
      failures.forEach((f) => {
        console.log(`    ❌ [${f.category}] ${f.name}`);
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
