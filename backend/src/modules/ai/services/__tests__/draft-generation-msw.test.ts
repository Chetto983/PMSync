/**
 * DraftGenerationService MSW Integration Test
 *
 * Tests draft generation with MSW-mocked Mistral responses.
 * Uses createGenerateHandler() to override non-streaming behavior.
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
import {
  DraftGenerationService,
  draftGenerationSchema,
} from '../draft-generation.service';
import draftFixture from '../../../../test/fixtures/ai/draft-fixture.json';

const server = setupServer(mistralChatHandler, mistralEmbedHandler);

const configService = {
  get: (key: string) => (key === 'MISTRAL_API_KEY' ? 'msw-fake-key' : undefined),
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return 'msw-fake-key';
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

// Mock PrismaService with email + thread data
const createMockPrisma = (email: any | null, threadEmails: any[] = []) => ({
  email: {
    findFirst: vi.fn().mockResolvedValue(email),
    findMany: vi.fn().mockResolvedValue(threadEmails),
  },
} as any);

const testEmail = {
  id: 'e-200',
  subject: 'Client Proposal Feedback',
  from: 'client@external.com',
  to: 'me@company.com',
  cc: null,
  bodyText: 'I have reviewed the proposal and have some feedback. Could you adjust sections 2 and 3?',
  threadId: 'thread-100',
  receivedAt: new Date(),
};

const threadEmails = [
  { from: 'me@company.com', subject: 'Client Proposal', bodyText: 'Please find attached the proposal.', receivedAt: new Date(Date.now() - 86400000) },
  { from: 'client@external.com', subject: 'Re: Client Proposal', bodyText: 'I have reviewed the proposal.', receivedAt: new Date() },
];

describe('DraftGenerationService (MSW)', () => {
  let service: DraftGenerationService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });

    const mistralProvider = new MistralProviderService(configService);
    const mockPrisma = createMockPrisma(testEmail, threadEmails);
    service = new DraftGenerationService(mistralProvider, mockPrisma, undefined);
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('generates draft with valid schema output', async () => {
    // 'email assistant' keyword matches draft system prompt
    server.use(createGenerateHandler({ 'email assistant': draftFixture }));
    const result = await service.generateDraft('test-tenant', {
      emailId: 'e-200',
      instruction: 'reply formally acknowledging feedback',
      tone: 'formal',
    });

    expect(result.error).toBeUndefined();
    const parsed = draftGenerationSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.subject).toBeTruthy();
    expect(result.data.body).toBeTruthy();
  });

  it('handles missing email gracefully', async () => {
    const mistralProvider = new MistralProviderService(configService);
    const nullPrisma = createMockPrisma(null);
    const nullService = new DraftGenerationService(mistralProvider, nullPrisma, undefined);

    const result = await nullService.generateDraft('test-tenant', {
      emailId: 'nonexistent',
      instruction: 'reply',
    });

    expect(result.error).toBe('Email not found');
    expect(result.data.body).toBe('');
  });

  it('confidence score is within 0-1 range', async () => {
    server.use(createGenerateHandler({ 'email assistant': draftFixture }));
    const result = await service.generateDraft('test-tenant', {
      emailId: 'e-200',
      instruction: 'reply casually',
    });

    expect(result.data.confidence).toBeGreaterThanOrEqual(0);
    expect(result.data.confidence).toBeLessThanOrEqual(1);
    expect(result.data.suggestedRecipients).toBeInstanceOf(Array);
  });
});
