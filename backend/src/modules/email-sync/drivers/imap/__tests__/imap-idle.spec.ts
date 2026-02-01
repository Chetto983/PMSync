import { Test, TestingModule } from '@nestjs/testing';
import { ImapIdleService } from '../services/imap-idle.service';
import { ImapFolderService } from '../services/imap-folder.service';
import { ImapConnectionPoolService } from '../services/imap-connection-pool.service';
import { ImapConfig } from '../interfaces/imap-internal.interface';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock ImapFlow
const mockImapFlowInstance = {
  connect: jest.fn().mockResolvedValue(undefined as void),
  logout: jest.fn().mockResolvedValue(undefined as void),
  mailboxOpen: jest.fn().mockResolvedValue({ path: 'INBOX', exists: 10 }),
  usable: true,
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  capabilities: new Set(['CONDSTORE', 'IDLE', 'SPECIAL-USE']),
};

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    ...mockImapFlowInstance,
    connect: jest.fn().mockResolvedValue(undefined as void),
    logout: jest.fn().mockResolvedValue(undefined as void),
    mailboxOpen: jest.fn().mockResolvedValue({ path: 'INBOX', exists: 10 }),
    usable: true,
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    capabilities: new Set(['CONDSTORE', 'IDLE', 'SPECIAL-USE']),
  })),
}));

describe('ImapIdleService', () => {
  let service: ImapIdleService;
  let folderService: ImapFolderService;
  const mockConfig: ImapConfig = {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    auth: { user: 'test@example.com', pass: 'password' },
  };

  beforeEach(async () => {
    const mockConnectionPool = {
      initialize: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
      withConnection: jest.fn().mockImplementation(async (fn) => fn({})),
    };

    const mockFolderService = {
      resolveFolder: jest.fn().mockResolvedValue('INBOX' as string),
      pathToCanonicalFolder: jest.fn().mockReturnValue('INBOX' as string),
      listFolders: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapIdleService,
        {
          provide: ImapConnectionPoolService,
          useValue: mockConnectionPool,
        },
        {
          provide: ImapFolderService,
          useValue: mockFolderService,
        },
      ],
    }).compile();

    service = module.get<ImapIdleService>(ImapIdleService);
    folderService = module.get<ImapFolderService>(ImapFolderService);
  });

  afterEach(async () => {
    await service.stopIdleSubscription();
  });

  describe('initialize', () => {
    it('should initialize with config', () => {
      service.initialize(mockConfig);
      expect(service.isInitialized()).toBe(true);
    });

    it('should not be initialized before calling initialize', () => {
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('subscribeToChanges', () => {
    beforeEach(() => {
      service.initialize(mockConfig);
    });

    it('should fail before initialization', async () => {
      const uninitializedService = new ImapIdleService(folderService);
      const callback = jest.fn();

      await expect(uninitializedService.subscribeToChanges(callback)).rejects.toThrow(
        'IDLE service not initialized',
      );
    });

    it('should subscribe to changes and return subscription handle', async () => {
      const callback = jest.fn();
      const subscription = await service.subscribeToChanges(callback, 'INBOX');

      expect(subscription).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe('function');
      expect(typeof subscription.isActive).toBe('function');
    });

    it('should resolve folder using folder service', async () => {
      const callback = jest.fn();
      await service.subscribeToChanges(callback, 'INBOX');

      expect(folderService.resolveFolder).toHaveBeenCalledWith('INBOX');
    });
  });

  describe('isActive', () => {
    beforeEach(() => {
      service.initialize(mockConfig);
    });

    it('should return false when not subscribed', () => {
      expect(service.isActive()).toBe(false);
    });

    it('should return true when subscribed', async () => {
      const callback = jest.fn();
      await service.subscribeToChanges(callback, 'INBOX');

      // State should be active (connection mock is usable)
      const state = service.getIdleState();
      expect(state.active).toBe(true);
    });
  });

  describe('stopIdleSubscription', () => {
    beforeEach(() => {
      service.initialize(mockConfig);
    });

    it('should stop subscription and clean up state', async () => {
      const callback = jest.fn();
      await service.subscribeToChanges(callback, 'INBOX');

      await service.stopIdleSubscription();

      const state = service.getIdleState();
      expect(state.active).toBe(false);
      expect(state.folder).toBeUndefined();
      expect(state.shouldReconnect).toBe(false);
    });

    it('should be safe to call multiple times', async () => {
      await service.stopIdleSubscription();
      await service.stopIdleSubscription();
      await service.stopIdleSubscription();

      // Should not throw
      expect(service.isActive()).toBe(false);
    });
  });

  describe('getIdleState', () => {
    beforeEach(() => {
      service.initialize(mockConfig);
    });

    it('should return initial state', () => {
      const state = service.getIdleState();

      expect(state.active).toBe(false);
      expect(state.folder).toBeUndefined();
      expect(state.reconnectAttempts).toBe(0);
      expect(state.shouldReconnect).toBe(false);
      expect(state.connectionUsable).toBe(false);
    });

    it('should return active state after subscription', async () => {
      const callback = jest.fn();
      await service.subscribeToChanges(callback, 'INBOX');

      const state = service.getIdleState();

      expect(state.active).toBe(true);
      expect(state.folder).toBe('INBOX');
      expect(state.reconnectAttempts).toBe(0);
      expect(state.shouldReconnect).toBe(true);
    });
  });

  describe('subscription unsubscribe', () => {
    beforeEach(() => {
      service.initialize(mockConfig);
    });

    it('should unsubscribe via subscription handle', async () => {
      const callback = jest.fn();
      const subscription = await service.subscribeToChanges(callback, 'INBOX');

      expect(service.isActive()).toBe(true);

      await subscription.unsubscribe();

      expect(service.isActive()).toBe(false);
    });
  });

  describe('reconnection constants', () => {
    it('should use correct reconnection constants', () => {
      // These are internal but we verify behavior through getIdleState
      service.initialize(mockConfig);

      const state = service.getIdleState();
      expect(state.reconnectAttempts).toBe(0);
    });
  });
});
