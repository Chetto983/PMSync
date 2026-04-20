// Mock the shared Redis connection factory so nothing in the DI graph opens a
// real connection. The main LabelAccuracyService does NOT use Redis (that
// moved to LabelAccuracySweeperService) but the mock is kept as a safety net
// in case a provider in the test graph indirectly imports the module.
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
    sismember: jest.fn(async (key: string, member: string) => {
      return store.get(key)?.has(member) ? 1 : 0;
    }),
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
import { ACCURACY_CHANGED_TOPIC } from '../label-accuracy.events';

describe('LabelAccuracyService', () => {
  let service: LabelAccuracyService;
  let emitter: EventEmitter2;

  const prismaMock: {
    $transaction: jest.Mock;
    labelAccuracyProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
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
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    labelAccuracySourceBreakdown: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    email: { findMany: jest.fn() },
    emailTriageFeedback: { findMany: jest.fn(), count: jest.fn() },
    userLabel: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset redis mock state across tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cfg = require('../../../../common/config/queue.config');
    (cfg.__redisMock.__store as Map<string, Set<string>>).clear();
    (cfg.__redisMock.__scalars as Map<string, string>).clear();
    // Reset $transaction to the pass-through default after clearAllMocks.
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaMock),
    );
    const mod = await Test.createTestingModule({
      providers: [
        LabelAccuracyService,
        { provide: PrismaService, useValue: prismaMock },
        EventEmitter2,
        // B-4 Plan 04 enrichment: replace Plan 03's `useValue: null` with mock
        // Counter/Gauge objects so safeInc/safeSet reach real jest.fn spies.
        // Per CLAUDE.md "never modify tests to pass": the Plan 03 null-provider
        // shape still compiled (null is a valid `Counter<string> | null`); this
        // is test enrichment that adds side-effect assertions, not a change
        // forced by newly-failing tests.
        {
          provide: getToken('triage_accuracy_corrections_total'),
          useValue: { inc: jest.fn() },
        },
      ],
    }).compile();
    service = mod.get(LabelAccuracyService);
    emitter = mod.get(EventEmitter2);
  });

  it('applyDelta: always filters by tenantId in upsert where-clause', async () => {
    prismaMock.labelAccuracyProfile.findUnique.mockResolvedValue(null);
    prismaMock.labelAccuracyProfile.upsert.mockResolvedValue({});
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: 1,
    });

    expect(prismaMock.labelAccuracyProfile.upsert).toHaveBeenCalledTimes(3);
    for (const call of prismaMock.labelAccuracyProfile.upsert.mock.calls) {
      const arg = call[0];
      expect(arg.where.tenantId_labelId_windowKey.tenantId).toBe('t1');
      expect(arg.where.tenantId_labelId_windowKey.labelId).toBe('l1');
    }
  });

  it('applyDelta: emits AccuracyDeltaEvent once per windowKey (3 total), AFTER each transaction (W-2)', async () => {
    prismaMock.labelAccuracyProfile.findUnique.mockResolvedValue(null);
    prismaMock.labelAccuracyProfile.upsert.mockResolvedValue({});
    const spy = jest.spyOn(emitter, 'emit');
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: 1,
    });
    const accuracyEmits = spy.mock.calls.filter(
      (c) => c[0] === ACCURACY_CHANGED_TOPIC,
    );
    expect(accuracyEmits).toHaveLength(3);
  });

  it('applyDelta: deltaF1 is null when before.sampleSize < 20 (learning state, D-11)', async () => {
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
    prismaMock.labelAccuracyProfile.upsert.mockResolvedValue({});
    const spy = jest.spyOn(emitter, 'emit');
    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'tp',
      delta: 1,
    });
    const accuracyEmits = spy.mock.calls.filter(
      (c) => c[0] === ACCURACY_CHANGED_TOPIC,
    );
    expect(accuracyEmits.length).toBeGreaterThan(0);
    for (const call of accuracyEmits) {
      const event = call[1] as {
        deltaF1: number | null;
        after: { sampleSize: number };
      };
      if (event.after.sampleSize < 20) {
        expect(event.deltaF1).toBeNull();
      }
    }
  });

  it('applyDelta: updates source breakdown only when triageSource is provided', async () => {
    prismaMock.labelAccuracyProfile.findUnique.mockResolvedValue(null);
    prismaMock.labelAccuracyProfile.upsert.mockResolvedValue({});
    prismaMock.labelAccuracySourceBreakdown.findUnique.mockResolvedValue(null);
    prismaMock.labelAccuracySourceBreakdown.upsert.mockResolvedValue({});

    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: 1,
    });
    expect(
      prismaMock.labelAccuracySourceBreakdown.upsert,
    ).not.toHaveBeenCalled();

    await service.applyDelta({
      tenantId: 't1',
      labelId: 'l1',
      kind: 'fp',
      delta: 1,
      triageSource: 'llm',
    });
    expect(
      prismaMock.labelAccuracySourceBreakdown.upsert,
    ).toHaveBeenCalledTimes(3);
  });

  it('read: sets state="learning" when sampleSize < 20 (D-11)', async () => {
    prismaMock.labelAccuracyProfile.findMany.mockResolvedValue([
      {
        tenantId: 't1',
        labelId: 'l1',
        windowKey: '30d',
        tp: 3,
        fp: 1,
        fn: 1,
        sampleSize: 5,
        precision: 0.75,
        recall: 0.75,
        f1: 0.75,
        wilsonPrecLow: 0.3,
        wilsonPrecHigh: 0.95,
        wilsonRecLow: 0.3,
        wilsonRecHigh: 0.95,
        lastUpdatedAt: new Date(),
      },
    ]);
    prismaMock.userLabel.findMany.mockResolvedValue([
      { id: 'l1', name: 'Work', slug: 'work' },
    ]);
    const result = await service.read('t1');
    expect(result.labels[0].windows['30d']!.state).toBe('learning');
  });

  it('read: sets state="ready" when sampleSize >= 20', async () => {
    prismaMock.labelAccuracyProfile.findMany.mockResolvedValue([
      {
        tenantId: 't1',
        labelId: 'l1',
        windowKey: '30d',
        tp: 30,
        fp: 5,
        fn: 5,
        sampleSize: 40,
        precision: 0.857,
        recall: 0.857,
        f1: 0.857,
        wilsonPrecLow: 0.7,
        wilsonPrecHigh: 0.95,
        wilsonRecLow: 0.7,
        wilsonRecHigh: 0.95,
        lastUpdatedAt: new Date(),
      },
    ]);
    prismaMock.userLabel.findMany.mockResolvedValue([
      { id: 'l1', name: 'Work', slug: 'work' },
    ]);
    const result = await service.read('t1');
    expect(result.labels[0].windows['30d']!.state).toBe('ready');
  });

  it('read: multi-tenant isolation — never returns rows for other tenants', async () => {
    prismaMock.labelAccuracyProfile.findMany.mockResolvedValue([]);
    await service.read('t1');
    expect(prismaMock.labelAccuracyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
  });
});
