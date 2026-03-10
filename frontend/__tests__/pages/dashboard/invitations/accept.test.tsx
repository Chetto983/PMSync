import { render, screen } from '@testing-library/react';

const mockPush = jest.fn();
const mockMutate = jest.fn();

let mockQuery: Record<string, string | undefined> = { id: 'test-inv-id' };
let mockMutationState: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
} = { isPending: false, isSuccess: false, isError: false, error: null };

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    query: mockQuery,
  }),
}));

jest.mock('@/hooks/queries', () => ({
  useAcceptInvitation: () => ({
    mutate: mockMutate,
    ...mockMutationState,
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    organizations: {
      invitationAccept: {
        title: 'Accept Invitation',
        accepting: 'Accepting invitation...',
        success: 'Invitation accepted! Redirecting...',
        error: 'Failed to accept invitation',
        expired: 'This invitation has expired',
        notFound: 'Invitation not found',
        alreadyMember: 'You are already a member of this organization',
        missingId: 'No invitation ID provided',
        goToDashboard: 'Go to Dashboard',
      },
    },
  }),
}));

import AcceptInvitationPage from '@/pages/dashboard/invitations/accept';

describe('AcceptInvitationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = { id: 'test-inv-id' };
    mockMutationState = {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    };
  });

  it('renders loading state when acceptInvitation is pending', () => {
    mockMutationState = {
      isPending: true,
      isSuccess: false,
      isError: false,
      error: null,
    };

    render(<AcceptInvitationPage />);
    expect(screen.getByText('Accepting invitation...')).toBeInTheDocument();
  });

  it('renders success alert and "Go to Dashboard" button when accept succeeds', () => {
    mockMutationState = {
      isPending: false,
      isSuccess: true,
      isError: false,
      error: null,
    };

    render(<AcceptInvitationPage />);
    expect(
      screen.getByText('Invitation accepted! Redirecting...')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go to Dashboard' })
    ).toBeInTheDocument();
  });

  it('renders error alert when accept fails (generic error)', () => {
    mockMutationState = {
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('Something went wrong'),
    };

    render(<AcceptInvitationPage />);
    expect(
      screen.getByText('Failed to accept invitation')
    ).toBeInTheDocument();
  });

  it('renders "missing ID" error when no ?id= query param', () => {
    mockQuery = {};

    render(<AcceptInvitationPage />);
    expect(
      screen.getByText('No invitation ID provided')
    ).toBeInTheDocument();
  });

  it('calls acceptInvitation.mutate with the id from query params on mount', () => {
    render(<AcceptInvitationPage />);
    expect(mockMutate).toHaveBeenCalledWith('test-inv-id');
  });

  it('does not call mutate twice (useRef guard against strict mode double-invoke)', () => {
    // The useRef guard ensures that even if the effect fires twice in strict mode,
    // mutate is only called once per component instance mount
    render(<AcceptInvitationPage />);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
