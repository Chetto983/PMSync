import { http, HttpResponse } from 'msw';

const CHAT_CHUNKS = [
  { content: 'Hello' },
  { content: ' from' },
  { content: ' MSW' },
  { content: ' mock' },
];

export const mistralChatHandler = http.post(
  'https://api.mistral.ai/v1/chat/completions',
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
