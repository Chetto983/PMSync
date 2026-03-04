/**
 * Prisma Tenant-Scoping Extension
 *
 * Auto-injects tenantId into queries for tenant-scoped models.
 * Reads tenantId from AsyncLocalStorage (populated by CorrelationInterceptor).
 *
 * Stage 1 (audit mode): logs warnings for unscoped queries, does NOT throw.
 * Stage 2 (enforce mode): throws TenantContextRequiredError.
 */
import { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { TENANT_SCOPED_MODELS, COMPOSITE_PK_MODELS } from './tenant-scoped-models';
import { getTenantIdFromContext, isTenantScopingBypassed } from './tenant-context';

const logger = new Logger('TenantScoping');

/** Operations that read data (inject into where). */
const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operations that write via where clause (inject into where). */
const WHERE_WRITE_OPS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Operations that create data (inject into data). */
const CREATE_OPS = new Set(['create', 'createMany']);

/** Unique-lookup operations (may use composite PK). */
const UNIQUE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
]);

/**
 * When true, unscoped queries log a warning instead of throwing.
 * Set to false for enforce mode (Stage 2).
 */
const AUDIT_MODE = false;

/**
 * Create the tenant-scoping Prisma extension.
 * Must be chained BEFORE the field-encryption extension so that
 * tenantId is available in args when encryption reads it.
 */
export function createTenantScopingExtension() {
  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (isTenantScopingBypassed()) {
            return query(args);
          }

          const tenantId = getTenantIdFromContext();

          if (!tenantId) {
            if (AUDIT_MODE) {
              logger.warn(
                `Unscoped query: ${model}.${operation} — no tenantId in context`,
              );
              return query(args);
            }
            throw new TenantContextRequiredError(model, operation);
          }

          const mutated = { ...args } as Record<string, unknown>;

          // --- Read operations: inject into where ---
          if (READ_OPS.has(operation)) {
            mutated.where = { ...(mutated.where as object), tenantId };
          }

          // --- Unique lookups: handle composite PK ---
          if (UNIQUE_OPS.has(operation)) {
            mutated.where = injectIntoUnique(
              model,
              mutated.where as Record<string, unknown>,
              tenantId,
            );
          }

          // --- Where-based writes: inject into where ---
          if (WHERE_WRITE_OPS.has(operation)) {
            mutated.where = { ...(mutated.where as object), tenantId };
          }

          // --- Create operations: inject into data ---
          if (CREATE_OPS.has(operation)) {
            if (operation === 'createMany') {
              mutated.data = injectIntoCreateMany(
                mutated.data as Record<string, unknown>[],
                tenantId,
              );
            } else {
              mutated.data = { ...(mutated.data as object), tenantId };
            }
          }

          // --- Upsert: inject into where + create ---
          if (operation === 'upsert') {
            mutated.where = { ...(mutated.where as object), tenantId };
            mutated.create = { ...(mutated.create as object), tenantId };
          }

          return query(mutated);
        },
      },
    },
  });
}

/**
 * Inject tenantId into findUnique/findUniqueOrThrow where clause.
 * Composite PK models use `id_tenantId: { id, tenantId }`.
 * Standard models just get `tenantId` added to where.
 */
function injectIntoUnique(
  model: string,
  where: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  if (!where) return { tenantId };

  if (COMPOSITE_PK_MODELS.has(model)) {
    const composite = where.id_tenantId as
      | Record<string, unknown>
      | undefined;
    if (composite) {
      return {
        ...where,
        id_tenantId: { ...composite, tenantId },
      };
    }
    // If caller used plain `id`, upgrade to composite key
    if (where.id && !where.id_tenantId) {
      const { id, ...rest } = where;
      return { ...rest, id_tenantId: { id, tenantId } };
    }
  }

  return { ...where, tenantId };
}

/**
 * Inject tenantId into each record of a createMany data array.
 */
function injectIntoCreateMany(
  data: Record<string, unknown>[] | undefined,
  tenantId: string,
): Record<string, unknown>[] {
  if (!data || !Array.isArray(data)) return [];
  return data.map((record) => ({ ...record, tenantId }));
}

/**
 * Error thrown when a tenant-scoped model is queried without tenant context.
 * Used in enforce mode (Stage 2).
 */
export class TenantContextRequiredError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context required for ${model}.${operation}. ` +
        'Use withoutTenantScoping() for system-level operations.',
    );
    this.name = 'TenantContextRequiredError';
  }
}
