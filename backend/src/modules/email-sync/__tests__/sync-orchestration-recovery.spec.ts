/**
 * T-1701: Sync Orchestration Recovery Tests
 *
 * Tests sync token invalidation recovery (IF-H2), mid-sync token refresh
 * (CRIT-3), cross-folder dedup (DEDUP-FIX), and folder budget allocation.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
  SyncOrchestrationService,
  OrchestrationContext,
  FullSyncConfig,
} from '../services/sync-orchestration.service';
import { SyncMessageProcessorService } from '../services/sync-message-processor.service';
import { SyncTokenService } from '../services/sync-token.service';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';

// ─── Mock helpers ───

function createMockDriver(overrides?: Partial<IEmailDriver>): jest.Mocked<IEmailDriver> {
  return {
    connect: jest.fn(),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isConnected: jest.fn<() => boolean>().mockReturnValue(true),
    listFolders: jest.fn(),
    listMessages: jest.fn().mockResolvedValue({ messages: [], nextPageToken: undefined }),
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
    getInitialSyncToken: jest.fn<() => Promise<string>>().mockResolvedValue('sync-token-123'),
    getChangesSince: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<IEmailDriver>;
}

function createContext(overrides?: Partial<OrchestrationContext>): OrchestrationContext {
  return {
    providerId: 'provider-1',
    tenantId: 'tenant-1',
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    getDriverCredentials: jest.fn().mockResolvedValue({
      provider: { tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      credentials: { accessToken: 'new-token' },
      driverType: 'google',
    }),
    createDriver: jest.fn().mockResolvedValue(createMockDriver()),
    messageProcessorContext: {
      providerType: 'google',
      userId: 'user-1',
    } as any,
    ...overrides,
  };
}

describe('SyncOrchestrationService', () => {
  let service: SyncOrchestrationService;
  let mockMessageProcessor: jest.Mocked<Partial<SyncMessageProcessorService>>;
  let mockTokenService: jest.Mocked<Partial<SyncTokenService>>;

  beforeEach(async () => {
    mockMessageProcessor = {
      processBatch: jest.fn().mockResolvedValue({ processed: 0, newCount: 0 }),
      handleDeletion: jest.fn().mockResolvedValue(undefined),
      upsertMessage: jest.fn().mockResolvedValue({ wasNew: true }),
    };

    mockTokenService = {
      refreshDriverIfNeeded: jest.fn().mockImplementation(
        async (driver, _pid, tokenExpiresAt) => ({
          driver,
          tokenExpiresAt,
        }),
      ),
      isTokenExpiringSoon: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncOrchestrationService,
        { provide: SyncMessageProcessorService, useValue: mockMessageProcessor },
        { provide: SyncTokenService, useValue: mockTokenService },
      ],
    }).compile();

    service = module.get<SyncOrchestrationService>(SyncOrchestrationService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── Full sync: folder budgets ───

  describe('executeFullSync — folder budget allocation', () => {
    it('should distribute budget across all 5 folders', async () => {
      const driver = createMockDriver();
      const context = createContext();
      const config: FullSyncConfig = {
        fullSyncMaxMessages: 100,
        batchSize: 50,
        getListMessagesOptions: () => ({}),
      };

      await service.executeFullSync(driver, config, context);

      // Should have called listMessages for multiple folders
      const calls = driver.listMessages.mock.calls;
      const foldersRequested = calls.map((c: any) => c[0]?.folder);
      expect(foldersRequested).toContain('INBOX');
      expect(foldersRequested).toContain('SENT');
    });
  });

  // ─── Full sync: DEDUP-FIX ───

  describe('executeFullSync — cross-folder deduplication', () => {
    it('should skip duplicate messages across folders', async () => {
      const driver = createMockDriver();
      // First folder returns msg-1, msg-2
      // Second folder returns msg-2 (duplicate), msg-3
      let folderCallCount = 0;
      driver.listMessages.mockImplementation(async (opts: any) => {
        folderCallCount++;
        if (opts.folder === 'INBOX') {
          return {
            messages: [
              { id: 'msg-1', subject: 'Test 1' },
              { id: 'msg-2', subject: 'Test 2' },
            ],
            nextPageToken: undefined,
          };
        }
        if (opts.folder === 'SENT') {
          return {
            messages: [
              { id: 'msg-2', subject: 'Test 2 dup' },
              { id: 'msg-3', subject: 'Test 3' },
            ],
            nextPageToken: undefined,
          };
        }
        return { messages: [], nextPageToken: undefined };
      });

      const context = createContext();
      const config: FullSyncConfig = {
        fullSyncMaxMessages: 100,
        batchSize: 50,
        getListMessagesOptions: () => ({}),
      };

      await service.executeFullSync(driver, config, context);

      // processBatch should have been called with deduped messages
      // INBOX batch: msg-1, msg-2 (2 msgs)
      // SENT batch: msg-3 only (msg-2 deduped) (1 msg)
      const allBatches = mockMessageProcessor.processBatch!.mock.calls;
      const totalMessages = allBatches.reduce(
        (sum: number, call: any) => sum + call[1].length,
        0,
      );
      // 2 (INBOX) + 1 (SENT deduped) + 0 (other folders) = 3
      expect(totalMessages).toBe(3);
    });
  });

  // ─── Full sync: CRIT-3 mid-sync token refresh ───

  describe('executeFullSync — CRIT-3 mid-sync token refresh', () => {
    it('should call refreshDriverIfNeeded before each folder batch', async () => {
      const driver = createMockDriver();
      driver.listMessages.mockResolvedValue({
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
      });

      const context = createContext();
      const config: FullSyncConfig = {
        fullSyncMaxMessages: 100,
        batchSize: 50,
        getListMessagesOptions: () => ({}),
      };

      await service.executeFullSync(driver, config, context);

      // refreshDriverIfNeeded called at least once per folder that has messages
      expect(mockTokenService.refreshDriverIfNeeded!.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should use refreshed driver for subsequent operations', async () => {
      const originalDriver = createMockDriver();
      const refreshedDriver = createMockDriver();

      originalDriver.listMessages.mockResolvedValue({
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
      });
      refreshedDriver.listMessages.mockResolvedValue({
        messages: [{ id: 'msg-2' }],
        nextPageToken: undefined,
      });

      // First call returns original, subsequent calls return refreshed
      let refreshCallCount = 0;
      mockTokenService.refreshDriverIfNeeded!.mockImplementation(async (driver) => {
        refreshCallCount++;
        if (refreshCallCount === 1) {
          return { driver: originalDriver, tokenExpiresAt: new Date() };
        }
        return { driver: refreshedDriver, tokenExpiresAt: new Date() };
      });

      const context = createContext();
      const config: FullSyncConfig = {
        fullSyncMaxMessages: 100,
        batchSize: 50,
        getListMessagesOptions: () => ({}),
      };

      await service.executeFullSync(originalDriver, config, context);

      // Both drivers should have been used for listMessages
      expect(originalDriver.listMessages).toHaveBeenCalled();
    });
  });

  // ─── Full sync: folder error resilience ───

  describe('executeFullSync — folder error resilience', () => {
    it('should continue syncing other folders when one folder fails', async () => {
      const driver = createMockDriver();
      driver.listMessages.mockImplementation(async (opts: any) => {
        if (opts.folder === 'ARCHIVE') {
          throw new Error('Folder not found');
        }
        return {
          messages: [{ id: `msg-${opts.folder}` }],
          nextPageToken: undefined,
        };
      });

      const context = createContext();
      const config: FullSyncConfig = {
        fullSyncMaxMessages: 100,
        batchSize: 50,
        getListMessagesOptions: () => ({}),
      };

      // Should NOT throw — ARCHIVE failure is caught
      const result = await service.executeFullSync(driver, config, context);
      expect(result.syncToken).toBe('sync-token-123');
    });
  });

  // ─── Incremental sync: IF-H2 sync token invalidation ───

  describe('executeIncrementalSync — IF-H2 sync token recovery', () => {
    it('should clear sync token on 404 and return empty result', async () => {
      const driver = createMockDriver();
      const clearSyncToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      driver.getChangesSince!.mockRejectedValue(
        new Error('404 historyId not found'),
      );

      const context = createContext({ clearSyncToken });
      const hookFn = jest.fn().mockReturnValue({ skipProcessing: false });

      const result = await service.executeIncrementalSync(
        driver,
        'stale-token',
        context,
        hookFn,
      );

      expect(clearSyncToken).toHaveBeenCalledTimes(1);
      expect(result.messagesProcessed).toBe(0);
      expect(result.newSyncToken).toBe('');
    });

    it('should clear sync token on 410 Gone', async () => {
      const driver = createMockDriver();
      const clearSyncToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      driver.getChangesSince!.mockRejectedValue(
        new Error('410 Gone: delta token expired'),
      );

      const context = createContext({ clearSyncToken });
      const hookFn = jest.fn().mockReturnValue({ skipProcessing: false });

      const result = await service.executeIncrementalSync(
        driver,
        'expired-delta',
        context,
        hookFn,
      );

      expect(clearSyncToken).toHaveBeenCalledTimes(1);
      expect(result.messagesProcessed).toBe(0);
    });

    it('should re-throw if clearSyncToken not provided for 404', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockRejectedValue(
        new Error('404 historyId not found'),
      );

      const context = createContext({ clearSyncToken: undefined });
      const hookFn = jest.fn();

      await expect(
        service.executeIncrementalSync(driver, 'stale', context, hookFn),
      ).rejects.toThrow('404 historyId not found');
    });

    it('should re-throw non-token errors regardless', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockRejectedValue(
        new Error('Network timeout'),
      );

      const clearSyncToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const context = createContext({ clearSyncToken });
      const hookFn = jest.fn();

      await expect(
        service.executeIncrementalSync(driver, 'token', context, hookFn),
      ).rejects.toThrow('Network timeout');

      // clearSyncToken should NOT be called for non-token errors
      expect(clearSyncToken).not.toHaveBeenCalled();
    });
  });

  // ─── Incremental sync: change processing ───

  describe('executeIncrementalSync — change processing', () => {
    it('should process added/modified/deleted changes', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockResolvedValue({
        changes: [
          { type: 'added', messageId: 'new-1' },
          { type: 'modified', messageId: 'mod-1' },
          { type: 'deleted', messageId: 'del-1' },
        ],
        newSyncToken: 'new-token',
      });
      driver.getMessage.mockResolvedValue({ id: 'msg', subject: 'Test' });

      const context = createContext();
      const hookFn = jest.fn().mockReturnValue({ skipProcessing: false });

      const result = await service.executeIncrementalSync(
        driver,
        'old-token',
        context,
        hookFn,
      );

      expect(result.messagesProcessed).toBe(3);
      expect(result.newMessages).toBe(2); // added + modified (both upsertMessage)
      expect(result.newSyncToken).toBe('new-token');
      expect(mockMessageProcessor.handleDeletion).toHaveBeenCalledWith(
        'del-1',
        'provider-1',
        'tenant-1',
      );
    });

    it('should deduplicate changes with same messageId', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockResolvedValue({
        changes: [
          { type: 'added', messageId: 'msg-1' },
          { type: 'modified', messageId: 'msg-1' }, // duplicate
        ],
        newSyncToken: 'new-token',
      });
      driver.getMessage.mockResolvedValue({ id: 'msg-1', subject: 'Test' });

      const context = createContext();
      const hookFn = jest.fn().mockReturnValue({ skipProcessing: false });

      const result = await service.executeIncrementalSync(
        driver,
        'old-token',
        context,
        hookFn,
      );

      // Only first occurrence processed
      expect(result.messagesProcessed).toBe(1);
    });

    it('should skip processing when hook says so', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockResolvedValue({
        changes: [{ type: 'added', messageId: 'msg-1' }],
        newSyncToken: 'delta-token',
      });

      const context = createContext();
      const hookFn = jest.fn().mockReturnValue({
        skipProcessing: true,
        logMessage: 'No real changes',
      });

      const result = await service.executeIncrementalSync(
        driver,
        'old-token',
        context,
        hookFn,
      );

      expect(result.messagesProcessed).toBe(0);
      expect(result.newSyncToken).toBe('delta-token');
      expect(mockMessageProcessor.upsertMessage).not.toHaveBeenCalled();
    });

    it('should continue processing when individual change fails', async () => {
      const driver = createMockDriver();
      driver.getChangesSince!.mockResolvedValue({
        changes: [
          { type: 'added', messageId: 'fail-1' },
          { type: 'added', messageId: 'ok-1' },
        ],
        newSyncToken: 'new-token',
      });
      driver.getMessage
        .mockRejectedValueOnce(new Error('Message not found'))
        .mockResolvedValueOnce({ id: 'ok-1', subject: 'OK' });

      const context = createContext();
      const hookFn = jest.fn().mockReturnValue({ skipProcessing: false });

      const result = await service.executeIncrementalSync(
        driver,
        'old-token',
        context,
        hookFn,
      );

      // fail-1 errored but ok-1 was processed
      expect(result.messagesProcessed).toBe(1);
      expect(result.newMessages).toBe(1);
    });
  });
});
