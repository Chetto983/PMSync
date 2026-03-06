/**
 * CBC-to-GCM Re-encryption Migration Script
 *
 * Converts all legacy AES-256-CBC encrypted records to AES-256-GCM.
 * Processes: ProviderConfig (6 encrypted field pairs) and MfaSecret (1 field pair).
 *
 * Usage:
 *   npx ts-node scripts/re-encrypt-cbc-to-gcm.ts           # Live migration
 *   npx ts-node scripts/re-encrypt-cbc-to-gcm.ts --dry-run  # Preview only
 *
 * Idempotent: records already using GCM (prefixed with "gcm:") are skipped.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Inline crypto helpers (no NestJS DI -- standalone script)
// ---------------------------------------------------------------------------

const GCM_PREFIX = 'gcm:';
const GCM_IV_LENGTH = 12;

function getSecretKey(): Buffer {
  const raw = process.env.AES_SECRET_KEY;
  if (!raw) {
    throw new Error('AES_SECRET_KEY env var is required');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`AES key must be 32 bytes, got ${key.length}`);
  }
  return key;
}

function decryptCbc(encrypted: string, ivHex: string, key: Buffer): string {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptGcm(
  text: string,
  key: Buffer,
): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted: `${GCM_PREFIX}${ciphertext}:${authTag}`,
    iv: iv.toString('hex'),
  };
}

// ---------------------------------------------------------------------------
// Field pairs: [valueColumn, ivColumn]
// ---------------------------------------------------------------------------

const PROVIDER_CONFIG_FIELDS: [string, string][] = [
  ['accessToken', 'tokenEncryptionIv'],
  ['refreshToken', 'refreshTokenEncryptionIv'],
  ['imapPassword', 'imapEncryptionIv'],
  ['smtpPassword', 'smtpEncryptionIv'],
  ['caldavPassword', 'caldavEncryptionIv'],
  ['carddavPassword', 'carddavEncryptionIv'],
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const key = getSecretKey();
  const prisma = new PrismaClient();

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('---');

  let totalErrors = 0;

  // --- ProviderConfig ---
  let pcRecords = 0;
  let pcFields = 0;

  try {
    const batchSize = 100;
    let skip = 0;
    let batchNum = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Fetch records where ANY encrypted field is non-null and not GCM-prefixed
      const records = await prisma.providerConfig.findMany({
        take: batchSize,
        skip,
        where: {
          OR: PROVIDER_CONFIG_FIELDS.map(([valCol]) => ({
            [valCol]: { not: { startsWith: GCM_PREFIX } },
            AND: { [valCol]: { not: null } },
          })),
        },
      });

      if (records.length === 0) break;
      batchNum++;
      console.log(
        `ProviderConfig batch ${batchNum}: ${records.length} records`,
      );

      const updates: Array<{
        id: string;
        data: Record<string, string>;
      }> = [];

      for (const record of records) {
        const rec = record as unknown as Record<string, string | null>;
        const data: Record<string, string> = {};

        for (const [valCol, ivCol] of PROVIDER_CONFIG_FIELDS) {
          const value = rec[valCol];
          const iv = rec[ivCol];
          if (!value || !iv || value.startsWith(GCM_PREFIX)) continue;

          try {
            const plaintext = decryptCbc(value, iv, key);
            const { encrypted, iv: newIv } = encryptGcm(plaintext, key);
            data[valCol] = encrypted;
            data[ivCol] = newIv;
            pcFields++;
          } catch (err) {
            totalErrors++;
            console.error(
              `  ERROR record ${rec['id']} field ${valCol}: ${(err as Error).message}`,
            );
          }
        }

        if (Object.keys(data).length > 0) {
          updates.push({ id: rec['id'] as string, data });
          pcRecords++;
        }
      }

      if (!dryRun && updates.length > 0) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.providerConfig.update({
              where: { id: u.id },
              data: u.data,
            }),
          ),
        );
      }

      skip += batchSize;
    }
  } catch (err) {
    totalErrors++;
    console.error(`ProviderConfig error: ${(err as Error).message}`);
  }

  // --- MfaSecret ---
  let mfaRecords = 0;

  try {
    const batchSize = 100;
    let skip = 0;
    let batchNum = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const records = await prisma.mfaSecret.findMany({
        take: batchSize,
        skip,
        where: {
          secret: { not: { startsWith: GCM_PREFIX } },
        },
      });

      if (records.length === 0) break;
      batchNum++;
      console.log(`MfaSecret batch ${batchNum}: ${records.length} records`);

      const updates: Array<{
        id: string;
        data: { secret: string; encryptionIv: string };
      }> = [];

      for (const record of records) {
        try {
          const plaintext = decryptCbc(
            record.secret,
            record.encryptionIv,
            key,
          );
          const { encrypted, iv: newIv } = encryptGcm(plaintext, key);
          updates.push({
            id: record.id,
            data: { secret: encrypted, encryptionIv: newIv },
          });
          mfaRecords++;
        } catch (err) {
          totalErrors++;
          console.error(
            `  ERROR MfaSecret ${record.id}: ${(err as Error).message}`,
          );
        }
      }

      if (!dryRun && updates.length > 0) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.mfaSecret.update({
              where: { id: u.id },
              data: u.data,
            }),
          ),
        );
      }

      skip += batchSize;
    }
  } catch (err) {
    totalErrors++;
    console.error(`MfaSecret error: ${(err as Error).message}`);
  }

  // --- Summary ---
  console.log('---');
  console.log('Re-encryption complete:');
  console.log(
    `  ProviderConfig: ${pcRecords} records, ${pcFields} fields re-encrypted`,
  );
  console.log(`  MfaSecret: ${mfaRecords} records re-encrypted`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  if (totalErrors > 0) {
    console.error(`  Errors: ${totalErrors}`);
  }

  await prisma.$disconnect();

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
