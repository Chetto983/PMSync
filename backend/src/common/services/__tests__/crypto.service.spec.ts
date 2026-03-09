/**
 * CryptoService unit tests
 *
 * Tests AES-256-GCM encryption with backward-compatible CBC decryption fallback.
 */
import * as crypto from 'crypto';

// Generate a deterministic 32-byte key for testing
const TEST_KEY_BASE64 = crypto.randomBytes(32).toString('base64');

// Set env before importing CryptoService
process.env.AES_SECRET_KEY = TEST_KEY_BASE64;

import { CryptoService } from '../crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;
  const testKey = Buffer.from(TEST_KEY_BASE64, 'base64');

  beforeEach(() => {
    service = new CryptoService();
  });

  // Helper: produce a legacy CBC-encrypted pair using the same key
  function encryptWithCbc(text: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', testKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv: iv.toString('hex') };
  }

  describe('encrypt()', () => {
    it('should return ciphertext starting with gcm: prefix', () => {
      const result = service.encrypt('hello world');
      expect(result.encrypted).toMatch(/^gcm:/);
    });

    it('should return a 24-char hex IV (12 bytes)', () => {
      const result = service.encrypt('test data');
      expect(result.iv).toHaveLength(24);
      // Verify it's valid hex
      expect(result.iv).toMatch(/^[0-9a-f]{24}$/);
    });

    it('should produce different ciphertext for the same input (random IV)', () => {
      const result1 = service.encrypt('identical input');
      const result2 = service.encrypt('identical input');
      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decrypt() - GCM round-trip', () => {
    it('should decrypt GCM-encrypted data back to original plaintext', () => {
      const plaintext = 'hello world';
      const { encrypted, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted, iv);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string round-trip', () => {
      const plaintext = '';
      const { encrypted, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted, iv);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text (1000+ chars) round-trip', () => {
      const plaintext = 'A'.repeat(1500);
      const { encrypted, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted, iv);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode text round-trip', () => {
      const plaintext = 'Ciao mondo! 日本語テスト ñ ü ö ä';
      const { encrypted, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted, iv);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt() - CBC rejection (legacy data must be migrated)', () => {
    it('should throw on legacy CBC-encrypted data (no gcm: prefix)', () => {
      const plaintext = 'legacy secret data';
      const { encrypted, iv } = encryptWithCbc(plaintext);

      expect(encrypted).not.toMatch(/^gcm:/);

      expect(() => service.decrypt(encrypted, iv)).toThrow(
        'Legacy CBC-encrypted data detected',
      );
    });

    it('should throw on legacy CBC with unicode content', () => {
      const plaintext = 'Dati segreti con àccénti';
      const { encrypted, iv } = encryptWithCbc(plaintext);
      expect(() => service.decrypt(encrypted, iv)).toThrow(
        'Legacy CBC-encrypted data detected',
      );
    });
  });

  describe('decrypt() - tamper detection (GCM integrity)', () => {
    it('should throw on tampered auth tag', () => {
      const { encrypted, iv } = service.encrypt('sensitive data');

      // GCM format: gcm:<ciphertext_hex>:<authtag_hex>
      const parts = encrypted.split(':');
      // parts[0] = 'gcm', parts[1] = ciphertext, parts[2] = authTag
      const tamperedTag = 'a'.repeat(parts[2].length);
      const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}`;

      expect(() => service.decrypt(tampered, iv)).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const { encrypted, iv } = service.encrypt('sensitive data');

      const parts = encrypted.split(':');
      // Flip some hex chars in the ciphertext
      const tamperedCipher = parts[1].split('').reverse().join('');
      const tampered = `${parts[0]}:${tamperedCipher}:${parts[2]}`;

      expect(() => service.decrypt(tampered, iv)).toThrow();
    });
  });
});
