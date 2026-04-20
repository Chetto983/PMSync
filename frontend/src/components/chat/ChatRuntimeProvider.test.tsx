import React from 'react';
import { render } from '@testing-library/react';

const switchToThreadMock = jest.fn();
const setRuntimeMock = jest.fn();

let runtimeState = {
  isLoading: false,
  threadIds: [] as string[],
  newThreadId: 'thread-new',
  mainThreadId: 'thread-new',
};

jest.mock('@/lib/api-client', () => ({
  API_BASE_URL: 'http://localhost:4000',
  getCsrfToken: jest.fn().mockResolvedValue('csrf-token'),
}));

jest.mock('ai', () => ({
  lastAssistantMessageIsCompleteWithApprovalResponses: jest.fn(),
}));

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    addToolApprovalResponse: jest.fn(),
  })),
}));

jest.mock('@assistant-ui/store', () => ({
  useAuiState: jest.fn((selector: (state: {
    threadListItem: { id: string; remoteId?: string };
  }) => unknown) => selector({
    threadListItem: { id: 'thread-new', remoteId: undefined },
  })),
}));

jest.mock('@assistant-ui/react-ai-sdk', () => {
  class MockAssistantChatTransport {
    setRuntime = setRuntimeMock;
    constructor(_options: unknown) {}
  }

  return {
    AssistantChatTransport: MockAssistantChatTransport,
    useAISDKRuntime: jest.fn(() => ({ kind: 'runtime' })),
  };
});

jest.mock('@assistant-ui/core/react', () => ({
  useRemoteThreadListRuntime: jest.fn(() => ({
    threads: {
      getState: () => runtimeState,
      subscribe: () => () => {},
      switchToThread: switchToThreadMock,
    },
  })),
}));

jest.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('./chat-thread-list-adapter', () => ({
  createPmSyncThreadListAdapter: jest.fn(() => ({ unstable_Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> })),
}));

describe('ChatRuntimeProvider', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>,
    });

    runtimeState = {
      isLoading: false,
      threadIds: ['conv-older', 'conv-last'],
      newThreadId: 'thread-new',
      mainThreadId: 'thread-scratch',
    };
    switchToThreadMock.mockReset();
    setRuntimeMock.mockReset();
    window.localStorage.clear();
  });

  it('restores the last active real thread even if mainThreadId is not the default new thread id', () => {
    window.localStorage.setItem('pmsync:chat:last-thread-id', 'conv-last');

    const { ChatRuntimeProvider } = require('./ChatRuntimeProvider') as typeof import('./ChatRuntimeProvider');

    render(
      <ChatRuntimeProvider>
        <div>child</div>
      </ChatRuntimeProvider>,
    );

    expect(switchToThreadMock).toHaveBeenCalledWith('conv-last');
  });

  it('falls back to the first listed thread when no persisted real thread exists', () => {
    const { ChatRuntimeProvider } = require('./ChatRuntimeProvider') as typeof import('./ChatRuntimeProvider');

    render(
      <ChatRuntimeProvider>
        <div>child</div>
      </ChatRuntimeProvider>,
    );

    expect(switchToThreadMock).toHaveBeenCalledWith('conv-older');
  });
});
