import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatPage } from './ChatPage';

jest.mock('./ChatRuntimeProvider', () => ({
  ChatRuntimeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="runtime">{children}</div>,
}));

jest.mock('./ChatThemeBridge', () => ({
  ChatThemeBridge: ({ children }: { children: React.ReactNode }) => <div data-testid="theme">{children}</div>,
}));

jest.mock('./ChatDesktopLayout', () => ({
  ChatDesktopLayout: () => <div>Desktop layout</div>,
}));

jest.mock('./ChatMobileLayout', () => ({
  ChatMobileLayout: () => <div>Mobile layout</div>,
}));

describe('ChatPage', () => {
  it('renders the chat runtime immediately without a second skeleton gate', () => {
    const { container } = render(<ChatPage />);

    expect(screen.getByTestId('runtime')).toBeInTheDocument();
    expect(screen.getByTestId('theme')).toBeInTheDocument();
    expect(screen.getByText('Desktop layout')).toBeInTheDocument();
    expect(screen.getByText('Mobile layout')).toBeInTheDocument();
    expect(container.querySelector('.chat-skeleton')).toBeNull();
  });
});
