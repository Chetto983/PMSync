const { createPrismaClient } = require('./prisma-client');
const prisma = createPrismaClient();

async function findEmailDuplicates() {
  console.log('\n🔍 Finding contacts with duplicate email addresses...\n');

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
      orderBy: { createdAt: 'asc' },
    });

    console.log(`📊 Total contacts with emails: ${contacts.length}\n`);

    // Extract all email addresses and group contacts by email
    const emailGroups = {};

    contacts.forEach((contact) => {
      try {
        const emailsArray = JSON.parse(JSON.stringify(contact.emails));

        if (Array.isArray(emailsArray)) {
          emailsArray.forEach((emailObj) => {
            if (emailObj.value) {
              const email = emailObj.value.toLowerCase().trim();

              if (!emailGroups[email]) {
                emailGroups[email] = [];
              }

              emailGroups[email].push({
                ...contact,
                matchedEmail: email
              });
            }
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Find emails that appear in multiple contacts
    const duplicateEmails = Object.entries(emailGroups)
      .filter(([_, contacts]) => contacts.length > 1)
      .sort((a, b) => b[1].length - a[1].length); // Sort by most duplicates first

    if (duplicateEmails.length === 0) {
      console.log('✅ No duplicate email addresses found!');
      return;
    }

    console.log(`⚠️  Found ${duplicateEmails.length} email addresses with duplicates:\n`);
    console.log('=' .repeat(80));

    let totalDuplicateContacts = 0;

    duplicateEmails.forEach(([email, duplicates], index) => {
      totalDuplicateContacts += duplicates.length - 1; // -1 because we keep one

      console.log(`\n📧 ${index + 1}. Email: ${email}`);
      console.log(`   Found in ${duplicates.length} contacts:`);
      console.log('   ' + '-'.repeat(76));

      duplicates.forEach((contact, i) => {
        const name = contact.displayName ||
          `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
          'No name';

        console.log(`\n   ${i + 1}. Contact ID: ${contact.id}`);
        console.log(`      Name: ${name}`);
        console.log(`      Provider: ${contact.provider.email} (${contact.provider.providerType})`);
        console.log(`      External ID: ${contact.externalId}`);
        console.log(`      Created: ${contact.createdAt.toISOString()}`);
        console.log(`      Updated: ${contact.updatedAt.toISOString()}`);
      });

      // Suggest which to keep
      const sorted = duplicates.sort((a, b) => b.updatedAt - a.updatedAt);
      console.log(`\n   💡 Suggestion: Keep contact ${sorted[0].id} (most recently updated)`);
      console.log(`   ❌ Can remove: ${sorted.slice(1).map(c => c.id).join(', ')}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Unique email addresses with duplicates: ${duplicateEmails.length}`);
    console.log(`   Total duplicate contacts: ${totalDuplicateContacts}`);
    console.log(`   Total contacts after cleanup: ${contacts.length - totalDuplicateContacts}`);

    // Group duplicates by tenant
    const byTenant = {};
    duplicateEmails.forEach(([email, duplicates]) => {
      duplicates.forEach((contact) => {
        if (!byTenant[contact.tenantId]) {
          byTenant[contact.tenantId] = 0;
        }
        byTenant[contact.tenantId]++;
      });
    });

    console.log(`\n   Duplicates by tenant:`);
    Object.entries(byTenant).forEach(([tenantId, count]) => {
      console.log(`      ${tenantId}: ${count} duplicate contacts`);
    });

    console.log('\n💡 These duplicates might be from:');
    console.log('   • Multiple syncs from the same provider');
    console.log('   • The same contact in multiple providers (Gmail + Microsoft)');
    console.log('   • Manual imports');

    console.log('\n⚠️  Note: This script only reports duplicates. To remove them:');
    console.log('   1. Review the list above');
    console.log('   2. Decide which contacts to keep');
    console.log('   3. Use the cleanup-duplicate-contacts.js script or manually delete\n');

  } catch (error) {
    console.error('❌ Error finding email duplicates:', error);
    throw error;
  }
}

async function main() {
  console.log('🔎 Email Duplicate Finder\n');
  console.log('================================\n');

  await findEmailDuplicates();
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
