/**
 * Backfill encryption migration script.
 *
 * Encrypts all existing plaintext bodyText/bodyHtml/snippet fields in the emails table.
 * Processes per-tenant for correct HKDF key derivation. Uses skip+take pagination
 * (composite @@id prevents cursor-based pagination). Idempotent: already-encrypted
 * values are skipped via isEncrypted() check.
 *
 * Usage:
 *   npx ts-node backend/src/scripts/backfill-encryption.ts
 *   npx ts-node backend/src/scripts/backfill-encryption.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { TenantKeyService } from '../common/services/tenant-key.service';
import {
  encryptFieldValue,
  isEncrypted,
} from '../prisma/encryption/field-encryption.utils';
import { getEncryptedFieldsForModel } from '../prisma/encryption/encryption.config';

const DEFAULT_BATCH_SIZE = 200;

interface BackfillResult {
  totalProcessed: number;
  totalEncrypted: number;
}

interface BackfillOptions {
  batchSize?: number;
  dryRun?: boolean;
  logger?: (msg: string) => void;
}

/**
 * Generic backfill function for any Prisma model with composite @@id([id, tenantId]).
 *
 * Paginates with skip+take (composite PK models cannot use cursor-based pagination).
 * Encrypts all configured fields per-tenant, skipping already-encrypted or null values.
 */
export async function backfillEncryptModel(
  prisma: PrismaClient,
  tenantKeyService: TenantKeyService,
  modelName: string,
  fields: string[],
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const dryRun = options.dryRun ?? false;
  const log = options.logger ?? console.log;

  // Access Prisma model dynamically (lowercase accessor)
  const modelAccessor = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const model = (prisma as unknown as Record<string, unknown>)[modelAccessor] as {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };

  if (!model) {
    throw new Error(`Prisma model accessor "${modelAccessor}" not found`);
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  log(`[${modelName}] Found ${tenants.length} tenant(s) to process`);

  let totalProcessed = 0;
  let totalEncrypted = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const key = tenantKeyService.getCurrentKey(tenantId);
    const total = await model.count({ where: { tenantId } });

    if (total === 0) {
      log(`[${modelName}] Tenant ${tenantId}: 0 records, skipping`);
      continue;
    }

    log(`[${modelName}] Tenant ${tenantId}: ${total} records to scan`);
    let offset = 0;
    let tenantEncrypted = 0;

    while (offset < total) {
      const records = await model.findMany({
        where: { tenantId },
        select: { id: true, tenantId: true, ...Object.fromEntries(fields.map((f) => [f, true])) },
        skip: offset,
        take: batchSize,
        orderBy: { id: 'asc' as const },
      });

      if (records.length === 0) break;

      const updates: Array<Promise<unknown>> = [];

      for (const record of records) {
        const data: Record<string, string> = {};
        let needsUpdate = false;

        for (const field of fields) {
          const value = record[field];
          if (typeof value !== 'string' || value.length === 0) continue;
          if (isEncrypted(value)) continue;

          needsUpdate = true;
          data[field] = encryptFieldValue(value, key);
        }

        if (needsUpdate) {
          if (!dryRun) {
            updates.push(
              model.update({
                where: {
                  id_tenantId: {
                    id: record.id as string,
                    tenantId: record.tenantId as string,
                  },
                },
                data,
              }),
            );
          }
          tenantEncrypted++;
        }
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates as never[]);
      }

      offset += records.length;
      totalProcessed += records.length;
      log(
        `[${modelName}] Tenant ${tenantId}: ${Math.min(offset, total)}/${total} scanned, ` +
          `${tenantEncrypted} encrypted${dryRun ? ' (DRY RUN)' : ''}`,
      );
    }

    totalEncrypted += tenantEncrypted;
  }

  log(
    `[${modelName}] Complete: ${totalProcessed} scanned, ${totalEncrypted} encrypted` +
      `${dryRun ? ' (DRY RUN — no writes)' : ''}`,
  );

  return { totalProcessed, totalEncrypted };
}

/**
 * Backfill-encrypt all Email records (bodyText, bodyHtml, snippet).
 * Uses the ENCRYPTED_FIELDS config to determine which fields to encrypt.
 */
export async function backfillEncryptEmails(
  prisma: PrismaClient,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const tenantKeyService = new TenantKeyService();

  if (!tenantKeyService.isEnabled) {
    const log = options.logger ?? console.log;
    log('[Email] Encryption is disabled (no master key configured). Aborting.');
    return { totalProcessed: 0, totalEncrypted: 0 };
  }

  const emailFields = getEncryptedFieldsForModel('Email').map((c) => c.field);
  return backfillEncryptModel(prisma, tenantKeyService, 'Email', emailFields, options);
}

/* CLI entry point */
if (require.main === module) {
  // Lazy import to avoid loading prisma-client.factory when imported as a module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPrismaClient } = require('../prisma/prisma-client.factory');
  const dryRun = process.argv.includes('--dry-run');
  const prisma = createPrismaClient() as PrismaClient;

  if (dryRun) {
    console.log('=== DRY RUN MODE — no data will be written ===\n');
  }

  backfillEncryptEmails(prisma, { dryRun })
    .then((result) => {
      console.log(
        `\nBackfill complete: ${result.totalProcessed} records scanned, ${result.totalEncrypted} encrypted`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
