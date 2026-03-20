import type {
  AnchorHTMLAttributes,
  ChangeEventHandler,
  PropsWithChildren,
} from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock authClient before importing component
const mockSignUp = jest.fn();
const mockGetSession = jest.fn();
const mockSendVerificationEmail = jest.fn();

interface MockLinkProps extends PropsWithChildren, AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

interface MockPasswordFieldProps {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: mockSignUp,
    },
    getSession: () => mockGetSession(),
    sendVerificationEmail: mockSendVerificationEmail,
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    auth: {
      register: {
        title: 'Create your workspace',
        subtitle: 'Provision your inbox',
        form: {
          firstNameLabel: 'First name',
          firstNamePlaceholder: 'Alex',
          lastNameLabel: 'Last name',
          lastNamePlaceholder: 'Smith',
          emailLabel: 'Work email',
          passwordLabel: 'Password',
          confirmPasswordLabel: 'Confirm password',
          submit: 'Create account',
          agreeToTerms: 'I agree to the ',
          termsOfService: 'Terms of Service',
          and: ' and ',
          privacyPolicy: 'Privacy Policy',
          termsRequired: 'You must agree.',
        },
        successTitle: 'Check your inbox',
        successDescription: 'We sent a verification link to {email}.',
        successAction: 'Go to sign in',
        links: { primary: { href: '/auth/login', label: 'Already have an account?' } },
      },
      verifyEmail: {
        resend: 'Resend verification email',
        resendSuccess: 'Verification email resent!',
      },
    },
    common: {
      passwordMismatch: 'Passwords do not match',
    },
  }),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: MockLinkProps) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children }: PropsWithChildren) => <div data-testid="auth-layout">{children}</div>,
}));

jest.mock('@/components/auth/PasswordField', () => ({
  PasswordField: ({ label, value, onChange, ...rest }: MockPasswordFieldProps) => (
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

import RegisterPage from '@/pages/auth/register';

function fillForm() {
  const firstNameInput = screen.getAllByRole('textbox')[0]; // First text field
  const lastNameInput = screen.getAllByRole('textbox')[1]; // Second text field
  const emailInput = screen.getAllByRole('textbox')[2]; // Third text field (email type renders as textbox in MUI)

  fireEvent.change(firstNameInput, { target: { value: 'Test' } });
  fireEvent.change(lastNameInput, { target: { value: 'User' } });
  fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SecurePass123!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'SecurePass123!' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT call getSession after successful signup (verification required)', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });

    render(<RegisterPage />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalled();
    });

    // getSession should NOT be called -- verification is required
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('shows verification-pending UI with resend button after successful signup', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });

    render(<RegisterPage />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByText(/verification link/i)).toBeInTheDocument();
    });

    // Should show resend button
    expect(screen.getByText('Resend verification email')).toBeInTheDocument();

    // Should show "Go to sign in" button
    expect(screen.getByText('Go to sign in')).toBeInTheDocument();
  });
});
