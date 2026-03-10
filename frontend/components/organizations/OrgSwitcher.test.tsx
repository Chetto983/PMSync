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

    expect(
      screen.getByRole('button', { name: /active org/i }),
    ).toBeInTheDocument();
  });
});
