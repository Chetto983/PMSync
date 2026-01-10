/**
 * Analyze follow-up detection quality
 */
/// <reference types="node" />
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

async function analyze() {
  // Use the italian-rag-test tenant with 100% embedding coverage
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'italian-rag-test' }
  }) || await prisma.tenant.findFirst();

  if (!tenant) {
    console.log('No tenant');
    return;
  }
  console.log(`Using tenant: ${tenant.slug || tenant.name} (${tenant.id.slice(0,12)}...)\n`);

  // Check email content language
  const emails = await prisma.email.findMany({
    where: { tenantId: tenant.id },
    select: { subject: true, snippet: true, bodyText: true },
    take: 20,
  });

  console.log('=== SAMPLE EMAIL LANGUAGES ===');
  for (const e of emails.slice(0, 10)) {
    const text = (e.subject || '') + ' ' + (e.snippet || '');
    const hasItalian = /\b(ciao|grazie|buongiorno|saluti|cordiali|gentile|prego|attendo|risposta)\b/i.test(text);
    const hasEnglish = /\b(hello|thanks|hi|dear|regards|please|thank|reply|waiting)\b/i.test(text);
    const lang = hasItalian ? '🇮🇹' : (hasEnglish ? '🇬🇧' : '❓');
    console.log(`${lang} "${(e.subject || '(no subject)').slice(0, 60)}"`);
  }

  // Check embedding coverage
  const totalEmails = await prisma.email.count({ where: { tenantId: tenant.id } });
  const emailsWithEmbeddings = await prisma.embedding.count({
    where: { tenantId: tenant.id, emailId: { not: null } },
  });

  console.log('\n=== EMBEDDING COVERAGE ===');
  console.log(`Total emails: ${totalEmails}`);
  console.log(`Emails with embeddings: ${emailsWithEmbeddings}`);
  console.log(`Coverage: ${((emailsWithEmbeddings / totalEmails) * 100).toFixed(1)}%`);

  // Check if embeddings have vectors
  const embeddingsWithVectors = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM embeddings
    WHERE "tenantId" = ${tenant.id}
    AND "emailId" IS NOT NULL
    AND vector IS NOT NULL
  `;
  console.log(`With actual vectors: ${embeddingsWithVectors[0]?.count || 0}`);

  // Sample embedding content
  const sampleEmb = await prisma.embedding.findFirst({
    where: { tenantId: tenant.id, emailId: { not: null } },
    select: { content: true, emailId: true },
  });
  if (sampleEmb) {
    console.log('\n=== SAMPLE EMBEDDING CONTENT ===');
    console.log(`Email ID: ${sampleEmb.emailId}`);
    console.log(`Content (first 300 chars):\n"${sampleEmb.content.slice(0, 300)}..."`);
  }

  // Check follow-up patterns in actual emails
  console.log('\n=== FOLLOW-UP PATTERN CHECK ===');
  // Check sent emails (from any sender in test data)
  const sentEmails = await prisma.email.findMany({
    where: {
      tenantId: tenant.id,
      bodyText: { not: null },
    },
    select: { subject: true, bodyText: true, from: true },
    take: 50, // Check more emails
  });

  const italianPatterns = [
    /fammi\s+sapere/i,
    /attendo\s+(una\s+)?(tua\s+)?(risposta|conferma)/i,
    /resto\s+in\s+attesa/i,
    /per\s+favore\s+(rispondi|conferma)/i,
  ];

  const englishPatterns = [
    /please\s+(let\s+me\s+know|respond|reply)/i,
    /waiting\s+for\s+your/i,
    /looking\s+forward\s+to/i,
  ];

  let italianMatches = 0;
  let englishMatches = 0;

  for (const e of sentEmails) {
    const text = (e.subject || '') + ' ' + (e.bodyText || '');
    if (italianPatterns.some((p) => p.test(text))) italianMatches++;
    if (englishPatterns.some((p) => p.test(text))) englishMatches++;
  }

  console.log(`Sent emails checked: ${sentEmails.length}`);
  console.log(`Italian follow-up patterns found: ${italianMatches}`);
  console.log(`English follow-up patterns found: ${englishMatches}`);

  // Verdict
  console.log('\n=== VERDICT ===');
  const coverage = (emailsWithEmbeddings / totalEmails) * 100;
  const vectorCount = Number(embeddingsWithVectors[0]?.count || 0);

  if (coverage < 50) {
    console.log('⚠️  LOW EMBEDDING COVERAGE - RAG relies on keyword fallback');
  }
  if (vectorCount === 0) {
    console.log('❌ NO VECTORS - Semantic search completely broken!');
  } else if (vectorCount < emailsWithEmbeddings) {
    console.log('⚠️  PARTIAL VECTORS - Some embeddings missing vector data');
  }
  if (italianMatches === 0 && englishMatches === 0) {
    console.log('📧 No follow-up patterns in sample - may need more diverse test data');
  } else {
    console.log(`✅ Found ${italianMatches} IT + ${englishMatches} EN follow-up patterns in sent emails`);
  }

  await prisma.$disconnect();
}

analyze().catch(console.error);
