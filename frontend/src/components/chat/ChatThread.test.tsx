import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatThread } from './ChatThread';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: {
      cancel: 'Cancel',
      save: 'Save',
    },
    chat: {
      actions: {
        edit: 'Edit',
        copy: 'Copy',
        reload: 'Reload',
      },
      composer: {
        placeholder: 'Message assistant',
        send: 'Send',
        stop: 'Stop',
      },
    },
  }),
}));

jest.mock('./ChatComposer', () => ({
  ChatComposer: () => null,
}));

jest.mock('./ChatSuggestions', () => ({
  ChatSuggestions: () => null,
}));

jest.mock('./ChatBranchPicker', () => ({
  ChatBranchPicker: () => null,
}));

jest.mock('./AssistantMessage', () => ({
  AssistantMessage: () => <div>Initial response</div>,
}));

jest.mock('@assistant-ui/react', () => {
  const ReactModule: typeof import('react') = jest.requireActual('react');

  type MockMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  };

  type ThreadContextValue = {
    messages: MockMessage[];
    setMessages: React.Dispatch<React.SetStateAction<MockMessage[]>>;
    editingId: string | null;
    setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
    composerText: string;
    setComposerText: React.Dispatch<React.SetStateAction<string>>;
  };

  type ClassNameProps = React.PropsWithChildren<{ className?: string }>;

  type ButtonProps = React.PropsWithChildren<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }
  >;

  type InputProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    className?: string;
  };

  type MessagesComponents = {
    Message?: React.ComponentType;
    UserMessage?: React.ComponentType;
    AssistantMessage?: React.ComponentType;
    UserEditComposer?: React.ComponentType;
  };

  const ThreadContext = ReactModule.createContext(null) as React.Context<ThreadContextValue | null>;
  const MessageContext = ReactModule.createContext(null) as React.Context<MockMessage | null>;

  const getMessageText = (message: MockMessage) =>
    message.content.find((part) => part.type === 'text')?.text ?? '';

  const useThreadContext = () => {
    const value = ReactModule.useContext(ThreadContext);
    if (!value) throw new Error('ThreadContext not found');
    return value;
  };

  const useMessageContext = () => {
    const value = ReactModule.useContext(MessageContext);
    if (!value) throw new Error('MessageContext not found');
    return value;
  };

  const ThreadPrimitive = {
    Root: ({ children, className }: ClassNameProps) => {
      const [messages, setMessages] = ReactModule.useState<MockMessage[]>([
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', text: 'Original message' }],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Initial response' }],
        },
      ]);
      const [editingId, setEditingId] = ReactModule.useState<string | null>(null);
      const [composerText, setComposerText] = ReactModule.useState('');

      return (
        <ThreadContext.Provider
          value={{
            messages,
            setMessages,
            editingId,
            setEditingId,
            composerText,
            setComposerText,
          }}
        >
          <div className={className}>{children}</div>
        </ThreadContext.Provider>
      );
    },
    Viewport: ({ children, className }: ClassNameProps) => <div className={className}>{children}</div>,
    ViewportFooter: ({ children, className }: ClassNameProps) => <div className={className}>{children}</div>,
    Empty: ({ children }: React.PropsWithChildren) => {
      const { messages } = useThreadContext();
      return messages.length === 0 ? <>{children}</> : null;
    },
    Messages: ({ components }: { components: MessagesComponents }) => {
      const { messages, editingId } = useThreadContext();

      return (
        <>
          {messages.map((message: MockMessage) => {
            const Component = (message.role === 'user'
              ? (editingId === message.id
                ? (components.UserEditComposer ?? components.UserMessage ?? components.Message)
                : (components.UserMessage ?? components.Message))
              : (components.AssistantMessage ?? components.Message)) ?? (() => null);

            return (
              <MessageContext.Provider key={message.id} value={message}>
                <Component />
              </MessageContext.Provider>
            );
          })}
        </>
      );
    },
    ScrollToBottom: ({ children, className }: ClassNameProps) => <button type="button" className={className}>{children}</button>,
  };

  const MessagePrimitive = {
    Root: ({ children, className }: ClassNameProps) => <div className={className}>{children}</div>,
    Content: () => {
      const message = useMessageContext();
      return <div>{getMessageText(message)}</div>;
    },
  };

  const ActionBarPrimitive = {
    Root: ({ children, className }: ClassNameProps) => <div className={className}>{children}</div>,
    Edit: ({ children, className, ...props }: ButtonProps) => {
      const message = useMessageContext();
      const { setEditingId, setComposerText } = useThreadContext();

      return (
        <button
          type="button"
          className={className}
          onClick={() => {
            setEditingId(message.id);
            setComposerText(getMessageText(message));
          }}
          {...props}
        >
          {children}
        </button>
      );
    },
  };

  const ComposerPrimitive = {
    Root: ({ children, className }: ClassNameProps) => {
      const {
        messages,
        setMessages,
        editingId,
        setEditingId,
        composerText,
      } = useThreadContext();

      const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingId) return;

        setMessages(
          messages.map((message: MockMessage) => (
            message.id === editingId
              ? {
                ...message,
                content: [{ type: 'text', text: composerText }],
              }
              : message
          )),
        );
        setEditingId(null);
      };

      return (
        <form className={className} onSubmit={handleSubmit}>
          {children}
        </form>
      );
    },
    Input: ({ className, ...props }: InputProps) => {
      const { composerText, setComposerText } = useThreadContext();

      return (
        <textarea
          className={className}
          value={composerText}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setComposerText(event.target.value)}
          {...props}
        />
      );
    },
    Cancel: ({ children, className, ...props }: ButtonProps) => {
      const { setEditingId } = useThreadContext();

      return (
        <button
          type="button"
          className={className}
          onClick={() => setEditingId(null)}
          {...props}
        >
          {children}
        </button>
      );
    },
    Send: ({ children, className, ...props }: ButtonProps) => (
      <button type="submit" className={className} {...props}>
        {children}
      </button>
    ),
  };

  return {
    ThreadPrimitive,
    MessagePrimitive,
    ActionBarPrimitive,
    ComposerPrimitive,
  };
});

describe('ChatThread', () => {
  it('renders the inline edit composer for user messages and saves the update', () => {
    render(<ChatThread />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByDisplayValue('Original message');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Updated message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Updated message')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Updated message')).not.toBeInTheDocument();
  });
});
