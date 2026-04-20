/**
 * Plan 04 Task 2 B-4 — Phase 148 D-13 Prometheus side-effect coverage for
 * LabelAccuracyService. Exercises the @Optional metric DI seam installed in
 * Plan 03 with mock Counter/Gauge providers, asserting:
 *   - applyDelta increments the corrections counter exactly once per call
 *     (NOT once per windowKey — that's a transaction shape detail, not a metric)
 *   - sweeper/backfill TP credits surface as kind='tp_credited' (not raw 'tp')
 *   - negative-delta (rollover decrement) path does NOT increment the counter
 *   - runSweep refreshes all 3 gauges with micro-averaged values across all
 *     tenants (default: TRIAGE_METRICS_PER_TENANT=false → no tenant_id label)
 */

// Mock the shared Redis connection factory so runSweep's getRedis() path
// returns a Map-backed in-memory stub instead of opening a real socket.
jest.mock('../../../../common/config/queue.config', () => {
  const store = new Map<string, Set<string>>();
  const scalars = new Map<string, string>();
  const redisMock = {
    get: jest.fn(async (key: string) => scalars.get(key) ?? null),
    set: jest.fn(
      async (
        key: string,
        value: string,
        ..._rest: Array<string | number>
      ) => {
        scalars.set(key, value);
        return 'OK';
      },
    ),
    sismember: jest.fn(async (key: string, member: string) =>
      store.get(key)?.has(member) ? 1 : 0,
    ),
    sadd: jest.fn(async (key: string, member: string) => {
      let set = store.get(key);
      if (!set) {
        set = new Set();
        store.set(key, set);
      }
      const had = set.has(member);
      set.add(member);
      return had ? 0 : 1;
    }),
    expire: jest.fn(async () => 1),
    __store: store,
    __scalars: scalars,
  };
  return {
    __esModule: true,
    QUEUE_NAMES: { TRIAGE_ACCURACY_UPDATE: 'accuracy-update' },
    getSharedRedisConnection: jest.fn(() => redisMock),
    releaseSharedRedisConnection: jest.fn(),
    getSharedWorkerConnection: jest.fn(() => redisMock),
    releaseSharedWorkerConnection: jest.fn(),
    getDefaultJobOptions: jest.fn(() => ({})),
    __redisMock: redisMock,
  };
});

import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getToken } from '@willsoto/nestjs-prometheus';
import { LabelAccuracyService } from '../label-accuracy.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ScheduledJobsQueueService } from '../../../../common/services/scheduled-jobs.queue';

