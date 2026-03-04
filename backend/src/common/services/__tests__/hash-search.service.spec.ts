import { randomBytes } from 'crypto';
import { hmacForBlindIndex } from '../../../prisma/encryption/field-encryption.utils';

// Mock TenantKeyService
const FIXED_HMAC_KEY = randomBytes(32);

const mockTenantKeyService = {
  getHmacKey: jest.fn().mockReturnValue(FIXED_HMAC_KEY),
  getCurrentKey: jest.fn().mockReturnValue(randomBytes(32)),
  getDecryptionKeys: jest.fn().mockReturnValue([randomBytes(32)]),
  isEnabled: true,
  clearCache: jest.fn(),
};

jest.mock('../tenant-key.service', () => ({
  TenantKeyService: jest.fn().mockImplementation(() => mockTenantKeyService),
}));

import { HashSearchService } from '../hash-search.service';

describe('HashSearchService', () => {
  let service: HashSearchService;
  const tenantId = 'tenant-test-001';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HashSearchService(mockTenantKeyService as any);
  });

  describe('buildExactSenderFilter', () => {
    it('builds dual-path WHERE for single email', () => {
      const filter = service.buildExactSenderFilter(tenantId, 'john@test.com');
      const expectedHash = hmacForBlindIndex('john@test.com', FIXED_HMAC_KEY);

      expect(filter).toEqual({
        OR: [
          { fromHash: expectedHash },
          { fromHash: null, from: 'john@test.com' },
        ],
      });
      expect(mockTenantKeyService.getHmacKey).toHaveBeenCalledWith(tenantId);
    });

    it('builds dual-path WHERE for array of emails', () => {
      const filter = service.buildExactSenderFilter(tenantId, ['a@b.com', 'c@d.com']);
      const hashA = hmacForBlindIndex('a@b.com', FIXED_HMAC_KEY);
      const hashC = hmacForBlindIndex('c@d.com', FIXED_HMAC_KEY);

      expect(filter).toEqual({
        OR: [
          { fromHash: { in: [hashA, hashC] } },
          { fromHash: null, from: { in: ['a@b.com', 'c@d.com'] } },
        ],
      });
    });

    it('normalizes email case in hash computation', () => {
      const filter1 = service.buildExactSenderFilter(tenantId, 'JOHN@TEST.COM');
      const filter2 = service.buildExactSenderFilter(tenantId, 'john@test.com');

      // Both should produce the same hash in the first OR branch
      const hash1 = (filter1 as any).OR[0].fromHash;
      const hash2 = (filter2 as any).OR[0].fromHash;
      expect(hash1).toBe(hash2);
    });

    it('calls getHmacKey with the correct tenantId', () => {
      service.buildExactSenderFilter('my-tenant', 'x@y.com');
      expect(mockTenantKeyService.getHmacKey).toHaveBeenCalledWith('my-tenant');
    });
  });
});
