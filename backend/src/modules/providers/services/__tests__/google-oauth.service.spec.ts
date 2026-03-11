/**
 * GoogleOAuthService integration tests — BTEST-03
 * All DB-touching tests use a real PostgreSQL test database.
 * OAuth network calls are mocked at prototype/global level.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthService } from '../google-oauth.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

const mockCrypto = {
  encrypt: jest.fn().mockReturnValue({ encrypted: 'encrypted-token', iv: 'mock-iv' }),
  decrypt: jest.fn().mockReturnValue('decrypted-token'),
};

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new GoogleOAuthService(prisma as any, mockCrypto as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrypto.encrypt.mockReturnValue({ encrypted: 'encrypted-token', iv: 'mock-iv' });
    mockCrypto.decrypt.mockReturnValue('decrypted-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Targeted cleanup: only delete rows created by this spec.
    // cleanupTestData() (TRUNCATE CASCADE) is intentionally omitted here —
    // running it races with other concurrent provider spec files and violates FK constraints.
    // The global teardown handles the final TRUNCATE after all specs finish.
    if (providerIds.length > 0) {
      await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  });

  // ---------------------------------------------------------------------------
  // refreshAccessToken
  // ---------------------------------------------------------------------------

  describe('refreshAccessToken', () => {
    it('success: calls OAuth2Client and returns new accessToken and expiresAt', async () => {
      const newExpiry = Date.now() + 3600 * 1000;
      const refreshSpy = jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({
          credentials: {
            access_token: 'new-access-token',
            expiry_date: newExpiry,
          },
          res: null,
        } as any);

      const result = await service.refreshAccessToken('some-refresh-token');

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresAt.getTime()).toBeCloseTo(newExpiry, -2);
    });

    it('throws UnauthorizedException on invalid_grant error', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockRejectedValue(new Error('invalid_grant'));

      await expect(service.refreshAccessToken('bad-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException on insufficient_scope error', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockRejectedValue(new Error('insufficient_scope'));

      await expect(service.refreshAccessToken('bad-refresh-token')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws UnauthorizedException when access_token missing from response', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({
          credentials: { access_token: null },
          res: null,
        } as any);

      await expect(service.refreshAccessToken('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('uses default 1h expiry when expiry_date is missing from credentials', async () => {
      const before = Date.now();
      jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({
          credentials: { access_token: 'token-no-expiry' },
          res: null,
        } as any);

      const result = await service.refreshAccessToken('some-refresh-token');
      const after = Date.now();

      expect(result.accessToken).toBe('token-no-expiry');
      // Default expiry is ~1 hour from now
      const oneHour = 3600 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + oneHour - 100);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + oneHour + 100);
    });
  });

  // ---------------------------------------------------------------------------
  // revokeToken
  // ---------------------------------------------------------------------------

  describe('revokeToken', () => {
    it('success: calls Google revocation endpoint (200 ok)', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);

      await expect(service.revokeToken('valid-token')).resolves.toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('handles 400 already-revoked response gracefully (no throw)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'token_revoked',
      } as Response);

      await expect(service.revokeToken('already-revoked-token')).resolves.toBeUndefined();
    });

    it('handles non-400 error response gracefully (no throw, logs warn)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'server error',
      } as Response);

      await expect(service.revokeToken('token')).resolves.toBeUndefined();
    });

    it('handles network error (fetch rejects) gracefully (no throw)', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(service.revokeToken('token')).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getProviderWithTokens / background refresh (via testGmailLabels as proxy)
  // ---------------------------------------------------------------------------

  describe('token lifecycle via DB', () => {
    it('detects expired token in DB and calls refreshAccessToken (blocking)', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      // Create a provider with expired token + refresh token
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        tokenExpiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
        accessToken: 'old-encrypted-access',
        refreshToken: 'old-encrypted-refresh',
        refreshTokenEncryptionIv: 'test-refresh-iv',
      });
      providerIds.push(provider.id);

      // Mock decrypt to return a valid-looking refresh token
      mockCrypto.decrypt.mockReturnValue('plaintext-refresh-token');
      // Mock refreshAccessToken at prototype level
      const newExpiry = Date.now() + 3600 * 1000;
      const refreshSpy = jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({
          credentials: {
            access_token: 'refreshed-access-token',
            expiry_date: newExpiry,
          },
          res: null,
        } as any);

      // Access via testGmailLabels, which calls getProviderWithTokens internally
      // We don't care about Gmail API — mock the gmail call by also mocking google.gmail
      // The method will still try to call gmail after getting the token,
      // but it returns { success: false } on error, which is acceptable for this test's purpose.
      await service.testGmailLabels(tenant.id, provider.id);

      // The key assertion: refresh was triggered because token was expired
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      // Verify DB updated with new token
      const updated = await prisma.providerConfig.findFirst({ where: { id: provider.id } });
      expect(updated?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns existing accessToken without calling refreshAccessToken when token is valid', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      // Token expires in 2 hours (not near expiry)
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        tokenExpiresAt: new Date(Date.now() + 2 * 3600 * 1000),
        accessToken: 'valid-encrypted-access',
        refreshToken: null,
      });
      providerIds.push(provider.id);

      mockCrypto.decrypt.mockReturnValue('plaintext-access-token');
      const refreshSpy = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken');

      // testGmailLabels calls getProviderWithTokens; if token is valid, no refresh occurs
      await service.testGmailLabels(tenant.id, provider.id);

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('triggers background refresh when token expires within 5 minutes', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      // Token expires in 3 minutes (within 5-minute window)
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        tokenExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
        accessToken: 'near-expiry-encrypted-access',
        refreshToken: 'near-expiry-encrypted-refresh',
        refreshTokenEncryptionIv: 'test-refresh-iv',
      });
      providerIds.push(provider.id);

      mockCrypto.decrypt.mockReturnValue('plaintext-token');
      const refreshSpy = jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({
          credentials: {
            access_token: 'bg-refreshed-token',
            expiry_date: Date.now() + 3600 * 1000,
          },
          res: null,
        } as any);

      await service.testGmailLabels(tenant.id, provider.id);

      // Background refresh is fire-and-forget — wait briefly for it to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });
});
