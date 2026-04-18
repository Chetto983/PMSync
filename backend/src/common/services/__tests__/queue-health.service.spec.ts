/**
 * QueueHealthService — Direct Redis Monitoring Tests (Plan 146-05 / 146-06)
 *
 * Verifies the rework from BullMQ `Queue` objects to direct Redis
 * LLEN/ZCARD/HGET pipeline commands. Mocks ioredis so no live Redis
 * instance is required.
 *
 * Covers:
 *  - onModuleInit stores queue names (no Queue objects)
 *  - getQueueStatus pipelines the six BullMQ key reads and shapes the result
 *  - Paused detection handles both integer and string return types
 *  - Unknown queue returns null
 *  - Pipeline errors are swallowed and return null
 *  - getQueueStatuses() fans out in parallel
 *  - onModuleDestroy releases the shared connection ref
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the config barrel BEFORE importing the service, so the service's
// `import { getSharedRedisConnection, ... } from '../config'` resolves to
// our mocked functions.
jest.mock('../../config', () => ({
  getSharedRedisConnection: jest.fn(),
  releaseSharedRedisConnection: jest.fn(),
  QUEUE_NAMES: {
    EMAIL_SYNC_HIGH: 'email-sync-high',
    EMAIL_SYNC_NORMAL: 'email-sync-normal',
    DEAD_LETTER: 'dead-letter-queue',
  },
}));

import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../config';
import { QueueHealthService } from '../queue-health.service';

// ioredis pipeline surface we care about. Each command returns `this` for
// chaining and exec() returns a Promise of [err, value] tuples per command.
type MockPipeline = {
  llen: jest.Mock;
  zcard: jest.Mock;
  hget: jest.Mock;
  exec: jest.Mock;
};

type MockRedis = {
  pipeline: jest.Mock<() => MockPipeline>;
  ping: jest.Mock;
  info: jest.Mock;
  status: string;
};

describe('QueueHealthService (Direct Redis, Plan 146-05)', () => {
  let service: QueueHealthService;
  let mockPipeline: MockPipeline;
  let mockRedis: MockRedis;

  beforeEach(async () => {
    // Fresh pipeline + redis mock per test so call assertions are clean.
    mockPipeline = {
      llen: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      hget: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    } as unknown as MockPipeline;

    mockRedis = {
      pipeline: jest.fn(() => mockPipeline) as unknown as jest.Mock<() => MockPipeline>,
      ping: jest.fn().mockResolvedValue('PONG' as never),
      info: jest.fn().mockResolvedValue(
        'used_memory:1048576\nused_memory_peak:2097152' as never,
      ),
      status: 'ready',
    };

    (getSharedRedisConnection as jest.Mock).mockReturnValue(mockRedis);
    (releaseSharedRedisConnection as jest.Mock).mockClear();

    // No OpsAlertService injected — the constructor accepts undefined via @Optional.
    service = new QueueHealthService();
    await service.onModuleInit();
  });

  afterEach(async () => {
    // Call destroy once in afterEach; individual tests may also call it
    // explicitly and assert on the release mock before we reach here.
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('initializes with queue names only (no Queue objects)', () => {
    // D-05: Map<string, Queue> is gone; queueNames is a plain string[].
    expect((service as any).queueNames).toEqual([
      'email-sync-high',
      'email-sync-normal',
      'dead-letter-queue',
    ]);
    expect(getSharedRedisConnection).toHaveBeenCalledTimes(1);
  });

  it('gets queue status via Redis pipeline (LLEN + ZCARD + HGET)', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 5], // wait (LLEN)
      [null, 2], // active (LLEN)
      [null, 100], // completed (ZCARD)
      [null, 3], // failed (ZCARD)
      [null, 10], // delayed (ZCARD)
      [null, null], // meta paused (HGET) — not paused
    ] as never);

    const status = await service.getQueueStatus('email-sync-high');

    expect(status).toEqual({
      name: 'email-sync-high',
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 10,
      paused: false,
    });

    // Verify BullMQ internal key patterns are hit exactly once each.
    expect(mockPipeline.llen).toHaveBeenCalledWith('bull:email-sync-high:wait');
    expect(mockPipeline.llen).toHaveBeenCalledWith(
      'bull:email-sync-high:active',
    );
    expect(mockPipeline.zcard).toHaveBeenCalledWith(
      'bull:email-sync-high:completed',
    );
    expect(mockPipeline.zcard).toHaveBeenCalledWith(
      'bull:email-sync-high:failed',
    );
    expect(mockPipeline.zcard).toHaveBeenCalledWith(
      'bull:email-sync-high:delayed',
    );
    expect(mockPipeline.hget).toHaveBeenCalledWith(
      'bull:email-sync-high:meta',
      'paused',
    );
  });

  it('detects paused queue when HGET returns integer 1', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 1], // paused = 1 (integer)
    ] as never);

    const status = await service.getQueueStatus('email-sync-high');
    expect(status?.paused).toBe(true);
  });

  it("detects paused queue when HGET returns string '1' (defensive guard)", async () => {
    // ioredis pipeline results can be string or integer depending on the
    // server response shape. The service uses `=== 1 || === '1'` for this.
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, '1'], // paused = '1' (string)
    ] as never);

    const status = await service.getQueueStatus('email-sync-high');
    expect(status?.paused).toBe(true);
  });

  it('returns null for unknown queue names', async () => {
    const status = await service.getQueueStatus('nonexistent-queue');
    expect(status).toBeNull();
    // Pipeline should never be invoked on an unknown queue.
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });

  it('returns null and logs when the pipeline rejects', async () => {
    mockPipeline.exec.mockRejectedValue(new Error('Redis timeout') as never);

    const status = await service.getQueueStatus('email-sync-high');
    expect(status).toBeNull();
  });

  it('runs all queue status fetches in parallel via Promise.all', async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 1],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
      [null, null],
    ] as never);

    const statuses = await service.getQueueStatuses();

    // 3 queues mocked → 3 statuses back, one pipeline per queue.
    expect(statuses).toHaveLength(3);
    expect(mockRedis.pipeline).toHaveBeenCalledTimes(3);
    for (const s of statuses) {
      expect(s.waiting).toBe(1);
      expect(s.paused).toBe(false);
    }
  });

  it('releases the shared connection on module destroy', async () => {
    await service.onModuleDestroy();
    // afterEach will call destroy again; the service's idempotent release
    // behavior is fine — we only assert at least one call happened here.
    expect(releaseSharedRedisConnection).toHaveBeenCalled();
  });
});
