/**
 * Delete ALL sessions to invalidate poisoned cookie caches.
 * Usage: npx ts-node backend/scripts/nuke-sessions.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  const prisma = createPrismaClient();
  try {
    const count = await prisma.$executeRawUnsafe(`DELETE FROM "sessions"`);
    console.log(`Deleted ${count} sessions.`);
    // Also clear any oversized images while we're at it
    const imgCount = await prisma.$executeRawUnsafe(
      `UPDATE "users" SET image = NULL WHERE image IS NOT NULL AND LENGTH(image) > 1000`,
    );
    console.log(`Cleared ${imgCount} oversized user images.`);
    console.log('Done. All users will need to re-login.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(console.error);
