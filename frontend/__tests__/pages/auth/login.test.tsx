import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const mockSignIn = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    query: {},
  }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: any[]) => mockSignIn(...args),
    },
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    auth: {
      login: {
        title: 'Welcome back',
        subtitle: 'Secure authentication',
        verificationNotice: 'Your email is not verified yet. We sent a new verification link to {email}.',
        accountNotFoundNotice: 'No account was found for this email. Create an account first.',
        form: {
          emailLabel: 'Work email',
          passwordLabel: 'Password',
          submit: 'Sign in',
        },
        links: {
          primary: { href: '/auth/register', label: 'Create an account' },
          secondary: { href: '/auth/forgot-password', label: 'Forgot password?' },
        },
      },
    },
    errors: {
      invalidCredentials: 'Invalid email or password. Please try again.',
    },
    common: {
      genericError: 'Something went wrong. Please try again.',
    },
  }),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children }: any) => <div data-testid="auth-layout">{children}</div>,
}));

jest.mock('@/components/auth/PasswordField', () => ({
  PasswordField: ({ label, value, onChange, ...rest }: any) => (
    <div>
      <label htmlFor={`pw-${label}`}>{label}</label>
      <input
        id={`pw-${label}`}
        type="password"
        value={value}
        onChange={onChange}
        {...rest}
      />
    </div>
  ),
}));

jest.mock('@/components/auth/SocialLoginButtons', () => ({
  SocialLoginButtons: () => <div data-testid="social-buttons" />,
}));

import LoginPage from '@/pages/auth/login';

function fillForm() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'test@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'SecurePass123!' },
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows account-not-found copy when sign-in is attempted for an unregistered email', async () => {
    mockSignIn.mockResolvedValue({
      error: { code: 'NOT_FOUND', message: 'Account not found' },
    });

    render(<LoginPage />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(
        screen.getByText('No account was found for this email. Create an account first.')
      ).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps invalid-password responses generic', async () => {
    mockSignIn.mockResolvedValue({
      error: { code: 'UNAUTHORIZED', message: 'Wrong password for existing account' },
    });

    render(<LoginPage />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password. Please try again.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Wrong password for existing account')).not.toBeInTheDocument();
  });

  it('preserves the verification notice path', async () => {
    mockSignIn.mockResolvedValue({
      error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
    });

    render(<LoginPage />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(
        screen.getByText('Your email is not verified yet. We sent a new verification link to test@example.com.')
      ).toBeInTheDocument();
    });
  });
});
