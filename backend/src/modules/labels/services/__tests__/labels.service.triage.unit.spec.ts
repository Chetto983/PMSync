import { LabelsService } from '../labels.service';

describe('LabelsService triage onboarding', () => {
  const mockEmailsService = {};
  const mockRealtimeEvents = {
    emitLabelUpdate: jest.fn(),
    emitLabelNew: jest.fn(),
    emitLabelDelete: jest.fn(),
    emitEmailUpdate: jest.fn(),
  };
  const mockSyncBackQueue = {
    enqueueBulkSyncBack: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews normalized rules and flags existing labels', async () => {
    const prisma = {
      userLabel: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: 'important-1', name: 'Important', slug: 'important', aiPrompt: 'old', type: 'USER' },
          { id: 'follow-up-1', name: 'Follow-up', slug: 'follow-up', aiPrompt: 'old', type: 'USER' },
        ]),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
    );

    const preview = await service.previewTriageOnboarding('tenant-1', {
      customerDomains: [' Acme.com ', '@acme.com'],
      followUpSlaHours: 24,
    });

    expect(preview.normalizedRules.customerDomains).toEqual(['acme.com']);
    expect(preview.recommendedLabels.find((label) => label.name === 'Important')?.existingLabelId).toBe('important-1');
    expect(preview.recommendedLabels.find((label) => label.name === 'Customer')?.willCreate).toBe(true);
  });

  it('updates existing labels and creates missing operational labels when applied', async () => {
    const txUserLabel = {
      aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 7 } }),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        ...data,
      })),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: `created-${data.slug}`,
        ...data,
      })),
    };

    const prisma = {
      userLabel: {
        count: jest.fn().mockResolvedValue(8),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'important-1', name: 'Important', slug: 'important', aiPrompt: 'old', type: 'USER' },
            { id: 'follow-up-1', name: 'Follow-up', slug: 'follow-up', aiPrompt: 'old', type: 'USER' },
          ])
          .mockResolvedValueOnce([
            { id: 'important-1', slug: 'important' },
            { id: 'follow-up-1', slug: 'follow-up' },
          ]),
      },
      $transaction: jest.fn(async (callback: (tx: { userLabel: typeof txUserLabel }) => Promise<unknown>) =>
        callback({ userLabel: txUserLabel })),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
    );

    const result = await service.applyTriageOnboarding('tenant-1', {
      customerDomains: ['acme.com'],
      systemAlertSources: ['Railway'],
      followUpSlaHours: 48,
    });

    expect(txUserLabel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'important-1' },
        data: expect.objectContaining({
          aiPrompt: expect.stringContaining('business-critical'),
        }),
      }),
    );
    expect(txUserLabel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Customer',
          slug: 'customer',
        }),
      }),
    );
    expect(result.labels.some((label: { name: string }) => label.name === 'System Alert')).toBe(true);
  });
});
