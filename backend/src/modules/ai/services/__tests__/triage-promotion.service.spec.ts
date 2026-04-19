import { Test } from '@nestjs/testing';
import { TriagePromotionService } from '../triage-promotion.service';
import { TriageFeedbackService } from '../triage-feedback.service';
import { TriageOverrideService } from '../triage-override.service';
import { EmailAnalysisService } from '../email-analysis.service';
import { TriagePromotionQueueService } from '../triage-promotion.queue';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../../common/services/scheduled-jobs.queue';
import { PrismaService } from '../../../../prisma/prisma.service';

// ioredis is stubbed so getSharedRedisConnection returns a controllable Map-backed mock.
jest.mock('ioredis');
jest.mock('../../../../common/config/queue.config', () => {
  const store = new Map<string, string>();
  const redisMock = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    // Exposed so tests can pre-seed
    __store: store,
  };
  return {
    __esModule: true,
    QUEUE_NAMES: { TRIAGE_PROMOTE_OVERRIDES: 'triage-promote-overrides' },
    getSharedRedisConnection: jest.fn(() => redisMock),
    releaseSharedRedisConnection: jest.fn(),
    getSharedWorkerConnection: jest.fn(() => redisMock),
    releaseSharedWorkerConnection: jest.fn(),
    getDefaultJobOptions: jest.fn(() => ({})),
    __redisMock: redisMock,
  };
});

// Re-import the mocked config to access the Redis mock + store
// eslint-disable-next-line @typescript-eslint/no-require-imports
const queueConfig = require('../../../../common/config/queue.config');

describe('TriagePromotionService', () => {
  let service: TriagePromotionService;
  let scheduledJobsMock: { registerHandler: jest.Mock };
  let feedbackMock: { getSuggestions: jest.Mock };
  let queueMock: { enqueueDebounced: jest.Mock };
  let prismaMock: {
    emailTriageFeedback: { findMany: jest.Mock };
  };
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    jest.clearAllMocks();
    redisStore = queueConfig.__redisMock.__store as Map<string, string>;
    redisStore.clear();

    scheduledJobsMock = { registerHandler: jest.fn() };
    feedbackMock = { getSuggestions: jest.fn().mockResolvedValue([]) };
    queueMock = { enqueueDebounced: jest.fn().mockResolvedValue(undefined) };
    prismaMock = {
      emailTriageFeedback: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const mod = await Test.createTestingModule({
      providers: [
        TriagePromotionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TriageFeedbackService, useValue: feedbackMock },
        { provide: TriageOverrideService, useValue: {} },
        { provide: EmailAnalysisService, useValue: { invalidateCache: jest.fn() } },
        { provide: ScheduledJobsQueueService, useValue: scheduledJobsMock },
        { provide: TriagePromotionQueueService, useValue: queueMock },
      ],
    }).compile();
    service = mod.get(TriagePromotionService);
  });

  describe('W6 — constructor-time handler registration', () => {
    it('registers the TRIAGE_PROMOTION_SAFETY_NET handler in the constructor, not a lifecycle hook', () => {
      // Test.createTestingModule().compile() runs constructors but does NOT invoke onModuleInit
      // unless .init() is called. If the handler were registered in onModuleInit, the mock
      // would not have been called here.
      expect(scheduledJobsMock.registerHandler).toHaveBeenCalledTimes(1);
      expect(scheduledJobsMock.registerHandler.mock.calls[0][0]).toBe(
        ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET,
      );
      expect(typeof scheduledJobsMock.registerHandler.mock.calls[0][1]).toBe('function');
    });
  });

  describe('promoteOverrides — idempotency', () => {
    it('returns skipped=true when Redis key set within 5min ago', async () => {
      // Seed the Redis mock with a recent timestamp
      redisStore.set(`triage:last-promoted:t1`, String(Date.now() - 60_000)); // 1min ago
      const result = await service.promoteOverrides('t1');
      expect(result.skipped).toBe(true);
      expect(result.promoted).toBe(0);
      // Because we skipped, getSuggestions should NOT have been called
      expect(feedbackMock.getSuggestions).not.toHaveBeenCalled();
    });

    it('proceeds when Redis key is older than 5min', async () => {
      redisStore.set(`triage:last-promoted:t1`, String(Date.now() - 10 * 60_000)); // 10min ago
      const result = await service.promoteOverrides('t1');
      expect(result.skipped).toBe(false);
      expect(feedbackMock.getSuggestions).toHaveBeenCalledWith('t1');
    });

    it('stores lastPromotedAt after successful run', async () => {
      const result = await service.promoteOverrides('t1');
      expect(result.skipped).toBe(false);
      expect(redisStore.has('triage:last-promoted:t1')).toBe(true);
      const ts = Number(redisStore.get('triage:last-promoted:t1'));
      // Timestamp was written in the last few seconds
      expect(Date.now() - ts).toBeLessThan(5_000);
    });
  });

  describe('runSafetyNet — fan-out', () => {
    it('fans out one enqueueDebounced per distinct tenant with recent feedback', async () => {
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
        { tenantId: 'tenant-a' },
        { tenantId: 'tenant-b' },
        { tenantId: 'tenant-c' },
      ]);
      await service.runSafetyNet();
      expect(queueMock.enqueueDebounced).toHaveBeenCalledTimes(3);
      const tenantsCalled = queueMock.enqueueDebounced.mock.calls.map((c) => c[0]);
      expect(tenantsCalled).toEqual(expect.arrayContaining(['tenant-a', 'tenant-b', 'tenant-c']));
    });

    it('passes a jitter delayOverride in the [0, 60000) range', async () => {
      prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
        { tenantId: 't1' },
      ]);
      await service.runSafetyNet();
      expect(queueMock.enqueueDebounced).toHaveBeenCalledTimes(1);
      const secondArg = queueMock.enqueueDebounced.mock.calls[0][1];
      expect(secondArg).toHaveProperty('delayOverride');
      const jitter = secondArg.delayOverride as number;
      expect(jitter).toBeGreaterThanOrEqual(0);
      expect(jitter).toBeLessThan(60_000);
    });
  });
});
