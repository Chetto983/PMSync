import { LabelsService } from '../labels.service';

describe('LabelsService triage onboarding', () => {
  const mockEmailsService = {};
  const mockEmailInsights = {
    analyzeEmailUnified: jest.fn(),
  };
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
    mockEmailInsights.analyzeEmailUnified.mockReset();
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
      mockEmailInsights as any,
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
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 12 }),
      },
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
      mockEmailInsights as any,
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
    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
    expect(result.labels.some((label: { name: string }) => label.name === 'System Alert')).toBe(true);
  });

  it('previews whether a wizard label matches a real email analysis', async () => {
    mockEmailInsights.analyzeEmailUnified.mockResolvedValue({
      labels: ['CI Incident', 'Action Items'],
      priority: 2,
      urgency: 'high',
      lane: 'action-now',
      intent: 'alert',
      actionability: 'todo',
      summary: 'CI failure on PMSync main branch',
      reasoning: 'The subject indicates a concrete build failure that needs action.',
      meta: { source: 'live' },
    });

    const prisma = {
      userLabel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'label-1',
          name: 'CI Incident',
          aiPrompt: 'Use for CI failures',
          category: 'workflow',
          roles: ['tech'],
          contents: ['system-alert'],
          actionType: 'urgent',
          defaultLane: 'action-now',
        }),
      },
      email: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'email-1',
          subject: '[chetto1983/PMSync] Run failed: CI',
          from: 'notifications@github.com',
          receivedAt: new Date('2026-04-02T10:00:00.000Z'),
        }),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockEmailInsights as any,
    );

    const preview = await service.previewLabelOnEmail('tenant-1', 'label-1', {
      emailId: 'email-1',
      locale: 'it',
    });

    expect(mockEmailInsights.analyzeEmailUnified).toHaveBeenCalledWith('tenant-1', 'email-1', 'it');
    expect(preview.matched).toBe(true);
    expect(preview.analysis.labels).toEqual(['CI Incident', 'Action Items']);
    expect(preview.email.subject).toContain('Run failed');
    expect(preview.label.name).toBe('CI Incident');
  });
});
