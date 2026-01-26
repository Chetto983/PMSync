import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  Avatar,
  alpha,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  Sparkles,
  Shield,
  CreditCard,
  FileSignature,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { usersApi } from '@/lib/api/users';
import {
  personalizationApi,
  type CommunicationStyle,
  type ResponseLength,
  type ProactivityLevel,
} from '@/lib/api/ai';
// NOTE: multiAgentApi removed - resetLearning endpoint doesn't exist
import { useAuth } from '@/lib/hooks/use-auth';
import {
  useAiProfile,
  useProviders,
  useUserPreferences,
  useUpdatePreferences,
  useUpdateAiProfile,
  useSyncAllProviders,
} from '@/hooks/queries';
import { useAuthStore } from '@/stores/auth-store';
import { logger } from '@/lib/logger';
import { useTranslations } from '@/lib/hooks/use-translations';
import { MfaSettings } from '@/components/mfa';
import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
  persistUserSettings,
} from '@/lib/utils/user-settings';
import {
  GeneralSettings,
  AiSettings,
  AccountsSettings,
  AccountSettings,
} from '@/components/settings';
import { SignatureSettings } from '@/components/settings/SignatureSettings';
import { BillingPanel } from '@/components/billing';
import {
  useSignatures,
  useCreateSignature,
  useUpdateSignature,
  useDeleteSignature,
  useSetDefaultSignature,
} from '@/hooks/queries/use-signatures';

type SettingsSection = 'general' | 'security' | 'ai' | 'accounts' | 'signatures' | 'account' | 'billing';

