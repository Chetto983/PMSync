/**
 * BriefingService MSW Integration Test
 *
 * Tests briefing generation with MSW-mocked Mistral responses.
 * Uses createGenerateHandler() to override non-streaming behavior
 * with fixture-specific responses per test.
 *
 * Phase 26 Plan 03 -- TEST-03
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import {
  mistralChatHandler,
  createGenerateHandler,
} from '../../../../test/msw-handlers/mistral-chat.handler';
import { mistralEmbedHandler } from '../../../../test/msw-handlers/mistral-embed.handler';
import { ConfigService } from '@nestjs/config';
import { MistralProviderService } from '../../../mistral/mistral-provider.service';
import { BriefingService, briefingSchema } from '../briefing.service';
import briefingFixture from '../../../../test/fixtures/ai/briefing-fixture.json';

// MSW server with default handlers
const server = setupServer(mistralChatHandler, mistralEmbedHandler);

// Fake ConfigService for MistralProviderService (MSW intercepts actual HTTP)
const configService = {
  get: (key: string) => (key === 'MISTRAL_API_KEY' ? 'msw-fake-key' : undefined),
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return 'msw-fake-key';
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

// Mock PrismaService returning test data
const mockPrisma = {
  email: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'e-001', subject: 'Q1 Budget Review', from: 'cfo@company.com', snippet: 'Deadline tomorrow', receivedAt: new Date() },
      { id: 'e-002', subject: 'Client Proposal', from: 'client@external.com', snippet: 'Awaiting response', receivedAt: new Date() },
    ]),
    count: vi.fn().mockResolvedValue(12),
  },
  calendarEvent: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'ev-001', title: 'Team Standup', startTime: new Date(), endTime: new Date(Date.now() + 1800000) },
    ]),
  },
  emailFollowUp: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'fu-001', emailId: 'e-003', reason: 'Promised deliverables', dueDate: new Date() },
    ]),
  },
  contact: {
    findMany: vi.fn().mockResolvedValue([
      { id: 'c-001', displayName: 'Bob Smith', lastInteractedAt: new Date(Date.now() - 45 * 86400000) },
    ]),
  },
} as any;

describe('BriefingService (MSW)', () => {
  let briefingService: BriefingService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });

    // Override with briefing fixture -- 'executive assistant' keyword matches system prompt
    server.use(createGenerateHandler({ 'executive assistant': briefingFixture }));

    const mistralProvider = new MistralProviderService(configService);
    briefingService = new BriefingService(mistralProvider, mockPrisma, undefined);
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('generates briefing with valid schema output', async () => {
    server.use(createGenerateHandler({ 'executive assistant': briefingFixture }));
    const result = await briefingService.generateBriefing('test-tenant');

    expect(result.error).toBeUndefined();
    // Validate output against Zod schema
    const parsed = briefingSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.priorityEmails.length).toBeGreaterThan(0);
    expect(result.data.executiveSummary).toBeTruthy();
  });

  it('returns fallback on schema validation failure', async () => {
    // Override MSW to return garbage content
    server.use(createGenerateHandler({ 'executive assistant': { garbage: true } }));
    const result = await briefingService.generateBriefing('test-tenant');

    // Should either get a valid fallback or an error field
    expect(result.data).toBeDefined();
    expect(result.data.executiveSummary).toBeDefined();
  });

  it('validates all required fields are present', async () => {
    server.use(createGenerateHandler({ 'executive assistant': briefingFixture }));
    const result = await briefingService.generateBriefing('test-tenant');

    expect(result.data).toHaveProperty('priorityEmails');
    expect(result.data).toHaveProperty('calendarSnapshot');
    expect(result.data).toHaveProperty('pendingFollowUps');
    expect(result.data).toHaveProperty('executiveSummary');
    expect(result.data).toHaveProperty('staleContactsAlert');
    expect(result.data).toHaveProperty('draftSuggestions');
    expect(result.data).toHaveProperty('emailVolumeTrends');
    expect(result.data).toHaveProperty('focusTimeRecommendations');
  });
});
