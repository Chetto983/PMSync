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
import {
  useProviders,
  useUserPreferences,
  useUpdatePreferences,
  useSyncAllProviders,
  useSubscriptionFeatures,
  useSubscriptionLimits,
} from '@/hooks/queries';

import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
} from '@/lib/utils/user-settings';
import {
  useSignatures,
  useCreateSignature,
  useUpdateSignature,
  useDeleteSignature,
  useSetDefaultSignature,
} from '@/hooks/queries/use-signatures';

export type SettingsSection = 'general' | 'security' | 'ai' | 'accounts' | 'signatures' | 'consent' | 'dataRights' | 'account' | 'billing' | 'telegram';

export function useSettingsState() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as import('@/lib/auth-client').SessionUser | undefined;
  const { theme, setTheme } = useThemePersistence();
  const [hydrated, setHydrated] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('general');
  const [language, setLanguage] = useState(DEFAULT_USER_SETTINGS.language);
  const [timezone, setTimezone] = useState(DEFAULT_USER_SETTINGS.timezone);
  const [emailNotifications, setEmailNotifications] = useState(DEFAULT_USER_SETTINGS.emailNotifications);

  // TanStack Query hooks
  const { data: providers = [], isLoading: providersLoading, refetch: refetchProviders } = useProviders();
  const { data: userPrefsData } = useUserPreferences();
  const { data: subscriptionFeatures } = useSubscriptionFeatures();
  const { data: subscriptionLimits, refetch: refetchLimits } = useSubscriptionLimits();
  const updatePreferencesMutation = useUpdatePreferences();
  const syncAllMutation = useSyncAllProviders();
  const aiProfileLoading = false; // AI profile endpoint removed
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
  const [aiDataLoading] = useState(false);

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
    await authClient.signOut();
  };


  // Signature hooks
  const { data: signaturesData = [], isLoading: signaturesLoading } = useSignatures();
  const createSignatureMutation = useCreateSignature();
  const updateSignatureMutation = useUpdateSignature();
  const deleteSignatureMutation = useDeleteSignature();
  const setDefaultSignatureMutation = useSetDefaultSignature();
  const [signatureError, setSignatureError] = useState('');

  // Sync AI feature toggles from user preferences
  useEffect(() => {
    if (userPrefsData) {
      setSmartRepliesEnabled(userPrefsData.aiSmartRepliesEnabled ?? true);
      setSummarizationEnabled(userPrefsData.aiSummarizationEnabled ?? true);
      setSchedulingEnabled(userPrefsData.aiSchedulingEnabled ?? true);
      setTriageEnabled(userPrefsData.aiAutoTriageEnabled ?? false);
      setAutoApproveThreshold((userPrefsData.aiAutoApproveThreshold ?? 0.85) * 100);
      setEmailDensity(userPrefsData.emailDensity ?? 'comfortable');
    }
  }, [userPrefsData]);

  // Load settings from localStorage
  useEffect(() => {
    const saved = getStoredUserSettings();
    setLanguage(saved.language);
    setTimezone(saved.timezone);
    setEmailNotifications(saved.emailNotifications);
    setHydrated(true);
  }, []);

  // Load avatar from user profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await usersApi.getProfile();
        setAvatarUrl(profile.avatarUrl);
      } catch {
        // Ignore errors, avatar is optional
      }
    };
    loadProfile();
  }, []);

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
    aiError, setAiError, aiSuccess, setAiSuccess, aiDataLoading,
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
