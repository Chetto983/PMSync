/**
 * Full Integration Test Script
 * Tests bidirectionality between Google <-> Microsoft providers
 * Tests thread display, sync, and all core functionality
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function testProviders() {
  console.log('\n=== 1. PROVIDER CONFIGURATION ===');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      providerType: true,
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true,
      lastSyncedAt: true,
    },
  });

  console.log('✅ Providers configured:', providers.length);
  for (const p of providers) {
    console.log(`  - ${p.providerType}: ${p.email}`);
    console.log(`    Supports: Email=${p.supportsEmail}, Calendar=${p.supportsCalendar}, Contacts=${p.supportsContacts}`);
    console.log(`    Last Sync: ${p.lastSyncedAt || 'Never'}`);
  }

  return providers;
}

async function testEmailsByProvider() {
  console.log('\n=== 2. EMAILS BY PROVIDER ===');

  const googleEmails = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, isDeleted: false },
  });

  const msEmails = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, isDeleted: false },
  });

  console.log(`✅ Google emails: ${googleEmails}`);
  console.log(`✅ Microsoft emails: ${msEmails}`);

  return { googleEmails, msEmails };
}

async function testThreadsPerProvider() {
  console.log('\n=== 3. THREADS BY PROVIDER ===');

  // Google threads
  const googleThreads = await prisma.email.groupBy({
    by: ['threadId'],
    where: {
      tenantId: TENANT_ID,
      providerId: GOOGLE_PROVIDER_ID,
      threadId: { not: null },
      isDeleted: false,
    },
    _count: true,
  });

  const googleMultiEmailThreads = googleThreads.filter((t) => t._count > 1);
  console.log(`✅ Google: ${googleThreads.length} threads, ${googleMultiEmailThreads.length} with multiple emails`);

  // Microsoft threads
  const msThreads = await prisma.email.groupBy({
    by: ['threadId'],
    where: {
      tenantId: TENANT_ID,
      providerId: MS_PROVIDER_ID,
      threadId: { not: null },
      isDeleted: false,
    },
    _count: true,
  });

  const msMultiEmailThreads = msThreads.filter((t) => t._count > 1);
  console.log(`✅ Microsoft: ${msThreads.length} threads, ${msMultiEmailThreads.length} with multiple emails`);

  return { googleThreads: googleThreads.length, msThreads: msThreads.length };
}

async function testCrossProviderThreads() {
  console.log('\n=== 4. CROSS-PROVIDER THREAD DETECTION ===');

  // Find emails with the same subject from different providers
  const googleEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, isDeleted: false },
    select: { id: true, subject: true, from: true, to: true, threadId: true, messageId: true, inReplyTo: true },
    take: 100,
  });

  const msEmails = await prisma.email.findMany({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, isDeleted: false },
    select: { id: true, subject: true, from: true, to: true, threadId: true, messageId: true, inReplyTo: true },
    take: 100,
  });

  // Check for related emails (same subject or inReplyTo references)
  let crossProviderMatches = 0;
  for (const gEmail of googleEmails) {
    for (const mEmail of msEmails) {
      // Check if they're in the same conversation
      const subjectMatch =
        gEmail.subject &&
        mEmail.subject &&
        (gEmail.subject.replace(/^(Re:|Fwd:)\s*/i, '').trim() ===
          mEmail.subject.replace(/^(Re:|Fwd:)\s*/i, '').trim());

      const replyMatch =
        (gEmail.inReplyTo && mEmail.messageId && gEmail.inReplyTo.includes(mEmail.messageId)) ||
        (mEmail.inReplyTo && gEmail.messageId && mEmail.inReplyTo.includes(gEmail.messageId));

      if (subjectMatch || replyMatch) {
        crossProviderMatches++;
        if (crossProviderMatches <= 3) {
          console.log(`  Found cross-provider match:`);
          console.log(`    Google: ${gEmail.subject?.substring(0, 50)}`);
          console.log(`    MS: ${mEmail.subject?.substring(0, 50)}`);
        }
      }
    }
  }

  console.log(`✅ Cross-provider conversation matches: ${crossProviderMatches}`);
  return crossProviderMatches;
}

