import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAnalysisService } from '../email-analysis.service';

describe('EmailAnalysisService', () => {
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

    service = new EmailAnalysisService(prisma, mistral, utils, undefined as any);
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
});
