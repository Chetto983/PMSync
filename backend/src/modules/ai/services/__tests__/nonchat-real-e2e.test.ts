/**
 * Non-Chat AI E2E Validation Gate -- Real Mistral API.
 *
 * Requires: MISTRAL_API_KEY environment variable.
 * Skip in CI unless MISTRAL_API_KEY is set.
 *
 * Validates that real LLM responses conform to Zod schemas
 * for all 3 non-chat AI services.
 *
 * Phase 26 Plan 03 -- TEST-03
 */
import { describe, it, expect, beforeAll } from 'vitest';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { MistralProviderService } from '../../../mistral/mistral-provider.service';
import { BriefingService, briefingSchema } from '../briefing.service';
import {
  FollowUpDetectionService,
  followUpDetectionSchema,
} from '../follow-up-detection.service';
import {
  DraftGenerationService,
  draftGenerationSchema,
} from '../draft-generation.service';
import { vi } from 'vitest';

const SKIP = !process.env.MISTRAL_API_KEY;

// Fake ConfigService with real API key
const configService = {
  get: (key: string) =>
    key === 'MISTRAL_API_KEY' ? process.env.MISTRAL_API_KEY : undefined,
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return process.env.MISTRAL_API_KEY!;
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

// Mock PrismaService returning fixture data for all services
const mockPrisma = {
  email: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'e-001', subject: 'Q1 Budget Review', from: 'cfo@company.com', to: 'me@co.com', snippet: 'Budget deadline is tomorrow', bodyText: 'Please review the Q1 budget and provide feedback by tomorrow EOD.', receivedAt: new Date() },
      { id: 'e-002', subject: 'Client Proposal', from: 'client@ext.com', to: 'me@co.com', snippet: 'Awaiting your response', bodyText: 'We reviewed your proposal. Could you adjust the timeline in section 3?', receivedAt: new Date() },
      { id: 'e-003', subject: 'Team Lunch Friday', from: 'hr@co.com', to: 'me@co.com', snippet: 'Friday lunch', bodyText: 'Reminder: Team lunch this Friday at noon.', receivedAt: new Date() },
      { id: 'e-004', subject: 'Invoice #1234', from: 'billing@vendor.com', to: 'me@co.com', snippet: 'Invoice attached', bodyText: 'Please find attached invoice #1234 for services rendered.', receivedAt: new Date() },
      { id: 'e-005', subject: 'Weekly Newsletter', from: 'news@digest.com', to: 'me@co.com', snippet: 'This week in tech', bodyText: 'Weekly technology news digest.', receivedAt: new Date() },
    ]),
    findFirst: vi.fn().mockResolvedValue({
      id: 'e-002', subject: 'Client Proposal', from: 'client@ext.com', to: 'me@co.com', cc: null,
      bodyText: 'We reviewed your proposal. Could you adjust the timeline in section 3?',
      threadId: 'thread-100', receivedAt: new Date(),
    }),
    count: vi.fn().mockResolvedValue(15),
  },
  calendarEvent: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'ev-001', title: 'Team Standup', startTime: new Date(), endTime: new Date(Date.now() + 1800000) },
      { id: 'ev-002', title: 'Client Call', startTime: new Date(Date.now() + 7200000), endTime: new Date(Date.now() + 10800000) },
    ]),
  },
  emailFollowUp: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'fu-001', emailId: 'e-001', reason: 'Budget deadline', dueDate: new Date(Date.now() + 86400000) },
    ]),
    count: vi.fn().mockResolvedValue(1),
  },
  contact: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'c-001', displayName: 'Bob Smith', lastInteractedAt: new Date(Date.now() - 60 * 86400000) },
    ]),
  },
} as any;

describe.skipIf(SKIP)('Non-Chat AI E2E (Real Mistral)', () => {
  let mistralProvider: MistralProviderService;

  beforeAll(() => {
    mistralProvider = new MistralProviderService(configService);
  });

  it('generates real daily briefing with valid schema', async () => {
    const service = new BriefingService(mistralProvider, mockPrisma, undefined);
    const result = await service.generateBriefing('test-tenant');

    const parsed = briefingSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.executiveSummary).toBeTruthy();
    expect(result.data.executiveSummary.length).toBeGreaterThan(10);

    // Log token usage for cost tracking
    console.log('[E2E] Briefing generated successfully');
  }, 60_000);

  it('detects follow-ups on real emails with valid schema', async () => {
    const service = new FollowUpDetectionService(
      mistralProvider,
      mockPrisma,
      undefined,
    );
    const result = await service.detectFollowUps('test-tenant', 24);

    const parsed = followUpDetectionSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.batchSummary.totalAnalyzed).toBeGreaterThanOrEqual(5);

    console.log(
      `[E2E] Follow-up detection: ${result.data.batchSummary.totalDetected} detected out of ${result.data.batchSummary.totalAnalyzed}`,
    );
  }, 60_000);

  it('generates real draft with valid schema', async () => {
    const service = new DraftGenerationService(
      mistralProvider,
      mockPrisma,
      undefined,
    );
    const result = await service.generateDraft('test-tenant', {
      emailId: 'e-002',
      instruction: 'reply formally acknowledging the feedback and promising revised timeline',
      tone: 'formal',
    });

    const parsed = draftGenerationSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.body).toBeTruthy();
    expect(result.data.body.length).toBeGreaterThan(10);
    expect(result.data.subject).toBeTruthy();

    console.log(
      `[E2E] Draft generated: subject="${result.data.subject}", tone=${result.data.tone}, confidence=${result.data.confidence}`,
    );
  }, 60_000);
});
