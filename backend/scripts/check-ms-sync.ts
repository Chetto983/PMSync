import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';

async function check() {
  // Check all MS emails (including deleted)
  const allMsEmails = await prisma.email.count({ where: { providerId: MS_PROVIDER_ID } });
  const deletedMsEmails = await prisma.email.count({ where: { providerId: MS_PROVIDER_ID, isDeleted: true } });
  const activeMsEmails = await prisma.email.count({ where: { providerId: MS_PROVIDER_ID, isDeleted: false } });

  console.log('MS Email Status:');
  console.log('  Total (all):', allMsEmails);
  console.log('  Active:', activeMsEmails);
  console.log('  Deleted:', deletedMsEmails);

  // Check MS folders
  const msFolders = await prisma.folder.findMany({ where: { providerId: MS_PROVIDER_ID } });
  console.log('\nMS Folders:', msFolders.length);
  msFolders.forEach(f => console.log(`  - ${f.name} (${f.type})`));

  // Check provider metadata
  const provider = await prisma.providerConfig.findUnique({
    where: { id: MS_PROVIDER_ID },
    select: { metadata: true, lastSyncedAt: true, email: true }
  });
  console.log('\nProvider:', provider?.email);
  console.log('Last sync:', provider?.lastSyncedAt);
  console.log('Metadata:', JSON.stringify(provider?.metadata).substring(0, 300));

  await prisma.$disconnect();
}
check().catch(console.error);
