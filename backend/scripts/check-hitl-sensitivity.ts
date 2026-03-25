/**
 * Check and optionally fix hitlSensitivity for all users.
 *
 * Usage:
 *   npx tsx scripts/check-hitl-sensitivity.ts          # read-only
 *   npx tsx scripts/check-hitl-sensitivity.ts fix       # set NONE → HIGH_ONLY
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function run() {
  const fix = process.argv[2] === 'fix';
  const p = createPrismaClient();

  const prefs = await p.userPreferences.findMany({
    select: { id: true, userId: true, hitlSensitivity: true },
  });

  console.log(`Found ${prefs.length} userPreferences record(s):\n`);
  for (const pref of prefs) {
    console.log(`  userId=${pref.userId}  hitlSensitivity=${pref.hitlSensitivity}`);
  }

  if (fix) {
    const noneUsers = prefs.filter((p) => p.hitlSensitivity === 'NONE');
    if (noneUsers.length === 0) {
      console.log('\nNo users with NONE sensitivity. Nothing to fix.');
    } else {
      console.log(`\nFixing ${noneUsers.length} user(s) from NONE → HIGH_ONLY...`);
      for (const pref of noneUsers) {
        await p.userPreferences.update({
          where: { id: pref.id },
          data: { hitlSensitivity: 'HIGH_ONLY' },
        });
        console.log(`  Fixed: userId=${pref.userId}`);
      }
    }
  }

  await p.$disconnect();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
