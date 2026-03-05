import { Test, TestingModule } from '@nestjs/testing';
import { ImapConnectionPoolService } from '../services/imap-connection-pool.service';
import { ImapConfig, POOL_CONFIG } from '../interfaces/imap-internal.interface';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock ImapFlow
jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    usable: true,
    capabilities: new Set(['CONDSTORE', 'IDLE', 'SPECIAL-USE']),
  })),
}));

describe('ImapConnectionPoolService', () => {
  let service: ImapConnectionPoolService;
  const mockConfig: ImapConfig = {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    auth: { user: 'test@example.com', pass: 'password' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImapConnectionPoolService],
    }).compile();

    service = await module.resolve<ImapConnectionPoolService>(ImapConnectionPoolService);
  });

  afterEach(async () => {
    await service.closeAll();
  });

  describe('initialize', () => {
    it('should initialize with config', async () => {
      await service.initialize(mockConfig);
      expect(service.isInitialized()).toBe(true);
      expect(service.getConfig()).toEqual(mockConfig);
    });

    it('should fail acquireConnection before initialization', async () => {
      await expect(service.acquireConnection()).rejects.toThrow(
        'Connection pool not initialized',
      );
    });
  });

  describe('withConnection', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should execute operation with a connection', async () => {
      const result = await service.withConnection(async (client) => {
        expect(client).toBeDefined();
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should release connection after operation', async () => {
      await service.withConnection(async () => 'test');
      const stats = service.getPoolStats();
      expect(stats.inUse).toBe(0);
    });

    it('should release connection on error', async () => {
      await expect(
        service.withConnection(async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      const stats = service.getPoolStats();
      expect(stats.inUse).toBe(0);
    });
  });

  describe('semaphore behavior', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should limit concurrent connections to maxConnectionsPerUser', async () => {
      const operations: Promise<void>[] = [];
      let concurrentCount = 0;
      let maxConcurrent = 0;

      for (let i = 0; i < POOL_CONFIG.maxConnectionsPerUser + 2; i++) {
        operations.push(
          service.withConnection(async () => {
            concurrentCount++;
            maxConcurrent = Math.max(maxConcurrent, concurrentCount);
            await new Promise((r) => setTimeout(r, 50));
            concurrentCount--;
          }),
        );
      }

      await Promise.all(operations);
      expect(maxConcurrent).toBeLessThanOrEqual(POOL_CONFIG.maxConnectionsPerUser);
    });
  });

  describe('capability detection', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should detect server capabilities', async () => {
      await service.withConnection(async () => {});
      const caps = service.getCapabilities();
      expect(caps.condstore).toBe(true);
      expect(caps.idle).toBe(true);
      expect(caps.specialUse).toBe(true);
    });

    it('should expose supportsCondstore helper', async () => {
      await service.withConnection(async () => {});
      expect(service.supportsCondstore()).toBe(true);
    });

    it('should expose supportsQresync helper', async () => {
      await service.withConnection(async () => {});
      // QRESYNC not in mock capabilities
      expect(service.supportsQresync()).toBe(false);
    });
  });

  describe('closeAll', () => {
    it('should close all connections', async () => {
      await service.initialize(mockConfig);
      await service.withConnection(async () => {});
      await service.closeAll();
      const stats = service.getPoolStats();
      expect(stats.total).toBe(0);
    });

    it('should reset capabilities on closeAll', async () => {
      await service.initialize(mockConfig);
      await service.withConnection(async () => {});
      expect(service.supportsCondstore()).toBe(true);

      await service.closeAll();
      expect(service.supportsCondstore()).toBe(false);
    });
  });

  describe('getPoolStats', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should return correct pool statistics', async () => {
      const initialStats = service.getPoolStats();
      expect(initialStats.total).toBe(0);
      expect(initialStats.inUse).toBe(0);
      expect(initialStats.maxConnections).toBe(POOL_CONFIG.maxConnectionsPerUser);

      // Create a connection
      let statsWhileInUse: ReturnType<typeof service.getPoolStats>;
      await service.withConnection(async () => {
        statsWhileInUse = service.getPoolStats();
      });

      // Check stats while connection was in use
      expect(statsWhileInUse!.inUse).toBe(1);
      expect(statsWhileInUse!.total).toBe(1);

      // Check stats after release
      const afterStats = service.getPoolStats();
      expect(afterStats.inUse).toBe(0);
      expect(afterStats.total).toBe(1); // Connection still in pool
    });
  });
});
