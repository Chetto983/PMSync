import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { generateText, streamText, embed } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { mswServer } from './setup';

const mistral = createMistral({ apiKey: 'msw-test-key' });

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('MSW-mocked Mistral API', () => {
  describe('chat completions', () => {
    it('returns deterministic text via generateText', async () => {
      const { text, finishReason, usage } = await generateText({
        model: mistral('mistral-small-latest'),
        prompt: 'This prompt is intercepted by MSW',
        maxOutputTokens: 50,
      });
      expect(text).toBe('Hello from MSW mock');
      expect(finishReason).toBe('stop');
      expect(usage.inputTokens).toBe(10);
      expect(usage.outputTokens).toBe(4);
    });

    it('streams deterministic chunks via streamText', async () => {
      const result = streamText({
        model: mistral('mistral-small-latest'),
        prompt: 'This prompt is intercepted by MSW',
        maxOutputTokens: 50,
      });
      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }
      const fullText = chunks.join('');
      expect(fullText).toBe('Hello from MSW mock');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('embeddings', () => {
    it('returns deterministic 1024-dim embedding via embed', async () => {
      const { embedding, usage } = await embed({
        model: mistral.embedding('mistral-embed'),
        value: 'test content for deterministic embedding',
      });
      expect(embedding).toHaveLength(1024);
      expect(
        embedding.every(
          (v) => typeof v === 'number' && Number.isFinite(v),
        ),
      ).toBe(true);
      const expectedFirst = Math.sin(0 + 0 * 0.1) * 0.5; // sin(0) * 0.5 = 0
      expect(embedding[0]).toBeCloseTo(expectedFirst, 5);
      expect(usage.tokens).toBeGreaterThan(0);
    });
  });
});
