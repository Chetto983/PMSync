import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Layout } from './Layout';

jest.mock('@tanstack/react-query', () => ({
  usePrefetchQuery: jest.fn(),
}));

jest.mock('./Sidebar', () => ({
  Sidebar: ({ mobileOpen }: { mobileOpen: boolean }) => (
    <div data-open={mobileOpen ? 'true' : 'false'} data-testid="sidebar" />
  ),
}));

jest.mock('./Header', () => ({
  Header: ({ onOpenSidebar }: { onOpenSidebar: () => void }) => (
    <button onClick={onOpenSidebar} type="button">
      open sidebar
    </button>
  ),
}));

jest.mock('@/components/ui/cookie-consent', () => ({
  CookieConsent: () => null,
}));

jest.mock('@/components/ai/CommandPalette', () => ({
  CommandPalette: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog">
        <button onClick={onClose} type="button">
          close command palette
        </button>
        command palette open
      </div>
    ) : null,
}));

jest.mock('@/hooks/queries/use-consent', () => ({
  consentOptions: () => ({
    queryKey: ['consent'],
    queryFn: async () => null,
  }),
}));

jest.mock('@/stores/sync-store', () => ({
  useSyncStore: () => ({
    lastStatus: null,
    clear: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: {
      skipToContent: 'Skip to main content',
      syncStarted: 'Sync started',
      syncInProgress: 'Sync in progress',
      syncCompleted: 'Sync completed',
      syncFailed: 'Sync failed',
    },
  }),
}));

jest.mock('@/components/billing', () => ({
  QuotaAlertBanner: () => null,
}));

jest.mock('@/components/organizations/PendingInvitationBanner', () => ({
  PendingInvitationBanner: () => null,
}));

jest.mock('@/components/admin/ImpersonationBanner', () => ({
  ImpersonationBanner: () => null,
}));

jest.mock('@/components/layout/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('@/components/layout/InstallPromptBanner', () => ({
  InstallPromptBanner: () => null,
}));

jest.mock('@/components/common/AiDegradedBanner', () => ({
  AiDegradedBanner: () => null,
}));

jest.mock('@/hooks/use-offline-actions', () => ({
  useOfflineActions: jest.fn(),
}));

describe('Layout', () => {
  it('toggles the command palette with Ctrl+K', () => {
    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
