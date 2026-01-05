/**
 * Deep Audit: Email Embeddings Usage
 * Run: npx ts-node scripts/audit-embeddings.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function main() {
  console.log('=== EMAIL EMBEDDING DEEP AUDIT ===\n');

  // 1. Count embeddings
  const embeddingCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT COUNT(*) as count FROM embeddings'
  );
  const embCount = Number(embeddingCount[0].count);
  console.log(`Total embeddings: ${embCount.toLocaleString()}`);

  // 2. Get embedding table size
  const tableSize = await prisma.$queryRawUnsafe<Array<{ size: string }>>(
    `SELECT pg_size_pretty(pg_total_relation_size('embeddings')) as size`
  );
  console.log(`Embedding table size: ${tableSize[0].size}`);

  // 3. Get email count
  const emailCount = await prisma.email.count();
  console.log(`Total emails: ${emailCount.toLocaleString()}`);

  // 4. Coverage calculation
  const coverage = emailCount > 0 ? (embCount / emailCount * 100).toFixed(1) : '0';
  console.log(`Embedding coverage: ${coverage}%`);

  // 5. Check if embeddings are being used
  console.log('\n=== EMBEDDING USAGE ANALYSIS ===\n');

  // Check emails without embeddings (by looking at metadata)
  const emailsWithEmbeddings = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(DISTINCT (metadata->>'emailId')::text) as count
     FROM embeddings
     WHERE metadata->>'emailId' IS NOT NULL`
  );
  console.log(`Emails with embeddings: ${Number(emailsWithEmbeddings[0].count).toLocaleString()}`);

  // 6. Sample embedding to understand content
  const sampleEmbedding = await prisma.$queryRawUnsafe<Array<{
    id: string;
    documentName: string | null;
    content: string;
    metadata: any;
    embeddingModel: string;
  }>>(
    `SELECT id, "documentName", LEFT(content, 200) as content, metadata, "embeddingModel"
     FROM embeddings
     LIMIT 3`
  );

  console.log('\n=== SAMPLE EMBEDDINGS ===\n');
  sampleEmbedding.forEach((e, i) => {
    console.log(`[${i + 1}] ID: ${e.id}`);
    console.log(`    Model: ${e.embeddingModel}`);
    console.log(`    Doc: ${e.documentName || 'N/A'}`);
    console.log(`    Content: ${e.content.substring(0, 100)}...`);
    console.log(`    Metadata: ${JSON.stringify(e.metadata)?.substring(0, 100)}`);
    console.log();
  });

  // 7. Cost analysis
  console.log('=== COST & PERFORMANCE ANALYSIS ===\n');

  // Estimate embedding cost (Mistral embed is ~$0.1 per 1M tokens, ~6000 chars = ~1500 tokens avg)
  const avgTokensPerEmbed = 1500;
  const costPer1MTokens = 0.1; // Mistral embed pricing
  const totalTokensEstimate = embCount * avgTokensPerEmbed;
  const totalCostEstimate = (totalTokensEstimate / 1_000_000) * costPer1MTokens;

  console.log(`Estimated tokens used: ${(totalTokensEstimate / 1_000_000).toFixed(2)}M`);
  console.log(`Estimated cost so far: $${totalCostEstimate.toFixed(2)}`);
  console.log(`Cost per 1000 emails: $${(totalCostEstimate / emailCount * 1000).toFixed(4)}`);

  // 8. Recommendations
  console.log('\n=== RECOMMENDATIONS ===\n');

  if (embCount < emailCount * 0.1) {
    console.log('⚠️  LOW COVERAGE: Only ' + coverage + '% of emails have embeddings');
    console.log('   Consider: Disable embeddings and rely on GIN trigram search');
  }

  console.log(`
OPTIONS FOR REMOVING EMAIL EMBEDDINGS:

1. KEEP EMBEDDINGS (Current State)
   ✓ Enables semantic search ("emails about project deadlines")
   ✓ Powers AI assistant context retrieval
   ✗ API costs for Mistral embed
   ✗ Storage overhead (${tableSize[0].size})
   ✗ Sync latency (queue processing)

2. REMOVE EMBEDDINGS, USE GIN TRIGRAM ONLY
   ✓ Zero API costs
   ✓ Instant search (no queue delay)
   ✓ Smaller database
   ✗ Keyword-only search (no semantic understanding)
   ✗ AI assistant loses smart context retrieval

3. HYBRID APPROACH (RECOMMENDED)
   ✓ Use GIN trigram for basic UI search
   ✓ Keep embeddings ONLY for AI assistant features
   ✓ Make embedding optional (disable for cost-sensitive users)
   ✓ Add flag: enableSemanticSearch in tenant settings

FILES TO MODIFY FOR OPTION 2 (REMOVE EMBEDDINGS):
- base-email-sync.service.ts (lines 894, 1120) - Remove enqueue calls
- google-sync.service.ts - Remove embedding queue DI
- microsoft-sync.service.ts - Remove embedding queue DI
- imap-sync.service.ts - Remove embedding queue DI
- emails.service.ts (line 727, 741, 1466) - Remove deleteEmbeddings calls
- email-cleanup.service.ts (lines 429-441) - Remove embedding cleanup
- hybrid-retriever.ts - Disable vectorSearch, use only keywordSearch

FILES TO MODIFY FOR OPTION 3 (HYBRID):
- Add tenant setting: enableSemanticSearch (default: false)
- Modify base-email-sync.service.ts to check setting before enqueueing
- Keep hybrid-retriever.ts but fallback gracefully if no embeddings
`);

  console.log('\n=== AUDIT COMPLETE ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
