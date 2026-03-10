import { randomBytes } from 'crypto';

// Valid 32-byte base64 master keys for testing
const TEST_MASTER_KEY = randomBytes(32).toString('base64');
const TEST_OLD_KEY = randomBytes(32).toString('base64');
const SHORT_KEY = randomBytes(16).toString('base64'); // only 16 bytes

function createServiceWithConfig(masterKey: string, oldKeys = '') {
  let svc: any;
  jest.isolateModules(() => {
    jest.doMock('../../../config/configuration', () => ({
      getConfiguration: () => ({
        fieldEncryption: { masterKey, oldMasterKeys: oldKeys },
      }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TenantKeyService } = require('../tenant-key.service');
    svc = new TenantKeyService();
  });
  return svc;
}

describe('TenantKeyService', () => {
  it('derives deterministic key for same tenant', () => {
    const svc = createServiceWithConfig(TEST_MASTER_KEY);
    const key1 = svc.getCurrentKey('tenant-abc');
    const key2 = svc.getCurrentKey('tenant-abc');
    expect(key1.equals(key2)).toBe(true);
    expect(key1.length).toBe(32);
  });

  it('derives different keys for different tenants', () => {
    const svc = createServiceWithConfig(TEST_MASTER_KEY);
    const keyA = svc.getCurrentKey('tenant-a');
    const keyB = svc.getCurrentKey('tenant-b');
    expect(keyA.equals(keyB)).toBe(false);
  });

  it('caches derived keys', () => {
    const svc = createServiceWithConfig(TEST_MASTER_KEY);
    svc.getCurrentKey('tenant-x');
    svc.getCurrentKey('tenant-x');
    expect((svc).cache.size).toBe(1);
  });

  it('clearCache empties the cache', () => {
    const svc = createServiceWithConfig(TEST_MASTER_KEY);
    svc.getCurrentKey('tenant-y');
    expect((svc).cache.size).toBe(1);
    svc.clearCache();
    expect((svc).cache.size).toBe(0);
  });

  it('getDecryptionKeys includes current and old keys', () => {
    const svc = createServiceWithConfig(TEST_MASTER_KEY, TEST_OLD_KEY);
    const keys = svc.getDecryptionKeys('tenant-z');
    expect(keys).toHaveLength(2);
    // First key = current master, second = old master — must differ
    expect(keys[0].equals(keys[1])).toBe(false);
  });

  it('throws if master key is too short', () => {
    expect(() => createServiceWithConfig(SHORT_KEY)).toThrow(
      'must decode to >= 32 bytes',
    );
  });

  describe('getHmacKey', () => {
    it('returns a 32-byte Buffer', () => {
      const svc = createServiceWithConfig(TEST_MASTER_KEY);
      const hmacKey = svc.getHmacKey('tenant-1');
      expect(Buffer.isBuffer(hmacKey)).toBe(true);
      expect(hmacKey.length).toBe(32);
    });

    it('returns a key distinct from the encryption key', () => {
      const svc = createServiceWithConfig(TEST_MASTER_KEY);
      const encKey = svc.getCurrentKey('tenant-1');
      const hmacKey = svc.getHmacKey('tenant-1');
      expect(encKey.equals(hmacKey)).toBe(false);
    });

    it('is cached (same reference on repeated calls)', () => {
      const svc = createServiceWithConfig(TEST_MASTER_KEY);
      const k1 = svc.getHmacKey('tenant-1');
      const k2 = svc.getHmacKey('tenant-1');
      expect(k1).toBe(k2); // same object reference (cached)
    });

    it('derives different keys per tenant', () => {
      const svc = createServiceWithConfig(TEST_MASTER_KEY);
      const k1 = svc.getHmacKey('tenant-1');
      const k2 = svc.getHmacKey('tenant-2');
      expect(k1.equals(k2)).toBe(false);
    });

    it('clearCache also clears hmac cache', () => {
      const svc = createServiceWithConfig(TEST_MASTER_KEY);
      svc.getHmacKey('tenant-1');
      expect((svc).hmacCache.size).toBe(1);
      svc.clearCache();
      expect((svc).hmacCache.size).toBe(0);
    });
  });
});
