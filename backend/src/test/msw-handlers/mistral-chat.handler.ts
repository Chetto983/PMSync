import { http, HttpResponse } from 'msw';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';

const CHAT_CHUNKS = [
  { content: 'Hello' },
  { content: ' from' },
  { content: ' MSW' },
  { content: ' mock' },
];

export const mistralChatHandler = http.post(
  MISTRAL_CHAT_URL,
  async ({ request }) => {
    const body = (await request.json()) as {
      stream?: boolean;
      model?: string;
    };

    if (!body.stream) {
      return HttpResponse.json({
        id: 'chatcmpl-msw-test',
        object: 'chat.completion',
        model: body.model ?? 'mistral-small-latest',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from MSW mock' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of CHAT_CHUNKS) {
          const sseData = JSON.stringify({
            id: 'chatcmpl-msw-test',
            object: 'chat.completion.chunk',
            model: body.model ?? 'mistral-small-latest',
            choices: [
              {
                index: 0,
                delta: { content: chunk.content },
                finish_reason: null,
              },
            ],
          });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        }
        const finalData = JSON.stringify({
          id: 'chatcmpl-msw-test',
          object: 'chat.completion.chunk',
          model: body.model ?? 'mistral-small-latest',
          choices: [
            { index: 0, delta: {}, finish_reason: 'stop' },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
          },
        });
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  },
);

/**
 * Default non-streaming handler for OpenRouter chat completions.
 * Returns a simple text response. Used as a fallback for generateText() calls.
 */
export const openRouterChatHandler = http.post(
  OPENROUTER_CHAT_URL,
  async ({ request }) => {
    const body = (await request.json()) as {
      stream?: boolean;
      model?: string;
    };

    if (!body.stream) {
      return HttpResponse.json({
        id: 'chatcmpl-msw-openrouter',
        object: 'chat.completion',
        model: body.model ?? 'qwen/qwen3.5-plus-02-15',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{}' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
        },
      });
    }

    // Streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of CHAT_CHUNKS) {
          const sseData = JSON.stringify({
            id: 'chatcmpl-msw-openrouter',
            object: 'chat.completion.chunk',
            model: body.model ?? 'qwen/qwen3.5-plus-02-15',
            choices: [
              {
                index: 0,
                delta: { content: chunk.content },
                finish_reason: null,
              },
            ],
          });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        }
        const finalData = JSON.stringify({
          id: 'chatcmpl-msw-openrouter',
          object: 'chat.completion.chunk',
          model: body.model ?? 'qwen/qwen3.5-plus-02-15',
          choices: [
            { index: 0, delta: {}, finish_reason: 'stop' },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
          },
        });
        controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  },
);

/**
 * Factory for fixture-driven non-streaming handler overrides.
 *
 * Usage in tests:
 *   server.use(createGenerateHandler({ 'executive assistant': briefingFixture }))
 *
 * Matches system prompt keywords to fixture data. Returns as non-streaming
 * chat completion response with JSON in message content (for parseJsonOutput).
 * Streaming requests pass through (return undefined).
 */
export function createGenerateHandler(
  fixtureMap: Record<string, unknown>,
) {
  return http.post(
    OPENROUTER_CHAT_URL,
    async ({ request }) => {
      const body = (await request.json()) as {
        stream?: boolean;
        messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
      };

      // Only handle non-streaming; streaming passthrough
      if (body.stream) return;

      // Extract system message text (handles both string and content-parts formats)
      const rawContent = body.messages?.find((m) => m.role === 'system')?.content;
      const systemMsg = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((p) => p.text || '').join(' ')
          : '';

      let responseContent = JSON.stringify({ error: 'no matching fixture' });

      for (const [key, fixture] of Object.entries(fixtureMap)) {
        if (systemMsg.toLowerCase().includes(key.toLowerCase())) {
          responseContent = JSON.stringify(fixture);
          break;
        }
      }

      return HttpResponse.json({
        id: 'chatcmpl-msw-generate',
        object: 'chat.completion',
        model: 'mistral-small-latest',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: responseContent },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });
    },
  );
}

/**
 * Factory for customizable streaming handler overrides.
 *
 * Usage in tests:
 *   server.use(createStreamingHandler(chunks))
 *
 * Overrides the default streaming response with custom content chunks.
 */
export function createStreamingHandler(
  chunks: Array<{ content: string }>,
) {
  return http.post(
    OPENROUTER_CHAT_URL,
    async ({ request }) => {
      const body = (await request.json()) as {
        stream?: boolean;
        model?: string;
      };

      // Only handle streaming; non-streaming passthrough
      if (!body.stream) return;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            const sseData = JSON.stringify({
              id: 'chatcmpl-msw-custom',
              object: 'chat.completion.chunk',
              model: body.model ?? 'mistral-small-latest',
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.content },
                  finish_reason: null,
                },
              ],
            });
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
          }
          const finalData = JSON.stringify({
            id: 'chatcmpl-msw-custom',
            object: 'chat.completion.chunk',
            model: body.model ?? 'mistral-small-latest',
            choices: [
              { index: 0, delta: {}, finish_reason: 'stop' },
            ],
            usage: {
              prompt_tokens: 50,
              completion_tokens: chunks.length * 5,
              total_tokens: 50 + chunks.length * 5,
            },
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new HttpResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },
  );
}
