/**
 * Better Auth OAuth Token Encryption Migration
 *
 * Encrypts existing plaintext social-provider tokens in the Better Auth
 * Account table using BETTER_AUTH_SECRET. Safe to re-run: already encrypted
 * values are skipped.
 *
 * Usage:
 *   npx ts-node scripts/encrypt-better-auth-oauth-tokens.ts
 *   npx ts-node scripts/encrypt-better-auth-oauth-tokens.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { symmetricEncrypt } from 'better-auth/crypto';

const SOCIAL_PROVIDERS = ['google', 'microsoft'];

function isLikelyEncrypted(token: string): boolean {
  if (token.startsWith('$ba$')) {
    return true;
  }

  return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

async function encryptIfNeeded(secret: string, token: string | null | undefined) {
  if (!token || isLikelyEncrypted(token)) {
    return token ?? null;
  }

  return symmetricEncrypt({
    key: secret,
    data: token,
  });
}

async function main(): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required');
  }

  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  let updatedAccounts = 0;

  try {
    const accounts = await prisma.account.findMany({
      where: {
        providerId: { in: SOCIAL_PROVIDERS },
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
      select: {
        id: true,
        providerId: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    for (const account of accounts) {
      const encryptedAccessToken = await encryptIfNeeded(secret, account.accessToken);
      const encryptedRefreshToken = await encryptIfNeeded(secret, account.refreshToken);
      const changed =
        encryptedAccessToken !== account.accessToken ||
        encryptedRefreshToken !== account.refreshToken;

      if (!changed) {
        continue;
      }

      updatedAccounts += 1;

      if (dryRun) {
        console.log(`[dry-run] would encrypt ${account.providerId} account ${account.id}`);
        continue;
      }

      await prisma.account.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
        },
      });

      console.log(`encrypted ${account.providerId} account ${account.id}`);
    }

    console.log(
      `${dryRun ? 'Checked' : 'Updated'} ${accounts.length} account(s); ${updatedAccounts} required encryption.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to encrypt Better Auth OAuth tokens:', error);
  process.exit(1);
});
