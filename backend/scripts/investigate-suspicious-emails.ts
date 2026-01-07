/**
 * Investigate suspicious snippet/body mismatches
 * Run: npx ts-node backend/scripts/investigate-suspicious-emails.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('===== INVESTIGATING SUSPICIOUS EMAILS =====\n');

  const suspiciousIds = [
    'cmk42lygx0001hkyh85qaf5cp',
    'cmk42lyh30002hkyhqsfva7m9',
    'cmk42lyh50003hkyh7j8ic8kc',
  ];

  for (const id of suspiciousIds) {
    const email = await prisma.email.findUnique({
      where: { id },
      select: {
        id: true,
        externalId: true,
        subject: true,
        from: true,
        snippet: true,
        bodyText: true,
        bodyHtml: true,
        folder: true,
        createdAt: true,
        isBodyFetched: true,
        provider: {
          select: { providerType: true, email: true },
        },
      },
    });

    if (!email) {
      console.log(`Email ${id} not found\n`);
      continue;
    }

    console.log(`Email ID: ${email.id}`);
    console.log(`Provider: ${email.provider?.providerType} - ${email.provider?.email}`);
    console.log(`ExternalId: ${email.externalId}`);
    console.log(`Folder: ${email.folder}`);
    console.log(`Created: ${email.createdAt}`);
    console.log(`isBodyFetched: ${email.isBodyFetched}`);
    console.log(`\nSubject: ${email.subject}`);
    console.log(`From: ${email.from}`);
    console.log(`\nSnippet (full):\n  "${email.snippet}"`);
    console.log(`\nBody Text (first 200 chars):\n  "${email.bodyText?.substring(0, 200)}"`);
    console.log(`\nBody HTML (first 200 chars):\n  "${email.bodyHtml?.substring(0, 200)}"`);

    // Check if snippet matches subject + body
    const subject = (email.subject || '').toLowerCase();
    const snippet = (email.snippet || '').toLowerCase();
    const body = (email.bodyText || '').toLowerCase();

    const snippetStartsWithSubject = snippet.startsWith(subject.substring(0, 20).toLowerCase());
    const snippetInBody = body.includes(snippet.substring(0, 20));
    const bodyStartsWithSnippet = body.startsWith(snippet.substring(0, 20));

    console.log('\n--- Analysis ---');
    console.log(`Snippet starts with subject: ${snippetStartsWithSubject}`);
    console.log(`Snippet (first 20) in body: ${snippetInBody}`);
    console.log(`Body starts with snippet: ${bodyStartsWithSnippet}`);

    // For calendar invites, snippet often includes subject
    if (snippetStartsWithSubject) {
      console.log('\n=> This is likely a calendar/invite email where snippet includes subject');
      console.log('=> NOT a data corruption issue - snippet format differs from body');
    } else if (!snippetInBody) {
      console.log('\n=> ⚠️ POTENTIAL CORRUPTION: Snippet content not found in body');
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
