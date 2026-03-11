/**
 * CalendarSyncWorker processJob() tests — BTEST-01
 * Tests processJob() directly via (worker as any).processJob(mockJob).
 * No NestJS DI, no Redis worker startup (CALENDAR_SYNC_WORKERS_ENABLED=false).
 */
import { Job } from 'bullmq';
import { CalendarSyncWorker } from '../calendar-sync.worker';
import { CalendarSyncJobData } from '../../services/calendar-sync-queue.service';
import { QUEUE_PRESETS } from '../../../../common/config';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

// MAX_ATTEMPTS from the same source as the worker
const MAX_ATTEMPTS = QUEUE_PRESETS.CALENDAR_SYNC.attempts;

// ─── Mock dependencies ───────────────────────────────────────────────────────

// Setting CALENDAR_SYNC_WORKERS_ENABLED to 'false' prevents BaseWorker.onModuleInit
// from starting Redis workers. Never call worker.onModuleInit() in tests.
const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'CALENDAR_SYNC_WORKERS_ENABLED') return 'false';
    return undefined;
  }),
};

const mockGoogleCalendarSync = {
  syncCalendar: jest.fn().mockResolvedValue({
    success: true,
    eventsProcessed: 5,
    newEvents: 3,
    updatedEvents: 2,
    deletedEvents: 0,
    syncDuration: 100,
    syncType: 'full',
  }),
};

const mockMicrosoftCalendarSync = {
  syncCalendar: jest.fn().mockResolvedValue({
    success: true,
    eventsProcessed: 2,
    newEvents: 1,
    updatedEvents: 1,
    deletedEvents: 0,
    syncDuration: 50,
    syncType: 'incremental',
  }),
};

const mockDlqService = {
  addToDeadLetter: jest.fn().mockResolvedValue(undefined),
};

