import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function run() {
  const p = createPrismaClient();

  // Fix folder specialUse values
  const folders = await p.folder.findMany();
  console.log(`Found ${folders.length} folders`);

  for (const f of folders) {
    let newSpecialUse: string | null = null;
    const name = f.name.toLowerCase();
    const path = f.path.toLowerCase();

    if (name.includes('posta in arrivo') || name.includes('inbox') || path.includes('inbox')) {
      newSpecialUse = 'INBOX';
    } else if (name.includes('posta inviata') || name.includes('sent') || path.includes('sent')) {
      newSpecialUse = 'SENT';
    } else if (name.includes('eliminata') || name.includes('deleted') || name.includes('trash') || path.includes('trash')) {
      newSpecialUse = 'TRASH';
    } else if (name.includes('bozze') || name.includes('draft') || path.includes('draft')) {
      newSpecialUse = 'DRAFTS';
    }

    if (newSpecialUse && newSpecialUse !== f.specialUse) {
      await p.folder.update({
        where: { id_tenantId: { id: f.id, tenantId: f.tenantId } },
        data: { specialUse: newSpecialUse },
      });
      console.log(`  Updated ${f.name}: specialUse = ${newSpecialUse}`);
    } else {
      console.log(`  OK ${f.name}: specialUse = ${f.specialUse}`);
    }
  }

  // Also clear Redis folder cache
  console.log('\nDone. Restart backend to clear folder cache.');
  await p.$disconnect();
}
run();
