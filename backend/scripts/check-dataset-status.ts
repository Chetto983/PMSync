/**
 * Check status of PST dataset import: embeddings, triage, sentiment counts.
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  const tid = 'cmjgylxkg000054yhnjpkmzd9';

  const [embCount, emailCount, triaged, sentiment, labeled, pstEmails] = await Promise.all([
    prisma.embedding.count({ where: { tenantId: tid } }),
    prisma.email.count({ where: { tenantId: tid } }),
    prisma.email.count({ where: { tenantId: tid, aiPriority: { not: null } } }),
    prisma.email.count({ where: { tenantId: tid, aiSentiment: { not: null } } }),
    prisma.email.count({ where: { tenantId: tid, aiLabels: { isEmpty: false } } }),
    prisma.email.count({ where: { tenantId: tid, providerId: 'cmldrhg9u000014yhb853onsl' } }),
  ]);

  // Sample: priority < 5 (full LLM triage, not just pre-filtered)
  const sampleTriaged = await prisma.email.findMany({
    where: { tenantId: tid, aiPriority: { not: null, lt: 5 } },
    select: { subject: true, aiPriority: true, aiSentiment: true, aiLabels: true },
    take: 10,
  });

  // Priority distribution
  const priorityDist = await prisma.email.groupBy({
    by: ['aiPriority'],
    where: { tenantId: tid, aiPriority: { not: null } },
    _count: { id: true },
    orderBy: { aiPriority: 'asc' },
  });

  console.log('='.repeat(55));
  console.log('  DATASET VALIDATION STATUS');
  console.log('='.repeat(55));
  console.log(`  Total emails:      ${emailCount}`);
  console.log(`  PST emails:        ${pstEmails}`);
  console.log(`  Embeddings:        ${embCount}`);
  console.log(`  AI Triaged:        ${triaged}`);
  console.log(`  AI Sentiment:      ${sentiment}`);
  console.log(`  AI Labeled:        ${labeled}`);
  console.log('');

  console.log('  Priority distribution:');
  priorityDist.forEach(p => {
    console.log(`    P${p.aiPriority}: ${p._count.id} emails`);
  });
  console.log('');

  if (sampleTriaged.length > 0) {
    console.log('  Sample triaged emails:');
    sampleTriaged.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.aiPriority}] ${e.aiSentiment || '-'} | ${e.subject?.substring(0, 50)}`);
      if (e.aiLabels) console.log(`     Labels: ${JSON.stringify(e.aiLabels)}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
