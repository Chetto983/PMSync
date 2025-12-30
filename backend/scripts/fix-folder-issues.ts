/**
 * Fix Folder Issues Script
 *
 * Fixes actual issues in the folders table:
 * 1. Clear invalid specialUse values (CONVERSATION HISTORY, TEST, etc.)
 * 2. Recalculate and fix totalCount/unreadCount for all folders
 *
 * Run with: npx ts-node scripts/fix-folder-issues.ts
 *
 * Options:
 *   --dry-run  Show what would be changed without making changes
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Valid specialUse values - Complete list from:
// 1. IMAP RFC 6154 special-use flags: \All, \Archive, \Drafts, \Flagged, \Junk, \Sent, \Trash
// 2. IMAP RFC 8457: \Important
// 3. Microsoft Graph API wellKnownName: https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
// 4. Gmail API system labels: https://developers.google.com/workspace/gmail/api/guides/labels
const VALID_SPECIAL_USES = new Set([
  // IMAP RFC 6154 standard special-use flags
  'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'JUNK', 'ARCHIVE', 'ALL', 'FLAGGED',
  // IMAP RFC 8457 - Important
  'IMPORTANT',
  // Common aliases/variants
  'SPAM', 'STARRED', 'SCHEDULED', 'SNOOZED',
  // Microsoft Graph API wellKnownName values (lowercase in API, uppercase here)
  'OUTBOX',
  'CONVERSATIONHISTORY', 'CONVERSATION HISTORY',  // Skype/Teams IM history
  'DELETEDITEMS', 'DELETED ITEMS',                 // Trash alias
  'SENTITEMS', 'SENT ITEMS',                       // Sent alias
  'JUNKEMAIL', 'JUNK EMAIL',                       // Spam alias
  'CLUTTER',                                       // Low-priority messages
  'CONFLICTS',                                     // Sync conflicts
  'LOCALFAILURES', 'LOCAL FAILURES',               // Local sync failures
  'SERVERFAILURES', 'SERVER FAILURES',             // Server sync failures
  'SYNCISSUES', 'SYNC ISSUES',                     // Sync logs
  'RECOVERABLEITEMSDELETIONS',                     // Soft-deleted items
  'MSGFOLDERROOT',                                 // Root folder
  'SEARCHFOLDERS',                                 // Search folder parent
  // Gmail API system labels
  'DRAFT',                                         // Gmail uses DRAFT not DRAFTS
  'UNREAD',                                        // Gmail unread label
  'CHAT',                                          // Gmail chat messages
  'CATEGORY_PERSONAL',                             // Gmail category
  'CATEGORY_SOCIAL',                               // Gmail category
  'CATEGORY_PROMOTIONS',                           // Gmail category
  'CATEGORY_UPDATES',                              // Gmail category
  'CATEGORY_FORUMS',                               // Gmail category
]);

async function main() {
  console.log('============================================================');
  console.log('FIX FOLDER ISSUES SCRIPT');
  console.log('============================================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  if (dryRun) console.log('🔍 DRY RUN MODE - No changes will be made');
  console.log('');

  const prisma = createPrismaClient();

  try {
    // ============================================================
    // 1. FIX INVALID SPECIALUSE VALUES
    // ============================================================
    console.log('============================================================');
    console.log('1. FIX INVALID SPECIALUSE VALUES');
    console.log('============================================================');

    // Find folders with invalid specialUse
    const invalidSpecialUseFolders = await prisma.folder.findMany({
      where: {
        specialUse: { not: null },
      },
      select: {
        id: true,
        name: true,
        path: true,
        specialUse: true,
        providerId: true,
      },
    });

    const foldersToFix = invalidSpecialUseFolders.filter(
      (f) => f.specialUse && !VALID_SPECIAL_USES.has(f.specialUse.toUpperCase())
    );

    console.log(`  Found ${foldersToFix.length} folders with invalid specialUse:`);
    for (const folder of foldersToFix) {
      console.log(`    - ${folder.name} (${folder.path}): "${folder.specialUse}" -> NULL`);
    }

    if (foldersToFix.length > 0 && !dryRun) {
      console.log('\n  🔧 Clearing invalid specialUse values...');
      for (const folder of foldersToFix) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { specialUse: null },
        });
      }
      console.log(`  ✅ Fixed ${foldersToFix.length} folders`);
    }

    // ============================================================
    // 2. FIX FOLDER COUNTS (totalCount, unreadCount)
    // ============================================================
    console.log('\n============================================================');
    console.log('2. FIX FOLDER COUNTS');
    console.log('============================================================');

    // Get all folders with their counts
    const allFolders = await prisma.folder.findMany({
      select: {
        id: true,
        name: true,
        path: true,
        specialUse: true,
        providerId: true,
        totalCount: true,
        unreadCount: true,
      },
    });

    let countFixCount = 0;

    for (const folder of allFolders) {
      // Count emails in this folder
      // Email.folder matches either path, specialUse, or name
      const whereConditions = [
        { folder: folder.path },
      ];
      if (folder.specialUse) {
        whereConditions.push({ folder: folder.specialUse });
        whereConditions.push({ folder: folder.specialUse.toUpperCase() });
        whereConditions.push({ folder: folder.specialUse.toLowerCase() });
      }
      if (folder.name !== folder.path) {
        whereConditions.push({ folder: folder.name });
      }

      const actualTotalCount = await prisma.email.count({
        where: {
          providerId: folder.providerId,
          OR: whereConditions,
        },
      });

      const actualUnreadCount = await prisma.email.count({
        where: {
          providerId: folder.providerId,
          isRead: false,
          OR: whereConditions,
        },
      });

      const needsFix =
        folder.totalCount !== actualTotalCount ||
        folder.unreadCount !== actualUnreadCount;

      if (needsFix) {
        console.log(`  📊 ${folder.name} (${folder.path}):`);
        console.log(`      totalCount: ${folder.totalCount} -> ${actualTotalCount}`);
        console.log(`      unreadCount: ${folder.unreadCount} -> ${actualUnreadCount}`);

        if (!dryRun) {
          await prisma.folder.update({
            where: { id: folder.id },
            data: {
              totalCount: actualTotalCount,
              unreadCount: actualUnreadCount,
            },
          });
        }
        countFixCount++;
      }
    }

    if (countFixCount === 0) {
      console.log('  ✅ All folder counts are correct');
    } else if (!dryRun) {
      console.log(`\n  ✅ Fixed counts for ${countFixCount} folders`);
    } else {
      console.log(`\n  📋 Would fix counts for ${countFixCount} folders (dry-run)`);
    }

    // ============================================================
    // 3. FIX ROOT FOLDER LEVELS
    // ============================================================
    console.log('\n============================================================');
    console.log('3. FIX ROOT FOLDER LEVELS');
    console.log('============================================================');

    const rootFoldersWithWrongLevel = await prisma.folder.findMany({
      where: {
        parentId: null,
        level: { not: 0 },
      },
      select: {
        id: true,
        name: true,
        level: true,
      },
    });

    console.log(`  Found ${rootFoldersWithWrongLevel.length} root folders with non-zero level`);
    for (const folder of rootFoldersWithWrongLevel) {
      console.log(`    - ${folder.name}: level ${folder.level} -> 0`);
    }

    if (rootFoldersWithWrongLevel.length > 0 && !dryRun) {
      console.log('\n  🔧 Fixing root folder levels...');
      await prisma.folder.updateMany({
        where: {
          parentId: null,
          level: { not: 0 },
        },
        data: { level: 0 },
      });
      console.log(`  ✅ Fixed ${rootFoldersWithWrongLevel.length} folders`);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n============================================================');
    console.log('SUMMARY');
    console.log('============================================================');

    console.log(`\n  - Invalid specialUse fixed: ${dryRun ? '(dry-run)' : foldersToFix.length}`);
    console.log(`  - Folder counts fixed: ${dryRun ? '(dry-run)' : countFixCount}`);
    console.log(`  - Root levels fixed: ${dryRun ? '(dry-run)' : rootFoldersWithWrongLevel.length}`);

    if (dryRun) {
      console.log('\n💡 TIP: Run without --dry-run to apply fixes');
    }

    console.log(`\n============================================================`);
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('============================================================');

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
