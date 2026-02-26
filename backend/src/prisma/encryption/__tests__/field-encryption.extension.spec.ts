import { randomBytes } from 'crypto';
import {
  extractTenantId,
  encryptDataFields,
  decryptResultFields,
  createFieldEncryptionExtension,
} from '../field-encryption.extension';
import {
  encryptFieldValue,
  decryptFieldValue,
  isEncrypted,
} from '../field-encryption.utils';
import { getEncryptedFieldsForModel } from '../encryption.config';

describe('field-encryption.extension', () => {
  const testKey = randomBytes(32);
  const testKey2 = randomBytes(32);
  const tenantId = 'tenant-test-001';

  describe('extractTenantId', () => {
    it('extracts from args.data.tenantId', () => {
      expect(extractTenantId({ data: { tenantId: 't1' } })).toBe('t1');
    });

    it('extracts from args.where.tenantId', () => {
      expect(extractTenantId({ where: { tenantId: 't2' } })).toBe('t2');
    });

    it('extracts from composite PK pattern', () => {
      expect(
        extractTenantId({
          where: { id_tenantId: { id: 'x', tenantId: 't3' } },
        }),
      ).toBe('t3');
    });

    it('returns null when no tenantId found', () => {
      expect(extractTenantId({ where: { id: 'abc' } })).toBeNull();
    });

    it('returns null for empty args', () => {
      expect(extractTenantId({})).toBeNull();
    });
  });

  describe('encryptDataFields', () => {
    it('encrypts configured fields on Email model', () => {
      const data: Record<string, unknown> = {
        bodyText: 'Hello world',
        bodyHtml: '<p>Hello</p>',
        snippet: 'Hello...',
        subject: 'Test Subject',
      };
      encryptDataFields(data, 'Email', testKey);

      expect(isEncrypted(data.bodyText as string)).toBe(true);
      expect(isEncrypted(data.bodyHtml as string)).toBe(true);
      expect(isEncrypted(data.snippet as string)).toBe(true);
      // subject is NOT in encrypted fields config — unchanged
      expect(data.subject).toBe('Test Subject');
    });

    it('skips null and undefined values', () => {
      const data: Record<string, unknown> = {
        bodyText: null,
        bodyHtml: undefined,
        snippet: 'Short',
      };
      encryptDataFields(data, 'Email', testKey);

      expect(data.bodyText).toBeNull();
      expect(data.bodyHtml).toBeUndefined();
      expect(isEncrypted(data.snippet as string)).toBe(true);
    });

    it('does nothing for unconfigured models', () => {
      const data: Record<string, unknown> = {
        bodyText: 'Hello',
        name: 'Test',
      };
      encryptDataFields(data, 'User', testKey);
      expect(data.bodyText).toBe('Hello');
      expect(data.name).toBe('Test');
    });

    it('skips non-string values (number, boolean)', () => {
      const data: Record<string, unknown> = {
        bodyText: 12345,
        bodyHtml: true,
        snippet: 'Real text',
      };
      encryptDataFields(data, 'Email', testKey);
      expect(data.bodyText).toBe(12345);
      expect(data.bodyHtml).toBe(true);
      expect(isEncrypted(data.snippet as string)).toBe(true);
    });
  });

  describe('decryptResultFields', () => {
    it('decrypts encrypted fields', () => {
      const encrypted = encryptFieldValue('Hello world', testKey);
      const result: Record<string, unknown> = {
        bodyText: encrypted,
        subject: 'Not encrypted',
      };
      decryptResultFields(result, 'Email', [testKey]);

      expect(result.bodyText).toBe('Hello world');
      expect(result.subject).toBe('Not encrypted');
    });

    it('passes through plaintext values (no enc: prefix)', () => {
      const result: Record<string, unknown> = {
        bodyText: 'Just plain text',
        bodyHtml: '<p>Also plain</p>',
      };
      decryptResultFields(result, 'Email', [testKey]);

      expect(result.bodyText).toBe('Just plain text');
      expect(result.bodyHtml).toBe('<p>Also plain</p>');
    });

    it('handles null field values without errors', () => {
      const result: Record<string, unknown> = {
        bodyText: null,
        bodyHtml: null,
        snippet: null,
      };
      decryptResultFields(result, 'Email', [testKey]);

      expect(result.bodyText).toBeNull();
      expect(result.bodyHtml).toBeNull();
      expect(result.snippet).toBeNull();
    });
  });

  describe('encrypt-then-decrypt round trip (simulating extension flow)', () => {
    /**
     * These tests simulate what the Prisma extension does internally:
     * 1. On write: encryptDataFields mutates the data object
     * 2. On read: decryptResultFields restores the original values
     * This is the exact same flow the $allOperations handler executes.
     */

    it('round-trips Email create correctly', () => {
      const original = {
        tenantId,
        bodyText: 'Secret email body content',
        bodyHtml: '<p>Secret <b>HTML</b> content</p>',
        snippet: 'Secret email body...',
        subject: 'Meeting tomorrow', // not encrypted
      };

      // Simulate write path
      const writeData = { ...original };
      encryptDataFields(writeData, 'Email', testKey);

      // Verify encryption happened
      expect(isEncrypted(writeData.bodyText)).toBe(true);
      expect(isEncrypted(writeData.bodyHtml)).toBe(true);
      expect(isEncrypted(writeData.snippet)).toBe(true);
      expect(writeData.subject).toBe('Meeting tomorrow');

      // Simulate read path (data returned from DB)
      const readResult = { ...writeData };
      decryptResultFields(readResult, 'Email', [testKey]);

      // Verify decryption restored originals
      expect(readResult.bodyText).toBe(original.bodyText);
      expect(readResult.bodyHtml).toBe(original.bodyHtml);
      expect(readResult.snippet).toBe(original.snippet);
      expect(readResult.subject).toBe(original.subject);
    });

    it('round-trips Email update correctly', () => {
      const updateData: Record<string, unknown> = {
        bodyText: 'Updated content',
      };

      encryptDataFields(updateData, 'Email', testKey);
      expect(isEncrypted(updateData.bodyText as string)).toBe(true);

      const readResult = { ...updateData };
      decryptResultFields(readResult, 'Email', [testKey]);
      expect(readResult.bodyText).toBe('Updated content');
    });

    it('handles createMany array correctly', () => {
      const records = [
        { tenantId, bodyText: 'Email 1', bodyHtml: '<p>1</p>', snippet: 's1' },
        { tenantId, bodyText: 'Email 2', bodyHtml: '<p>2</p>', snippet: 's2' },
      ];

      // Encrypt each record (what extension does for createMany)
      for (const record of records) {
        encryptDataFields(record, 'Email', testKey);
      }

      // Verify all encrypted
      for (const record of records) {
        expect(isEncrypted(record.bodyText)).toBe(true);
        expect(isEncrypted(record.bodyHtml)).toBe(true);
        expect(isEncrypted(record.snippet)).toBe(true);
      }

      // Decrypt and verify round-trip
      const result0 = { ...records[0] };
      const result1 = { ...records[1] };
      decryptResultFields(result0, 'Email', [testKey]);
      decryptResultFields(result1, 'Email', [testKey]);

      expect(result0.bodyText).toBe('Email 1');
      expect(result1.bodyText).toBe('Email 2');
    });

    it('tenants cannot decrypt each other data', () => {
      // Different keys for different tenants
      const data: Record<string, unknown> = {
        bodyText: 'Tenant A secret',
      };
      encryptDataFields(data, 'Email', testKey);

      // Try to decrypt with different tenant key
      expect(() => {
        decryptResultFields(
          { bodyText: data.bodyText },
          'Email',
          [testKey2],
        );
      }).toThrow('Decryption failed');
    });

    it('plaintext coexists with encrypted data on read', () => {
      // Simulate mixed DB state: some rows encrypted, some not
      const encryptedBody = encryptFieldValue('Encrypted body', testKey);

      const results = [
        { bodyText: encryptedBody, snippet: 'Plain snippet' }, // mixed
        { bodyText: 'All plain', snippet: 'Also plain' }, // all plain
      ];

      for (const result of results) {
        decryptResultFields(result, 'Email', [testKey]);
      }

      expect(results[0].bodyText).toBe('Encrypted body');
      expect(results[0].snippet).toBe('Plain snippet'); // pass-through
      expect(results[1].bodyText).toBe('All plain'); // pass-through
      expect(results[1].snippet).toBe('Also plain'); // pass-through
    });
  });

  describe('createFieldEncryptionExtension', () => {
    it('returns a function (Prisma extension definition)', () => {
      const extension = createFieldEncryptionExtension(
        () => testKey,
        () => [testKey],
      );
      // Prisma.defineExtension returns a callable function
      expect(typeof extension).toBe('function');
    });

    it('config recognizes Email model fields', () => {
      const fields = getEncryptedFieldsForModel('Email');
      expect(fields.length).toBe(3);
      expect(fields.map((f) => f.field)).toEqual([
        'bodyText',
        'bodyHtml',
        'snippet',
      ]);
    });

    it('config returns empty for unconfigured models', () => {
      expect(getEncryptedFieldsForModel('User')).toEqual([]);
      expect(getEncryptedFieldsForModel('Contact')).toEqual([]);
      expect(getEncryptedFieldsForModel('NonExistent')).toEqual([]);
    });
  });
});
