import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get tenant ID
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found');
    return;
  }
  console.log('Tenant ID:', user.tenantId);

  // Get today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  console.log('\n=== DATE RANGE ===');
  console.log('Today start (local):', today.toLocaleString());
  console.log('Today start (ISO):', today.toISOString());
  console.log('Today end (local):', endOfToday.toLocaleString());
  console.log('Today end (ISO):', endOfToday.toISOString());

  // Count all emails
  const totalEmails = await prisma.email.count({
    where: { tenantId: user.tenantId }
  });
  console.log('\n=== TOTAL EMAILS ===');
  console.log('Total:', totalEmails);

  // Count emails with attachments (ALL folders) - attachments is a relation
  const withAttachmentsAll = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      attachments: { some: {} }
    }
  });
  console.log('\n=== ATTACHMENTS (ALL folders) ===');
  console.log('With attachments:', withAttachmentsAll);

  // Check what folders exist
  const folders = await prisma.email.groupBy({
    by: ['folder'],
    where: { tenantId: user.tenantId },
    _count: { id: true }
  });
  console.log('\n=== FOLDERS ===');
  folders.forEach((f: { folder: string; _count: { id: number } }) => console.log(`  ${f.folder}: ${f._count.id}`));

  // Count emails with attachments in INBOX only
  const withAttachmentsInbox = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      attachments: { some: {} },
      folder: { in: ['INBOX', 'inbox', 'Inbox'] }
    }
  });
  console.log('\n=== ATTACHMENTS (INBOX folder pattern) ===');
  console.log('With attachments in INBOX:', withAttachmentsInbox);

  // Count emails from today (ALL folders)
  const todayEmailsAll = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      receivedAt: {
        gte: today,
        lte: endOfToday
      }
    }
  });
  console.log('\n=== TODAY EMAILS (ALL folders) ===');
  console.log('Today:', todayEmailsAll);

  // Count today emails where folder matches inbox patterns
  const todayEmailsInbox = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      receivedAt: {
        gte: today,
        lte: endOfToday
      },
      folder: { in: ['INBOX', 'inbox', 'Inbox'] }
    }
  });
  console.log('\n=== TODAY EMAILS (INBOX pattern) ===');
  console.log('Today in INBOX:', todayEmailsInbox);

  // Check specialUse query - this is what the API uses
  console.log('\n=== TESTING specialUse=INBOX LOGIC ===');

  // Get provider folders with INBOX specialUse
  const inboxFolders = await prisma.folder.findMany({
    where: {
      tenantId: user.tenantId,
      specialUse: 'INBOX'
    },
    select: { providerId: true, path: true, name: true }
  });
  console.log('INBOX folders:', inboxFolders);

  // Get the folder paths for INBOX
  const inboxFolderPaths = inboxFolders.map(f => f.path);
  console.log('INBOX folder paths:', inboxFolderPaths);

  // Count emails in those folders with attachments
  const attachmentsViaSpecialUse = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      attachments: { some: {} },
      folder: { in: inboxFolderPaths }
    }
  });
  console.log('\n=== ATTACHMENTS (via specialUse INBOX paths) ===');
  console.log('Count:', attachmentsViaSpecialUse);

  // Count today emails in those folders
  const todayViaSpecialUse = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      receivedAt: {
        gte: today,
        lte: endOfToday
      },
      folder: { in: inboxFolderPaths }
    }
  });
  console.log('\n=== TODAY (via specialUse INBOX paths) ===');
  console.log('Count:', todayViaSpecialUse);

  // Let's check what the actual email data looks like for today's emails
  const todaySampleEmails = await prisma.email.findMany({
    where: {
      tenantId: user.tenantId,
      receivedAt: {
        gte: today,
        lte: endOfToday
      }
    },
    select: {
      id: true,
      subject: true,
      folder: true,
      receivedAt: true,
      _count: { select: { attachments: true } }
    },
    take: 10
  });
  console.log('\n=== SAMPLE TODAY EMAILS ===');
  todaySampleEmails.forEach(e => {
    console.log(`  [${e.folder}] ${e.subject?.substring(0, 50)} | ${e.receivedAt.toISOString()} | att: ${e._count.attachments > 0}`);
  });

  // Check emails with attachments
  const attachmentSampleEmails = await prisma.email.findMany({
    where: {
      tenantId: user.tenantId,
      attachments: { some: {} }
    },
    select: {
      id: true,
      subject: true,
      folder: true,
      receivedAt: true
    },
    take: 10
  });
  console.log('\n=== SAMPLE EMAILS WITH ATTACHMENTS ===');
  attachmentSampleEmails.forEach(e => {
    console.log(`  [${e.folder}] ${e.subject?.substring(0, 50)} | ${e.receivedAt.toISOString()}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
