import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  name?: string;
  result?: any;
  isError?: boolean;
  args?: any;
}

async function analyze() {
  console.log('\n========================================');
  console.log('   BRUTEFORCE TEST DATABASE ANALYSIS');
  console.log('========================================\n');

  // 1. Get conversation messages from bruteforce test
  const messages = await prisma.$queryRaw<any[]>`
    SELECT message_id, role, parts, metadata, created_at
    FROM voltagent_memory_messages
    WHERE conversation_id LIKE 'bruteforce-%'
    ORDER BY created_at DESC
    LIMIT 200
  `;

  console.log('=== CONVERSATION MESSAGES ===');
  console.log('Total messages found:', messages.length);

  let toolCallCount = 0;
  let toolResultCount = 0;
  const toolErrors: { tool: string; error: string; args?: string }[] = [];
  const textMessages = new Map<string, number>();
  const toolCallsByName: Record<string, number> = {};
  const toolResultsByName: Record<string, number> = {};
  const llmResponses: { role: string; text: string }[] = [];

  for (const msg of messages) {
    const parts: MessagePart[] = typeof msg.parts === 'string' ? JSON.parse(msg.parts) : msg.parts || [];

    for (const part of parts) {
      // Count tool calls
      if (part.type === 'tool-call') {
        toolCallCount++;
        const toolName = part.toolName || part.name || 'unknown';
        toolCallsByName[toolName] = (toolCallsByName[toolName] || 0) + 1;
      }

      // Count tool results and errors
      if (part.type === 'tool-result') {
        toolResultCount++;
        const toolName = part.toolName || part.name || 'unknown';
        toolResultsByName[toolName] = (toolResultsByName[toolName] || 0) + 1;

        if (part.result) {
          const resultStr = JSON.stringify(part.result);
          if (part.isError || resultStr.toLowerCase().includes('"error"') || resultStr.includes('Error:')) {
            toolErrors.push({
              tool: toolName,
              error: resultStr.substring(0, 400),
              args: part.args ? JSON.stringify(part.args).substring(0, 200) : undefined
            });
          }
        }
      }

      // Track text messages for duplicates
      if (part.type === 'text' && part.text) {
        const textKey = part.text.substring(0, 150).trim();
        textMessages.set(textKey, (textMessages.get(textKey) || 0) + 1);

        // Collect LLM responses for analysis
        if (msg.role === 'assistant') {
          llmResponses.push({ role: msg.role, text: part.text });
        }
      }
    }
  }

  // 2. Analyze HITL Actions (ActionQueue model)
  const actions = await prisma.actionQueue.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  console.log('\n=== HITL ACTIONS (Last 15 min) ===');
  console.log('Total actions:', actions.length);

  const actionsByStatus: Record<string, number> = {};
  const actionsByType: Record<string, number> = {};
  const rejectedActions: { type: string; status: string; summary: string; reason?: string }[] = [];

  for (const action of actions) {
    actionsByStatus[action.status] = (actionsByStatus[action.status] || 0) + 1;
    actionsByType[action.actionType] = (actionsByType[action.actionType] || 0) + 1;

    if (action.status === 'REJECTED' || action.status === 'EXPIRED' || action.status === 'FAILED') {
      const payload = action.actionPayload as any;
      rejectedActions.push({
        type: action.actionType,
        status: action.status,
        summary: (payload?.summary || action.actionType || '').substring(0, 150),
        reason: payload?.rejectionReason || undefined
      });
    }
  }

  // 3. Print Results
  console.log('\n=== TOOL CALLS SUMMARY ===');
  console.log('Total tool calls:', toolCallCount);
  console.log('Total tool results:', toolResultCount);
  console.log('\nTool calls by name:');
  Object.entries(toolCallsByName)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}`));

  console.log('\n=== TOOL ERRORS ===');
  console.log('Total errors:', toolErrors.length);
  if (toolErrors.length > 0) {
    console.log('\nError details:');
    toolErrors.slice(0, 15).forEach((err, i) => {
      console.log(`\n[${i + 1}] Tool: ${err.tool}`);
      if (err.args) console.log(`    Args: ${err.args}`);
      console.log(`    Error: ${err.error}`);
    });
  }

  console.log('\n=== DUPLICATE MESSAGES ===');
  const duplicates = Array.from(textMessages.entries())
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  if (duplicates.length > 0) {
    console.log('Found duplicates:');
    duplicates.slice(0, 10).forEach(([text, count]) => {
      console.log(`  [${count}x] "${text.substring(0, 80)}..."`);
    });
  } else {
    console.log('No duplicate messages found');
  }

  console.log('\n=== HITL ACTIONS BY STATUS ===');
  console.log(JSON.stringify(actionsByStatus, null, 2));

  console.log('\n=== HITL ACTIONS BY TYPE ===');
  console.log(JSON.stringify(actionsByType, null, 2));

  if (rejectedActions.length > 0) {
    console.log('\n=== REJECTED/ERROR ACTIONS ===');
    rejectedActions.forEach((action, i) => {
      console.log(`\n[${i + 1}] ${action.type} - ${action.status}`);
      console.log(`    Summary: ${action.summary}`);
      if (action.reason) console.log(`    Reason: ${action.reason}`);
    });
  }

  // 4. LLM Misunderstanding Analysis
  console.log('\n=== LLM RESPONSE ANALYSIS ===');
  const misunderstandings: string[] = [];
  const patterns = [
    /non (ho|riesco|posso) (trovare|accedere|capire)/i,
    /errore|error|failed|fallito/i,
    /mi dispiace|sorry/i,
    /non comprendo|don't understand/i,
    /chiarire|clarify/i,
    /non è possibile|cannot|unable/i
  ];

  for (const resp of llmResponses) {
    for (const pattern of patterns) {
      if (pattern.test(resp.text)) {
        misunderstandings.push(resp.text.substring(0, 200));
        break;
      }
    }
  }

  console.log('Potential misunderstandings/errors in LLM responses:', misunderstandings.length);
  if (misunderstandings.length > 0) {
    misunderstandings.slice(0, 10).forEach((text, i) => {
      console.log(`\n[${i + 1}] "${text}..."`);
    });
  }

  // 5. Summary
  console.log('\n========================================');
  console.log('           SUMMARY REPORT');
  console.log('========================================');
  console.log(`Messages analyzed: ${messages.length}`);
  console.log(`Tool calls: ${toolCallCount}`);
  console.log(`Tool results: ${toolResultCount}`);
  console.log(`Tool errors: ${toolErrors.length}`);
  console.log(`Duplicate messages: ${duplicates.length}`);
  console.log(`HITL actions: ${actions.length}`);
  console.log(`Rejected/Error actions: ${rejectedActions.length}`);
  console.log(`LLM misunderstandings: ${misunderstandings.length}`);

  await prisma.$disconnect();
}

analyze().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
