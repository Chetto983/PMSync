import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingService, type BriefingOutput } from '../briefing.service';
import type { AiServiceResult } from '../../utils/ai-response-meta';
import { CacheNamespace } from '../../../../common/services/cache.service';

const VALID_BRIEFING: BriefingOutput = {
  priorityEmails: [],
  calendarSnapshot: [],
  pendingFollowUps: [],
  executiveSummary: 'Cached daily briefing.',
  staleContactsAlert: [],
  draftSuggestions: [],
  emailVolumeTrends: {
    todayReceived: 3,
    todaySent: 1,
    weeklyAvgReceived: 5,
    weeklyAvgSent: 2,
    trend: 'stable',
  },
  focusTimeRecommendations: [],
};

function createResult(summary: string, generatedAt: string): AiServiceResult<BriefingOutput> {
  return {
    data: {
      ...VALID_BRIEFING,
      executiveSummary: summary,
    },
    meta: {
      operation: 'briefing',
      version: 'briefing-v2',
      source: 'live',
      status: 'ok',
      generatedAt,
      locale: 'en',
      model: 'mock-model',
    },
  };
}

function createMemoryCache() {
  const store = new Map<string, unknown>();

  return {
    get: vi.fn(async (key: string, options?: { namespace?: CacheNamespace }) => {
      const fullKey = options?.namespace ? `${options.namespace}:${key}` : key;
      return (store.get(fullKey) as any) ?? null;
    }),
    set: vi.fn(async (key: string, value: unknown, options?: { namespace?: CacheNamespace }) => {
      const fullKey = options?.namespace ? `${options.namespace}:${key}` : key;
      store.set(fullKey, value);
      return true;
    }),
  };
}

describe('BriefingService slot cache', () => {
  let service: BriefingService;
  let cache: ReturnType<typeof createMemoryCache>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createMemoryCache();
    const mockConfig = { get: (_key: string, def?: string) => def } as any;
    service = new BriefingService(
      {} as any,
      {} as any,
      mockConfig,
      undefined,
      undefined,
      cache as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reuses the same generated briefing within the current 8-hour slot', async () => {
    vi.setSystemTime(new Date('2026-04-01T09:15:00.000Z'));
    const generateSpy = vi
      .spyOn(service, 'generateBriefing')
      .mockResolvedValue(createResult('Morning slot briefing.', '2026-04-01T09:15:00.000Z'));

    const first = await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');
    const second = await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');

    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(first.meta.source).toBe('live');
    expect(second.meta.source).toBe('cache');
    expect(second.meta.generatedAt).toBe('2026-04-01T09:15:00.000Z');
    expect(second.data.executiveSummary).toBe('Morning slot briefing.');
  });

  it('generates a new briefing after the local time moves into the next slot', async () => {
    const generateSpy = vi.spyOn(service, 'generateBriefing');
    generateSpy
      .mockResolvedValueOnce(createResult('Slot one briefing.', '2026-04-01T07:50:00.000Z'))
      .mockResolvedValueOnce(createResult('Slot two briefing.', '2026-04-01T08:05:00.000Z'));

    vi.setSystemTime(new Date('2026-04-01T07:50:00.000Z'));
    const first = await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');

    vi.setSystemTime(new Date('2026-04-01T08:05:00.000Z'));
    const second = await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');

    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(first.meta.source).toBe('live');
    expect(second.meta.source).toBe('live');
    expect(second.data.executiveSummary).toBe('Slot two briefing.');
  });

  it('refreshes the current slot cache and serves the refreshed result afterward', async () => {
    vi.setSystemTime(new Date('2026-04-01T16:10:00.000Z'));
    const generateSpy = vi.spyOn(service, 'generateBriefing');
    generateSpy
      .mockResolvedValueOnce(createResult('Original evening briefing.', '2026-04-01T16:10:00.000Z'))
      .mockResolvedValueOnce(createResult('Refreshed evening briefing.', '2026-04-01T16:20:00.000Z'));

    await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');

    vi.setSystemTime(new Date('2026-04-01T16:20:00.000Z'));
    const refreshed = await service.refreshBriefing('tenant-1', 'user-1', 'UTC', 'en');
    const cached = await service.getBriefing('tenant-1', 'user-1', 'UTC', 'en');

    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(refreshed.meta.source).toBe('live');
    expect(cached.meta.source).toBe('cache');
    expect(cached.meta.generatedAt).toBe('2026-04-01T16:20:00.000Z');
    expect(cached.data.executiveSummary).toBe('Refreshed evening briefing.');
  });
});