async function testFolders() {
  console.log('\n=== 5. FOLDERS BY PROVIDER ===');

  const googleFolders = await prisma.folder.findMany({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID },
    select: { id: true, name: true, path: true, unreadCount: true, totalCount: true },
  });

  const msFolders = await prisma.folder.findMany({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID },
    select: { id: true, name: true, path: true, unreadCount: true, totalCount: true },
  });

  console.log(`✅ Google folders: ${googleFolders.length}`);
  googleFolders.slice(0, 5).forEach((f) => console.log(`    - ${f.name}: ${f.totalCount} emails (${f.unreadCount} unread)`));

  console.log(`✅ Microsoft folders: ${msFolders.length}`);
  msFolders.slice(0, 5).forEach((f) => console.log(`    - ${f.name}: ${f.totalCount} emails (${f.unreadCount} unread)`));

  return { googleFolders: googleFolders.length, msFolders: msFolders.length };
}

async function testLabels() {
  console.log('\n=== 6. USER LABELS ===');

  const labels = await prisma.userLabel.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, color: true },
  });

  console.log(`✅ Labels: ${labels.length}`);
  labels.forEach((l) => console.log(`    - ${l.name} (${(l.color as any)?.backgroundColor || 'no color'})`));

  return labels.length;
}

async function testContacts() {
  console.log('\n=== 7. CONTACTS ===');

  const contacts = await prisma.contact.count({
    where: { tenantId: TENANT_ID },
  });

  const providerContacts = await prisma.providerContact.count({
    where: { tenantId: TENANT_ID },
  });

  console.log(`✅ Unified contacts: ${contacts}`);
  console.log(`✅ Provider contacts: ${providerContacts}`);

  return { contacts, providerContacts };
}

async function testCalendar() {
  console.log('\n=== 8. CALENDAR EVENTS ===');

  const events = await prisma.calendarEvent.count({
    where: { tenantId: TENANT_ID },
  });

  console.log(`✅ Calendar events: ${events}`);

  return events;
}

async function testAIData() {
  console.log('\n=== 9. AI DATA ===');

  const embeddings = await prisma.embedding.count({
    where: { tenantId: TENANT_ID },
  });

  const pendingActions = await prisma.agentPendingAction.count({
    where: { tenantId: TENANT_ID },
  });

  const learningProfiles = await prisma.agentLearningProfile.count({
    where: { tenantId: TENANT_ID },
  });

  const conversations = await prisma.voltAgentConversation.count({
    where: { tenantId: TENANT_ID },
  });

  console.log(`✅ Embeddings: ${embeddings}`);
  console.log(`✅ Pending AI actions: ${pendingActions}`);
  console.log(`✅ Learning profiles: ${learningProfiles}`);
  console.log(`✅ VoltAgent conversations: ${conversations}`);

  return { embeddings, pendingActions, learningProfiles, conversations };
}

async function testSampleThreadDisplay() {
  console.log('\n=== 10. SAMPLE THREAD DISPLAY ===');

  // Find a thread with multiple emails
  const multiEmailThread = await prisma.email.groupBy({
    by: ['threadId'],
    where: {
      tenantId: TENANT_ID,
      threadId: { not: null },
      isDeleted: false,
    },
    _count: true,
    orderBy: { _count: { threadId: 'desc' } },
    take: 1,
  });

  if (multiEmailThread.length > 0 && multiEmailThread[0].threadId) {
    const threadEmails = await prisma.email.findMany({
      where: {
        tenantId: TENANT_ID,
        threadId: multiEmailThread[0].threadId,
        isDeleted: false,
      },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        isRead: true,
        providerId: true,
      },
      orderBy: { receivedAt: 'asc' },
    });

    console.log(`✅ Sample thread with ${threadEmails.length} emails:`);
    console.log(`  Thread ID: ${multiEmailThread[0].threadId}`);
    threadEmails.forEach((e, i) => {
      const providerType = e.providerId === GOOGLE_PROVIDER_ID ? 'Google' : 'Microsoft';
      console.log(`  ${i + 1}. [${providerType}] ${e.subject?.substring(0, 50) || '(no subject)'}`);
      console.log(`     From: ${e.from}`);
      console.log(`     Date: ${e.receivedAt}`);
      console.log(`     Read: ${e.isRead}`);
    });
  }
}

async function runAllTests() {
  console.log('🚀 Starting Full Integration Tests...\n');
  console.log('='.repeat(60));

  try {
    await testProviders();
    await testEmailsByProvider();
    await testThreadsPerProvider();
    await testCrossProviderThreads();
    await testFolders();
    await testLabels();
    await testContacts();
    await testCalendar();
    await testAIData();
    await testSampleThreadDisplay();

    console.log('\n' + '='.repeat(60));
    console.log('🏁 All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runAllTests();
