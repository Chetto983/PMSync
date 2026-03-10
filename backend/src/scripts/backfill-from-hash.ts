/**
 * Backfill fromHash migration script.
 *
 * Populates the HMAC blind index (fromHash) for all existing Email records.
 * Processes per-tenant for correct HKDF key derivation. Uses skip+take pagination
 * (composite @@id prevents cursor-based pagination). Idempotent: rows with
 * existing fromHash values are skipped.
 *
 * Usage:
 *   npx ts-node backend/src/scripts/backfill-from-hash.ts
 *   npx ts-node backend/src/scripts/backfill-from-hash.ts --dry-run
 *   npx ts-node backend/src/scripts/backfill-from-hash.ts --batch-size 500
 */

import { PrismaClient } from '@prisma/client';
import { TenantKeyService } from '../common/services/tenant-key.service';
import { hmacForBlindIndex } from '../prisma/encryption/field-encryption.utils';

const DEFAULT_BATCH_SIZE = 200;

interface BackfillHashResult {
  totalProcessed: number;
  totalHashed: number;
}

interface BackfillHashOptions {
  batchSize?: number;
  dryRun?: boolean;
  logger?: (msg: string) => void;
}

/**
 * Backfill fromHash for all Email records per-tenant.
 *
 * Paginates with skip+take (composite PK models cannot use cursor-based pagination).
 * Idempotent: only processes rows where fromHash is null and from is non-empty.
 */
export async function backfillFromHash(
  prisma: PrismaClient,
  tenantKeyService: TenantKeyService,
  options: BackfillHashOptions = {},
): Promise<BackfillHashResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const dryRun = options.dryRun ?? false;
  const log = options.logger ?? console.log;

  const model = (prisma as unknown as Record<string, unknown>).email as {
    count: (args: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };

  if (!model) {
    throw new Error('Prisma model accessor "email" not found');
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  log(`[Email] Found ${tenants.length} tenant(s) to process for fromHash backfill`);

  let totalProcessed = 0;
  let totalHashed = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const hmacKey = tenantKeyService.getHmacKey(tenantId);
    const total = await model.count({ where: { tenantId } });

    if (total === 0) {
      log(`[Email] Tenant ${tenantId}: 0 records, skipping`);
      continue;
    }

    log(`[Email] Tenant ${tenantId}: ${total} records to scan`);
    let offset = 0;
    let tenantHashed = 0;

    while (offset < total) {
      const records = await model.findMany({
        where: { tenantId },
        select: { id: true, tenantId: true, from: true, fromHash: true },
        skip: offset,
        take: batchSize,
        orderBy: { id: 'asc' as const },
      });

      if (records.length === 0) break;

      const updates: Array<Promise<unknown>> = [];

      for (const record of records) {
        const fromValue = record.from;
        const existingHash = record.fromHash;

        // Skip: already has hash, or from is not a usable string
        if (existingHash !== null && existingHash !== undefined) continue;
        if (typeof fromValue !== 'string' || fromValue.length === 0) continue;

        const hash = hmacForBlindIndex(fromValue, hmacKey);

        if (!dryRun) {
          updates.push(
            model.update({
              where: {
                id_tenantId: {
                  id: record.id as string,
                  tenantId: record.tenantId as string,
                },
              },
              data: { fromHash: hash },
            }),
          );
        }
        tenantHashed++;
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates as never[]);
      }

      offset += records.length;
      totalProcessed += records.length;
      log(
        `[Email] Tenant ${tenantId}: ${Math.min(offset, total)}/${total} scanned, ` +
          `${tenantHashed} hashed${dryRun ? ' (DRY RUN)' : ''}`,
      );
    }

    totalHashed += tenantHashed;
  }

  log(
    `[Email] Complete: ${totalProcessed} scanned, ${totalHashed} hashed` +
      `${dryRun ? ' (DRY RUN -- no writes)' : ''}`,
  );

  return { totalProcessed, totalHashed };
}

/* CLI entry point */
if (require.main === module) {
  // Lazy import to avoid loading prisma-client.factory when imported as a module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPrismaClient } = require('../prisma/prisma-client.factory');
  const dryRun = process.argv.includes('--dry-run');
  const batchSizeIdx = process.argv.indexOf('--batch-size');
  const batchSize =
    batchSizeIdx !== -1 ? parseInt(process.argv[batchSizeIdx + 1], 10) : undefined;

  const prisma = createPrismaClient() as PrismaClient;
  const tenantKeyService = new TenantKeyService();

  if (!tenantKeyService.isEnabled) {
    console.log('[Email] Encryption is disabled (no master key configured). Aborting.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('=== DRY RUN MODE -- no data will be written ===\n');
  }

  backfillFromHash(prisma, tenantKeyService, { dryRun, batchSize })
    .then((result) => {
      console.log(
        `\nBackfill complete: ${result.totalProcessed} records scanned, ${result.totalHashed} hashed`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
