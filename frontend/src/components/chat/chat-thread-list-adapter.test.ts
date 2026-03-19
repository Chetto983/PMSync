import { apiClient } from '@/lib/api-client';
import { createPmSyncThreadListAdapter } from './chat-thread-list-adapter';

jest.mock('assistant-stream', () => ({
  createAssistantStream: (
    callback: (controller: { appendText: (text: string) => void }) => void,
  ) => {
    const chunks: Array<{
      type: string;
      path: number[];
      textDelta: string;
    }> = [];

    callback({
      appendText(text: string) {
        chunks.push({
          type: 'text-delta',
          path: [0],
          textDelta: text,
        });
      },
    });

    return {
      getReader() {
        let index = 0;
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }

            const value = chunks[index++];
            return { done: false, value };
          },
        };
      },
    };
  },
}));

jest.mock('@assistant-ui/core/react', () => ({
  RuntimeAdapterProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@assistant-ui/core', () => ({
  ExportedMessageRepository: {
    fromArray: (messages: unknown[]) => ({ messages }),
  },
}));

jest.mock('@assistant-ui/store', () => ({
  useAuiState: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('createPmSyncThreadListAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams the backend-generated title instead of throwing', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        conversation: {
          id: 'conv-1',
          title: 'Backend title',
        },
      },
    });

    const adapter = createPmSyncThreadListAdapter();
    const stream = await adapter.generateTitle('conv-1', []);
    const reader = stream.getReader();
    const chunks: Array<{ type: string; textDelta?: string }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as { type: string; textDelta?: string });
    }

    expect(apiClient.get).toHaveBeenCalledWith('/ai/chat/conversations/conv-1');
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          textDelta: 'Backend title',
        }),
      ]),
    );
  });
});
