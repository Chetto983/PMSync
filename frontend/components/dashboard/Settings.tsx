import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
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
  Bell,
  Mail,
  Sparkles,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { usersApi } from '@/lib/api/users';
import {
  personalizationApi,
  type JobRole,
  type CommunicationStyle,
  type ResponseLength,
  type ProactivityLevel,
} from '@/lib/api/personalization';
import { multiAgentApi } from '@/lib/api/ai';
import { useAuth } from '@/lib/hooks/use-auth';
import {
  useAiProfile,
  useProviders,
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
  NotificationsSettings,
} from '@/components/settings';

type SettingsSection = 'general' | 'security' | 'ai' | 'accounts' | 'account' | 'notifications';

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
  const [jobRole, setJobRole] = useState<JobRole>('IC');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle>('CASUAL');
  const [responseLength, setResponseLength] = useState<ResponseLength>('MODERATE');
  const [proactivityLevel, setProactivityLevel] = useState<ProactivityLevel>('MEDIUM');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<number>(85);
  const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(true);
  const [summarizationEnabled, setSummarizationEnabled] = useState(true);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);

  // Notification state
  const [newEmailNotif, setNewEmailNotif] = useState(true);
  const [calendarNotif, setCalendarNotif] = useState(true);
  const [aiActionsNotif, setAiActionsNotif] = useState(true);
  const [notifSaveLoading, setNotifSaveLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState('');
  const [notifError, setNotifError] = useState('');

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const logout = useAuthStore((state) => state.logout);

  const sections = useMemo(
    () => [
      { id: 'general', label: settingsCopy.sections.general, icon: <SettingsIcon size={18} /> },
      { id: 'security', label: settingsCopy.sections.security || 'Security', icon: <Shield size={18} /> },
      { id: 'ai', label: settingsCopy.sections.ai, icon: <Sparkles size={18} /> },
      { id: 'accounts', label: settingsCopy.sections.accounts, icon: <Mail size={18} /> },
      { id: 'account', label: settingsCopy.sections.account, icon: <User size={18} /> },
      { id: 'notifications', label: settingsCopy.sections.notifications, icon: <Bell size={18} /> },
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

  // Load settings from localStorage
  useEffect(() => {
    const saved = getStoredUserSettings();
    setLanguage(saved.language);
    setTimezone(saved.timezone);
    setEmailNotifications(saved.emailNotifications);
    setHydrated(true);
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
    if (!confirm(settingsCopy.mailAccountsPanel?.syncConfirm || 'Sync all accounts?')) return;
    try {
      const result = await syncAllMutation.mutateAsync();
      if (result.success) {
        setProviderSuccess(settingsCopy.mailAccountsPanel?.syncStarted || 'Sync started');
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
        aiAutoApproveThreshold: autoApproveThreshold / 100,
      });
      setAiSuccess(settingsCopy.aiPanel?.savePreferences || 'Saved');
    } catch {
      setAiError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    }
  }, [jobRole, communicationStyle, responseLength, proactivityLevel, smartRepliesEnabled, summarizationEnabled, schedulingEnabled, autoApproveThreshold, updateAiProfileMutation, updatePreferencesMutation, settingsCopy]);

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

  const handleResetAiLearning = useCallback(async () => {
    if (!confirm(settingsCopy.aiPanel?.resetLearning || 'Reset AI learning?')) return;
    try {
      setAiDataLoading(true);
      await multiAgentApi.resetLearning();
      setAiSuccess(settingsCopy.aiPanel?.resetLearning || 'Learning reset');
    } catch {
      setAiError(settingsCopy.generalPanel?.saveError || 'Failed');
    } finally {
      setAiDataLoading(false);
    }
  }, [settingsCopy]);

  const handleSaveNotifications = useCallback(async () => {
    try {
      setNotifSaveLoading(true);
      setNotifError('');
      setNotifSuccess('');
      setNotifSuccess(settingsCopy.notificationsPanel?.save || 'Saved');
    } catch {
      setNotifError(settingsCopy.generalPanel?.saveError || 'Failed');
    } finally {
      setNotifSaveLoading(false);
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

  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';

  // Build copy objects for child components
  const generalCopy = useMemo(() => ({
    title: settingsCopy.generalPanel?.title || 'General',
    description: settingsCopy.generalPanel?.description || '',
    appearanceTitle: settingsCopy.generalPanel?.appearanceTitle || 'Appearance',
    themeLabel: settingsCopy.generalPanel?.themeLabel || 'Theme',
    themeOptions: settingsCopy.generalPanel?.themeOptions || { light: 'Light', dark: 'Dark', system: 'System' },
    languageTitle: settingsCopy.generalPanel?.languageTitle || 'Language',
    languageLabel: settingsCopy.generalPanel?.languageLabel || 'Language',
    timezoneLabel: settingsCopy.generalPanel?.timezoneLabel || 'Timezone',
    saveSuccess: settingsCopy.generalPanel?.saveSuccess || 'Saved',
    saveError: settingsCopy.generalPanel?.saveError || 'Failed',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
    save: settingsCopy.notificationsPanel?.save || 'Save',
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
    resetLearning: settingsCopy.aiPanel?.resetLearning || 'Reset',
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
  }), [settingsCopy]);

  const notifCopy = useMemo(() => ({
    title: settingsCopy.notificationsPanel?.title || 'Notifications',
    description: settingsCopy.notificationsPanel?.description || '',
    emailTitle: settingsCopy.notificationsPanel?.emailTitle || 'Email',
    newEmailsTitle: settingsCopy.notificationsPanel?.newEmailsTitle || 'New Emails',
    newEmailsDesc: settingsCopy.notificationsPanel?.newEmailsDesc || '',
    calendarTitle: settingsCopy.notificationsPanel?.calendarTitle || 'Calendar',
    calendarDesc: settingsCopy.notificationsPanel?.calendarDesc || '',
    aiActionsTitle: settingsCopy.notificationsPanel?.aiActionsTitle || 'AI Actions',
    aiActionsDesc: settingsCopy.notificationsPanel?.aiActionsDesc || '',
    save: settingsCopy.notificationsPanel?.save || 'Save',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
  }), [settingsCopy]);

  if (!hydrated) {
    return (
      <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'row', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Paper elevation={0} sx={{ width: 260, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: { xs: 'none', md: 'flex' }, flexDirection: 'column', bgcolor: 'background.paper', position: 'sticky', top: 64, height: 'calc(100vh - 64px)', overflowY: 'auto' }}>
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{settingsCopy.pageTitle || 'Settings'}</Typography>
        </Box>
        <List sx={{ flex: 1, px: 1.5 }}>
          {sections.map((section) => (
            <ListItemButton key={section.id} selected={selectedSection === section.id} onClick={() => handleSectionSelect(section.id as SettingsSection)} sx={{ borderRadius: 2, mb: 0.5, '&.Mui-selected': { bgcolor: (th) => alpha(th.palette.primary.main, 0.08), '&:hover': { bgcolor: (th) => alpha(th.palette.primary.main, 0.12) } } }}>
              <ListItemIcon sx={{ minWidth: 36, color: selectedSection === section.id ? 'primary.main' : 'text.secondary' }}>{section.icon}</ListItemIcon>
              <ListItemText primary={section.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selectedSection === section.id ? 600 : 400 }} />
              {selectedSection === section.id && <ChevronRight size={16} />}
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.875rem' }}>{accountName.charAt(0).toUpperCase()}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{accountName}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{user?.email}</Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Mobile nav */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, px: 2, py: 2, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexShrink: 0 }}>{settingsCopy.pageTitle || 'Settings'}</Typography>
          <FormControl size="small" sx={{ flex: 1, minWidth: 120 }}>
            <Select value={selectedSection} onChange={(e) => handleSectionSelect(e.target.value as SettingsSection)}>
              {sections.map((s) => <MenuItem key={s.id} value={s.id}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{s.icon}{s.label}</Box></MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 }, bgcolor: 'background.default' }}>
          <Box sx={{ maxWidth: { xs: '100%', md: 800 }, mx: 'auto' }}>
            {selectedSection === 'general' && (
              <GeneralSettings theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} timezone={timezone} setTimezone={setTimezone} saveLoading={saveLoading} onSave={handleSaveSettings} success={generalSuccess} error={generalError} onClearSuccess={() => setGeneralSuccess('')} onClearError={() => setGeneralError('')} copy={generalCopy} />
            )}
            {selectedSection === 'security' && <MfaSettings />}
            {selectedSection === 'ai' && (
              <AiSettings loading={aiProfileLoading} saveLoading={aiSaveLoading} dataLoading={aiDataLoading} success={aiSuccess} error={aiError} onClearSuccess={() => setAiSuccess('')} onClearError={() => setAiError('')} smartRepliesEnabled={smartRepliesEnabled} setSmartRepliesEnabled={setSmartRepliesEnabled} summarizationEnabled={summarizationEnabled} setSummarizationEnabled={setSummarizationEnabled} schedulingEnabled={schedulingEnabled} setSchedulingEnabled={setSchedulingEnabled} jobRole={jobRole} setJobRole={setJobRole} communicationStyle={communicationStyle} setCommunicationStyle={setCommunicationStyle} responseLength={responseLength} setResponseLength={setResponseLength} proactivityLevel={proactivityLevel} setProactivityLevel={setProactivityLevel} autoApproveThreshold={autoApproveThreshold} setAutoApproveThreshold={setAutoApproveThreshold} onSave={handleSaveAiProfile} onClearMemory={handleClearAiMemory} onResetLearning={handleResetAiLearning} onOpenAssistant={() => router.push('/dashboard/ai')} copy={aiCopy} />
            )}
            {selectedSection === 'accounts' && (
              <AccountsSettings providers={providers} providersLoading={providersLoading} syncLoading={syncAllMutation.isPending} success={providerSuccess} error={providerError} onClearSuccess={() => setProviderSuccess('')} onClearError={() => setProviderError('')} onRefresh={() => refetchProviders()} onSyncAll={handleSyncAll} onProviderInitiated={handleProviderInitiated} onProviderConnected={handleProviderConnected} onProviderDeleted={handleProviderDeleted} copy={accountsCopy} />
            )}
            {selectedSection === 'account' && (
              <AccountSettings accountName={accountName} email={user?.email || ''} role={user?.role || ''} language={language} deleteDialogOpen={deleteDialogOpen} deleteConfirmText={deleteConfirmText} deleteLoading={deleteLoading} deleteError={deleteError} onOpenDeleteDialog={() => setDeleteDialogOpen(true)} onCloseDeleteDialog={handleCloseDeleteDialog} onDeleteConfirmTextChange={setDeleteConfirmText} onDeleteAccount={handleDeleteAccount} copy={accountCopy} />
            )}
            {selectedSection === 'notifications' && (
              <NotificationsSettings newEmailNotif={newEmailNotif} setNewEmailNotif={setNewEmailNotif} calendarNotif={calendarNotif} setCalendarNotif={setCalendarNotif} aiActionsNotif={aiActionsNotif} setAiActionsNotif={setAiActionsNotif} saveLoading={notifSaveLoading} onSave={handleSaveNotifications} success={notifSuccess} error={notifError} onClearSuccess={() => setNotifSuccess('')} onClearError={() => setNotifError('')} copy={notifCopy} />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
