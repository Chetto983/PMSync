/**
 * Phase 147 Plan 05 Task 2 — Plumbing verification spec.
 *
 * W5 honesty note: this is a PLUMBING spec. Every dependency is mocked
 * (feedback, override, analysis, scheduled-jobs, Redis, Prisma). It verifies
 * the SEAMS between TriagePromotionService and its collaborators are wired
 * correctly, NOT that an end-to-end request through a running server + real
 * DB + real Redis + real BullMQ behaves correctly. True end-to-end
 * validation remains a Railway smoke test (documented in the Plan 05 SUMMARY).
 *
 * Scenarios covered:
 *   1. label_correction suggestions do NOT mint TriageOverride (D-05a plumbing)
 *   2. lane_correction suggestion with lane target mints TriageOverride + invalidates cache
 *   3. idempotency: second call within 5min window returns skipped=true
 *   4. domain-scope suggestion invalidates cache using the `contains: '@<domain>'` filter
 */
import { Test } from '@nestjs/testing';
import { TriagePromotionService } from '../triage-promotion.service';
import { TriageFeedbackService } from '../triage-feedback.service';
import { TriageOverrideService } from '../triage-override.service';
import { EmailAnalysisService } from '../email-analysis.service';
import { TriagePromotionQueueService } from '../triage-promotion.queue';
import { ScheduledJobsQueueService } from '../../../../common/services/scheduled-jobs.queue';
import { PrismaService } from '../../../../prisma/prisma.service';

// Mock the queue-config module so TriagePromotionService.getRedis() receives
// a controllable Map-backed Redis stub instead of a real ioredis client.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const queueConfig = require('../../../../common/config/queue.config');

