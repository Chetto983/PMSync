import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

/** Prefix marker to distinguish encrypted values from plaintext. */
export const ENCRYPTION_PREFIX = 'enc:';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `enc:` + base64(iv + ciphertext + authTag).
 */
export function encryptFieldValue(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, encrypted, authTag]);
  return ENCRYPTION_PREFIX + payload.toString('base64');
}

/**
 * Decrypt a stored value. If not `enc:`-prefixed, returns as-is (plaintext pass-through).
 * Tries each key in order; throws if ALL keys fail.
 */
export function decryptFieldValue(stored: string, keys: Buffer[]): string {
  if (!isEncrypted(stored)) {
    return stored; // plaintext pass-through for migration
  }

  const payload = Buffer.from(stored.slice(ENCRYPTION_PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);

  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      // Key didn't work — try next
    }
  }

  throw new Error('Decryption failed: none of the provided keys could decrypt the value');
}

/** Check whether a stored value is encrypted (has `enc:` prefix). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Generate a deterministic SHA-256 hash for exact-match search on encrypted fields.
 * NOTE: Reserved for future Tier 2 implementation (from/subject/displayName).
 * Not used in Phase 14 Tier 1 (body fields don't need search).
 *
 * @deprecated Use {@link hmacForBlindIndex} instead. hmacForBlindIndex uses HMAC-SHA256
 * with per-tenant HKDF-derived keys for cryptographically stronger blind indexes.
 */
export function hashForSearch(value: string, tenantId: string, salt: string): string {
  const normalized = `${salt}:${tenantId}:${value.toLowerCase().trim()}`;
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Compute a deterministic HMAC-SHA256 blind index for exact-match search.
 *
 * Normalizes input (lowercase + trim) before hashing to ensure consistent
 * lookups regardless of case or whitespace. Uses HMAC with a per-tenant
 * HKDF-derived key for cryptographic isolation between tenants.
 *
 * @param value - The plaintext value to hash (e.g., sender email address)
 * @param hmacKey - Per-tenant HMAC key (from TenantKeyService.getHmacKey)
 * @returns 64-character lowercase hex string (HMAC-SHA256 digest)
 */
export function hmacForBlindIndex(value: string, hmacKey: Buffer): string {
  const normalized = value.toLowerCase().trim();
  return createHmac('sha256', hmacKey).update(normalized).digest('hex');
}
