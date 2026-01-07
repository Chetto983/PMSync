/**
 * Debug the 2 failed tests in test-email-agent-rigorous.ts
 * Run: npx ts-node backend/scripts/debug-test-failures.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get tenant
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { tenantId: true },
  });
  const tenantId = provider?.tenantId;

  console.log('===== INVESTIGATING FAILED TESTS =====');
  console.log('Tenant:', tenantId);

  // Get the same 5 emails the test uses
  const emails = await prisma.email.findMany({
    where: {
      tenantId,
      OR: [{ bodyText: { not: null } }, { bodyHtml: { not: null } }],
    },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      bodyText: true,
      bodyHtml: true,
      snippet: true,
      receivedAt: true,
    },
    take: 5,
    orderBy: { receivedAt: 'desc' },
  });

  console.log(`\nFound ${emails.length} emails to analyze\n`);

  console.log('===== FAILURE 1: Required Fields Check =====');
  let completeCount = 0;
  for (const email of emails) {
    const hasFrom = Boolean(email.from);
    const hasTo = Boolean(email.to);
    const hasBody = Boolean(email.bodyText || email.bodyHtml);
    const hasDate = Boolean(email.receivedAt);
    const complete = hasFrom && hasTo && hasBody && hasDate;

    if (complete) {
      completeCount++;
    } else {
      console.log('\n❌ INCOMPLETE EMAIL:');
      console.log('  ID:', email.id);
      console.log('  Subject:', email.subject?.substring(0, 50));
      console.log('  from:', email.from ? '✓' : '<<MISSING>>');
      console.log('  to:', email.to ? '✓' : '<<MISSING>>');
      console.log('  hasBody:', hasBody ? '✓' : '<<MISSING>>');
      console.log('  receivedAt:', email.receivedAt ? '✓' : '<<MISSING>>');
    }
  }
  console.log(`\nResult: ${completeCount}/${emails.length} complete`);

  console.log('\n===== FAILURE 2: Snippet Mismatch Check =====');
  let snippetMismatches = 0;
  for (const email of emails) {
    const body = email.bodyText || email.bodyHtml || '';
    const snippet = email.snippet || '';

    if (body && snippet) {
      const snippetFirst20 = snippet.toLowerCase().substring(0, 20);
      const bodyLower = body.toLowerCase();

      if (!bodyLower.includes(snippetFirst20)) {
        snippetMismatches++;
        console.log('\n❌ SNIPPET MISMATCH:');
        console.log('  ID:', email.id);
        console.log('  Subject:', email.subject?.substring(0, 50));
        console.log('  Snippet first 20:', JSON.stringify(snippetFirst20));
        console.log('  Body type:', email.bodyText ? 'bodyText' : 'bodyHtml only');
        console.log('  Body first 100:', JSON.stringify(body.substring(0, 100)));
      }
    }
  }
  console.log(`\nResult: ${snippetMismatches} mismatches`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
