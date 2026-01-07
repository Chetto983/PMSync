/**
 * Fix corrupted email body by triggering a re-fetch
 *
 * The email cmk464fp30004okyh3kuvnjd2 has mismatched snippet/body:
 * - Snippet: "Hi chetto1983, There was an error deploying mail-agent..."
 * - Body: "Hey chetto1983, completed an activity..." (WRONG)
 *
 * This script sets isArchived=true to trigger a fresh body fetch from Gmail
 *
 * Run: npx ts-node backend/scripts/fix-corrupted-email-body.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const EMAIL_ID = 'cmk464fp30004okyh3kuvnjd2';

async function main() {
  const prisma = createPrismaClient();

  // Check current state
  const email = await prisma.email.findUnique({
    where: { id: EMAIL_ID },
    select: {
      id: true,
      subject: true,
      externalId: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      snippet: true,
      bodyText: true,
    },
  });

  if (!email) {
    console.log('Email not found:', EMAIL_ID);
    await prisma.$disconnect();
    return;
  }

  console.log('Email found:');
  console.log('  ID:', email.id);
  console.log('  Subject:', email.subject);
  console.log('  ExternalId:', email.externalId);
  console.log('  Created:', email.createdAt);
  console.log('  Updated:', email.updatedAt);
  console.log('  IsArchived:', email.isArchived);
  console.log('');
  console.log('Current snippet:', email.snippet?.substring(0, 80));
  console.log('Current body:', email.bodyText?.substring(0, 80));

  if (!email.isArchived) {
    console.log('\n=> Setting isArchived=true to trigger body re-fetch...');
    await prisma.email.update({
      where: { id: EMAIL_ID },
      data: {
        isArchived: true,
        bodyText: null,
        bodyHtml: null,
      },
    });
    console.log('Done! Next time this email is viewed, body will be re-fetched from Gmail.');
    console.log('The EmailFetchService.fetchArchivedEmail() will pull fresh content.');
  } else {
    console.log('\nEmail is already marked as archived. Body will be fetched on next view.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
