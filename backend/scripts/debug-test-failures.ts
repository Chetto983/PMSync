/**
 * Debug the 2 failed tests in test-email-agent-rigorous.ts
 * Run: npx ts-node backend/scripts/debug-test-failures.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

// SAME as rigorous test
const JUNK_FOLDERS = ['SPAM', 'JUNK', 'TRASH', 'DRAFTS'];

async function main() {
  // Get tenant
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { tenantId: true },
  });
  const tenantId = provider?.tenantId;

  console.log('===== INVESTIGATING FAILED TESTS =====');
  console.log('Tenant:', tenantId);
  console.log('Excluded folders:', JUNK_FOLDERS.join(', '));

  // Show all folder values to check case sensitivity
  const allFolders = await prisma.email.groupBy({
    by: ['folder'],
    where: { tenantId },
    _count: { id: true },
  });
  console.log('\nAll folder values:', allFolders.map(f => `${f.folder}(${f._count.id})`).join(', '));

  // Get the same 5 emails the test uses (EXCLUDING junk folders)
  const emails = await prisma.email.findMany({
    where: {
      tenantId,
      folder: { notIn: JUNK_FOLDERS },
      OR: [{ bodyText: { not: null } }, { bodyHtml: { not: null } }],
    },
    select: {
      id: true,
      folder: true,
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
      console.log('  Folder:', email.folder);
      console.log('  Subject:', email.subject?.substring(0, 50) || '<<NULL>>');
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

  // Check the specific problematic email
  console.log('\n===== DETAILED MISMATCH ANALYSIS =====');
  const mismatchEmail = await prisma.email.findUnique({
    where: { id: 'cmk464fp30004okyh3kuvnjd2' },
    select: {
      subject: true,
      snippet: true,
      bodyText: true,
      folder: true,
      from: true,
      externalId: true,
      provider: { select: { providerType: true } },
    },
  });

  if (mismatchEmail) {
    console.log('Provider:', mismatchEmail.provider?.providerType);
    console.log('ExternalId:', mismatchEmail.externalId);
    console.log('From:', mismatchEmail.from);
    console.log('Subject:', mismatchEmail.subject);
    console.log('\nSnippet (full):');
    console.log(JSON.stringify(mismatchEmail.snippet));
    console.log('\nBodyText (first 300):');
    console.log(JSON.stringify(mismatchEmail.bodyText?.substring(0, 300)));

    // Find other Vercel emails to compare
    console.log('\n===== OTHER VERCEL EMAILS =====');
    const vercelEmails = await prisma.email.findMany({
      where: {
        from: { contains: 'vercel', mode: 'insensitive' },
        id: { not: 'cmk464fp30004okyh3kuvnjd2' },
      },
      select: {
        id: true,
        subject: true,
        snippet: true,
        bodyText: true,
      },
      take: 3,
    });

    for (const e of vercelEmails) {
      console.log('\n  ID:', e.id);
      console.log('  Subject:', e.subject?.substring(0, 50));
      console.log('  Snippet:', e.snippet?.substring(0, 50));
      console.log('  Body:', e.bodyText?.substring(0, 50));
    }
  }

  // Deeper investigation - where did these emails come from?
  console.log('\n===== SOURCE ANALYSIS =====');
  const problemIds = [
    'cmk4482k10000v0yhpir81vrk', // Missing 'from'
    'cmk45f1lv000qmcyhspkzbs3x', // Snippet mismatch
    'cmk43spaf0078hkyhn9094xbm', // Snippet mismatch
    'cmk43snph0071hkyhinnumbxl', // Snippet mismatch
  ];

  const problemEmails = await prisma.email.findMany({
    where: { id: { in: problemIds } },
    select: {
      id: true,
      subject: true,
      from: true,
      folder: true,
      externalId: true,
      createdAt: true,
      provider: { select: { providerType: true, email: true } },
    },
  });

  for (const e of problemEmails) {
    console.log('\nID:', e.id);
    console.log('  Subject:', e.subject?.substring(0, 60) || '<<NULL>>');
    console.log('  From:', e.from || '<<NULL>>');
    console.log('  Folder:', e.folder);
    console.log('  ExternalId:', e.externalId?.substring(0, 30) || '<<NULL>>');
    console.log('  Provider:', e.provider?.providerType, '-', e.provider?.email);
    console.log('  Created:', e.createdAt);
  }

  // Count test-like emails
  const testEmails = await prisma.email.count({
    where: {
      OR: [
        { subject: { contains: 'Driver Integrity' } },
        { externalId: { contains: 'test-' } },
      ],
    },
  });
  console.log('\n===== TEST EMAIL DETECTION =====');
  console.log('Emails matching test patterns:', testEmails);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
