import { CrossProviderDedupService } from './cross-provider-dedup.service';

describe('CrossProviderDedupService', () => {
  it('normalizes messageId when hashing', () => {
    const service = new CrossProviderDedupService({} as any);
    const hashA = service.calculateContentHash({
      messageId: '<ABC@Example.COM>',
      subject: 'Hello',
      sentAt: new Date('2024-01-01T00:00:00Z'),
    });
    const hashB = service.calculateContentHash({
      messageId: 'abc@example.com',
      subject: 'Hello',
      sentAt: '2024-01-01T00:00:00Z',
    });

    expect(hashA).toBe(hashB);
  });

  it('falls back to subject+sentAt when messageId missing', () => {
    const service = new CrossProviderDedupService({} as any);
    const hashA = service.calculateContentHash({
      messageId: null,
      subject: 'Hello',
      sentAt: '2024-01-01T00:00:00Z',
    });
    const hashB = service.calculateContentHash({
      messageId: undefined,
      subject: 'Hello',
      sentAt: new Date('2024-01-01T00:00:00Z'),
    });

    expect(hashA).toBe(hashB);
  });

  it('detects conflicts across linked emails and emits telemetry', async () => {
    const prismaMock: any = {
      email: {
        findMany: jest.fn().mockResolvedValue([
          { providerId: 'google', isRead: true, isStarred: false, folder: 'INBOX' },
          { providerId: 'microsoft', isRead: false, isStarred: false, folder: 'INBOX' },
          { providerId: 'imap', isRead: false, isStarred: true, folder: 'Archive' },
        ]),
      },
    };
    const service = new CrossProviderDedupService(prismaMock as any);
    (service as any).logger = { warn: jest.fn(), verbose: jest.fn() };

    const telemetry = await (service as any).detectConflicts('link-1');

    expect(prismaMock.email.findMany).toHaveBeenCalledWith({
      where: { crossProviderLinkId: 'link-1' },
      select: { providerId: true, isRead: true, isStarred: true, folder: true },
    });
    expect(telemetry?.divergences).toHaveLength(3);
    expect((service as any).logger.warn).toHaveBeenCalledTimes(1);
    expect((service as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Cross-provider conflict detected for link link-1'),
    );
  });

  it('returns null when no conflicts are found', async () => {
    const prismaMock: any = {
      email: {
        findMany: jest.fn().mockResolvedValue([
          { providerId: 'google', isRead: true, isStarred: false, folder: 'INBOX' },
          { providerId: 'microsoft', isRead: true, isStarred: false, folder: 'INBOX' },
        ]),
      },
    };
    const service = new CrossProviderDedupService(prismaMock as any);
    (service as any).logger = { warn: jest.fn() };

    const telemetry = await (service as any).detectConflicts('link-2');

    expect(telemetry).toBeNull();
    expect((service as any).logger.warn).not.toHaveBeenCalled();
  });
});
