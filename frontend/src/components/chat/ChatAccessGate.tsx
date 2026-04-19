'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, CreditCard, Scale, ShieldCheck } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useConsent, useUpdateConsent } from '@/hooks/queries/use-consent';
import { useLegalStatus } from '@/hooks/queries/use-data-rights';
import { useCostStatus, useSubscription } from '@/hooks/queries/use-billing';

export type ChatAccessReason =
  | 'consent'
  | 'legal'
  | 'subscription'
  | 'quota'
  | 'cost'
  | null;

export type ChatAccessState = {
  isChecking: boolean;
  isBlocked: boolean;
  reason: ChatAccessReason;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  isPrimaryPending: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
};

export function useChatAccessState(): ChatAccessState {
  const router = useRouter();
  const t = useTranslations();
  const consentQuery = useConsent();
  const legalQuery = useLegalStatus();
  const subscriptionQuery = useSubscription();
  const costStatusQuery = useCostStatus();
  const updateConsent = useUpdateConsent();

  const openConsentSettings = useCallback(() => {
    void router.push('/dashboard/settings?section=consent');
  }, [router]);

  const openBilling = useCallback(() => {
    void router.push('/dashboard/settings?section=billing');
  }, [router]);

  const openOnboarding = useCallback(() => {
    void router.push('/onboarding');
  }, [router]);

  const enableChatConsent = useCallback(() => {
    updateConsent.mutate({ feature: 'ai_chat', granted: true });
  }, [updateConsent]);

  return useMemo(() => {
    const consents = consentQuery.data ?? [];
    const legal = legalQuery.data;
    const subscription = subscriptionQuery.data;
    const costStatus = costStatusQuery.data;
    const hasChatConsent = consents.some(
      (item) => item.feature === 'ai_chat' && item.granted,
    );

    const isChecking =
      consentQuery.isLoading ||
      legalQuery.isLoading ||
      subscriptionQuery.isLoading ||
      costStatusQuery.isLoading;

    const consentBody =
      t.ai.overlay.accessConsentBody ||
      t.settings?.consentPanel?.features?.ai_chat?.description ||
      'Enable AI Chat consent to use the assistant.';

    if (legal && !legal.allAccepted) {
      return {
        isChecking,
        isBlocked: true,
        reason: 'legal',
        title:
          t.ai.overlay.accessLegalTitle || 'Accept terms before using the assistant',
        body:
          t.ai.overlay.accessLegalBody ||
          'You need to accept the latest Terms of Service and Privacy Policy first.',
        primaryLabel: t.ai.overlay.accessLegalAction || 'Open onboarding',
        secondaryLabel:
          t.ai.overlay.accessLegalSecondary || t.nav.settings || 'Settings',
        isPrimaryPending: false,
        onPrimary: openOnboarding,
        onSecondary: openConsentSettings,
      };
    }

    if (!isChecking && consents.length > 0 && !hasChatConsent) {
      return {
        isChecking,
        isBlocked: true,
        reason: 'consent',
        title:
          t.ai.overlay.accessConsentTitle || 'Enable AI Chat to continue',
        body: consentBody,
        primaryLabel:
          updateConsent.isPending
            ? t.common.save || 'Saving...'
            : t.ai.overlay.accessConsentAction || 'Enable AI Chat',
        secondaryLabel:
          t.ai.overlay.accessConsentSecondary || 'Review privacy settings',
        isPrimaryPending: updateConsent.isPending,
        onPrimary: enableChatConsent,
        onSecondary: openConsentSettings,
      };
    }

    if (subscription?.status === 'PAST_DUE' || subscription?.status === 'CANCELED') {
      return {
        isChecking,
        isBlocked: true,
        reason: 'subscription',
        title:
          t.ai.overlay.accessBillingTitle || 'Billing issue blocks AI chat',
        body:
          t.ai.overlay.accessBillingBody ||
          'Update your billing status to restore assistant access.',
        primaryLabel: t.ai.overlay.accessBillingAction || 'Open billing',
        secondaryLabel:
          t.ai.overlay.accessBillingSecondary || t.nav.settings || 'Settings',
        isPrimaryPending: false,
        onPrimary: openBilling,
        onSecondary: openConsentSettings,
      };
    }

    if (costStatus?.isBlocked) {
      return {
        isChecking,
        isBlocked: true,
        reason: 'cost',
        title:
          t.ai.overlay.accessCostTitle || 'Daily AI cost cap reached',
        body:
          t.ai.overlay.accessCostBody ||
          'AI operations are paused for today. Upgrade or wait for the daily reset.',
        primaryLabel: t.ai.overlay.accessBillingAction || 'Open billing',
        secondaryLabel:
          t.ai.overlay.accessCostSecondary || t.nav.settings || 'Settings',
        isPrimaryPending: false,
        onPrimary: openBilling,
        onSecondary: openConsentSettings,
      };
    }

    if (
      subscription &&
      subscription.monthlyAICallLimit !== -1 &&
      subscription.usage.aiCallsRemaining <= 0
    ) {
      return {
        isChecking,
        isBlocked: true,
        reason: 'quota',
        title:
          t.ai.overlay.accessQuotaTitle || 'Monthly AI quota exhausted',
        body:
          t.ai.overlay.accessQuotaBody ||
          'This workspace used all available AI calls for the current period.',
        primaryLabel: t.ai.overlay.accessBillingAction || 'Open billing',
        secondaryLabel:
          t.ai.overlay.accessQuotaSecondary || t.nav.settings || 'Settings',
        isPrimaryPending: false,
        onPrimary: openBilling,
        onSecondary: openConsentSettings,
      };
    }

    return {
      isChecking,
      isBlocked: false,
      reason: null,
      title: '',
      body: '',
      primaryLabel: '',
      secondaryLabel: '',
      isPrimaryPending: false,
      onPrimary: () => undefined,
      onSecondary: () => undefined,
    };
  }, [
    consentQuery.data,
    consentQuery.isLoading,
    costStatusQuery.data,
    costStatusQuery.isLoading,
    enableChatConsent,
    legalQuery.data,
    legalQuery.isLoading,
    openBilling,
    openConsentSettings,
    openOnboarding,
    subscriptionQuery.data,
    subscriptionQuery.isLoading,
    t,
    updateConsent.isPending,
  ]);
}