export function Settings() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations();
  const { theme, setTheme } = useThemePersistence();
  const settingsCopy = useMemo(() => t.settings, [t]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('general');
  const [language, setLanguage] = useState(DEFAULT_USER_SETTINGS.language);
  const [timezone, setTimezone] = useState(DEFAULT_USER_SETTINGS.timezone);
  const [emailNotifications, setEmailNotifications] = useState(DEFAULT_USER_SETTINGS.emailNotifications);

  // TanStack Query hooks
  const { data: providers = [], isLoading: providersLoading, refetch: refetchProviders } = useProviders();
  const { data: aiProfileData, isLoading: aiProfileLoading } = useAiProfile();
  const { data: userPrefsData } = useUserPreferences();
  const updateAiProfileMutation = useUpdateAiProfile();
  const updatePreferencesMutation = useUpdatePreferences();
  const syncAllMutation = useSyncAllProviders();
  const aiSaveLoading = updateAiProfileMutation.isPending || updatePreferencesMutation.isPending;

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

  const logout = useAuthStore((state) => state.logout);
  const setUser = useAuthStore((state) => state.setUser);

  // Signature hooks
  const { data: signaturesData = [], isLoading: signaturesLoading } = useSignatures();
  const createSignatureMutation = useCreateSignature();
  const updateSignatureMutation = useUpdateSignature();
  const deleteSignatureMutation = useDeleteSignature();
  const setDefaultSignatureMutation = useSetDefaultSignature();
  const [signatureError, setSignatureError] = useState('');

  const sections = useMemo(
    () => [
      { id: 'general', label: settingsCopy.sections.general, icon: <SettingsIcon size={18} /> },
      { id: 'security', label: settingsCopy.sections.security || 'Security', icon: <Shield size={18} /> },
      { id: 'ai', label: settingsCopy.sections.ai, icon: <Sparkles size={18} /> },
      { id: 'accounts', label: settingsCopy.sections.accounts, icon: <Mail size={18} /> },
      { id: 'signatures', label: settingsCopy.sections.signatures || 'Signatures', icon: <FileSignature size={18} /> },
      { id: 'account', label: settingsCopy.sections.account, icon: <User size={18} /> },
      { id: 'billing', label: settingsCopy.sections.billing || 'Billing', icon: <CreditCard size={18} /> },
    ],
    [settingsCopy.sections],
  );

  // Sync AI profile data
  useEffect(() => {
    if (aiProfileData) {
      setJobRole(aiProfileData.jobRole);
      setCommunicationStyle(aiProfileData.communicationStyle);
      setResponseLength(aiProfileData.responseLength);
      setProactivityLevel(aiProfileData.proactivityLevel);
    }
  }, [aiProfileData]);

  // Sync AI feature toggles from user preferences
  useEffect(() => {
    if (userPrefsData) {
      // Load AI feature toggles from backend (with fallback to defaults)
      setSmartRepliesEnabled(userPrefsData.aiSmartRepliesEnabled ?? true);
      setSummarizationEnabled(userPrefsData.aiSummarizationEnabled ?? true);
      setSchedulingEnabled(userPrefsData.aiSchedulingEnabled ?? true);
      setTriageEnabled(userPrefsData.aiAutoTriageEnabled ?? false);
      // Convert threshold from 0-1 to 0-100 for slider
      setAutoApproveThreshold((userPrefsData.aiAutoApproveThreshold ?? 0.85) * 100);
      // Load display preference
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

  // Handle URL section param
  useEffect(() => {
    if (!router.isReady) return;
    const sectionParam = router.query.section;
    if (typeof sectionParam === 'string' && sections.some((s) => s.id === sectionParam)) {
      setSelectedSection(sectionParam as SettingsSection);
    }
  }, [router.isReady, router.query.section, sections]);

  // Handle OAuth callback
  useEffect(() => {
    if (!router.isReady) return;
    const { success, error } = router.query;
    if (success) {
      setSelectedSection('accounts');
      setProviderSuccess('Account connected successfully');
      refetchProviders();
      router.replace({ pathname: router.pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
    if (error && typeof error === 'string') {
      setSelectedSection('accounts');
      setProviderError(error);
      router.replace({ pathname: router.pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
  }, [router, refetchProviders]);

  const handleSectionSelect = useCallback(
    (sectionId: SettingsSection) => {
      setSelectedSection(sectionId);
      if (!router.isReady) return;
      router.replace({ pathname: router.pathname, query: { section: sectionId } }, undefined, { shallow: true });
    },
    [router],
  );

  // Handlers
  const handleSaveSettings = async () => {
    try {
      setSaveLoading(true);
      setGeneralError('');
      setGeneralSuccess('');
      await usersApi.updatePreferences({ language });
      persistUserSettings({ language, timezone, emailNotifications });
      setGeneralSuccess(settingsCopy.generalPanel?.saveSuccess || 'Settings saved');
    } catch {
      setGeneralError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSyncAll = useCallback(async () => {
    if (!confirm(settingsCopy.mailAccountsPanel?.syncConfirm || 'Sync all accounts?')) {
      return;
    }
    try {
      const result = await syncAllMutation.mutateAsync();
      if (result.success) {
        setProviderSuccess(result.message || settingsCopy.mailAccountsPanel?.syncStarted || 'Sync started');
      } else {
        setProviderError(result.message || 'Sync returned unsuccessful');
      }
    } catch {

      setProviderError(settingsCopy.mailAccountsPanel?.syncFailed || 'Sync failed');
    }
  }, [syncAllMutation, settingsCopy.mailAccountsPanel]);

  const handleSaveAiProfile = useCallback(async () => {
    try {
      setAiError('');
      setAiSuccess('');
      await updateAiProfileMutation.mutateAsync({ jobRole, communicationStyle, responseLength, proactivityLevel });
      await updatePreferencesMutation.mutateAsync({
        aiSmartRepliesEnabled: smartRepliesEnabled,
        aiSummarizationEnabled: summarizationEnabled,
        aiSchedulingEnabled: schedulingEnabled,
        aiAutoTriageEnabled: triageEnabled,
        aiAutoApproveThreshold: autoApproveThreshold / 100,
      });
      setAiSuccess(settingsCopy.aiPanel?.savePreferences || 'Saved');
    } catch {
      setAiError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    }
  }, [jobRole, communicationStyle, responseLength, proactivityLevel, smartRepliesEnabled, summarizationEnabled, schedulingEnabled, triageEnabled, autoApproveThreshold, updateAiProfileMutation, updatePreferencesMutation, settingsCopy]);

  const handleClearAiMemory = useCallback(async () => {
    if (!confirm(settingsCopy.aiPanel?.clearMemory || 'Clear AI memory?')) return;
    try {
      setAiDataLoading(true);
      await personalizationApi.clearAllMemories();
      setAiSuccess(settingsCopy.aiPanel?.clearMemory || 'Memory cleared');
    } catch {
      setAiError(settingsCopy.generalPanel?.saveError || 'Failed');
    } finally {
      setAiDataLoading(false);
    }
  }, [settingsCopy]);

  const handleDeleteAccount = useCallback(async () => {
    const confirmWord = language === 'it' ? 'ELIMINA' : 'DELETE';
    if (deleteConfirmText !== confirmWord) return;
    try {
      setDeleteLoading(true);
      setDeleteError('');
      await usersApi.deleteAccount();
      logout();
      router.push('/login');
    } catch (error) {
      logger.error('Failed to delete account', { error });
      setDeleteError(settingsCopy.accountPanel?.deleteDialogError || 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteConfirmText, language, router, logout, settingsCopy]);

  const handleProviderInitiated = useCallback(() => setProviderSuccess('Redirecting...'), []);
  const handleProviderConnected = useCallback(() => { setProviderSuccess('Connected'); refetchProviders(); }, [refetchProviders]);
  const handleProviderDeleted = useCallback(() => { setProviderSuccess('Disconnected'); refetchProviders(); }, [refetchProviders]);
  const handleCloseDeleteDialog = useCallback(() => { setDeleteDialogOpen(false); setDeleteConfirmText(''); setDeleteError(''); }, []);

  // Avatar handlers
  // Resize and compress image before upload (max 256x256, JPEG 85% quality)
  const resizeImage = useCallback((file: File, maxSize = 256): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw with high quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 85% quality (good balance of size/quality)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.onerror = reject;
    });
  }, []);

  const handleAvatarUpload = useCallback(async (file: File) => {
    try {
      setAvatarUploading(true);
      // Resize and compress image before upload
      const resizedDataUrl = await resizeImage(file);
      const result = await usersApi.uploadAvatar(resizedDataUrl);
      setAvatarUrl(result.avatarUrl);
      // Update auth store so Header shows new avatar
      if (user) {
        setUser({ ...user, avatarUrl: result.avatarUrl });
      }
    } catch (error) {
      logger.error('Failed to upload avatar', { error });
    } finally {
      setAvatarUploading(false);
    }
  }, [resizeImage, user, setUser]);

  const handleAvatarRemove = useCallback(async () => {
    try {
      setAvatarUploading(true);
      await usersApi.deleteAvatar();
      setAvatarUrl(null);
      // Update auth store so Header removes avatar
      if (user) {
        setUser({ ...user, avatarUrl: null });
      }
    } catch (error) {
      logger.error('Failed to remove avatar', { error });
    } finally {
      setAvatarUploading(false);
    }
  }, [user, setUser]);

  // New handler for avatar editor (accepts data URL directly)
  const handleAvatarSave = useCallback(async (dataUrl: string) => {
    try {
      setAvatarUploading(true);
      const result = await usersApi.uploadAvatar(dataUrl);
      setAvatarUrl(result.avatarUrl);
      // Update auth store so Header shows new avatar
      if (user) {
        setUser({ ...user, avatarUrl: result.avatarUrl });
      }
    } catch (error) {
      logger.error('Failed to save avatar', { error });
      throw error; // Re-throw so dialog knows save failed
    } finally {
      setAvatarUploading(false);
    }
  }, [user, setUser]);

  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';

  // Build copy objects for child components
  const generalCopy = useMemo(() => ({
    title: settingsCopy.generalPanel?.title || 'General',
    description: settingsCopy.generalPanel?.description || '',
    appearanceTitle: settingsCopy.generalPanel?.appearanceTitle || 'Appearance',
    themeLabel: settingsCopy.generalPanel?.themeLabel || 'Theme',
    themeOptions: settingsCopy.generalPanel?.themeOptions || { light: 'Light', dark: 'Dark', system: 'System' },
    emailDensityLabel: settingsCopy.generalPanel?.emailDensityLabel || 'Email List Density',
    emailDensityDescription: settingsCopy.generalPanel?.emailDensityDescription || 'Adjust spacing in email lists',
    emailDensities: settingsCopy.generalPanel?.emailDensities || { comfortable: 'Comfortable', compact: 'Compact', spacious: 'Spacious' },
    languageTitle: settingsCopy.generalPanel?.languageTitle || 'Language',
    languageLabel: settingsCopy.generalPanel?.languageLabel || 'Language',
    timezoneLabel: settingsCopy.generalPanel?.timezoneLabel || 'Timezone',
    saveSuccess: settingsCopy.generalPanel?.saveSuccess || 'Saved',
    saveError: settingsCopy.generalPanel?.saveError || 'Failed',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
    save: 'Save',
  }), [settingsCopy]);

  const aiCopy = useMemo(() => ({
    title: settingsCopy.aiPanel?.title || 'AI',
    description: settingsCopy.aiPanel?.description || '',
    featuresTitle: settingsCopy.aiPanel?.featuresTitle || 'Features',
    featuresDescription: settingsCopy.aiPanel?.featuresDescription || '',
    smartRepliesTitle: settingsCopy.aiPanel?.smartRepliesTitle || 'Smart Replies',
    smartRepliesDescription: settingsCopy.aiPanel?.smartRepliesDescription || '',
    summarizationTitle: settingsCopy.aiPanel?.summarizationTitle || 'Summarization',
    summarizationDescription: settingsCopy.aiPanel?.summarizationDescription || '',
    schedulingTitle: settingsCopy.aiPanel?.schedulingTitle || 'Scheduling',
    schedulingDescription: settingsCopy.aiPanel?.schedulingDescription || '',
    triageTitle: settingsCopy.aiPanel?.triageTitle || 'Auto-Triage',
    triageDescription: settingsCopy.aiPanel?.triageDescription || 'Automatically prioritize and label incoming emails',
    personalizationTitle: settingsCopy.aiPanel?.personalizationTitle || 'Personalization',
    personalizationDescription: settingsCopy.aiPanel?.personalizationDescription || '',
    roleLabel: settingsCopy.aiPanel?.roleLabel || 'Role',
    communicationLabel: settingsCopy.aiPanel?.communicationLabel || 'Communication',
    responseLengthLabel: settingsCopy.aiPanel?.responseLengthLabel || 'Length',
    proactivityLabel: settingsCopy.aiPanel?.proactivityLabel || 'Proactivity',
    autoApproveLabel: settingsCopy.aiPanel?.autoApproveLabel || 'Auto-Approve',
    autoApproveHint: settingsCopy.aiPanel?.autoApproveHint || '',
    savePreferences: settingsCopy.aiPanel?.savePreferences || 'Save',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
    openAssistant: settingsCopy.aiPanel?.openAssistant || 'Open AI',
    dataManagementTitle: settingsCopy.aiPanel?.dataManagementTitle || 'Data',
    dataManagementDescription: settingsCopy.aiPanel?.dataManagementDescription || '',
    clearMemory: settingsCopy.aiPanel?.clearMemory || 'Clear',
    // Toggle button labels (must match backend enums)
    styles: settingsCopy.aiPanel?.personalization?.styles || { FORMAL: 'Formal', CASUAL: 'Casual', TECHNICAL: 'Technical', CREATIVE: 'Creative' },
    lengths: settingsCopy.aiPanel?.personalization?.lengths || { BRIEF: 'Brief', MODERATE: 'Moderate', DETAILED: 'Detailed' },
    proactivityLevels: settingsCopy.aiPanel?.personalization?.proactivityLevels || { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' },
  }), [settingsCopy]);

  const accountsCopy = useMemo(() => ({
    title: settingsCopy.mailAccountsPanel?.title || 'Accounts',
    description: settingsCopy.mailAccountsPanel?.description || '',
    connectedTitle: settingsCopy.mailAccountsPanel?.connectedTitle || 'Connected',
    refreshTooltip: settingsCopy.mailAccountsPanel?.refreshTooltip || 'Refresh',
    syncAll: settingsCopy.mailAccountsPanel?.syncAll || 'Sync All',
    syncing: settingsCopy.mailAccountsPanel?.syncing || 'Syncing...',
    addTitle: settingsCopy.mailAccountsPanel?.addTitle || 'Add',
    addDescription: settingsCopy.mailAccountsPanel?.addDescription || '',
  }), [settingsCopy]);

  const accountCopy = useMemo(() => ({
    title: settingsCopy.accountPanel?.title || 'Account',
    description: settingsCopy.accountPanel?.description || '',
    profileTitle: settingsCopy.accountPanel?.profileTitle || 'Profile',
    fullName: settingsCopy.accountPanel?.fullName || 'Name',
    email: settingsCopy.accountPanel?.email || 'Email',
    role: settingsCopy.accountPanel?.role || 'Role',
    contactAdmin: settingsCopy.accountPanel?.contactAdmin || '',
    dangerZoneTitle: settingsCopy.accountPanel?.dangerZoneTitle || 'Danger',
    dangerZoneDescription: settingsCopy.accountPanel?.dangerZoneDescription || '',
    deleteAccount: settingsCopy.accountPanel?.deleteAccount || 'Delete',
    deleteDialogTitle: settingsCopy.accountPanel?.deleteDialogTitle || 'Delete',
    deleteDialogDescription: settingsCopy.accountPanel?.deleteDialogDescription || '',
    deleteDialogConfirmLabel: settingsCopy.accountPanel?.deleteDialogConfirmLabel || 'Type DELETE',
    deleteDialogCancel: settingsCopy.accountPanel?.deleteDialogCancel || 'Cancel',
    deleteDialogConfirm: settingsCopy.accountPanel?.deleteDialogConfirm || 'Delete',
    deleteDialogDeleting: settingsCopy.accountPanel?.deleteDialogDeleting || 'Deleting...',
    deleteDialogError: settingsCopy.accountPanel?.deleteDialogError || 'Error',
    avatar: settingsCopy.accountPanel?.avatar,
  }), [settingsCopy]);

  const signaturesCopy = useMemo(() => ({
    title: settingsCopy.signaturesPanel?.title || 'Email Signatures',
    description: settingsCopy.signaturesPanel?.description || 'Create and manage email signatures.',
    addSignature: settingsCopy.signaturesPanel?.addSignature || 'Add Signature',
    editSignature: settingsCopy.signaturesPanel?.editSignature || 'Edit Signature',
    deleteSignature: settingsCopy.signaturesPanel?.deleteSignature || 'Delete',
    signatureName: settingsCopy.signaturesPanel?.signatureName || 'Signature Name',
    signatureNamePlaceholder: settingsCopy.signaturesPanel?.signatureNamePlaceholder || 'e.g., Work, Personal',
    signatureContent: settingsCopy.signaturesPanel?.signatureContent || 'Signature Content',
    setAsDefault: settingsCopy.signaturesPanel?.setAsDefault || 'Set as Default',
    defaultBadge: settingsCopy.signaturesPanel?.defaultBadge || 'Default',
    save: settingsCopy.signaturesPanel?.save || 'Save',
    cancel: settingsCopy.signaturesPanel?.cancel || 'Cancel',
    deleteConfirmTitle: settingsCopy.signaturesPanel?.deleteConfirmTitle || 'Delete Signature',
    deleteConfirmMessage: settingsCopy.signaturesPanel?.deleteConfirmMessage || 'Are you sure you want to delete this signature?',
    noSignatures: settingsCopy.signaturesPanel?.noSignatures || 'No signatures yet.',
    previewTitle: settingsCopy.signaturesPanel?.previewTitle || 'Preview',
  }), [settingsCopy]);

  // Signature handlers
  const handleSaveSignature = useCallback(async (signature: { id?: string; name: string; content: string; isDefault: boolean }) => {
    try {
      setSignatureError('');
      if (signature.id) {
        await updateSignatureMutation.mutateAsync({ id: signature.id, dto: { name: signature.name, content: signature.content, isDefault: signature.isDefault } });
      } else {
        await createSignatureMutation.mutateAsync({ name: signature.name, content: signature.content, isDefault: signature.isDefault });
      }
    } catch {
      setSignatureError('Failed to save signature');
    }
  }, [createSignatureMutation, updateSignatureMutation]);

  const handleDeleteSignature = useCallback(async (id: string) => {
    try {
      setSignatureError('');
      await deleteSignatureMutation.mutateAsync(id);
    } catch {
      setSignatureError('Failed to delete signature');
    }
  }, [deleteSignatureMutation]);

  const handleSetDefaultSignature = useCallback(async (id: string) => {
    try {
      setSignatureError('');
      await setDefaultSignatureMutation.mutateAsync(id);
    } catch {
      setSignatureError('Failed to set default signature');
    }
  }, [setDefaultSignatureMutation]);

  if (!hydrated) {
    return (
      <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar - matches email page pattern */}
      <Box sx={{ width: 280, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', overflow: 'auto' }}>
        <Box sx={{ p: 2 }}>
          <List disablePadding>
            {sections.map((section) => (
              <ListItemButton key={section.id} selected={selectedSection === section.id} onClick={() => handleSectionSelect(section.id as SettingsSection)} sx={{ borderRadius: 2, mb: 0.5, py: 1, '&.Mui-selected': { bgcolor: (th) => alpha(th.palette.primary.main, 0.08), '&:hover': { bgcolor: (th) => alpha(th.palette.primary.main, 0.12) } } }}>
                <ListItemIcon sx={{ minWidth: 36, color: selectedSection === section.id ? 'primary.main' : 'text.secondary' }}>{section.icon}</ListItemIcon>
                <ListItemText primary={section.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selectedSection === section.id ? 600 : 400 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Box sx={{ mt: 'auto', p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.875rem' }}>{accountName.charAt(0).toUpperCase()}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{accountName}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{user?.email}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Mobile nav */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" fullWidth>
            <Select value={selectedSection} onChange={(e) => handleSectionSelect(e.target.value as SettingsSection)}>
              {sections.map((s) => <MenuItem key={s.id} value={s.id}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{s.icon}{s.label}</Box></MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
          <Box sx={{ maxWidth: 1200 }}>
            {selectedSection === 'general' && (
              <GeneralSettings theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} timezone={timezone} setTimezone={setTimezone} emailDensity={emailDensity} setEmailDensity={setEmailDensity} saveLoading={saveLoading} onSave={handleSaveSettings} success={generalSuccess} error={generalError} onClearSuccess={() => setGeneralSuccess('')} onClearError={() => setGeneralError('')} copy={generalCopy} />
            )}
            {selectedSection === 'security' && <MfaSettings />}
            {selectedSection === 'ai' && (
              <AiSettings loading={aiProfileLoading} saveLoading={aiSaveLoading} dataLoading={aiDataLoading} success={aiSuccess} error={aiError} onClearSuccess={() => setAiSuccess('')} onClearError={() => setAiError('')} smartRepliesEnabled={smartRepliesEnabled} setSmartRepliesEnabled={setSmartRepliesEnabled} summarizationEnabled={summarizationEnabled} setSummarizationEnabled={setSummarizationEnabled} schedulingEnabled={schedulingEnabled} setSchedulingEnabled={setSchedulingEnabled} triageEnabled={triageEnabled} setTriageEnabled={setTriageEnabled} jobRole={jobRole} setJobRole={setJobRole} communicationStyle={communicationStyle} setCommunicationStyle={setCommunicationStyle} responseLength={responseLength} setResponseLength={setResponseLength} proactivityLevel={proactivityLevel} setProactivityLevel={setProactivityLevel} autoApproveThreshold={autoApproveThreshold} setAutoApproveThreshold={setAutoApproveThreshold} onSave={handleSaveAiProfile} onClearMemory={handleClearAiMemory} onOpenAssistant={() => router.push('/dashboard/ai')} copy={aiCopy} />
            )}
            {selectedSection === 'accounts' && (
              <AccountsSettings providers={providers} providersLoading={providersLoading} syncLoading={syncAllMutation.isPending} success={providerSuccess} error={providerError} onClearSuccess={() => setProviderSuccess('')} onClearError={() => setProviderError('')} onRefresh={() => refetchProviders()} onSyncAll={handleSyncAll} onProviderInitiated={handleProviderInitiated} onProviderConnected={handleProviderConnected} onProviderDeleted={handleProviderDeleted} copy={accountsCopy} />
            )}
            {selectedSection === 'signatures' && (
              <SignatureSettings
                signatures={signaturesData.map(s => ({ id: s.id, name: s.name, content: s.content, isDefault: s.isDefault, createdAt: s.createdAt, updatedAt: s.updatedAt }))}
                onSave={handleSaveSignature}
                onDelete={handleDeleteSignature}
                onSetDefault={handleSetDefaultSignature}
                loading={signaturesLoading || createSignatureMutation.isPending || updateSignatureMutation.isPending || deleteSignatureMutation.isPending}
                error={signatureError}
                onClearError={() => setSignatureError('')}
                copy={signaturesCopy}
              />
            )}
            {selectedSection === 'account' && (
              <AccountSettings accountName={accountName} email={user?.email || ''} role={user?.role || ''} language={language} avatarUrl={avatarUrl} avatarUploading={avatarUploading} onAvatarUpload={handleAvatarUpload} onAvatarSave={handleAvatarSave} onAvatarRemove={handleAvatarRemove} deleteDialogOpen={deleteDialogOpen} deleteConfirmText={deleteConfirmText} deleteLoading={deleteLoading} deleteError={deleteError} onOpenDeleteDialog={() => setDeleteDialogOpen(true)} onCloseDeleteDialog={handleCloseDeleteDialog} onDeleteConfirmTextChange={setDeleteConfirmText} onDeleteAccount={handleDeleteAccount} copy={accountCopy} />
            )}
            {selectedSection === 'billing' && <BillingPanel />}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
