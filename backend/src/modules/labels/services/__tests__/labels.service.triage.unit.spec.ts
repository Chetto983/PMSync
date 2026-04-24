import { LabelsService } from '../labels.service';

describe('LabelsService triage onboarding', () => {
  const mockEmailsService = {};
  const mockEmailInsights = {
    analyzeEmailUnified: jest.fn(),
  };
  const mockTriageRuleService = {
    setTriageRules: jest.fn(),
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
    mockTriageRuleService.setTriageRules.mockReset();
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
      mockTriageRuleService as any,
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

  it('stores onboarding rules without creating stock labels when applied', async () => {
    mockTriageRuleService.setTriageRules.mockResolvedValue([
      { type: 'domain', pattern: 'acme.com', action: 'customer-vip' },
      { type: 'phrase', pattern: 'Railway', action: 'system-alert' },
      { type: 'phrase', pattern: 'follow-up target 48 hours', action: 'follow-up' },
    ]);
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 12 }),
      },
      userLabel: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'important-1', name: 'Important', slug: 'important', aiPrompt: 'old', type: 'USER' },
            { id: 'follow-up-1', name: 'Follow-up', slug: 'follow-up', aiPrompt: 'old', type: 'USER' },
          ])
          .mockResolvedValueOnce([
            { id: 'important-1', name: 'Important', slug: 'important', aiPrompt: 'old', type: 'USER', children: [], _count: { emailLabels: 0 } },
            { id: 'follow-up-1', name: 'Follow-up', slug: 'follow-up', aiPrompt: 'old', type: 'USER', children: [], _count: { emailLabels: 0 } },
          ]),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
      mockEmailInsights as any,
    );

    const result = await service.applyTriageOnboarding('tenant-1', {
      customerDomains: ['acme.com'],
      systemAlertSources: ['Railway'],
      followUpSlaHours: 48,
    });

    expect(mockTriageRuleService.setTriageRules).toHaveBeenCalledWith(
      'tenant-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'domain', pattern: 'acme.com', action: 'customer-vip' }),
        expect.objectContaining({ type: 'phrase', pattern: 'Railway', action: 'system-alert' }),
        expect.objectContaining({ type: 'phrase', pattern: 'follow-up target 48 hours', action: 'follow-up' }),
      ]),
    );
    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
    expect(result.labels.map((label: { name: string }) => label.name)).toEqual(['Important', 'Follow-up']);
    expect(result.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'customer-vip' }),
        expect.objectContaining({ action: 'system-alert' }),
        expect.objectContaining({ action: 'follow-up' }),
      ]),
    );
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
      mockTriageRuleService as any,
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
      mockTriageRuleService as any,
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
    // Phase 150.1 WR-03: upsertLabelNode helper opens a $transaction —
    // mock must expose one that passes through the callback with the tx
    // primitives upsertLabelNode uses ($queryRaw, graphNode.create/update).
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
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          graphNode: {
            create: jest.fn().mockResolvedValue({ id: 'gn-child-1' }),
            update: jest.fn().mockResolvedValue({ id: 'gn-child-1' }),
          },
        };
        return fn(tx);
      }),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
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
      mockTriageRuleService as any,
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
