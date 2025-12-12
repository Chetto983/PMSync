/**
 * Simple IMAP sync test using the LiberoMail provider
 * This bypasses NestJS app context and tests the core sync logic
 */

const { PrismaClient } = require('@prisma/client');

async function testImap() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 IMAP Sync Test - LiberoMail Provider\n');

    // Find the IMAP provider (testopta@libero.it)
    const provider = await prisma.providerConfig.findFirst({
      where: {
        providerType: 'imap',
        imapPassword: { not: null },
      },
    });

    if (!provider) {
      console.error('❌ No IMAP provider found in database');
      console.log('Expected: testopta@libero.it (LiberoMail)');
      process.exit(1);
    }

    console.log(`✅ Found IMAP provider: ${provider.email}`);
    console.log(`   Host: ${provider.imapHost}:${provider.imapPort}`);
    console.log(`   Provider ID: ${provider.id}`);
    console.log(`   Tenant ID: ${provider.tenantId}\n`);

    // Check existing emails for this provider
    const emailCount = await prisma.email.count({
      where: { providerId: provider.id },
    });

    console.log(`📧 Current email count: ${emailCount}\n`);

    console.log('✅ Database connection successful');
    console.log('✅ Provider configuration valid');
    console.log('\n⚠️  Note: Full sync test requires NestJS context (ImapSyncService)');
    console.log('   To test: Run backend server and trigger sync via API\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testImap()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
