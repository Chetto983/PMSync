import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TriageLearningService, TriageSignal } from '../triage-learning.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

function createMockRedis() {
  return {
    rpush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    llen: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue([]),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    scan: jest.fn().mockResolvedValue(['0', []]),
    pipeline: jest.fn(),
  };
}

const mockRedis = createMockRedis();

const mockRedisConnection = {
  client: mockRedis,
};

// Mock ConfigService — returns default '14' for TRIAGE_DECAY_HALF_LIFE_DAYS
// (Phase 149 D-02: injected into TriageLearningService for time-aware EMA).
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => defaultValue ?? '14'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(overrides: Partial<TriageSignal> = {}): TriageSignal {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    emailId: 'email-1',
    senderEmail: 'alice@example.com',
    signalType: 'reply',
    responseTimeMs: 5000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TriageLearningService (Redis externalization)', () => {
  let service: TriageLearningService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mock implementations to defaults
    Object.assign(mockRedis, createMockRedis());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageLearningService,
        { provide: RedisConnectionService, useValue: mockRedisConnection },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TriageLearningService>(TriageLearningService);
    // Trigger onModuleInit to wire the redis client
    service.onModuleInit();
  });

  afterEach(async () => {
    // Prevent periodic flush from leaking across tests
    await service.onModuleDestroy();
  });

  describe('shutdown safety', () => {
    it('should no-op on destroy when module init never ran', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TriageLearningService,
          { provide: RedisConnectionService, useValue: mockRedisConnection },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const uninitializedService = module.get<TriageLearningService>(TriageLearningService);

      await expect(uninitializedService.onModuleDestroy()).resolves.toBeUndefined();
      expect(mockRedis.scan).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 1. recordSignal pushes to Redis list
  // -----------------------------------------------------------------------
  describe('recordSignal pushes to Redis list', () => {
    it('should rpush the signal JSON to the correct Redis key', async () => {
      const signal = makeSignal();
      await service.recordSignal(signal);

      const expectedKey = `triage:signal-buffer:tenant-1:alice@example.com`;
      expect(mockRedis.rpush).toHaveBeenCalledWith(
        expectedKey,
        JSON.stringify(signal),
      );
    });

    it('should set a 600s TTL on the buffer key', async () => {
      const signal = makeSignal();
      await service.recordSignal(signal);

      const expectedKey = `triage:signal-buffer:tenant-1:alice@example.com`;
      expect(mockRedis.expire).toHaveBeenCalledWith(expectedKey, 600);
    });
  });

  // -----------------------------------------------------------------------
  // 2. recordSignal triggers flush at threshold
  // -----------------------------------------------------------------------
  describe('recordSignal triggers flush at threshold', () => {
    it('should drain via Lua eval on the 5th signal (FLUSH_THRESHOLD=5)', async () => {
      // Mock llen to return incrementing counts
      let callCount = 0;
      mockRedis.llen.mockImplementation(async () => {
        callCount++;
        return callCount;
      });

      // The Lua drain returns stringified signals
      const signals = Array.from({ length: 5 }, (_, i) =>
        makeSignal({ emailId: `email-${i}` }),
      );
      mockRedis.eval.mockResolvedValue(
        signals.map((s) => JSON.stringify(s)),
      );

      for (const signal of signals) {
        await service.recordSignal(signal);
      }

      // On the 5th call, llen returns 5 which >= FLUSH_THRESHOLD
      expect(mockRedis.eval).toHaveBeenCalled();

      // After drain, the score should be persisted via hset
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'triage:sender-scores:tenant-1',
        'alice@example.com',
        expect.any(String),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. getSenderBehavior reads directly from Redis
  // -----------------------------------------------------------------------
  describe('getSenderBehavior reads directly from Redis', () => {
    it('should call hget with the correct score key and field', async () => {
      mockRedis.hget.mockResolvedValue(
        JSON.stringify({
          replyRate: 0.8,
          avgResponseTimeMs: 3000,
          archiveWithoutReplyRate: 0.1,
          flagRate: 0.05,
          totalSignals: 10,
          lastUpdated: '2026-03-31T00:00:00Z',
        }),
      );

      const result = await service.getSenderBehavior(
        'tenant-1',
        'alice@example.com',
      );

      expect(mockRedis.hget).toHaveBeenCalledWith(
        'triage:sender-scores:tenant-1',
        'alice@example.com',
      );
      expect(result).not.toBeNull();
      expect(result!.replyRate).toBe(0.8);
    });

    it('should NOT use any in-memory Map cache', async () => {
      // Call twice with same args: hget should be called both times
      // (no in-memory cache short-circuiting)
      mockRedis.hget.mockResolvedValue(
        JSON.stringify({
          replyRate: 0.5,
          avgResponseTimeMs: 1000,
          archiveWithoutReplyRate: 0,
          flagRate: 0,
          totalSignals: 5,
          lastUpdated: '2026-03-31T00:00:00Z',
        }),
      );

      await service.getSenderBehavior('tenant-1', 'bob@example.com');
      await service.getSenderBehavior('tenant-1', 'bob@example.com');

      // If there were in-memory caching, the second call would skip hget
      expect(mockRedis.hget).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 4. flushAllBuffers uses SCAN to find buffer keys
  // -----------------------------------------------------------------------
  describe('flushAllBuffers uses Redis SCAN', () => {
    it('should scan for triage:signal-buffer:* keys and drain each', async () => {
      const bufferKey = 'triage:signal-buffer:tenant-1:alice@example.com';
      // First scan call returns one key, second returns empty (cursor '0')
      mockRedis.scan
        .mockResolvedValueOnce(['0', [bufferKey]])
        .mockResolvedValue(['0', []]);

      const signals = [makeSignal()];
      mockRedis.eval.mockResolvedValue(
        signals.map((s) => JSON.stringify(s)),
      );

      // Access private method via service cast
      await (service as any).flushAllBuffers();

      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'triage:signal-buffer:*',
        'COUNT',
        100,
      );

      // Each found key should be drained via eval (Lua script)
      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });
});
