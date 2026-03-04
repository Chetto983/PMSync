/**
 * Integration tests for the complete encryption pipeline.
 *
 * Verifies end-to-end behavior:
 * - ENC-01: Round-trip encrypt/decrypt for all Tier 1 fields
 * - ENC-02: Tenant isolation (different keys, cross-tenant failure)
 * - ENC-04: Migration coexistence (plaintext pass-through)
 * - ENC-05: Key rotation (old-key data decrypts via keychain)
 *
 * Does NOT require a running database — simulates Prisma extension
 * behavior using the exported helper functions.
 */

import { randomBytes, hkdfSync } from 'crypto';
import {
  encryptDataFields,
  decryptResultFields,
} from '../field-encryption.extension';
import {
  encryptFieldValue,
  decryptFieldValue,
  isEncrypted,
} from '../field-encryption.utils';

/**
 * Derive a per-tenant 256-bit key via HKDF-SHA256, matching TenantKeyService.
 * Reproduces the exact derivation logic without NestJS DI.
 */
function deriveKey(masterKey: Buffer, tenantId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterKey, tenantId, 'pmsync-field-enc-v1', 32),
  );
}

describe('Encryption Integration Tests', () => {
  // Fresh master keys per test run — no shared mutable state
  const MASTER_KEY_V1 = randomBytes(32);
  const MASTER_KEY_V2 = randomBytes(32);

  // --- Group 1: Round-trip verification (ENC-01) ---

  describe('ENC-01: Round-trip verification', () => {
    it('encrypts bodyText on create and decrypts on read', () => {
      const tenantId = 'tenant-rt-1';
      const key = deriveKey(MASTER_KEY_V1, tenantId);
      const plaintext = 'Hello, this is a confidential email body.';

      // Simulate write path
      const writeData: Record<string, unknown> = {
        tenantId,
        bodyText: plaintext,
        subject: 'Test Subject',
      };
      encryptDataFields(writeData, 'Email', key);

      // DB-bound data is enc: prefixed
      expect(isEncrypted(writeData.bodyText as string)).toBe(true);
      expect(writeData.bodyText).not.toBe(plaintext);

      // Simulate read path
      const readResult: Record<string, unknown> = { ...writeData };
      decryptResultFields(readResult, 'Email', [key]);

      // Original plaintext restored
      expect(readResult.bodyText).toBe(plaintext);
    });

    it('encrypts bodyHtml on update and decrypts on findFirst', () => {
      const tenantId = 'tenant-rt-2';
      const key = deriveKey(MASTER_KEY_V1, tenantId);
      const html = '<p>Updated <strong>content</strong></p>';

      // Simulate update write path
      const updateData: Record<string, unknown> = { bodyHtml: html };
      encryptDataFields(updateData, 'Email', key);

      expect(isEncrypted(updateData.bodyHtml as string)).toBe(true);

      // Simulate read after update
      const readResult: Record<string, unknown> = { ...updateData };
      decryptResultFields(readResult, 'Email', [key]);

      expect(readResult.bodyHtml).toBe(html);
    });

    it('encrypts snippet and decrypts correctly', () => {
      const tenantId = 'tenant-rt-3';
      const key = deriveKey(MASTER_KEY_V1, tenantId);
      const snippet = 'Quick preview of the email content...';

      const data: Record<string, unknown> = { snippet };
      encryptDataFields(data, 'Email', key);

      expect(isEncrypted(data.snippet as string)).toBe(true);

      const result: Record<string, unknown> = { ...data };
      decryptResultFields(result, 'Email', [key]);

      expect(result.snippet).toBe(snippet);
    });

    it('preserves non-encrypted fields unchanged', () => {
      const tenantId = 'tenant-rt-4';
      const key = deriveKey(MASTER_KEY_V1, tenantId);

      const data: Record<string, unknown> = {
        from: 'sender@example.com',
        subject: 'Important Meeting',
        folderId: 'INBOX',
        bodyText: 'Secret body content',
      };
      encryptDataFields(data, 'Email', key);

      // Non-encrypted fields untouched
      expect(data.from).toBe('sender@example.com');
      expect(data.subject).toBe('Important Meeting');
      expect(data.folderId).toBe('INBOX');
      // Encrypted field changed
      expect(isEncrypted(data.bodyText as string)).toBe(true);
    });
  });

  // --- Group 2: Tenant isolation (ENC-02) ---

  describe('ENC-02: Tenant isolation', () => {
    it('different tenants produce different ciphertext for same plaintext', () => {
      const tenantA = 'tenant-iso-a';
      const tenantB = 'tenant-iso-b';
      const keyA = deriveKey(MASTER_KEY_V1, tenantA);
      const keyB = deriveKey(MASTER_KEY_V1, tenantB);
      const samePlaintext = 'Identical email content for both tenants';

      const dataA: Record<string, unknown> = { bodyText: samePlaintext };
      const dataB: Record<string, unknown> = { bodyText: samePlaintext };

      encryptDataFields(dataA, 'Email', keyA);
      encryptDataFields(dataB, 'Email', keyB);

      // Both encrypted
      expect(isEncrypted(dataA.bodyText as string)).toBe(true);
      expect(isEncrypted(dataB.bodyText as string)).toBe(true);

      // Different ciphertexts (different keys + random IV)
      expect(dataA.bodyText).not.toBe(dataB.bodyText);
    });

    it("tenant A's key cannot decrypt tenant B's data", () => {
      const tenantA = 'tenant-cross-a';
      const tenantB = 'tenant-cross-b';
      const keyA = deriveKey(MASTER_KEY_V1, tenantA);
      const keyB = deriveKey(MASTER_KEY_V1, tenantB);

      // Encrypt with tenant A's key
      const encrypted = encryptFieldValue('Tenant A secret data', keyA);

      // Attempt decrypt with tenant B's key — must fail
      expect(() => {
        decryptFieldValue(encrypted, [keyB]);
      }).toThrow('Decryption failed');
    });
  });

  // --- Group 3: Key rotation (ENC-05) ---

  describe('ENC-05: Key rotation', () => {
    it('data encrypted with old master key decrypts via keychain', () => {
      const tenantId = 'tenant-rotate-1';
      const oldKey = deriveKey(MASTER_KEY_V1, tenantId);
      const newKey = deriveKey(MASTER_KEY_V2, tenantId);

      // Encrypt with the OLD key (simulating pre-rotation data)
      const encrypted = encryptFieldValue(
        'Data encrypted before key rotation',
        oldKey,
      );

      // Keychain: new key first, then old key
      const keychain = [newKey, oldKey];
      const decrypted = decryptFieldValue(encrypted, keychain);

      expect(decrypted).toBe('Data encrypted before key rotation');
    });

    it('new writes use current master key', () => {
      const tenantId = 'tenant-rotate-2';
      const oldKey = deriveKey(MASTER_KEY_V1, tenantId);
      const newKey = deriveKey(MASTER_KEY_V2, tenantId);

      // After rotation, new writes use the NEW key
      const data: Record<string, unknown> = { bodyText: 'Fresh data after rotation' };
      encryptDataFields(data, 'Email', newKey);

      // Verify it decrypts with the new key alone (no old key needed)
      const result: Record<string, unknown> = { ...data };
      decryptResultFields(result, 'Email', [newKey]);
      expect(result.bodyText).toBe('Fresh data after rotation');

      // Verify the old key alone CANNOT decrypt the new data
      expect(() => {
        decryptFieldValue(data.bodyText as string, [oldKey]);
      }).toThrow('Decryption failed');
    });
  });

  // --- Group 4: Migration coexistence (ENC-04) ---

  describe('ENC-04: Migration coexistence', () => {
    it('plaintext values pass through on read without error', () => {
      const tenantId = 'tenant-migrate-1';
      const key = deriveKey(MASTER_KEY_V1, tenantId);

      // Simulate pre-migration record: bodyText is NOT enc: prefixed
      const readResult: Record<string, unknown> = {
        bodyText: 'This is plain old unencrypted body text from before migration.',
        bodyHtml: '<p>Also plain HTML</p>',
        snippet: 'Plain snippet preview',
      };

      // Decrypt should pass through all plaintext without error
      decryptResultFields(readResult, 'Email', [key]);

      expect(readResult.bodyText).toBe(
        'This is plain old unencrypted body text from before migration.',
      );
      expect(readResult.bodyHtml).toBe('<p>Also plain HTML</p>');
      expect(readResult.snippet).toBe('Plain snippet preview');
    });

    it('mixed encrypted and plaintext fields in same record', () => {
      const tenantId = 'tenant-migrate-2';
      const key = deriveKey(MASTER_KEY_V1, tenantId);

      // bodyText is encrypted (post-migration), bodyHtml is plaintext (pre-migration)
      const encryptedBody = encryptFieldValue(
        'This body was encrypted after migration',
        key,
      );

      const readResult: Record<string, unknown> = {
        bodyText: encryptedBody,
        bodyHtml: '<p>Still plaintext from before migration</p>',
        snippet: 'Also plaintext snippet',
      };

      decryptResultFields(readResult, 'Email', [key]);

      // Encrypted field decrypted correctly
      expect(readResult.bodyText).toBe(
        'This body was encrypted after migration',
      );
      // Plaintext fields pass through unchanged
      expect(readResult.bodyHtml).toBe(
        '<p>Still plaintext from before migration</p>',
      );
      expect(readResult.snippet).toBe('Also plaintext snippet');
    });
  });
});
