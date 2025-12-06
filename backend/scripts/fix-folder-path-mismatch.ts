/**
 * Fix Folder Path Mismatch Migration
 *
 * This script fixes the data integrity issues where:
 * 1. Gmail folders use CATEGORY_XXX as path but emails use simplified names (PROMOTIONS, SOCIAL, etc.)
 * 2. Microsoft folders use folder ID as path but emails use display names
 *
 * After this migration, email.folder will correctly join with folder.path
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/fix-folder-path-mismatch.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

// Gmail category label to simplified path mapping (matches determineFolderFromLabels)
const GMAIL_CATEGORY_MAP: Record<string, string> = {
  CATEGORY_PERSONAL: 'INBOX',
  CATEGORY_SOCIAL: 'SOCIAL',
  CATEGORY_PROMOTIONS: 'PROMOTIONS',
  CATEGORY_UPDATES: 'UPDATES',
  CATEGORY_FORUMS: 'FORUMS',
};

// Gmail system labels that need DRAFT -> DRAFTS normalization
const GMAIL_SYSTEM_LABELS = [
  'INBOX',
  'SENT',
  'TRASH',
  'SPAM',
  'DRAFT',
  'STARRED',
  'IMPORTANT',
  'UNREAD',
  'CHAT',
];

async function fixGmailFolders() {
  console.log('\n=== Fixing Gmail Folder Paths ===\n');

  const gmailProviders = await prisma.providerConfig.findMany({
    where: { providerType: 'google' },
    select: { id: true, email: true },
  });

  console.log(`Found ${gmailProviders.length} Gmail providers`);

  for (const provider of gmailProviders) {
    console.log(`\nProcessing Gmail provider: ${provider.email}`);

    // Get all folders for this provider
    const folders = await prisma.folder.findMany({
      where: { providerId: provider.id },
    });

    let fixed = 0;
    let skipped = 0;

    for (const folder of folders) {
      const oldPath = folder.path;
      let newPath: string;
      let needsUpdate = false;

      // Check if it's a category label
      if (GMAIL_CATEGORY_MAP[oldPath]) {
        newPath = GMAIL_CATEGORY_MAP[oldPath];
        needsUpdate = true;
      }
      // Check if it's a system label needing normalization
      else if (oldPath === 'DRAFT') {
        newPath = 'DRAFTS';
        needsUpdate = true;
      }
      // Check if it's a custom label (Label_xxx)
      else if (oldPath.startsWith('Label_')) {
        // Use the folder name as path for custom labels
        newPath = folder.name;
        needsUpdate = oldPath !== folder.name;
      }
      // System labels use their ID as path
      else if (GMAIL_SYSTEM_LABELS.includes(oldPath)) {
        newPath = oldPath;
        needsUpdate = false;
      }
      // Default: keep as is
      else {
        newPath = oldPath;
        needsUpdate = false;
      }

      if (needsUpdate) {
        try {
          // Check if target path already exists
          const existing = await prisma.folder.findFirst({
            where: {
              providerId: provider.id,
              path: newPath,
            },
          });

          if (existing && existing.id !== folder.id) {
            // Merge: delete old folder, keep new one
            console.log(
              `  Merging: "${oldPath}" -> "${newPath}" (target exists, deleting old)`,
            );
            await prisma.folder.delete({ where: { id: folder.id } });
          } else {
            // Update path and set externalId
            await prisma.folder.update({
              where: { id: folder.id },
              data: {
                path: newPath,
                externalId: oldPath, // Store original label ID for API operations
              },
            });
            console.log(`  Updated: "${oldPath}" -> "${newPath}"`);
          }
          fixed++;
        } catch (error) {
          console.error(
            `  ERROR updating folder "${oldPath}": ${error instanceof Error ? error.message : error}`,
          );
        }
      } else {
        skipped++;
      }
    }

    console.log(`  Fixed: ${fixed}, Skipped: ${skipped}`);
  }
}

async function fixMicrosoftFolders() {
  console.log('\n=== Fixing Microsoft Folder Paths ===\n');

  const msProviders = await prisma.providerConfig.findMany({
    where: { providerType: 'microsoft' },
    select: { id: true, email: true },
  });

  console.log(`Found ${msProviders.length} Microsoft providers`);

  for (const provider of msProviders) {
    console.log(`\nProcessing Microsoft provider: ${provider.email}`);

    // Get all folders for this provider
    const folders = await prisma.folder.findMany({
      where: { providerId: provider.id },
    });

    let fixed = 0;
    let skipped = 0;

    for (const folder of folders) {
      const oldPath = folder.path;
      const newPath = folder.name; // Microsoft displayName should be the path

      // Check if path looks like a Microsoft folder ID (long base64-like string)
      const isFolderId = oldPath.length > 50 && oldPath !== folder.name;

      if (isFolderId) {
        try {
          // Check if target path already exists
          const existing = await prisma.folder.findFirst({
            where: {
              providerId: provider.id,
              path: newPath,
            },
          });

          if (existing && existing.id !== folder.id) {
            // Merge: delete old folder, keep new one
            console.log(
              `  Merging: "${oldPath.substring(0, 30)}..." -> "${newPath}" (target exists)`,
            );
            await prisma.folder.delete({ where: { id: folder.id } });
          } else {
            // Update path and set externalId
            await prisma.folder.update({
              where: { id: folder.id },
              data: {
                path: newPath,
                externalId: oldPath, // Store original folder ID for API operations
              },
            });
            console.log(
              `  Updated: "${oldPath.substring(0, 30)}..." -> "${newPath}"`,
            );
          }
          fixed++;
        } catch (error) {
          console.error(
            `  ERROR updating folder "${oldPath.substring(0, 30)}...": ${error instanceof Error ? error.message : error}`,
          );
        }
      } else {
        skipped++;
      }
    }

    console.log(`  Fixed: ${fixed}, Skipped: ${skipped}`);
  }
}

async function updateFolderCounts() {
  console.log('\n=== Updating Folder Counts ===\n');

  const providers = await prisma.providerConfig.findMany({
    select: { id: true, email: true, providerType: true },
  });

  for (const provider of providers) {
    console.log(`\nProcessing ${provider.providerType} provider: ${provider.email}`);

    // Get all unique folders from emails
    const emailFolders = await prisma.email.groupBy({
      by: ['folder'],
      where: { providerId: provider.id },
      _count: { _all: true },
    });

    let updated = 0;

    for (const ef of emailFolders) {
      if (!ef.folder) continue;

      // Find matching folder
      const folder = await prisma.folder.findFirst({
        where: {
          providerId: provider.id,
          path: ef.folder,
        },
        select: { id: true, path: true },
      });

      if (folder) {
        // Count unread emails
        const unreadCount = await prisma.email.count({
          where: {
            providerId: provider.id,
            folder: ef.folder,
            isRead: false,
          },
        });

        await prisma.folder.update({
          where: { id: folder.id },
          data: {
            totalCount: ef._count._all,
            unreadCount,
          },
        });
        console.log(
          `  Updated: "${folder.path}" -> total: ${ef._count._all}, unread: ${unreadCount}`,
        );
        updated++;
      } else {
        console.log(`  WARNING: No folder found for email folder "${ef.folder}"`);
      }
    }

    console.log(`  Updated ${updated} folder counts`);
  }
}

async function verifyIntegrity() {
  console.log('\n=== Verifying Data Integrity ===\n');

  // Check for orphaned emails (emails with folder that doesn't match any folder.path)
  const orphanedEmails = await prisma.$queryRaw<
    { folder: string; provider_type: string; orphan_count: bigint }[]
  >`
    SELECT e.folder, pc."providerType" as provider_type, COUNT(*) as orphan_count
    FROM emails e
    JOIN provider_configs pc ON e."providerId" = pc.id
    LEFT JOIN folders f ON e."providerId" = f."providerId" AND e.folder = f.path
    WHERE f.id IS NULL
    GROUP BY e.folder, pc."providerType"
  `;

  if (orphanedEmails.length === 0) {
    console.log('SUCCESS: No orphaned emails found! All emails can join with folders.');
  } else {
    console.log('WARNING: Found orphaned emails (folder not found):');
    for (const oe of orphanedEmails) {
      console.log(`  - ${oe.provider_type} folder "${oe.folder}": ${oe.orphan_count} emails`);
    }
  }

  // Check folder count mismatches
  const mismatches = await prisma.$queryRaw<
    { path: string; total_count: number; actual_count: bigint }[]
  >`
    SELECT f.path, f."totalCount" as total_count, COUNT(e.id) as actual_count
    FROM folders f
    LEFT JOIN emails e ON f."providerId" = e."providerId" AND f.path = e.folder
    GROUP BY f.id, f.path, f."totalCount"
    HAVING f."totalCount" != COUNT(e.id)
  `;

  if (mismatches.length === 0) {
    console.log('SUCCESS: All folder counts match actual email counts.');
  } else {
    console.log('\nWARNING: Folder count mismatches found:');
    for (const m of mismatches) {
      console.log(
        `  - "${m.path}": stored=${m.total_count}, actual=${m.actual_count}`,
      );
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Folder Path Mismatch Migration');
  console.log('='.repeat(60));

  // Fix folder paths
  await fixGmailFolders();
  await fixMicrosoftFolders();

  // Update folder counts
  await updateFolderCounts();

  // Verify integrity
  await verifyIntegrity();

  console.log('\n' + '='.repeat(60));
  console.log('Migration Complete!');
  console.log('='.repeat(60) + '\n');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
