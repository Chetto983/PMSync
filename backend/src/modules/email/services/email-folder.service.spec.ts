import { EmailFolderService } from './email-folder.service';

describe('EmailFolderService', () => {
  const mockPrisma = {
    folder: {
      findMany: jest.fn(),
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

  it('aggregates Gmail inbox messages by folder and labels', async () => {
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
              {
                labels: {
                  hasSome: [
                    'CATEGORY_PERSONAL',
                    'CATEGORY_SOCIAL',
                    'CATEGORY_PROMOTIONS',
                    'CATEGORY_UPDATES',
                    'CATEGORY_FORUMS',
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
  });
});
