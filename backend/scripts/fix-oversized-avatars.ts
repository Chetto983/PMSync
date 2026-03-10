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
    // Find users with oversized image fields
    const users = await prisma.user.findMany({
      where: { image: { not: null } },
      select: { id: true, email: true, image: true },
    });

    let fixed = 0;
    for (const user of users) {
      if (!user.image || user.image.length <= MAX_IMAGE_LENGTH) continue;

      const sizeMB = (user.image.length / 1024 / 1024).toFixed(2);
      console.log(`[FIX] ${user.email}: image is ${sizeMB}MB (${user.image.length} chars) — clearing`);

      await prisma.user.update({
        where: { id: user.id },
        data: { image: null },
      });
      fixed++;
    }

    console.log(`\nDone. Fixed ${fixed} / ${users.length} users.`);
    if (fixed > 0) {
      console.log('Users will need to re-upload their avatar (now resized to 256px).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
