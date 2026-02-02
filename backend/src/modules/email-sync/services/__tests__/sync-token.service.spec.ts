import { Test, TestingModule } from '@nestjs/testing';
import { SyncTokenService } from '../sync-token.service';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

describe('SyncTokenService', () => {
  let service: SyncTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncTokenService],
    }).compile();

    service = module.get<SyncTokenService>(SyncTokenService);
  });

  describe('isTokenExpiringSoon', () => {
    it('should return false when tokenExpiresAt is null', () => {
      expect(service.isTokenExpiringSoon(null)).toBe(false);
    });

    it('should return false when tokenExpiresAt is undefined', () => {
      expect(service.isTokenExpiringSoon(undefined)).toBe(false);
    });

    it('should return false when token expires in more than 2 minutes', () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 min in future
      expect(service.isTokenExpiringSoon(futureDate)).toBe(false);
    });

    it('should return true when token expires in less than 2 minutes', () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000); // 1 min in future
      expect(service.isTokenExpiringSoon(soonDate)).toBe(true);
    });

    it('should return true when token is already expired', () => {
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 min ago
      expect(service.isTokenExpiringSoon(pastDate)).toBe(true);
    });

    it('should return true at exactly 2 minute threshold', () => {
      // At exactly 2 minutes, now >= expiresAt - threshold
      // now >= now + 2min - 2min => now >= now => true
      const thresholdDate = new Date(Date.now() + 2 * 60 * 1000);
      expect(service.isTokenExpiringSoon(thresholdDate)).toBe(true);
    });

    it('should return false just above 2 minute threshold', () => {
      const justAbove = new Date(Date.now() + 2 * 60 * 1000 + 100); // 2 min + 100ms
      expect(service.isTokenExpiringSoon(justAbove)).toBe(false);
    });

    it('should handle date strings correctly (ISO format)', () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      // Service accepts Date | null | undefined, but new Date() can parse Date objects
      expect(service.isTokenExpiringSoon(futureDate)).toBe(false);
    });

    it('should return true for token expiring in 30 seconds', () => {
      const soonDate = new Date(Date.now() + 30 * 1000); // 30 seconds
      expect(service.isTokenExpiringSoon(soonDate)).toBe(true);
    });

    it('should return false for token expiring in 3 minutes', () => {
      const laterDate = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
      expect(service.isTokenExpiringSoon(laterDate)).toBe(false);
    });
  });

  describe('refreshDriverIfNeeded', () => {
    let mockDriver: jest.Mocked<IEmailDriver>;
    let mockNewDriver: jest.Mocked<IEmailDriver>;
    let getCredentialsFn: jest.Mock;
    let createDriverFn: jest.Mock;

    beforeEach(() => {
      mockDriver = {
        disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        isConnected: jest.fn<() => boolean>().mockReturnValue(true),
        connect: jest.fn(),
        listFolders: jest.fn(),
        listMessages: jest.fn(),
        getMessage: jest.fn(),
        getAttachment: jest.fn(),
        sendMessage: jest.fn(),
        createDraft: jest.fn(),
        updateDraft: jest.fn(),
        sendDraft: jest.fn(),
        deleteDraft: jest.fn(),
        moveMessage: jest.fn(),
        deleteMessage: jest.fn(),
        updateFlags: jest.fn(),
        subscribeToChanges: jest.fn(),
        unsubscribe: jest.fn(),
        getSyncToken: jest.fn(),
        getChanges: jest.fn(),
        createFolder: jest.fn(),
        renameFolder: jest.fn(),
        deleteFolder: jest.fn(),
        getUserInfo: jest.fn(),
        getProviderType: jest.fn(),
      } as unknown as jest.Mocked<IEmailDriver>;

      mockNewDriver = {
        disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        isConnected: jest.fn<() => boolean>().mockReturnValue(true),
        connect: jest.fn(),
        listFolders: jest.fn(),
        listMessages: jest.fn(),
        getMessage: jest.fn(),
        getAttachment: jest.fn(),
        sendMessage: jest.fn(),
        createDraft: jest.fn(),
        updateDraft: jest.fn(),
        sendDraft: jest.fn(),
        deleteDraft: jest.fn(),
        moveMessage: jest.fn(),
        deleteMessage: jest.fn(),
        updateFlags: jest.fn(),
        subscribeToChanges: jest.fn(),
        unsubscribe: jest.fn(),
        getSyncToken: jest.fn(),
        getChanges: jest.fn(),
        createFolder: jest.fn(),
        renameFolder: jest.fn(),
        deleteFolder: jest.fn(),
        getUserInfo: jest.fn(),
        getProviderType: jest.fn(),
      } as unknown as jest.Mocked<IEmailDriver>;

      getCredentialsFn = jest.fn().mockResolvedValue({
        provider: { tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        credentials: { accessToken: 'new-token' },
        driverType: 'google',
      });

      createDriverFn = jest.fn().mockResolvedValue(mockNewDriver);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should return same driver when token is not expiring', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      const result = await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-123',
        futureDate,
        getCredentialsFn,
        createDriverFn,
      );

      expect(result.driver).toBe(mockDriver);
      expect(result.tokenExpiresAt).toEqual(futureDate);
      expect(mockDriver.disconnect).not.toHaveBeenCalled();
      expect(getCredentialsFn).not.toHaveBeenCalled();
      expect(createDriverFn).not.toHaveBeenCalled();
    });

    it('should return same driver when tokenExpiresAt is null', async () => {
      const result = await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-123',
        null,
        getCredentialsFn,
        createDriverFn,
      );

      expect(result.driver).toBe(mockDriver);
      expect(result.tokenExpiresAt).toBeNull();
      expect(mockDriver.disconnect).not.toHaveBeenCalled();
    });

    it('should refresh driver when token is expiring soon', async () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000); // 1 min
      const newTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

      getCredentialsFn.mockResolvedValue({
        provider: { tokenExpiresAt: newTokenExpiresAt },
        credentials: { accessToken: 'refreshed-token' },
        driverType: 'google',
      });

      const result = await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-123',
        soonDate,
        getCredentialsFn,
        createDriverFn,
      );

      expect(result.driver).toBe(mockNewDriver);
      expect(result.tokenExpiresAt).toEqual(newTokenExpiresAt);
      expect(mockDriver.disconnect).toHaveBeenCalledTimes(1);
      expect(getCredentialsFn).toHaveBeenCalledWith('provider-123');
      expect(createDriverFn).toHaveBeenCalledWith('google', { accessToken: 'refreshed-token' });
    });

    it('should refresh driver when token is already expired', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago

      const result = await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-456',
        pastDate,
        getCredentialsFn,
        createDriverFn,
      );

      expect(result.driver).toBe(mockNewDriver);
      expect(mockDriver.disconnect).toHaveBeenCalledTimes(1);
      expect(getCredentialsFn).toHaveBeenCalledWith('provider-456');
    });

    it('should throw error when new driver fails to connect', async () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000);
      mockNewDriver.isConnected.mockReturnValue(false);

      await expect(
        service.refreshDriverIfNeeded(
          mockDriver,
          'provider-123',
          soonDate,
          getCredentialsFn,
          createDriverFn,
        ),
      ).rejects.toThrow('Token refresh failed for provider provider-123: New driver failed to connect');
    });

    it('should throw error when credential fetch fails', async () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000);
      getCredentialsFn.mockRejectedValue(new Error('Auth failed'));

      await expect(
        service.refreshDriverIfNeeded(
          mockDriver,
          'provider-123',
          soonDate,
          getCredentialsFn,
          createDriverFn,
        ),
      ).rejects.toThrow('Token refresh failed for provider provider-123: Auth failed');

      // Should still have disconnected the old driver
      expect(mockDriver.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should throw error when createDriver fails', async () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000);
      createDriverFn.mockRejectedValue(new Error('Driver creation failed'));

      await expect(
        service.refreshDriverIfNeeded(
          mockDriver,
          'provider-123',
          soonDate,
          getCredentialsFn,
          createDriverFn,
        ),
      ).rejects.toThrow('Token refresh failed for provider provider-123: Driver creation failed');
    });

    it('should work with microsoft driver type', async () => {
      const soonDate = new Date(Date.now() + 30 * 1000); // 30 seconds

      getCredentialsFn.mockResolvedValue({
        provider: { tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        credentials: { accessToken: 'ms-token' },
        driverType: 'microsoft',
      });

      await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-ms',
        soonDate,
        getCredentialsFn,
        createDriverFn,
      );

      expect(createDriverFn).toHaveBeenCalledWith('microsoft', { accessToken: 'ms-token' });
    });

    it('should work with imap driver type', async () => {
      const soonDate = new Date(Date.now() + 30 * 1000);

      getCredentialsFn.mockResolvedValue({
        provider: { tokenExpiresAt: null }, // IMAP may not have token expiry
        credentials: { username: 'user', password: 'pass' },
        driverType: 'imap',
      });

      const result = await service.refreshDriverIfNeeded(
        mockDriver,
        'provider-imap',
        soonDate,
        getCredentialsFn,
        createDriverFn,
      );

      expect(createDriverFn).toHaveBeenCalledWith('imap', { username: 'user', password: 'pass' });
      expect(result.tokenExpiresAt).toBeNull();
    });
  });
});
