/**
 * Encrypted field configuration — defines which model fields are encrypted at rest.
 *
 * Tier 1 (Phase 14): Email body fields — NOT used in queries, safe to encrypt.
 * Tier 2 (future): from, subject, displayName — require search infrastructure redesign.
 */

export interface EncryptedFieldConfig {
  /** The Prisma model field name. */
  field: string;
  /** Companion hash field for exact-match search (null = no search needed). */
  hashField: string | null;
}

/**
 * Map of model name -> encrypted field configurations.
 *
 * CRITICAL: Only Tier 1 fields (bodyText, bodyHtml, snippet) are configured.
 * These are:
 * - NOT used in `contains` queries
 * - NOT used in trigram GIN indexes
 * - ONLY read for display or embedding content
 */
export const ENCRYPTED_FIELDS: Record<string, EncryptedFieldConfig[]> = {
  Email: [
    { field: 'bodyText', hashField: null },
    { field: 'bodyHtml', hashField: null },
    { field: 'snippet', hashField: null },
  ],
  // Tier 2 fields (from, subject, displayName) NOT encrypted yet.
  // They use contains+insensitive queries in 17+ locations.
  // Encrypting them requires search infrastructure redesign (deferred).
};

/** Get encrypted field configs for a given Prisma model name. */
export function getEncryptedFieldsForModel(
  modelName: string,
): EncryptedFieldConfig[] {
  return ENCRYPTED_FIELDS[modelName] ?? [];
}

/**
 * Blind index configuration — defines which model fields get HMAC blind indexes
 * for exact-match search on plaintext fields.
 *
 * NOTE: This is SEPARATE from ENCRYPTED_FIELDS. The `from` field is NOT encrypted;
 * it gets a companion blind index column for hash-based exact-match lookup.
 */
export interface BlindIndexConfig {
  /** Source field containing the plaintext value (e.g., 'from'). */
  field: string;
  /** Target column for the HMAC hash (e.g., 'fromHash'). */
  hashField: string;
}

export const BLIND_INDEX_FIELDS: Record<string, BlindIndexConfig[]> = {
  Email: [{ field: 'from', hashField: 'fromHash' }],
};

/** Get blind index field configs for a given Prisma model name. */
export function getBlindIndexFieldsForModel(
  modelName: string,
): BlindIndexConfig[] {
  return BLIND_INDEX_FIELDS[modelName] ?? [];
}
