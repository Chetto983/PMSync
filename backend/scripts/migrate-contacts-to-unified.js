const { createPrismaClient } = require('./prisma-client');
const prisma = createPrismaClient();

/**
 * Migration Script: Convert old Contact model to new Contact + ProviderContact structure
 *
 * Strategy:
 * 1. Group old contacts by tenant + email (to create unified contacts)
 * 2. Create one Contact per unique email per tenant
 * 3. Convert each old contact to a ProviderContact linked to the unified Contact
 * 4. Merge data from all provider contacts into unified contact
 */

async function migrateContacts(dryRun = true) {
  console.log('\n🔄 Migrating Contacts to Unified + Provider Structure\n');
  console.log('='.repeat(80));

  try {
    // Get all existing contacts from the old table
    const oldContacts = await prisma.$queryRaw`
      SELECT * FROM contacts WHERE "isDeleted" = false ORDER BY "createdAt" ASC
    `;

    console.log(`\n📊 Found ${oldContacts.length} contacts to migrate\n`);

    if (oldContacts.length === 0) {
      console.log('✅ No contacts to migrate');
      return;
    }

    // Group contacts by tenant + primary email to create unified contacts
    const contactGroups = new Map();

    oldContacts.forEach((contact) => {
      try {
        const emails = contact.emails ? JSON.parse(JSON.stringify(contact.emails)) : [];

        if (Array.isArray(emails) && emails.length > 0) {
          // Use first email as primary
          const primaryEmail = emails[0].value?.toLowerCase().trim();

          if (primaryEmail) {
            const key = `${contact.tenantId}|${primaryEmail}`;

            if (!contactGroups.has(key)) {
              contactGroups.set(key, []);
            }

            contactGroups.get(key).push(contact);
          }
        }
      } catch (e) {
        console.error(`⚠️  Error processing contact ${contact.id}:`, e.message);
      }
    });

    console.log(`📋 Created ${contactGroups.size} unified contact groups\n`);

    if (dryRun) {
      console.log('⚠️  DRY RUN - Showing migration plan:\n');

      let groupIndex = 0;
      for (const [key, contacts] of contactGroups.entries()) {
        if (groupIndex < 5) { // Show first 5 as examples
          const [tenantId, email] = key.split('|');
          console.log(`\n📧 Group ${groupIndex + 1}: ${email}`);
          console.log(`   Tenant: ${tenantId}`);
          console.log(`   Provider contacts: ${contacts.length}`);

          contacts.forEach((contact, i) => {
            console.log(`   ${i + 1}. ${contact.displayName || 'No name'} (Provider: ${contact.providerId})`);
          });
        }
        groupIndex++;
      }

      if (contactGroups.size > 5) {
        console.log(`\n   ... and ${contactGroups.size - 5} more groups`);
      }

      console.log('\n' + '='.repeat(80));
      console.log(`\n📊 Migration Summary:`);
      console.log(`   Unified contacts to create: ${contactGroups.size}`);
      console.log(`   Provider contacts to create: ${oldContacts.length}`);
      console.log(`   Old contacts to archive: ${oldContacts.length}`);

      return { unifiedCount: contactGroups.size, providerCount: oldContacts.length };
    }

    // Execute migration
    console.log('🚀 Executing migration...\n');

    let unifiedCreated = 0;
    let providerCreated = 0;
    let errors = 0;

    for (const [key, contacts] of contactGroups.entries()) {
      try {
        const [tenantId, primaryEmail] = key.split('|');

        // Pick the most recently updated contact as the base for unified contact
        const baseContact = contacts.sort((a, b) =>
          new Date(b.updatedAt) - new Date(a.updatedAt)
        )[0];

        // Merge all emails from all provider contacts
        const allEmails = [];
        const allPhones = [];
        const allAddresses = [];

        contacts.forEach((contact) => {
          try {
            const emails = contact.emails ? JSON.parse(JSON.stringify(contact.emails)) : [];
            const phones = contact.phoneNumbers ? JSON.parse(JSON.stringify(contact.phoneNumbers)) : [];
            const addresses = contact.addresses ? JSON.parse(JSON.stringify(contact.addresses)) : [];

            if (Array.isArray(emails)) allEmails.push(...emails);
            if (Array.isArray(phones)) allPhones.push(...phones);
            if (Array.isArray(addresses)) allAddresses.push(...addresses);
          } catch (e) {
            console.error(`   ⚠️  Error merging data from contact ${contact.id}`);
          }
        });

        // Deduplicate emails, phones, addresses
        const uniqueEmails = Array.from(
          new Map(allEmails.map(e => [e.value?.toLowerCase(), e])).values()
        );
        const uniquePhones = Array.from(
          new Map(allPhones.map(p => [p.value, p])).values()
        );
        const uniqueAddresses = Array.from(
          new Map(allAddresses.map(a => [JSON.stringify(a), a])).values()
        );

        // Create unified contact
        const unifiedContact = await prisma.contact.create({
          data: {
            tenantId,
            displayName: baseContact.displayName,
            firstName: baseContact.firstName,
            lastName: baseContact.lastName,
            middleName: baseContact.middleName,
            nickname: baseContact.nickname,
            prefix: baseContact.prefix,
            suffix: baseContact.suffix,
            emails: uniqueEmails,
            phoneNumbers: uniquePhones,
            addresses: uniqueAddresses,
            company: baseContact.company,
            jobTitle: baseContact.jobTitle,
            department: baseContact.department,
            birthday: baseContact.birthday,
            anniversary: baseContact.anniversary,
            websites: baseContact.websites,
            socialProfiles: baseContact.socialProfiles,
            notes: baseContact.notes,
            photoUrl: baseContact.photoUrl,
            photoEtag: baseContact.photoEtag,
            isDeleted: false,
            isStarred: baseContact.isStarred || false,
            isFavorite: baseContact.isFavorite || false,
            metadata: baseContact.metadata,
          },
        });

        unifiedCreated++;

        // Create provider contacts for each old contact
        for (const oldContact of contacts) {
          try {
            await prisma.providerContact.create({
              data: {
                contactId: unifiedContact.id,
                tenantId: oldContact.tenantId,
                providerId: oldContact.providerId,
                externalId: oldContact.externalId,
                contactGroup: oldContact.contactGroup,
                rawData: oldContact, // Store full original contact as rawData
                firstName: oldContact.firstName,
                lastName: oldContact.lastName,
                middleName: oldContact.middleName,
                displayName: oldContact.displayName,
                nickname: oldContact.nickname,
                prefix: oldContact.prefix,
                suffix: oldContact.suffix,
                emails: oldContact.emails,
                phoneNumbers: oldContact.phoneNumbers,
                addresses: oldContact.addresses,
                company: oldContact.company,
                jobTitle: oldContact.jobTitle,
                department: oldContact.department,
                birthday: oldContact.birthday,
                anniversary: oldContact.anniversary,
                websites: oldContact.websites,
                socialProfiles: oldContact.socialProfiles,
                notes: oldContact.notes,
                photoUrl: oldContact.photoUrl,
                photoEtag: oldContact.photoEtag,
                vCardVersion: oldContact.vCardVersion,
                lastSyncedAt: oldContact.lastSyncedAt,
                syncVersion: oldContact.syncVersion,
                eTag: oldContact.eTag,
                metadata: oldContact.metadata,
              },
            });

            providerCreated++;
          } catch (e) {
            console.error(`   ❌ Error creating provider contact for ${oldContact.id}: ${e.message}`);
            errors++;
          }
        }

        if (unifiedCreated % 50 === 0) {
          console.log(`   ✅ Created ${unifiedCreated} unified contacts, ${providerCreated} provider contacts...`);
        }

      } catch (e) {
        console.error(`   ❌ Error creating unified contact for group ${key}: ${e.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Migration Complete!\n`);
    console.log(`   Unified contacts created: ${unifiedCreated}`);
    console.log(`   Provider contacts created: ${providerCreated}`);
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors}`);
    }

    console.log('\n  Next steps:');
    console.log('   1. Verify the migrated data in unified_contacts and provider_contacts tables');
    console.log('   2. Update your application code to use the new schema');
    console.log('   3. Once verified, you can drop the old contacts table:\n');
    console.log('      DROP TABLE contacts CASCADE;\n');

    return { unifiedCreated, providerCreated, errors };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🔄 Contact Schema Migration Tool\n');
  console.log('==================================\n');

  if (dryRun) {
    console.log('⚠️  Running in DRY RUN mode');
    console.log('    Add --execute flag to perform actual migration\n');
  } else {
    console.log('⚠️  EXECUTING MIGRATION - THIS WILL CREATE NEW DATA!');
    console.log('    Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const result = await migrateContacts(dryRun);

  if (dryRun && result) {
    console.log('\n💡 To execute the migration, run:');
    console.log('   node scripts/migrate-contacts-to-unified.js --execute\n');
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
