import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService, CacheNamespace } from './cache.service';
import {describe, it, expect, beforeEach, jest, afterEach} from '@jest/globals';

describe('CacheService', () => {
  let service: CacheService;
  let _configService: ConfigService;

  // Mock Redis client
  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    mGet: jest.fn(),
    multi: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      setEx: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    incr: jest.fn(),
    decr: jest.fn(),
    flushDb: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(async () => {
    // Mock createClient to return our mock
    jest.mock('redis', () => ({
      createClient: jest.fn(() => mockRedisClient),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: 'testpass',
                REDIS_DB: 0,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    _configService = module.get<ConfigService>(ConfigService);

    // Manually set the client for testing
    (service as any).client = mockRedisClient;
    (service as any).isConnected = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report healthy when connected', () => {
      // Service is manually set to connected in beforeEach
      expect(service.isHealthy()).toBe(true);
    });

    it('should report unhealthy when not connected', () => {
      (service as any).isConnected = false;
      expect(service.isHealthy()).toBe(false);
    });
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const testData = { foo: 'bar' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should get value with namespace', async () => {
      const testData = { token: 'abc123' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get('provider-123', {
        namespace: CacheNamespace.PROVIDER_TOKEN,
      });

      expect(result).toEqual(testData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('provider:token:provider-123');
    });

    it('should return null for missing key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('missing-key');

      expect(result).toBeNull();
    });

    it('should return null when Redis is not connected', async () => {
      (service as any).isConnected = false;

      const result = await service.get('test-key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json{');

      const result = await service.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache', async () => {
      const testData = { foo: 'bar' };
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.set('test-key', testData);

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', JSON.stringify(testData));
    });

    it('should set value with TTL', async () => {
      const testData = { foo: 'bar' };
      mockRedisClient.setEx.mockResolvedValue('OK');

      const result = await service.set('test-key', testData, { ttl: 300 });

      expect(result).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test-key',
        300,
        JSON.stringify(testData),
      );
    });

    it('should set value with namespace', async () => {
      const testData = { email: 'test@example.com' };
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.set('provider-123', testData, {
        namespace: CacheNamespace.PROVIDER_METADATA,
      });

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'provider:meta:provider-123',
        JSON.stringify(testData),
      );
    });

    it('should return false when Redis is not connected', async () => {
      (service as any).isConnected = false;

      const result = await service.set('test-key', { foo: 'bar' });

      expect(result).toBe(false);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delete value from cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete value with namespace', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del('provider-123', {
        namespace: CacheNamespace.PROVIDER_TOKEN,
      });

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('provider:token:provider-123');
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists('missing-key');

      expect(result).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should get TTL for key', async () => {
      mockRedisClient.ttl.mockResolvedValue(300);

      const result = await service.ttl('test-key');

      expect(result).toBe(300);
      expect(mockRedisClient.ttl).toHaveBeenCalledWith('test-key');
    });

    it('should return -1 for key with no expiry', async () => {
      mockRedisClient.ttl.mockResolvedValue(-1);

      const result = await service.ttl('test-key');

      expect(result).toBe(-1);
    });

    it('should return -2 for non-existent key', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);

      const result = await service.ttl('missing-key');

      expect(result).toBe(-2);
    });
  });

  describe('invalidateNamespace', () => {
    it('should invalidate all keys in namespace', async () => {
      const keys = ['provider:token:1', 'provider:token:2', 'provider:token:3'];
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(3);

      const result = await service.invalidateNamespace(CacheNamespace.PROVIDER_TOKEN);

      expect(result).toBe(3);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('provider:token:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('should return 0 when no keys found', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await service.invalidateNamespace(CacheNamespace.PROVIDER_TOKEN);

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('mget', () => {
    it('should get multiple values', async () => {
      const values = [JSON.stringify({ id: 1 }), JSON.stringify({ id: 2 }), null];
      mockRedisClient.mGet.mockResolvedValue(values);

      const result = await service.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual([{ id: 1 }, { id: 2 }, null]);
      expect(mockRedisClient.mGet).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.mget([]);

      expect(result).toEqual([]);
      expect(mockRedisClient.mGet).not.toHaveBeenCalled();
    });
  });

  describe('mset', () => {
    it('should set multiple values', async () => {
      const entries = [
        { key: 'key1', value: { id: 1 } },
        { key: 'key2', value: { id: 2 } },
      ];

      const result = await service.mset(entries);

      expect(result).toBe(true);
      expect(mockRedisClient.multi).toHaveBeenCalled();
    });

    it('should set multiple values with TTL', async () => {
      const entries = [
        { key: 'key1', value: { id: 1 } },
        { key: 'key2', value: { id: 2 } },
      ];

      const result = await service.mset(entries, { ttl: 300 });

      expect(result).toBe(true);
      expect(mockRedisClient.multi).toHaveBeenCalled();
    });
  });

  describe('incr/decr', () => {
    it('should increment counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.incr('counter');

      expect(result).toBe(1);
      expect(mockRedisClient.incr).toHaveBeenCalledWith('counter');
    });

    it('should decrement counter', async () => {
      mockRedisClient.decr.mockResolvedValue(0);

      const result = await service.decr('counter');

      expect(result).toBe(0);
      expect(mockRedisClient.decr).toHaveBeenCalledWith('counter');
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
      await service.get('key1');

      mockRedisClient.get.mockResolvedValue(null);
      await service.get('key2');

      const stats = service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track sets and deletes', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      await service.set('key1', { foo: 'bar' });

      mockRedisClient.del.mockResolvedValue(1);
      await service.del('key1');

      const stats = service.getStats();
      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(1);
    });

    it('should reset stats', () => {
      service.resetStats();

      const stats = service.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should return true when connected', () => {
      (service as any).isConnected = true;

      expect(service.isHealthy()).toBe(true);
    });

    it('should return false when not connected', () => {
      (service as any).isConnected = false;

      expect(service.isHealthy()).toBe(false);
    });

    it('should ping Redis', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const result = await service.ping();

      expect(result).toBe(true);
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should close connections on module destroy', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