describe('Triage feedback-loop plumbing verification (Phase 147 — plumbing, not integration)', () => {
  let promotionService: TriagePromotionService;
  let prismaMock: {
    email: { findMany: jest.Mock };
    emailTriageFeedback: { findMany: jest.Mock };
  };
  let feedbackMock: { getSuggestions: jest.Mock };
  let overrideMock: { addOverride: jest.Mock };
  let analysisMock: { invalidateCache: jest.Mock };
  let queueMock: { enqueueDebounced: jest.Mock };
  let scheduledMock: { registerHandler: jest.Mock };
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    jest.clearAllMocks();
    redisStore = queueConfig.__redisMock.__store as Map<string, string>;
    redisStore.clear();

    prismaMock = {
      email: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'email-1' },
          { id: 'email-2' },
          { id: 'email-3' },
        ]),
      },
      emailTriageFeedback: { findMany: jest.fn().mockResolvedValue([]) },
    };

    feedbackMock = { getSuggestions: jest.fn() };
    overrideMock = { addOverride: jest.fn().mockResolvedValue({ id: 'override-1' }) };
    analysisMock = { invalidateCache: jest.fn().mockResolvedValue(3) };
    // WR-02: TriagePromotionService now registers its worker handler on the
    // queue at construction time via registerHandler (one-way, breaks the
    // previous forwardRef cycle). Mock accepts the registration call.
    queueMock = {
      enqueueDebounced: jest.fn().mockResolvedValue(undefined),
      registerHandler: jest.fn(),
    } as unknown as { enqueueDebounced: jest.Mock };
    scheduledMock = { registerHandler: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        TriagePromotionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TriageFeedbackService, useValue: feedbackMock },
        { provide: TriageOverrideService, useValue: overrideMock },
        { provide: EmailAnalysisService, useValue: analysisMock },
        { provide: ScheduledJobsQueueService, useValue: scheduledMock },
        { provide: TriagePromotionQueueService, useValue: queueMock },
      ],
    }).compile();
    promotionService = mod.get(TriagePromotionService);
  });

  it('Scenario 1 — label_correction suggestions do NOT mint TriageOverride (D-05a plumbing)', async () => {
    // Phase 147 default: label corrections target label names (not lane names).
    // LANE_TO_ACTION returns undefined for "Work" → loop skips → no override minted.
    feedbackMock.getSuggestions.mockResolvedValue([
      {
        scope: 'sender',
        pattern: 'boss@acme.com',
        target: 'Work', // label name — NOT a lane
        count: 3,
        totalAtScope: 3,
      },
    ]);

    const result = await promotionService.promoteOverrides('t1');

    expect(result).toEqual({ promoted: 0, skipped: false });
    expect(feedbackMock.getSuggestions).toHaveBeenCalledWith('t1');
    expect(overrideMock.addOverride).not.toHaveBeenCalled();
    expect(analysisMock.invalidateCache).not.toHaveBeenCalled();
    // Redis idempotency timestamp WAS written (successful no-op run).
    expect(redisStore.has('triage:last-promoted:t1')).toBe(true);
  });

  it('Scenario 2 — lane_correction suggestion with lane target mints TriageOverride + invalidates cache (forward-compat)', async () => {
    // Forward-compat for Phase 148: when lane_correction capture ships, suggestions
    // whose `target` is a lane name (e.g., 'action-now') auto-promote via LANE_TO_ACTION.
    feedbackMock.getSuggestions.mockResolvedValue([
      {
        scope: 'sender',
        pattern: 'boss@acme.com',
        target: 'action-now', // lane → maps to 'always-important'
        count: 3,
        totalAtScope: 3,
      },
    ]);

    const result = await promotionService.promoteOverrides('t1');

    expect(result).toEqual({ promoted: 1, skipped: false });

    // Seam 1: override minted with the correctly-mapped action.
    expect(overrideMock.addOverride).toHaveBeenCalledTimes(1);
    expect(overrideMock.addOverride).toHaveBeenCalledWith(
      't1',
      'sender',
      'boss@acme.com',
      'always-important',
    );

    // Seam 2: cache invalidated with the affected email IDs for tenantId: 't1'.
    expect(analysisMock.invalidateCache).toHaveBeenCalledTimes(1);
    expect(analysisMock.invalidateCache).toHaveBeenCalledWith(
      't1',
      expect.arrayContaining(['email-1', 'email-2', 'email-3']),
    );

    // Seam 3: the findMany that located affected emails used tenantId + sender-equals filter.
    expect(prismaMock.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          from: expect.objectContaining({ equals: 'boss@acme.com' }),
        }),
        select: { id: true },
      }),
    );
  });

  it('Scenario 3 — idempotency: second call within 5min returns skipped=true and does not consult feedback', async () => {
    feedbackMock.getSuggestions.mockResolvedValue([]);

    const first = await promotionService.promoteOverrides('t1');
    expect(first.skipped).toBe(false);
    expect(feedbackMock.getSuggestions).toHaveBeenCalledTimes(1);

    const second = await promotionService.promoteOverrides('t1');
    expect(second.skipped).toBe(true);
    expect(second.promoted).toBe(0);

    // Idempotency short-circuits BEFORE feedback consultation — getSuggestions count
    // must still be 1 (no second call).
    expect(feedbackMock.getSuggestions).toHaveBeenCalledTimes(1);
    expect(overrideMock.addOverride).not.toHaveBeenCalled();
    expect(analysisMock.invalidateCache).not.toHaveBeenCalled();
  });

  it('Scenario 4 — domain-scope suggestion invalidates cache using the `contains: "@<domain>"` filter', async () => {
    feedbackMock.getSuggestions.mockResolvedValue([
      {
        scope: 'domain',
        pattern: 'acme.com',
        target: 'action-now',
        count: 8,
        totalAtScope: 8,
      },
    ]);

    await promotionService.promoteOverrides('t1');

    // Override minted with scope='domain' + action='always-important'.
    expect(overrideMock.addOverride).toHaveBeenCalledWith(
      't1',
      'domain',
      'acme.com',
      'always-important',
    );

    // Cache invalidation email-lookup uses `contains: '@acme.com'` (insensitive),
    // every query tenant-scoped (tenantId: 't1').
    expect(prismaMock.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          from: expect.objectContaining({
            contains: '@acme.com',
            mode: 'insensitive',
          }),
        }),
        select: { id: true },
      }),
    );

    expect(analysisMock.invalidateCache).toHaveBeenCalledWith(
      't1',
      expect.arrayContaining(['email-1', 'email-2', 'email-3']),
    );
  });
});
