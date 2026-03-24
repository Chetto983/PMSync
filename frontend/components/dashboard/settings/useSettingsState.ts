/**
 * Settings State Hook
 *
 * Centralizes all useState declarations and query hooks for the Settings page.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import type { CommunicationStyle, ResponseLength, ProactivityLevel } from '@/lib/api/ai';
import { usersApi } from '@/lib/api/users';
import { authClient } from '@/lib/auth-client';
import { clearOfflineData } from '@/lib/logout-cleanup';
import {
  useProviders,
  useUserPreferences,
  useUpdatePreferences,
  useSyncAllProviders,
  useSubscriptionFeatures,
  useSubscriptionLimits,
} from '@/hooks/queries';

import {
  getStoredUserSettings,
} from '@/lib/utils/user-settings';
import {
  useSignatures,
  useCreateSignature,
  useUpdateSignature,
  useDeleteSignature,
  useSetDefaultSignature,
} from '@/hooks/queries/use-signatures';

/** Noop query result for sections that aren't active */
const EMPTY_SIGNATURES: never[] = [];

export type SettingsSection = 'general' | 'notifications' | 'security' | 'ai' | 'accounts' | 'signatures' | 'templates' | 'scheduled' | 'consent' | 'dataRights' | 'account' | 'billing' | 'telegram';

const COMMUNICATION_STYLES = new Set<CommunicationStyle>([
  'FORMAL',
  'CASUAL',
  'TECHNICAL',
  'CREATIVE',
]);
const RESPONSE_LENGTHS = new Set<ResponseLength>([
  'BRIEF',
  'MODERATE',
  'DETAILED',
]);
const PROACTIVITY_LEVELS = new Set<ProactivityLevel>([
  'LOW',
  'MEDIUM',
  'HIGH',
]);

function isCommunicationStyle(
  value: string | null | undefined,
): value is CommunicationStyle {
  return typeof value === 'string' && COMMUNICATION_STYLES.has(value as CommunicationStyle);
}

function isResponseLength(
  value: string | null | undefined,
): value is ResponseLength {
  return typeof value === 'string' && RESPONSE_LENGTHS.has(value as ResponseLength);
}

function isProactivityLevel(
  value: string | null | undefined,
): value is ProactivityLevel {
  return typeof value === 'string' && PROACTIVITY_LEVELS.has(value as ProactivityLevel);
}

function getDisplayedRole(
  jobTitle: string | null | undefined,
  jobRole: string | null | undefined,
): string {
  if (typeof jobTitle === 'string' && jobTitle.trim().length > 0) {
    return jobTitle;
  }

  if (
    typeof jobRole === 'string' &&
    jobRole.trim().length > 0 &&
    jobRole !== 'OTHER'
  ) {
    return jobRole;
  }

  return '';
}

