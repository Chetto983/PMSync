/**
 * Fix oversized base64 avatars stored in User.image that cause
 * Vercel 494 REQUEST_HEADER_TOO_LARGE via better-auth cookieCache.
 *
 * Usage: npx ts-node backend/scripts/fix-oversized-avatars.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const MAX_IMAGE_LENGTH = 50_000; // ~50KB base64

async function main() {
  const prisma = createPrismaClient();

  try {
    // Use raw SQL to bypass tenant scoping
    const users = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; image: string }>>(
      `SELECT id, email, image FROM "users" WHERE image IS NOT NULL AND LENGTH(image) > $1`,
      MAX_IMAGE_LENGTH,
    );

    console.log(`Found ${users.length} users with oversized images`);

    for (const user of users) {
      const sizeMB = (user.image.length / 1024 / 1024).toFixed(2);
      console.log(`[FIX] ${user.email}: image is ${sizeMB}MB (${user.image.length} chars) — clearing`);

      await prisma.$executeRawUnsafe(
        `UPDATE "users" SET image = NULL WHERE id = $1`,
        user.id,
      );
    }

    // Verify
    const remaining = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) as cnt FROM "users" WHERE image IS NOT NULL AND LENGTH(image) > $1`,
      MAX_IMAGE_LENGTH,
    );
    console.log(`\nVerification: ${remaining[0]?.cnt ?? 0} oversized images remaining`);
    console.log('Done. Users will need to re-upload their avatar (now resized to 256px).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
