import { http, HttpResponse } from 'msw';

function makeDeterministicVector(seed: number): number[] {
  return Array.from(
    { length: 1024 },
    (_, i) => Math.sin(seed + i * 0.1) * 0.5,
  );
}

export const mistralEmbedHandler = http.post(
  'https://api.mistral.ai/v1/embeddings',
  async ({ request }) => {
    const body = (await request.json()) as {
      model?: string;
      input: string | string[];
    };
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const data = inputs.map((text, index) => ({
      object: 'embedding' as const,
      index,
      embedding: makeDeterministicVector(index),
    }));
    return HttpResponse.json({
      id: 'embd-msw-test',
      object: 'list',
      model: body.model ?? 'mistral-embed',
      data,
      usage: {
        prompt_tokens: inputs.reduce((sum, t) => sum + t.length, 0),
        total_tokens: inputs.reduce((sum, t) => sum + t.length, 0),
      },
    });
  },
);
