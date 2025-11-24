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
  FormControlLabel,
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
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import { Settings as SettingsIcon, User, Bell, Mail, Moon, Globe, Clock, Sparkles, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/router';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';
import { GoogleProviderCard } from '@/components/providers/GoogleProviderCard';
import { MicrosoftProviderCard } from '@/components/providers/MicrosoftProviderCard';
import { GenericProviderCard } from '@/components/providers/GenericProviderCard';
import { ProvidersList } from '@/components/providers/ProvidersList';
import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
  persistUserSettings,
  resetUserSettings,
  type ThemePreference,
} from '@/lib/utils/user-settings';

type SettingsSection =
  | 'general'
  | 'ai'
  | 'accounts'
  | 'account'
  | 'notifications';

export function Settings() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations();
  const settingsCopy = useMemo(() => t.dashboard.settings, [t]);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('general');
  const [theme, setTheme] = useState<ThemePreference>(DEFAULT_USER_SETTINGS.theme);
  const [language, setLanguage] = useState(DEFAULT_USER_SETTINGS.language);
  const [timezone, setTimezone] = useState(DEFAULT_USER_SETTINGS.timezone);
  const [emailNotifications, setEmailNotifications] = useState(
    DEFAULT_USER_SETTINGS.emailNotifications,
  );
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerSuccess, setProviderSuccess] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);

  const sections = useMemo(
    () => [
      { id: 'general', label: settingsCopy.sections.general, icon: <SettingsIcon size={20} /> },
      { id: 'ai', label: settingsCopy.sections.ai, icon: <Sparkles size={20} /> },
      { id: 'accounts', label: settingsCopy.sections.accounts, icon: <Mail size={20} /> },
      { id: 'account', label: settingsCopy.sections.account, icon: <User size={20} /> },
      { id: 'notifications', label: settingsCopy.sections.notifications, icon: <Bell size={20} /> },
    ],
    [settingsCopy.sections],
  );

  const loadProviders = useCallback(async () => {
    try {
      setProvidersLoading(true);
      setProviderError('');
      const response = await providersApi.getProviders();
      setProviders(response || []);
    } catch (error) {
      console.error('Failed to load providers:', error);
      setProviderError(t.dashboard.settings.mailAccountsPanel.loadError);
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  const handleSyncAll = useCallback(async () => {
    if (!confirm('⚠️ WARNING: This will DELETE ALL emails from the database and re-sync from providers. Continue?')) {
      return;
    }

    try {
      setSyncAllLoading(true);
      setProviderError('');
      setProviderSuccess('');

      const result = await providersApi.syncAll();

      if (result.success) {
        setProviderSuccess(
          `✅ ${result.message}. Sync jobs are now running in the background.`
        );
        // Reload providers to update last sync time
        await loadProviders();
      } else {
        setProviderError(result.message || 'Failed to sync all providers');
      }
    } catch (error) {
      console.error('Failed to sync all:', error);
      setProviderError('Failed to start sync-all operation. Please try again.');
    } finally {
      setSyncAllLoading(false);
    }
  }, [loadProviders]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const sectionParam = router.query.section;
    if (
      typeof sectionParam === 'string' &&
      sections.some((section) => section.id === sectionParam)
    ) {
      setSelectedSection(sectionParam as SettingsSection);
    }
  }, [router.isReady, router.query.section, sections]);

  const handleSectionSelect = useCallback(
    (sectionId: SettingsSection) => {
      setSelectedSection(sectionId);
      if (!router.isReady) {
        return;
      }
      const currentSection =
        typeof router.query.section === 'string' ? router.query.section : undefined;
      if (currentSection === sectionId) {
        return;
      }
      router.replace(
        { pathname: router.pathname, query: { section: sectionId } },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const handleProviderInitiated = useCallback(() => {
    setProviderError('');
    setProviderSuccess(t.dashboard.settings.mailAccountsPanel.connectRedirect);
  }, [t]);

  const handleProviderConnected = useCallback(() => {
    setProviderError('');
    setProviderSuccess(t.dashboard.settings.mailAccountsPanel.connectSuccess);
    loadProviders();
  }, [loadProviders, t]);

  const handleProviderDeleted = useCallback(() => {
    setProviderError('');
    setProviderSuccess(t.dashboard.settings.mailAccountsPanel.disconnectSuccess);
    loadProviders();
  }, [loadProviders, t]);

  // Handle success/error messages from OAuth callback page
  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const { success, error } = router.query;

    if (success) {
      setSelectedSection('accounts');
      setProviderSuccess(t.dashboard.settings.mailAccountsPanel.connectSuccess);
      setProviderError('');
      loadProviders();

      // Clean up query params
      router.replace(
        { pathname: router.pathname, query: { section: 'accounts' } },
        undefined,
        { shallow: true },
      );
    }

    if (error && typeof error === 'string') {
      setSelectedSection('accounts');
      setProviderError(error);
      setProviderSuccess('');

      // Clean up query params
      router.replace(
        { pathname: router.pathname, query: { section: 'accounts' } },
        undefined,
        { shallow: true },
      );
    }
  }, [router, loadProviders, t]);

  const generalCopy = settingsCopy.generalPanel;
  const aiCopy = settingsCopy.aiPanel;
  const mailAccountsCopy = settingsCopy.mailAccountsPanel;
  const accountCopy = settingsCopy.accountPanel;
  const notificationsCopy = settingsCopy.notificationsPanel;

  const accountName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';

  const handleSaveSettings = async () => {
    try {
      setSaveLoading(true);
      // TODO: replace local persistence with backend once the API is ready
      persistUserSettings({
        theme,
        language,
        timezone,
        emailNotifications,
      });

      alert(t.dashboard.settings.mailAccountsPanel.saveSuccess);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert(t.dashboard.settings.mailAccountsPanel.saveError);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleResetSettings = () => {
    const defaults = resetUserSettings();
    setTheme(defaults.theme);
    setLanguage(defaults.language);
    setTimezone(defaults.timezone);
    setEmailNotifications(defaults.emailNotifications);
  };

  // Load saved settings on mount
  useEffect(() => {
    const savedSettings = getStoredUserSettings();
    setTheme(savedSettings.theme);
    setLanguage(savedSettings.language);
    setTimezone(savedSettings.timezone);
    setEmailNotifications(savedSettings.emailNotifications);
  }, []);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Paper
        sx={{
          width: 280,
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {settingsCopy.sidebarTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {settingsCopy.sidebarSubtitle}
          </Typography>
        </Box>

        <Divider />

        <List sx={{ flex: 1, p: 1 }}>
          {sections.map((section) => (
            <ListItemButton
              key={section.id}
              selected={selectedSection === section.id}
              onClick={() => handleSectionSelect(section.id as SettingsSection)}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{section.icon}</ListItemIcon>
              <ListItemText
                primary={section.label}
                primaryTypographyProps={{ fontSize: '0.875rem' }}
              />
            </ListItemButton>
          ))}
        </List>

        <Divider />

        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Version 1.0.0
          </Typography>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
        {/* Mobile Navigation Tabs */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
          <Tabs
            value={sections.findIndex((s) => s.id === selectedSection)}
            onChange={(_, newValue) =>
              handleSectionSelect(sections[newValue].id as SettingsSection)
            }
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            {sections.map((section) => (
              <Tab
                key={section.id}
                label={section.label}
                icon={section.icon}
                iconPosition="start"
                sx={{ minHeight: 48, textTransform: 'none' }}
              />
            ))}
          </Tabs>
        </Box>

        {/* General Settings */}
        {selectedSection === 'general' && (
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {generalCopy.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              {generalCopy.description}
            </Typography>

            {/* Appearance */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {generalCopy.appearanceTitle}
                </Typography>

                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Moon size={18} />
                    <Typography variant="subtitle2">{generalCopy.themeLabel}</Typography>
                  </Box>
                  <ToggleButtonGroup
                    value={theme}
                    exclusive
                    onChange={(_, newTheme) => newTheme && setTheme(newTheme)}
                    fullWidth
                  >
                    <ToggleButton value="light">{generalCopy.themeOptions.light}</ToggleButton>
                    <ToggleButton value="dark">{generalCopy.themeOptions.dark}</ToggleButton>
                    <ToggleButton value="system">{generalCopy.themeOptions.system}</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {generalCopy.themeHint}
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            {/* Language & Region */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {generalCopy.languageTitle}
                </Typography>

                <Box sx={{ mb: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel>{generalCopy.languageLabel}</InputLabel>
                    <Select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      label={generalCopy.languageLabel}
                      startAdornment={
                        <Box sx={{ mr: 1, display: 'flex' }}>
                          <Globe size={18} />
                        </Box>
                      }
                    >
                      <MenuItem value="en-US">English (US)</MenuItem>
                      <MenuItem value="it-IT">Italiano</MenuItem>
                      <MenuItem value="es-ES">Español</MenuItem>
                      <MenuItem value="fr-FR">Français</MenuItem>
                      <MenuItem value="de-DE">Deutsch</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {generalCopy.languageHint}
                  </Typography>
                </Box>

                <Box>
                  <FormControl fullWidth>
                    <InputLabel>{generalCopy.timezoneLabel}</InputLabel>
                    <Select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      label={generalCopy.timezoneLabel}
                      startAdornment={
                        <Box sx={{ mr: 1, display: 'flex' }}>
                          <Clock size={18} />
                        </Box>
                      }
                    >
                      <MenuItem value="GMT-08:00">(GMT-08:00) Pacific Time</MenuItem>
                      <MenuItem value="GMT-05:00">(GMT-05:00) Eastern Time</MenuItem>
                      <MenuItem value="GMT+00:00">(GMT+00:00) London</MenuItem>
                      <MenuItem value="GMT+01:00">(GMT+01:00) Rome</MenuItem>
                      <MenuItem value="GMT+09:00">(GMT+09:00) Tokyo</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {generalCopy.notificationsTitle}
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={emailNotifications}
                      onChange={(e) => setEmailNotifications(e.target.checked)}
                    />
                  }
                  label={generalCopy.notificationsTitle}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                  {generalCopy.notificationsDescription}
                </Typography>

                <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                  <Button variant="outlined" onClick={handleResetSettings} disabled={saveLoading}>
                    {generalCopy.reset}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSaveSettings}
                    disabled={saveLoading}
                  >
                    {saveLoading ? t.common.saving : generalCopy.save}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Mail Accounts */}
        {selectedSection === 'accounts' && (
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {mailAccountsCopy.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              {mailAccountsCopy.description}
            </Typography>

            <Stack spacing={3}>
              {(providerError || providerSuccess) && (
                <Stack spacing={2}>
                  {providerError && (
                    <Alert severity="error" onClose={() => setProviderError('')}>
                      {providerError}
                    </Alert>
                  )}
                  {providerSuccess && (
                    <Alert severity="success" onClose={() => setProviderSuccess('')}>
                      {providerSuccess}
                    </Alert>
                  )}
                </Stack>
              )}

              <Card>
                <CardContent>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={2}
                    sx={{ mb: 3 }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {mailAccountsCopy.connectedProviders}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {mailAccountsCopy.connectedProvidersSubtitle}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshCw size={16} />}
                        onClick={loadProviders}
                        disabled={providersLoading || syncAllLoading}
                      >
                        {providersLoading ? t.common.refreshing : t.common.refresh}
                      </Button>
                      <Button
                        variant="contained"
                        color="warning"
                        size="small"
                        startIcon={<RefreshCw size={16} />}
                        onClick={handleSyncAll}
                        disabled={providersLoading || syncAllLoading || providers.length === 0}
                      >
                        {syncAllLoading ? t.common.syncing : t.common.syncAll}
                      </Button>
                    </Stack>
                  </Stack>

                  {providersLoading ? (
                    <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
                      <CircularProgress size={28} />
                    </Box>
                  ) : (
                    <ProvidersList providers={providers} onDelete={handleProviderDeleted} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {mailAccountsCopy.add}
                  </Typography>
                  <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems="stretch">
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
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {mailAccountsCopy.helpTitle}
                  </Typography>
                  <Box
                    component="div"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      fontSize: '0.9rem',
                      color: 'text.primary',
                    }}
                  >
                    <p>
                      <strong>Google:</strong> Click &quot;Connect Google Account&quot; and sign in with
                      your Google credentials. Grant access to Gmail, Calendar, and Contacts.
                    </p>
                    <p>
                      <strong>Microsoft:</strong> Use &quot;Connect Microsoft Account&quot; and sign in
                      with your Outlook/Microsoft 365 credentials.
                    </p>
                    <p>
                      <strong>Generic IMAP:</strong> Provide IMAP/SMTP server details from your provider.
                      CalDAV enables calendar sync.
                    </p>
                    <Box
                      sx={{
                        mt: 1,
                        borderRadius: 3,
                        border: 1,
                        borderColor: 'divider',
                        bgcolor: 'action.hover',
                        p: 2,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Common IMAP/SMTP Settings:
                      </Typography>
                      <Box component="ul" sx={{ pl: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <li>
                          <strong>Gmail:</strong> imap.gmail.com:993, smtp.gmail.com:587 (requires app password)
                        </li>
                        <li>
                          <strong>Outlook.com:</strong> outlook.office365.com:993, smtp.office365.com:587
                        </li>
                        <li>
                          <strong>Yahoo:</strong> imap.mail.yahoo.com:993, smtp.mail.yahoo.com:587
                        </li>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Stack>
          </Box>
        )}

        {/* AI Settings */}
        {selectedSection === 'ai' && (
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {aiCopy.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              {aiCopy.description}
            </Typography>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {aiCopy.title}
                </Typography>

                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label={aiCopy.smartReplies}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
                  {aiCopy.smartRepliesDescription}
                </Typography>

                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label={aiCopy.summarization}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
                  {aiCopy.summarizationDescription}
                </Typography>

                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label={aiCopy.scheduling}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                  {aiCopy.schedulingDescription}
                </Typography>

                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                  <Button variant="contained">{aiCopy.save}</Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Account Settings */}
        {selectedSection === 'account' && (
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {accountCopy.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              {accountCopy.description}
            </Typography>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {accountCopy.profileInformation}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField label={accountCopy.fullName} value={accountName} fullWidth disabled />
                  <TextField label={accountCopy.email} value={user?.email ?? ''} fullWidth disabled />
                  <TextField label={accountCopy.role} value={user?.role ?? ''} fullWidth disabled />
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  {accountCopy.readOnlyNotice}
                </Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'error.main' }}>
                  {accountCopy.dangerTitle}
                </Typography>

                <Button variant="outlined" color="error">
                  {accountCopy.deleteCta}
                </Button>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Notifications */}
        {selectedSection === 'notifications' && (
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              {notificationsCopy.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              {notificationsCopy.description}
            </Typography>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  {notificationsCopy.emailToggle}
                </Typography>

                <FormControlLabel control={<Switch defaultChecked />} label="New Emails" />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
                  Get notified when you receive new emails
                </Typography>

                <FormControlLabel control={<Switch defaultChecked />} label="Calendar Reminders" />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mb: 2 }}>
                  Reminders for upcoming events
                </Typography>

                <FormControlLabel control={<Switch />} label="Task Deadlines" />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                  Alerts when tasks are due
                </Typography>

                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                  <Button variant="contained">Save Changes</Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Box>
  );
}
