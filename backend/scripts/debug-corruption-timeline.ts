/**
 * Debug corruption timeline - when did the email get its body?
 * Run: npx ts-node backend/scripts/debug-corruption-timeline.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('===== CORRUPTION TIMELINE ANALYSIS =====\n');

  // Get the corrupted email
  const email = await prisma.email.findUnique({
    where: { id: 'cmk464fp30004okyh3kuvnjd2' },
    select: {
      id: true,
      externalId: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      bodyText: true,
      snippet: true,
    },
  });

  if (email) {
    console.log('Email status:');
    console.log('  Created:', email.createdAt);
    console.log('  Updated:', email.updatedAt);
    console.log('  isArchived:', email.isArchived);
    console.log('  hasBody:', Boolean(email.bodyText));
    console.log('');
  }

  // Check which email had the WRONG body content
  // The wrong body was: "Hey chetto1983, completed an activity..."
  console.log('Searching for email with "completed an activity" in snippet...');

  const sourceEmail = await prisma.email.findFirst({
    where: {
      snippet: { contains: 'completed an activity', mode: 'insensitive' },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      snippet: true,
      createdAt: true,
    },
  });

  if (sourceEmail) {
    console.log('\nFOUND SOURCE EMAIL (where the wrong body came from):');
    console.log('  ID:', sourceEmail.id);
    console.log('  ExternalId:', sourceEmail.externalId);
    console.log('  Subject:', sourceEmail.subject);
    console.log('  Snippet:', sourceEmail.snippet?.substring(0, 80));
    console.log('  Created:', sourceEmail.createdAt);
  } else {
    console.log('No email found with "completed an activity" in snippet.');
    console.log('The source email may have been deleted or its snippet changed.');
  }

  // Look at all emails with bodies to see the sequence
  console.log('\n===== EMAIL CREATION SEQUENCE =====');

  const recentEmails = await prisma.email.findMany({
    select: {
      id: true,
      externalId: true,
      subject: true,
      createdAt: true,
      updatedAt: true,
      bodyText: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  console.log('\nLast 20 emails (by createdAt):');
  for (const e of recentEmails) {
    const hasBody = e.bodyText && e.bodyText.length > 0;
    console.log(`  ${e.createdAt.toISOString()} | ${hasBody ? '✓body' : ' nob'} | ${e.externalId?.substring(0, 16)} | ${e.subject?.substring(0, 40)}`);
  }

  // Check if any emails were created near the corrupted email
  const corruptedCreatedAt = email?.createdAt || new Date();
  const nearbyEmails = await prisma.email.findMany({
    where: {
      createdAt: {
        gte: new Date(corruptedCreatedAt.getTime() - 60000), // 1 min before
        lte: new Date(corruptedCreatedAt.getTime() + 60000), // 1 min after
      },
    },
    select: {
      id: true,
      externalId: true,
      subject: true,
      createdAt: true,
      snippet: true,
      bodyText: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n===== EMAILS CREATED ±1 MIN OF CORRUPTED EMAIL =====`);
  console.log(`(around ${corruptedCreatedAt.toISOString()})`);

  for (const e of nearbyEmails) {
    const isCorrupted = e.id === 'cmk464fp30004okyh3kuvnjd2';
    console.log(`\n  ${isCorrupted ? '>>> CORRUPTED:' : ''}`);
    console.log(`  ID: ${e.id}`);
    console.log(`  ExternalId: ${e.externalId}`);
    console.log(`  Subject: ${e.subject?.substring(0, 50)}`);
    console.log(`  Created: ${e.createdAt.toISOString()}`);
    console.log(`  Snippet: ${e.snippet?.substring(0, 50)}`);
    console.log(`  Body: ${e.bodyText?.substring(0, 50) || '<<NULL>>'}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
