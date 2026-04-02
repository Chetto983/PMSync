import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TriageSetupForm } from './TriageSetupForm';
import { labelsApi } from '@/lib/api/labels';

jest.mock('@/lib/api/labels', () => ({
  labelsApi: {
    getTriageOnboardingContract: jest.fn(),
    previewTriageOnboarding: jest.fn(),
    applyTriageOnboarding: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    locale: 'en',
    triageSetup: {
      title: 'Set up your initial triage rules',
      description: 'Define a few operational rules.',
      customerDomains: 'Customer domains',
      importantSenders: 'Important senders',
      projectTopics: 'Projects or active topics',
      systemAlerts: 'System alert sources',
      billingTopics: 'Optional billing topics',
      reviewLaterTopics: 'Review-later topics',
      followUpSla: 'Follow-up target (hours)',
      customerPlaceholder: 'acme.com, contoso.it',
      senderPlaceholder: 'cto@acme.com, ops@customer.com',
      topicPlaceholder: 'production deploy, customer renewal',
      systemPlaceholder: 'GitHub Actions, Railway, Vercel',
      billingPlaceholder: 'invoice overdue, renewal',
      reviewLaterPlaceholder: 'product newsletter, weekly digest',
      helper: 'Use natural phrases and names, not just isolated keywords.',
      preview: 'Preview',
      willCreate: 'This setup will guide triage with patterns like these',
      catchTitle: 'This will catch',
      avoidTitle: 'This will avoid',
      previewButton: 'Preview',
      applyButton: 'Save rules',
      skipButton: 'Skip for now',
      loading: 'Loading triage setup...',
      genericError: 'Unable to complete the action. Please try again.',
      applyReady: 'Preview is ready. Review the guidance before saving.',
      applySuccess: 'Triage rules saved. Labels remain user-defined.',
      currentLabels: 'Existing user labels',
      dialogTitle: 'Guided Triage Setup',
      openGuided: 'Open guided triage setup',
    },
  }),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('TriageSetupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (labelsApi.getTriageOnboardingContract as jest.Mock).mockResolvedValue({
      version: 'v1',
      schema: [],
      taxonomy: [],
      examples: {
        customerRule: 'Mark customer mail from acme.com.',
        systemAlertRule: 'Treat GitHub Actions as System Alert.',
        billingRule: 'Use Finance for invoices.',
        reviewLaterRule: 'Use Review Later for digests.',
      },
      currentLabels: [{ id: 'l1', name: 'Important', slug: 'important', aiPrompt: 'old', type: 'USER' }],
    });
  });

  it('loads contract data and previews parsed onboarding rules', async () => {
    (labelsApi.previewTriageOnboarding as jest.Mock).mockResolvedValue({
      version: 'v1',
      normalizedRules: {
        version: 'v1',
        customerDomains: ['acme.com'],
        importantSenders: [],
        projectTopics: [],
        systemAlertSources: [],
        billingTopics: [],
        reviewLaterTopics: [],
        followUpSlaHours: 24,
      },
      schema: [],
      taxonomy: [],
      examples: {
        customerRule: 'Mark customer mail from acme.com.',
        systemAlertRule: 'Treat GitHub Actions as System Alert.',
        billingRule: 'Use Finance for invoices.',
        reviewLaterRule: 'Use Review Later for digests.',
      },
      recommendedLabels: [
        {
          name: 'Customer',
          slug: 'customer',
          aiPrompt: 'Use for acme.com',
          rationale: 'Customer context first.',
          family: 'context',
          color: { backgroundColor: '#fff', textColor: '#000' },
          willCreate: true,
        },
      ],
    });

    renderWithQueryClient(<TriageSetupForm />);

    await screen.findByText('Set up your initial triage rules');

    fireEvent.change(screen.getByLabelText('Customer domains'), {
      target: { value: 'acme.com,\ncontoso.it' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(labelsApi.previewTriageOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          customerDomains: ['acme.com', 'contoso.it'],
          followUpSlaHours: 24,
        }),
      ),
    );

    expect(await screen.findByText('This setup will guide triage with patterns like these')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });
});
