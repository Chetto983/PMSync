/**
 * Audit a specific AI conversation for tool-call/tool-result consistency.
 *
 * Usage:
 *   npx tsx scripts/audit-conversation.ts <conversationId>
 *   npx tsx scripts/audit-conversation.ts   # defaults to Telegram conversation
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const DEFAULT_CONVERSATION_ID = 'cmn6dmni501mt01ny9tth0pzj';

async function run() {
  const conversationId = process.argv[2] || DEFAULT_CONVERSATION_ID;
  const p = createPrismaClient();

  console.log(`\n=== Auditing conversation: ${conversationId} ===\n`);

  const msgs = await p.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  if (msgs.length === 0) {
    console.log('No messages found.');
    await p.$disconnect();
    return;
  }

  console.log(`Total messages: ${msgs.length}\n`);

  // Collect all tool-call IDs from assistant messages
  const toolCallsInAssistant = new Map<string, { toolName: string; msgIdx: number }>();
  // Collect all tool-result IDs from tool messages
  const toolResultsInTool = new Map<string, { toolName: string; msgIdx: number }>();

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const c = m.content as any;
    const time = m.createdAt.toISOString().slice(11, 19);

    if (m.role === 'user') {
      const text = typeof c === 'string' ? c : c?.text ?? '';
      console.log(`[${i}] ${time} USER | "${text.slice(0, 80)}"`);
    } else if (m.role === 'assistant') {
      if (Array.isArray(c)) {
        const parts = c.map((p: any, j: number) => {
          const type = p?.type ?? '?';
          const extra = [];
          if (p?.toolCallId) extra.push(`id=${p.toolCallId}`);
          if (p?.toolName) extra.push(`tool=${p.toolName}`);
          if (type === 'text') extra.push(`"${(p.text ?? '').slice(0, 40)}"`);
          if (type === 'tool-call') {
            toolCallsInAssistant.set(p.toolCallId, { toolName: p.toolName, msgIdx: i });
          }
          return `  #${j}: ${type} ${extra.join(' ')}`;
        });
        console.log(`[${i}] ${time} ASSISTANT (${c.length} parts) step=${m.stepIndex}`);
        parts.forEach((p: string) => console.log(p));
      } else {
        const text = typeof c === 'string' ? c : c?.text ?? '';
        console.log(`[${i}] ${time} ASSISTANT | "${text.slice(0, 80)}" step=${m.stepIndex}`);
      }
    } else if (m.role === 'tool') {
      const tcId = m.toolCallId ?? (Array.isArray(c) ? c[0]?.toolCallId : c?.toolCallId) ?? '?';
      const toolName = Array.isArray(c) ? c[0]?.toolName : c?.toolName ?? '?';
      const output = Array.isArray(c) ? c[0]?.output : c?.output;
      const outputPreview = typeof output === 'string'
        ? output.slice(0, 60)
        : JSON.stringify(output)?.slice(0, 60) ?? '?';
      toolResultsInTool.set(tcId, { toolName, msgIdx: i });
      console.log(`[${i}] ${time} TOOL | tcId=${tcId} tool=${toolName} step=${m.stepIndex}`);
      console.log(`  output: ${outputPreview}`);
    }
  }

  // Cross-reference: find orphaned tool-calls (no matching result)
  console.log('\n=== Tool-Call / Tool-Result Consistency ===\n');

  let orphanCount = 0;
  for (const [tcId, info] of toolCallsInAssistant) {
    const result = toolResultsInTool.get(tcId);
    if (!result) {
      console.log(`ORPHANED TOOL-CALL: ${tcId} [${info.toolName}] at msg[${info.msgIdx}] — NO matching tool-result`);
      orphanCount++;
    } else {
      console.log(`OK: ${tcId} [${info.toolName}] msg[${info.msgIdx}] → result at msg[${result.msgIdx}]`);
    }
  }

  // Check for orphaned tool-results (no matching tool-call)
  for (const [tcId, info] of toolResultsInTool) {
    if (!toolCallsInAssistant.has(tcId)) {
      console.log(`ORPHANED TOOL-RESULT: ${tcId} [${info.toolName}] at msg[${info.msgIdx}] — NO matching tool-call in assistant`);
      orphanCount++;
    }
  }

  if (orphanCount === 0) {
    console.log('\nAll tool-calls have matching tool-results. Conversation is clean.');
  } else {
    console.log(`\n${orphanCount} orphaned tool-call(s)/result(s) found. This causes AI_MissingToolResultsError.`);
  }

  await p.$disconnect();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
