import { Prisma } from '@prisma/client';
import { getEncryptedFieldsForModel } from './encryption.config';
import { encryptFieldValue, decryptFieldValue } from './field-encryption.utils';

/**
 * Operations that include writable data (args.data exists).
 */
const WRITE_OPS = new Set([
  'create',
  'update',
  'upsert',
  'createMany',
  'updateMany',
]);

/**
 * Extract tenantId from Prisma operation args.
 * Checks data, where, and composite key patterns.
 */
export function extractTenantId(args: Record<string, unknown>): string | null {
  // From args.data (create/update)
  const data = args.data as Record<string, unknown> | undefined;
  if (data && typeof data.tenantId === 'string') return data.tenantId;

  // From args.data array (createMany) - take first record's tenantId
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if (typeof first?.tenantId === 'string') return first.tenantId;
  }

  // From args.where (findFirst/findMany/update/delete)
  const where = args.where as Record<string, unknown> | undefined;
  if (where && typeof where.tenantId === 'string') return where.tenantId;

  // Composite PK pattern: where.id_tenantId.tenantId
  if (where) {
    const composite = where.id_tenantId as Record<string, unknown> | undefined;
    if (composite && typeof composite.tenantId === 'string') {
      return composite.tenantId;
    }
  }

  return null;
}

/**
 * Encrypt configured fields in a single data object.
 * Only encrypts non-null string values for configured fields.
 */
export function encryptDataFields(
  data: Record<string, unknown>,
  model: string,
  key: Buffer,
): void {
  const fields = getEncryptedFieldsForModel(model);
  for (const { field } of fields) {
    const value = data[field];
    if (typeof value === 'string') {
      data[field] = encryptFieldValue(value, key);
    }
  }
}

/**
 * Decrypt configured fields in a single result object.
 * Plaintext values (no enc: prefix) pass through unchanged.
 */
export function decryptResultFields(
  result: Record<string, unknown>,
  model: string,
  keys: Buffer[],
): void {
  const fields = getEncryptedFieldsForModel(model);
  for (const { field } of fields) {
    const value = result[field];
    if (typeof value === 'string') {
      result[field] = decryptFieldValue(value, keys);
    }
  }
}

/**
 * Decrypt a query result (single object, array, or null).
 */
function decryptResult(
  result: unknown,
  model: string,
  keys: Buffer[],
): unknown {
  if (result === null || result === undefined) return result;

  if (Array.isArray(result)) {
    for (const item of result) {
      if (item && typeof item === 'object') {
        decryptResultFields(item as Record<string, unknown>, model, keys);
      }
    }
    return result;
  }

  if (typeof result === 'object') {
    decryptResultFields(result as Record<string, unknown>, model, keys);
  }

  return result;
}

/**
 * Create a Prisma client extension that transparently encrypts and decrypts
 * configured fields on all model operations.
 *
 * @param getKeyForTenant - Returns the current encryption key for a tenant
 * @param getDecryptionKeys - Returns all decryption keys (current + old) for a tenant
 */
export function createFieldEncryptionExtension(
  getKeyForTenant: (tenantId: string) => Buffer,
  getDecryptionKeys: (tenantId: string) => Buffer[],
) {
  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const fields = getEncryptedFieldsForModel(model ?? '');
          if (fields.length === 0) {
            return query(args);
          }

          const modelName = model ?? '';
          const typedArgs = args as Record<string, unknown>;

          // --- Write path: encrypt configured fields ---
          if (WRITE_OPS.has(operation) && typedArgs.data !== undefined) {
            const tenantId = extractTenantId(typedArgs);

            if (tenantId) {
              const key = getKeyForTenant(tenantId);

              if (operation === 'createMany' && Array.isArray(typedArgs.data)) {
                // createMany: encrypt each record in the array
                for (const record of typedArgs.data as Record<string, unknown>[]) {
                  encryptDataFields(record, modelName, key);
                }
              } else if (operation === 'upsert') {
                // upsert: encrypt both create and update blocks
                const create = typedArgs.create as Record<string, unknown> | undefined;
                const update = typedArgs.update as Record<string, unknown> | undefined;
                if (create) encryptDataFields(create, modelName, key);
                if (update) encryptDataFields(update, modelName, key);
              } else {
                // create, update, updateMany: encrypt args.data
                encryptDataFields(
                  typedArgs.data as Record<string, unknown>,
                  modelName,
                  key,
                );
              }
            }
          }

          // --- Execute the actual query ---
          const result = await query(args);

          // --- Read path: decrypt configured fields in result ---
          const tenantId = extractTenantId(typedArgs);
          if (tenantId) {
            const keys = getDecryptionKeys(tenantId);
            return decryptResult(result, modelName, keys);
          }

          return result;
        },
      },
    },
  });
}
