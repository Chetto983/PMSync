import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  // Get tenant ID from first provider
  const provider = await prisma.providerConfig.findFirst({
    select: { id: true, tenantId: true, email: true }
  });

  if (!provider) {
    console.log('No provider found');
    return;
  }

  console.log('=== PROVIDER ===');
  console.log('Provider ID:', provider.id);
  console.log('Tenant ID:', provider.tenantId);
  console.log('Email:', provider.email);

  // Check folders with specialUse = INBOX
  const inboxFolders = await prisma.folder.findMany({
    where: {
      tenantId: provider.tenantId,
      specialUse: { equals: 'INBOX', mode: 'insensitive' }
    },
    select: { id: true, path: true, name: true, specialUse: true, providerId: true }
  });

  console.log('\n=== INBOX FOLDERS ===');
  console.log(JSON.stringify(inboxFolders, null, 2));

  // Get folder paths for INBOX
  const folderPaths = new Set<string>();
  inboxFolders.forEach((f) => {
    if (f.path) folderPaths.add(f.path);
    if (f.name) folderPaths.add(f.name);
    if (f.specialUse) folderPaths.add(f.specialUse);
  });
  folderPaths.add('INBOX');
  const folderPathList = Array.from(folderPaths);

  console.log('\n=== FOLDER PATHS FOR FILTER ===');
  console.log(folderPathList);

  // Count total unread emails (no folder filter)
  const totalUnread = await prisma.email.count({
    where: {
      tenantId: provider.tenantId,
      isRead: false,
      isDeleted: false
    }
  });

  console.log('\n=== TOTAL UNREAD EMAILS (all folders) ===');
  console.log('Count:', totalUnread);

  // Count unread in INBOX folders
  const unreadInInbox = await prisma.email.count({
    where: {
      tenantId: provider.tenantId,
      isRead: false,
      isDeleted: false,
      folder: { in: folderPathList, mode: 'insensitive' }
    }
  });

  console.log('\n=== UNREAD EMAILS IN INBOX ===');
  console.log('Count:', unreadInInbox);

  // Get sample unread emails to see their folder values
  const sampleUnread = await prisma.email.findMany({
    where: {
      tenantId: provider.tenantId,
      isRead: false,
      isDeleted: false
    },
    select: {
      id: true,
      subject: true,
      folder: true,
      isRead: true,
      isDeleted: true,
      receivedAt: true
    },
    orderBy: { receivedAt: 'desc' },
    take: 10
  });

  console.log('\n=== SAMPLE UNREAD EMAILS ===');
  sampleUnread.forEach(e => {
    console.log('---');
    console.log('ID:', e.id);
    console.log('Subject:', e.subject?.substring(0, 50));
    console.log('Folder:', e.folder);
    console.log('isRead:', e.isRead);
    console.log('isDeleted:', e.isDeleted);
    console.log('Received:', e.receivedAt);
  });

  // Check if folder values match expected INBOX paths
  console.log('\n=== UNIQUE FOLDER VALUES FOR UNREAD EMAILS ===');
  const uniqueFolders = await prisma.email.groupBy({
    by: ['folder'],
    where: {
      tenantId: provider.tenantId,
      isRead: false,
      isDeleted: false
    },
    _count: true
  });

  uniqueFolders.forEach(f => {
    const matches = folderPathList.some(p => p.toLowerCase() === f.folder?.toLowerCase());
    console.log(`Folder: "${f.folder}" | Count: ${f._count} | Matches INBOX: ${matches}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
