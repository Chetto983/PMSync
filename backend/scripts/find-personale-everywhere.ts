import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  console.log('🔍 Searching for "Personale" or "PERSONAL" everywhere...\n');

  // Check folders table
  const foldersPersonale = await prisma.folder.findMany({
    where: {
      OR: [
        { name: { contains: 'Personal', mode: 'insensitive' } },
        { name: { contains: 'Personale', mode: 'insensitive' } },
        { path: { contains: 'PERSONAL', mode: 'insensitive' } },
        { path: { contains: 'Personale', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      providerId: true,
      name: true,
      path: true,
      specialUse: true,
      isSystem: true,
      totalCount: true,
    },
  });

  console.log(`📂 Folders with "Personal/Personale": ${foldersPersonale.length}`);
  foldersPersonale.forEach(f => {
    console.log(`   Provider: ${f.providerId}`);
    console.log(`   Name: ${f.name}`);
    console.log(`   Path: ${f.path}`);
    console.log(`   Special: ${f.specialUse || 'none'}`);
    console.log(`   System: ${f.isSystem}`);
    console.log(`   Count: ${f.totalCount}`);
    console.log('');
  });

  // Check emails table
  const emailsPersonale = await prisma.email.findMany({
    where: {
      OR: [
        { folder: { contains: 'PERSONAL', mode: 'insensitive' } },
        { folder: { contains: 'Personale', mode: 'insensitive' } },
      ],
      isDeleted: false,
    },
    select: {
      id: true,
      providerId: true,
      folder: true,
      subject: true,
    },
    take: 10,
  });

  console.log(`📨 Emails in "Personal/Personale" folder: ${emailsPersonale.length}`);
  emailsPersonale.forEach(e => {
    console.log(`   Subject: ${e.subject?.substring(0, 50)}`);
    console.log(`   Folder: ${e.folder}`);
    console.log('');
  });

  // Check for Gmail provider folders specifically
  const gmailProvider = await prisma.providerConfig.findFirst({
    where: { providerType: 'google' },
    select: { id: true, email: true },
  });

  if (gmailProvider) {
    console.log(`\n🔍 Gmail Provider: ${gmailProvider.email}`);
    const gmailFolders = await prisma.folder.findMany({
      where: { providerId: gmailProvider.id },
      select: {
        name: true,
        path: true,
        specialUse: true,
        totalCount: true,
      },
      orderBy: { totalCount: 'desc' },
    });

    console.log(`\n📊 ALL Gmail folders (${gmailFolders.length}):`);
    gmailFolders.forEach(f => {
      console.log(`   ${f.name} (${f.path}) - ${f.specialUse || 'no special'} - ${f.totalCount} emails`);
    });
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
