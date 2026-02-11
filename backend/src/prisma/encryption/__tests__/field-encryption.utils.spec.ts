import { randomBytes } from 'crypto';
import {
  encryptFieldValue,
  decryptFieldValue,
  isEncrypted,
  hashForSearch,
  ENCRYPTION_PREFIX,
} from '../field-encryption.utils';

describe('field-encryption.utils', () => {
  const key1 = randomBytes(32);
  const key2 = randomBytes(32);

  describe('encryptFieldValue', () => {
    it('produces enc: prefixed output', () => {
      const result = encryptFieldValue('hello world', key1);
      expect(result.startsWith(ENCRYPTION_PREFIX)).toBe(true);
    });

    it('produces different ciphertexts for same plaintext (random IV)', () => {
      const a = encryptFieldValue('same text', key1);
      const b = encryptFieldValue('same text', key1);
      expect(a).not.toBe(b);
    });
  });

  describe('decryptFieldValue', () => {
    it('round-trips correctly', () => {
      const original = 'The quick brown fox jumps over the lazy dog!';
      const encrypted = encryptFieldValue(original, key1);
      const decrypted = decryptFieldValue(encrypted, [key1]);
      expect(decrypted).toBe(original);
    });

    it('passes through plaintext (no enc: prefix)', () => {
      const plaintext = 'just a regular string';
      const result = decryptFieldValue(plaintext, [key1]);
      expect(result).toBe(plaintext);
    });

    it('tries multiple keys and succeeds with second key', () => {
      const encrypted = encryptFieldValue('secret data', key1);
      // key2 will fail, key1 should succeed
      const result = decryptFieldValue(encrypted, [key2, key1]);
      expect(result).toBe('secret data');
    });

    it('throws when all keys fail', () => {
      const encrypted = encryptFieldValue('secret data', key1);
      expect(() => decryptFieldValue(encrypted, [key2])).toThrow(
        'none of the provided keys could decrypt',
      );
    });

    it('handles unicode content correctly', () => {
      const unicode = 'Ciao mondo! Contatto: Davide 🎉 日本語テスト';
      const encrypted = encryptFieldValue(unicode, key1);
      expect(decryptFieldValue(encrypted, [key1])).toBe(unicode);
    });
  });

  describe('isEncrypted', () => {
    it('detects enc: prefix', () => {
      expect(isEncrypted('enc:abc123')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(isEncrypted('plain text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('hashForSearch', () => {
    it('produces consistent hash', () => {
      const h1 = hashForSearch('john@test.com', 'tenant-1', 'salt1');
      const h2 = hashForSearch('john@test.com', 'tenant-1', 'salt1');
      expect(h1).toBe(h2);
    });

    it('produces different hash for different input', () => {
      const h1 = hashForSearch('john@test.com', 'tenant-1', 'salt1');
      const h2 = hashForSearch('jane@test.com', 'tenant-1', 'salt1');
      expect(h1).not.toBe(h2);
    });

    it('normalizes case', () => {
      const h1 = hashForSearch('JOHN@TEST.COM', 'tenant-1', 'salt1');
      const h2 = hashForSearch('john@test.com', 'tenant-1', 'salt1');
      expect(h1).toBe(h2);
    });

    it('isolates by tenant', () => {
      const h1 = hashForSearch('john@test.com', 'tenant-1', 'salt1');
      const h2 = hashForSearch('john@test.com', 'tenant-2', 'salt1');
      expect(h1).not.toBe(h2);
    });
  });
});
