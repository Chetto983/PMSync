import { Prisma } from '@prisma/client';
import { getEncryptedFieldsForModel, getBlindIndexFieldsForModel } from './encryption.config';
import { encryptFieldValue, decryptFieldValue, hmacForBlindIndex } from './field-encryption.utils';

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
 * Inject blind index hash fields into write operation args.
 * Exported for unit testing; called internally by the extension.
 *
 * @param typedArgs - The Prisma operation args object (mutated in-place)
 * @param modelName - Prisma model name (e.g., 'Email')
 * @param operation - Prisma operation name (e.g., 'create', 'update', 'upsert', 'createMany')
 * @param hmacKey - Per-tenant HMAC key for blind index computation
 */
export function injectBlindIndexFields(
  typedArgs: Record<string, unknown>,
  modelName: string,
  operation: string,
  hmacKey: Buffer,
): void {
  const blindIndexFields = getBlindIndexFieldsForModel(modelName);
  if (blindIndexFields.length === 0) return;

  for (const { field, hashField } of blindIndexFields) {
    if (operation === 'upsert') {
      const create = typedArgs.create as Record<string, unknown> | undefined;
      const update = typedArgs.update as Record<string, unknown> | undefined;
      if (create && typeof create[field] === 'string') {
        create[hashField] = hmacForBlindIndex(create[field] as string, hmacKey);
      }
      if (update && typeof update[field] === 'string') {
        update[hashField] = hmacForBlindIndex(update[field] as string, hmacKey);
      }
    } else if (operation === 'createMany' && Array.isArray(typedArgs.data)) {
      for (const record of typedArgs.data as Record<string, unknown>[]) {
        if (typeof record[field] === 'string') {
          record[hashField] = hmacForBlindIndex(record[field] as string, hmacKey);
        }
      }
    } else if (
      typedArgs.data &&
      typeof (typedArgs.data as Record<string, unknown>)[field] === 'string'
    ) {
      (typedArgs.data as Record<string, unknown>)[hashField] = hmacForBlindIndex(
        (typedArgs.data as Record<string, unknown>)[field] as string,
        hmacKey,
      );
    }
  }
}

/**
 * Create a Prisma client extension that transparently encrypts and decrypts
 * configured fields on all model operations, and injects blind index hashes
 * on write operations.
 *
 * @param getKeyForTenant - Returns the current encryption key for a tenant
 * @param getDecryptionKeys - Returns all decryption keys (current + old) for a tenant
 * @param getHmacKeyForTenant - Returns the HMAC key for blind index computation
 */
export function createFieldEncryptionExtension(
  getKeyForTenant: (tenantId: string) => Buffer,
  getDecryptionKeys: (tenantId: string) => Buffer[],
  getHmacKeyForTenant?: (tenantId: string) => Buffer,
) {
  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model ?? '';
          const encFields = getEncryptedFieldsForModel(modelName);
          const blindFields = getBlindIndexFieldsForModel(modelName);

          if (encFields.length === 0 && blindFields.length === 0) {
            return query(args);
          }

          const typedArgs = args as Record<string, unknown>;

          // --- Write path: encrypt configured fields + inject blind indexes ---
          if (WRITE_OPS.has(operation)) {
            const tenantId = extractTenantId(typedArgs);

            if (tenantId) {
              // Encrypt fields (bodyText, bodyHtml, snippet, etc.)
              if (encFields.length > 0 && typedArgs.data !== undefined) {
                const key = getKeyForTenant(tenantId);

                if (operation === 'createMany' && Array.isArray(typedArgs.data)) {
                  for (const record of typedArgs.data as Record<string, unknown>[]) {
                    encryptDataFields(record, modelName, key);
                  }
                } else if (operation === 'upsert') {
                  const create = typedArgs.create as Record<string, unknown> | undefined;
                  const update = typedArgs.update as Record<string, unknown> | undefined;
                  if (create) encryptDataFields(create, modelName, key);
                  if (update) encryptDataFields(update, modelName, key);
                } else {
                  encryptDataFields(
                    typedArgs.data as Record<string, unknown>,
                    modelName,
                    key,
                  );
                }
              }

              // Inject blind index hashes (fromHash, etc.)
              if (blindFields.length > 0 && getHmacKeyForTenant) {
                const hmacKey = getHmacKeyForTenant(tenantId);
                injectBlindIndexFields(typedArgs, modelName, operation, hmacKey);
              }
            }
          }

          // --- Execute the actual query ---
          const result = await query(args);

          // --- Read path: decrypt configured fields in result ---
          if (encFields.length > 0) {
            const tenantId = extractTenantId(typedArgs);
            if (tenantId) {
              const keys = getDecryptionKeys(tenantId);
              return decryptResult(result, modelName, keys);
            }
          }

          return result;
        },
      },
    },
  });
}
