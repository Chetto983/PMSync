import { render, screen } from '@testing-library/react';
import { OrgSwitcher } from './OrgSwitcher';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    organizations: {
      switchOrg: 'Switch organization',
    },
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useOrganizations: () => ({
    data: [
      { id: 'org-1', name: 'Primary Org' },
      { id: 'org-2', name: 'Active Org' },
    ],
  }),
  useSetActiveOrg: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: {
        session: {
          activeOrganizationId: 'org-2',
        },
        user: {
          tenantId: 'org-1',
        },
      },
    }),
  },
  getActiveOrganizationId: (session: any) =>
    session?.session?.activeOrganizationId ?? session?.user?.tenantId ?? null,
}));

describe('OrgSwitcher', () => {
  it('uses session.activeOrganizationId as the active org when present', () => {
    render(<OrgSwitcher />);

    // Button shows "Active Org" (org-2) not "Primary Org" (org-1/tenantId)
    expect(
      screen.getByRole('button', { name: /active org/i }),
    ).toBeInTheDocument();
  });

  it('renders the correct org name based on activeOrganizationId, not tenantId', () => {
    render(<OrgSwitcher />);

    // activeOrganizationId = org-2 -> "Active Org"
    // tenantId = org-1 -> "Primary Org" (should NOT be in button)
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Active Org');
  });
});
