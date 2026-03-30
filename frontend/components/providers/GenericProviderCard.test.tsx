import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/api/providers', () => ({
  providersApi: {
    connectGeneric: jest.fn(),
    testGenericCredentials: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    providers: {
      genericCard: {
        title: 'IMAP & CalDAV',
        description: 'Connect IMAP/SMTP and CalDAV servers',
        subtitle: 'Bring any compatible mailbox or calendar by entering your server credentials.',
        feature1: 'IMAP/SMTP inbound & outbound email',
        feature2: 'Optional CalDAV calendar sync',
        feature3: 'Fastmail, Yahoo, iCloud & more',
        configureButton: 'Configure IMAP / CalDAV',
        dialogTitle: 'Connect IMAP/SMTP & CalDAV Provider',
        dialogSubtitle: 'Configure your email and calendar server settings',
        basicInfo: 'Basic Information',
        emailAddress: 'Email Address',
        displayName: 'Display Name',
        imapSettings: 'IMAP Settings (Incoming Mail)',
        imapHost: 'IMAP Host',
        imapHostPlaceholder: 'imap.example.com',
        port: 'Port',
        username: 'Username',
        password: 'Password',
        useTls: 'Use TLS',
        smtpSettings: 'SMTP Settings (Outgoing Mail)',
        smtpSubtitle: 'Leave empty to use IMAP credentials',
        smtpPortHint: 'Port 465 uses implicit SSL/TLS, while port 587 uses STARTTLS.',
        smtpHost: 'SMTP Host',
        smtpHostPlaceholder: 'smtp.example.com',
        caldavSettings: 'CalDAV Settings (Calendar Sync)',
        enableCalendar: 'Enable Calendar',
        caldavUrl: 'CalDAV URL',
        caldavUrlPlaceholder: 'https://caldav.example.com/calendars/user',
        cancel: 'Cancel',
        connecting: 'Connecting...',
        connectProvider: 'Connect Provider',
        testConnection: 'Test Connection',
        testing: 'Testing...',
        testSuccess: 'Connection successful',
        testFailed: 'Connection failed',
        partialFailureTitle: 'Incoming mail works, outgoing mail needs attention',
        partialFailureHint: 'Check the SMTP host, port, and security mode, then run the test again.',
        imapFailureHint: 'Review your IMAP host, port, username, password, and security settings.',
        imapSuccess: 'IMAP connection successful',
        imapFailed: 'IMAP connection failed',
        smtpSuccess: 'SMTP connection successful',
        smtpFailed: 'SMTP connection failed',
        smtpSkipped: 'SMTP test skipped (no host provided)',
        presets: 'Quick Setup',
        presetsDescription: 'Select your email provider for automatic settings',
        selectProvider: 'Select provider...',
        customProvider: 'Custom / Other',
        presetApplied: 'Settings applied for {provider}',
      },
    },
  }),
}));

import { providersApi } from '@/lib/api/providers';
import { GenericProviderCard } from './GenericProviderCard';

const mockedProvidersApi = providersApi as jest.Mocked<typeof providersApi>;

async function openDialogAndFillImapFields() {
  render(<GenericProviderCard onSuccess={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Configure IMAP / CalDAV' }));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/IMAP Host/i), {
    target: { value: 'imap.test.local' },
  });
  fireEvent.change(screen.getAllByLabelText(/Username/i)[0], {
    target: { value: 'user@test.local' },
  });
  fireEvent.change(screen.getAllByLabelText(/Password/i)[0], {
    target: { value: 'secret' },
  });
}

describe('GenericProviderCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an actionable summary when IMAP passes and SMTP fails', async () => {
    mockedProvidersApi.testGenericCredentials.mockResolvedValue({
      imap: { success: true, message: 'ok' },
      smtp: { success: false, message: 'auth failed' },
    });

    await openDialogAndFillImapFields();
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

    await waitFor(() => {
      expect(screen.getByText('Incoming mail works, outgoing mail needs attention')).toBeInTheDocument();
    });

    expect(screen.getByText('Check the SMTP host, port, and security mode, then run the test again.')).toBeInTheDocument();
    expect(screen.getByText('SMTP connection failed: auth failed')).toBeInTheDocument();
    expect(screen.getByText('Port 465 uses implicit SSL/TLS, while port 587 uses STARTTLS.')).toBeInTheDocument();
  });

  it('ignores stale test results after the form changes during an in-flight test', async () => {
    let resolveTest:
      | ((value: {
          imap: { success: boolean; message: string };
          smtp: { success: boolean; message: string };
        }) => void)
      | undefined;

    mockedProvidersApi.testGenericCredentials.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );

    await openDialogAndFillImapFields();
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

    fireEvent.change(screen.getByLabelText(/SMTP Host/i), {
      target: { value: 'smtp.test.local' },
    });

    resolveTest?.({
      imap: { success: true, message: 'ok' },
      smtp: { success: false, message: 'auth failed' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Incoming mail works, outgoing mail needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText('SMTP connection failed: auth failed')).not.toBeInTheDocument();
  });
});