function getGateIcon(reason: ChatAccessReason) {
  switch (reason) {
    case 'legal':
      return <Scale size={18} />;
    case 'subscription':
    case 'quota':
    case 'cost':
      return <CreditCard size={18} />;
    case 'consent':
      return <ShieldCheck size={18} />;
    default:
      return <AlertTriangle size={18} />;
  }
}

export function ChatAccessGateActions({
  state,
  compact = false,
}: {
  state: ChatAccessState;
  compact?: boolean;
}) {
  if (!state.isBlocked) return null;

  return (
    <div className={`chat-access-gate-actions${compact ? ' chat-access-gate-actions-compact' : ''}`}>
      <button
        type="button"
        className="chat-access-gate-btn chat-access-gate-btn-primary"
        onClick={state.onPrimary}
        disabled={state.isPrimaryPending}
      >
        {state.primaryLabel}
      </button>
      <button
        type="button"
        className="chat-access-gate-btn chat-access-gate-btn-secondary"
        onClick={state.onSecondary}
      >
        {state.secondaryLabel}
      </button>
    </div>
  );
}

export function ChatAccessGateCard({ compact = false }: { compact?: boolean }) {
  const state = useChatAccessState();

  if (!state.isBlocked) return null;

  return (
    <div className={`chat-access-gate${compact ? ' chat-access-gate-compact' : ''}`}>
      <div className="chat-access-gate-mark">
        {getGateIcon(state.reason)}
      </div>
      <div className="chat-access-gate-copy">
        <span className="chat-access-gate-badge">
          {state.reason === 'consent' ? 'AI Chat' : 'Assistant access'}
        </span>
        <h3 className="chat-access-gate-title">{state.title}</h3>
        <p className="chat-access-gate-body">{state.body}</p>
        <ChatAccessGateActions state={state} compact={compact} />
      </div>
    </div>
  );
}
