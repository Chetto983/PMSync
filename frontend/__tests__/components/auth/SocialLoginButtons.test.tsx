import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';

const mockSignInSocial = jest.fn();

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    auth: {
      social: {
        google: 'Continue with Google',
        microsoft: 'Continue with Microsoft',
        or: 'or',
      },
    },
  }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));

describe('SocialLoginButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/auth/login?returnTo=%2Fdashboard%2Finbox');
  });

  it('keeps login social auth in sign-in mode', async () => {
    mockSignInSocial.mockResolvedValue(undefined);

    render(<SocialLoginButtons intent="login" />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'http://localhost/dashboard/inbox',
        newUserCallbackURL: undefined,
        errorCallbackURL: 'http://localhost/auth/login?returnTo=%2Fdashboard%2Finbox',
        requestSignUp: false,
      });
    });
  });

  it('explicitly requests sign-up from the register page', async () => {
    mockSignInSocial.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/auth/register');

    render(<SocialLoginButtons intent="register" />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'microsoft',
        callbackURL: 'http://localhost/dashboard',
        newUserCallbackURL: 'http://localhost/dashboard',
        errorCallbackURL: 'http://localhost/auth/register',
        requestSignUp: true,
      });
    });
  });
});
