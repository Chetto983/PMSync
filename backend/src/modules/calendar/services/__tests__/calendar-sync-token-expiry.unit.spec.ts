/**
 * Sync token expiration handling tests — T-0202, T-0203
 *
 * Verifies that expired sync tokens (Google 410, Microsoft 410/syncStateNotFound)
 * gracefully fall back to full sync instead of crashing.
 *
 * Tests the fix in AbstractCalendarSyncService.syncCalendarWithState() which
 * now correctly handles:
 * - GaxiosError (Google): response.status = 410
 * - GraphError (Microsoft): statusCode = 410, code = 'syncStateNotFound'
 * - Legacy delta link error: code = 410 (number)
 */

import { GoogleCalendarSyncService } from '../google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../microsoft-calendar-sync.service';

// ─── Shared mock factories ──────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
};

const mockPrisma = {
  calendarSyncState: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
  },
  calendarEvent: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  calendarEventAttachment: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: jest.fn().mockImplementation((fn: any) => {
    if (typeof fn === 'function') return fn(mockPrisma);
    return Promise.all(fn);
  }),
};

const mockProviderToken = {
  getProviderWithToken: jest.fn(),
};

const mockRealtime = {
  emitSyncStatus: jest.fn(),
};

const mockRedisLock = {
  withLock: jest.fn().mockImplementation((_key, _ttl, fn) => fn()),
  checkProviderRateLimit: jest.fn().mockResolvedValue(true),
  getRateLimitStatus: jest.fn(),
};

// ─── Google sync token expiration (T-0202) ─────────────────────────────────

describe('Google sync token expiration (T-0202)', () => {
  let service: GoogleCalendarSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoogleCalendarSyncService(
      mockPrisma as any,
      mockProviderToken as any,
      mockRealtime as any,
      mockConfig as any,
      mockRedisLock as any,
    );
  });

  it('falls back to full sync when Google returns 410 for expired syncToken', async () => {
    // Setup: has an existing sync token
    mockPrisma.calendarSyncState.findUnique.mockResolvedValue({
      syncToken: 'old-expired-token',
      fullSyncRequired: false,
      consecutiveErrors: 0,
    });

    // Mock fetchEvents: first call (incremental) throws 410, second call (full) succeeds
    const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents');

    // Simulate Google GaxiosError with response.status = 410
    const gaxiosError = new Error('Sync token is no longer valid');
    (gaxiosError as any).response = { status: 410 };
    fetchEventsSpy.mockRejectedValueOnce(gaxiosError);

    // Full sync succeeds
    fetchEventsSpy.mockResolvedValueOnce({
      events: [],
      nextSyncToken: 'fresh-sync-token',
    });

    // Mock fetchCalendarList
    jest.spyOn(service as any, 'fetchCalendarList').mockResolvedValue([
      { id: 'primary', name: 'Primary', primary: true },
    ]);

    // Mock provider
    mockProviderToken.getProviderWithToken.mockResolvedValue({
      provider: { id: 'p1', tenantId: 't1', supportsCalendar: true },
      accessToken: 'token',
    });

    const result = await service.syncCalendar('p1');

    expect(result.success).toBe(true);
    // Should have cleared the sync token and marked full sync required
    expect(mockPrisma.calendarSyncState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          syncToken: null,
          fullSyncRequired: true,
        }),
      }),
    );
    // Should have been called twice: incremental (failed) + full (success)
    expect(fetchEventsSpy).toHaveBeenCalledTimes(2);

    fetchEventsSpy.mockRestore();
  });

  it('does NOT fall back to full sync on non-410 errors (e.g. 403 rate limit)', async () => {
    mockPrisma.calendarSyncState.findUnique.mockResolvedValue({
      syncToken: 'valid-token',
      fullSyncRequired: false,
      consecutiveErrors: 0,
    });

    const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents');
    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).response = { status: 403 };
    fetchEventsSpy.mockRejectedValueOnce(rateLimitError);

    jest.spyOn(service as any, 'fetchCalendarList').mockResolvedValue([
      { id: 'primary', name: 'Primary', primary: true },
    ]);
    mockProviderToken.getProviderWithToken.mockResolvedValue({
      provider: { id: 'p1', tenantId: 't1', supportsCalendar: true },
      accessToken: 'token',
    });

    // Error is caught per-calendar and recorded, not triggering full sync fallback
    await service.syncCalendar('p1');

    // Should NOT have cleared the sync token (no full sync fallback)
    const updateCalls = mockPrisma.calendarSyncState.update.mock.calls;
    const tokenClearCalls = updateCalls.filter(
      (call: any) => call[0]?.data?.syncToken === null && call[0]?.data?.fullSyncRequired === true,
    );
    expect(tokenClearCalls).toHaveLength(0);

    // fetchEvents should only be called once (incremental attempt, no full sync fallback)
    expect(fetchEventsSpy).toHaveBeenCalledTimes(1);

    fetchEventsSpy.mockRestore();
  });
});

