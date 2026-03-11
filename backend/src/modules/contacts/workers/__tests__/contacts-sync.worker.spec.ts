/**
 * ContactsSyncWorker integration tests — BTEST-02
 * processJob() tested via protected-method cast against real PostgreSQL.
 * Non-Prisma, non-Redis dependencies are mocked with jest.fn().
 */
import { Job } from 'bullmq';
import { ContactsSyncWorker } from '../contacts-sync.worker';
import { ContactsSyncJobData } from '../../services/contacts-sync-queue.service';
import { ContactsError, ContactsErrorCode } from '../../errors/contacts-error';
import { QUEUE_PRESETS } from '../../../../common/config';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

const MAX_ATTEMPTS = QUEUE_PRESETS.CONTACTS_SYNC.attempts;

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) =>
    key === 'CONTACTS_SYNC_WORKERS_ENABLED' ? 'false' : undefined,
  ),
};
const mockGoogleContactsSync = { syncContacts: jest.fn().mockResolvedValue(3) };
const mockMicrosoftContactsSync = { syncContacts: jest.fn().mockResolvedValue(2) };
const mockDlqService = { addToDeadLetter: jest.fn().mockResolvedValue(undefined) };
const mockAlertingService = {
  createAlert: jest.fn().mockReturnValue({ type: 'critical', message: 'test alert' }),
};

function buildMockJob(
  providerId: string,
  overrides: Partial<{ providerType: string; attemptsMade: number; tenantId: string; email: string }> = {},
): Job<ContactsSyncJobData> {
  return {
    id: 'test-job-1',
    data: {
      providerId,
      tenantId: overrides.tenantId ?? 'test-tenant',
      email: overrides.email ?? 'test@test.local',
      providerType: (overrides.providerType ?? 'google') as 'google' | 'microsoft',
      priority: 'normal',
    },
    attemptsMade: overrides.attemptsMade ?? 0,
    queueName: 'contacts-sync-normal',
  } as unknown as Job<ContactsSyncJobData>;
}

describe('ContactsSyncWorker', () => {
  let worker: ContactsSyncWorker;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    worker = new ContactsSyncWorker(
      mockConfigService as any,
      prisma as any,
      mockGoogleContactsSync as any,
      mockMicrosoftContactsSync as any,
      mockDlqService as any,
      mockAlertingService as any,
    );
    // Do NOT call worker.onModuleInit() — avoids Redis startup
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleContactsSync.syncContacts.mockResolvedValue(3);
    mockMicrosoftContactsSync.syncContacts.mockResolvedValue(2);
    mockDlqService.addToDeadLetter.mockResolvedValue(undefined);
    mockAlertingService.createAlert.mockReturnValue({ type: 'critical', message: 'test alert' });
  });

  afterAll(async () => {
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await cleanupTestData();
  });

  describe('processJob', () => {
    it('calls googleContactsSync.syncContacts for google provider and returns success=true', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      const job = buildMockJob(provider.id, { providerType: 'google' });
      const result = await (worker as any).processJob(job);

      expect(result.success).toBe(true);
      expect(result.providerId).toBe(provider.id);
      expect(mockGoogleContactsSync.syncContacts).toHaveBeenCalledWith(provider.id);
      expect(mockMicrosoftContactsSync.syncContacts).not.toHaveBeenCalled();

      // Verify lastSyncedAt was updated in DB
      const updated = await prisma.providerConfig.findUnique({ where: { id: provider.id } });
      expect(updated!.lastSyncedAt).not.toBeNull();
    });

    it('calls microsoftContactsSync.syncContacts for microsoft provider and returns success=true', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'microsoft',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      const job = buildMockJob(provider.id, { providerType: 'microsoft' });
      const result = await (worker as any).processJob(job);

      expect(result.success).toBe(true);
      expect(mockMicrosoftContactsSync.syncContacts).toHaveBeenCalledWith(provider.id);
      expect(mockGoogleContactsSync.syncContacts).not.toHaveBeenCalled();
    });

    it('throws ContactsError with PROVIDER_NOT_SUPPORTED when supportsContacts=false', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: false,
      });
      providerIds.push(provider.id);

      const job = buildMockJob(provider.id, { providerType: 'google' });

      await expect((worker as any).processJob(job)).rejects.toThrow(ContactsError);
      await expect((worker as any).processJob(job)).rejects.toMatchObject({
        code: ContactsErrorCode.PROVIDER_NOT_SUPPORTED,
      });
    });

    it('throws ContactsError with PROVIDER_NOT_FOUND when provider does not exist in DB', async () => {
      const job = buildMockJob('non-existent-provider-id-' + Date.now());

      await expect((worker as any).processJob(job)).rejects.toThrow(ContactsError);
      await expect((worker as any).processJob(job)).rejects.toMatchObject({
        code: ContactsErrorCode.PROVIDER_NOT_FOUND,
      });
    });

    it('calls dlqService and alertingService on last retry attempt when syncContacts rejects', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      mockGoogleContactsSync.syncContacts.mockRejectedValueOnce(new Error('API timeout'));

      const job = buildMockJob(provider.id, { attemptsMade: MAX_ATTEMPTS - 1 });

      await expect((worker as any).processJob(job)).rejects.toThrow('API timeout');
      expect(mockDlqService.addToDeadLetter).toHaveBeenCalledTimes(1);
      expect(mockAlertingService.createAlert).toHaveBeenCalledTimes(1);
    });

    it('does NOT call dlqService or alertingService on non-last retry attempt', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      mockGoogleContactsSync.syncContacts.mockRejectedValueOnce(new Error('transient error'));

      const job = buildMockJob(provider.id, { attemptsMade: 0 });

      await expect((worker as any).processJob(job)).rejects.toThrow('transient error');
      expect(mockDlqService.addToDeadLetter).not.toHaveBeenCalled();
      expect(mockAlertingService.createAlert).not.toHaveBeenCalled();
    });
  });
});
