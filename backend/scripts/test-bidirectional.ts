/**
 * Bidirectional Provider Test Script
 * Tests Google <-> Microsoft provider interactions
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function testBidirectionalThreads() {
  console.log('\n=== BIDIRECTIONAL THREAD TEST ===\n');

  // Get sample emails from both providers
  const googleEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, isDeleted: false },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      threadId: true,
      messageId: true,
      inReplyTo: true,
      references: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
  });

  const msEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, isDeleted: false },
    select: {
      id: true,
      subject: true,
      from: true,
      to: true,
      threadId: true,
      messageId: true,
      inReplyTo: true,
      references: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
  });

  console.log(`📧 Google emails: ${googleEmails.length}`);
  console.log(`📧 Microsoft emails: ${msEmails.length}`);

  // Check for cross-provider conversations
  console.log('\n--- Cross-Provider Analysis ---');

  for (const msEmail of msEmails) {
    console.log(`\nMS Email: ${msEmail.subject}`);
    console.log(`  From: ${msEmail.from}`);
    console.log(`  To: ${JSON.stringify(msEmail.to)}`);
    console.log(`  ThreadId: ${msEmail.threadId}`);
    console.log(`  MessageId: ${msEmail.messageId?.substring(0, 50)}...`);
    console.log(`  InReplyTo: ${msEmail.inReplyTo || 'none'}`);
    console.log(`  References: ${msEmail.references?.substring(0, 50) || 'none'}`);
  }

  // Test thread retrieval for a multi-email thread
  console.log('\n--- Thread Retrieval Test ---');

  const threadGroup = await prisma.email.groupBy({
    by: ['threadId'],
    where: {
      tenantId: TENANT_ID,
      threadId: { not: null },
      isDeleted: false,
    },
    _count: true,
    orderBy: { _count: { threadId: 'desc' } },
    take: 5,
  });

  for (const group of threadGroup) {
    if (!group.threadId) continue;

    const threadEmails = await prisma.email.findMany({
      where: { tenantId: TENANT_ID, threadId: group.threadId, isDeleted: false },
      select: {
        id: true,
        subject: true,
        from: true,
        providerId: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: 'asc' },
    });

    const providers = new Set(threadEmails.map((e) => e.providerId));
    const providerLabel = (id: string) => (id === GOOGLE_PROVIDER_ID ? 'Google' : 'Microsoft');

    console.log(`\nThread ${group.threadId.substring(0, 20)}... (${group._count} emails)`);
    console.log(`  Providers: ${Array.from(providers).map(providerLabel).join(', ')}`);
    threadEmails.forEach((e, i) => {
      console.log(`  ${i + 1}. [${providerLabel(e.providerId)}] ${e.subject?.substring(0, 40)}`);
    });
  }
}

async function testSyncStatus() {
  console.log('\n=== SYNC STATUS ===\n');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      providerType: true,
      lastSyncedAt: true,
      metadata: true,
    },
  });

  for (const p of providers) {
    console.log(`${p.providerType.toUpperCase()}: ${p.email}`);
    console.log(`  Last Sync: ${p.lastSyncedAt}`);
    console.log(`  Metadata: ${JSON.stringify(p.metadata).substring(0, 100)}...`);
  }
}

async function testEmailActions() {
  console.log('\n=== EMAIL ACTIONS TEST ===\n');

  // Check for draft emails
  const drafts = await prisma.email.count({
    where: { tenantId: TENANT_ID, folder: 'DRAFT' },
  });
  console.log(`📝 Drafts: ${drafts}`);

  // Check for sent emails
  const sent = await prisma.email.count({
    where: { tenantId: TENANT_ID, folder: 'SENT' },
  });
  console.log(`📤 Sent: ${sent}`);

  // Check for starred emails
  const starred = await prisma.email.count({
    where: { tenantId: TENANT_ID, isStarred: true },
  });
  console.log(`⭐ Starred: ${starred}`);

  // Check for unread emails
  const unread = await prisma.email.count({
    where: { tenantId: TENANT_ID, isRead: false, isDeleted: false },
  });
  console.log(`📬 Unread: ${unread}`);
}

async function testAttachments() {
  console.log('\n=== ATTACHMENTS TEST ===\n');

  const emailsWithAttachments = await prisma.email.count({
    where: {
      tenantId: TENANT_ID,
      isDeleted: false,
      attachments: { some: {} },
    },
  });
  console.log(`📎 Emails with attachments: ${emailsWithAttachments}`);

  const attachments = await prisma.emailAttachment.count({
    where: { email: { tenantId: TENANT_ID } },
  });
  console.log(`📄 Total attachments: ${attachments}`);
}

async function runAllTests() {
  console.log('🚀 Starting Bidirectional Provider Tests...\n');
  console.log('='.repeat(60));

  try {
    await testBidirectionalThreads();
    await testSyncStatus();
    await testEmailActions();
    await testAttachments();

    console.log('\n' + '='.repeat(60));
    console.log('🏁 All bidirectional tests completed!');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runAllTests();
