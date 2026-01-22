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

async function analyze() {
  console.log('\n========================================');
  console.log('   DETAILED TOOL CALL ANALYSIS');
  console.log('========================================\n');

  // Get all messages with full parts
  const messages = await prisma.$queryRaw<any[]>`
    SELECT message_id, role, parts, metadata, created_at
    FROM voltagent_memory_messages
    WHERE conversation_id LIKE 'bruteforce-%'
    ORDER BY created_at DESC
    LIMIT 300
  `;

  console.log('Total messages:', messages.length);

  // Analyze all part types
  const partTypes: Record<string, number> = {};
  const toolCalls: { name: string; args: any; result?: any }[] = [];
  const toolErrors: { name: string; args: any; error: string }[] = [];

  for (const msg of messages) {
    const parts = typeof msg.parts === 'string' ? JSON.parse(msg.parts) : msg.parts || [];

    for (const part of parts) {
      partTypes[part.type] = (partTypes[part.type] || 0) + 1;

      // Collect tool invocations - stored as "tool-{toolname}" format
      if (part.type.startsWith('tool-')) {
        const toolName = part.type.replace('tool-', '');
        const args = part.args || part.arguments || part.toolCallArgs || {};
        const result = part.result || part.toolResult;

        toolCalls.push({ name: toolName, args, result });

        // Check for errors
        const resultStr = result ? JSON.stringify(result) : '';
        if (result && (part.state === 'error' || part.isError ||
            resultStr.toLowerCase().includes('"error"') ||
            resultStr.includes('Error:') ||
            resultStr.includes('failed'))) {
          toolErrors.push({
            name: toolName,
            args,
            error: resultStr.substring(0, 400)
          });
        }
      }
    }
  }

  console.log('\n=== PART TYPES FOUND ===');
  console.log(JSON.stringify(partTypes, null, 2));

  console.log('\n=== TOOL CALLS ===');
  console.log('Total tool invocations:', toolCalls.length);

  // Group by tool name
  const toolsByName: Record<string, number> = {};
  for (const tc of toolCalls) {
    toolsByName[tc.name] = (toolsByName[tc.name] || 0) + 1;
  }
  console.log('\nBy tool name:');
  Object.entries(toolsByName)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}`));

  console.log('\n=== TOOL ERRORS ===');
  console.log('Total errors:', toolErrors.length);
  toolErrors.slice(0, 20).forEach((err, i) => {
    console.log(`\n[${i + 1}] ${err.name}`);
    console.log(`    Args: ${JSON.stringify(err.args).substring(0, 150)}`);
    console.log(`    Error: ${err.error}`);
  });

  // Sample some tool calls with results
  console.log('\n=== SAMPLE TOOL CALL RESULTS ===');
  const sampledTools = new Set<string>();
  for (const tc of toolCalls) {
    if (!sampledTools.has(tc.name) && tc.result) {
      sampledTools.add(tc.name);
      console.log(`\n[${tc.name}]`);
      console.log(`  Args: ${JSON.stringify(tc.args).substring(0, 200)}`);
      console.log(`  Result: ${JSON.stringify(tc.result).substring(0, 300)}`);
      if (sampledTools.size >= 10) break;
    }
  }

  await prisma.$disconnect();
}

analyze().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
