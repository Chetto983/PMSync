const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDuplicates() {
  console.log('\n🔍 Finding duplicate contacts...\n');

  try {
    // Get all contacts
    const contacts = await prisma.contact.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        tenantId: true,
        providerId: true,
        externalId: true,
        displayName: true,
        firstName: true,
        lastName: true,
        emails: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`📊 Total contacts: ${contacts.length}\n`);

    // Group contacts by tenantId + providerId + externalId
    const groups = {};

    contacts.forEach((contact) => {
      const key = `${contact.tenantId}|${contact.providerId}|${contact.externalId}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(contact);
    });

    // Find groups with duplicates
    const duplicateGroups = Object.entries(groups).filter(([_, contacts]) => contacts.length > 1);

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate contacts found!');
      return { duplicates: [], totalDuplicates: 0 };
    }

    console.log(`⚠️  Found ${duplicateGroups.length} groups with duplicates:\n`);

    let totalDuplicates = 0;
    const duplicatesToRemove = [];

    duplicateGroups.forEach(([key, duplicates], index) => {
      console.log(`\n📋 Group ${index + 1}:`);
      console.log(`   Key: ${key}`);
      console.log(`   Duplicates: ${duplicates.length}`);

      duplicates.forEach((contact, i) => {
        const emailStr = contact.emails
          ? JSON.stringify(contact.emails).slice(0, 100)
          : 'No email';

        console.log(`   ${i + 1}. ID: ${contact.id}`);
        console.log(`      Name: ${contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'No name'}`);
        console.log(`      Email: ${emailStr}`);
        console.log(`      Created: ${contact.createdAt.toISOString()}`);
        console.log(`      Updated: ${contact.updatedAt.toISOString()}`);
      });

      // Keep the most recently updated contact, remove others
      const sorted = duplicates.sort((a, b) => b.updatedAt - a.updatedAt);
      const toKeep = sorted[0];
      const toRemove = sorted.slice(1);

      console.log(`   ✅ Will keep: ${toKeep.id} (most recent)`);
      console.log(`   ❌ Will remove: ${toRemove.length} duplicate(s)`);

      totalDuplicates += toRemove.length;
      duplicatesToRemove.push(...toRemove.map(c => c.id));
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total duplicate groups: ${duplicateGroups.length}`);
    console.log(`   Total duplicates to remove: ${totalDuplicates}`);
    console.log(`   Total contacts after cleanup: ${contacts.length - totalDuplicates}`);

    return { duplicates: duplicatesToRemove, totalDuplicates };

  } catch (error) {
    console.error('❌ Error finding duplicates:', error);
    throw error;
  }
}

async function removeDuplicates(duplicateIds, dryRun = true) {
  if (duplicateIds.length === 0) {
    console.log('\n✅ No duplicates to remove!');
    return;
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes will be made');
    console.log(`Would remove ${duplicateIds.length} duplicate contacts`);
    return;
  }

  console.log(`\n🗑️  Removing ${duplicateIds.length} duplicate contacts...`);

  try {
    const result = await prisma.contact.deleteMany({
      where: {
        id: { in: duplicateIds },
      },
    });

    console.log(`✅ Removed ${result.count} duplicate contacts`);
  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🧹 Contact Duplicate Cleanup Tool\n');
  console.log('================================\n');

  if (dryRun) {
    console.log('⚠️  Running in DRY RUN mode - no changes will be made');
    console.log('    Add --execute flag to actually remove duplicates\n');
  } else {
    console.log('⚠️  EXECUTING - duplicates will be PERMANENTLY removed!\n');
  }

  // Find duplicates
  const { duplicates, totalDuplicates } = await findDuplicates();

  if (totalDuplicates === 0) {
    console.log('\n✅ Database is clean - no duplicates found!');
    return;
  }

  // Remove duplicates
  await removeDuplicates(duplicates, dryRun);

  if (dryRun) {
    console.log('\n💡 To actually remove duplicates, run:');
    console.log('   node scripts/cleanup-duplicate-contacts.js --execute\n');
  } else {
    console.log('\n✅ Cleanup complete!\n');
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
