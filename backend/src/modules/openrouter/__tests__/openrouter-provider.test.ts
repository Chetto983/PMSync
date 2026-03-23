import { describe, it, expect } from 'vitest';
import { embed, embedMany, generateText, streamText } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// Mistral — embeddings only
const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});

// OpenRouter — chat models (Qwen 3.5)
const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

describe('OpenRouterProviderService (real API)', () => {
  it('generates embedding with 1024 dimensions', async () => {
    const { embedding, usage } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: 'test embedding for pipeline validation',
      abortSignal: AbortSignal.timeout(15_000),
    });
    expect(embedding).toHaveLength(1024);
    expect(embedding.every(v => typeof v === 'number' && Number.isFinite(v))).toBe(true);
    expect(usage.tokens).toBeGreaterThan(0);
  }, 30_000);

  it('generates bulk embeddings maintaining order', async () => {
    const inputs = ['first text', 'second text', 'third text'];
    const { embeddings } = await embedMany({
      model: mistral.embedding('mistral-embed'),
      values: inputs,
      maxParallelCalls: 2,
      abortSignal: AbortSignal.timeout(30_000),
    });
    expect(embeddings).toHaveLength(3);
    expect(embeddings.every(e => e.length === 1024)).toBe(true);
  }, 45_000);

  it('generates text via OpenRouter (Qwen 3.5)', async () => {
    const { text, usage } = await generateText({
      model: openRouter.chat('qwen/qwen3.5-flash-02-23'),
      prompt: 'What is 2+2? Reply with just the number.',
      maxOutputTokens: 10,
      abortSignal: AbortSignal.timeout(15_000),
    });
    expect(text).toMatch(/4/);
    expect(text.length).toBeGreaterThan(0);
    expect(usage.totalTokens).toBeGreaterThan(0);
  }, 30_000);

  it('streams text response via OpenRouter', async () => {
    const result = streamText({
      model: openRouter.chat('qwen/qwen3.5-flash-02-23'),
      prompt: 'Count from 1 to 5, one number per line.',
      maxOutputTokens: 50,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }
    const fullText = chunks.join('');
    expect(fullText).toMatch(/1/);
    expect(fullText).toMatch(/5/);
  }, 30_000);
});
