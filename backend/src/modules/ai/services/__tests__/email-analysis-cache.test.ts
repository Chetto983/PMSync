import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAnalysisService } from '../email-analysis.service';

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
    service = new EmailAnalysisService(prisma, mistral, utils, triageRuleService as any, undefined as any);
  });

  it('uses cached analysis when locale and label rules signature match', async () => {
    const signature = service['computeLabelRulesSignature']([
      { name: 'Important', aiPrompt: 'Use only for urgent or business-critical emails that require prompt attention. Do not use for routine notifications, release notes, newsletters, or passive alerts.' },
      { name: 'Follow-up', aiPrompt: 'Use only when the user should revisit the email later to reply, check in, or wait for a response. Do not use for passive informational notifications.' },
      { name: 'Action Items', aiPrompt: 'Use when the email contains concrete tasks, deliverables, approvals, or deadlines that require someone to act.' },
      { name: 'Info', aiPrompt: 'Use for informational emails worth keeping that do not require action.' },
      { name: 'Personal', aiPrompt: 'Use for personal conversations, relationship-building messages, or informal 1:1 emails.' },
      { name: 'Finance', aiPrompt: 'Use for invoices, billing, payments, receipts, refunds, subscriptions, and money-related operations.' },
      { name: 'Promotions', aiPrompt: 'Use for marketing emails, sales offers, newsletters, discounts, and promotional campaigns. These are usually low priority and do not need follow-up.' },
      { name: 'Updates', aiPrompt: 'Use for product updates, announcements, release notes, changelogs, system alerts, and GitHub/Vercel/Railway notifications. Do not combine with Important or Follow-up unless the email clearly requires action, a reply, or a real deadline.' },
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
      suggestedActions: { locale: 'en', labels: ['Updates'], labelRulesSignature: signature },
      processedAt: new Date('2026-03-31T10:00:00Z'),
      email: { aiLabels: ['Updates'] },
    });

    const result = await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(result.summary).toBe('Cached summary');
    expect(mistral.completePrompt).not.toHaveBeenCalled();
  });

  it('recomputes analysis when label rules signature changes', async () => {
    prisma.userLabel.findMany.mockResolvedValue([
      { name: 'Updates', aiPrompt: 'Use only for passive system updates that do not need action.' },
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
      email: { aiLabels: ['Updates'] },
    });

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    expect(mistral.completePrompt).toHaveBeenCalledTimes(1);
    expect(prisma.emailAnalysis.upsert).toHaveBeenCalledTimes(1);
  });
});
