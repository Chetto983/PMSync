const { createPrismaClient } = require('./prisma-client');
const prisma = createPrismaClient();

/**
 * Deduplication Strategy:
 * For each tenant + email combination:
 * 1. Keep ONE contact per provider (most recently updated)
 * 2. This preserves cross-provider contacts (same email in Gmail + Microsoft is OK)
 * 3. Remove duplicates within the same provider
 */

async function deduplicateContacts(dryRun = true) {
  console.log('\n🧹 Deduplicating contacts by email address...\n');

  try {
    // Get all contacts with emails
    const contacts = await prisma.contact.findMany({
      where: {
        isDeleted: false,
        emails: { not: null }
      },
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
        provider: {
          select: {
            email: true,
            providerType: true,
          }
        }
      },
      orderBy: { updatedAt: 'desc' }, // Most recent first
    });

    console.log(`📊 Total contacts: ${contacts.length}\n`);

    // Group contacts by tenantId + email + providerId
    const groups = {};

    contacts.forEach((contact) => {
      try {
        const emailsArray = JSON.parse(JSON.stringify(contact.emails));

        if (Array.isArray(emailsArray)) {
          emailsArray.forEach((emailObj) => {
            if (emailObj.value) {
              const email = emailObj.value.toLowerCase().trim();
              // Key: tenantId|providerId|email (keep one per provider)
              const key = `${contact.tenantId}|${contact.providerId}|${email}`;

              if (!groups[key]) {
                groups[key] = [];
              }

              groups[key].push({
                ...contact,
                matchedEmail: email
              });
            }
          });
        }
      } catch (e) {
        console.error(`⚠️  Error parsing emails for contact ${contact.id}`);
      }
    });

    // Find groups with duplicates
    const duplicateGroups = Object.entries(groups)
      .filter(([_, contacts]) => contacts.length > 1)
      .sort((a, b) => b[1].length - a[1].length); // Sort by most duplicates

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicates found!');
      return { toRemove: [], summary: {} };
    }

    console.log(`⚠️  Found ${duplicateGroups.length} groups with duplicates\n`);

    const toRemove = [];
    const summary = {
      totalGroups: duplicateGroups.length,
      totalDuplicates: 0,
      byProvider: {},
    };

    duplicateGroups.forEach(([key, duplicates], index) => {
      const [tenantId, providerId, email] = key.split('|');

      if (index < 10) { // Show first 10 for brevity
        console.log(`\n📋 Group ${index + 1}: ${email}`);
        console.log(`   Provider: ${duplicates[0].provider.email} (${duplicates[0].provider.providerType})`);
        console.log(`   Duplicates: ${duplicates.length}`);
      }

      // Keep the most recently updated, remove others
      const [toKeep, ...toDelete] = duplicates; // Already sorted by updatedAt desc

      if (index < 10) {
        console.log(`   ✅ Keeping: ${toKeep.id} - ${toKeep.displayName || 'No name'} (updated: ${toKeep.updatedAt.toISOString()})`);
        toDelete.forEach((contact) => {
          console.log(`   ❌ Removing: ${contact.id} - ${contact.displayName || 'No name'} (updated: ${contact.updatedAt.toISOString()})`);
        });
      }

      toRemove.push(...toDelete.map(c => c.id));
      summary.totalDuplicates += toDelete.length;

      const providerType = duplicates[0].provider.providerType;
      if (!summary.byProvider[providerType]) {
        summary.byProvider[providerType] = 0;
      }
      summary.byProvider[providerType] += toDelete.length;
    });

    if (duplicateGroups.length > 10) {
      console.log(`\n   ... and ${duplicateGroups.length - 10} more groups`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Duplicate groups: ${summary.totalGroups}`);
    console.log(`   Duplicates to remove: ${summary.totalDuplicates}`);
    console.log(`   Contacts after cleanup: ${contacts.length - summary.totalDuplicates}`);
    console.log(`\n   Duplicates by provider:`);
    Object.entries(summary.byProvider).forEach(([provider, count]) => {
      console.log(`      ${provider}: ${count}`);
    });

    return { toRemove, summary };

  } catch (error) {
    console.error('❌ Error during deduplication:', error);
    throw error;
  }
}

async function removeContacts(ids, dryRun = true) {
  if (ids.length === 0) {
    console.log('\n✅ No contacts to remove!');
    return;
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes will be made');
    console.log(`   Would remove ${ids.length} duplicate contacts\n`);
    return;
  }

  console.log(`\n🗑️  Removing ${ids.length} duplicate contacts...`);

  try {
    // Remove in batches of 100
    const batchSize = 100;
    let removed = 0;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      const result = await prisma.contact.deleteMany({
        where: {
          id: { in: batch },
        },
      });

      removed += result.count;
      console.log(`   Removed batch ${Math.floor(i / batchSize) + 1}: ${result.count} contacts`);
    }

    console.log(`\n✅ Successfully removed ${removed} duplicate contacts`);

  } catch (error) {
    console.error('❌ Error removing contacts:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🧹 Contact Email Deduplication Tool\n');
  console.log('====================================\n');

  if (dryRun) {
    console.log('⚠️  Running in DRY RUN mode - no changes will be made');
    console.log('    Add --execute flag to actually remove duplicates\n');
  } else {
    console.log('⚠️  EXECUTING - duplicates will be PERMANENTLY removed!');
    console.log('    Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Find duplicates
  const { toRemove, summary } = await deduplicateContacts(dryRun);

  if (toRemove.length === 0) {
    console.log('\n✅ Database is clean - no duplicates found!');
    return;
  }

  // Remove duplicates
  await removeContacts(toRemove, dryRun);

  if (dryRun) {
    console.log('\n💡 To actually remove duplicates, run:');
    console.log('   node scripts/deduplicate-contacts-by-email.js --execute\n');
    console.log('⚠️  This will:');
    console.log('   • Keep ONE contact per email per provider (most recently updated)');
    console.log('   • Preserve cross-provider contacts (same email in Gmail + Microsoft)');
    console.log('   • Remove duplicates within the same provider\n');
  } else {
    console.log('\n✅ Deduplication complete!\n');
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
