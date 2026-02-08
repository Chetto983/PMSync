/**
 * Create Folder records for the PST-imported emails.
 * Must run AFTER import-pst-dataset.ts so the provider exists.
 *
 * Creates system folders (INBOX, SENT, TRASH, DRAFTS, ARCHIVE)
 * and any custom folders found in the imported emails.
 *
 * Usage:
 *   npx ts-node scripts/create-pst-folders.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

// Map folder names to specialUse values (IMAP standard)
const SYSTEM_FOLDERS: Record<string, { specialUse: string; isSystem: boolean }> = {
  INBOX: { specialUse: '\\Inbox', isSystem: true },
  SENT: { specialUse: '\\Sent', isSystem: true },
  TRASH: { specialUse: '\\Trash', isSystem: true },
  DRAFTS: { specialUse: '\\Drafts', isSystem: true },
  ARCHIVE: { specialUse: '\\Archive', isSystem: true },
  JUNK: { specialUse: '\\Junk', isSystem: true },
  SPAM: { specialUse: '\\Junk', isSystem: true },
};

async function main() {
  const prisma = createPrismaClient();

  try {
    // Find the PST import provider
    const provider = await prisma.providerConfig.findFirst({
      where: { tenantId: TENANT_ID, providerType: 'pst-import' },
    });

    if (!provider) {
      console.error('ERROR: pst-import provider not found. Run import-pst-dataset.ts first.');
      process.exit(1);
    }

    console.log(`Provider: ${provider.id} (${provider.email})`);

    // Get all unique folder names from imported emails
    const folderGroups = await prisma.email.groupBy({
      by: ['folder'],
      where: { providerId: provider.id },
      _count: true,
      orderBy: { _count: { folder: 'desc' } },
    });

    console.log(`\nFolders referenced by emails:`);
    folderGroups.forEach(f => console.log(`  ${f._count}x  ${f.folder}`));

    // Get existing folders for this provider
    const existingFolders = await prisma.folder.findMany({
      where: { providerId: provider.id },
      select: { path: true },
    });
    const existingPaths = new Set(existingFolders.map(f => f.path));
    console.log(`\nExisting folders: ${existingPaths.size}`);

    // Create missing folders
    let created = 0;
    let skipped = 0;

    for (const fg of folderGroups) {
      const folderName = fg.folder;
      const path = folderName; // Use folder name as path

      if (existingPaths.has(path)) {
        console.log(`  [SKIP] ${folderName} (exists)`);
        skipped++;
        continue;
      }

      const systemInfo = SYSTEM_FOLDERS[folderName.toUpperCase()];
      const isSystem = systemInfo?.isSystem ?? false;
      const specialUse = systemInfo?.specialUse ?? null;

      // Handle nested folders (e.g., "Marco Meldini" is a subfolder)
      const parts = folderName.split('/');
      let parentId: string | null = null;

      // Create parent folders if nested
      if (parts.length > 1) {
        for (let i = 0; i < parts.length - 1; i++) {
          const parentPath = parts.slice(0, i + 1).join('/');
          if (!existingPaths.has(parentPath)) {
            const parentFolder = await prisma.folder.create({
              data: {
                tenantId: TENANT_ID,
                providerId: provider.id,
                name: parts[i],
                path: parentPath,
                externalId: `pst-folder-${parentPath.toLowerCase().replace(/\s+/g, '-')}`,
                level: i,
                isSelectable: true,
                isSystem: false,
                totalCount: 0,
                unreadCount: 0,
              },
            });
            existingPaths.add(parentPath);
            parentId = parentFolder.id;
            console.log(`  [CREATE] ${parentPath} (parent, level ${i})`);
            created++;
          } else {
            // Find existing parent
            const existing = await prisma.folder.findFirst({
              where: { providerId: provider.id, path: parentPath },
              select: { id: true },
            });
            parentId = existing?.id ?? null;
          }
        }
      }

      // Count emails in this folder
      const emailCount = fg._count;
      const unreadCount = await prisma.email.count({
        where: { providerId: provider.id, folder: folderName, isRead: false },
      });

      const folder = await prisma.folder.create({
        data: {
          tenantId: TENANT_ID,
          providerId: provider.id,
          name: parts[parts.length - 1],
          path,
          externalId: `pst-folder-${folderName.toLowerCase().replace(/\s+/g, '-')}`,
          level: parts.length - 1,
          isSelectable: true,
          isSystem,
          specialUse,
          parentId,
          totalCount: emailCount,
          unreadCount,
        },
      });

      existingPaths.add(path);
      console.log(`  [CREATE] ${folderName} (${isSystem ? 'system' : 'custom'}, ${emailCount} emails, ${unreadCount} unread)`);
      created++;
    }

    // ── Summary ─────────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Created: ${created} folders`);
    console.log(`  Skipped: ${skipped} (already exist)`);

    const totalFolders = await prisma.folder.count({
      where: { providerId: provider.id },
    });
    console.log(`  Total folders for PST provider: ${totalFolders}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
