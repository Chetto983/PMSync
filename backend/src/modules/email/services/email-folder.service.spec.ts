import { EmailFolderService } from './email-folder.service';

describe('EmailFolderService', () => {
  const mockPrisma = {
    folder: {
      findMany: jest.fn(),
    },
    providerConfig: {
      findUnique: jest.fn(),
    },
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockRedisLock = {};
  const mockRealtimeEvents = {};

  let service: EmailFolderService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);
    mockPrisma.folder.findMany.mockResolvedValue([
      { path: 'INBOX', name: 'Inbox', specialUse: 'INBOX' },
    ]);

    service = new EmailFolderService(
      mockPrisma as any,
      mockCache as any,
      mockRedisLock as any,
      mockRealtimeEvents as any,
    );
  });

  it('aggregates inbox messages by folder and INBOX label', async () => {
    const result = await service.buildEmailWhere({
      tenantId: 'tenant-1',
      specialUse: 'INBOX',
    });

    expect(result.where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        isDeleted: false,
        AND: [
          {
            OR: [
              { folder: { in: ['INBOX', 'Inbox'], mode: 'insensitive' } },
              { labels: { has: 'INBOX' } },
            ],
          },
        ],
      }),
    );
  });

  it('queries Gmail custom label folders by external label id', async () => {
    mockPrisma.folder.findMany.mockResolvedValue([
      { path: 'Projects', name: 'Projects', specialUse: null, externalId: 'Label_123' },
    ]);
    mockPrisma.providerConfig.findUnique.mockResolvedValue({ providerType: 'google' });

    const result = await service.buildEmailWhere({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      folder: 'Projects',
    });

    expect(result.where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        isDeleted: false,
        AND: [
          {
            OR: [
              { folder: { in: ['Projects'], mode: 'insensitive' } },
              { labels: { has: 'Label_123' } },
            ],
          },
        ],
      }),
    );
  });
});
