/**
 * FollowUpDetectionService MSW Integration Test
 *
 * Tests follow-up detection with MSW-mocked Mistral responses.
 * Uses createGenerateHandler() to override non-streaming behavior.
 *
 * Phase 26 Plan 03 -- TEST-03
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import {
  mistralChatHandler,
  openRouterChatHandler,
  createGenerateHandler,
} from '../../../../test/msw-handlers/mistral-chat.handler';
import { mistralEmbedHandler } from '../../../../test/msw-handlers/mistral-embed.handler';
import { ConfigService } from '@nestjs/config';
import { MistralProviderService } from '../../../mistral/mistral-provider.service';
import {
  FollowUpDetectionService,
  followUpDetectionSchema,
} from '../follow-up-detection.service';
import followUpFixture from '../../../../test/fixtures/ai/follow-up-fixture.json';

const server = setupServer(mistralChatHandler, openRouterChatHandler, mistralEmbedHandler);

const CONFIG_MAP: Record<string, string> = {
  MISTRAL_API_KEY: 'msw-fake-key',
  OPENROUTER_API_KEY: 'msw-fake-openrouter-key',
};

const configService = {
  get: (key: string, defaultValue?: string) => CONFIG_MAP[key] ?? defaultValue,
  getOrThrow: (key: string) => {
    if (CONFIG_MAP[key]) return CONFIG_MAP[key];
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

// Mock PrismaService returning test email data
const createMockPrisma = (emails: any[] = []) => ({
  email: {
    findMany: vi.fn().mockResolvedValue(emails),
    findFirst: vi.fn().mockResolvedValue({ provider: { userId: 'user-001' } }),
  },
  emailFollowUp: {
    upsert: vi.fn().mockResolvedValue({}),
  },
} as any);

const testEmails = [
  { id: 'e-101', subject: 'Updated Timeline', from: 'client@ext.com', to: 'me@co.com', bodyText: 'Please send the updated timeline by Friday', receivedAt: new Date() },
  { id: 'e-102', subject: 'Newsletter', from: 'news@service.com', to: 'me@co.com', bodyText: 'Weekly digest', receivedAt: new Date() },
  { id: 'e-103', subject: 'Q1 Status Report', from: 'manager@co.com', to: 'me@co.com', bodyText: 'Please send status report', receivedAt: new Date() },
  { id: 'e-104', subject: 'Meeting Notes', from: 'colleague@co.com', to: 'me@co.com', bodyText: 'Here are the notes from today', receivedAt: new Date() },
  { id: 'e-105', subject: 'Invoice Attached', from: 'billing@vendor.com', to: 'me@co.com', bodyText: 'Invoice #1234 attached', receivedAt: new Date() },
];

describe('FollowUpDetectionService (MSW)', () => {
  let service: FollowUpDetectionService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });

    const mistralProvider = new MistralProviderService(configService);
    const mockPrisma = createMockPrisma(testEmails);
    service = new FollowUpDetectionService(mistralProvider, mockPrisma, undefined);
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('detects follow-ups in batch with valid schema output', async () => {
    // 'analyze' keyword matches the follow-up system prompt
    server.use(createGenerateHandler({ 'analyze': followUpFixture }));
    const result = await service.detectFollowUps('test-tenant', 24);

    expect(result.error).toBeUndefined();
    const parsed = followUpDetectionSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.detectedFollowUps.length).toBeGreaterThan(0);
  });

  it('handles empty email batch gracefully', async () => {
    // Create service with empty email list
    const mistralProvider = new MistralProviderService(configService);
    const emptyPrisma = createMockPrisma([]);
    const emptyService = new FollowUpDetectionService(mistralProvider, emptyPrisma, undefined);

    const result = await emptyService.detectFollowUps('test-tenant', 24);

    expect(result.error).toBeUndefined();
    expect(result.data.detectedFollowUps).toEqual([]);
    expect(result.data.batchSummary.totalAnalyzed).toBe(0);
  });

  it('batchSummary counts match array length', async () => {
    server.use(createGenerateHandler({ 'analyze': followUpFixture }));
    const result = await service.detectFollowUps('test-tenant', 24);

    expect(result.data.batchSummary.totalDetected)
      .toBe(result.data.detectedFollowUps.length);
    // High urgency count should be <= total detected
    expect(result.data.batchSummary.highUrgencyCount)
      .toBeLessThanOrEqual(result.data.batchSummary.totalDetected);
    // Confidence scores within 0-1 range
    for (const fu of result.data.detectedFollowUps) {
      expect(fu.confidence).toBeGreaterThanOrEqual(0);
      expect(fu.confidence).toBeLessThanOrEqual(1);
    }
  });
});
