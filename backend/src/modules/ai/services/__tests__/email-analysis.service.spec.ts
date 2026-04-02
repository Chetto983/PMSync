import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAnalysisService } from '../email-analysis.service';

describe('EmailAnalysisService', () => {
  let prisma: any;
  let mistral: any;
  let utils: any;
  let triageRuleService: any;
  let service: EmailAnalysisService;

  beforeEach(() => {
    prisma = {
      emailAnalysis: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      email: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'email-1',
          subject: "Try this on your teammate's commits",
          from: 'GitKraken <team@gitkraken.com>',
          to: ['davide@example.com'],
          bodyText: 'We launched a new Git Roasted feature for code review fun.',
          bodyHtml: null,
          snippet: 'New Git Roasted feature is now available.',
          receivedAt: new Date('2026-03-31T10:00:00Z'),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userLabel: {
        count: vi.fn().mockResolvedValue(0),
        createMany: vi.fn().mockResolvedValue({ count: 8 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        summary: 'GitKraken announced a new Git Roasted feature.',
        sentiment: 'neutral',
        tone: 'friendly',
        priority: 3,
        urgency: 'medium',
        labels: [],
        keyTopics: ['Git Roasted', 'feature launch'],
        intent: 'fyi',
        escalationRisk: false,
        hasDeadline: false,
        deadlineDate: null,
        needsFollowUp: false,
        followUpDate: null,
        followUpReason: null,
        smartReplies: [],
        confidence: 0.82,
        reasoning: 'This is a product update announcement.',
      })),
    };

    utils = {
      truncate: vi.fn((value: string) => value),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((error: unknown) => String(error)),
      mapAiErrorToHttpException: vi.fn((error: unknown) => error),
    };

    triageRuleService = {
      getTriageRules: vi.fn().mockResolvedValue([]),
      buildTriageContext: vi.fn().mockResolvedValue(''),
    };

    const labelResolution = {
      resolve: vi.fn().mockReturnValue({ labels: ['Updates'], suppressUrgency: false }),
      normaliseLabel: vi.fn((label: string) => label),
    };
    const triageScoreService = {
      compute: vi.fn().mockReturnValue({
        priority: 3, urgency: 'medium', deadlineDate: null,
        needsFollowUp: false, followUpDate: null, followUpReason: null,
        priorityReason: 'From team@gitkraken.com',
      }),
    };
    const laneAssignment = {
      assignLane: vi.fn().mockReturnValue({ lane: 'review-later', laneReason: 'Informational' }),
    };

    service = new EmailAnalysisService(
      prisma, mistral, utils, triageRuleService,
      labelResolution as any, triageScoreService as any, laneAssignment as any,
      undefined as any,
    );
  });

  it('adds heuristic labels when the model returns none', async () => {
    const result = await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(result.labels).toContain('Updates');
    expect(prisma.email.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aiLabels: expect.arrayContaining(['Updates']),
      }),
    }));
  });

  it('preserves labels on cache hits from persisted aiLabels', async () => {
    prisma.emailAnalysis.findFirst.mockResolvedValue({
      priority: 'NORMAL',
      category: 'OTHER',
      sentiment: 'NEUTRAL',
      summary: 'Cached summary',
      keyPoints: [],
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: false,
      followUpDate: null,
      suggestedActions: { locale: 'en', labels: [] },
      processedAt: new Date('2026-03-31T10:00:00Z'),
      email: { aiLabels: ['Updates'] },
    });

    const result = await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(result.labels).toEqual(['Updates']);
    expect(mistral.completePrompt).not.toHaveBeenCalled();
  });

  it('does not append heuristic urgency labels when the model already classified a routine update', async () => {
    prisma.email.findFirst.mockResolvedValue({
      id: 'email-2',
      subject: 'Weekly product digest',
      from: 'Notifications <noreply@github.com>',
      to: ['davide@example.com'],
      bodyText: 'This week in GitHub: release notes and changelog updates.',
      bodyHtml: null,
      snippet: 'Release notes and changelog updates.',
      receivedAt: new Date('2026-03-31T10:00:00Z'),
    });
    mistral.completePrompt.mockResolvedValueOnce(JSON.stringify({
      summary: 'Weekly product digest.',
      sentiment: 'neutral',
      tone: 'formal',
      priority: 2,
      urgency: 'high',
      labels: ['Updates'],
      keyTopics: ['release notes'],
      intent: 'fyi',
      escalationRisk: false,
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: false,
      followUpDate: null,
      followUpReason: null,
      smartReplies: [],
      confidence: 0.8,
      reasoning: 'Routine product update.',
    }));

    const result = await service.analyzeEmailUnified('tenant-1', 'email-2', 'en');

    expect(result.labels).toEqual(['Updates']);
    expect(result.labels).not.toContain('Important');
    expect(result.labels).not.toContain('Follow-up');
  });

  it('downgrades passive notifications so they do not create urgent follow-up noise', async () => {
    prisma.email.findFirst.mockResolvedValue({
      id: 'email-3',
      subject: 'Release notes digest',
      from: 'Platform Notifications <noreply@vercel.com>',
      to: ['davide@example.com'],
      bodyText: 'Here is your weekly changelog and release notes digest.',
      bodyHtml: null,
      snippet: 'Weekly changelog digest.',
      receivedAt: new Date('2026-03-31T10:00:00Z'),
    });
    mistral.completePrompt.mockResolvedValueOnce(JSON.stringify({
      summary: 'Weekly release digest.',
      sentiment: 'neutral',
      tone: 'formal',
      priority: 1,
      urgency: 'critical',
      labels: ['Updates'],
      keyTopics: ['release notes'],
      intent: 'fyi',
      escalationRisk: false,
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: true,
      followUpDate: '2026-04-01T09:00:00.000Z',
      followUpReason: 'Check release notes later',
      smartReplies: [],
      confidence: 0.74,
      reasoning: 'A platform update email.',
    }));

    const result = await service.analyzeEmailUnified('tenant-1', 'email-3', 'en');

    expect(result.priority).toBeGreaterThanOrEqual(3);
    expect(result.urgency).toBe('medium');
    expect(result.needsFollowUp).toBe(false);
    expect(result.followUpDate).toBeNull();
    expect(result.followUpReason).toBeNull();
  });

  it('preserves follow-up when an update contains a real action or deadline', async () => {
    prisma.email.findFirst.mockResolvedValue({
      id: 'email-4',
      subject: 'Production deployment failed - reply with ETA by 5pm',
      from: 'Buildkite Alerts <alerts@buildkite.com>',
      to: ['davide@example.com'],
      bodyText: 'The deployment failed and the team needs an ETA response by 17:00 today.',
      bodyHtml: null,
      snippet: 'Deployment failed and needs ETA.',
      receivedAt: new Date('2026-03-31T10:00:00Z'),
    });
    mistral.completePrompt.mockResolvedValueOnce(JSON.stringify({
      summary: 'Deployment failed and the team needs an ETA today.',
      sentiment: 'negative',
      tone: 'urgent',
      priority: 2,
      urgency: 'high',
      labels: ['Updates', 'Action Items'],
      keyTopics: ['deployment', 'ETA'],
      intent: 'action_required',
      escalationRisk: true,
      hasDeadline: true,
      deadlineDate: '2026-03-31T17:00:00.000Z',
      needsFollowUp: true,
      followUpDate: '2026-03-31T16:00:00.000Z',
      followUpReason: 'Provide ETA to the team',
      smartReplies: [],
      confidence: 0.91,
      reasoning: 'Critical failure with an explicit deadline.',
    }));

    const result = await service.analyzeEmailUnified('tenant-1', 'email-4', 'en');

    expect(result.labels).toEqual(['Updates', 'Action Items']);
    expect(result.needsFollowUp).toBe(true);
    expect(result.hasDeadline).toBe(true);
    expect(result.followUpReason).toBe('Provide ETA to the team');
  });

  it('boosts failed CI system alerts to high priority even without a deadline', async () => {
    prisma.email.findFirst.mockResolvedValue({
      id: 'email-5',
      subject: '[chetto1983/PMSync] Run failed: Frontend CI - main (f911fb8)',
      from: 'davide marchetto <notifications@github.com>',
      to: ['PMSync@noreply.github.com'],
      bodyText: 'Frontend CI workflow run. build-and-test failed. View results: https://github.com/chetto1983/PMSync/actions/runs/123',
      bodyHtml: null,
      snippet: 'Frontend CI workflow run build-and-test failed.',
      receivedAt: new Date('2026-04-01T09:28:00Z'),
    });
    mistral.completePrompt.mockResolvedValueOnce(JSON.stringify({
      summary: 'GitHub Actions reported a failed frontend CI run.',
      sentiment: 'neutral',
      tone: 'cold',
      priority: 3,
      urgency: 'medium',
      labels: ['Updates', 'Action Items'],
      keyTopics: ['GitHub Actions', 'CI/CD pipeline', 'Frontend CI workflow'],
      intent: 'action_required',
      escalationRisk: false,
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: true,
      followUpDate: null,
      followUpReason: 'Investigate the failed build',
      smartReplies: [],
      confidence: 0.98,
      reasoning: 'Routine but important system alert requiring investigation.',
    }));

    const result = await service.analyzeEmailUnified('tenant-1', 'email-5', 'en');

    expect(result.priority).toBe(2);
    expect(result.urgency).toBe('high');
    expect(result.labels).toEqual(['Updates', 'Action Items']);
    expect(result.needsFollowUp).toBe(true);
  });

  it('keeps analyze system prompts under the Mistral limit for tenants with many label rules', async () => {
    prisma.userLabel.findMany.mockResolvedValue(
      Array.from({ length: 18 }, (_, index) => ({
        name: `Rule ${index + 1}`,
        aiPrompt: `Use this label for complex customer and system situations ${index + 1}. `.repeat(12),
        defaultLane: index % 2 === 0 ? 'action-now' : 'review-later',
      })),
    );
    triageRuleService.buildTriageContext.mockImplementation(async (_tenantId: string, options?: { maxLength?: number }) => {
      const payload = `<LABEL_METADATA>\n${'meta line '.repeat(200)}\n</LABEL_METADATA>\n\n<TRIAGE_RULES>\n${'rule line '.repeat(220)}\n</TRIAGE_RULES>`;
      return typeof options?.maxLength === 'number' ? payload.slice(0, options.maxLength) : payload;
    });

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    const promptArgs = mistral.completePrompt.mock.calls.at(0)?.[0];
    expect(typeof promptArgs?.systemPrompt).toBe('string');
    expect(promptArgs.systemPrompt.length).toBeLessThanOrEqual(4600);
    expect(triageRuleService.buildTriageContext).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        includeLabelPrompts: false,
        maxRules: 20,
      }),
    );
  });
});
