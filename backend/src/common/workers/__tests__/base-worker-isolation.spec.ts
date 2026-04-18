/**
 * T-1702: BaseWorker Error Isolation & Auto-Pause Tests
 *
 * Tests the IF-C1 error isolation pattern:
 * - Sliding window error tracking (5-minute window)
 * - Auto-pause after ERROR_THRESHOLD (10) errors
 * - Resume after PAUSE_COOLDOWN_MS (60 seconds)
 * - Stalled job tracking (IF-H4)
 * - Worker health status reporting
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { BaseWorker, BaseWorkerConfig, WorkerHealthStatus } from '../base.worker';

// ─── Concrete test implementation ───

class TestWorker extends BaseWorker<{ data: string }, string> {
  protected readonly logger = new Logger('TestWorker');
  protected readonly workerName = 'test-worker';
  protected readonly envToggle = 'TEST_WORKERS_ENABLED';

  // Expose internal methods for testing
  public exposeRecordError() {
    // Access private recordError via casting
    return (this as any).recordError.bind(this);
  }

  public exposeStalledTimestamps(): number[] {
    return (this as any).stalledTimestamps;
  }

  public exposeErrorTimestamps(): number[] {
    return (this as any).errorTimestamps;
  }

  public setAutoPaused(val: boolean) {
    (this as any)._autoPaused = val;
  }

  protected getWorkerConfig(): BaseWorkerConfig {
    return {
      queueName: 'test-queue',
      concurrency: 1,
    };
  }

  protected async processJob(job: Job<{ data: string }>): Promise<string> {
    return `processed: ${job.data.data}`;
  }
}

// ─── Tests ───

describe('BaseWorker — IF-C1 error isolation', () => {
  let worker: TestWorker;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('true') as any,
    };
    worker = new TestWorker(mockConfigService as ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('error tracking', () => {
    it('should count errors within the 5-minute window', () => {
      const recordError = worker.exposeRecordError();
      recordError();
      recordError();
      recordError();

      const status = worker.getStatus();
      expect(status.errorCount5m).toBe(3);
    });

    it('should exclude errors older than 5 minutes', () => {
      const timestamps = worker.exposeErrorTimestamps();
      // Inject old timestamps
      timestamps.push(Date.now() - 6 * 60 * 1000); // 6 min ago
      timestamps.push(Date.now() - 7 * 60 * 1000); // 7 min ago

      // Add fresh error to trigger pruning
      const recordError = worker.exposeRecordError();
      recordError();

      const status = worker.getStatus();
      // Only the 1 fresh error should count (old ones pruned)
      expect(status.errorCount5m).toBe(1);
    });
  });

  describe('auto-pause threshold', () => {
    it('should NOT auto-pause below 10 errors', () => {
      const recordError = worker.exposeRecordError();
      for (let i = 0; i < 9; i++) {
        recordError();
      }

      const status = worker.getStatus();
      expect(status.autoPaused).toBe(false);
      expect(status.autoPausedAt).toBeNull();
    });

    it('should auto-pause at exactly 10 errors', () => {
      // We need to mock the workers array to avoid calling bullmq .pause()
      (worker as any).workers = [
        { pause: jest.fn().mockResolvedValue(undefined), isRunning: () => true, isPaused: () => false, name: 'test-queue' },
      ];

      const recordError = worker.exposeRecordError();
      for (let i = 0; i < 10; i++) {
        recordError();
      }

      const status = worker.getStatus();
      expect(status.autoPaused).toBe(true);
      expect(status.autoPausedAt).not.toBeNull();
    });

    it('should call pause() on all workers when auto-pausing', () => {
      const mockPause = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      (worker as any).workers = [
        { pause: mockPause, isRunning: () => true, isPaused: () => false, name: 'q1' },
        { pause: mockPause, isRunning: () => true, isPaused: () => false, name: 'q2' },
      ];

      const recordError = worker.exposeRecordError();
      for (let i = 0; i < 10; i++) {
        recordError();
      }

      expect(mockPause).toHaveBeenCalledTimes(2);
    });

    it('should not re-pause if already paused', () => {
      const mockPause = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      (worker as any).workers = [
        { pause: mockPause, isRunning: () => true, isPaused: () => false, name: 'q1' },
      ];

      const recordError = worker.exposeRecordError();
      // Hit threshold
      for (let i = 0; i < 10; i++) {
        recordError();
      }
      expect(mockPause).toHaveBeenCalledTimes(1);

      // More errors shouldn't call pause again
      recordError();
      recordError();
      expect(mockPause).toHaveBeenCalledTimes(1);
    });
  });

  describe('stalled job tracking (IF-H4)', () => {
    it('should track stalled timestamps', () => {
      const stalledTimestamps = worker.exposeStalledTimestamps();
      stalledTimestamps.push(Date.now());
      stalledTimestamps.push(Date.now());

      const status = worker.getStatus();
      expect(status.stalledCount5m).toBe(2);
    });

    it('should prune old stalled timestamps', () => {
      const stalledTimestamps = worker.exposeStalledTimestamps();
      stalledTimestamps.push(Date.now() - 6 * 60 * 1000); // old
      stalledTimestamps.push(Date.now()); // fresh

      const status = worker.getStatus();
      expect(status.stalledCount5m).toBe(1);
    });
  });

  describe('getStatus()', () => {
    it('should return correct initial status', () => {
      const status = worker.getStatus();
      expect(status.name).toBe('test-worker');
      expect(status.enabled).toBe(true);
      expect(status.errorCount5m).toBe(0);
      expect(status.stalledCount5m).toBe(0);
      expect(status.autoPaused).toBe(false);
      expect(status.autoPausedAt).toBeNull();
      expect(status.queues).toEqual([]);
    });

    it('should report worker queue details', () => {
      (worker as any).workers = [
        {
          isRunning: () => true,
          isPaused: () => false,
          name: 'test-queue',
        },
      ];

      const status = worker.getStatus();
      expect(status.queues).toHaveLength(1);
      expect(status.queues[0]).toEqual({
        queueName: 'test-queue',
        running: true,
        paused: false,
        concurrency: 1,
      });
    });

    it('should report disabled when env toggle is false', () => {
      (mockConfigService.get as jest.Mock).mockReturnValue('false');
      const status = worker.getStatus();
      expect(status.enabled).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should generate correct idempotency key', () => {
      const key = (worker as any).generateIdempotencyKey('email-send', 'tenant-1', 'msg-123');
      expect(key).toBe('email-send:tenant-1:msg-123');
    });

    it('should generate correct lock key', () => {
      const key = (worker as any).generateLockKey('provider', 'prov-1');
      expect(key).toBe('lock:test-worker:provider:prov-1');
    });

    it('should validate matching provider types', () => {
      expect(() => {
        (worker as any).validateProviderType('google', 'google');
      }).not.toThrow();
    });

    it('should throw on provider type mismatch', () => {
      expect(() => {
        (worker as any).validateProviderType('google', 'microsoft', 'prov-1');
      }).toThrow('Provider type mismatch (prov-1)');
    });
  });

  describe('withTimeout', () => {
    it('should resolve within timeout', async () => {
      const result = await (worker as any).withTimeout(
        Promise.resolve('ok'),
        1000,
        'test-op',
      );
      expect(result).toBe('ok');
    });

    it('should reject after timeout', async () => {
      await expect(
        (worker as any).withTimeout(
          new Promise((resolve) => setTimeout(resolve, 500)),
          10,
          'slow-op',
        ),
      ).rejects.toThrow('slow-op timed out after 10ms');
    });
  });
});

// ─── Feature flag hierarchy tests (D-11 / D-12 / D-13) ───

describe('BaseWorker — Feature Flag Hierarchy (D-11/D-12/D-13)', () => {
  /**
   * Subclass that opts into a module-level toggle by overriding
   * getModuleToggle(). TestWorker (from above) returns null by default.
   */
  class ModuleToggleWorker extends TestWorker {
    protected getModuleToggle(): string | null {
      return 'TEST_MODULE_WORKERS_ENABLED';
    }
  }

  const buildConfig = (map: Record<string, string>): ConfigService =>
    ({
      get: jest.fn((key: string) => map[key]),
    }) as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('disables worker when WORKERS_ENABLED=false (Level 1 short-circuit)', () => {
    // Global off wins even if module and per-worker are explicitly on.
    const config = buildConfig({
      WORKERS_ENABLED: 'false',
      TEST_MODULE_WORKERS_ENABLED: 'true',
      TEST_WORKERS_ENABLED: 'true',
    });

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(false);
  });

  it('disables worker when module toggle is false (Level 2 short-circuit)', () => {
    // Global on, module off, per-worker on — module toggle wins.
    const config = buildConfig({
      WORKERS_ENABLED: 'true',
      TEST_MODULE_WORKERS_ENABLED: 'false',
      TEST_WORKERS_ENABLED: 'true',
    });

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(false);
  });

  it('disables worker when per-worker toggle is false (Level 3)', () => {
    // Global on, module on, per-worker off — per-worker wins.
    const config = buildConfig({
      WORKERS_ENABLED: 'true',
      TEST_MODULE_WORKERS_ENABLED: 'true',
      TEST_WORKERS_ENABLED: 'false',
    });

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(false);
  });

  it('enables worker when all three toggles are true', () => {
    const config = buildConfig({
      WORKERS_ENABLED: 'true',
      TEST_MODULE_WORKERS_ENABLED: 'true',
      TEST_WORKERS_ENABLED: 'true',
    });

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(true);
  });

  it('enables worker when no toggles are set (defaults to true at every level)', () => {
    // Nothing configured anywhere — all levels default to 'true'.
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(true);
  });

  it('skips module toggle when getModuleToggle() returns null', () => {
    // TestWorker (the base version) does NOT override getModuleToggle(),
    // so module toggle is null and the module-level env var is ignored
    // even if it would otherwise disable the worker.
    const config = buildConfig({
      WORKERS_ENABLED: 'true',
      TEST_MODULE_WORKERS_ENABLED: 'false', // should be ignored
      TEST_WORKERS_ENABLED: 'true',
    });

    const worker = new TestWorker(config);
    expect((worker as any).isEnabled()).toBe(true);
  });

  it('is case-insensitive for WORKERS_ENABLED (e.g. "FALSE")', () => {
    // Hierarchy implementation lowercases the string before comparing.
    const config = buildConfig({
      WORKERS_ENABLED: 'FALSE',
    });

    const worker = new ModuleToggleWorker(config);
    expect((worker as any).isEnabled()).toBe(false);
  });
});
