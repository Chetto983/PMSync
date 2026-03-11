/**
 * GoogleCalendarSyncService integration tests — BTEST-01
 * Tests run against a real PostgreSQL test database.
 * All non-Prisma dependencies are mocked with jest.fn().
 *
 * The syncCalendar method in AbstractCalendarSyncService:
 * 1. Calls redisLock.withLock(key, ttl, fn, opts)
 * 2. Inside the lock: calls redisLock.checkProviderRateLimit, providerTokenService.getProviderWithToken
 * 3. Fetches calendar list via fetchCalendarList (requires real Google API call — mocked via fetchCalendarList)
 * 4. Calls realtimeEvents.emitSyncStatus after successful sync with changes
 *
 * Strategy: mock redisLock.withLock to immediately invoke the callback,
 * mock providerTokenService.getProviderWithToken to return a test provider + token,
 * mock fetchCalendarList and fetchEvents at the class level via jest.spyOn.
 */
import { GoogleCalendarSyncService } from '../google-calendar-sync.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mockProviderToken = {
  getProviderWithToken: jest.fn(),
};

const mockRealtimeEvents = {
  emitSyncStatus: jest.fn(),
  emitCalendarSync: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((_key: string, defaultVal?: unknown) => defaultVal),
};

const mockRedisLock = {
  // withLock invokes the callback immediately and returns its result
  withLock: jest.fn().mockImplementation(
    async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  ),
  checkProviderRateLimit: jest.fn().mockResolvedValue(true),
  getRateLimitStatus: jest.fn().mockResolvedValue({ current: 0, limit: 60, remainingSeconds: 0 }),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('GoogleCalendarSyncService', () => {
  let service: GoogleCalendarSyncService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(async () => {
    prisma = getTestPrismaClient();
    service = new GoogleCalendarSyncService(
      prisma as any,
      mockProviderToken as any,
      mockRealtimeEvents as any,
      mockConfig as any,
      mockRedisLock as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default withLock behaviour after clearAllMocks
    mockRedisLock.withLock.mockImplementation(
      async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
    );
    mockRedisLock.checkProviderRateLimit.mockResolvedValue(true);
  });

  afterAll(async () => {
    await prisma.calendarEvent.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.calendarSyncState.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    // cleanupTestData() intentionally omitted — targeted cleanup above is sufficient.
    // TRUNCATE CASCADE in parallel with other specs causes FK violations.
  });

  describe('syncCalendar', () => {
    it('fetches provider token, processes events, and emits realtime status when changes exist', async () => {
      const tenant = await createTestTenant({ name: 'Sync Service Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      // Mock getProviderWithToken to return the real provider row + fake token
      mockProviderToken.getProviderWithToken.mockResolvedValue({
        provider: { ...provider, supportsCalendar: true },
        accessToken: 'fake-google-access-token',
      });

      // Mock the protected fetchCalendarList to avoid real Google API calls
      const fetchCalendarListSpy = jest
        .spyOn(service as any, 'fetchCalendarList')
        .mockResolvedValue([
          { id: 'primary-cal', name: 'Test Primary Calendar', primary: true, deleted: false },
        ]);

      // Mock fetchEvents to return one new event
      const mockEvent = {
        id: `google-event-${Date.now()}`,
        summary: 'Test Meeting',
        start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
        status: 'confirmed',
        recurrence: [],
      };
      const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents').mockResolvedValue({
        events: [mockEvent],
        nextSyncToken: 'fake-sync-token-123',
      });

      const result = await service.syncCalendar(provider.id);

      expect(result.success).toBe(true);
      expect(result.providerId).toBe(provider.id);
      expect(fetchCalendarListSpy).toHaveBeenCalledWith('fake-google-access-token');
      expect(fetchEventsSpy).toHaveBeenCalled();

      // emitSyncStatus should be called because newEvents > 0
      expect(mockRealtimeEvents.emitSyncStatus).toHaveBeenCalledWith(
        tenant.id,
        expect.objectContaining({ providerId: provider.id, status: 'completed' }),
      );

      fetchCalendarListSpy.mockRestore();
      fetchEventsSpy.mockRestore();
    });

    it('returns early without emitting realtime when no events changed', async () => {
      const tenant = await createTestTenant({ name: 'Sync No Changes Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      mockProviderToken.getProviderWithToken.mockResolvedValue({
        provider: { ...provider, supportsCalendar: true },
        accessToken: 'fake-access-token-no-events',
      });

      const fetchCalendarListSpy = jest
        .spyOn(service as any, 'fetchCalendarList')
        .mockResolvedValue([{ id: 'empty-cal', name: 'Empty Calendar', primary: true, deleted: false }]);

      // Return zero events
      const fetchEventsSpy = jest.spyOn(service as any, 'fetchEvents').mockResolvedValue({
        events: [],
        nextSyncToken: 'fake-sync-token-empty',
      });

      const result = await service.syncCalendar(provider.id);

      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(0);
      expect(result.newEvents).toBe(0);
      // No changes — emitSyncStatus should NOT be called
      expect(mockRealtimeEvents.emitSyncStatus).not.toHaveBeenCalled();

      fetchCalendarListSpy.mockRestore();
      fetchEventsSpy.mockRestore();
    });

    it('propagates error when getProviderWithToken rejects', async () => {
      const tenant = await createTestTenant({ name: 'Token Error Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      mockProviderToken.getProviderWithToken.mockRejectedValue(
        new Error('Token refresh failed: invalid_grant'),
      );

      await expect(service.syncCalendar(provider.id)).rejects.toThrow(
        'Token refresh failed: invalid_grant',
      );
    });
  });
});
