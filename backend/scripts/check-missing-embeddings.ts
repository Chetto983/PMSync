/**
 * Check why some emails are missing embeddings
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();
const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

async function main() {
  console.log('🔍 Checking Missing Embeddings\n');

  // Get all email IDs
  const allEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      subject: true,
      from: true,
      folder: true,
      bodyText: true,
      snippet: true,
      receivedAt: true,
    },
  });

  // Get all embedding email IDs
  const embeddedEmailIds = await prisma.embedding.findMany({
    where: { tenantId: TENANT_ID, emailId: { not: null } },
    select: { emailId: true },
  });

  const embeddedSet = new Set(embeddedEmailIds.map(e => e.emailId));

  // Find missing
  const missing = allEmails.filter(e => !embeddedSet.has(e.id));

  console.log(`📊 Stats:`);
  console.log(`   Total emails:     ${allEmails.length}`);
  console.log(`   With embeddings:  ${embeddedSet.size}`);
  console.log(`   Missing:          ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('✅ All emails have embeddings!');
    await prisma.$disconnect();
    return;
  }

  // Analyze missing emails
  console.log('📧 Missing Emails Analysis:\n');

  // Group by folder
  const byFolder: Record<string, number> = {};
  const byReason: Record<string, typeof missing> = {
    'No body content': [],
    'Very short content': [],
    'Recent (not yet indexed)': [],
    'Other': [],
  };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const email of missing) {
    // Count by folder
    byFolder[email.folder] = (byFolder[email.folder] || 0) + 1;

    // Categorize reason
    const content = email.bodyText || email.snippet || '';
    if (!content || content.trim().length === 0) {
      byReason['No body content'].push(email);
    } else if (content.length < 20) {
      byReason['Very short content'].push(email);
    } else if (email.receivedAt > oneDayAgo) {
      byReason['Recent (not yet indexed)'].push(email);
    } else {
      byReason['Other'].push(email);
    }
  }

  console.log('By Folder:');
  for (const [folder, count] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${folder}: ${count}`);
  }

  console.log('\nBy Reason:');
  for (const [reason, emails] of Object.entries(byReason)) {
    if (emails.length > 0) {
      console.log(`\n   ${reason}: ${emails.length}`);
      for (const e of emails.slice(0, 3)) {
        const content = (e.bodyText || e.snippet || '').substring(0, 50);
        console.log(`     - "${e.subject?.substring(0, 40) || '(no subject)'}"`);
        console.log(`       From: ${e.from}`);
        console.log(`       Content: "${content || '(empty)'}..."`);
      }
      if (emails.length > 3) {
        console.log(`     ... and ${emails.length - 3} more`);
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 To backfill missing embeddings:');
  console.log('   npx ts-node scripts/backfill-embeddings.ts');

  await prisma.$disconnect();
}

main().catch(console.error);