export function useSettingsState() {
  const storedSettings = getStoredUserSettings();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as import('@/lib/auth-client').SessionUser | undefined;
  const { theme, setTheme } = useThemePersistence();
  const [hydrated, setHydrated] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('general');
  const [language, setLanguage] = useState(storedSettings.language);
  const [timezone, setTimezone] = useState(storedSettings.timezone);
  const [emailNotifications, setEmailNotifications] = useState(storedSettings.emailNotifications);

  // TanStack Query hooks
  const { data: providers = [], isLoading: providersLoading, refetch: refetchProviders } = useProviders();
  const { data: userPrefsData, isLoading: userPrefsLoading } = useUserPreferences();
  const { data: subscriptionFeatures } = useSubscriptionFeatures();
  const { data: subscriptionLimits, refetch: refetchLimits } = useSubscriptionLimits();
  const updatePreferencesMutation = useUpdatePreferences();
  const syncAllMutation = useSyncAllProviders();
  const aiProfileLoading = userPrefsLoading;
  const aiSaveLoading = updatePreferencesMutation.isPending;

  // Feature flags based on subscription plan
  const canUseSmartReplies = subscriptionFeatures?.smart_replies ?? false;
  const canUseSummaries = subscriptionFeatures?.summaries ?? false;
  const canUseTriage = subscriptionFeatures?.auto_triage ?? false;

  // UI state
  const [providerError, setProviderError] = useState('');
  const [providerSuccess, setProviderSuccess] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [generalSuccess, setGeneralSuccess] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');
  const [aiDataLoading, setAiDataLoading] = useState(false);

  // AI state
  const [jobRole, setJobRole] = useState<string>('');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle>('CASUAL');
  const [responseLength, setResponseLength] = useState<ResponseLength>('MODERATE');
  const [proactivityLevel, setProactivityLevel] = useState<ProactivityLevel>('MEDIUM');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<number>(85);
  const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(true);
  const [summarizationEnabled, setSummarizationEnabled] = useState(true);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);
  const [triageEnabled, setTriageEnabled] = useState(false);
  // Display state (email density moved here per roadmap Phase A2)
  const [emailDensity, setEmailDensity] = useState<string>('comfortable');

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleLogout = async () => {
    // Clear offline data BEFORE destroying session (SYNC-04: prevent data leaks)
    await clearOfflineData();
    await authClient.signOut();
  };


  // Signature hooks — only fetch when section is active
  const sigSectionActive = selectedSection === 'signatures';
  const { data: signaturesData = EMPTY_SIGNATURES, isLoading: signaturesLoading } = useSignatures({ enabled: sigSectionActive });
  const createSignatureMutation = useCreateSignature();
  const updateSignatureMutation = useUpdateSignature();
  const deleteSignatureMutation = useDeleteSignature();
  const setDefaultSignatureMutation = useSetDefaultSignature();
  const [signatureError, setSignatureError] = useState('');

  // Sync AI feature toggles from user preferences
  useEffect(() => {
    if (userPrefsData) {
      queueMicrotask(() => {
        setSmartRepliesEnabled(userPrefsData.aiSmartRepliesEnabled ?? true);
        setSummarizationEnabled(userPrefsData.aiSummarizationEnabled ?? true);
        setSchedulingEnabled(userPrefsData.aiSchedulingEnabled ?? true);
        setTriageEnabled(userPrefsData.aiAutoTriageEnabled ?? false);
        setAutoApproveThreshold((userPrefsData.aiAutoApproveThreshold ?? 0.85) * 100);
        setEmailDensity(userPrefsData.emailDensity ?? 'comfortable');
        setJobRole(getDisplayedRole(userPrefsData.jobTitle, userPrefsData.jobRole));
        setCommunicationStyle(
          isCommunicationStyle(userPrefsData.communicationStyle)
            ? userPrefsData.communicationStyle
            : 'CASUAL',
        );
        setResponseLength(
          isResponseLength(userPrefsData.responseLength)
            ? userPrefsData.responseLength
            : 'MODERATE',
        );
        setProactivityLevel(
          isProactivityLevel(userPrefsData.proactivityLevel)
            ? userPrefsData.proactivityLevel
            : 'MEDIUM',
        );
      });
    }
  }, [userPrefsData]);

  // Mark client hydration after initial browser-backed state is ready
  useEffect(() => {
    queueMicrotask(() => setHydrated(true));
  }, []);

  // Load avatar from user profile — only when account section is active
  useEffect(() => {
    if (selectedSection !== 'account') return;
    const loadProfile = async () => {
      try {
        const profile = await usersApi.getProfile();
        setAvatarUrl(profile.avatarUrl);
      } catch {
        // Ignore errors, avatar is optional
      }
    };
    loadProfile();
  }, [selectedSection]);

  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';

  return {
    router, user, theme, setTheme,
    hydrated,
    selectedSection, setSelectedSection,
    language, setLanguage, timezone, setTimezone,
    emailNotifications, setEmailNotifications,
    providers, providersLoading, refetchProviders,
    subscriptionLimits, refetchLimits,
    updatePreferencesMutation, syncAllMutation,
    aiProfileLoading, aiSaveLoading,
    canUseSmartReplies, canUseSummaries, canUseTriage,
    providerError, setProviderError, providerSuccess, setProviderSuccess,
    saveLoading, setSaveLoading,
    generalSuccess, setGeneralSuccess, generalError, setGeneralError,
    aiError, setAiError, aiSuccess, setAiSuccess, aiDataLoading, setAiDataLoading,
    jobRole, setJobRole,
    communicationStyle, setCommunicationStyle,
    responseLength, setResponseLength,
    proactivityLevel, setProactivityLevel,
    autoApproveThreshold, setAutoApproveThreshold,
    smartRepliesEnabled, setSmartRepliesEnabled,
    summarizationEnabled, setSummarizationEnabled,
    schedulingEnabled, setSchedulingEnabled,
    triageEnabled, setTriageEnabled,
    emailDensity, setEmailDensity,
    deleteDialogOpen, setDeleteDialogOpen,
    deleteConfirmText, setDeleteConfirmText,
    deleteLoading, setDeleteLoading,
    deleteError, setDeleteError,
    avatarUrl, setAvatarUrl, avatarUploading, setAvatarUploading,
    logout: handleLogout,
    signaturesData, signaturesLoading,
    createSignatureMutation, updateSignatureMutation,
    deleteSignatureMutation, setDefaultSignatureMutation,
    signatureError, setSignatureError,
    accountName,
  };
}