describe('LabelAccuracyService — Phase 148 D-13 Prometheus instrumentation', () => {
  let service: LabelAccuracyService;
  let counterInc: jest.Mock;
  let precisionSet: jest.Mock;
  let recallSet: jest.Mock;
  let f1Set: jest.Mock;

  const prismaMock: {
    $transaction: jest.Mock;
    labelAccuracyProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
    };
    labelAccuracySourceBreakdown: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
    };
    email: { findMany: jest.Mock };
    emailTriageFeedback: { findMany: jest.Mock; count: jest.Mock };
    userLabel: { findMany: jest.Mock };
  } = {
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(prismaMock),
    ),
    labelAccuracyProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      // Default micro-averaged stub: tp=10, fp=2, fn=3 → p=10/12, r=10/13
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { tp: 10, fp: 2, fn: 3 } }),
    },
    labelAccuracySourceBreakdown: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    email: { findMany: jest.fn().mockResolvedValue([]) },
    emailTriageFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
    },
    userLabel: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const originalEnv = process.env.TRIAGE_METRICS_PER_TENANT;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaMock),
    );
    prismaMock.labelAccuracyProfile.findUnique.mockResolvedValue(null);
    prismaMock.labelAccuracyProfile.upsert.mockResolvedValue({});
    prismaMock.labelAccuracyProfile.findMany.mockResolvedValue([]);
    prismaMock.labelAccuracyProfile.aggregate.mockResolvedValue({
      _sum: { tp: 10, fp: 2, fn: 3 },
    });
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
    prismaMock.email.findMany.mockResolvedValue([]);

    // Default: TRIAGE_METRICS_PER_TENANT off (global aggregate branch).
    delete process.env.TRIAGE_METRICS_PER_TENANT;

    counterInc = jest.fn();
    precisionSet = jest.fn();
    recallSet = jest.fn();
    f1Set = jest.fn();

    const mod = await Test.createTestingModule({
      providers: [
        LabelAccuracyService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ScheduledJobsQueueService,
          useValue: { registerHandler: jest.fn() },
        },
        EventEmitter2,
        {
          provide: getToken('triage_accuracy_corrections_total'),
          useValue: { inc: counterInc },
        },
        {
          provide: getToken('triage_accuracy_precision'),
          useValue: { set: precisionSet },
        },
        {
          provide: getToken('triage_accuracy_recall'),
          useValue: { set: recallSet },
        },
        {
          provide: getToken('triage_accuracy_f1'),
          useValue: { set: f1Set },
        },
      ],
    }).compile();
    service = mod.get(LabelAccuracyService);
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.TRIAGE_METRICS_PER_TENANT;
    } else {
      process.env.TRIAGE_METRICS_PER_TENANT = originalEnv;
    }
  });

  it('applyDelta: increments counter exactly once per call (not per windowKey)', async () => {
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: 1,
      signal: 'correction',
      triageSource: 'llm',
    });

    expect(counterInc).toHaveBeenCalledTimes(1);
    // safeInc invokes metric.inc(labels, value) — assert both args.
    expect(counterInc).toHaveBeenCalledWith(
      { signal: 'correction', triage_source: 'llm', kind: 'fp' },
      1,
    );
  });

  it('applyDelta: kind label is "tp_credited" when signal=system + kind=tp', async () => {
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'tp',
      delta: 1,
      signal: 'system',
    });

    expect(counterInc).toHaveBeenCalledTimes(1);
    expect(counterInc).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tp_credited' }),
      1,
    );
    // And NOT the raw 'tp' kind.
    expect(counterInc).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tp' }),
      1,
    );
  });

  it('applyDelta: raw "tp" kind label when signal != system (live event path)', async () => {
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'tp',
      delta: 1,
      signal: 'correction',
    });

    expect(counterInc).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tp' }),
      1,
    );
  });

  it('applyDelta: does NOT increment counter on negative delta (rollover-decrement excluded)', async () => {
    prismaMock.labelAccuracyProfile.findUnique.mockResolvedValue({
      tp: 5,
      fp: 0,
      fn: 0,
      sampleSize: 5,
      precision: 1,
      recall: 1,
      f1: 1,
      lastUpdatedAt: new Date(),
    });

    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: -1,
      signal: 'edit',
    });

    expect(counterInc).not.toHaveBeenCalled();
  });

  it('runSweep: refreshes gauges with micro-averaged values (default: aggregated over all tenants)', async () => {
    await service.runSweep();

    // One set() per gauge per windowKey (3 windows → 3 calls each).
    expect(precisionSet).toHaveBeenCalledTimes(3);
    expect(recallSet).toHaveBeenCalledTimes(3);
    expect(f1Set).toHaveBeenCalledTimes(3);

    for (const call of precisionSet.mock.calls) {
      const labels = call[0] as Record<string, string>;
      const value = call[1] as number;
      expect(['7d', '30d', 'all']).toContain(labels.window);
      // TRIAGE_METRICS_PER_TENANT off → no tenant_id label.
      expect(labels).not.toHaveProperty('tenant_id');
      // Micro-average: tp=10, fp=2 → precision = 10/12.
      expect(value).toBeCloseTo(10 / 12, 3);
    }
    for (const call of recallSet.mock.calls) {
      const value = call[1] as number;
      // Recall = 10 / (10 + 3) = 10/13.
      expect(value).toBeCloseTo(10 / 13, 3);
    }
  });

  it('runSweep: refreshes per-tenant gauges when TRIAGE_METRICS_PER_TENANT=true', async () => {
    process.env.TRIAGE_METRICS_PER_TENANT = 'true';
    // Re-build module so the env-gated labelNames take effect on this run only.
    counterInc = jest.fn();
    precisionSet = jest.fn();
    recallSet = jest.fn();
    f1Set = jest.fn();
    prismaMock.labelAccuracyProfile.findMany.mockResolvedValue([
      { tenantId: 'tA', tp: 8, fp: 2, fn: 2 },
      { tenantId: 'tB', tp: 4, fp: 1, fn: 0 },
    ]);
    const mod = await Test.createTestingModule({
      providers: [
        LabelAccuracyService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ScheduledJobsQueueService,
          useValue: { registerHandler: jest.fn() },
        },
        EventEmitter2,
        {
          provide: getToken('triage_accuracy_corrections_total'),
          useValue: { inc: counterInc },
        },
        {
          provide: getToken('triage_accuracy_precision'),
          useValue: { set: precisionSet },
        },
        {
          provide: getToken('triage_accuracy_recall'),
          useValue: { set: recallSet },
        },
        {
          provide: getToken('triage_accuracy_f1'),
          useValue: { set: f1Set },
        },
      ],
    }).compile();
    service = mod.get(LabelAccuracyService);

    await service.runSweep();

    // 2 tenants × 3 windows = 6 set() calls per gauge.
    expect(precisionSet).toHaveBeenCalledTimes(6);
    for (const call of precisionSet.mock.calls) {
      const labels = call[0] as Record<string, string>;
      expect(labels).toHaveProperty('tenant_id');
      expect(['tA', 'tB']).toContain(labels.tenant_id);
      expect(['7d', '30d', 'all']).toContain(labels.window);
    }
  });
});
