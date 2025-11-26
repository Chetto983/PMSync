const { createPrismaClient } = require('./prisma-client');
const prisma = createPrismaClient();

async function check() {
  try {
    const unifiedCount = await prisma.contact.count();
    const providerCount = await prisma.providerContact.count();

    console.log('\n📊 New Tables Status:');
    console.log(`   Unified contacts: ${unifiedCount}`);
    console.log(`   Provider contacts: ${providerCount}\n`);

    if (unifiedCount === 0 && providerCount === 0) {
      console.log('⚠️  WARNING: Both tables are empty!');
      console.log('   The old contacts table was dropped during schema migration.');
      console.log('   You need to restore from backup or re-sync from providers.\n');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
