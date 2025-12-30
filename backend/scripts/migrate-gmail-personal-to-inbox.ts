/**
 * Database Migration: Fix Gmail CATEGORY_PERSONAL folder mapping
 *
 * This migrates existing data from PERSONAL/Personale to INBOX
 * Run with: npx tsx backend/scripts/migrate-gmail-personal-to-inbox.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Starting Gmail folder migration...\n');

  // Get all Gmail providers
  const gmailProviders = await prisma.emailProvider.findMany({
    where: { type: 'GMAIL' },
    select: { id: true, email: true },
  });

  if (gmailProviders.length === 0) {
    console.log('⚠️  No Gmail providers found. Nothing to migrate.');
    return;
  }

  console.log(`📧 Found ${gmailProviders.length} Gmail provider(s):\n`);
  gmailProviders.forEach((p) => console.log(`   - ${p.email} (${p.id})`));
  console.log('');

  for (const provider of gmailProviders) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📬 Migrating: ${provider.email}`);
    console.log('='.repeat(60));

    // Step 1: Find emails with PERSONAL/Personale folder
    const emailsToUpdate = await prisma.email.findMany({
      where: {
        providerId: provider.id,
        folder: {
          in: ['PERSONAL', 'Personale', 'Personal'],
        },
      },
      select: { id: true, folder: true },
    });

    if (emailsToUpdate.length > 0) {
      console.log(`\n📝 Found ${emailsToUpdate.length} emails with wrong folder:`);
      const folderCounts = emailsToUpdate.reduce((acc, e) => {
        acc[e.folder] = (acc[e.folder] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      Object.entries(folderCounts).forEach(([folder, count]) => {
        console.log(`   - ${folder}: ${count} emails`);
      });

      // Update emails to INBOX
      const updateResult = await prisma.email.updateMany({
        where: {
          providerId: provider.id,
          folder: {
            in: ['PERSONAL', 'Personale', 'Personal'],
          },
        },
        data: {
          folder: 'INBOX',
        },
      });

      console.log(`   ✅ Updated ${updateResult.count} emails to INBOX`);
    } else {
      console.log('\n✅ No emails with PERSONAL/Personale folder found');
    }

    // Step 2: Delete phantom PERSONAL/Personale folders
    const phantomFolders = await prisma.folder.findMany({
      where: {
        providerId: provider.id,
        OR: [
          { path: { in: ['PERSONAL', 'Personale', 'Personal'] } },
          { name: { in: ['PERSONAL', 'Personale', 'Personal'] } },
        ],
        specialUse: { not: 'INBOX' }, // Don't delete real INBOX
      },
      select: { id: true, path: true, name: true },
    });

    if (phantomFolders.length > 0) {
      console.log(`\n🗑️  Deleting ${phantomFolders.length} phantom folder(s):`);
      phantomFolders.forEach((f) => {
        console.log(`   - ${f.path} / ${f.name}`);
      });

      const deleteResult = await prisma.folder.deleteMany({
        where: {
          id: { in: phantomFolders.map((f) => f.id) },
        },
      });

      console.log(`   ✅ Deleted ${deleteResult.count} phantom folders`);
    } else {
      console.log('\n✅ No phantom folders found');
    }

    // Step 3: Update INBOX folder counts
    const inboxFolder = await prisma.folder.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { path: 'INBOX' },
          { specialUse: 'INBOX' },
        ],
      },
    });

    if (inboxFolder) {
      const totalCount = await prisma.email.count({
        where: {
          providerId: provider.id,
          folder: 'INBOX',
          isDeleted: false,
        },
      });

      const unreadCount = await prisma.email.count({
        where: {
          providerId: provider.id,
          folder: 'INBOX',
          isDeleted: false,
          isRead: false,
        },
      });

      await prisma.folder.update({
        where: { id: inboxFolder.id },
        data: {
          totalCount,
          unreadCount,
          updatedAt: new Date(),
        },
      });

      console.log(`\n📊 Updated INBOX folder counts:`);
      console.log(`   - Total: ${totalCount}`);
      console.log(`   - Unread: ${unreadCount}`);
    } else {
      console.log('\n⚠️  INBOX folder not found (will be created on next sync)');
    }

    // Verification
    console.log(`\n🔍 Verification:`);
    const emailsByFolder = await prisma.email.groupBy({
      by: ['folder'],
      where: {
        providerId: provider.id,
        isDeleted: false,
      },
      _count: true,
    });

    console.log('   Email distribution:');
    emailsByFolder.forEach((group) => {
      console.log(`   - ${group.folder}: ${group._count} emails`);
    });

    const remainingPhantom = await prisma.folder.count({
      where: {
        providerId: provider.id,
        OR: [
          { path: { in: ['PERSONAL', 'Personale', 'Personal'] } },
          { name: { in: ['PERSONAL', 'Personale', 'Personal'] } },
        ],
      },
    });

    if (remainingPhantom > 0) {
      console.log(`   ⚠️  Still ${remainingPhantom} phantom folders remaining!`);
    } else {
      console.log(`   ✅ No phantom folders remaining`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Migration completed successfully!');
  console.log('='.repeat(60));
  console.log('\n💡 Next steps:');
  console.log('   1. Refresh your email list in the frontend');
  console.log('   2. All emails should now appear in INBOX');
  console.log('   3. No more "Personale" folder!\n');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