// ─── Microsoft delta token HTTP 410 (T-0203) ───────────────────────────────

describe('Microsoft delta token HTTP 410 (T-0203)', () => {
  let service: MicrosoftCalendarSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MicrosoftCalendarSyncService(
      mockPrisma as any,
      mockProviderToken as any,
      mockRealtime as any,
      mockConfig as any,
      mockRedisLock as any,
    );
  });

  it('falls back to full sync when MS Graph returns statusCode=410', async () => {
    mockPrisma.calendarSyncState.findUnique.mockResolvedValue({
      deltaLink: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=old',
      fullSyncRequired: false,
      consecutiveErrors: 0,
    });

    const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents');

    // Simulate MS Graph GraphError with statusCode = 410
    const graphError = new Error('Sync state not found');
    (graphError as any).statusCode = 410;
    (graphError as any).code = 'syncStateNotFound';
    fetchEventsSpy.mockRejectedValueOnce(graphError);

    // Full sync succeeds
    fetchEventsSpy.mockResolvedValueOnce({
      events: [],
      nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=fresh',
    });

    jest.spyOn(service as any, 'fetchCalendarList').mockResolvedValue([
      { id: 'cal-1', name: 'Calendar', primary: false },
    ]);
    mockProviderToken.getProviderWithToken.mockResolvedValue({
      provider: { id: 'p2', tenantId: 't1', supportsCalendar: true },
      accessToken: 'token',
    });

    const result = await service.syncCalendar('p2');

    expect(result.success).toBe(true);
    // Should have cleared the delta link
    expect(mockPrisma.calendarSyncState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deltaLink: null,
          fullSyncRequired: true,
        }),
      }),
    );
    expect(fetchEventsSpy).toHaveBeenCalledTimes(2);

    fetchEventsSpy.mockRestore();
  });

  it('falls back to full sync on syncStateNotFound error code (without statusCode)', async () => {
    mockPrisma.calendarSyncState.findUnique.mockResolvedValue({
      deltaLink: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=old',
      fullSyncRequired: false,
      consecutiveErrors: 0,
    });

    const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents');

    // Simulate error with only code string, no statusCode
    const graphError = new Error('Sync state not found');
    (graphError as any).code = 'syncStateNotFound';
    fetchEventsSpy.mockRejectedValueOnce(graphError);

    fetchEventsSpy.mockResolvedValueOnce({
      events: [],
      nextDeltaLink: 'fresh-delta',
    });

    jest.spyOn(service as any, 'fetchCalendarList').mockResolvedValue([
      { id: 'cal-1', name: 'Calendar', primary: false },
    ]);
    mockProviderToken.getProviderWithToken.mockResolvedValue({
      provider: { id: 'p2', tenantId: 't1', supportsCalendar: true },
      accessToken: 'token',
    });

    const result = await service.syncCalendar('p2');
    expect(result.success).toBe(true);
    expect(fetchEventsSpy).toHaveBeenCalledTimes(2);

    fetchEventsSpy.mockRestore();
  });

  it('falls back to full sync on resyncRequired error code', async () => {
    mockPrisma.calendarSyncState.findUnique.mockResolvedValue({
      deltaLink: 'old-delta',
      fullSyncRequired: false,
      consecutiveErrors: 0,
    });

    const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents');

    const graphError = new Error('Resync required');
    (graphError as any).code = 'resyncRequired';
    (graphError as any).statusCode = 410;
    fetchEventsSpy.mockRejectedValueOnce(graphError);

    fetchEventsSpy.mockResolvedValueOnce({ events: [], nextDeltaLink: 'fresh' });

    jest.spyOn(service as any, 'fetchCalendarList').mockResolvedValue([
      { id: 'cal-1', name: 'Calendar' },
    ]);
    mockProviderToken.getProviderWithToken.mockResolvedValue({
      provider: { id: 'p3', tenantId: 't1', supportsCalendar: true },
      accessToken: 'token',
    });

    const result = await service.syncCalendar('p3');
    expect(result.success).toBe(true);

    fetchEventsSpy.mockRestore();
  });
});
