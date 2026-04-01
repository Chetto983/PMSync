import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChatMobileLayout } from './ChatMobileLayout';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: {
      close: 'Close',
    },
    chat: {
      threadList: {
        title: 'Conversations',
        openList: 'Open conversations',
        closeList: 'Close conversations',
      },
    },
  }),
}));

jest.mock('./ChatThread', () => ({
  ChatThread: () => <div>Thread body</div>,
}));

jest.mock('./ChatThreadList', () => ({
  ChatThreadList: () => (
    <div>
      <button type="button">First thread</button>
      <button type="button">Last thread</button>
    </div>
  ),
}));

describe('ChatMobileLayout', () => {
  it('opens and closes the sidebar with localized labels and focus restore', () => {
    render(<ChatMobileLayout />);

    const openButton = screen.getByRole('button', { name: 'Open conversations' });
    fireEvent.click(openButton);

    const dialog = screen.getByRole('dialog', { name: 'Conversations' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const closeButton = within(dialog).getByRole('button', { name: 'Close conversations' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(openButton).toHaveFocus();
    expect(dialog).toHaveAttribute('aria-hidden', 'true');
  });

  it('traps keyboard focus inside the open sidebar', () => {
    render(<ChatMobileLayout />);

    fireEvent.click(screen.getByRole('button', { name: 'Open conversations' }));

    const dialog = screen.getByRole('dialog', { name: 'Conversations' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close conversations' });
    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('button', { name: 'Last thread' })).toHaveFocus();
  });
});
