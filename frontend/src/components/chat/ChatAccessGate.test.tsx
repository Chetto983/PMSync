import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatAccessGateCard } from './ChatAccessGate';

const pushMock = jest.fn();
const mutateMock = jest.fn();

let consentData = [
  { feature: 'ai_chat', granted: false },
];
let legalData = { allAccepted: true };
let subscriptionData = {
  status: 'ACTIVE',
  monthlyAICallLimit: 50,
  usage: { aiCallsRemaining: 50 },
};
let costStatusData = { isBlocked: false };

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    ai: {
      overlay: {
        accessConsentTitle: 'Enable AI Chat to continue',
        accessConsentBody: 'Allow AI Chat for this workspace.',
        accessConsentAction: 'Enable AI Chat',
        accessConsentSecondary: 'Review privacy settings',
        accessBillingTitle: 'Billing issue blocks AI chat',
        accessBillingBody: 'Update billing.',
        accessBillingAction: 'Open billing',
        accessBillingSecondary: 'Open privacy settings',
        accessQuotaTitle: 'Monthly AI quota exhausted',
        accessQuotaBody: 'Quota finished.',
        accessQuotaSecondary: 'Open privacy settings',
        accessCostTitle: 'Daily AI cost cap reached',
        accessCostBody: 'Cost cap hit.',
        accessCostSecondary: 'Open privacy settings',
        accessLegalTitle: 'Accept terms before using the assistant',
        accessLegalBody: 'Accept legal docs.',
        accessLegalAction: 'Open onboarding',
        accessLegalSecondary: 'Open privacy settings',
      },
    },
    common: {
      save: 'Save',
    },
    nav: {
      settings: 'Settings',
    },
    settings: {
      consentPanel: {
        features: {
          ai_chat: {
            description: 'Allow AI Chat for this workspace.',
          },
        },
      },
    },
  }),
}));

jest.mock('@/hooks/queries/use-consent', () => ({
  useConsent: () => ({
    data: consentData,
    isLoading: false,
  }),
  useUpdateConsent: () => ({
    isPending: false,
    mutate: mutateMock,
  }),
}));

jest.mock('@/hooks/queries/use-data-rights', () => ({
  useLegalStatus: () => ({
    data: legalData,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/queries/use-billing', () => ({
  useSubscription: () => ({
    data: subscriptionData,
    isLoading: false,
  }),
  useCostStatus: () => ({
    data: costStatusData,
    isLoading: false,
  }),
}));

describe('ChatAccessGateCard', () => {
  beforeEach(() => {
    pushMock.mockReset();
    mutateMock.mockReset();
    consentData = [{ feature: 'ai_chat', granted: false }];
    legalData = { allAccepted: true };
    subscriptionData = {
      status: 'ACTIVE',
      monthlyAICallLimit: 50,
      usage: { aiCallsRemaining: 50 },
    };
    costStatusData = { isBlocked: false };
  });

  it('renders a consent gate and enables AI chat from the card', () => {
    render(<ChatAccessGateCard />);

    expect(screen.getByText('Enable AI Chat to continue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable AI Chat' }));

    expect(mutateMock).toHaveBeenCalledWith({ feature: 'ai_chat', granted: true });
  });

  it('returns null when chat access is available', () => {
    consentData = [{ feature: 'ai_chat', granted: true }];

    const { container } = render(<ChatAccessGateCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
