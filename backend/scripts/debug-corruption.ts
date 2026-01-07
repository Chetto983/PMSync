/**
 * Debug data corruption - find all Vercel emails and check body/snippet consistency
 * Run: npx ts-node backend/scripts/debug-corruption.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('===== DATA CORRUPTION INVESTIGATION =====\n');

  // 1. Find the corrupted email
  const corruptedEmail = await prisma.email.findUnique({
    where: { id: 'cmk464fp30004okyh3kuvnjd2' },
    select: {
      id: true,
      externalId: true,
      subject: true,
      snippet: true,
      bodyText: true,
      createdAt: true,
      updatedAt: true,
      provider: { select: { providerType: true, email: true } },
    },
  });

  if (corruptedEmail) {
    console.log('CORRUPTED EMAIL:');
    console.log('  ID:', corruptedEmail.id);
    console.log('  ExternalId:', corruptedEmail.externalId);
    console.log('  Provider:', corruptedEmail.provider?.providerType, '-', corruptedEmail.provider?.email);
    console.log('  Subject:', corruptedEmail.subject);
    console.log('  Created:', corruptedEmail.createdAt);
    console.log('  Updated:', corruptedEmail.updatedAt);
    console.log('');
    console.log('  Snippet (first 80):', corruptedEmail.snippet?.substring(0, 80));
    console.log('  Body (first 80):', corruptedEmail.bodyText?.substring(0, 80));
    console.log('');

    // Check if body content matches any OTHER email's snippet
    if (corruptedEmail.bodyText) {
      const bodyFirst30 = corruptedEmail.bodyText.substring(0, 30).toLowerCase();
      const possibleSource = await prisma.email.findFirst({
        where: {
          snippet: { contains: bodyFirst30, mode: 'insensitive' },
          id: { not: corruptedEmail.id },
        },
        select: {
          id: true,
          externalId: true,
          subject: true,
          snippet: true,
        },
      });

      if (possibleSource) {
        console.log('POSSIBLE SOURCE OF WRONG BODY:');
        console.log('  ID:', possibleSource.id);
        console.log('  ExternalId:', possibleSource.externalId);
        console.log('  Subject:', possibleSource.subject);
        console.log('  Snippet (first 80):', possibleSource.snippet?.substring(0, 80));
      } else {
        console.log('No other email matches the wrong body content.');
      }
    }
  } else {
    console.log('Corrupted email not found - may have been fixed already.');
  }

  // 2. Check body population patterns
  console.log('\n===== BODY POPULATION ANALYSIS =====');

  // Get provider for active tenant
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
  });

  if (provider) {
    const stats = await prisma.email.groupBy({
      by: ['isArchived'],
      where: { providerId: provider.id },
      _count: { id: true },
    });

    console.log('\nEmail counts by archive status:');
    for (const s of stats) {
      console.log(`  isArchived=${s.isArchived}: ${s._count.id} emails`);
    }

    const bodyStats = await prisma.$queryRaw<Array<{ has_body: boolean; count: bigint }>>`
      SELECT
        ("bodyText" IS NOT NULL AND LENGTH("bodyText") > 0) as has_body,
        COUNT(*)::bigint as count
      FROM emails
      WHERE "providerId" = ${provider.id}
      GROUP BY has_body
    `;

    console.log('\nEmail counts by body presence:');
    for (const s of bodyStats) {
      console.log(`  has_body=${s.has_body}: ${s.count} emails`);
    }
  }

  // 3. Find all Vercel emails and check consistency
  console.log('\n===== VERCEL EMAILS ANALYSIS =====');
  const vercelEmails = await prisma.email.findMany({
    where: {
      OR: [
        { from: { contains: 'vercel', mode: 'insensitive' } },
        { subject: { contains: 'vercel', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      snippet: true,
      bodyText: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`\nFound ${vercelEmails.length} Vercel emails:`);
  for (const email of vercelEmails) {
    const snippet = email.snippet || '';
    const body = email.bodyText || '';
    const snippetFirst20 = snippet.substring(0, 20).toLowerCase();
    const bodyMatch = body.toLowerCase().includes(snippetFirst20);

    console.log(`\n  ID: ${email.id}`);
    console.log(`  ExternalId: ${email.externalId}`);
    console.log(`  Subject: ${email.subject?.substring(0, 60)}`);
    console.log(`  Snippet: ${snippet.substring(0, 60)}...`);
    console.log(`  Body: ${body.substring(0, 60)}...`);
    console.log(`  Match: ${bodyMatch ? '✓' : '❌ MISMATCH'}`);
  }

  // 4. Look for any other emails with body/snippet mismatch
  console.log('\n===== MISMATCH SCAN (all emails) =====');
  const allEmailsWithBoth = await prisma.email.findMany({
    where: {
      bodyText: { not: null },
      snippet: { not: null },
    },
    select: {
      id: true,
      subject: true,
      snippet: true,
      bodyText: true,
    },
    take: 500,
  });

  let mismatchCount = 0;
  for (const email of allEmailsWithBoth) {
    const snippet = email.snippet || '';
    const body = email.bodyText || '';

    if (snippet.length < 10 || body.length < 10) continue;

    const snippetFirst15 = snippet.substring(0, 15).toLowerCase();
    const bodyLower = body.toLowerCase();

    // Only flag if snippet doesn't appear ANYWHERE in body (not just at start)
    if (!bodyLower.includes(snippetFirst15)) {
      mismatchCount++;
      if (mismatchCount <= 5) {
        console.log(`\nMISMATCH #${mismatchCount}:`);
        console.log(`  ID: ${email.id}`);
        console.log(`  Subject: ${email.subject?.substring(0, 50)}`);
        console.log(`  Snippet: "${snippetFirst15}..."`);
        console.log(`  Body: "${body.substring(0, 50)}..."`);
      }
    }
  }
  console.log(`\nTotal mismatches found: ${mismatchCount} / ${allEmailsWithBoth.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
