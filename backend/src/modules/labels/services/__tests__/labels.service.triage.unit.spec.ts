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
          suppressUrgency: false,
          mutuallyExclusiveWith: [],
          defaultLane: 'action-now',
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'label-1',
            name: 'CI Incident',
            aiPrompt: 'Use for CI failures',
            category: 'workflow',
            roles: ['tech'],
            contents: ['system-alert'],
            actionType: 'urgent',
            suppressUrgency: false,
            mutuallyExclusiveWith: [],
            defaultLane: 'action-now',
          },
          {
            id: 'label-2',
            name: 'Follow-up',
            aiPrompt: 'Use when a reply is pending.',
            category: 'workflow',
            roles: ['customer'],
            contents: ['support'],
            actionType: 'followup',
            suppressUrgency: false,
            mutuallyExclusiveWith: [],
            defaultLane: 'waiting-on-reply',
          },
        ]),
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

    expect(mockEmailInsights.analyzeEmailUnified).toHaveBeenCalledWith(
      'tenant-1',
      'email-1',
      'it',
      expect.objectContaining({
        bypassCache: true,
        persist: false,
        labelDefsOverride: expect.arrayContaining([
          expect.objectContaining({ name: 'CI Incident', defaultLane: 'action-now' }),
          expect.objectContaining({ name: 'Follow-up', defaultLane: 'waiting-on-reply' }),
        ]),
      }),
    );
    expect(preview.matched).toBe(true);
    expect(preview.analysis.labels).toEqual(['CI Incident', 'Action Items']);
    expect(preview.email.subject).toContain('Run failed');
    expect(preview.label.name).toBe('CI Incident');
  });

  it('previews an unsaved wizard draft without persisting label state', async () => {
    mockEmailInsights.analyzeEmailUnified.mockResolvedValue({
      labels: ['Vendor Escalation'],
      priority: 3,
      urgency: 'medium',
      lane: 'action-now',
      intent: 'action_required',
      actionability: 'todo',
      summary: 'A supplier requested a decision on a delayed shipment.',
      reasoning: 'The draft rule matches the supplier + delivery decision pattern.',
      meta: { source: 'live' },
    });

    const prisma = {
      userLabel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'label-1',
            name: 'Updates',
            aiPrompt: 'Use for passive updates.',
            category: 'suppression',
            roles: ['any'],
            contents: ['newsletter'],
            actionType: 'none',
            suppressUrgency: true,
            mutuallyExclusiveWith: [],
            defaultLane: 'review-later',
          },
        ]),
      },
      email: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'email-7',
          subject: 'Shipment blocked until you confirm the new delivery window',
          from: 'ops@supplier.example',
          receivedAt: new Date('2026-04-02T11:00:00.000Z'),
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

    const preview = await service.previewWizardLabelOnEmail('tenant-1', {
      emailId: 'email-7',
      locale: 'en',
      name: 'Vendor Escalation',
      category: 'workflow',
      roles: ['supplier'],
      contents: ['delivery'],
      actionType: 'decide',
      suppressUrgency: false,
      mutuallyExclusiveWith: [],
      aiPrompt: 'Use when a supplier blocks work until we decide or confirm a delivery change.',
    });

    expect(mockEmailInsights.analyzeEmailUnified).toHaveBeenCalledWith(
      'tenant-1',
      'email-7',
      'en',
      expect.objectContaining({
        bypassCache: true,
        persist: false,
        labelDefsOverride: expect.arrayContaining([
          expect.objectContaining({ name: 'Vendor Escalation', defaultLane: 'action-now' }),
        ]),
      }),
    );
    expect(preview.matched).toBe(true);
    expect(preview.label.name).toBe('Vendor Escalation');
    expect(preview.analysis.summary).toContain('supplier');
  });

  it('creates a nested wizard label and invalidates analysis cache', async () => {
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      userLabel: {
        count: jest.fn().mockResolvedValue(2),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ tenantId: 'tenant-1', level: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 4 } }),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'child-1',
          ...data,
          children: [],
          _count: { emailLabels: 0 },
        })),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockEmailInsights as any,
    );

    const label = await service.createFromWizard('tenant-1', {
      name: 'Vendor Escalation',
      parentId: 'parent-1',
      color: { backgroundColor: '#ff0000', textColor: '#ffffff' },
      category: 'workflow',
      roles: ['supplier'],
      contents: ['delivery'],
      actionType: 'decide',
      suppressUrgency: false,
      mutuallyExclusiveWith: [],
      aiPrompt: 'Use when a supplier blocks work until we decide.',
    });

    expect(prisma.userLabel.aggregate).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', parentId: 'parent-1' },
      _max: { orderIndex: true },
    });
    expect(prisma.userLabel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: 'parent-1',
          level: 2,
          orderIndex: 5,
          defaultLane: 'action-now',
        }),
      }),
    );
    expect(mockRealtimeEvents.emitLabelNew).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ labelId: 'child-1', reason: 'label-created' }),
    );
    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
    expect(label.parentId).toBe('parent-1');
  });

  it('updates a wizard label without dropping nested placement or cache invalidation', async () => {
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      userLabel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'label-1',
          tenantId: 'tenant-1',
          slug: 'vendor-escalation',
          parentId: 'parent-1',
          level: 1,
          orderIndex: 2,
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'parent-1', parentId: null, level: 0, orderIndex: 0 },
          { id: 'label-1', parentId: 'parent-1', level: 1, orderIndex: 2 },
        ]),
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'label-1',
          ...data,
          parentId: 'parent-1',
          children: [],
          _count: { emailLabels: 0 },
        })),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockEmailInsights as any,
    );

    const label = await service.updateFromWizard('tenant-1', 'label-1', {
      name: 'Vendor Escalation',
      parentId: 'parent-1',
      color: { backgroundColor: '#00ff00', textColor: '#000000' },
      category: 'workflow',
      roles: ['supplier'],
      contents: ['delivery'],
      actionType: 'decide',
      suppressUrgency: false,
      mutuallyExclusiveWith: [],
      aiPrompt: 'Use when a supplier blocks work until we decide.',
    });

    expect(prisma.userLabel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'label-1' },
        data: expect.objectContaining({
          name: 'Vendor Escalation',
          defaultLane: 'action-now',
        }),
      }),
    );
    expect(mockRealtimeEvents.emitLabelUpdate).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ labelId: 'label-1', reason: 'label-updated' }),
    );
    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
    expect(label.parentId).toBe('parent-1');
  });
});
