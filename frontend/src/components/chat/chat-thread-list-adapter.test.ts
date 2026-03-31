import { createElement } from 'react';
import { render } from '@testing-library/react';
import { apiClient } from '@/lib/api-client';
import { useAuiState } from '@assistant-ui/store';
import { createPmSyncThreadListAdapter } from './chat-thread-list-adapter';

const runtimeAdapterProviderMock = jest.fn(
  ({ children }: { children: unknown; adapters: unknown }) => children,
);

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
  RuntimeAdapterProvider: (props: { children: unknown; adapters: unknown }) => {
    runtimeAdapterProviderMock(props);
    return props.children;
  },
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
    post: jest.fn(),
  },
}));

describe('createPmSyncThreadListAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runtimeAdapterProviderMock.mockClear();
    (useAuiState as jest.Mock).mockImplementation((selector) =>
      selector({
        threadListItem: {
          id: 'thread-1',
          remoteId: 'conv-1',
        },
      }),
    );
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

  it('loads persisted backend messages through withFormat for existing threads', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        conversation: {
          id: 'conv-1',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: { type: 'text', text: 'Quali riunioni ho oggi?' },
              createdAt: '2026-03-19T10:00:00.000Z',
            },
            {
              id: 'tool-1',
              role: 'tool',
              toolCallId: 'call-1',
              content: {
                toolName: 'view_calendar',
                input: { day: 'today' },
                output: { total: 1 },
              },
              createdAt: '2026-03-19T10:00:01.000Z',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: {
                type: 'text',
                text: 'Oggi hai solo un evento in calendario.',
              },
              createdAt: '2026-03-19T10:00:02.000Z',
            },
          ],
        },
      },
    });

    const adapter = createPmSyncThreadListAdapter();
    const Provider = adapter.unstable_Provider;

    render(
      createElement(
        Provider,
        null,
        createElement('div', null, 'child'),
      ),
    );

    const providerProps = runtimeAdapterProviderMock.mock.calls.at(-1)?.[0] as
      | {
          adapters?: {
            history?: {
      withFormat?: (format: {
        format: string;
        encode: (value: unknown) => unknown;
        decode: (value: unknown) => unknown;
        getId: (message: { id: string }) => string;
      }) => {
        load: () => Promise<{
          headId?: string | null;
          messages: Array<{
            parentId: string | null;
            message: {
              id: string;
              role: string;
              parts: Array<{ type: string; toolName?: string }>;
            };
          }>;
        }>;
      };
            };
          };
        }
      | undefined;

    const history = providerProps?.adapters?.history;
    expect(history).toBeDefined();

    const formattedHistory = history!.withFormat?.({
      format: 'ai-sdk/v6',
      encode: (value) => value,
      decode: (value) => value,
      getId: (message) => message.id,
    });

    expect(formattedHistory).toBeDefined();

    const repo = await formattedHistory!.load();

    expect(apiClient.get).toHaveBeenCalledWith('/ai/chat/conversations/conv-1');
    expect(repo).toMatchObject({
      headId: 'assistant-1',
      messages: [
        {
          parentId: null,
          message: {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text' }],
          },
        },
        {
          parentId: 'user-1',
          message: {
            id: 'tool-1',
            role: 'assistant',
            parts: [{ type: 'dynamic-tool', toolName: 'view_calendar' }],
          },
        },
        {
          parentId: 'tool-1',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text' }],
          },
        },
      ],
    });
  });

  it('converts stored assistant tool-call parts into dynamic-tool UI parts', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        conversation: {
          id: 'conv-1',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [
                { type: 'text', text: 'I can send that email.' },
                {
                  type: 'tool-call',
                  toolCallId: 'call-approve-1',
                  toolName: 'send_email',
                  input: { to: 'test@example.com', subject: 'Hello' },
                },
              ],
              createdAt: '2026-03-19T10:00:02.000Z',
            },
          ],
        },
      },
    });

    const adapter = createPmSyncThreadListAdapter();
    const Provider = adapter.unstable_Provider;

    render(
      createElement(
        Provider,
        null,
        createElement('div', null, 'child'),
      ),
    );

    const providerProps = runtimeAdapterProviderMock.mock.calls.at(-1)?.[0] as
      | {
          adapters?: {
            history?: {
              withFormat?: (format: {
                format: string;
                encode: (value: unknown) => unknown;
                decode: (value: unknown) => unknown;
                getId: (message: { id: string }) => string;
              }) => {
                load: () => Promise<{
                  headId?: string | null;
                  messages: Array<{
                    parentId: string | null;
                    message: {
                      id: string;
                      role: string;
                      parts: Array<Record<string, unknown>>;
                    };
                  }>;
                }>;
              };
            };
          };
        }
      | undefined;

    const repo = await providerProps!.adapters!.history!.withFormat!({
      format: 'ai-sdk/v6',
      encode: (value) => value,
      decode: (value) => value,
      getId: (message) => message.id,
    }).load();

    expect(repo.messages).toEqual([
      {
        parentId: null,
        message: {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'I can send that email.' },
            {
              type: 'dynamic-tool',
              toolName: 'send_email',
              toolCallId: 'call-approve-1',
              state: 'input-available',
              input: { to: 'test@example.com', subject: 'Hello' },
            },
          ],
        },
      },
    ]);
  });

  it('loads only the last 50 messages from conversation history', async () => {
    const messages = Array.from({ length: 60 }, (_, index) => ({
      id: `message-${index + 1}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: {
        type: 'text',
        text: `message ${index + 1}`,
      },
      createdAt: `2026-03-19T10:${String(index).padStart(2, '0')}:00.000Z`,
    }));

    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        conversation: {
          id: 'conv-1',
          messages,
        },
      },
    });

    const adapter = createPmSyncThreadListAdapter();
    const Provider = adapter.unstable_Provider;

    render(
      createElement(
        Provider,
        null,
        createElement('div', null, 'child'),
      ),
    );

    const providerProps = runtimeAdapterProviderMock.mock.calls.at(-1)?.[0] as
      | {
          adapters?: {
            history?: {
              withFormat?: (format: {
                format: string;
                encode: (value: unknown) => unknown;
                decode: (value: unknown) => unknown;
                getId: (message: { id: string }) => string;
              }) => {
                load: () => Promise<{
                  headId?: string | null;
                  messages: Array<{
                    parentId: string | null;
                    message: {
                      id: string;
                      role: string;
                      parts: Array<Record<string, unknown>>;
                    };
                  }>;
                }>;
              };
            };
          };
        }
      | undefined;

    const repo = await providerProps!.adapters!.history!.withFormat!({
      format: 'ai-sdk/v6',
      encode: (value) => value,
      decode: (value) => value,
      getId: (message) => message.id,
    }).load();

    expect(repo.messages).toHaveLength(50);
    expect(repo.messages[0]).toMatchObject({
      parentId: null,
      message: {
        id: 'message-11',
      },
    });
    expect(repo.messages.at(-1)).toMatchObject({
      message: {
        id: 'message-60',
      },
    });
  });
});
