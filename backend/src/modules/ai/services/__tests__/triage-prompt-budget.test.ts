import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAnalysisService } from '../email-analysis.service';
import { TriageRuleService } from '../triage-rule.service';
import { LabelResolutionService } from '../label-resolution.service';
import { TriageScoreService } from '../triage-score.service';
import { LaneAssignmentService } from '../lane-assignment.service';
import type { FewShotExample } from '../triage-correction.service';

describe('triage prompt budgets', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      emailAnalysis: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      email: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'email-1',
          subject: '[chetto1983/PMSync] Run failed: Frontend CI - main (b793652)',
          from: 'GitHub <notifications@github.com>',
          to: ['davide@example.com'],
          bodyText: 'Frontend CI workflow run failed. View workflow run for details.',
          bodyHtml: null,
          snippet: 'Frontend CI workflow run failed.',
          receivedAt: new Date('2026-04-02T08:00:00Z'),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userLabel: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 18 }, (_, index) => ({
            name: `Rule ${index + 1}`,
            aiPrompt: `Use this label for complex customer and system situations ${index + 1}. `.repeat(10),
            defaultLane: index % 2 === 0 ? 'action-now' : 'review-later',
            category: index % 3 === 0 ? 'workflow' : 'custom',
            suppressUrgency: index % 5 === 0,
            mutuallyExclusiveWith: index % 4 === 0 ? ['Rule 2'] : [],
          })),
        ),
      },
      tenant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          triageRules: Array.from({ length: 30 }, (_, index) => ({
            type: 'phrase',
            pattern: `critical production incident pattern ${index + 1} `.repeat(8),
            action: 'important',
            labelName: `Rule ${Math.min(index + 1, 18)}`,
          })),
        }),
      },
    };
  });

  it('compacts triage context without duplicating label aiPrompts', async () => {
    const triageRuleService = new TriageRuleService(prisma);

    const context = await triageRuleService.buildTriageContext('tenant-1', {
      includeLabelPrompts: false,
      maxLength: 420,
      maxRules: 6,
      maxLineLength: 90,
    });

    expect(context.length).toBeLessThanOrEqual(420);
    expect(context).toContain('<LABEL_METADATA>');
    expect(context).toContain('<TRIAGE_RULES>');
    expect(context).not.toContain('Use this label for complex customer');
  });

  it('keeps analyzeEmailUnified system prompts below the Mistral cap', async () => {
    const mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        summary: 'GitHub reported a failed frontend CI run that needs review.',
        sentiment: 'neutral',
        tone: 'cold',
        priority: 3,
        urgency: 'medium',
        labels: ['Rule 1'],
        keyTopics: ['frontend ci', 'workflow run'],
        intent: 'alert',
        actionability: 'todo',
        escalationRisk: false,
        hasDeadline: false,
        deadlineDate: null,
        needsFollowUp: true,
        followUpDate: null,
        followUpReason: 'Review the failed run',
        smartReplies: [],
        confidence: 0.91,
        reasoning: 'System alert with a concrete failure signal.',
      })),
    };
    const utils = {
      truncate: vi.fn((value: string) => value),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((error: unknown) => String(error)),
      mapAiErrorToHttpException: vi.fn((error: unknown) => error),
    };
    const service = new EmailAnalysisService(
      prisma,
      mistral as any,
      utils as any,
      new TriageRuleService(prisma),
      new LabelResolutionService(),
      new TriageScoreService(),
      new LaneAssignmentService(),
      undefined as any,
    );

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    const promptArgs = mistral.completePrompt.mock.calls[0]?.[0];
    const triageRulesSection = String(promptArgs.systemPrompt)
      .split('<TRIAGE_RULES>')[1]
      ?.split('</TRIAGE_RULES>')[0] ?? '';
    const labelMetadataSection = String(promptArgs.systemPrompt)
      .split('<LABEL_METADATA>')[1]
      ?.split('</LABEL_METADATA>')[0] ?? '';
    expect(promptArgs.systemPrompt.length).toBeLessThanOrEqual(4600);
    expect(triageRulesSection).not.toContain('Use this label for complex customer and system situations');
    expect(labelMetadataSection).not.toContain('Use this label for complex customer and system situations');
  });

  it('injects CORRECTIONS block when few-shot examples are provided (D-10)', async () => {
    const mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        summary: 'x', sentiment: 'neutral', tone: 'neutral', priority: 3, urgency: 'medium',
        labels: [], keyTopics: [], intent: 'fyi', actionability: 'none', escalationRisk: false,
        hasDeadline: false, deadlineDate: null, needsFollowUp: false, followUpDate: null,
        followUpReason: null, smartReplies: [], confidence: 0.8, reasoning: '',
      })),
    };
    const utils = {
      truncate: vi.fn((v: string) => v),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((e: unknown) => String(e)),
      mapAiErrorToHttpException: vi.fn((e: unknown) => e),
    };
    const canned: FewShotExample[] = [
      { pattern: 'boss@acme.com', oldValue: 'Newsletter', newValue: 'Work', count: 5 },
      { pattern: 'boss@acme.com', oldValue: 'Sales', newValue: 'Important', count: 3 },
      { pattern: 'boss@acme.com', oldValue: 'Promo', newValue: 'Review', count: 2 },
    ];
    const triageCorrection = {
      getFewShotExamples: vi.fn().mockResolvedValue(canned),
    };
    const service = new EmailAnalysisService(
      prisma,
      mistral as any,
      utils as any,
      new TriageRuleService(prisma),
      new LabelResolutionService(),
      new TriageScoreService(),
      new LaneAssignmentService(),
      undefined as any,
      triageCorrection as any,
    );

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');

    const promptArgs = mistral.completePrompt.mock.calls[0]?.[0];
    const systemPrompt = String(promptArgs.systemPrompt);
    expect(systemPrompt).toContain('<CORRECTIONS>');
    expect(systemPrompt).toContain('</CORRECTIONS>');
    expect(systemPrompt.length).toBeLessThanOrEqual(4600);
  });

  it('CORRECTIONS block stays under 20% of optional budget (D-10 cap)', async () => {
    const mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        summary: 'x', sentiment: 'neutral', tone: 'neutral', priority: 3, urgency: 'medium',
        labels: [], keyTopics: [], intent: 'fyi', actionability: 'none', escalationRisk: false,
        hasDeadline: false, deadlineDate: null, needsFollowUp: false, followUpDate: null,
        followUpReason: null, smartReplies: [], confidence: 0.8, reasoning: '',
      })),
    };
    const utils = {
      truncate: vi.fn((v: string) => v),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((e: unknown) => String(e)),
      mapAiErrorToHttpException: vi.fn((e: unknown) => e),
    };
    // Intentionally over-long old/new values — each line will be capped at 80 chars by sanitize.
    const canned: FewShotExample[] = [
      { pattern: 'verylongsendername@some-company-domain.example.com', oldValue: 'LongLabelName_ABCDEFGHIJ', newValue: 'AnotherLongLabelName_XYZ', count: 42 },
      { pattern: 'verylongsendername@some-company-domain.example.com', oldValue: 'Marketing-Newsletter-Old', newValue: 'WorkImportantEscalation', count: 7 },
      { pattern: 'verylongsendername@some-company-domain.example.com', oldValue: 'Promotional-Old-Label-XY', newValue: 'ReviewLater-TestingCap', count: 2 },
    ];
    const triageCorrection = { getFewShotExamples: vi.fn().mockResolvedValue(canned) };
    const service = new EmailAnalysisService(
      prisma, mistral as any, utils as any, new TriageRuleService(prisma),
      new LabelResolutionService(), new TriageScoreService(), new LaneAssignmentService(),
      undefined as any, triageCorrection as any,
    );

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');
    const promptArgs = mistral.completePrompt.mock.calls[0]?.[0];
    const systemPrompt = String(promptArgs.systemPrompt);
    const correctionsSection = systemPrompt.split('<CORRECTIONS>')[1]?.split('</CORRECTIONS>')[0] ?? '';
    // Each line ≤ 80 chars, max 3 lines — much tighter than 20% of ~4000-char budget.
    expect(correctionsSection.length).toBeLessThanOrEqual(300);
    expect(systemPrompt.length).toBeLessThanOrEqual(4600);
  });

  it('total prompt length remains <= 4600 chars WITH labels + corrections slices active (invariant)', async () => {
    const mistral = {
      completePrompt: vi.fn().mockResolvedValue(JSON.stringify({
        summary: 'x', sentiment: 'neutral', tone: 'neutral', priority: 3, urgency: 'medium',
        labels: [], keyTopics: [], intent: 'fyi', actionability: 'none', escalationRisk: false,
        hasDeadline: false, deadlineDate: null, needsFollowUp: false, followUpDate: null,
        followUpReason: null, smartReplies: [], confidence: 0.8, reasoning: '',
      })),
    };
    const utils = {
      truncate: vi.fn((v: string) => v),
      linkEmailToUserLabels: vi.fn().mockResolvedValue(undefined),
      getErrorMessage: vi.fn((e: unknown) => String(e)),
      mapAiErrorToHttpException: vi.fn((e: unknown) => e),
    };
    const canned: FewShotExample[] = [
      { pattern: 'user@acme.com', oldValue: 'A', newValue: 'B', count: 5 },
      { pattern: 'user@acme.com', oldValue: 'C', newValue: 'D', count: 4 },
      { pattern: 'user@acme.com', oldValue: 'E', newValue: 'F', count: 3 },
    ];
    const triageCorrection = { getFewShotExamples: vi.fn().mockResolvedValue(canned) };
    const service = new EmailAnalysisService(
      prisma, mistral as any, utils as any, new TriageRuleService(prisma),
      new LabelResolutionService(), new TriageScoreService(), new LaneAssignmentService(),
      undefined as any, triageCorrection as any,
    );

    await service.analyzeEmailUnified('tenant-1', 'email-1', 'en');
    const promptArgs = mistral.completePrompt.mock.calls[0]?.[0];
    expect(String(promptArgs.systemPrompt).length).toBeLessThanOrEqual(4600);
  });
});