const mockAlertingService = {
  createAlert: jest.fn().mockReturnValue({
    type: 'critical',
    message: 'test alert',
  }),
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function buildMockJob(
  providerId: string,
  overrides: Partial<{ providerType: string; attemptsMade: number }> = {},
): Job<CalendarSyncJobData> {
  return {
    id: 'test-job-1',
    data: {
      providerId,
      tenantId: 'test-tenant',
      email: 'test@test.local',
      providerType: (overrides.providerType ?? 'google') as 'google' | 'microsoft',
      priority: 'normal',
    },
    attemptsMade: overrides.attemptsMade ?? 0,
    queueName: 'calendar-sync-normal',
  } as unknown as Job<CalendarSyncJobData>;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('CalendarSyncWorker.processJob()', () => {
  let worker: CalendarSyncWorker;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(async () => {
    prisma = getTestPrismaClient();
    worker = new CalendarSyncWorker(
      mockConfigService as any,
      prisma as any,
      mockGoogleCalendarSync as any,
      mockMicrosoftCalendarSync as any,
      mockDlqService as any,
      mockAlertingService as any,
    );
    // Do NOT call worker.onModuleInit() — avoids Redis startup
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default resolved values after clearAllMocks
    mockGoogleCalendarSync.syncCalendar.mockResolvedValue({
      success: true,
      eventsProcessed: 5,
      newEvents: 3,
      updatedEvents: 2,
      deletedEvents: 0,
      syncDuration: 100,
      syncType: 'full',
    });
    mockMicrosoftCalendarSync.syncCalendar.mockResolvedValue({
      success: true,
      eventsProcessed: 2,
      newEvents: 1,
      updatedEvents: 1,
      deletedEvents: 0,
      syncDuration: 50,
      syncType: 'incremental',
    });
    mockDlqService.addToDeadLetter.mockResolvedValue(undefined);
    mockAlertingService.createAlert.mockReturnValue({ type: 'critical', message: 'test alert' });
  });

  afterAll(async () => {
    await prisma.calendarSyncState.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    // cleanupTestData() intentionally omitted — targeted cleanup above is sufficient.
    // TRUNCATE CASCADE in parallel with other specs causes FK violations.
  });

  it('calls googleCalendarSync.syncCalendar and updates lastSyncedAt for google provider', async () => {
    const tenant = await createTestTenant({ name: 'Worker Google Tenant' });
    tenantIds.push(tenant.id);
    const user = await createTestUser(tenant.id);
    userIds.push(user.id);
    const provider = await createTestProviderAccount(tenant.id, user.id, {
      providerType: 'google',
    });
    providerIds.push(provider.id);

    const job = buildMockJob(provider.id, { providerType: 'google' });
    const result = await (worker as any).processJob(job);

    expect(mockGoogleCalendarSync.syncCalendar).toHaveBeenCalledWith(provider.id);
    expect(mockMicrosoftCalendarSync.syncCalendar).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.providerId).toBe(provider.id);

    // Verify lastSyncedAt was updated in DB
    const updated = await prisma.providerConfig.findUnique({ where: { id: provider.id } });
    expect(updated!.lastSyncedAt).toBeDefined();
    expect(updated!.lastSyncedAt!.getTime()).toBeGreaterThan(Date.now() - 10000);
  });

  it('calls microsoftCalendarSync.syncCalendar and returns success for microsoft provider', async () => {
    const tenant = await createTestTenant({ name: 'Worker Microsoft Tenant' });
    tenantIds.push(tenant.id);
    const user = await createTestUser(tenant.id);
    userIds.push(user.id);
    const provider = await createTestProviderAccount(tenant.id, user.id, {
      providerType: 'microsoft',
    });
    providerIds.push(provider.id);

    const job = buildMockJob(provider.id, { providerType: 'microsoft' });
    const result = await (worker as any).processJob(job);

    expect(mockMicrosoftCalendarSync.syncCalendar).toHaveBeenCalledWith(provider.id);
    expect(mockGoogleCalendarSync.syncCalendar).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('throws Error containing "Unsupported provider type" for unknown providerType', async () => {
    const tenant = await createTestTenant({ name: 'Worker Unknown Provider Tenant' });
    tenantIds.push(tenant.id);
    const user = await createTestUser(tenant.id);
    userIds.push(user.id);

    // Create a provider with an unsupported type directly via prisma (factory defaults to google)
    const provider = await prisma.providerConfig.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        providerType: 'caldav',
        email: `caldav-provider-${Date.now()}@test.local`,
        supportsEmail: false,
        supportsCalendar: true,
        supportsContacts: false,
        accessToken: 'test-token',
        tokenEncryptionIv: 'test-iv',
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isActive: true,
        isDefault: false,
      },
    });
    providerIds.push(provider.id);

    const job = buildMockJob(provider.id, { providerType: 'caldav' });

    await expect((worker as any).processJob(job)).rejects.toThrow('Unsupported provider type');
  });

  it('throws Error containing "not found" for non-existent providerId', async () => {
    const nonExistentProviderId = 'clxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const job = buildMockJob(nonExistentProviderId, { providerType: 'google' });

    await expect((worker as any).processJob(job)).rejects.toThrow('not found');
  });

  it('calls dlqService and alertingService on last retry attempt when syncCalendar rejects', async () => {
    const tenant = await createTestTenant({ name: 'Worker DLQ Tenant' });
    tenantIds.push(tenant.id);
    const user = await createTestUser(tenant.id);
    userIds.push(user.id);
    const provider = await createTestProviderAccount(tenant.id, user.id, {
      providerType: 'google',
    });
    providerIds.push(provider.id);

    mockGoogleCalendarSync.syncCalendar.mockRejectedValueOnce(new Error('API timeout'));

    // Last attempt: attemptsMade = MAX_ATTEMPTS - 1
    const job = buildMockJob(provider.id, {
      providerType: 'google',
      attemptsMade: MAX_ATTEMPTS - 1,
    });

    await expect((worker as any).processJob(job)).rejects.toThrow('API timeout');

    expect(mockDlqService.addToDeadLetter).toHaveBeenCalledTimes(1);
    expect(mockAlertingService.createAlert).toHaveBeenCalledTimes(1);
    expect(mockAlertingService.createAlert).toHaveBeenCalledWith(
      'critical',
      'calendar_sync_failed',
      expect.stringContaining('permanently failed'),
      MAX_ATTEMPTS,
      MAX_ATTEMPTS,
    );
  });

  it('does NOT call dlqService when syncCalendar rejects on a non-last attempt', async () => {
    const tenant = await createTestTenant({ name: 'Worker No DLQ Tenant' });
    tenantIds.push(tenant.id);
    const user = await createTestUser(tenant.id);
    userIds.push(user.id);
    const provider = await createTestProviderAccount(tenant.id, user.id, {
      providerType: 'google',
    });
    providerIds.push(provider.id);

    mockGoogleCalendarSync.syncCalendar.mockRejectedValueOnce(new Error('transient error'));

    // Not the last attempt
    const job = buildMockJob(provider.id, {
      providerType: 'google',
      attemptsMade: 0,
    });

    await expect((worker as any).processJob(job)).rejects.toThrow('transient error');

    expect(mockDlqService.addToDeadLetter).not.toHaveBeenCalled();
    expect(mockAlertingService.createAlert).not.toHaveBeenCalled();
  });
});
