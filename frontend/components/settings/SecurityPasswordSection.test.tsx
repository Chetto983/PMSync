import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: jest.fn(),
    changePassword: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    settings: { securityPanel: null },
  }),
}));

// PasswordField passes TextFieldProps — mock as standard input, strip MUI-only props
jest.mock('@/components/auth/PasswordField', () => ({
  PasswordField: ({ label, value, onChange }: {
    label?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) =>
    React.createElement('input', {
      'aria-label': label,
      'data-testid': `password-field-${label ?? 'password'}`,
      value,
      onChange,
      type: 'password',
    }),
}));

const { authClient } = jest.requireMock('@/lib/auth-client') as {
  authClient: jest.Mocked<{
    listAccounts: jest.Mock;
    changePassword: jest.Mock;
  }>;
};

import { SecurityPasswordSection } from './SecurityPasswordSection';

describe('SecurityPasswordSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authClient.listAccounts.mockResolvedValue({ data: [{ providerId: 'credential' }] });
    authClient.changePassword.mockResolvedValue({});
  });

  it('renders password change form after account loads', async () => {
    render(<SecurityPasswordSection />);
    // Wait for the submit button to appear (loading state cleared)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /change password/i })
      ).toBeInTheDocument();
    });
  });

  it('shows validation error when passwords do not match', async () => {
    render(<SecurityPasswordSection />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('password-field-Current password'), {
      target: { value: 'current123' },
    });
    fireEvent.change(screen.getByTestId('password-field-New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByTestId('password-field-Confirm new password'), {
      target: { value: 'differentpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('calls authClient.changePassword on valid submit', async () => {
    render(<SecurityPasswordSection />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('password-field-Current password'), {
      target: { value: 'current123' },
    });
    fireEvent.change(screen.getByTestId('password-field-New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByTestId('password-field-Confirm new password'), {
      target: { value: 'newpass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(authClient.changePassword).toHaveBeenCalledWith({
        currentPassword: 'current123',
        newPassword: 'newpass123',
        revokeOtherSessions: false,
      });
    });
  });

  it('shows success message after password change', async () => {
    authClient.changePassword.mockResolvedValue({});
    render(<SecurityPasswordSection />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('password-field-Current password'), {
      target: { value: 'current123' },
    });
    fireEvent.change(screen.getByTestId('password-field-New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByTestId('password-field-Confirm new password'), {
      target: { value: 'newpass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password updated successfully/i)).toBeInTheDocument();
    });
  });

  it('shows error from API rejection', async () => {
    authClient.changePassword.mockResolvedValue({ error: { message: 'Wrong password' } });
    render(<SecurityPasswordSection />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('password-field-Current password'), {
      target: { value: 'current123' },
    });
    fireEvent.change(screen.getByTestId('password-field-New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByTestId('password-field-Confirm new password'), {
      target: { value: 'newpass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeInTheDocument();
    });
  });
});
