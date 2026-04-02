import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAnalysisService } from '../email-analysis.service';
const TEST_LABELS = [
  {
    name: 'Updates',
    aiPrompt: 'Use for product updates.',
    category: 'suppression',
    suppressUrgency: true,
    mutuallyExclusiveWith: [],
    defaultLane: 'review-later',
  },
  {
    name: 'Important',
    aiPrompt: 'Use for urgent emails.',
    category: 'workflow',
    suppressUrgency: false,
    mutuallyExclusiveWith: [],
    defaultLane: 'action-now',
  },
];

describe('EmailAnalysisService cache signature', () => {
  let prisma: any;
  let mistral: any;
  let utils: any;
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
          subject: 'System alert',
          from: 'alerts@example.com',
          to: ['davide@example.com'],
          bodyText: 'Deployment failed on production.',
          bodyHtml: null,
          snippet: 'Deployment failed.',
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
        summary: 'Deployment failed on production.',
        sentiment: 'neutral',
        tone: 'formal',
        priority: 2,
        urgency: 'high',
        labels: ['Updates', 'Action Items'],
        keyTopics: ['deployment'],
        intent: 'action_required',
        escalationRisk: true,
        hasDeadline: false,
        deadlineDate: null,
        needsFollowUp: true,
        followUpDate: null,
        followUpReason: 'Investigate the failed deployment',
        smartReplies: [],
        confidence: 0.9,
        reasoning: 'This requires investigation.',
      })),
    };

    utils = {
      truncate: vi.fn((value: string) => value),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((error: unknown) => String(error)),
      mapAiErrorToHttpException: vi.fn((error: unknown) => error),
    };

    const triageRuleService = {
      getTriageRules: vi.fn().mockResolvedValue([]),
      setTriageRules: vi.fn().mockResolvedValue([]),
      buildTriageContext: vi.fn().mockResolvedValue(''),
    };
    const labelResolution = {
      resolve: vi.fn().mockReturnValue({ labels: ['Updates', 'Action Items'], suppressUrgency: false }),
      normaliseLabel: vi.fn((label: string) => label),
    };
    const triageScoreService = {
      compute: vi.fn().mockReturnValue({
        priority: 2, urgency: 'high', deadlineDate: null,
        needsFollowUp: true, followUpDate: null, followUpReason: 'Investigate the failed deployment',
        priorityReason: 'Escalation risk: System alert',
      }),
    };
    const laneAssignment = {
      assignLane: vi.fn().mockReturnValue({ lane: 'action-now', laneReason: 'Escalation risk detected' }),
    };
    service = new EmailAnalysisService(
      prisma, mistral, utils, triageRuleService as any,
      labelResolution as any, triageScoreService as any, laneAssignment as any,
      undefined as any,
    );
  });

  it('uses cached analysis when locale and label rules signature match', async () => {
    prisma.userLabel.findMany.mockResolvedValue(TEST_LABELS);
    const signature = service['computeLabelRulesSignature'](TEST_LABELS);
    prisma.emailAnalysis.findFirst.mockResolvedValue({
      priority: 'HIGH',
      category: 'OTHER',
      sentiment: 'NEUTRAL',
      summary: 'Cached summary',
      keyPoints: [],
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: false,
      followUpDate: null,
      suggestedActions: { locale: 'en', labels: ['Updates'], labelRulesSignature: signature },
      processedAt: new Date('2026-03-31T10:00:00Z'),
      email: { aiLabels: ['Updates'], aiPriority: 2 },
    });

    const result = await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(result.summary).toBe('Cached summary');
    expect(mistral.completePrompt).not.toHaveBeenCalled();
  });

  it('recomputes analysis when label rules signature changes', async () => {
    prisma.userLabel.findMany.mockResolvedValue([
      {
        name: 'Updates',
        aiPrompt: 'Use only for passive system updates that do not need action.',
        category: 'suppression',
        suppressUrgency: true,
        mutuallyExclusiveWith: [],
        defaultLane: 'review-later',
      },
    ]);
    prisma.emailAnalysis.findFirst.mockResolvedValue({
      priority: 'HIGH',
      category: 'OTHER',
      sentiment: 'NEUTRAL',
      summary: 'Cached summary',
      keyPoints: [],
      hasDeadline: false,
      deadlineDate: null,
      needsFollowUp: false,
      followUpDate: null,
      suggestedActions: { locale: 'en', labels: ['Updates'], labelRulesSignature: 'stale-signature' },
      processedAt: new Date('2026-03-31T10:00:00Z'),
      email: { aiLabels: ['Updates'], aiPriority: 2 },
    });

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(mistral.completePrompt).toHaveBeenCalledTimes(1);
    expect(prisma.emailAnalysis.upsert).toHaveBeenCalledTimes(1);
  });

  it('preserves stored 1-5 priority on cache hits when enum precision is lossy', async () => {
    prisma.userLabel.findMany.mockResolvedValue(TEST_LABELS);
    const signature = service['computeLabelRulesSignature'](TEST_LABELS);
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
      suggestedActions: { locale: 'en', labels: ['Updates'], labelRulesSignature: signature },
      processedAt: new Date('2026-03-31T10:00:00Z'),
      email: { aiLabels: ['Updates'], aiPriority: 4 },
    });

    const result = await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(result.priority).toBe(4);
    expect(mistral.completePrompt).not.toHaveBeenCalled();
  });
});
