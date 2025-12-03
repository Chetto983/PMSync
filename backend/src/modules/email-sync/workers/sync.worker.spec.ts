import { SyncWorker } from './sync.worker';

const mockPrisma = {
  $transaction: jest.fn(),
  providerConfig: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
} as any;

const createWorker = () =>
  new SyncWorker(
    { get: jest.fn() } as any, // ConfigService
    mockPrisma,
    { updateProviderActivity: jest.fn(), incrementErrorStreak: jest.fn() } as any, // SyncSchedulerService
    { updateAllFolderCounts: jest.fn() } as any, // FolderSyncService
    { validateJobToken: jest.fn() } as any, // SyncAuthService
    { syncProvider: jest.fn() } as any, // GoogleSyncService
    { syncProvider: jest.fn() } as any, // MicrosoftSyncService
    { syncProvider: jest.fn() } as any, // ImapSyncService
  );

describe('SyncWorker auth error metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockReset();
    mockPrisma.providerConfig.findUnique.mockReset();
    mockPrisma.providerConfig.update.mockReset();
  });

  it('records auth error metadata with timestamp and message', async () => {
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      metadata: { foo: 'bar' },
    });
    mockPrisma.providerConfig.update.mockResolvedValue({});

    const worker = createWorker();
    const message = 'Unauthorized';
    await (worker as any).recordAuthErrorMetadata('provider-1', message);

    expect(mockPrisma.providerConfig.update).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: {
        metadata: expect.objectContaining({
          foo: 'bar',
          lastAuthError: message,
          lastAuthErrorAt: expect.any(String),
        }),
      },
    });
  });

  it('persists lastSyncToken and metadata in a transaction', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      metadata: { existing: 'yes' },
    });
    mockPrisma.providerConfig.update.mockResolvedValue({});

    const worker = createWorker();
    (worker as any).runProviderSync = jest.fn().mockResolvedValue({
      success: true,
      providerId: 'provider-1',
      email: 'user@example.com',
      messagesProcessed: 1,
      newMessages: 1,
      syncDuration: 5,
      lastSyncToken: 'token-123',
      metadata: { backfillRequired: false },
    });
    (worker as any).isAuthenticationError = () => false;

    const job: any = {
      data: {
        providerId: 'provider-1',
        providerType: 'google',
        email: 'user@example.com',
        syncType: 'incremental',
        authToken: 't',
      },
    };

    await (worker as any).processJob(job);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.providerConfig.update).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: expect.objectContaining({
        metadata: {
          existing: 'yes',
          backfillRequired: false,
          lastSyncToken: 'token-123',
        },
        lastSyncedAt: expect.any(Date),
      }),
    });
  });
});
