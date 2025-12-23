require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Checking providers in database...\n');

  const providers = await prisma.providerConfig.findMany({
    select: {
      id: true,
      tenantId: true,
      email: true,
      providerType: true,
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true
    }
  });

  console.log('Found', providers.length, 'providers:\n');
  providers.forEach((p, i) => {
    console.log(`Provider ${i + 1}:`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Tenant: ${p.tenantId}`);
    console.log(`  Email: ${p.email}`);
    console.log(`  Type: ${p.providerType}`);
    console.log(`  Supports: Email=${p.supportsEmail}, Calendar=${p.supportsCalendar}, Contacts=${p.supportsContacts}`);
    console.log('');
  });

  // Also check for pending actions
  const pendingActions = await prisma.agentPendingAction.count();
  console.log(`Pending Actions in DB: ${pendingActions}`);

  // Check for learning profiles
  const learningProfiles = await prisma.agentLearningProfile.count();
  console.log(`Learning Profiles in DB: ${learningProfiles}`);

  await prisma.$disconnect();
}

main().catch(console.error);
