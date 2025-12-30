import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

async function main() {
  const folders = await prisma.folder.findMany({
    where: {
      OR: [
        { name: { contains: 'Pippo' } },
        { name: { contains: 'Pollo' } },
        { name: { contains: 'Label' } },
        { path: { contains: 'Label' } },
      ],
    },
    select: {
      id: true,
      name: true,
      path: true,
      externalId: true,
      specialUse: true,
      isSystem: true,
    },
  });

  console.log('=== Gmail Custom Folders ===');
  console.log(JSON.stringify(folders, null, 2));
  console.log('\nname vs path:');
  folders.forEach(f => console.log(`${f.name} --> ${f.path}`));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
