import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Card,
  CardContent,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Stack,
  CircularProgress,
  Alert,
  Slider,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Mail,
  Moon,
  Sun,
  Monitor,
  Sparkles,
  RefreshCw,
  Trash2,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  FileText,
  Calendar,
  Shield,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
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
import { logger } from '@/lib/logger';
import { useTranslations } from '@/lib/hooks/use-translations';
import { GoogleProviderCard } from '@/components/providers/GoogleProviderCard';
import { MicrosoftProviderCard } from '@/components/providers/MicrosoftProviderCard';
import { GenericProviderCard } from '@/components/providers/GenericProviderCard';
import { ProvidersList } from '@/components/providers/ProvidersList';
import { MfaSettings } from '@/components/mfa';
import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
  persistUserSettings,
} from '@/lib/utils/user-settings';

type SettingsSection = 'general' | 'security' | 'ai' | 'accounts' | 'account' | 'notifications';

// Setting row component for consistent styling
function SettingRow({
  icon,
  title,
  description,
  children,
  noBorder,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 2,
        px: 0,
        borderBottom: noBorder ? 0 : 1,
        borderColor: 'divider',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {icon && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Box>
  );
}

// Section card component
function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: description ? 1 : 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {action}
        </Box>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {description}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

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
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerSuccess, setProviderSuccess] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [generalSuccess, setGeneralSuccess] = useState('');
  const [generalError, setGeneralError] = useState('');

  // AI Personalization state
  const [aiProfileLoading, setAiProfileLoading] = useState(false);
  const [aiSaveLoading, setAiSaveLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');
  const [jobRole, setJobRole] = useState<JobRole>('IC');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle>('CASUAL');
  const [responseLength, setResponseLength] = useState<ResponseLength>('MODERATE');
  const [proactivityLevel, setProactivityLevel] = useState<ProactivityLevel>('MEDIUM');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<number>(85);
  const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(true);
  const [summarizationEnabled, setSummarizationEnabled] = useState(true);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);

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

  const copy = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- settingsCopy has dynamic nested structure
    const sc = settingsCopy as any;
    return {
      pageTitle: sc.pageTitle || 'Settings',
      general: {
        saveSuccess: sc.generalPanel?.saveSuccess || 'Settings saved',
        saveError: sc.generalPanel?.saveError || 'Failed to save',
      },
      ai: {
        autoApproveLabel: sc.aiPanel?.autoApproveLabel || 'Auto-Approve Threshold',
        autoApproveHint:
          sc.aiPanel?.autoApproveHint || 'Actions with confidence above this threshold will be auto-approved',
        saving: sc.aiPanel?.saving || 'Saving...',
        savePreferences: sc.aiPanel?.savePreferences || 'Save Preferences',
        openAssistant: sc.aiPanel?.openAssistant || 'Open AI Assistant',
        dataManagementTitle: sc.aiPanel?.dataManagementTitle || 'Data Management',
        dataManagementDescription:
          sc.aiPanel?.dataManagementDescription || 'Manage your AI data and learning history',
        clearMemory: sc.aiPanel?.clearMemory || 'Clear Memory',
        resetLearning: sc.aiPanel?.resetLearning || 'Reset Learning',
        featuresTitle: sc.aiPanel?.featuresTitle,
        featuresDescription: sc.aiPanel?.featuresDescription,
        smartRepliesTitle: sc.aiPanel?.smartRepliesTitle,
        smartRepliesDescription: sc.aiPanel?.smartRepliesDescription,
        summarizationTitle: sc.aiPanel?.summarizationTitle,
        summarizationDescription: sc.aiPanel?.summarizationDescription,
        schedulingTitle: sc.aiPanel?.schedulingTitle,
        schedulingDescription: sc.aiPanel?.schedulingDescription,
        personalizationTitle: sc.aiPanel?.personalizationTitle,
        personalizationDescription: sc.aiPanel?.personalizationDescription,
        roleLabel: sc.aiPanel?.roleLabel,
        communicationLabel: sc.aiPanel?.communicationLabel,
        responseLengthLabel: sc.aiPanel?.responseLengthLabel,
        proactivityLabel: sc.aiPanel?.proactivityLabel,
      },
      accounts: {
        description: sc.mailAccountsPanel?.description || 'Connect and manage your email accounts.',
        connectedTitle: sc.mailAccountsPanel?.connectedTitle || 'Connected Accounts',
        refreshTooltip: sc.mailAccountsPanel?.refreshTooltip || 'Refresh',
        syncAll: sc.mailAccountsPanel?.syncAll || 'Sync All',
        syncing: sc.mailAccountsPanel?.syncing || 'Syncing...',
        syncConfirm:
          sc.mailAccountsPanel?.syncConfirm || 'This will re-sync all emails from providers. Continue?',
        syncStarted: sc.mailAccountsPanel?.syncStarted || 'Sync started successfully',
        syncFailed: sc.mailAccountsPanel?.syncFailed || 'Failed to start sync',
        addTitle: sc.mailAccountsPanel?.addTitle || 'Add Account',
        addDescription: sc.mailAccountsPanel?.addDescription || 'Connect a new email account',
      },
      account: {
        description: sc.accountPanel?.description || 'Manage your account information.',
        contactAdmin:
          sc.accountPanel?.contactAdmin || 'Contact your administrator to update account information.',
        dangerZoneTitle: sc.accountPanel?.dangerZoneTitle || 'Danger Zone',
        dangerZoneDescription:
          sc.accountPanel?.dangerZoneDescription || 'Permanently delete your account and all associated data.',
        deleteAccount: sc.accountPanel?.deleteAccount || 'Delete Account',
        fullName: sc.accountPanel?.fullName || 'Full Name',
        email: sc.accountPanel?.email || 'Email',
        role: sc.accountPanel?.role || 'Role',
        profileTitle: sc.accountPanel?.profileTitle,
      },
      notifications: {
        description: sc.notificationsPanel?.description || 'Configure how and when you receive notifications.',
        newEmailsTitle: sc.notificationsPanel?.newEmailsTitle || 'New Emails',
        newEmailsDesc: sc.notificationsPanel?.newEmailsDesc || 'Get notified when you receive new emails',
        calendarTitle: sc.notificationsPanel?.calendarTitle || 'Calendar Reminders',
        calendarDesc: sc.notificationsPanel?.calendarDesc || 'Reminders for upcoming events',
        aiActionsTitle: sc.notificationsPanel?.aiActionsTitle || 'AI Actions',
        aiActionsDesc: sc.notificationsPanel?.aiActionsDesc || 'Notifications for AI-suggested actions',
        save: sc.notificationsPanel?.save || 'Save Changes',
        emailTitle: sc.notificationsPanel?.emailTitle,
      },
      security: {
        title: sc.sections?.security || 'Security',
      },
      layout: {
        mobileNavLabel: sc.layout?.mobileNavLabel || 'Sections',
      },
      generalPanel: sc.generalPanel,
    };
  }, [settingsCopy]);

  const loadProviders = useCallback(async () => {
    try {
      setProvidersLoading(true);
      setProviderError('');
      const response = await providersApi.getProviders();
      setProviders(response || []);
    } catch (error) {
      logger.error('Failed to load providers', { error });
      setProviderError(t.settings.mailAccountsPanel.loadError);
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  const handleSyncAll = useCallback(async () => {
    if (!confirm(copy.accounts.syncConfirm)) return;
    try {
      setSyncAllLoading(true);
      const result = await providersApi.syncAll();
      if (result.success) {
        setProviderSuccess(copy.accounts.syncStarted);
        await loadProviders();
      }
    } catch {
      setProviderError(copy.accounts.syncFailed);
    } finally {
      setSyncAllLoading(false);
    }
  }, [copy.accounts, loadProviders]);

  const loadAiProfile = useCallback(async () => {
    try {
      setAiProfileLoading(true);
      const response = await personalizationApi.getProfile();
      if (response.data?.profile) {
        const profile = response.data.profile;
        setJobRole(profile.jobRole || 'IC');
        setCommunicationStyle(profile.communicationStyle || 'CASUAL');
        setResponseLength(profile.responseLength || 'MODERATE');
        setProactivityLevel(profile.proactivityLevel || 'MEDIUM');
      }
    } catch {
      // Profile may not exist yet
    } finally {
      setAiProfileLoading(false);
    }
  }, []);

  const handleSaveAiProfile = useCallback(async () => {
    try {
      setAiSaveLoading(true);
      setAiError('');
      setAiSuccess('');
      await personalizationApi.updateProfile({
        jobRole,
        communicationStyle,
        responseLength,
        proactivityLevel,
      });
      setAiSuccess(copy.ai.savePreferences);
    } catch {
      setAiError(copy.general.saveError);
    } finally {
      setAiSaveLoading(false);
    }
  }, [copy.ai.savePreferences, copy.general.saveError, jobRole, communicationStyle, responseLength, proactivityLevel]);

  const handleClearAiMemory = useCallback(async () => {
    if (!confirm(copy.ai.clearMemory)) return;
    try {
      setAiSaveLoading(true);
      await personalizationApi.clearAllMemories();
      setAiSuccess(copy.ai.clearMemory);
    } catch {
      setAiError(copy.general.saveError);
    } finally {
      setAiSaveLoading(false);
    }
  }, [copy.ai.clearMemory, copy.general.saveError]);

  const handleResetAiLearning = useCallback(async () => {
    if (!confirm(copy.ai.resetLearning)) return;
    try {
      setAiSaveLoading(true);
      await multiAgentApi.resetLearning();
      setAiSuccess(copy.ai.resetLearning);
    } catch {
      setAiError(copy.general.saveError);
    } finally {
      setAiSaveLoading(false);
    }
  }, [copy.ai.resetLearning, copy.general.saveError]);

  // Only load data for the active section to improve performance
  useEffect(() => {
    if (selectedSection === 'accounts') {
      loadProviders();
    }
  }, [selectedSection, loadProviders]);

  useEffect(() => {
    if (selectedSection === 'ai') {
      loadAiProfile();
    }
  }, [selectedSection, loadAiProfile]);

  useEffect(() => {
    if (!router.isReady) return;
    const sectionParam = router.query.section;
    if (typeof sectionParam === 'string' && sections.some((s) => s.id === sectionParam)) {
      setSelectedSection(sectionParam as SettingsSection);
    }
  }, [router.isReady, router.query.section, sections]);

  const handleSectionSelect = useCallback(
    (sectionId: SettingsSection) => {
      setSelectedSection(sectionId);
      if (!router.isReady) return;
      router.replace({ pathname: router.pathname, query: { section: sectionId } }, undefined, { shallow: true });
    },
    [router],
  );

  const handleProviderInitiated = useCallback(() => {
    setProviderSuccess('Redirecting to provider...');
  }, []);

  const handleProviderConnected = useCallback(() => {
    setProviderSuccess('Account connected');
    loadProviders();
  }, [loadProviders]);

  const handleProviderDeleted = useCallback(() => {
    setProviderSuccess('Account disconnected');
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!router.isReady) return;
    const { success, error } = router.query;
    if (success) {
      setSelectedSection('accounts');
      setProviderSuccess('Account connected successfully');
      loadProviders();
      router.replace({ pathname: router.pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
    if (error && typeof error === 'string') {
      setSelectedSection('accounts');
      setProviderError(error);
      router.replace({ pathname: router.pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
  }, [router, loadProviders]);

  const handleSaveSettings = async () => {
    try {
      setSaveLoading(true);
      setGeneralError('');
      setGeneralSuccess('');
      // Save language to database (theme is saved automatically via useThemePersistence)
      await usersApi.updatePreferences({ language });
      // Keep localStorage in sync for offline access
      persistUserSettings({ language, timezone, emailNotifications });
      setGeneralSuccess(copy.general.saveSuccess);
    } catch {
      setGeneralError(copy.general.saveError);
    } finally {
      setSaveLoading(false);
    }
  };

  useEffect(() => {
    const saved = getStoredUserSettings();
    setLanguage(saved.language);
    setTimezone(saved.timezone);
    setEmailNotifications(saved.emailNotifications);
    setHydrated(true);
  }, []);

  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';
  const generalCopy = settingsCopy.generalPanel;
  const aiCopy = settingsCopy.aiPanel;
  const mailAccountsCopy = settingsCopy.mailAccountsPanel;
  const accountCopy = settingsCopy.accountPanel;
  const notificationsCopy = settingsCopy.notificationsPanel;

  if (!hydrated) {
    return (
      <Box
        sx={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          p: 3,
        }}
      >
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'row', bgcolor: 'background.default' }}>
      {/* Sidebar - Desktop only */}
      <Paper
        elevation={0}
        sx={{
          width: 260,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          bgcolor: 'background.paper',
          position: 'sticky',
          top: 64,
          height: 'calc(100vh - 64px)',
          overflowY: 'auto',
        }}
      >
        <Box sx={{ p: 3, pb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {copy.pageTitle}
          </Typography>
        </Box>

        <List sx={{ flex: 1, px: 1.5 }}>
          {sections.map((section) => (
            <ListItemButton
              key={section.id}
              selected={selectedSection === section.id}
              onClick={() => handleSectionSelect(section.id as SettingsSection)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  '&:hover': {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: selectedSection === section.id ? 'primary.main' : 'text.secondary' }}>
                {section.icon}
              </ListItemIcon>
              <ListItemText
                primary={section.label}
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: selectedSection === section.id ? 600 : 400,
                }}
              />
              {selectedSection === section.id && <ChevronRight size={16} />}
            </ListItemButton>
          ))}
        </List>

        {/* User info at bottom */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
              {accountName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                {accountName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {user?.email}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Mobile navigation - Dropdown Select */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            px: 2,
            py: 2,
            position: 'sticky',
            top: 0,
            zIndex: 2,
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flexShrink: 0 }}>
            {copy.pageTitle}
          </Typography>
          <FormControl size="small" sx={{ flex: 1, minWidth: 120 }}>
            <Select
              value={selectedSection}
              onChange={(e) => handleSectionSelect(e.target.value as SettingsSection)}
              displayEmpty
              sx={{
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                },
              }}
            >
              {sections.map((section) => (
                <MenuItem key={section.id} value={section.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {section.icon}
                    {section.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 }, bgcolor: 'background.default' }}>
          <Box sx={{ maxWidth: { xs: '100%', md: 800 }, mx: 'auto' }}>
            {/* General Settings */}
            {selectedSection === 'general' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {generalCopy.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                  {generalCopy.description}
                </Typography>
                {(generalSuccess || generalError) && (
                  <Box sx={{ mb: 2 }}>
                    {generalSuccess && <Alert severity="success" onClose={() => setGeneralSuccess('')}>{generalSuccess}</Alert>}
                    {generalError && <Alert severity="error" onClose={() => setGeneralError('')}>{generalError}</Alert>}
                  </Box>
                )}

                <SectionCard title={generalCopy.appearanceTitle || 'Appearance'}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1.5 }}>
                      {generalCopy.themeLabel || 'Theme'}
                    </Typography>
                    <ToggleButtonGroup
                      value={theme}
                      exclusive
                      onChange={(_, v) => v && setTheme(v)}
                      size="small"
                    >
                      <ToggleButton value="light" sx={{ px: 3 }}>
                        <Sun size={16} style={{ marginRight: 8 }} /> {generalCopy.themeOptions?.light || 'Light'}
                      </ToggleButton>
                      <ToggleButton value="dark" sx={{ px: 3 }}>
                        <Moon size={16} style={{ marginRight: 8 }} /> {generalCopy.themeOptions?.dark || 'Dark'}
                      </ToggleButton>
                      <ToggleButton value="system" sx={{ px: 3 }}>
                        <Monitor size={16} style={{ marginRight: 8 }} /> {generalCopy.themeOptions?.system || 'System'}
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </SectionCard>

                <SectionCard title={generalCopy.languageTitle || 'Language & Region'}>
                  <Stack spacing={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{generalCopy.languageLabel || 'Language'}</InputLabel>
                      <Select value={language} onChange={(e) => setLanguage(e.target.value)} label={generalCopy.languageLabel || 'Language'}>
                        <MenuItem value="en">English</MenuItem>
                        <MenuItem value="it">Italiano</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                      <InputLabel>{generalCopy.timezoneLabel || 'Timezone'}</InputLabel>
                      <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} label={generalCopy.timezoneLabel || 'Timezone'}>
                        <MenuItem value="GMT-08:00">(GMT-08:00) Pacific Time</MenuItem>
                        <MenuItem value="GMT-05:00">(GMT-05:00) Eastern Time</MenuItem>
                        <MenuItem value="GMT+00:00">(GMT+00:00) London</MenuItem>
                        <MenuItem value="GMT+01:00">(GMT+01:00) Rome</MenuItem>
                        <MenuItem value="GMT+09:00">(GMT+09:00) Tokyo</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                </SectionCard>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button variant="contained" onClick={handleSaveSettings} disabled={saveLoading}>
                    {saveLoading ? copy.ai.saving : copy.notifications.save}
                  </Button>
                </Box>
              </Box>
            )}

            {/* Security Settings */}
            {selectedSection === 'security' && (
              <Box>
                <MfaSettings />
              </Box>
            )}

            {/* AI Settings */}
            {selectedSection === 'ai' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {aiCopy.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                  {aiCopy.description || 'Customize how AI assists you with emails, calendar, and more.'}
                </Typography>

                {(aiError || aiSuccess) && (
                  <Box sx={{ mb: 3 }}>
                    {aiError && <Alert severity="error" onClose={() => setAiError('')}>{aiError}</Alert>}
                    {aiSuccess && <Alert severity="success" onClose={() => setAiSuccess('')}>{aiSuccess}</Alert>}
                  </Box>
                )}

                {aiProfileLoading ? (
                  <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <>
                    <SectionCard
                      title={aiCopy.featuresTitle || 'AI Features'}
                      description={aiCopy.featuresDescription || 'Enable or disable AI capabilities'}
                    >
                      <SettingRow
                        icon={<MessageSquare size={18} />}
                        title={aiCopy.smartRepliesTitle || 'Smart Replies'}
                        description={aiCopy.smartRepliesDescription || 'AI-generated response suggestions'}
                      >
                        <Switch checked={smartRepliesEnabled} onChange={(e) => setSmartRepliesEnabled(e.target.checked)} />
                      </SettingRow>
                      <SettingRow
                        icon={<FileText size={18} />}
                        title={aiCopy.summarizationTitle || 'Email Summarization'}
                        description={aiCopy.summarizationDescription || 'Automatic summaries for long emails'}
                      >
                        <Switch checked={summarizationEnabled} onChange={(e) => setSummarizationEnabled(e.target.checked)} />
                      </SettingRow>
                      <SettingRow
                        icon={<Calendar size={18} />}
                        title={aiCopy.schedulingTitle || 'Smart Scheduling'}
                        description={aiCopy.schedulingDescription || 'AI-assisted meeting scheduling'}
                        noBorder
                      >
                        <Switch checked={schedulingEnabled} onChange={(e) => setSchedulingEnabled(e.target.checked)} />
                      </SettingRow>
                    </SectionCard>

                    <SectionCard
                      title={aiCopy.personalizationTitle || 'Personalization'}
                      description={aiCopy.personalizationDescription || 'Customize AI behavior to match your work style'}
                    >
                      <Stack spacing={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>{aiCopy.roleLabel || 'Your Role'}</InputLabel>
                          <Select value={jobRole} onChange={(e) => setJobRole(e.target.value as JobRole)} label={aiCopy.roleLabel || 'Your Role'}>
                            <MenuItem value="EXECUTIVE">Executive</MenuItem>
                            <MenuItem value="MANAGER">Manager</MenuItem>
                            <MenuItem value="IC">Individual Contributor</MenuItem>
                            <MenuItem value="FREELANCER">Freelancer</MenuItem>
                            <MenuItem value="STUDENT">Student</MenuItem>
                            <MenuItem value="SUPPORT">Support</MenuItem>
                            <MenuItem value="SALES">Sales</MenuItem>
                            <MenuItem value="TECHNICAL">Technical</MenuItem>
                          </Select>
                        </FormControl>

                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                            {aiCopy.communicationLabel || 'Communication Style'}
                          </Typography>
                          <ToggleButtonGroup
                            value={communicationStyle}
                            exclusive
                            onChange={(_, v) => v && setCommunicationStyle(v)}
                            fullWidth
                            size="small"
                          >
                            <ToggleButton value="FORMAL">Formal</ToggleButton>
                            <ToggleButton value="CASUAL">Casual</ToggleButton>
                            <ToggleButton value="TECHNICAL">Technical</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                            {aiCopy.responseLengthLabel || 'Response Length'}
                          </Typography>
                          <ToggleButtonGroup
                            value={responseLength}
                            exclusive
                            onChange={(_, v) => v && setResponseLength(v)}
                            fullWidth
                            size="small"
                          >
                            <ToggleButton value="CONCISE">Concise</ToggleButton>
                            <ToggleButton value="MODERATE">Moderate</ToggleButton>
                            <ToggleButton value="DETAILED">Detailed</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                            {aiCopy.proactivityLabel || 'Proactivity'}
                          </Typography>
                          <ToggleButtonGroup
                            value={proactivityLevel}
                            exclusive
                            onChange={(_, v) => v && setProactivityLevel(v)}
                            fullWidth
                            size="small"
                          >
                            <ToggleButton value="LOW">Low</ToggleButton>
                            <ToggleButton value="MEDIUM">Medium</ToggleButton>
                            <ToggleButton value="HIGH">High</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {copy.ai.autoApproveLabel}
                            </Typography>
                            <Chip label={`${autoApproveThreshold}%`} size="small" />
                          </Box>
                          <Slider
                            value={autoApproveThreshold}
                            onChange={(_, v) => setAutoApproveThreshold(v as number)}
                            min={50}
                            max={100}
                            step={5}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {copy.ai.autoApproveHint}
                          </Typography>
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 3 }} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Button variant="contained" onClick={handleSaveAiProfile} disabled={aiSaveLoading}>
                          {aiSaveLoading ? copy.ai.saving : copy.ai.savePreferences}
                        </Button>
                        <Button variant="text" endIcon={<ExternalLink size={14} />} onClick={() => router.push('/dashboard/ai')}>
                          {copy.ai.openAssistant}
                        </Button>
                      </Box>
                    </SectionCard>

                    <SectionCard
                      title={copy.ai.dataManagementTitle}
                      description={copy.ai.dataManagementDescription}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Button
                          variant="outlined"
                          color="warning"
                          startIcon={<Trash2 size={16} />}
                          onClick={handleClearAiMemory}
                          disabled={aiSaveLoading}
                        >
                          {copy.ai.clearMemory}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<RotateCcw size={16} />}
                          onClick={handleResetAiLearning}
                          disabled={aiSaveLoading}
                        >
                          {copy.ai.resetLearning}
                        </Button>
                      </Stack>
                    </SectionCard>
                  </>
                )}
              </Box>
            )}

            {/* Mail Accounts */}
            {selectedSection === 'accounts' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {mailAccountsCopy.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                  {copy.accounts.description}
                </Typography>

                {(providerError || providerSuccess) && (
                  <Box sx={{ mb: 3 }}>
                    {providerError && <Alert severity="error" onClose={() => setProviderError('')}>{providerError}</Alert>}
                    {providerSuccess && <Alert severity="success" onClose={() => setProviderSuccess('')}>{providerSuccess}</Alert>}
                  </Box>
                )}

                <SectionCard
                  title={copy.accounts.connectedTitle}
                  action={
                    <Stack direction="row" spacing={1}>
                      <Tooltip title={copy.accounts.refreshTooltip}>
                        <IconButton size="small" onClick={loadProviders} disabled={providersLoading}>
                          <RefreshCw size={16} className={providersLoading ? 'animate-spin' : ''} />
                        </IconButton>
                      </Tooltip>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleSyncAll}
                        disabled={syncAllLoading || providers.length === 0}
                      >
                        {syncAllLoading ? copy.accounts.syncing : copy.accounts.syncAll}
                      </Button>
                    </Stack>
                  }
                >
                  {providersLoading ? (
                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <ProvidersList providers={providers} onDelete={handleProviderDeleted} />
                  )}
                </SectionCard>

                <SectionCard title={copy.accounts.addTitle} description={copy.accounts.addDescription}>
                  <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
                    <Box sx={{ flex: 1 }}>
                      <GoogleProviderCard onSuccess={handleProviderInitiated} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <MicrosoftProviderCard onSuccess={handleProviderInitiated} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <GenericProviderCard onSuccess={handleProviderConnected} />
                    </Box>
                  </Stack>
                </SectionCard>
              </Box>
            )}

            {/* Account Settings */}
            {selectedSection === 'account' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {accountCopy.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                  {copy.account.description}
                </Typography>

                <SectionCard title={accountCopy.profileTitle || 'Profile'}>
                  <Stack spacing={2}>
                    <TextField label={copy.account.fullName} value={accountName} fullWidth size="small" disabled />
                    <TextField label={copy.account.email} value={user?.email || ''} fullWidth size="small" disabled />
                    <TextField label={copy.account.role} value={user?.role || ''} fullWidth size="small" disabled />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                    {copy.account.contactAdmin}
                  </Typography>
                </SectionCard>

                <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'error.main', mb: 1 }}>
                      {copy.account.dangerZoneTitle}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {copy.account.dangerZoneDescription}
                    </Typography>
                    <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />}>
                      {copy.account.deleteAccount}
                    </Button>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Notifications */}
            {selectedSection === 'notifications' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {notificationsCopy.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                  {copy.notifications.description}
                </Typography>

                <SectionCard title={notificationsCopy.emailTitle || copy.notifications.newEmailsTitle}>
                  <SettingRow
                    icon={<Mail size={18} />}
                    title={copy.notifications.newEmailsTitle}
                    description={copy.notifications.newEmailsDesc}
                  >
                    <Switch defaultChecked />
                  </SettingRow>
                  <SettingRow
                    icon={<Calendar size={18} />}
                    title={copy.notifications.calendarTitle}
                    description={copy.notifications.calendarDesc}
                  >
                    <Switch defaultChecked />
                  </SettingRow>
                  <SettingRow
                    icon={<Bell size={18} />}
                    title={copy.notifications.aiActionsTitle}
                    description={copy.notifications.aiActionsDesc}
                    noBorder
                  >
                    <Switch defaultChecked />
                  </SettingRow>
                </SectionCard>

                <Button variant="contained">{copy.notifications.save}</Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
